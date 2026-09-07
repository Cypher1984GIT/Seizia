try {
    const { ipcRenderer } = require('electron');
    const themeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const FLASH_STYLE_ID = 'omni-theme-flash-fix';

    // Explicit light/dark only — never "system".
    // Blackbox (next-themes) treats broken Electron matchMedia as dark when theme=system.
    // Qwen ignores prefers-color-scheme updates when theme is already set wrong on first paint.
    const MANAGED_SITES = {
        'gemini.google.com': { darkBg: '#131314', lightBg: '#ffffff', metaThemeColor: true },
        'chat.qwen.ai': { darkBg: '#171717', lightBg: '#ffffff', metaThemeColor: true },
        'chat.z.ai': { darkBg: '#09090b', lightBg: '#ffffff', metaThemeColor: false },
        'app.blackbox.ai': { darkBg: '#000000', lightBg: '#ffffff', metaThemeColor: false },
        'www.blackbox.ai': { darkBg: '#000000', lightBg: '#ffffff', metaThemeColor: false },
        'blackbox.ai': { darkBg: '#000000', lightBg: '#ffffff', metaThemeColor: false }
    };

    let driftObserver = null;
    let driftTimeout = null;

    function getCurrentTheme() {
        try {
            const fromOmni = ipcRenderer.sendSync('get-omni-theme');
            if (fromOmni === 'light' || fromOmni === 'dark') {
                return fromOmni;
            }
        } catch (_) {}
        return themeQuery && themeQuery.matches ? 'dark' : 'light';
    }

    const originalMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
    const schemeMediaLists = [];
    if (originalMatchMedia) {
        window.matchMedia = (query) => {
            const mql = originalMatchMedia(query);
            if (!query || !String(query).includes('prefers-color-scheme')) {
                return mql;
            }
            const wantsDark = String(query).includes('dark');
            if (!schemeMediaLists.includes(mql)) {
                schemeMediaLists.push(mql);
            }
            return new Proxy(mql, {
                get(target, prop, receiver) {
                    if (prop === 'matches') {
                        const theme = getCurrentTheme();
                        return wantsDark ? theme === 'dark' : theme === 'light';
                    }
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
        };
    }

    function getFlashBg(theme) {
        return theme === 'dark' ? '#000000' : '#ffffff';
    }

    function getManagedConfig() {
        const host = window.location && window.location.hostname;
        return host ? MANAGED_SITES[host] || null : null;
    }

    function ensureFlashStyle(theme) {
        let style = document.getElementById(FLASH_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = FLASH_STYLE_ID;
            const target = document.head || document.documentElement;
            if (target) {
                target.appendChild(style);
            }
        }
        style.textContent = `html { background-color: ${getFlashBg(theme)} !important; }`;
        return style;
    }

    function removeFlashStyle() {
        const style = document.getElementById(FLASH_STYLE_ID);
        if (style) {
            style.remove();
        }
    }

    function applyManagedSiteTheme() {
        const config = getManagedConfig();
        if (!config) {
            return;
        }

        const resolved = getCurrentTheme();
        const opposite = resolved === 'dark' ? 'light' : 'dark';
        const bg = resolved === 'dark' ? config.darkBg : config.lightBg;

        let previous = null;
        try {
            previous = localStorage.getItem('theme');
            if (previous !== resolved) {
                localStorage.setItem('theme', resolved);
            }
            sessionStorage.setItem('theme', resolved);
        } catch (_) {}

        const root = document.documentElement;
        if (root) {
            root.classList.remove('light', 'dark');
            root.classList.add(resolved);
            root.style.colorScheme = resolved;
            root.style.backgroundColor = bg;
            root.setAttribute('data-theme', resolved);
            root.setAttribute('data-color-mode', resolved);
        }

        const body = document.body;
        if (body) {
            body.classList.remove('light', 'dark');
            body.classList.add(resolved);
            body.style.backgroundColor = bg;
        }

        if (config.metaThemeColor) {
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
                meta.setAttribute('content', bg);
            }
        }

        if (previous === resolved) {
            return;
        }

        try {
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'theme',
                newValue: resolved,
                oldValue: opposite,
                storageArea: localStorage
            }));
            window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: resolved } }));
            document.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: resolved } }));
        } catch (_) {}
    }

    function watchThemeDrift() {
        if (!getManagedConfig() || !document.documentElement) {
            return;
        }

        if (driftObserver) {
            driftObserver.disconnect();
        }
        if (driftTimeout) {
            clearTimeout(driftTimeout);
        }

        const root = document.documentElement;
        driftObserver = new MutationObserver(() => {
            const wanted = getCurrentTheme();
            if (!root.classList.contains(wanted) || root.classList.contains(wanted === 'dark' ? 'light' : 'dark')) {
                applyManagedSiteTheme();
            }
        });
        driftObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
        driftTimeout = setTimeout(() => {
            if (driftObserver) {
                driftObserver.disconnect();
                driftObserver = null;
            }
        }, 8000);
    }

    if (Object.getOwnPropertyDescriptor(navigator, 'webdriver')) {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    }

    function applyColorScheme(theme) {
        const resolved = theme === 'light' ? 'light' : 'dark';
        const root = document.documentElement;
        if (root) {
            root.style.colorScheme = resolved;
        }
        ensureFlashStyle(resolved);
        applyManagedSiteTheme();
    }

    function notifyPrefersColorScheme(theme) {
        const matchesDark = theme === 'dark';
        const lists = schemeMediaLists.slice();
        if (themeQuery && !lists.includes(themeQuery)) {
            lists.push(themeQuery);
        }
        lists.forEach((mql) => {
            try {
                mql.dispatchEvent(new MediaQueryListEvent('change', {
                    matches: matchesDark,
                    media: mql.media
                }));
            } catch (_) {
                try {
                    mql.dispatchEvent(new Event('change'));
                } catch (__) {}
            }
        });
    }

    const initialTheme = getCurrentTheme();
    ensureFlashStyle(initialTheme);
    applyManagedSiteTheme();

    window.addEventListener('DOMContentLoaded', () => {
        applyManagedSiteTheme();
        watchThemeDrift();
        [50, 200, 600, 1500, 3000].forEach((ms) => {
            setTimeout(applyManagedSiteTheme, ms);
        });
        setTimeout(removeFlashStyle, window.location.hostname === 'gemini.google.com' ? 2500 : 900);
    });

    ipcRenderer.on('omni-theme-changed', (_event, theme) => {
        const resolved = theme === 'light' ? 'light' : 'dark';
        applyColorScheme(resolved);
        notifyPrefersColorScheme(resolved);
        watchThemeDrift();
        setTimeout(removeFlashStyle, 800);
    });

    if (themeQuery) {
        const handleThemeChange = () => {
            applyColorScheme(getCurrentTheme());
            watchThemeDrift();
            setTimeout(removeFlashStyle, 600);
        };
        if (typeof themeQuery.addEventListener === 'function') {
            themeQuery.addEventListener('change', handleThemeChange);
        } else if (typeof themeQuery.addListener === 'function') {
            themeQuery.addListener(handleThemeChange);
        }
    }
} catch (error) {
    console.error('Preload error:', error);
}
