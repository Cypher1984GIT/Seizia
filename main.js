const path = require('path');
const { app, BrowserWindow, BrowserView, Menu, clipboard, ipcMain, nativeImage, nativeTheme } = require('electron');
const { createWindowStateStore } = require('./src/main/windowState');
const { configureGlobalWebContents } = require('./src/main/security');
const { createUpdater } = require('./src/main/updater');
const { createAppMenu } = require('./src/main/menu');
const { ViewManager } = require('./src/main/viewManager');
const { createPromptStore } = require('./src/main/promptStore');
const { createMoreMenuController } = require('./src/main/moreMenuPopup');
const { createLicenseStore } = require('./src/main/license/licenseStore');
const { createLicenseService } = require('./src/main/license/licenseService');

let win;
let currentTheme = 'dark';

configureGlobalWebContents(app);

const stateStore = createWindowStateStore(app);
const promptStore = createPromptStore(app);
const licenseStore = createLicenseStore(app);
const licenseService = createLicenseService({ app, store: licenseStore });
const moreMenu = createMoreMenuController({
    winRef: () => win,
    getTheme: () => currentTheme,
    sendToWindow: (channel, payload) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
});
const updater = createUpdater({
    winRef: () => win
});

const viewManager = new ViewManager({
    app,
    BrowserView,
    Menu,
    clipboard,
    winRef: () => win,
    getTheme: () => currentTheme,
    sendToWindow: (channel, payload) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
});

function createAppIcon() {
    // Same source as the About modal. Chromium's scaler is what makes that
    // preview look sharp; Cinnamon blurs a 512/1024 _NET_WM_ICON, so only
    // hand it sizes close to the panel.
    const master = nativeImage.createFromPath(path.join(__dirname, 'icon-tray.png'));
    const icon = nativeImage.createEmpty();
    for (const size of [32, 48, 64, 128]) {
        const resized = master.resize({ width: size, height: size, quality: 'best' });
        icon.addRepresentation({
            width: size,
            height: size,
            scaleFactor: 1,
            buffer: resized.toPNG()
        });
    }
    return icon.isEmpty() ? master : icon;
}

function createWindow() {
    const state = stateStore.load();
    currentTheme = state.theme || 'dark';
    nativeTheme.themeSource = currentTheme;
    const appIcon = createAppIcon();

    win = new BrowserWindow({
        width: state.width || 1300,
        height: state.height || 900,
        x: state.x,
        y: state.y,
        minWidth: 800,
        minHeight: 600,
        icon: appIcon,
        autoHideMenuBar: true,
        backgroundColor: currentTheme === 'light' ? '#f3eee6' : '#0a0b0d',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload-app.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    win.setIcon(appIcon);
    win.loadFile('index.html');

    if (state.isMaximized) {
        win.maximize();
    }

    win.once('ready-to-show', () => {
        win.show();
    });

    let resizeTimeout;
    const handleResizeOrMove = () => {
        viewManager.updatePositions();
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            stateStore.save(win, currentTheme);
        }, 500);
    };

    win.on('resize', handleResizeOrMove);
    win.on('move', handleResizeOrMove);
    win.on('close', () => {
        stateStore.save(win, currentTheme);
    });
    win.on('closed', () => {
        viewManager.reset();
        win = null;
    });

    win.webContents.on('did-finish-load', () => {
        win.webContents.send('app-version', app.getVersion());
        licenseService.getStatus({ refresh: true }).then((status) => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('license-updated', status);
            }
        }).catch((error) => {
            console.error('License refresh failed:', error);
        });
    });
}

ipcMain.on('update-layout', (_event, layout) => {
    viewManager.updateLayout(layout);
});

ipcMain.on('check-for-updates', () => {
    updater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', (_event, url) => {
    updater.openInstallUrl(url);
});

ipcMain.on('open-external', (_event, url) => {
    updater.openInstallUrl(url);
});

ipcMain.on('add-ai', (_event, payload) => {
    viewManager.addAI(payload);
});

ipcMain.on('broadcast-prompt', (_event, prompt) => {
    viewManager.broadcastPrompt(prompt);
});

ipcMain.on('hide-current-view', () => {
    viewManager.hideCurrentView();
});

ipcMain.on('switch-tab', (_event, id) => {
    viewManager.switchTab(id);
});

ipcMain.on('toggle-split', (_event, payload) => {
    viewManager.toggleSplit(payload);
});

ipcMain.on('remove-ai', (_event, id) => {
    viewManager.removeAI(id);
});

ipcMain.on('reload-ai', (_event, id) => {
    viewManager.reloadAI(id);
});

ipcMain.on('show-current-view', () => {
    viewManager.showCurrentView();
});

ipcMain.on('reload-all-ais', () => {
    viewManager.reloadAllAIs();
});

ipcMain.on('get-omni-theme', (event) => {
    event.returnValue = currentTheme === 'light' ? 'light' : 'dark';
});

ipcMain.on('theme-changed', (_event, theme) => {
    nativeTheme.themeSource = theme;
    currentTheme = theme;
    if (win && !win.isDestroyed()) {
        win.setBackgroundColor(theme === 'light' ? '#ffffff' : '#000000');
    }
    stateStore.save(win, currentTheme);
    viewManager.applyTheme(theme);
});

ipcMain.handle('prompts-get', () => {
    return promptStore.read();
});

ipcMain.handle('prompts-set', (_event, prompts) => {
    return promptStore.write(prompts);
});

ipcMain.handle('license:status', async () => {
    return licenseService.getStatus({ refresh: false });
});

ipcMain.handle('license:activate', async (_event, key) => {
    return licenseService.activate(key);
});

ipcMain.handle('license:clear', async () => {
    return licenseService.clear();
});

ipcMain.handle('features:get', async () => {
    return licenseService.getFeatures();
});

ipcMain.on('show-more-menu', (_event, pos = {}) => {
    moreMenu.open(pos);
});

ipcMain.on('more-menu-pick', (_event, action) => {
    moreMenu.pick(action);
});

ipcMain.on('reset-all', () => {
    currentTheme = 'dark';
    nativeTheme.themeSource = currentTheme;
    viewManager.reset();
    stateStore.save(win, currentTheme);
});

app.whenReady().then(() => {
    createWindow();
    createAppMenu({ app, winRef: () => win });
    updater.registerListeners();
    setTimeout(() => {
        updater.checkForUpdates().catch((error) => {
            console.error('Failed to check for updates:', error);
        });
    }, 2000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
