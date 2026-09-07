const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
    'update-layout',
    'check-for-updates',
    'install-update',
    'open-external',
    'add-ai',
    'remove-ai',
    'reload-ai',
    'reload-all-ais',
    'switch-tab',
    'toggle-split',
    'hide-current-view',
    'show-current-view',
    'broadcast-prompt',
    'theme-changed',
    'reset-all',
    'show-more-menu'
]);

const RECEIVE_CHANNELS = new Set([
    'sync-split-state',
    'action-new-tab',
    'action-close-tab',
    'action-reload-current',
    'action-next-tab',
    'action-prev-tab',
    'action-jump-tab',
    'ai-loading-status',
    'ai-view-curtain',
    'app-version',
    'update-status',
    'update-available',
    'update-ready',
    'more-menu-action'
]);

const INVOKE_CHANNELS = new Set([
    'prompts-get',
    'prompts-set'
]);

contextBridge.exposeInMainWorld('omni', {
    send(channel, payload) {
        if (SEND_CHANNELS.has(channel)) {
            ipcRenderer.send(channel, payload);
        }
    },
    invoke(channel, payload) {
        if (!INVOKE_CHANNELS.has(channel)) {
            return Promise.reject(new Error('Unknown channel'));
        }
        return ipcRenderer.invoke(channel, payload);
    },
    on(channel, handler) {
        if (!RECEIVE_CHANNELS.has(channel) || typeof handler !== 'function') {
            return () => {};
        }

        const wrapped = (_event, ...args) => handler(...args);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    },
    openExternal(url) {
        ipcRenderer.send('open-external', url);
    }
});
