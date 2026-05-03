import { initSelectionTools } from "./selectionTools.js";
import { playEEGMovement } from "../larrieMovingFunctions/movingLarrie.js";

document.addEventListener("DOMContentLoaded", () => {
    initSelectionTools();
});

const startBtn = document.getElementById("startBtn");
const calibrateBtn = document.getElementById("calibrateBtn");
const trainBtn = document.getElementById("trainBtn");
const connectBtn = document.getElementById("connectBtn");
const footerActionDescription = document.getElementById("footerActionDescription");

const c4Value = document.getElementById("c4Value");
const czValue = document.getElementById("czValue");

const c4Canvas = document.getElementById("c4Chart");
const czCanvas = document.getElementById("czChart");

let eegSocket = null;
let c4Chart = null;
let czChart = null;

let isRunning = false;
let isConnected = false;
let lastPredictionLabel = null;

function createCharts() {
    const labels = Array.from({ length: 100 }, (_, i) => i);

    c4Chart = new Chart(c4Canvas.getContext("2d"), {
        type: "line",
        data: {
            labels: [...labels],
            datasets: [{
                label: "C3",
                data: new Array(100).fill(0),
                borderColor: "#ff4d6d",
                backgroundColor: "rgba(255,77,109,0.15)",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.15
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "white" } }
            },
            scales: {
                x: {
                    ticks: { color: "white" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                },
                y: {
                    ticks: { color: "white" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                }
            }
        }
    });

    czChart = new Chart(czCanvas.getContext("2d"), {
        type: "line",
        data: {
            labels: [...labels],
            datasets: [{
                label: "Cz",
                data: new Array(100).fill(0),
                borderColor: "#4cc9f0",
                backgroundColor: "rgba(76,201,240,0.15)",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.15
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "white" } }
            },
            scales: {
                x: {
                    ticks: { color: "white" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                },
                y: {
                    ticks: { color: "white" },
                    grid: { color: "rgba(255,255,255,0.1)" }
                }
            }
        }
    });
}

function ensureCharts() {
    if (!c4Chart || !czChart) {
        createCharts();
    }
}

function connectEEGSocket() {
    if (eegSocket) {
        try {
            eegSocket.close();
        } catch (e) {
            console.warn("Old EEG socket close error:", e);
        }
        eegSocket = null;
    }

    eegSocket = new WebSocket("ws://127.0.0.1:8000/ws/eeg");

    eegSocket.onopen = () => {
        console.log("EEG socket connected");
        footerActionDescription.textContent = "EEG stream connected";
    };

    eegSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.connected === false) {
            footerActionDescription.textContent = "⚠️ Pico disconnected";
            isConnected = false;
            isRunning = false;
            setStartButtonUI(false);
            stopEEGOnly();
            return;
        }

        const sample = data.sample || {};
        const c4 = Number(sample.c4 || 0);
        const cz = Number(sample.cz || 0);

        c4Value.textContent = c4.toFixed(6);
        czValue.textContent = cz.toFixed(6);

        if (c4Chart && czChart) {
            c4Chart.data.datasets[0].data.push(c4);
            c4Chart.data.datasets[0].data.shift();
            c4Chart.update("none");

            czChart.data.datasets[0].data.push(cz);
            czChart.data.datasets[0].data.shift();
            czChart.update("none");
        }

        const prediction = data.prediction || {};
        const label = prediction.label || "rest";
        const confidence = Number(prediction.confidence || 0);

        footerActionDescription.textContent =
            `Prediction: ${label} | Confidence: ${confidence.toFixed(2)}`;

        if (label !== lastPredictionLabel) {
            lastPredictionLabel = label;
            playEEGMovement(label);
        }
    };

    eegSocket.onerror = (error) => {
        console.error("EEG WebSocket error:", error);
        footerActionDescription.textContent = "Could not connect to EEG stream";
    };

    eegSocket.onclose = () => {
        console.log("EEG socket closed");
    };
}

function stopEEGOnly() {
    console.log("Stopping EEG stream only...");

    if (eegSocket) {
        try {
            eegSocket.onmessage = null;
            eegSocket.onerror = null;
            eegSocket.onclose = null;
            eegSocket.close(1000, "Manual stop");
        } catch (e) {
            console.warn("EEG socket close error:", e);
        }
        eegSocket = null;
    }

    lastPredictionLabel = null;
}

