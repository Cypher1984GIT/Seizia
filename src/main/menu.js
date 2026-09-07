const { Menu } = require('electron');

function createAppMenu({ app, winRef }) {
    const isMac = process.platform === 'darwin';

    const sendToRenderer = (channel, ...args) => {
        const win = winRef();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, ...args);
        }
    };

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CommandOrControl+T',
                    click: () => sendToRenderer('action-new-tab')
                },
                {
                    label: 'Close Tab',
                    accelerator: 'CommandOrControl+W',
                    click: () => sendToRenderer('action-close-tab')
                },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload Current AI',
                    accelerator: 'CommandOrControl+R',
                    click: () => sendToRenderer('action-reload-current')
                },
                {
                    label: 'Force Reload App',
                    accelerator: 'CommandOrControl+Shift+R',
                    click: () => {
                        const win = winRef();
                        if (win && !win.isDestroyed()) {
                            win.reload();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Next Tab',
                    accelerator: 'Control+Tab',
                    click: () => sendToRenderer('action-next-tab')
                },
                {
                    label: 'Previous Tab',
                    accelerator: 'Control+Shift+Tab',
                    click: () => sendToRenderer('action-prev-tab')
                },
                { type: 'separator' },
                { role: 'toggledevtools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Go',
            submenu: [
                { label: 'Tab 1', accelerator: 'CommandOrControl+1', click: () => sendToRenderer('action-jump-tab', 0) },
                { label: 'Tab 2', accelerator: 'CommandOrControl+2', click: () => sendToRenderer('action-jump-tab', 1) },
                { label: 'Tab 3', accelerator: 'CommandOrControl+3', click: () => sendToRenderer('action-jump-tab', 2) },
                { label: 'Tab 4', accelerator: 'CommandOrControl+4', click: () => sendToRenderer('action-jump-tab', 3) },
                { label: 'Tab 5', accelerator: 'CommandOrControl+5', click: () => sendToRenderer('action-jump-tab', 4) },
                { label: 'Tab 6', accelerator: 'CommandOrControl+6', click: () => sendToRenderer('action-jump-tab', 5) },
                { label: 'Tab 7', accelerator: 'CommandOrControl+7', click: () => sendToRenderer('action-jump-tab', 6) },
                { label: 'Tab 8', accelerator: 'CommandOrControl+8', click: () => sendToRenderer('action-jump-tab', 7) },
                { label: 'Tab 9', accelerator: 'CommandOrControl+9', click: () => sendToRenderer('action-jump-tab', 8) }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = {
    createAppMenu
};
