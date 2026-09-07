const fs = require('fs');
const path = require('path');

/**
 * Seizia is free: every feature below is on for everyone, so the UI gates
 * never fire. The `pro/` module seam is kept in place so a paid tier could be
 * reintroduced by tightening these values, but nothing is gated today.
 */
const PRO_MODULE_DIR = path.join(__dirname, '..', '..', 'pro');

const FREE_FEATURES = {
    isPro: false,
    maxTabs: Number.POSITIVE_INFINITY,
    askAll: true,
    splitView: true,
    myPrompts: true,
    checkoutUrl: process.env.SEIZIA_CHECKOUT_URL || 'https://github.com/Cypher1984GIT/Seizia'
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
