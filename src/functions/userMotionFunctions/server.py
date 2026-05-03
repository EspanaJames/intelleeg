import os
import time
import json
import math
import asyncio
import threading
from collections import deque
from datetime import datetime

import serial
import serial.tools.list_ports
import numpy as np
import pandas as pd

from scipy.signal import butter, sosfiltfilt
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# CONFIG
# ============================================================

BAUD_RATE = 115200
SAMPLE_RATE = 100          # Your Pico should send around 100 samples/sec
WINDOW_SECONDS = 2.0
WINDOW_SIZE = int(SAMPLE_RATE * WINDOW_SECONDS)

CHANNELS = ["Cz", "C4"]

CLASSES = [
    "rest",
    "hand_clench",
    "hand_unclench",
    "arm_raised",
    "arm_unraised",
    "elbow_raised",
    "elbow_unraised"
]

NUM_CLASSES = len(CLASSES)
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}
ID_TO_CLASS = {i: name for name, i in CLASS_TO_ID.items()}

DATA_DIR = r"C:\Users\James\EEG_TRAINING_DATA"
MODEL_DIR = r"C:\Users\James\EEG_TRAINING_MODELS"
CSV_PATH = os.path.join(DATA_DIR, "user_training_data.csv")
MODEL_PATH = os.path.join(MODEL_DIR, "eegnet_user_model.pt")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)


# ============================================================
# GLOBAL STATE
# ============================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

serial_port = None
serial_thread = None
serial_running = False

latest_sample = {
    "cz": 0.0,
    "c4": 0.0,
    "timestamp": time.time()
}

buffer_cz = deque(maxlen=WINDOW_SIZE)
buffer_c4 = deque(maxlen=WINDOW_SIZE)

recording = False
recording_label = "rest"
recording_rows = []

model = None
model_ready = False

connected_clients = set()


# ============================================================
# UTILITIES
# ============================================================

def find_pico_port():
    ports = serial.tools.list_ports.comports()

    for port in ports:
        desc = f"{port.description} {port.manufacturer}".lower()
        if "pico" in desc or "usb" in desc or "serial" in desc:
            return port.device

    return None


def parse_eeg_line(line: str):
    line = line.strip()
    if not line:
        return None

    line = line.replace(",", " ")
    parts = line.split()

    if len(parts) < 2:
        return None

    try:
        cz = float(parts[0])
        c4 = float(parts[1])
        return cz, c4
    except ValueError:
        return None


def bandpass_filter(data, fs=SAMPLE_RATE, low=8, high=30):
    data = np.asarray(data, dtype=np.float32)

    if len(data) < 30:
        return data

    sos = butter(4, [low, high], btype="bandpass", fs=fs, output="sos")
    return sosfiltfilt(sos, data)


def preprocess_window(cz_data, c4_data):
    cz = bandpass_filter(cz_data)
    c4 = bandpass_filter(c4_data)

    x = np.stack([cz, c4], axis=0)

    mean = x.mean(axis=1, keepdims=True)
    std = x.std(axis=1, keepdims=True) + 1e-6
    x = (x - mean) / std

    return x.astype(np.float32)


def get_current_window():
    if len(buffer_cz) < WINDOW_SIZE or len(buffer_c4) < WINDOW_SIZE:
        return None

    cz = np.array(buffer_cz, dtype=np.float32)
    c4 = np.array(buffer_c4, dtype=np.float32)

    return preprocess_window(cz, c4)


def movement_from_label(label):
    if label == "hand_clench":
        return {
            "hand": "clench",
            "arm": "default",
            "elbow": "default"
        }

    if label == "hand_unclench":
        return {
            "hand": "unclench",
            "arm": "default",
            "elbow": "default"
        }

    if label == "arm_raised":
        return {
            "hand": "default",
            "arm": "raised",
            "elbow": "default"
        }

    if label == "arm_unraised":
        return {
            "hand": "default",
            "arm": "unraised",
            "elbow": "default"
        }

    if label == "elbow_raised":
        return {
            "hand": "default",
            "arm": "default",
            "elbow": "raised"
        }

    if label == "elbow_unraised":
        return {
            "hand": "default",
            "arm": "default",
            "elbow": "unraised"
        }

    return {
        "hand": "default",
        "arm": "default",
        "elbow": "default"
    }