function resetEEGSystem() {
    console.log("FULL RESET");

    stopEEGOnly();

    if (c4Chart && czChart) {
        c4Chart.data.datasets[0].data = new Array(100).fill(0);
        czChart.data.datasets[0].data = new Array(100).fill(0);
        c4Chart.update();
        czChart.update();
    }

    if (c4Value) c4Value.textContent = "--";
    if (czValue) czValue.textContent = "--";
}

function setStartButtonUI(running) {
    const img = startBtn.querySelector("img");
    const text = startBtn.querySelector("p");

    if (running) {
        img.src = "../../assets/images/stop.png";
        text.textContent = "STOP";
    } else {
        img.src = "../../assets/images/start.png";
        text.textContent = "START";
    }
}

connectBtn.addEventListener("click", async () => {
    footerActionDescription.textContent = "Checking Raspberry Pi PICO connection...";

    try {
        const response = await fetch("http://127.0.0.1:8000/connect-pico");
        const data = await response.json();

        console.log("Connect response:", data);

        if (data.connected && data.port) {
            isConnected = true;
            footerActionDescription.textContent =
                `Raspberry Pi PICO is connected at ${data.port}`;
        } else {
            isConnected = false;
            footerActionDescription.textContent =
                "Raspberry Pi PICO is not connected";
        }
    } catch (error) {
        isConnected = false;
        console.error("Connection error:", error);
        footerActionDescription.textContent =
            "Could not connect to Python backend";
    }
});

startBtn.addEventListener("click", async () => {
    if (!isConnected) {
        footerActionDescription.textContent =
            "Connect Raspberry Pi PICO first";
        return;
    }

    if (!isRunning) {
        console.log("STARTING");

        resetEEGSystem();
        ensureCharts();

        footerActionDescription.textContent = "Starting EEG stream...";
        connectEEGSocket();

        isRunning = true;
        setStartButtonUI(true);
    } else {
        console.log("STOPPING");

        stopEEGOnly();

        footerActionDescription.textContent = "EEG stream stopped";
        isRunning = false;
        setStartButtonUI(false);
    }
});

let isTraining = false;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

trainBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    if (isTraining) return;
    isTraining = true;

    try {
        if (!isConnected) {
            footerActionDescription.textContent = "Connect Pico first";
            return;
        }

        const labels = [
            "rest",
            "hand_clench",
            "arm_raised",
            "elbow_raised"
        ];

        for (const label of labels) {
            console.log("STARTING LABEL:", label);

            footerActionDescription.textContent =
                `Prepare: ${label} in 3 seconds...`;

            await delay(3000);

            footerActionDescription.textContent =
                `Recording ${label} for 10 seconds...`;

            const startRes = await fetch(
                `http://127.0.0.1:8000/record/start?label=${label}`,
                { method: "POST" }
            );

            const startData = await startRes.json();
            console.log("START RESPONSE:", label, startData);

            await delay(10000);

            const stopRes = await fetch(
                "http://127.0.0.1:8000/record/stop",
                { method: "POST" }
            );

            const stopData = await stopRes.json();
            console.log("STOP RESPONSE:", label, stopData);

            if (!stopData.ok) {
                footerActionDescription.textContent =
                    `Failed saving ${label}: ${stopData.message}`;
                return;
            }

            footerActionDescription.textContent = `Saved ${label}`;
            await delay(1000);
        }

        footerActionDescription.textContent = "Training model...";

        const trainRes = await fetch("http://127.0.0.1:8000/train", {
            method: "POST"
        });

        const trainData = await trainRes.json();
        console.log("TRAIN RESPONSE:", trainData);

        if (trainData.ok) {
            footerActionDescription.textContent =
                `Training done | Accuracy: ${(trainData.accuracy * 100).toFixed(2)}%`;
        } else {
            footerActionDescription.textContent =
                `Training failed: ${trainData.message}`;
        }

    } catch (error) {
        console.error("Training sequence error:", error);
        footerActionDescription.textContent =
            "Training sequence failed. Check console.";
    } finally {
        isTraining = false;
    }
});

calibrateBtn.addEventListener("click", () => {
    console.log("Calibrate button clicked");

    isRunning = false;
    setStartButtonUI(false);
    resetEEGSystem();

    footerActionDescription.textContent = "Calibrating...";
});

