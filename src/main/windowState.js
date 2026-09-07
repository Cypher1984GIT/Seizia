const fs = require('fs');
const path = require('path');

function createWindowStateStore(app) {
    const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

    function readPreviousState() {
        try {
            if (fs.existsSync(stateFilePath)) {
                return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            }
        } catch (error) {
            console.error('Failed to read window state:', error);
        }

        return null;
    }

    function load() {
        return readPreviousState() || { width: 1300, height: 900, isMaximized: true, theme: 'dark' };
    }

    function save(win, theme) {
        if (!win || win.isDestroyed()) {
            return;
        }

        try {
            const isMaximized = win.isMaximized();
            const state = {
                isMaximized,
                theme
            };

            if (!isMaximized) {
                Object.assign(state, win.getBounds());
            } else {
                // Keep the restore-down bounds, but never let an unreadable
                // file abort the write: that would leave the corrupt state on
                // disk and break saving on every later run too.
                const previous = readPreviousState();

                if (previous) {
                    state.x = previous.x;
                    state.y = previous.y;
                    state.width = previous.width;
                    state.height = previous.height;
                }
            }

            fs.writeFileSync(stateFilePath, JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save window state:', error);
        }
    }

    return {
        load,
        save,
        stateFilePath
    };
}

module.exports = {
    createWindowStateStore
};