async def broadcast(payload):
    dead_clients = []

    for ws in connected_clients:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead_clients.append(ws)

    for ws in dead_clients:
        connected_clients.discard(ws)


# ============================================================
# EEGNET MODEL
# Input shape: batch, 1, channels, samples
# ============================================================

class EEGNet(nn.Module):
    def __init__(self, num_classes=NUM_CLASSES, channels=2, samples=WINDOW_SIZE):
        super().__init__()

        self.firstconv = nn.Sequential(
            nn.Conv2d(1, 8, kernel_size=(1, 32), padding=(0, 16), bias=False),
            nn.BatchNorm2d(8)
        )

        self.depthwise = nn.Sequential(
            nn.Conv2d(
                8,
                16,
                kernel_size=(channels, 1),
                groups=8,
                bias=False
            ),
            nn.BatchNorm2d(16),
            nn.ELU(),
            nn.AvgPool2d(kernel_size=(1, 4)),
            nn.Dropout(0.35)
        )

        self.separable = nn.Sequential(
            nn.Conv2d(16, 16, kernel_size=(1, 16), padding=(0, 8), bias=False),
            nn.BatchNorm2d(16),
            nn.ELU(),
            nn.AvgPool2d(kernel_size=(1, 8)),
            nn.Dropout(0.35)
        )

        with torch.no_grad():
            dummy = torch.zeros(1, 1, channels, samples)
            out = self.separable(self.depthwise(self.firstconv(dummy)))
            flat_features = out.view(1, -1).shape[1]

        self.classifier = nn.Linear(flat_features, num_classes)

    def forward(self, x):
        x = self.firstconv(x)
        x = self.depthwise(x)
        x = self.separable(x)
        x = x.flatten(start_dim=1)
        return self.classifier(x)


def load_model_if_exists():
    global model, model_ready

    model = EEGNet()

    if os.path.exists(MODEL_PATH):
        model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
        model.eval()
        model_ready = True
        print("Loaded trained EEGNet model.")
    else:
        model_ready = False
        print("No trained model yet.")


load_model_if_exists()


# ============================================================
# SERIAL READER
# ============================================================
def serial_reader_loop(port_name):
    global serial_port, serial_running, latest_sample
    global recording_rows

    try:
        serial_port = serial.Serial(port_name, BAUD_RATE, timeout=1)
        time.sleep(2)
        print(f"Connected to Pico on {port_name}")
    except Exception as e:
        print(f"Serial connection failed: {e}")
        serial_running = False
        return

    while serial_running:
        try:
            raw = serial_port.readline()

            if not raw:
                print("⚠️ Pico disconnected (no data)")
                serial_running = False
                break

            try:
                raw = raw.decode(errors="ignore")
            except:
                continue

            parsed = parse_eeg_line(raw)

            if parsed is None:
                continue
            cz, c4 = parsed
            now = time.time()

            latest_sample = {
                "cz": cz,
                "c4": c4,
                "timestamp": now
            }

            buffer_cz.append(cz)
            buffer_c4.append(c4)

            if recording:
                recording_rows.append({
                    "timestamp": now,
                    "cz": cz,
                    "c4": c4,
                    "label": recording_label
                })

        except Exception as e:
            print(f"Serial read error: {e}")
            time.sleep(0.1)

    try:
        if serial_port:
            serial_port.close()
    except Exception:
        pass

    print("Serial stopped.")


# ============================================================
# TRAINING
# ============================================================

