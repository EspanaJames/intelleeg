export function initSelectionTools() {
    const buttons = document.querySelectorAll("#selectionTools button");

    let activeButton = null;
    
    buttons.forEach((button, index) => {
        button.addEventListener("click", () => {
            if (activeButton) {
                resetButton(activeButton);
            }

            setActive(button, index);
            activeButton = button;

            handleButtonAction(index);
        });
    });
}

const imageMap = [
    {
        inactive: "eegWhite.png",
        active: "eegGreen.png"
    },
    {
        inactive: "train.png",
        active: "trainGreen.png"
    },
    {
        inactive: "connect.png",
        active: "connectGreen.png"
    }
];

function setActive(button, index) {
    const img = button.querySelector("img");
    const src = img.getAttribute("src");

    img.setAttribute("src", src.replace(imageMap[index].inactive, imageMap[index].active));
}

function resetButton(button) {
    const img = button.querySelector("img");
    const src = img.getAttribute("src");

    imageMap.forEach(map => {
        if (src.includes(map.active)) {
            img.setAttribute("src", src.replace(map.active, map.inactive));
        }
    });
}

function handleButtonAction(index) {
    if (index === 0) {
        // put code here, if the EEG button is clicked this code will execute
    } 
    else if (index === 1) {
        // put code here, if the TRAIN button is clicked this code will execute
    } 
    else if (index === 2) {
        // put code here, if the CONNECT button is clicked this code will execute
    }
}