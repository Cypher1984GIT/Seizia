const fs = require('fs');
const path = require('path');

const MAX_PROMPTS = 500;
const MAX_TITLE = 200;
const MAX_BODY = 20000;
const MAX_CATEGORY = 40;
const MAX_CATEGORIES = 80;
const STORE_VERSION = 3;
const BUILTIN_CATEGORIES = ['Writing', 'Code', 'Analysis', 'Study', 'Work', 'Creative'];
const DEFAULT_CATEGORY = 'Uncategorized';

function sanitizeCategory(value) {
    const name = String(value || '').trim().slice(0, MAX_CATEGORY);
    return name || null;
}

function sanitizePrompt(prompt, fallback = DEFAULT_CATEGORY) {
    if (!prompt || typeof prompt !== 'object') {
        return null;
    }

    const title = String(prompt.title || '').trim().slice(0, MAX_TITLE);
    const body = String(prompt.body || '').trim().slice(0, MAX_BODY);
    if (!title || !body) {
        return null;
    }

    return {
        id: String(prompt.id || `user-${Date.now()}`).slice(0, 80),
        title,
        category: sanitizeCategory(prompt.category) || fallback,
        body,
        createdAt: Number(prompt.createdAt) || Date.now(),
        updatedAt: Number(prompt.updatedAt) || Date.now()
    };
}

function uniqueCategories(list) {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
        const name = sanitizeCategory(item);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(name);
    });
    return result.slice(0, MAX_CATEGORIES);
}

function ensureDefaultCategory(list) {
    const result = uniqueCategories(list).filter((name) => name.toLowerCase() !== DEFAULT_CATEGORY.toLowerCase());
    result.unshift(DEFAULT_CATEGORY);
    return result.slice(0, MAX_CATEGORIES);
}

function identityCatalogMap() {
    const map = {};
    BUILTIN_CATEGORIES.forEach((name) => {
        map[name] = name;
    });
    return map;
}

function sanitizeCatalogMap(map) {
    const result = identityCatalogMap();
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        return result;
    }
    Object.keys(map).forEach((key) => {
        const from = sanitizeCategory(key);
        const to = sanitizeCategory(map[key]);
        if (from && to) result[from] = to;
    });
    return result;
}

function emptyStore() {
    return {
        prompts: [],
        categories: ensureDefaultCategory(BUILTIN_CATEGORIES),
        catalogMap: identityCatalogMap()
    };
}

function createPromptStore(app) {
    function storePath() {
        return path.join(app.getPath('userData'), 'prompts-db.json');
    }

    function read() {
        try {
            const filePath = storePath();
            if (!fs.existsSync(filePath)) {
                return emptyStore();
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const version = Number(data.version) || 0;
            const rawPrompts = Array.isArray(data) ? data : (Array.isArray(data.prompts) ? data.prompts : []);
            let categories = ensureDefaultCategory(Array.isArray(data) ? [] : data.categories);
            let catalogMap = sanitizeCatalogMap(Array.isArray(data) ? {} : data.catalogMap);

            if (version < STORE_VERSION) {
                categories = ensureDefaultCategory([...BUILTIN_CATEGORIES, ...categories]);
                catalogMap = sanitizeCatalogMap(catalogMap);
            }
            if (!categories.length) {
                categories = ensureDefaultCategory(BUILTIN_CATEGORIES);
            }

            const fallback = DEFAULT_CATEGORY;
            const prompts = rawPrompts.map((prompt) => sanitizePrompt(prompt, fallback)).filter(Boolean);
            return { prompts, categories, catalogMap };
        } catch (error) {
            console.error('Failed to load prompts:', error);
            return emptyStore();
        }
    }

    function write(payload) {
        const current = read();
        const incomingPrompts = Array.isArray(payload) ? payload : payload?.prompts;
        const incomingCategories = Array.isArray(payload) ? current.categories : payload?.categories;
        const incomingMap = Array.isArray(payload) ? current.catalogMap : payload?.catalogMap;
        const categories = ensureDefaultCategory(
            uniqueCategories(incomingCategories).length
                ? incomingCategories
                : BUILTIN_CATEGORIES
        );
        const fallback = DEFAULT_CATEGORY;
        const prompts = (Array.isArray(incomingPrompts) ? incomingPrompts : [])
            .map((prompt) => sanitizePrompt(prompt, fallback))
            .filter(Boolean)
            .slice(0, MAX_PROMPTS);
        const catalogMap = sanitizeCatalogMap(incomingMap);

        const filePath = storePath();
        fs.writeFileSync(filePath, JSON.stringify({ version: STORE_VERSION, prompts, categories, catalogMap }, null, 2));
        return { prompts, categories, catalogMap };
    }

    return {
        read,
        write
    };
}

module.exports = {
    createPromptStore
};
