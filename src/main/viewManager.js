const path = require('path');
const { shell } = require('electron');
const { SPELLCHECK_LANGUAGES, createPermissionHandler, isSafeExternalUrl } = require('./security');

class ViewManager {
    constructor({ app, BrowserView, Menu, clipboard, winRef, getTheme, sendToWindow }) {
        this.app = app;
        this.BrowserView = BrowserView;
        this.Menu = Menu;
        this.clipboard = clipboard;
        this.winRef = winRef;
        this.getTheme = getTheme;
        this.sendToWindow = sendToWindow;
        this.headerHeight = 48;
        this.footerHeight = 0;
        this.views = {};
        this.isSplitMode = false;
        this.activeViewId = null;
        this.secondaryViewId = null;
        this.viewsHidden = false;
        this.cleanupTimeout = null;
        this._flashTimers = new WeakMap();
        this.viewPreloadPath = path.join(__dirname, '..', '..', 'preload-view.js');
        this._firstRevealMs = 1000;
        this._firstRevealMsSlow = 1400;
        this._firstRevealMaxMs = 12000;
        this.coverView = null;
        this.coverTimer = null;
    }

    getThemeBg(theme) {
        return theme === 'light' ? '#ffffff' : '#000000';
    }

    getThemeCss(theme) {
        const bgColor = this.getThemeBg(theme);
        return `
            html { background-color: ${bgColor} !important; }
            body { background-color: ${bgColor} !important; }
        `;
    }

    /**
     * Temporary page background while a site loads. Do not call this on layout
     * or tab switches — removing it later is what caused the gray → black jump.
     */
    injectFlashCss(contents, theme) {
        if (!contents || contents.isDestroyed()) {
            return;
        }

        const previous = this._flashTimers.get(contents);
        if (previous) {
            clearTimeout(previous.timeoutId);
            if (previous.key) {
                contents.removeInsertedCSS(previous.key).catch(() => {});
            }
            this._flashTimers.delete(contents);
        }

        const fallbackId = setTimeout(() => this.clearFlashCss(contents), 8000);
        this._flashTimers.set(contents, { key: null, timeoutId: fallbackId });

        contents.insertCSS(this.getThemeCss(theme)).then((key) => {
            if (!contents || contents.isDestroyed()) {
                return;
            }
            const current = this._flashTimers.get(contents);
            if (!current || current.timeoutId !== fallbackId) {
                contents.removeInsertedCSS(key).catch(() => {});
                return;
            }
            current.key = key;
        }).catch(() => {});
    }

    clearFlashCss(contents, delayMs = 250) {
        if (!contents || contents.isDestroyed()) {
            return;
        }
        const previous = this._flashTimers.get(contents);
        if (!previous) {
            return;
        }
        clearTimeout(previous.timeoutId);
        const timeoutId = setTimeout(() => {
            this._flashTimers.delete(contents);
            if (!contents || contents.isDestroyed() || !previous.key) {
                return;
            }
            contents.removeInsertedCSS(previous.key).catch(() => {});
        }, delayMs);
        previous.timeoutId = timeoutId;
    }

    isEntryReady(id) {
        return Boolean(this.views[id] && this.views[id].ready);
    }

    visibleIds() {
        if (this.isSplitMode) {
            return [this.activeViewId, this.secondaryViewId].filter((id) => id && this.views[id]);
        }
        return this.activeViewId && this.views[this.activeViewId] ? [this.activeViewId] : [];
    }

    syncCurtain() {
        const ids = this.viewsHidden ? [] : this.visibleIds();
        const show = ids.length > 0 && ids.every((id) => !this.isEntryReady(id));
        this.sendToWindow('ai-view-curtain', { show });
    }

    cancelQuietReveal(id) {
        const entry = this.views[id];
        if (entry && entry.revealTimer) {
            clearTimeout(entry.revealTimer);
            entry.revealTimer = null;
        }
    }

    cancelFirstReveal(id) {
        this.cancelQuietReveal(id);
        const entry = this.views[id];
        if (entry && entry.revealMaxTimer) {
            clearTimeout(entry.revealMaxTimer);
            entry.revealMaxTimer = null;
        }
    }

