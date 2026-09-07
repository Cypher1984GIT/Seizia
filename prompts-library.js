const USER_PROMPTS_KEY = 'seizia-user-prompts';

let promptsTab = 'library';
let promptsEditingId = null;
let userPromptsCache = [];
let userCategoriesCache = [];
let catalogMapCache = {};
let promptsLoadPromise = null;
const BUILTIN_CATEGORIES = typeof PROMPT_CATEGORIES !== 'undefined' ? PROMPT_CATEGORIES : ['Writing', 'Code', 'Analysis', 'Study', 'Work', 'Creative'];
const FALLBACK_CATEGORY = 'Uncategorized';
const NEW_CATEGORY_VALUE = '__new__';

function loadLegacyUserPrompts() {
    try {
        const parsed = JSON.parse(localStorage.getItem(USER_PROMPTS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function loadUserPrompts() {
    return userPromptsCache;
}

function normalizeCategoryName(value) {
    return String(value || '').trim().slice(0, 40);
}

function normalizeCategories(list) {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
        const name = normalizeCategoryName(item);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(name);
    });
    return result;
}

function isLockedCategory(name) {
    return normalizeCategoryName(name).toLowerCase() === FALLBACK_CATEGORY.toLowerCase();
}

function ensureDefaultCategory(list) {
    const result = normalizeCategories(list).filter((name) => !isLockedCategory(name));
    result.unshift(FALLBACK_CATEGORY);
    return result;
}

function identityCatalogMap() {
    const map = {};
    BUILTIN_CATEGORIES.forEach((name) => {
        map[name] = name;
    });
    return map;
}

function normalizeCatalogMap(map) {
    const result = identityCatalogMap();
    if (map && typeof map === 'object' && !Array.isArray(map)) {
        Object.keys(map).forEach((key) => {
            const from = normalizeCategoryName(key);
            const to = normalizeCategoryName(map[key]);
            if (from && to) result[from] = to;
        });
    }
    const valid = new Set(userCategoriesCache.map((name) => name.toLowerCase()));
    const fallback = fallbackCategory();
    Object.keys(result).forEach((key) => {
        if (!valid.has(String(result[key]).toLowerCase())) {
            result[key] = fallback;
        }
    });
    return result;
}

function fallbackCategory() {
    return FALLBACK_CATEGORY;
}

function originalBuiltinName(name) {
    const key = normalizeCategoryName(name).toLowerCase();
    return BUILTIN_CATEGORIES.find((item) => item.toLowerCase() === key) || '';
}

function catalogDisplayCategory(original) {
    const name = normalizeCategoryName(original);
    if (!name) return fallbackCategory();
    const mapped = Object.keys(catalogMapCache).find((key) => key.toLowerCase() === name.toLowerCase());
    if (mapped) return catalogMapCache[mapped];
    return findCategory(name) || fallbackCategory();
}

function allCategories() {
    const seen = new Set();
    const result = [];
    const seed = userCategoriesCache.length ? userCategoriesCache : BUILTIN_CATEGORIES;
    [FALLBACK_CATEGORY, ...seed, ...userPromptsCache.map((prompt) => prompt.category)].forEach((item) => {
        const name = isLockedCategory(item) ? FALLBACK_CATEGORY : normalizeCategoryName(item);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(name);
    });
    return result;
}

function findCategory(name) {
    const key = normalizeCategoryName(name).toLowerCase();
    return allCategories().find((item) => item.toLowerCase() === key) || '';
}

function persistUserPrompts(prompts, categories = userCategoriesCache, catalogMap = catalogMapCache) {
    userPromptsCache = Array.isArray(prompts) ? prompts : [];
    userCategoriesCache = ensureDefaultCategory(categories);
    catalogMapCache = normalizeCatalogMap(catalogMap);
    try {
        localStorage.setItem(USER_PROMPTS_KEY, JSON.stringify(userPromptsCache));
    } catch {
        // Ignore quota errors; the file store is the source of truth.
    }
    if (typeof omni.invoke === 'function') {
        return omni.invoke('prompts-set', {
            prompts: userPromptsCache,
            categories: userCategoriesCache,
            catalogMap: catalogMapCache
        }).catch((error) => {
            console.error('Failed to save prompts:', error);
        });
    }
    return Promise.resolve({
        prompts: userPromptsCache,
        categories: userCategoriesCache,
        catalogMap: catalogMapCache
    });
}

function saveUserPrompts(prompts) {
    return persistUserPrompts(prompts);
}

function ensureUserPromptsLoaded() {
    if (promptsLoadPromise) {
        return promptsLoadPromise;
    }

    promptsLoadPromise = (async () => {
        let fromFile = [];
        let fromCats = [];
        let fromMap = {};
        if (typeof omni.invoke === 'function') {
            try {
                const loaded = await omni.invoke('prompts-get');
                if (Array.isArray(loaded)) {
                    fromFile = loaded;
                } else if (loaded && typeof loaded === 'object') {
                    fromFile = Array.isArray(loaded.prompts) ? loaded.prompts : [];
                    fromCats = Array.isArray(loaded.categories) ? loaded.categories : [];
                    fromMap = loaded.catalogMap && typeof loaded.catalogMap === 'object' ? loaded.catalogMap : {};
                }
            } catch (error) {
                console.error('Failed to load prompts:', error);
            }
        }

        const legacy = loadLegacyUserPrompts();
        if (fromFile.length) {
            userPromptsCache = fromFile;
            userCategoriesCache = ensureDefaultCategory(fromCats.length ? fromCats : [
                ...BUILTIN_CATEGORIES,
                ...fromFile.map((prompt) => prompt.category)
            ]);
            catalogMapCache = normalizeCatalogMap(fromMap);
        } else if (legacy.length) {
            userPromptsCache = legacy;
            userCategoriesCache = ensureDefaultCategory(fromCats.length ? fromCats : [
                ...BUILTIN_CATEGORIES,
                ...legacy.map((prompt) => prompt.category)
            ]);
            catalogMapCache = normalizeCatalogMap(fromMap);
            await persistUserPrompts(legacy, userCategoriesCache, catalogMapCache);
        } else {
            userPromptsCache = fromFile;
            userCategoriesCache = ensureDefaultCategory(fromCats.length ? fromCats : BUILTIN_CATEGORIES);
            catalogMapCache = normalizeCatalogMap(fromMap);
        }
        if (!userCategoriesCache.length) {
            userCategoriesCache = ensureDefaultCategory(BUILTIN_CATEGORIES);
            catalogMapCache = normalizeCatalogMap(fromMap);
        }
        fillPromptCategories();
        return userPromptsCache;
    })();

    return promptsLoadPromise;
}

function isPromptsModalOpen() {
    const modal = document.getElementById('prompts-modal');
    return modal && !modal.classList.contains('hidden');
}

function openPromptsModal(options = {}) {
    closeMoreMenu({ restoreView: false });
    omni.send('hide-current-view');

    if ((options.tab === 'mine' || options.tab === 'categories' || options.draft) && !appFeatures.myPrompts) {
        openLicenseModal('My prompts is a Pro feature. Paste your license to unlock it.');
        return;
    }

    if (options.tab) promptsTab = options.tab;
    hidePromptEditor();
    hidePromptChooser();
    setPromptsTab(promptsTab);

    const modal = document.getElementById('prompts-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const search = document.getElementById('prompts-search');
    if (search) search.value = options.query || '';

    if (promptsTab !== 'categories') renderPromptsLibrary();
    ensureUserPromptsLoaded().then(() => {
        if (!isPromptsModalOpen()) return;
        if (promptsTab === 'categories') renderCategoryManager();
        else renderPromptsLibrary();
    });

    if (options.draft) {
        promptsTab = 'mine';
        setPromptsTab('mine');
        showPromptEditor({
            title: options.draft.title || '',
            category: options.draft.category || fallbackCategory(),
            body: options.draft.body || ''
        });
    } else if (promptsTab !== 'categories') {
        setTimeout(() => document.getElementById('prompts-search')?.focus(), 80);
    } else {
        setTimeout(() => document.getElementById('prompts-category-add-name')?.focus(), 80);
    }
}

function closePromptsModal({ restoreView = true } = {}) {
    const modal = document.getElementById('prompts-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    hidePromptEditor();
    hidePromptChooser();
    if (restoreView) restoreViewIfIdle();
}

function isPromptEditorOpen() {
    const editor = document.getElementById('prompt-editor');
    return editor && !editor.classList.contains('hidden');
}

function syncPromptsMainView() {
    const overlay = isPromptEditorOpen() || isPromptChooserOpen();
    const nav = document.getElementById('prompts-nav');
    const browse = document.getElementById('prompts-browse');
    const cats = document.getElementById('prompts-categories-panel');
    nav?.classList.toggle('hidden', overlay);
    if (overlay) {
        browse?.classList.add('hidden');
        cats?.classList.add('hidden');
        return;
    }
    const isCats = promptsTab === 'categories';
    browse?.classList.toggle('hidden', isCats);
    cats?.classList.toggle('hidden', !isCats);
}

function setPromptsTab(tab) {
    promptsTab = tab;
    const active = 'bg-seizia text-white border-seizia';
    const idle = 'bg-transparent text-zinc-600 dark:text-zinc-400 border-transparent';
    const buttons = [
        ['prompts-tab-library', 'library'],
        ['prompts-tab-mine', 'mine'],
        ['prompts-tab-categories', 'categories']
    ];
    buttons.forEach(([id, name]) => {
        const btn = document.getElementById(id);
        if (btn) btn.className = `px-3 py-1.5 rounded-md text-xs font-bold border ${tab === name ? active : idle}`;
    });

    const newBtn = document.getElementById('prompts-new-btn');
    if (newBtn) newBtn.classList.toggle('hidden', tab !== 'mine');

    if (tab === 'categories') {
        renderCategoryManager();
    } else {
        renderPromptsLibrary();
    }
    syncPromptsMainView();
}

function currentPromptCollection() {
    if (promptsTab === 'mine') return loadUserPrompts();
    const catalog = typeof PROMPT_CATALOG !== 'undefined' ? PROMPT_CATALOG : [];
    return catalog.map((prompt) => ({
        ...prompt,
        category: catalogDisplayCategory(prompt.category)
    }));
}

function renderPromptsLibrary() {
    const list = document.getElementById('prompts-list');
    const empty = document.getElementById('prompts-empty');
    const categoryFilter = document.getElementById('prompts-category');
    const search = document.getElementById('prompts-search');
    if (!list) return;

    const query = (search?.value || '').trim().toLowerCase();
    const category = categoryFilter?.value || 'all';
    const items = currentPromptCollection().filter((prompt) => {
        const matchesCategory = category === 'all' || prompt.category === category;
        const haystack = `${prompt.title} ${prompt.category} ${prompt.body}`.toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        return matchesCategory && matchesQuery;
    });

    list.innerHTML = '';
    if (!items.length) {
        empty.classList.remove('hidden');
        const emptyText = document.getElementById('prompts-empty-text');
        if (emptyText) {
            emptyText.textContent = promptsTab === 'mine'
                ? 'You have no saved prompts yet.'
                : 'No prompts match that filter.';
        } else {
            empty.textContent = promptsTab === 'mine'
                ? 'You have no saved prompts yet.'
                : 'No prompts match that filter.';
        }
        const emptyAdd = document.getElementById('prompts-empty-new-btn');
        if (emptyAdd) emptyAdd.classList.toggle('hidden', promptsTab !== 'mine');
        return;
    }

    empty.classList.add('hidden');
    items.forEach((prompt) => list.appendChild(createPromptCard(prompt)));
}

function promptCardPreview(body) {
    const flat = String(body || '').replace(/\s+/g, ' ').trim();
    if (!flat) return '';
    const maxChars = 108;
    const sliced = flat.length > maxChars ? flat.slice(0, maxChars).trim() : flat;
    return `${sliced}…`;
}

function createPromptCard(prompt) {
    const card = document.createElement('article');
    const isMine = promptsTab === 'mine';
    card.className = 'prompt-card p-4 flex flex-col gap-3 w-full';

    const preview = promptCardPreview(prompt.body);

    card.innerHTML = `
        <div class="flex items-start justify-between gap-3 shrink-0">
            <div class="min-w-0 flex-1">
                <h4 class="text-sm font-bold text-zinc-900 dark:text-white truncate">${escapeHtml(prompt.title)}</h4>
                <span class="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-seizia bg-seizia/10 px-1.5 py-0.5 rounded">${escapeHtml(prompt.category)}</span>
            </div>
        </div>
        <div class="prompt-card-excerpt">
            <p class="prompt-card-body">${escapeHtml(preview)}</p>
        </div>
        <div class="flex flex-wrap gap-2 mt-auto shrink-0">
            <button type="button" data-action="copy" class="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700">Copy</button>
            <button type="button" data-action="use" class="px-2.5 py-1 rounded-md text-xs font-bold bg-seizia hover:bg-seizia-hover text-white">Use</button>
            ${isMine
                ? `<button type="button" data-action="edit" class="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700">Edit</button>
                   <button type="button" data-action="delete" class="px-2.5 py-1 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">Delete</button>`
                : `<button type="button" data-action="save-copy" class="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700">Save copy</button>`}
        </div>
    `;

    card.querySelector('[data-action="copy"]').onclick = async () => {
        await copyPromptText(prompt.body);
        const btn = card.querySelector('[data-action="copy"]');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    };
    card.querySelector('[data-action="use"]').onclick = () => usePrompt(prompt.body);
    const editBtn = card.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.onclick = () => showPromptEditor(prompt);
    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn) deleteBtn.onclick = () => deleteUserPrompt(prompt);
    const saveCopyBtn = card.querySelector('[data-action="save-copy"]');
    if (saveCopyBtn) saveCopyBtn.onclick = () => saveCatalogCopy(prompt);

    return card;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function copyPromptText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }
}

let pendingPromptBody = '';
let pendingPromptTarget = 'active';

function hidePromptChooser() {
    pendingPromptBody = '';
    pendingPromptTarget = 'active';
    document.getElementById('prompt-send-chooser')?.classList.add('hidden');
    syncPromptsMainView();
}

function isPromptChooserOpen() {
    const chooser = document.getElementById('prompt-send-chooser');
    return chooser && !chooser.classList.contains('hidden');
}

function setPromptSendTarget(target) {
    pendingPromptTarget = target;
    const activeBtn = document.getElementById('prompt-target-active');
    const allBtn = document.getElementById('prompt-target-all');
    activeBtn?.classList.toggle('prompt-target-selected', target === 'active');
    allBtn?.classList.toggle('prompt-target-selected', target === 'all');
}

function getPromptSendText() {
    return document.getElementById('prompt-send-text')?.value.trim() || '';
}

function sendLibraryPrompt(body, target) {
    closePromptsModal({ restoreView: true });
    omni.send('broadcast-prompt', { text: body, target });
}

function confirmPromptSend() {
    const text = getPromptSendText();
    if (!text) {
        showAlert('Empty prompt', 'Write something before sending it.');
        return;
    }
    sendLibraryPrompt(text, pendingPromptTarget);
}

function showPromptChooser(body) {
    pendingPromptBody = body;
    const tabCount = tabsContainer.children.length;
    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    const activeName = activeBtn?.dataset.name || 'active tab';
    const label = document.getElementById('prompt-send-active-label');
    if (label) label.textContent = `Active AI (${activeName})`;

    const allBtn = document.getElementById('prompt-target-all');
    if (allBtn) allBtn.classList.toggle('hidden', tabCount < 2);

    setPromptSendTarget('active');
    const textArea = document.getElementById('prompt-send-text');
    if (textArea) textArea.value = body;

    document.getElementById('prompt-editor')?.classList.add('hidden');
    document.getElementById('prompt-send-chooser')?.classList.remove('hidden');
    syncPromptsMainView();
    setTimeout(() => {
        textArea?.focus();
        textArea?.setSelectionRange(textArea.value.length, textArea.value.length);
    }, 50);
}

function usePrompt(body) {
    const count = tabsContainer.children.length;
    if (count === 0) {
        copyPromptText(body);
        closePromptsModal({ restoreView: false });
        restoreViewIfIdle();
        showAlert('Copied', 'Open an AI tab first, then paste it there.');
        return;
    }
    showPromptChooser(body);
}

function nextCopyTitle(title) {
    const base = String(title || 'Prompt').trim() || 'Prompt';
    const prompts = loadUserPrompts();
    const names = new Set(prompts.map((prompt) => String(prompt.title || '').trim().toLowerCase()));
    const first = `${base} (copy)`;
    if (!names.has(first.toLowerCase()) && first.toLowerCase() !== base.toLowerCase()) {
        return first;
    }
    let n = 2;
    while (names.has(`${base} (copy ${n})`.toLowerCase())) {
        n += 1;
    }
    return `${base} (copy ${n})`;
}

function saveCatalogCopy(prompt) {
    if (!appFeatures.myPrompts) {
        openLicenseModal('Saving prompts is a Pro feature. Paste your license to unlock it.');
        return;
    }
    const prompts = loadUserPrompts();
    prompts.unshift({
        id: `user-${Date.now()}`,
        title: nextCopyTitle(prompt.title),
        category: prompt.category,
        body: prompt.body,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    saveUserPrompts(prompts);
    promptsTab = 'mine';
    setPromptsTab('mine');
}

function addCustomCategory(name, { persist = true } = {}) {
    const clean = normalizeCategoryName(name);
    if (!clean) return '';
    if (isLockedCategory(clean)) return FALLBACK_CATEGORY;
    const existing = findCategory(clean);
    if (existing) return existing;
    userCategoriesCache = ensureDefaultCategory([...userCategoriesCache, clean]);
    const builtin = originalBuiltinName(clean);
    if (builtin) catalogMapCache[builtin] = clean;
    if (persist) persistUserPrompts(userPromptsCache, userCategoriesCache, catalogMapCache);
    return clean;
}

function remapCategoryName(oldName, newName) {
    const from = String(oldName || '').toLowerCase();
    Object.keys(catalogMapCache).forEach((key) => {
        if (String(catalogMapCache[key]).toLowerCase() === from) {
            catalogMapCache[key] = newName;
        }
    });
}

function renameCategory(oldName, newName) {
    if (isLockedCategory(oldName)) {
        showAlert('Default category', `"${FALLBACK_CATEGORY}" cannot be renamed.`);
        return;
    }
    const next = normalizeCategoryName(newName);
    if (!next) {
        showAlert('Missing name', 'Enter a category name.');
        return;
    }
    if (isLockedCategory(next)) {
        showAlert('Reserved name', `"${FALLBACK_CATEGORY}" is the default category.`);
        return;
    }
    if (next.toLowerCase() !== String(oldName).toLowerCase() && findCategory(next)) {
        showAlert('Already exists', 'That category name is already in use.');
        return;
    }
    userCategoriesCache = (userCategoriesCache.length ? userCategoriesCache : allCategories()).map((item) => (
        item.toLowerCase() === String(oldName).toLowerCase() ? next : item
    ));
    if (!userCategoriesCache.some((item) => item.toLowerCase() === next.toLowerCase())) {
        userCategoriesCache = ensureDefaultCategory([...userCategoriesCache, next]);
    } else {
        userCategoriesCache = ensureDefaultCategory(userCategoriesCache);
    }
    userPromptsCache = userPromptsCache.map((prompt) => (
        prompt.category.toLowerCase() === String(oldName).toLowerCase()
            ? { ...prompt, category: next, updatedAt: Date.now() }
            : prompt
    ));
    remapCategoryName(oldName, next);
    const builtin = originalBuiltinName(next);
    if (builtin) catalogMapCache[builtin] = next;
    persistUserPrompts(userPromptsCache, userCategoriesCache, catalogMapCache);
    fillPromptCategories();
    renderCategoryManager();
    renderPromptsLibrary();
}

function deleteCategory(name) {
    if (isLockedCategory(name)) {
        showAlert('Default category', `"${FALLBACK_CATEGORY}" cannot be deleted.`);
        return;
    }
    const remaining = allCategories().filter((item) => item.toLowerCase() !== String(name).toLowerCase());
    const destination = FALLBACK_CATEGORY;
    const mineCount = userPromptsCache.filter((prompt) => prompt.category.toLowerCase() === String(name).toLowerCase()).length;
    const catalog = typeof PROMPT_CATALOG !== 'undefined' ? PROMPT_CATALOG : [];
    const libraryCount = catalog.filter((prompt) => catalogDisplayCategory(prompt.category).toLowerCase() === String(name).toLowerCase()).length;
    const total = mineCount + libraryCount;
    const detail = total
        ? `${total} prompt${total === 1 ? '' : 's'} will move to ${destination}.`
        : `Prompts in this category will move to ${destination}.`;
    showConfirm({
        title: `Delete "${name}"?`,
        message: detail,
        confirmLabel: 'Delete',
        onConfirm: () => applyCategoryDelete(name, remaining, destination)
    });
}

function applyCategoryDelete(name, remaining, destination) {
    if (isLockedCategory(name)) return;
    userCategoriesCache = ensureDefaultCategory(remaining);
    userPromptsCache = userPromptsCache.map((prompt) => (
        prompt.category.toLowerCase() === String(name).toLowerCase()
            ? { ...prompt, category: destination, updatedAt: Date.now() }
            : prompt
    ));
    remapCategoryName(name, destination);
    persistUserPrompts(userPromptsCache, userCategoriesCache, catalogMapCache);
    fillPromptCategories();
    renderCategoryManager();
    renderPromptsLibrary();
}

function isCategoriesPanelOpen() {
    return promptsTab === 'categories' && !isPromptEditorOpen() && !isPromptChooserOpen();
}

function showCategoriesPanel() {
    hidePromptEditor();
    hidePromptChooser();
    setPromptsTab('categories');
    setTimeout(() => document.getElementById('prompts-category-add-name')?.focus(), 50);
}

function hideCategoriesPanel() {
    if (promptsTab === 'categories' && !isPromptEditorOpen() && !isPromptChooserOpen()) {
        setPromptsTab('mine');
        return;
    }
    syncPromptsMainView();
}

function stopCategoryRowEdit(row) {
    if (!row) return;
    const input = row.querySelector('input');
    const label = row.querySelector('[data-role="label"]');
    const renameBtn = row.querySelector('[data-action="rename"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');
    row.dataset.editing = 'false';
    if (input) {
        input.value = row.dataset.name || '';
        input.classList.add('hidden');
    }
    label?.classList.remove('hidden');
    if (renameBtn) renameBtn.textContent = 'Rename';
    deleteBtn?.classList.remove('hidden');
}

function startCategoryRowEdit(row) {
    if (!row || isLockedCategory(row.dataset.name)) return;
    document.querySelectorAll('#prompts-category-list [data-category-row]').forEach((item) => {
        if (item !== row) stopCategoryRowEdit(item);
    });
    const input = row.querySelector('input');
    const label = row.querySelector('[data-role="label"]');
    const renameBtn = row.querySelector('[data-action="rename"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');
    row.dataset.editing = 'true';
    label?.classList.add('hidden');
    deleteBtn?.classList.add('hidden');
    if (renameBtn) renameBtn.textContent = 'Save';
    if (input) {
        input.value = row.dataset.name || '';
        input.classList.remove('hidden');
        input.focus();
        input.select();
    }
}

function renderCategoryManager() {
    const list = document.getElementById('prompts-category-list');
    if (!list) return;
    list.innerHTML = '';
    allCategories().forEach((name) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 px-3 py-2';
        row.dataset.categoryRow = 'true';
        row.dataset.name = name;
        row.dataset.editing = 'false';
        const locked = isLockedCategory(name);
        row.innerHTML = locked
            ? `<span data-role="label" class="flex-1 h-8 flex items-center text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">${escapeHtml(name)}</span>
               <span class="text-[10px] uppercase tracking-wider text-zinc-400">Default</span>`
            : `<span data-role="label" class="flex-1 h-8 flex items-center text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">${escapeHtml(name)}</span>
               <input type="text" maxlength="40" value="${escapeHtml(name)}" class="hidden flex-1 h-8 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 outline-none">
               <button type="button" data-action="rename" class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">Rename</button>
               <button type="button" data-action="delete" class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Delete</button>`;
        if (!locked) {
            const input = row.querySelector('input');
            row.querySelector('[data-action="rename"]').onclick = () => {
                if (row.dataset.editing === 'true') {
                    renameCategory(name, input.value);
                    return;
                }
                startCategoryRowEdit(row);
            };
            row.querySelector('[data-action="delete"]').onclick = () => deleteCategory(name);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    renameCategory(name, input.value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    stopCategoryRowEdit(row);
                }
            });
        }
        list.appendChild(row);
    });
}

function addCategoryFromPanel() {
    const input = document.getElementById('prompts-category-add-name');
    const name = normalizeCategoryName(input?.value);
    if (!name) {
        showAlert('Missing name', 'Enter a category name.');
        return;
    }
    if (isLockedCategory(name)) {
        showAlert('Reserved name', `"${FALLBACK_CATEGORY}" is the default category.`);
        return;
    }
    if (findCategory(name)) {
        showAlert('Already exists', 'That category name is already in use.');
        return;
    }
    addCustomCategory(name);
    if (input) input.value = '';
    fillPromptCategories();
    renderCategoryManager();
}

function deleteUserPrompt(prompt) {
    const id = typeof prompt === 'string' ? prompt : prompt?.id;
    if (!id) return;
    const title = typeof prompt === 'object' && prompt.title
        ? prompt.title
        : (loadUserPrompts().find((item) => item.id === id)?.title || 'this prompt');
    showConfirm({
        title: 'Delete prompt?',
        message: `"${title}" will be removed from My prompts. This cannot be undone.`,
        confirmLabel: 'Delete',
        onConfirm: () => {
            saveUserPrompts(loadUserPrompts().filter((item) => item.id !== id));
            renderPromptsLibrary();
        }
    });
}

function setEditorCategoryMode(isCustom) {
    const select = document.getElementById('prompt-category-input');
    const custom = document.getElementById('prompt-category-custom');
    if (custom) custom.classList.toggle('hidden', !isCustom);
    if (isCustom) {
        if (select) select.value = NEW_CATEGORY_VALUE;
        setTimeout(() => custom?.focus(), 30);
    }
}

function showPromptEditor(prompt = {}) {
    promptsEditingId = prompt.id || null;
    fillPromptCategories();
    document.getElementById('prompt-editor').classList.remove('hidden');
    syncPromptsMainView();
    document.getElementById('prompt-editor-title').textContent = prompt.id ? 'Edit prompt' : 'New prompt';
    document.getElementById('prompt-title-input').value = prompt.title || '';
    const category = prompt.category || fallbackCategory();
    const select = document.getElementById('prompt-category-input');
    const custom = document.getElementById('prompt-category-custom');
    if (select) {
        const match = findCategory(category);
        if (match) {
            select.value = match;
            setEditorCategoryMode(false);
            if (custom) custom.value = '';
        } else {
            setEditorCategoryMode(true);
            if (custom) custom.value = category;
        }
    }
    document.getElementById('prompt-body-input').value = prompt.body || '';
    setTimeout(() => document.getElementById('prompt-title-input')?.focus(), 50);
}

function hidePromptEditor() {
    promptsEditingId = null;
    const editor = document.getElementById('prompt-editor');
    if (editor) editor.classList.add('hidden');
    setEditorCategoryMode(false);
    const custom = document.getElementById('prompt-category-custom');
    if (custom) custom.value = '';
    syncPromptsMainView();
}

function resolvedEditorCategory() {
    const select = document.getElementById('prompt-category-input');
    const custom = document.getElementById('prompt-category-custom');
    if (select?.value === NEW_CATEGORY_VALUE) {
        return addCustomCategory(custom?.value || '');
    }
    return normalizeCategoryName(select?.value) || fallbackCategory();
}

function savePromptFromEditor() {
    const title = document.getElementById('prompt-title-input').value.trim();
    const category = resolvedEditorCategory();
    const body = document.getElementById('prompt-body-input').value.trim();

    if (!title || !body) {
        showAlert('Missing info', 'Add a title and the prompt text.');
        return;
    }
    if (!category) {
        showAlert('Missing category', 'Choose a category or type a new one.');
        return;
    }

    const prompts = loadUserPrompts();
    if (promptsEditingId) {
        const index = prompts.findIndex((prompt) => prompt.id === promptsEditingId);
        if (index >= 0) {
            prompts[index] = {
                ...prompts[index],
                title,
                category,
                body,
                updatedAt: Date.now()
            };
        }
    } else {
        prompts.unshift({
            id: `user-${Date.now()}`,
            title,
            category,
            body,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }

    addCustomCategory(category, { persist: false });
    saveUserPrompts(prompts);
    hidePromptEditor();
    promptsTab = 'mine';
    setPromptsTab('mine');
}

function saveBroadcastAsPrompt() {
    if (!appFeatures.myPrompts) {
        openLicenseModal('Saving prompts is a Pro feature. Paste your license to unlock it.');
        return;
    }
    const body = document.getElementById('broadcast-input').value.trim();
    if (!body) {
        showAlert('Empty prompt', 'Write something before saving it.');
        return;
    }
    const modal = document.getElementById('broadcast-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    openPromptsModal({
        tab: 'mine',
        draft: { title: '', category: fallbackCategory(), body }
    });
}

function fillPromptCategories() {
    const filter = document.getElementById('prompts-category');
    const editorSelect = document.getElementById('prompt-category-input');
    const categories = allCategories();
    const selectedFilter = filter?.value || 'all';
    const selectedEditor = editorSelect?.value || fallbackCategory();
    if (filter) {
        filter.innerHTML = '<option value="all">All categories</option>' +
            categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        filter.value = [...filter.options].some((option) => option.value === selectedFilter) ? selectedFilter : 'all';
    }
    if (editorSelect) {
        editorSelect.innerHTML = categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') +
            `<option value="${NEW_CATEGORY_VALUE}">+ New category</option>`;
        if (selectedEditor === NEW_CATEGORY_VALUE) {
            editorSelect.value = NEW_CATEGORY_VALUE;
        } else if ([...editorSelect.options].some((option) => option.value === selectedEditor)) {
            editorSelect.value = selectedEditor;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fillPromptCategories();
    ensureUserPromptsLoaded();
    document.getElementById('prompts-btn')?.addEventListener('click', () => openPromptsModal());
    document.getElementById('prompts-close-btn')?.addEventListener('click', () => closePromptsModal());
    document.getElementById('prompts-tab-library')?.addEventListener('click', () => {
        hidePromptEditor();
        hidePromptChooser();
        setPromptsTab('library');
    });
    document.getElementById('prompts-tab-mine')?.addEventListener('click', () => {
        if (!appFeatures.myPrompts) {
            openLicenseModal('My prompts is a Pro feature. Paste your license to unlock it.');
            return;
        }
        hidePromptEditor();
        hidePromptChooser();
        setPromptsTab('mine');
    });
    document.getElementById('prompts-tab-categories')?.addEventListener('click', () => {
        if (!appFeatures.myPrompts) {
            openLicenseModal('Categories is a Pro feature. Paste your license to unlock it.');
            return;
        }
        hidePromptEditor();
        hidePromptChooser();
        setPromptsTab('categories');
        setTimeout(() => document.getElementById('prompts-category-add-name')?.focus(), 50);
    });
    document.getElementById('prompts-new-btn')?.addEventListener('click', () => {
        if (!appFeatures.myPrompts) {
            openLicenseModal('Saving your own prompts is a Pro feature.');
            return;
        }
        showPromptEditor();
    });
    document.getElementById('prompts-empty-new-btn')?.addEventListener('click', () => {
        if (!appFeatures.myPrompts) {
            openLicenseModal('Saving your own prompts is a Pro feature.');
            return;
        }
        showPromptEditor();
    });
    document.getElementById('prompts-category-add-btn')?.addEventListener('click', addCategoryFromPanel);
    document.getElementById('prompts-category-add-name')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addCategoryFromPanel();
        }
    });
    document.getElementById('prompt-category-input')?.addEventListener('change', (event) => {
        setEditorCategoryMode(event.target.value === NEW_CATEGORY_VALUE);
    });
    document.getElementById('prompt-editor-cancel')?.addEventListener('click', () => hidePromptEditor());
    document.getElementById('prompt-editor-save')?.addEventListener('click', savePromptFromEditor);
    document.getElementById('prompts-search')?.addEventListener('input', renderPromptsLibrary);
    document.getElementById('prompts-category')?.addEventListener('change', renderPromptsLibrary);
    document.getElementById('broadcast-save-btn')?.addEventListener('click', saveBroadcastAsPrompt);
    document.getElementById('prompt-target-active')?.addEventListener('click', () => setPromptSendTarget('active'));
    document.getElementById('prompt-target-all')?.addEventListener('click', () => setPromptSendTarget('all'));
    document.getElementById('prompt-send-confirm')?.addEventListener('click', confirmPromptSend);
    document.getElementById('prompt-send-cancel')?.addEventListener('click', () => {
        hidePromptChooser();
        syncPromptsMainView();
    });
});

window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isPromptsModalOpen()) return;
    if (isPromptChooserOpen()) {
        hidePromptChooser();
        syncPromptsMainView();
        return;
    }
    if (isCategoriesPanelOpen()) {
        const editing = document.querySelector('#prompts-category-list [data-editing="true"]');
        if (editing) {
            stopCategoryRowEdit(editing);
            return;
        }
    }
    if (!document.getElementById('prompt-editor')?.classList.contains('hidden')) {
        hidePromptEditor();
        return;
    }
    closePromptsModal();
});
