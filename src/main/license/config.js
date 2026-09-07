/**
 * Polar license settings for Seizia Pro.
 * Fill these in once the Polar product + License Keys benefit exist.
 * Env vars override the defaults so CI/local can inject secrets without editing.
 */
module.exports = {
    organizationId: process.env.SEIZIA_POLAR_ORG_ID || '',
    benefitId: process.env.SEIZIA_POLAR_BENEFIT_ID || '',
    checkoutUrl: process.env.SEIZIA_POLAR_CHECKOUT_URL || 'https://polar.sh/',
    apiBase: 'https://api.polar.sh/v1/customer-portal/license-keys',
    /** Keep Pro available offline for this long after a successful validate. */
    offlineGraceMs: 14 * 24 * 60 * 60 * 1000,
    maxTabsFree: 3,
    /**
     * Unpackaged-only Pro unlock for local testing. Empty by default so no
     * usable key ships in the source: export SEIZIA_DEV_PRO_KEY to enable it.
     */
    devKey: process.env.SEIZIA_DEV_PRO_KEY || ''
};
