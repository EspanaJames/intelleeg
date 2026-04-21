import { createLoginModal } from "../../components/loginModal.js";

export function initEEGLogin() {
    const modal = createLoginModal();

    document.body.appendChild(modal.overlay);

    const button = document.getElementById("openEEGBtn");

    if (!button) return;

    button.addEventListener("click", (e) => {
        e.preventDefault();
        modal.open();
    });
}