    markReady(id) {
        const entry = this.views[id];
        if (!entry || entry.ready) {
            return;
        }
        const contents = entry.view.webContents;
        if (contents && !contents.isDestroyed() && (contents.isLoadingMainFrame() || contents.isLoading())) {
            this.cancelQuietReveal(id);
            this.scheduleFirstReveal(id);
            return;
        }
        this.cancelFirstReveal(id);
        const url = contents && !contents.isDestroyed() ? (contents.getURL() || '') : '';
        const slow = /gemini\.google\.com/.test(url);
        const reveal = () => {
            const current = this.views[id];
            if (!current || current.ready) {
                return;
            }
            current.ready = true;
            // Only the visible tab needs a first-paint cover. A background
            // tab becoming ready must not flash a blank overlay on the active one.
            current.justRevealed = this.visibleIds().includes(id);
            this.updatePositions();
        };
        if (slow) {
            this.waitUntilPainted(contents).then(reveal).catch(() => reveal());
            return;
        }
        reveal();
    }

    waitUntilPainted(contents) {
        const attempt = (left) => {
            if (!contents || contents.isDestroyed() || left <= 0) {
                return Promise.resolve();
            }
            return contents.executeJavaScript(`(() => {
                const root = document.documentElement;
                const body = document.body;
                if (!root || !body) return false;
                const bg = (getComputedStyle(body).backgroundColor || getComputedStyle(root).backgroundColor || '').replace(/\\s/g, '');
                const light = /^rgb\\((255,255,255|254,254,254|248,249,250)\\)/.test(bg) || bg === 'rgba(0,0,0,0)' || bg === 'transparent';
                const hasUi = body.childElementCount > 1 || (body.innerText || '').trim().length > 40;
                return !light && hasUi;
            })()`, true).then((ok) => {
                if (ok) {
                    return;
                }
                return new Promise((resolve) => {
                    setTimeout(() => resolve(attempt(left - 1)), 150);
                });
            }).catch(() => new Promise((resolve) => {
                setTimeout(() => resolve(attempt(left - 1)), 150);
            }));
        };
        return attempt(12);
    }

    scheduleFirstReveal(id) {
        const entry = this.views[id];
        if (!entry || entry.ready) {
            return;
        }
        if (entry.revealTimer) {
            clearTimeout(entry.revealTimer);
        }
        const url = entry.view.webContents.getURL() || '';
        const delay = /gemini\.google\.com/.test(url) ? this._firstRevealMsSlow : this._firstRevealMs;
        entry.revealTimer = setTimeout(() => this.markReady(id), delay);
    }

