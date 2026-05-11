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

const c3Value = document.getElementById("c3Value");
const czValue = document.getElementById("czValue");

const c3Canvas = document.getElementById("c3Chart");
const czCanvas = document.getElementById("czChart");

let eegSocket = null;
let c3Chart = null;
let czChart = null;

let isRunning = false;
let isConnected = false;
let lastPredictionLabel = null;

let currentLarrieLabel = "rest";
let lastMovementTime = 0;
const MOVEMENT_COOLDOWN = 1200; // milliseconds

function createCharts() {
    const labels = Array.from({ length: 100 }, (_, i) => i);

    c3Chart = new Chart(c3Canvas.getContext("2d"), {
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
    if (!c3Chart || !czChart) {
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
        const c3 = Number(sample.c3 || 0);
        const cz = Number(sample.cz || 0);

        c3Value.textContent = c3.toFixed(6);
        czValue.textContent = cz.toFixed(6);

        if (c3Chart && czChart) {
            c3Chart.data.datasets[0].data.push(c3);
            c3Chart.data.datasets[0].data.shift();
            c3Chart.update("none");

            czChart.data.datasets[0].data.push(cz);
            czChart.data.datasets[0].data.shift();
            czChart.update("none");
        }

        const prediction = data.prediction || {};
        const label = prediction.label || "rest";
        const confidence = Number(prediction.confidence || 0);

        footerActionDescription.textContent =
            `Prediction: ${label} | Confidence: ${confidence.toFixed(2)}`;

        const now = Date.now();

        if (
            prediction.ready === true &&
            label !== currentLarrieLabel &&
            now - lastMovementTime > MOVEMENT_COOLDOWN
        ) {
            currentLarrieLabel = label;
            lastPredictionLabel = label;
            lastMovementTime = now;

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
    currentLarrieLabel = "rest";
    lastMovementTime = 0;
}

function resetEEGSystem() {
    console.log("FULL RESET");

    stopEEGOnly();

    if (c3Chart && czChart) {
        c3Chart.data.datasets[0].data = new Array(100).fill(0);
        czChart.data.datasets[0].data = new Array(100).fill(0);
        c3Chart.update();
        czChart.update();
    }

    if (c3Value) c3Value.textContent = "--";
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

let currentTrainingLabelIndex = 0;

const labels = [
    "rest",
    "hand_clench",
    "arm_raised",
    "elbow_raised"
];

trainBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    if (isTraining) return;
    isTraining = true;

    try {
        if (!isConnected) {
            footerActionDescription.textContent = "Connect Pico first";
            return;
        }

        const label = labels[currentTrainingLabelIndex];

        footerActionDescription.textContent =
            `Prepare: ${label} in 3 seconds...`;

        await delay(3000);

        footerActionDescription.textContent =
            `Recording preview for ${label}...`;

        await fetch(
            `http://127.0.0.1:8000/record/start?label=${label}`,
            { method: "POST" }
        );

        await delay(10000); // preview duration first; change to 30000 or 120000 later

        const stopRes = await fetch(
            "http://127.0.0.1:8000/record/stop",
            { method: "POST" }
        );

        const stopData = await stopRes.json();
        console.log("Preview:", stopData);

        if (!stopData.ok) {
            footerActionDescription.textContent =
                `Preview failed: ${stopData.message}`;
            return;
        }

        footerActionDescription.textContent =
            `Preview ready for ${label}. Click Calibrate to save, or Train to retry.`;

    } catch (error) {
        console.error(error);
        footerActionDescription.textContent = "Training preview failed.";
    } finally {
        isTraining = false;
    }
});

calibrateBtn.addEventListener("click", async () => {
    console.log("Calibrate button clicked");

    try {
        const commitRes = await fetch(
            "http://127.0.0.1:8000/record/commit",
            { method: "POST" }
        );

        const commitData = await commitRes.json();
        console.log("COMMIT:", commitData);

        if (!commitData.ok) {
            footerActionDescription.textContent =
                `Save failed: ${commitData.message}`;
            return;
        }

        footerActionDescription.textContent =
            `Saved ${commitData.label}.`;

        currentTrainingLabelIndex++;

        if (currentTrainingLabelIndex >= labels.length) {
            footerActionDescription.textContent =
                "All labels saved. Training model...";

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

            currentTrainingLabelIndex = 0;
        } else {
            footerActionDescription.textContent =
                `Next label: ${labels[currentTrainingLabelIndex]}. Click Train when ready.`;
        }

    } catch (error) {
        console.error("Commit error:", error);
        footerActionDescription.textContent = "Save failed.";
    }
});

