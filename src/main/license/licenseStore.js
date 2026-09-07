const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_VERSION = 1;

function emptyStore() {
    return {
        version: STORE_VERSION,
        key: null,
        displayKey: null,
        activationId: null,
        benefitId: null,
        status: 'inactive',
        expiresAt: null,
        lastValidatedAt: null,
        machineId: crypto.randomUUID(),
        source: null
    };
}

function sanitize(data) {
    const base = emptyStore();
    if (!data || typeof data !== 'object') {
        return base;
    }

    return {
        version: STORE_VERSION,
        key: typeof data.key === 'string' && data.key.trim() ? data.key.trim().slice(0, 200) : null,
        displayKey: typeof data.displayKey === 'string' ? data.displayKey.slice(0, 80) : null,
        activationId: typeof data.activationId === 'string' ? data.activationId.slice(0, 80) : null,
        benefitId: typeof data.benefitId === 'string' ? data.benefitId.slice(0, 80) : null,
        status: typeof data.status === 'string' ? data.status.slice(0, 40) : 'inactive',
        expiresAt: typeof data.expiresAt === 'string' || data.expiresAt === null ? data.expiresAt : null,
        lastValidatedAt: typeof data.lastValidatedAt === 'string' || data.lastValidatedAt === null
            ? data.lastValidatedAt
            : null,
        machineId: typeof data.machineId === 'string' && data.machineId
            ? data.machineId.slice(0, 80)
            : crypto.randomUUID(),
        source: typeof data.source === 'string' ? data.source.slice(0, 40) : null
    };
}

function createLicenseStore(app) {
    function storePath() {
        return path.join(app.getPath('userData'), 'license.json');
    }

    function read() {
        try {
            const filePath = storePath();
            if (!fs.existsSync(filePath)) {
                const fresh = emptyStore();
                write(fresh);
                return fresh;
            }
            return sanitize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } catch (error) {
            console.error('Failed to load license store:', error);
            return emptyStore();
        }
    }

    function write(data) {
        const next = sanitize(data);
        fs.writeFileSync(storePath(), JSON.stringify(next, null, 2));
        return next;
    }

    function clear() {
        const current = read();
        return write({
            ...emptyStore(),
            machineId: current.machineId
        });
    }

    return { read, write, clear };
}

module.exports = {
    createLicenseStore
};
