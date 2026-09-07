const os = require('os');
const config = require('./config');

function maskKey(key) {
    const value = String(key || '').trim();
    if (value.length <= 8) {
        return value ? '••••' : null;
    }
    return `${value.slice(0, 4)}…${value.slice(-6)}`;
}

function getFeatures(isPro) {
    return {
        isPro: Boolean(isPro),
        maxTabs: isPro ? Number.POSITIVE_INFINITY : config.maxTabsFree,
        askAll: Boolean(isPro),
        splitView: Boolean(isPro),
        myPrompts: Boolean(isPro),
        checkoutUrl: config.checkoutUrl
    };
}

function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const ts = Date.parse(expiresAt);
    return Number.isFinite(ts) && ts < Date.now();
}

function withinGrace(lastValidatedAt) {
    if (!lastValidatedAt) return false;
    const ts = Date.parse(lastValidatedAt);
    return Number.isFinite(ts) && (Date.now() - ts) <= config.offlineGraceMs;
}

function createLicenseService({ app, store }) {
    function isConfigured() {
        return Boolean(config.organizationId);
    }

    function allowLocalDevKey(key) {
        return !app.isPackaged && Boolean(config.devKey) && key === config.devKey;
    }

    function publicStatus(record, options = {}) {
        const offlineOk = Boolean(options.offlineOk);
        const active = record.status === 'granted'
            && Boolean(record.key)
            && !isExpired(record.expiresAt)
            && (options.forceActive || offlineOk || Boolean(record.lastValidatedAt));

        return {
            configured: isConfigured(),
            isPro: active,
            status: active ? 'granted' : (record.status || 'inactive'),
            displayKey: record.displayKey || maskKey(record.key),
            expiresAt: record.expiresAt,
            lastValidatedAt: record.lastValidatedAt,
            source: record.source,
            features: getFeatures(active),
            checkoutUrl: config.checkoutUrl,
            localDevHint: !app.isPackaged && config.devKey ? 'Dev unlock key is set via SEIZIA_DEV_PRO_KEY.' : null
        };
    }

    async function polarPost(pathname, body) {
        const response = await fetch(`${config.apiBase}${pathname}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body)
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (_) {
            payload = null;
        }

        if (!response.ok) {
            const detail = payload?.detail;
            const message = typeof detail === 'string'
                ? detail
                : (Array.isArray(detail) ? detail.map((d) => d.msg || d).join('; ') : null)
                    || payload?.error
                    || `License request failed (${response.status})`;
            const error = new Error(message);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    function applyPolarPayload(record, key, payload, activationId) {
        const license = payload?.license_key || payload;
        return store.write({
            ...record,
            key,
            displayKey: license.display_key || maskKey(key),
            activationId: activationId || record.activationId || null,
            benefitId: license.benefit_id || record.benefitId || null,
            status: license.status || 'granted',
            expiresAt: license.expires_at || null,
            lastValidatedAt: new Date().toISOString(),
            source: 'polar'
        });
    }

    async function validateRemote(record) {
        const body = {
            key: record.key,
            organization_id: config.organizationId
        };
        if (record.activationId) {
            body.activation_id = record.activationId;
        }

        const payload = await polarPost('/validate', body);
        if (config.benefitId && payload.benefit_id && payload.benefit_id !== config.benefitId) {
            throw new Error('This license is not valid for Seizia Pro.');
        }
        if (payload.status && payload.status !== 'granted') {
            throw new Error(`License status: ${payload.status}`);
        }
        return applyPolarPayload(record, record.key, payload, record.activationId);
    }

    async function activateRemote(key) {
        const record = store.read();
        const label = `Seizia · ${os.hostname()}`.slice(0, 100);
        let activationId = record.activationId;
        let activatePayload = null;

        try {
            activatePayload = await polarPost('/activate', {
                key,
                organization_id: config.organizationId,
                label,
                meta: {
                    app: 'seizia',
                    machine: record.machineId,
                    platform: process.platform
                }
            });
            activationId = activatePayload.id || activationId;
        } catch (error) {
            // Polar returns 403 when the benefit has no activation limit — validate only.
            if (error.status !== 403) {
                throw error;
            }
        }

        const validateBody = {
            key,
            organization_id: config.organizationId
        };
        if (activationId) {
            validateBody.activation_id = activationId;
        }

        const validated = await polarPost('/validate', validateBody);
        if (config.benefitId && validated.benefit_id && validated.benefit_id !== config.benefitId) {
            throw new Error('This license is not valid for Seizia Pro.');
        }
        if (validated.status && validated.status !== 'granted') {
            throw new Error(`License status: ${validated.status}`);
        }

        return applyPolarPayload(record, key, activatePayload || validated, activationId);
    }

    async function getStatus({ refresh = false } = {}) {
        const record = store.read();

        if (!record.key) {
            return publicStatus(record);
        }

        if (record.source === 'local-dev' && allowLocalDevKey(record.key)) {
            return publicStatus(record, { forceActive: true });
        }

        if (!isConfigured()) {
            return publicStatus(record);
        }

        if (!refresh && withinGrace(record.lastValidatedAt) && record.status === 'granted' && !isExpired(record.expiresAt)) {
            return publicStatus(record, { forceActive: true });
        }

        try {
            const next = await validateRemote(record);
            return publicStatus(next, { forceActive: true });
        } catch (error) {
            if (record.status === 'granted' && withinGrace(record.lastValidatedAt) && !isExpired(record.expiresAt)) {
                return {
                    ...publicStatus(record, { offlineOk: true, forceActive: true }),
                    warning: 'Using offline Pro access. Reconnect to re-validate.'
                };
            }
            store.write({
                ...record,
                status: 'inactive'
            });
            return {
                ...publicStatus(store.read()),
                error: error.message || 'License validation failed'
            };
        }
    }

    async function activate(rawKey) {
        const key = String(rawKey || '').trim();
        if (!key) {
            return { ok: false, error: 'Paste a license key first.', ...await getStatus() };
        }

        if (allowLocalDevKey(key)) {
            const record = store.write({
                ...store.read(),
                key,
                displayKey: maskKey(key),
                activationId: null,
                benefitId: null,
                status: 'granted',
                expiresAt: null,
                lastValidatedAt: new Date().toISOString(),
                source: 'local-dev'
            });
            return { ok: true, ...publicStatus(record, { forceActive: true }) };
        }

        if (!isConfigured()) {
            return {
                ok: false,
                error: 'Polar is not configured yet. Set SEIZIA_POLAR_ORG_ID (and checkout URL) before activating real keys.',
                ...await getStatus()
            };
        }

        try {
            const record = await activateRemote(key);
            return { ok: true, ...publicStatus(record, { forceActive: true }) };
        } catch (error) {
            return {
                ok: false,
                error: error.message || 'Could not activate this license.',
                ...await getStatus()
            };
        }
    }

    async function clear() {
        store.clear();
        return { ok: true, ...await getStatus() };
    }

    return {
        getStatus,
        activate,
        clear,
        getFeatures: async () => (await getStatus()).features
    };
}

module.exports = {
    createLicenseService,
    getFeatures
};
