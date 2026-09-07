const path = require('path');
const { BrowserWindow } = require('electron');

const PANEL_WIDTH = 176;
// Two items at 30px each plus the panel's 4px padding and 1px borders.
const PANEL_HEIGHT = 70;
const SHADOW_PAD = 12;
const MENU_WIDTH = PANEL_WIDTH + (SHADOW_PAD * 2);
const MENU_HEIGHT = PANEL_HEIGHT + (SHADOW_PAD * 2);

function createMoreMenuController({ winRef, getTheme, sendToWindow }) {
    let popup = null;
    let closedAt = 0;

    function close() {
        if (popup && !popup.isDestroyed()) {
            popup.close();
        }
        popup = null;
        closedAt = Date.now();
    }

    function isOpen() {
        return Boolean(popup && !popup.isDestroyed());
    }

    function open(pos = {}) {
        const win = winRef();
        if (!win || win.isDestroyed()) {
            return;
        }

        if (isOpen()) {
            close();
            return;
        }

        if (Date.now() - closedAt < 250) {
            return;
        }

        const theme = pos.theme || getTheme() || 'dark';
        const content = win.getContentBounds();
        const right = Number(pos.right);
        const bottom = Number(pos.bottom);
        let x = Number.isFinite(right)
            ? Math.round(content.x + right - PANEL_WIDTH - SHADOW_PAD)
            : Math.round(content.x + content.width - PANEL_WIDTH - SHADOW_PAD - 8);
        let y = Number.isFinite(bottom)
            ? Math.round(content.y + bottom + 2 - SHADOW_PAD)
            : Math.round(content.y + 48 - SHADOW_PAD);

        x = Math.max(content.x + 4 - SHADOW_PAD, x);
        y = Math.max(content.y + 4 - SHADOW_PAD, y);

        popup = new BrowserWindow({
            parent: win,
            modal: false,
            frame: false,
            show: false,
            width: MENU_WIDTH,
            height: MENU_HEIGHT,
            x,
            y,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            transparent: true,
            roundedCorners: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            webPreferences: {
                preload: path.join(__dirname, '..', '..', 'preload-more-menu.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false
            }
        });

        popup.setMenu(null);
        popup.loadFile(path.join(__dirname, '..', '..', 'more-menu.html'), {
            query: { theme }
        });

        popup.once('ready-to-show', async () => {
            if (!popup || popup.isDestroyed()) {
                return;
            }
            try {
                const size = await popup.webContents.executeJavaScript(
                    `(() => { const r = document.body.getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; })()`
                );
                if (size && size.w && size.h) {
                    popup.setContentSize(Math.round(size.w), Math.round(size.h));
                }
            } catch (_) {
                // Keep the fallback MENU_WIDTH / MENU_HEIGHT.
            }
            if (popup && !popup.isDestroyed()) {
                popup.show();
            }
        });
        popup.on('blur', () => close());
        popup.on('closed', () => {
            popup = null;
        });

        const dismiss = () => close();
        win.once('move', dismiss);
        win.once('resize', dismiss);
        popup.on('closed', () => {
            win.removeListener('move', dismiss);
            win.removeListener('resize', dismiss);
        });
    }

    function pick(action) {
        close();
        if (action === 'help' || action === 'reset') {
            sendToWindow('more-menu-action', action);
        }
    }

    return { open, close, pick };
}

module.exports = {
    createMoreMenuController
};
