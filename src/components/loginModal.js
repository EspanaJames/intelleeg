export function createLoginModal() {
    const overlay = document.createElement("div");
    overlay.className = "overlay hidden";

    const box = document.createElement("div");
    box.className = "loginBox";

    const closeBtn = document.createElement("img");
    closeBtn.src = "../../assets/images/exit.png";
    closeBtn.className = "close-btn";

    const header = document.createElement("div");
    header.className = "login-header";

    const logo = document.createElement("img");
    logo.src = "../../assets/images/INTELLEEG-BLACK.png";
    logo.className = "login-logo";

    const title = document.createElement("h2");
    title.textContent = "INTELOGIN";

    header.appendChild(logo);
    header.appendChild(title);

    const userWrapper = document.createElement("div");
    userWrapper.className = "input-wrapper";

    const userIcon = document.createElement("img");
    userIcon.src = "../../assets/images/user.png";
    userIcon.className = "field-icon";

    const username = document.createElement("input");
    username.type = "text";
    username.placeholder = " ";

    const userLabel = document.createElement("label");
    userLabel.className = "floating-label";
    userLabel.textContent = "USERNAME";

    userWrapper.appendChild(userIcon);
    userWrapper.appendChild(username);
    userWrapper.appendChild(userLabel);

    const passWrapper = document.createElement("div");
    passWrapper.className = "input-wrapper";

    const passIcon = document.createElement("img");
    passIcon.src = "../../assets/images/password.png";
    passIcon.className = "field-icon";

    const password = document.createElement("input");
    password.type = "password";
    password.placeholder = " ";

    const passLabel = document.createElement("label");
    passLabel.className = "floating-label";
    passLabel.textContent = "PASSWORD";

    const eyeBtn = document.createElement("img");
    eyeBtn.src = "../../assets/images/view.png";
    eyeBtn.className = "toggle-eye";

    passWrapper.appendChild(passIcon);
    passWrapper.appendChild(password);
    passWrapper.appendChild(passLabel);
    passWrapper.appendChild(eyeBtn);

    const submitBtn = document.createElement("button");
    submitBtn.className = "login-submit";
    submitBtn.textContent = "Enter Account";

    box.appendChild(closeBtn);
    box.appendChild(header);
    box.appendChild(userWrapper);
    box.appendChild(passWrapper);
    box.appendChild(submitBtn);
    overlay.appendChild(box);

    eyeBtn.addEventListener("click", () => {
        if (password.type === "password") {
            password.type = "text";
            eyeBtn.src = "../../assets/images/unview.png";
        } else {
            password.type = "password";
            eyeBtn.src = "../../assets/images/view.png";
        }
    });

    closeBtn.addEventListener("click", () => overlay.classList.add("hidden"));

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") overlay.classList.add("hidden");
    });

    submitBtn.addEventListener("click", () => {
        if (username.value === "admin" && password.value === "123") {
            window.location.href = "./src/pages/eegPage.html";
        } else {
            alert("Invalid credentials");
        }
    });

    function open() {
        overlay.classList.remove("hidden");
    }

    function hide() {
        overlay.classList.add("hidden");
    }

    return { overlay, open, hide };
}