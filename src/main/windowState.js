const fs = require('fs');
const path = require('path');

function createWindowStateStore(app) {
    const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

    function load() {
        try {
            if (fs.existsSync(stateFilePath)) {
                const data = fs.readFileSync(stateFilePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load window state:', error);
        }

        return { width: 1300, height: 900, isMaximized: true, theme: 'dark' };
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
            } else if (fs.existsSync(stateFilePath)) {
                const previous = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
                state.x = previous.x;
                state.y = previous.y;
                state.width = previous.width;
                state.height = previous.height;
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
