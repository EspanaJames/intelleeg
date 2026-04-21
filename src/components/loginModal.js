export function createLoginModal() {
    const overlay = document.createElement("div");
    overlay.className = "overlay hidden";

    const box = document.createElement("div");
    box.className = "loginBox";

    const title = document.createElement("h2");
    title.textContent = "EEG Login";

    const username = document.createElement("input");
    username.type = "text";
    username.placeholder = "Username";

    const password = document.createElement("input");
    password.type = "password";
    password.placeholder = "Password";

    const buttonRow = document.createElement("div");
    buttonRow.className = "buttons";

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Submit";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";

    box.appendChild(title);
    box.appendChild(username);
    box.appendChild(password);
    buttonRow.appendChild(submitBtn);
    buttonRow.appendChild(closeBtn);
    box.appendChild(buttonRow);
    overlay.appendChild(box);

    function open() {
        overlay.classList.remove("hidden");
    }

    function hide() {
        overlay.classList.add("hidden");
    }

    submitBtn.addEventListener("click", () => {
        if (username.value === "admin" && password.value === "123") {
            window.location.href = "./src/pages/eegPage.html";
        } else {
            alert("Invalid credentials");
        }
    });

    closeBtn.addEventListener("click", hide);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) hide();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hide();
    });

    return {
        overlay,
        open,
        hide
    };
}