const fs = require('fs');
const path = require('path');

/**
 * Seizia Pro ships as a drop-in module in `pro/`, which is not part of this
 * repository. Without it the app runs as the free tier: the limits below are
 * the ones the UI enforces.
 */
const PRO_MODULE_DIR = path.join(__dirname, '..', '..', 'pro');

const FREE_FEATURES = {
    isPro: false,
    maxTabs: 3,
    askAll: false,
    splitView: false,
    myPrompts: false,
    checkoutUrl: process.env.SEIZIA_CHECKOUT_URL || 'https://github.com/Cypher1984GIT/Seizia#license'
};

function freeStatus(extra = {}) {
    return {
        configured: false,
        isPro: false,
        status: 'unavailable',
        displayKey: null,
        expiresAt: null,
        lastValidatedAt: null,
        source: null,
        features: { ...FREE_FEATURES },
        checkoutUrl: FREE_FEATURES.checkoutUrl,
        localDevHint: null,
        ...extra
    };
}

function createFreeLayer() {
    return {
        getStatus: async () => freeStatus(),
        activate: async () => ({
            ok: false,
            ...freeStatus({
                error: 'This build has no licensing module. Download the official Seizia release to activate a key.'
            })
        }),
        clear: async () => ({ ok: true, ...freeStatus() }),
        getFeatures: async () => ({ ...FREE_FEATURES })
    };
}

function createLicenseLayer({ app }) {
    if (!fs.existsSync(path.join(PRO_MODULE_DIR, 'index.js'))) {
        return createFreeLayer();
    }

    try {
        const { createProLicenseLayer } = require(PRO_MODULE_DIR);
        return createProLicenseLayer({ app, freeFeatures: { ...FREE_FEATURES } });
    } catch (error) {
        console.error('Failed to load the Seizia Pro module, falling back to free:', error);
        return createFreeLayer();
    }
}

module.exports = {
    createLicenseLayer,
    FREE_FEATURES
};
