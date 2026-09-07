const { shell } = require('electron');

const SPELLCHECK_LANGUAGES = ['es-ES', 'en-US'];
const ALLOWED_PERMISSIONS = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'media',
    'fullscreen',
    'pointerLock'
]);

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

function createPermissionHandler() {
    return (_webContents, permission, callback) => {
        callback(ALLOWED_PERMISSIONS.has(permission));
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
