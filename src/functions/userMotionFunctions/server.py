from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import serial
import serial.tools.list_ports
import threading
import time
import json
from collections import deque
import numpy as np

# =========================
# CONFIG
# =========================
SERIAL_BAUD = 115200
FS = 250
WINDOW_SECONDS = 1.0
WINDOW_SAMPLES = int(FS * WINDOW_SECONDS)

# =========================
# APP
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# GLOBAL STATE
# =========================
serial_port_name = None
serial_conn = None
serial_thread_started = False
serial_lock = threading.Lock()

latest_c4 = 0.0
latest_cz = 0.0
latest_command = 0

buf_ch1 = deque(maxlen=WINDOW_SAMPLES)
buf_ch2 = deque(maxlen=WINDOW_SAMPLES)

# =========================
# PICO DETECTION
# =========================
def find_pico():
    ports = serial.tools.list_ports.comports()

    for port in ports:
        desc = (port.description or "").lower()
        hwid = (port.hwid or "").lower()
        manufacturer = (port.manufacturer or "").lower() if port.manufacturer else ""

        print("Checking:", port.device, port.description, port.hwid, port.manufacturer)

        if (
            "pico" in desc
            or "rp2040" in desc
            or "raspberry pi" in manufacturer
            or "2e8a" in hwid
        ):
            return port.device

    return None

# =========================
# PREPROCESS + COMMAND
# =========================
def preprocess_window(ch1, ch2):
    x = np.stack([ch1, ch2], axis=0).astype(np.float32)
    x = x - np.mean(x, axis=1, keepdims=True)
    std = np.std(x, axis=1, keepdims=True) + 1e-6
    x = x / std
    return x

def fake_predict(x):
    # placeholder until you plug in EEGNet
    energy = np.mean(np.abs(x))

    if energy < 0.35:
        return 0   # Rest
    elif energy < 0.75:
        return 1   # elbowUp
    else:
        return 2   # forwardUpShoulder

# =========================
# SERIAL WORKER
# =========================
def serial_worker():
    global serial_conn, serial_port_name
    global latest_c4, latest_cz, latest_command

    while True:
        try:
            if serial_conn is None or not serial_conn.is_open:
                serial_port_name = find_pico()
                if serial_port_name is None:
                    print("Pico not found. Retrying...")
                    time.sleep(2)
                    continue

                print("Opening serial:", serial_port_name)
                serial_conn = serial.Serial(serial_port_name, SERIAL_BAUD, timeout=1)
                time.sleep(1)

            line = serial_conn.readline().decode(errors="ignore").strip()
            if not line:
                continue

            parts = line.split(",")
            if len(parts) != 2:
                continue

            try:
                ch1 = float(parts[0])
                ch2 = float(parts[1])
            except ValueError:
                continue

            latest_c4 = ch1
            latest_cz = ch2

            buf_ch1.append(ch1)
            buf_ch2.append(ch2)

            if len(buf_ch1) == WINDOW_SAMPLES and len(buf_ch2) == WINDOW_SAMPLES:
                x = preprocess_window(np.array(buf_ch1), np.array(buf_ch2))
                latest_command = fake_predict(x)

        except Exception as e:
            print("Serial worker error:", e)
            try:
                if serial_conn:
                    serial_conn.close()
            except Exception:
                pass
            serial_conn = None
            serial_port_name = None
            time.sleep(2)

def ensure_serial_thread():
    global serial_thread_started
    if not serial_thread_started:
        t = threading.Thread(target=serial_worker, daemon=True)
        t.start()
        serial_thread_started = True

# =========================
# ROUTES
# =========================
@app.on_event("startup")
def startup_event():
    ensure_serial_thread()

@app.get("/connect-pico")
def connect_pico():
    port = find_pico()
    if port:
        return {"connected": True, "port": port}
    return {"connected": False, "port": None}

@app.websocket("/ws/eeg")
async def ws_eeg(ws: WebSocket):
    await ws.accept()
    ensure_serial_thread()

    try:
        while True:
            await ws.send_text(json.dumps({
                "port": serial_port_name,
                "c4": latest_c4,
                "cz": latest_cz
            }))
            await ws.receive_text() if False else None
            await __import__("asyncio").sleep(0.02)
    except WebSocketDisconnect:
        print("EEG socket disconnected")
    except Exception as e:
        print("EEG websocket error:", e)

@app.websocket("/ws/command")
async def ws_command(ws: WebSocket):
    await ws.accept()
    ensure_serial_thread()

    try:
        while True:
            await ws.send_text(json.dumps({
                "command": latest_command
            }))
            await ws.receive_text() if False else None
            await __import__("asyncio").sleep(0.1)
    except WebSocketDisconnect:
        print("Command socket disconnected")
    except Exception as e:
        print("Command websocket error:", e)

# =========================
# MAIN
# =========================
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)