def make_windows_from_csv(csv_path):
    df = pd.read_csv(csv_path)

    X = []
    y = []

    for label in CLASSES:
        class_df = df[df["label"] == label].copy()

        if len(class_df) < WINDOW_SIZE:
            continue

        cz_values = class_df["cz"].values.astype(np.float32)
        c4_values = class_df["c4"].values.astype(np.float32)

        step = WINDOW_SIZE // 2

        for start in range(0, len(class_df) - WINDOW_SIZE, step):
            end = start + WINDOW_SIZE

            cz_window = cz_values[start:end]
            c4_window = c4_values[start:end]

            window = preprocess_window(cz_window, c4_window)
            X.append(window)
            y.append(CLASS_TO_ID[label])

    if len(X) == 0:
        return None, None

    X = np.stack(X, axis=0)
    y = np.array(y, dtype=np.int64)

    return X, y


def train_user_model(epochs=40, batch_size=16, learning_rate=0.001):
    global model, model_ready

    if not os.path.exists(CSV_PATH):
        return {
            "ok": False,
            "message": "No training CSV found yet."
        }

    X, y = make_windows_from_csv(CSV_PATH)

    if X is None:
        return {
            "ok": False,
            "message": "Not enough data. Record at least 30 seconds per class first."
        }

    unique_classes = sorted(list(set(y.tolist())))

    if len(unique_classes) < 2:
        return {
            "ok": False,
            "message": "Need at least 2 different classes to train."
        }

    X = X[:, np.newaxis, :, :]

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.2,
            random_state=42
        )

    X_train = torch.tensor(X_train, dtype=torch.float32)
    y_train = torch.tensor(y_train, dtype=torch.long)

    X_test_t = torch.tensor(X_test, dtype=torch.float32)

    train_loader = DataLoader(
        TensorDataset(X_train, y_train),
        batch_size=batch_size,
        shuffle=True
    )

    model = EEGNet()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)
    criterion = nn.CrossEntropyLoss()

    model.train()

    losses = []

    for epoch in range(epochs):
        total_loss = 0.0

        for xb, yb in train_loader:
            optimizer.zero_grad()

            logits = model(xb)
            loss = criterion(logits, yb)

            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        avg_loss = total_loss / max(1, len(train_loader))
        losses.append(avg_loss)

        print(f"Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.4f}")

    model.eval()

    with torch.no_grad():
        logits = model(X_test_t)
        preds = torch.argmax(logits, dim=1).numpy()

    acc = accuracy_score(y_test, preds)

    torch.save(model.state_dict(), MODEL_PATH)
    model_ready = True

    report = classification_report(
        y_test,
        preds,
        labels=list(range(NUM_CLASSES)),
        target_names=CLASSES,
        zero_division=0
    )

    return {
        "ok": True,
        "accuracy": float(acc),
        "samples": int(len(X)),
        "classes_found": [ID_TO_CLASS[i] for i in unique_classes],
        "report": report
    }


def predict_current_window():
    if not model_ready or model is None:
        return {
            "ready": False,
            "label": "rest",
            "confidence": 0.0,
            "movement": movement_from_label("rest")
        }

    window = get_current_window()

    if window is None:
        return {
            "ready": False,
            "label": "rest",
            "confidence": 0.0,
            "movement": movement_from_label("rest")
        }

    x = torch.tensor(window[np.newaxis, np.newaxis, :, :], dtype=torch.float32)

    model.eval()

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).numpy()[0]

    class_id = int(np.argmax(probs))
    confidence = float(probs[class_id])
    label = ID_TO_CLASS[class_id]

    if confidence < 0.45:
        label = "rest"

    return {
        "ready": True,
        "label": label,
        "confidence": confidence,
        "movement": movement_from_label(label)
    }


# ============================================================
# API ROUTES
# ============================================================

@app.get("/")
def home():
    return {
        "message": "INTELLEEG EEGNet server is running.",
        "classes": CLASSES,
        "model_ready": model_ready
    }


