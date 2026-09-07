
// Minimal Preload Script
// We keep it extremely simple to avoid detection. No complex API mocking.

try {
    // 1. Bot Evasion - Minimal
    // Only mask webdriver presence. Do NOT touch plugins or languages aggressively.
    if (Object.getOwnPropertyDescriptor(navigator, 'webdriver')) {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    }

    // 2. Hardware Keys (WebAuthn)
    // We do NOT mock credentials anymore. Google often detects 'fake' credential APIs.
    // Modern Electron should support WebAuthn or at least fail gracefully.

    // 3. Dark Mode Flash Fix
    // Inject dark background immediately if the user prefers dark mode to prevent white flash
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        const style = document.createElement('style');
        style.id = 'omni-dark-flash-fix';
        style.textContent = 'html { background-color: #000000 !important; }';

        // Inject as early as possible
        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(style);
        } else {
            // Fallback for extremely early execution
            window.addEventListener('DOMContentLoaded', () => {
                document.head.appendChild(style);
            });
        }
    }

} catch (e) {
    console.error('Preload error:', e);
}
