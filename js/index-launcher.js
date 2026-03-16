const launchButton = document.getElementById('launch-btn');
const launchHint = document.querySelector('.launch-shell__hint');
const APP_URL = 'cards-v2.html';

function setHint(message) {
    if (launchHint) {
        launchHint.textContent = message;
    }
}

function openAppWindow() {
    const ratio = 10 / 21;
    const height = Math.round(screen.availHeight * 0.92);
    const width = Math.round(height * ratio);
    const left = Math.round((screen.availWidth - width) / 2);
    const top = Math.round((screen.availHeight - height) / 2);

    return window.open(
        APP_URL,
        'CardViewer',
        `width=${width},height=${height},left=${left},top=${top},resizable=no,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
    );
}

function launchApp({ fallbackToSameTab = false } = {}) {
    const popup = openAppWindow();

    if (popup && !popup.closed) {
        popup.focus?.();
        setHint('Main page opened. If no popup is visible, check browser or OS popup handling.');
        return true;
    }

    if (fallbackToSameTab) {
        setHint('Popup blocked. Opening the main page in the current tab.');
        window.location.assign(APP_URL);
        return false;
    }

    setHint('Popup blocked. Click the button to open the main page.');
    return false;
}

launchButton?.addEventListener('click', () => {
    launchApp({ fallbackToSameTab: true });
});

window.addEventListener('load', () => {
    launchApp({ fallbackToSameTab: true });
}, { once: true });