    ensureCover() {
        if (this.coverView && this.coverView.webContents && !this.coverView.webContents.isDestroyed()) {
            return this.coverView;
        }
        const bg = this.getThemeBg(this.getTheme());
        const view = new this.BrowserView({
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        view.setBackgroundColor(bg);
        const html = `<!DOCTYPE html><html style="background:${bg}"><body style="margin:0;background:${bg}"></body></html>`;
        view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        this.coverView = view;
        return view;
    }

    showCover(bounds) {
        const win = this.winRef();
        if (!win || win.isDestroyed() || !bounds) {
            return;
        }
        const bg = this.getThemeBg(this.getTheme());
        const cover = this.ensureCover();
        cover.setBackgroundColor(bg);
        try {
            win.addBrowserView(cover);
            cover.setBounds(bounds);
            if (typeof win.setTopBrowserView === 'function') {
                win.setTopBrowserView(cover);
            }
        } catch {
            // Ignore cover attach errors.
        }
        clearTimeout(this.coverTimer);
        this.coverTimer = setTimeout(() => this.hideCover(), 120);
    }

    hideCover() {
        clearTimeout(this.coverTimer);
        this.coverTimer = null;
        const win = this.winRef();
        if (this.coverView && win && !win.isDestroyed()) {
            try {
                win.removeBrowserView(this.coverView);
            } catch {
                // Ignore if already detached.
            }
        }
        Object.values(this.views).forEach((entry) => {
            if (entry.justCovered) {
                entry.justCovered = false;
                this.clearFlashCss(entry.view.webContents, 400);
            }
        });
    }

    updateLayout({ headerHeight, footerHeight }) {
        this.headerHeight = headerHeight;
        this.footerHeight = footerHeight;
        this.updatePositions();
    }

    updatePositions() {
        const win = this.winRef();
        if (!win || win.isDestroyed()) {
            return;
        }

        // Launcher/modals sit in the main window. Resize would otherwise
        // re-attach BrowserViews and cover the welcome screen.
        if (this.viewsHidden) {
            win.getBrowserViews().forEach((view) => {
                try {
                    win.removeBrowserView(view);
                } catch {
                    // Ignore removal errors.
                }
            });
            this.syncCurtain();
            this.hideCover();
            return;
        }

        const { width, height } = win.getContentBounds();
        const contentHeight = height - this.headerHeight - this.footerHeight;
        const viewsToShow = [];

        if (!this.isSplitMode) {
            if (this.activeViewId && this.isEntryReady(this.activeViewId)) {
                viewsToShow.push({
                    view: this.views[this.activeViewId].view,
                    bounds: { x: 0, y: this.headerHeight, width, height: contentHeight }
                });
            }
        } else {
            const halfWidth = Math.trunc(width / 2);
            if (this.activeViewId && this.isEntryReady(this.activeViewId)) {
                viewsToShow.push({
                    view: this.views[this.activeViewId].view,
                    bounds: { x: 0, y: this.headerHeight, width: halfWidth, height: contentHeight }
                });
            }
            if (this.secondaryViewId && this.isEntryReady(this.secondaryViewId)) {
                viewsToShow.push({
                    view: this.views[this.secondaryViewId].view,
                    bounds: { x: halfWidth, y: this.headerHeight, width: width - halfWidth, height: contentHeight }
                });
            }
        }

        const shown = new Set(viewsToShow.map((item) => item.view));
        const attached = win.getBrowserViews();
        const parkWidth = Math.max(width, 800);
        const parkHeight = Math.max(contentHeight, 600);

        const ensureAttached = (view) => {
            if (!attached.includes(view)) {
                win.addBrowserView(view);
                attached.push(view);
            }
        };

        Object.values(this.views).forEach((entry) => {
            if (shown.has(entry.view)) {
                return;
            }
            try {
                ensureAttached(entry.view);
                entry.view.setBounds({ x: 0, y: -20000, width: parkWidth, height: parkHeight });
            } catch {
                // Ignore views that are closing.
            }
        });

        const revealedVisible = Object.values(this.views).filter((entry) => (
            entry.justRevealed && shown.has(entry.view)
        ));
        Object.values(this.views).forEach((entry) => {
            entry.justRevealed = false;
        });

        const coverTarget = revealedVisible.find((entry) => {
            try {
                const url = entry.view.webContents.getURL() || '';
                return /gemini\.google\.com/.test(url);
            } catch {
                return false;
            }
        });
        const coverBounds = coverTarget
            ? viewsToShow.find((item) => item.view === coverTarget.view)?.bounds
            : null;
        if (coverBounds) {
            coverTarget.justCovered = true;
            this.showCover(coverBounds);
        }

        viewsToShow.forEach(({ view, bounds }) => {
            ensureAttached(view);
            view.setBounds(bounds);
        });

        if (this.coverView && coverBounds) {
            const currentWin = this.winRef();
            if (currentWin && !currentWin.isDestroyed() && typeof currentWin.setTopBrowserView === 'function') {
                try {
                    currentWin.setTopBrowserView(this.coverView);
                } catch {
                    // Ignore z-order errors.
                }
            }
        }

        this.syncCurtain();

        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = setTimeout(() => {
            const currentWin = this.winRef();
            if (!currentWin || currentWin.isDestroyed()) {
                return;
            }

            const known = new Set(Object.values(this.views).map((entry) => entry.view));
            currentWin.getBrowserViews().forEach((view) => {
                if (!known.has(view) && view !== this.coverView) {
                    currentWin.removeBrowserView(view);
                }
            });
        }, 100);
    }

    createView(id, url, isIncognito) {
        const partition = isIncognito
            ? `incognito_session_${id}_${Date.now()}`
            : `persist:ai_sessions_v3_${id}`;

        const view = new this.BrowserView({
            webPreferences: {
                partition,
                preload: this.viewPreloadPath,
                spellcheck: true,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                backgroundThrottling: false
            }
        });

        const session = view.webContents.session;
        const contents = view.webContents;
        session.setSpellCheckerLanguages(SPELLCHECK_LANGUAGES);
        session.setPermissionRequestHandler(createPermissionHandler());

        const theme = this.getTheme();
        view.setBackgroundColor(this.getThemeBg(theme));
        this.injectFlashCss(contents, theme);

        contents.on('did-navigate', () => {
            const entry = this.views[id];
            if (entry && !entry.ready) {
                this.cancelQuietReveal(id);
                this.injectFlashCss(contents, this.getTheme());
            }
        });
        contents.on('did-finish-load', () => {
            const currentTheme = this.getTheme();
            this.syncManagedSiteTheme(contents, currentTheme);
            [100, 500, 1500, 3000].forEach((ms) => {
                setTimeout(() => this.syncManagedSiteTheme(contents, this.getTheme()), ms);
            });
        });

        view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
            if (isSafeExternalUrl(targetUrl)) {
                shell.openExternal(targetUrl).catch(() => {});
            }

            return { action: 'deny' };
        });

        view.webContents.on('will-navigate', (event, targetUrl) => {
            if (!isSafeExternalUrl(targetUrl)) {
                event.preventDefault();
            }
        });

        view.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
            if (errorCode !== -3) {
                view.webContents.loadFile('error.html', { query: { url: validatedURL } });
            }
        });

        view.webContents.on('did-finish-load', async () => {
            try {
                const pageText = await view.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
                if (pageText && (pageText.includes('Sorry, you have been blocked') || pageText.includes('You are unable to access copilot.microsoft.com'))) {
                    view.webContents.loadFile('error.html', { query: { url: view.webContents.getURL() } });
                }
            } catch {
                // Ignore remote script execution errors from restricted pages.
            }
        });

        view.webContents.on('did-start-loading', () => {
            const entry = this.views[id];
            if (entry && !entry.ready) {
                this.cancelQuietReveal(id);
                view.setBackgroundColor(this.getThemeBg(this.getTheme()));
                this.injectFlashCss(contents, this.getTheme());
            }
            this.sendToWindow('ai-loading-status', { id, isLoading: true });
        });

        view.webContents.on('did-stop-loading', () => {
            const entry = this.views[id];
            if (entry && !entry.ready) {
                this.scheduleFirstReveal(id);
            } else {
                this.clearFlashCss(contents);
            }
            this.sendToWindow('ai-loading-status', { id, isLoading: false });
        });

        session.on('will-download', (_event, item) => {
            item.setSaveDialogOptions({
                title: 'Save File',
                defaultPath: path.join(this.app.getPath('downloads'), item.getFilename()),
                buttonLabel: 'Save'
            });
        });

        view.webContents.on('context-menu', (_event, params) => {
            const items = [];

            if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
                params.dictionarySuggestions.forEach((suggestion) => {
                    items.push({
                        label: suggestion,
                        click: () => view.webContents.replaceMisspelling(suggestion)
                    });
                });
                items.push({ type: 'separator' });
            }

            if (view.webContents.canGoBack()) {
                items.push({ label: 'Back', click: () => view.webContents.goBack() });
            }
            if (view.webContents.canGoForward()) {
                items.push({ label: 'Forward', click: () => view.webContents.goForward() });
            }
            items.push({ label: 'Reload Frame', click: () => view.webContents.reload() });
            items.push({ type: 'separator' });

            items.push(
                { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
                { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
                { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
                { type: 'separator' }
            );

            if (params.mediaType === 'image') {
                items.push(
                    { label: 'Save Image As...', click: () => view.webContents.downloadURL(params.srcURL) },
                    { label: 'Copy Image', click: () => view.webContents.copyImageAt(params.x, params.y) },
                    { label: 'Copy Image Address', click: () => this.clipboard.writeText(params.srcURL) },
                    { type: 'separator' }
                );
            }

            if (params.linkURL) {
                items.push(
                    { label: 'Open Link in Browser', click: () => shell.openExternal(params.linkURL).catch(() => {}) },
                    { label: 'Copy Link Address', click: () => this.clipboard.writeText(params.linkURL) },
                    { type: 'separator' }
                );
            }

            if (items.length > 0) {
                this.Menu.buildFromTemplate(items).popup({ window: this.winRef() });
            }
        });

        view.webContents.loadURL(url);
        return { view, partition, ready: false, revealTimer: null, revealMaxTimer: null };
    }

    addAI({ id, url, isIncognito }) {
        if (this.views[id]) {
            return;
        }

        const entry = this.createView(id, url, isIncognito);
        this.views[id] = entry;
        entry.revealMaxTimer = setTimeout(() => this.markReady(id), this._firstRevealMaxMs);
        this.viewsHidden = false;

        if (this.isSplitMode) {
            this.secondaryViewId = id;
            if (!this.activeViewId) {
                this.activeViewId = id;
            }
        } else if (!this.activeViewId) {
            this.activeViewId = id;
        }

        this.updatePositions();
    }

    removeAI(id) {
        const entry = this.views[id];
        if (!entry) {
            return;
        }

        this.cancelFirstReveal(id);

        const win = this.winRef();
        if (win && !win.isDestroyed()) {
            try {
                win.removeBrowserView(entry.view);
            } catch {
                // Ignore if detached already.
            }
        }

        try {
            entry.view.webContents.close({ waitForBeforeUnload: false });
        } catch {
            // Ignore close errors and keep destroying.
        }

        try {
            entry.view.webContents.destroy();
        } catch {
            // Ignore destroy races during shutdown.
        }

        delete this.views[id];

        if (this.activeViewId === id) {
            this.activeViewId = null;
            if (this.isSplitMode && this.secondaryViewId) {
                this.activeViewId = this.secondaryViewId;
                this.secondaryViewId = null;
            }
        }

        if (this.secondaryViewId === id) {
            this.secondaryViewId = null;
        }

        const remainingIds = Object.keys(this.views);
        if (this.isSplitMode && remainingIds.length < 2) {
            this.isSplitMode = false;
            this.secondaryViewId = null;
            if (remainingIds.length === 1) {
                this.activeViewId = remainingIds[0];
            }
            this.sendToWindow('sync-split-state', false);
        } else if (!this.activeViewId && remainingIds.length > 0) {
            this.activeViewId = remainingIds[0];
        }

        this.updatePositions();
    }

    reset() {
        Object.keys(this.views).forEach((id) => {
            this.removeAI(id);
        });
        this.views = {};
        this.isSplitMode = false;
        this.activeViewId = null;
        this.secondaryViewId = null;
    }

    hideCurrentView() {
        this.viewsHidden = true;
        this.hideCover();
        this.syncCurtain();
        const win = this.winRef();
        if (!win || win.isDestroyed()) {
            return;
        }

        win.getBrowserViews().forEach((view) => {
            try {
                win.removeBrowserView(view);
            } catch {
                // Ignore removal errors.
            }
        });
    }

    switchTab(id) {
        if (!this.views[id]) {
            return;
        }

        this.viewsHidden = false;

        if (!this.isSplitMode) {
            this.activeViewId = id;
        } else if (this.activeViewId !== id && this.secondaryViewId !== id) {
            this.secondaryViewId = id;
            if (!this.activeViewId) {
                this.activeViewId = id;
            }
        }

        this.updatePositions();
    }

    toggleSplit(payload = {}) {
        const leftId = typeof payload?.leftId === 'string' ? payload.leftId : null;
        const rightId = typeof payload?.rightId === 'string' ? payload.rightId : null;
        const hasPair = Boolean(
            leftId
            && rightId
            && leftId !== rightId
            && this.views[leftId]
            && this.views[rightId]
        );
        const enable = payload?.enabled;

        if (enable === false || (this.isSplitMode && enable !== true && !hasPair)) {
            this.isSplitMode = false;
            this.secondaryViewId = null;
        } else {
            this.viewsHidden = false;
            this.isSplitMode = true;
            if (hasPair) {
                this.activeViewId = leftId;
                this.secondaryViewId = rightId;
            } else if (!this.secondaryViewId) {
                const next = Object.keys(this.views).find((id) => id !== this.activeViewId);
                if (next) {
                    this.secondaryViewId = next;
                }
            }
            if (!this.activeViewId || !this.secondaryViewId || this.activeViewId === this.secondaryViewId) {
                this.isSplitMode = false;
                this.secondaryViewId = null;
            }
        }

        this.sendToWindow('sync-split-state', this.isSplitMode);
        this.updatePositions();
    }

    reloadAI(id) {
        const entry = this.views[id];
        if (entry) {
            entry.view.webContents.reload();
        }
    }

    showCurrentView() {
        this.viewsHidden = false;
        this.updatePositions();
    }

    reloadAllAIs() {
        Object.values(this.views).forEach(({ view }) => {
            view.webContents.reload();
        });
    }

    broadcastPrompt(payload) {
        const text = typeof payload === 'string' ? payload : payload?.text;
        const target = typeof payload === 'string' ? 'all' : (payload?.target || 'all');
        if (!text) {
            return;
        }

        if (this.viewsHidden) {
            this.showCurrentView();
        }

        const script = this.buildPromptInjectScript(text);
        this.resolvePromptTargets(target).forEach(({ view }) => {
            if (!view?.webContents || view.webContents.isDestroyed()) {
                return;
            }
            view.webContents.executeJavaScript(script).catch((error) => {
                console.log('Broadcast error:', error);
            });
        });
    }

    resolvePromptTargets(target) {
        if (target === 'active') {
            const id = this.activeViewId || Object.keys(this.views)[0];
            return this.views[id] ? [this.views[id]] : [];
        }
        return Object.values(this.views);
    }

    buildPromptInjectScript(prompt) {
        return `
            (function() {
                const text = ${JSON.stringify(prompt)};

                function simulateEnter(element) {
                    const eventInit = {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        keyCode: 13,
                        which: 13,
                        code: 'Enter',
                        key: 'Enter',
                        shiftKey: false
                    };
                    element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                    element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
                    setTimeout(() => {
                        element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
                    }, 50);
                }

                let target = document.querySelector('textarea');
                if (!target) target = document.querySelector('div[contenteditable="true"]');
                if (!target) target = document.querySelector('input[type="text"]');

                const active = document.activeElement;
                if (active && (active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true' || active.tagName === 'INPUT')) {
                    target = active;
                }

                if (!target) return;

                target.focus();
                const usedExecCommand = document.execCommand && document.execCommand('insertText', false, text);

                if (!usedExecCommand || (target.value !== undefined && !target.value.includes(text)) || (target.innerText && !target.innerText.includes(text))) {
                    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
                        const proto = window[target.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement'].prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                        if (nativeSetter) {
                            nativeSetter.call(target, text);
                        } else {
                            target.value = text;
                        }
                    } else {
                        target.innerText = text;
                    }
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                }

                setTimeout(() => {
                    simulateEnter(target);
                    setTimeout(() => {
                        const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="Submit"], button[data-testid*="send"]');
                        if (sendBtn && !sendBtn.disabled) {
                            sendBtn.click();
                        }
                    }, 200);
                }, 100);
            })();
        `;
    }

    buildManagedThemeSyncScript(theme) {
        const resolved = theme === 'light' ? 'light' : 'dark';
        return `
            (function() {
                const resolved = ${JSON.stringify(resolved)};
                const root = document.documentElement;
                if (root) {
                    root.style.colorScheme = resolved;
                }

                const hosts = ['gemini.google.com', 'chat.qwen.ai', 'chat.z.ai', 'app.blackbox.ai', 'www.blackbox.ai', 'blackbox.ai'];
                if (!hosts.includes(location.hostname)) return;
                const bgMap = {
                    'gemini.google.com': { dark: '#131314', light: '#ffffff' },
                    'chat.qwen.ai': { dark: '#171717', light: '#ffffff' },
                    'chat.z.ai': { dark: '#09090b', light: '#ffffff' },
                    'app.blackbox.ai': { dark: '#000000', light: '#ffffff' },
                    'www.blackbox.ai': { dark: '#000000', light: '#ffffff' },
                    'blackbox.ai': { dark: '#000000', light: '#ffffff' }
                };
                const bg = (bgMap[location.hostname] || { dark: '#09090b', light: '#ffffff' })[resolved];
                let previous = null;
                try {
                    previous = localStorage.getItem('theme');
                    if (previous !== resolved) localStorage.setItem('theme', resolved);
                    sessionStorage.setItem('theme', resolved);
                } catch (e) {}
                root.classList.remove('light', 'dark');
                root.classList.add(resolved);
                root.style.backgroundColor = bg;
                root.setAttribute('data-theme', resolved);
                root.setAttribute('data-color-mode', resolved);
                if (document.body) {
                    document.body.classList.remove('light', 'dark');
                    document.body.classList.add(resolved);
                    document.body.style.backgroundColor = bg;
                }
                const meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', bg);
                if (previous === resolved) return;
                try {
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: 'theme', newValue: resolved, storageArea: localStorage
                    }));
                } catch (e) {}
            })();
        `;
    }

    syncManagedSiteTheme(contents, theme) {
        if (!contents || contents.isDestroyed()) {
            return;
        }
        contents.executeJavaScript(this.buildManagedThemeSyncScript(theme)).catch(() => {});
    }

    applyTheme(theme) {
        const bgColor = this.getThemeBg(theme);

        Object.values(this.views).forEach((entry) => {
            try {
                const contents = entry.view.webContents;
                if (!contents || contents.isDestroyed()) {
                    return;
                }
                entry.view.setBackgroundColor(bgColor);
                this.injectFlashCss(contents, theme);
                contents.send('omni-theme-changed', theme);
                this.syncManagedSiteTheme(contents, theme);
                this.clearFlashCss(contents, 800);
                [100, 400, 1000].forEach((ms) => {
                    setTimeout(() => this.syncManagedSiteTheme(contents, theme), ms);
                });
            } catch {
                // Ignore views that are closing.
            }
        });
    }
}

module.exports = {
    ViewManager
};
