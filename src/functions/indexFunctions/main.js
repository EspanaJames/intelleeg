import { initEEGLogin } from "./openLogin.js";

initEEGLogin();

const connectBtn = document.getElementById("connectBtn");
const footerText = document.getElementById("footerActionDescription");

connectBtn.addEventListener("click", async () => {
    try {
        // Ask user to select device
        const port = await navigator.serial.requestPort();

        await port.open({ baudRate: 115200 });

        // Get port info
        const info = port.getInfo();

        // Update UI
        footerText.textContent = `Connected to Pico (USB Vendor: ${info.usbVendorId})`;

    } catch (error) {
        console.error(error);
        footerText.textContent = "Connection failed!";
    }
});