@app.get("/ports")
def get_ports():
    ports = []

    for port in serial.tools.list_ports.comports():
        ports.append({
            "device": port.device,
            "description": port.description,
            "manufacturer": port.manufacturer
        })

    return {
        "ports": ports
    }


@app.post("/connect")
def connect_serial(port: str = None):
    global serial_thread, serial_running

    if serial_running:
        return {
            "ok": True,
            "connected": True,
            "port": serial_port.port if serial_port else port,
            "message": "Already connected."
        }

    if port is None:
        port = find_pico_port()

    if port is None:
        return {
            "ok": False,
            "connected": False,
            "port": None,
            "message": "No Pico/serial port found. Check USB cable and COM port."
        }

    serial_running = True
    serial_thread = threading.Thread(
        target=serial_reader_loop,
        args=(port,),
        daemon=True
    )
    serial_thread.start()

    return {
        "ok": True,
        "connected": True,
        "port": port,
        "message": f"Connected to Pico on {port}"
    }


@app.get("/connect-pico")
def connect_pico_get():
    return connect_serial()


@app.post("/disconnect")
def disconnect_serial():
    global serial_running

    serial_running = False

    return {
        "ok": True,
        "message": "Serial disconnect requested."
    }


@app.get("/latest")
def get_latest():
    return {
        "sample": latest_sample,
        "buffer_size": len(buffer_cz),
        "model_ready": model_ready,
        "recording": recording,
        "recording_label": recording_label
    }


@app.post("/record/start")
def start_record(label: str):
    global recording, recording_label, recording_rows

    if label not in CLASSES:
        return {
            "ok": False,
            "message": f"Invalid label. Use one of: {CLASSES}"
        }

    recording = True
    recording_label = label
    recording_rows = []

    return {
        "ok": True,
        "message": f"Recording started for label: {label}"
    }


@app.post("/record/stop")
def stop_record():
    global recording, recording_rows

    recording = False

    if len(recording_rows) == 0:
        return {
            "ok": False,
            "message": "No data recorded."
        }

    new_df = pd.DataFrame(recording_rows)

    if os.path.exists(CSV_PATH):
        old_df = pd.read_csv(CSV_PATH)
        final_df = pd.concat([old_df, new_df], ignore_index=True)
    else:
        final_df = new_df

    final_df.to_csv(CSV_PATH, index=False)

    count = len(recording_rows)
    recording_rows = []

    return {
        "ok": True,
        "message": f"Saved {count} samples to {CSV_PATH}",
        "csv_path": CSV_PATH
    }


@app.post("/train")
def train_endpoint():
    result = train_user_model()
    return result


@app.get("/predict")
def predict_endpoint():
    return predict_current_window()


@app.get("/dataset/status")
def dataset_status():
    if not os.path.exists(CSV_PATH):
        return {
            "exists": False,
            "message": "No dataset yet."
        }

    df = pd.read_csv(CSV_PATH)

    counts = df["label"].value_counts().to_dict()

    return {
        "exists": True,
        "csv_path": CSV_PATH,
        "total_rows": len(df),
        "counts": counts
    }


@app.post("/dataset/clear")
def clear_dataset():
    if os.path.exists(CSV_PATH):
        os.remove(CSV_PATH)

    return {
        "ok": True,
        "message": "Dataset cleared."
    }


@app.websocket("/ws/eeg")
async def websocket_eeg(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)

    try:
        while True:
            prediction = predict_current_window()

            payload = {
                "type": "eeg_update",
                "sample": latest_sample,
                "buffer_size": len(buffer_cz),
                "recording": recording,
                "recording_label": recording_label,
                "model_ready": model_ready,
                "prediction": prediction,
                "connected": serial_running
            }

            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        connected_clients.discard(websocket)

    except Exception:
        connected_clients.discard(websocket)