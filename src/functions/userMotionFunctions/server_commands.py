from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import serial
import serial.tools.list_ports
import asyncio
import json
import threading
from collections import deque
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERIAL_BAUD = 115200
FS = 250
WINDOW_SECONDS = 1.0
WINDOW_SAMPLES = int(FS * WINDOW_SECONDS)

buf_ch1 = deque(maxlen=WINDOW_SAMPLES)
buf_ch2 = deque(maxlen=WINDOW_SAMPLES)

latest_command = 0

def find_pico():
    ports = serial.tools.list_ports.comports()

    for port in ports:
        desc = (port.description or "").lower()
        hwid = (port.hwid or "").lower()
        manufacturer = (port.manufacturer or "").lower() if port.manufacturer else ""

        if (
            "pico" in desc
            or "rp2040" in desc
            or "raspberry pi" in manufacturer
            or "2e8a" in hwid
        ):
            return port.device

    return None

def preprocess_window(ch1, ch2):
    x = np.stack([ch1, ch2], axis=0).astype(np.float32)
    x = x - np.mean(x, axis=1, keepdims=True)
    std = np.std(x, axis=1, keepdims=True) + 1e-6
    x = x / std
    return x

def fake_predict(x):
    energy = np.mean(np.abs(x))

    if energy < 0.35:
        return 0   # Rest
    elif energy < 0.75:
        return 1   # elbowUp
    else:
        return 2   # forwardUpShoulder

def serial_worker():
    global latest_command

    port = find_pico()
    if port is None:
        print("Pico not found for command server")
        return

    print("Opening serial for commands:", port)
    ser = serial.Serial(port, SERIAL_BAUD, timeout=1)

    while True:
        try:
            line = ser.readline().decode(errors="ignore").strip()
            if not line:
                continue

            parts = line.split(",")
            if len(parts) != 2:
                continue

            ch1 = float(parts[0])
            ch2 = float(parts[1])

            buf_ch1.append(ch1)
            buf_ch2.append(ch2)

            if len(buf_ch1) == WINDOW_SAMPLES and len(buf_ch2) == WINDOW_SAMPLES:
                x = preprocess_window(np.array(buf_ch1), np.array(buf_ch2))
                latest_command = fake_predict(x)

        except Exception as e:
            print("Command serial error:", e)

@app.websocket("/ws/command")
async def ws_command(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_text(json.dumps({"command": latest_command}))
            await asyncio.sleep(0.1)
    except Exception as e:
        print("Command socket closed:", e)

if __name__ == "__main__":
    t = threading.Thread(target=serial_worker, daemon=True)
    t.start()

    uvicorn.run(app, host="127.0.0.1", port=8002)