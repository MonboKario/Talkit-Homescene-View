const launchButton = document.getElementById('launch-btn');

function launchApp() {
    const ratio = 10 / 21;
    const height = Math.round(screen.availHeight * 0.92);
    const width = Math.round(height * ratio);
    const left = Math.round((screen.availWidth - width) / 2);
    const top = Math.round((screen.availHeight - height) / 2);

    window.open(
        'cards-v2.html',
        'CardViewer',
        `width=${width},height=${height},left=${left},top=${top},resizable=no,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
    );
}

launchButton?.addEventListener('click', launchApp);
window.addEventListener('load', launchApp, { once: true });
