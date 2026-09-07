const { shell, dialog, BrowserWindow } = require('electron');

const SPELLCHECK_LANGUAGES = ['es-ES', 'en-US'];

// Granted without asking: none of these reach hardware or stored credentials.
const AUTO_ALLOWED_PERMISSIONS = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
    'pointerLock'
]);

// Camera and microphone are asked for instead, once per origin and device, and
// the answer is remembered for the rest of the run. The map lives at module
// scope so opening a second tab on the same site does not ask again.
const mediaDecisions = new Map();

// Domains whose security headers must stay intact (auth, captchas, embeds).
const PRESERVE_SECURITY_HEADERS_FOR = [
    'google.com',
    'accounts.google.com',
    'youtube.com',
    'gstatic.com',
    'cloudflare.com',
    'cloudflareinsights.com',
    'turnstile.com',
    'poe.com'
];

function deleteHeaderCaseInsensitive(headers, name) {
    Object.keys(headers).forEach((key) => {
        if (key.toLowerCase() === name) {
            delete headers[key];
        }
    });
}

function shouldPreserveSecurityHeaders(urlString) {
    const url = (urlString || '').toLowerCase();
    return PRESERVE_SECURITY_HEADERS_FOR.some((domain) => url.includes(domain));
}

function configureGlobalWebContents(app) {
    const initializedSessions = new WeakSet();

    app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

    app.on('web-contents-created', (_event, contents) => {
        const originalUserAgent = contents.getUserAgent();
        const cleanUserAgent = originalUserAgent.replace(/Electron\/\S+\s/, '');
        contents.setUserAgent(cleanUserAgent);

        try {
            contents.session.setSpellCheckerLanguages(SPELLCHECK_LANGUAGES);
        } catch (error) {
            console.error('Failed to set spellchecker languages:', error);
        }

        if (!initializedSessions.has(contents.session)) {
            initializedSessions.add(contents.session);
            contents.session.webRequest.onHeadersReceived((details, callback) => {
                const responseHeaders = details.responseHeaders || {};

                // Never strip CORP/COOP/CSP: removing them breaks Cloudflare Turnstile
                // (ERR_BLOCKED_BY_RESPONSE) on sites like Poe.
                if (!shouldPreserveSecurityHeaders(details.url || '')) {
                    deleteHeaderCaseInsensitive(responseHeaders, 'x-frame-options');
                }

                callback({ cancel: false, responseHeaders });
            });
        }

        contents.on('will-navigate', (event, targetUrl) => {
            if (contents.getType() === 'window' && /^https?:\/\//.test(targetUrl)) {
                event.preventDefault();
                shell.openExternal(targetUrl).catch(() => {});
            }
        });
    });
}

function describeMediaTypes(mediaTypes) {
    const wantsAudio = mediaTypes.includes('audio');
    const wantsVideo = mediaTypes.includes('video');

    if (wantsAudio && wantsVideo) {
        return 'microphone and camera';
    }

    return wantsVideo ? 'camera' : 'microphone';
}

function describeRequestOrigin(details, webContents) {
    const candidate = (details && (details.securityOrigin || details.requestingUrl))
        || (webContents && !webContents.isDestroyed() && webContents.getURL())
        || '';

    try {
        return new URL(candidate).origin;
    } catch {
        return candidate || 'This site';
    }
}

function createPermissionHandler() {
    return (webContents, permission, callback, details) => {
        if (AUTO_ALLOWED_PERMISSIONS.has(permission)) {
            callback(true);
            return;
        }

        if (permission !== 'media') {
            callback(false);
            return;
        }

        const mediaTypes = (details && details.mediaTypes) || [];

        // A media request that names no device cannot be described to the user.
        if (!mediaTypes.length) {
            callback(false);
            return;
        }

        const origin = describeRequestOrigin(details, webContents);
        const device = describeMediaTypes(mediaTypes);
        const decisionKey = `${origin}|${device}`;

        if (mediaDecisions.has(decisionKey)) {
            callback(mediaDecisions.get(decisionKey));
            return;
        }

        const options = {
            type: 'question',
            buttons: ['Block', 'Allow'],
            defaultId: 0,
            cancelId: 0,
            title: 'Permission request',
            message: `Allow ${origin} to use your ${device}?`,
            detail: 'Seizia remembers this choice until you quit the app.'
        };

        const parent = BrowserWindow.getFocusedWindow();
        const ask = parent
            ? dialog.showMessageBox(parent, options)
            : dialog.showMessageBox(options);

        ask.then(({ response }) => {
            const granted = response === 1;
            mediaDecisions.set(decisionKey, granted);
            callback(granted);
        }).catch((error) => {
            console.error('Failed to ask for media permission:', error);
            callback(false);
        });
    };
}

function isSafeExternalUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

module.exports = {
    SPELLCHECK_LANGUAGES,
    configureGlobalWebContents,
    createPermissionHandler,
    isSafeExternalUrl
};
