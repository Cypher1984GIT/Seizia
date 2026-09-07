const { shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { isSafeExternalUrl } = require('./security');

function buildDownloadUrl(version, platform) {
    if (platform === 'win32') {
        return `https://github.com/Cypher1984GIT/Seizia/releases/download/v${version}/Seizia-Setup-${version}.exe`;
    }

    return `https://github.com/Cypher1984GIT/Seizia/releases/tag/v${version}`;
}

function createUpdater({ winRef }) {
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    // Updates are only announced here: the user is sent to the GitHub release
    // page and installs by hand. The installers are not code-signed yet, so
    // autoDownload must stay off until they are, otherwise electron-updater
    // would install a binary whose signature it cannot check.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    function send(channel, payload) {
        const win = winRef();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }

    function registerListeners() {
        autoUpdater.on('checking-for-update', () => {
            send('update-status', 'Checking for updates...');
        });

        autoUpdater.on('update-available', (info) => {
            const version = info.version;
            const url = buildDownloadUrl(version, process.platform);
            send('update-available', { version, url });
            send('update-status', `Update available: ${version}`);
        });

        autoUpdater.on('update-not-available', () => {
            send('update-status', 'App is up to date.');
        });

        autoUpdater.on('error', (error) => {
            send('update-status', `Error in auto-updater: ${error.message || error}`);
        });

        autoUpdater.on('download-progress', (progress) => {
            send('update-status', `Downloading: ${Math.round(progress.percent)}%`);
        });

        autoUpdater.on('update-downloaded', () => {
            send('update-ready');
        });
    }

    function checkForUpdates() {
        return autoUpdater.checkForUpdates();
    }

    function checkForUpdatesAndNotify() {
        return autoUpdater.checkForUpdatesAndNotify();
    }

    function openInstallUrl(url) {
        if (isSafeExternalUrl(url)) {
            shell.openExternal(url).catch((error) => {
                console.error('Failed to open update URL:', error);
            });
        }
    }

    return {
        registerListeners,
        checkForUpdates,
        checkForUpdatesAndNotify,
        openInstallUrl
    };
}

module.exports = {
    createUpdater
};
