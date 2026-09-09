const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    const theme = new URLSearchParams(window.location.search).get('theme');
    if (theme !== 'light') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    function bindItem(id, action) {
        const el = document.getElementById(id);
        if (!el) return;
        const pick = () => ipcRenderer.send('more-menu-pick', action);
        el.addEventListener('click', pick);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pick();
            }
        });
    }

    bindItem('more-menu-help', 'help');
    bindItem('more-menu-permissions', 'permissions');
    bindItem('more-menu-reset', 'reset');
});
