var omni = window.omni || {
    send() {},
    on() { return () => {}; },
    invoke() { return Promise.resolve([]); },
    openExternal(url) {
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }
};
const tabsContainer = document.getElementById('tabs');

const header = document.getElementById('header');
// Footer removed

const resizeObserver = new ResizeObserver(entries => {
    const headerHeight = header.offsetHeight;
    omni.send('update-layout', { headerHeight, footerHeight: 0 });
});
resizeObserver.observe(header);

omni.on('sync-split-state', (isActive) => {
    const btn = document.getElementById('split-btn');
    if (btn) {
        if (isActive) {
            btn.classList.add('active', 'is-active');
        } else {
            btn.classList.remove('active', 'is-active');
        }
    }
    // Re-check buttons state (Ask All, etc.)
    checkEmptyState();
});

// --- KEYBOARD SHORTCUTS HANDLERS ---
omni.on('action-new-tab', () => {
    openLauncher();
});

omni.on('action-close-tab', () => {
    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        // Find the close button inside the active tab and click it
        const closeIcon = activeBtn.querySelector('.close-tab');
        if (closeIcon) closeIcon.click();
    } else {
        // If in launcher, close launcher?
        closeLauncher();
    }
});

omni.on('action-reload-current', () => {
    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        const reloadIcon = activeBtn.querySelector('.reload-tab');
        if (reloadIcon) reloadIcon.click();
    } else {
        // Maybe reload launcher? No need.
    }
});

omni.on('action-next-tab', () => {
    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        const next = activeBtn.nextElementSibling;
        if (next) next.click();
        else {
            // Cycle to start
            const first = tabsContainer.firstElementChild;
            if (first) first.click();
        }
    } else if (tabsContainer.firstElementChild) {
        tabsContainer.firstElementChild.click();
    }
});

omni.on('action-prev-tab', () => {
    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        const prev = activeBtn.previousElementSibling;
        if (prev) prev.click();
        else {
            // Cycle to end
            const last = tabsContainer.lastElementChild;
            if (last) last.click();
        }
    } else if (tabsContainer.lastElementChild) {
        tabsContainer.lastElementChild.click();
    }
});

omni.on('action-jump-tab', (index) => {
    const buttons = tabsContainer.querySelectorAll('.tab-btn');
    if (buttons[index]) {
        buttons[index].click();
    }
});

// Global Keyboard Listeners
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 1. Priority: Close open modals
        const modals = [
            { id: 'confirmation-modal', close: closeModal },
            { id: 'alert-modal', close: closeAlertModal },
            { id: 'broadcast-modal', close: closeBroadcastModal },
            { id: 'custom-app-modal', close: closeCustomModal },
            { id: 'license-modal', close: closeLicenseModal },
            { id: 'help-modal', close: closeHelpModal },
            { id: 'about-modal', close: closeAboutModal },
            { id: 'split-picker-modal', close: closeSplitPicker }
        ];

        for (const modal of modals) {
            const el = document.getElementById(modal.id);
            if (el && !el.classList.contains('hidden')) {
                e.stopImmediatePropagation();
                modal.close();
                if (document.activeElement) document.activeElement.blur();
                return;
            }
        }

        // 2. If no modals, try to close Launcher
        const launcher = document.getElementById('app-launcher');
        if (launcher && !launcher.classList.contains('hidden')) {
            closeLauncher();
            if (document.activeElement) document.activeElement.blur();
        }
    }
});
// -----------------------------------




omni.on('ai-loading-status', ({ id, isLoading }) => {
    const btn = document.querySelector(`#tabs .tab-btn[data-id="${id}"]`);
    const reloadIcon = btn?.querySelector('.reload-tab');
    if (!reloadIcon) return;
    reloadIcon.classList.toggle('animate-spin', Boolean(isLoading));
});

omni.on('ai-view-curtain', ({ show }) => {
    const curtain = document.getElementById('view-curtain');
    const launcher = document.getElementById('app-launcher');
    if (!curtain) return;
    const launcherOpen = launcher && !launcher.classList.contains('hidden');
    curtain.classList.toggle('hidden', !show || launcherOpen);
});

const allAIs = [
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'Grok', url: 'https://grok.com', requiresLogin: true },
    { name: 'Copilot', url: 'https://copilot.microsoft.com', requiresLogin: true },
    { name: 'Claude', url: 'https://claude.ai', requiresLogin: true },
    { name: 'Perplexity', url: 'https://www.perplexity.ai', requiresLogin: true },
    { name: 'Poe', url: 'https://poe.com', requiresLogin: true },
    { name: 'DeepSeek', url: 'https://chat.deepseek.com', requiresLogin: true },
    { name: 'Mistral', url: 'https://chat.mistral.ai', requiresLogin: true },
    { name: 'HuggingChat', url: 'https://huggingface.co/chat', requiresLogin: true },
    { name: 'Meta AI', url: 'https://www.meta.ai', requiresLogin: true },
    { name: 'Duck.ai', url: 'https://duck.ai', isPrivate: true },
    { name: 'Lumo', url: 'https://lumo.proton.me', isPrivate: true }
];

function showIncognitoLoginRequiredAlert(name) {
    showAlert(
        'Mode Restricted',
        `${name} does not support Incognito Mode because it requires a persistent login session.`
    );
}

function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tab';
}

function stableHash(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function parseAppUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function buildTabId(name, url, isIncognito) {
    const normalized = `${slugify(name)}-${stableHash(url)}`;
    return isIncognito ? `${normalized}-incog` : normalized;
}

const TAB_BASE = "tab-btn";

function createIconElement(url, className) {
    const img = document.createElement('img');
    img.src = `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`;
    img.className = className;
    img.alt = '';
    return img;
}

function createTab(name, url, isIncognito = false, isActive = false, options = {}) {
    const parsedUrl = parseAppUrl(url);
    if (!parsedUrl) {
        showAlert('Invalid URL', 'Please enter a valid http or https URL.');
        return null;
    }

    const id = buildTabId(name, parsedUrl.toString(), isIncognito);

    // Verificar si ya existe
    const existingBtn = document.querySelector(`#tabs .tab-btn[data-id="${id}"]`);
    if (existingBtn) {
        existingBtn.click();
        return existingBtn;
    }

    if (!options.bypassLicenseGate) {
        const openCount = tabsContainer.querySelectorAll('.tab-btn').length;
        if (openCount >= (appFeatures.maxTabs || 3)) {
            openLicenseModal('Free includes up to three AI tabs. Activate Pro for more.');
            return null;
        }
    }

    const btn = document.createElement('div');
    btn.tabIndex = 0;
    btn.dataset.id = id;
    btn.dataset.url = parsedUrl.toString();
    btn.dataset.name = name;
    btn.dataset.incognito = isIncognito;

    btn.className = isActive ? `${TAB_BASE} is-on` : TAB_BASE;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

    const face = document.createElement('span');
    face.className = 'tab-face';
    face.setAttribute('aria-hidden', 'true');
    btn.appendChild(face);

    if (isIncognito) {
        const incognitoBadge = document.createElement('span');
        incognitoBadge.className = 'flex items-center mr-1.5 opacity-70 shrink-0';
        incognitoBadge.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="14" r="3.5"/><circle cx="16.5" cy="14" r="3.5"/><path d="M11 14h2"/><path d="M4 14c0-3 2-6 8-6s8 3 8 6"/></svg>`;
        incognitoBadge.title = 'Incognito';
        btn.appendChild(incognitoBadge);
    }

    btn.appendChild(createIconElement(parsedUrl, 'tab-favicon'));

    const nameLabel = document.createElement('span');
    nameLabel.className = 'tab-name';
    nameLabel.textContent = name;
    btn.appendChild(nameLabel);

    const actions = document.createElement('div');
    actions.className = 'tab-actions';
    actions.innerHTML = `
        <span class="reload-tab" title="Reload">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </span>
        <span class="close-tab" title="Close">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
    `;
    btn.appendChild(actions);

    // Event listeners for actions
    const reloadBtn = btn.querySelector('.reload-tab');
    const closeBtn = btn.querySelector('.close-tab');

    // No need for JS hover effects anymore, Tailwind handles it.

    reloadBtn.onclick = (e) => {
        e.stopPropagation();
        // Add spinning class via Tailwind animation
        reloadBtn.classList.add('animate-spin');
        omni.send('reload-ai', id);
    };

    closeBtn.onclick = (e) => {
        e.stopPropagation(); // Evitar que seleccione la pestaña al cerrarla

        let alreadyRemoved = false;
        // Si la pestaña estaba activa, intentar cambiar a otra
        if (btn.classList.contains('is-on')) {
            const sibling = btn.previousElementSibling || btn.nextElementSibling;
            if (sibling) sibling.click();
            else {
                omni.send('remove-ai', id); // Si era la única, enviamos remove igual y quedará vacío
                alreadyRemoved = true;
            }
        }

        btn.remove();
        if (!alreadyRemoved) {
            omni.send('remove-ai', id);
        }
        saveTabs();
        checkEmptyState();
    };

    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
        }
    });

    btn.onclick = () => {
        const wasActive = btn.classList.contains('is-on');
        if (!wasActive) {
            document.querySelectorAll('#tabs .tab-btn.is-on').forEach((b) => {
                b.classList.remove('is-on');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('is-on');
            btn.setAttribute('aria-selected', 'true');
            localStorage.setItem('omni-active-tab', id);
            omni.send('switch-tab', id);
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        const launcher = document.getElementById('app-launcher');
        const launcherWasOpen = !launcher.classList.contains('hidden');
        launcher.classList.add('hidden');
        launcher.classList.remove('flex');
        if (wasActive && launcherWasOpen) {
            omni.send('show-current-view', id);
        }
    };

    // Drag and Drop
    btn.draggable = true;
    btn.addEventListener('dragstart', () => {
        btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
        saveTabs();
    });

    tabsContainer.appendChild(btn);
    omni.send('add-ai', { id, url: parsedUrl.toString(), isIncognito });
    updateScrollButtons();
    checkEmptyState();
    saveTabs();
    return btn;
}

function saveTabs() {
    const tabs = [];
    const buttons = tabsContainer.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const name = btn.dataset.name;
        const url = btn.dataset.url;
        const isIncognito = btn.dataset.incognito === 'true';
        tabs.push({ name, url, isIncognito });
    });
    localStorage.setItem('omni-tabs', JSON.stringify(tabs));
}

function checkEmptyState() {
    const launcher = document.getElementById('app-launcher');
    const splitBtn = document.getElementById('split-btn');
    const closeLauncherBtn = document.getElementById('close-launcher');
    const count = tabsContainer.children.length;

    if (count === 0) {
        omni.send('hide-current-view');
        launcher.classList.remove('hidden');
        launcher.classList.add('flex');
        closeLauncherBtn.classList.add('hidden');
    } else {
        // If launcher is open, we keep it visible, but if we have tabs we might want to hide it
        // Logic handled by toggleLauncher
        closeLauncherBtn.classList.remove('hidden');
    }

    // Disable split button and ask-all button visually if < 2 tabs
    const askAllBtn = document.getElementById('ask-all-btn');
    const reloadAllBtn = document.querySelector('.reload-all-btn');
    const isSplitActive = splitBtn.classList.contains('active');

    const disabledClasses = ['opacity-30', 'grayscale', 'cursor-not-allowed'];

    if (count < 2) {
        splitBtn.classList.add(...disabledClasses);
        if (askAllBtn) askAllBtn.classList.add(...disabledClasses);
        if (reloadAllBtn) reloadAllBtn.classList.add(...disabledClasses);
    } else {
        splitBtn.classList.remove(...disabledClasses);
        if (reloadAllBtn) reloadAllBtn.classList.remove(...disabledClasses);

        if (askAllBtn) {
            askAllBtn.style.opacity = '';
            askAllBtn.style.cursor = '';

            if (isSplitActive) {
                askAllBtn.classList.add(...disabledClasses);
            } else {
                askAllBtn.classList.remove(...disabledClasses);
            }
        }
    }

    if (splitBtn) {
        if (count < 2) {
            splitBtn.title = 'Abre al menos 2 IAs';
        } else if (count > 2 && !isSplitActive) {
            splitBtn.title = 'Split View — choose two AIs';
        } else {
            splitBtn.title = 'Toggle Split View';
        }
    }
    if (askAllBtn) {
        if (count < 2) {
            askAllBtn.title = 'Abre al menos 2 IAs';
        } else if (isSplitActive) {
            askAllBtn.title = 'Not available in Split View';
        } else {
            askAllBtn.title = 'Send prompt to all AIs';
        }
    }
    if (reloadAllBtn) {
        reloadAllBtn.title = count < 2 ? 'Abre al menos 2 IAs' : 'Reload All';
    }

    updateScrollButtons();

    // Always refresh launcher status when tabs change to keep cards in sync
    // A small delay ensures the DOM has updated and is ready for querying
    setTimeout(() => {
        const launcher = document.getElementById('app-launcher');
        if (launcher) renderLauncher();
    }, 50);
}

function renderLauncher() {
    const grid = document.getElementById('launcher-grid');
    if (!grid) return; // Guard

    const isIncognitoMode = document.getElementById('incognito-check').checked;
    grid.innerHTML = '';

    // Get all current tab IDs to check for status
    const activeTabIds = Array.from(tabsContainer.querySelectorAll('.tab-btn')).map(b => b.dataset.id);

    allAIs.forEach(ai => {
        const parsedUrl = parseAppUrl(ai.url);
        if (!parsedUrl) return;
        const normalizedUrl = parsedUrl.toString();
        const id = buildTabId(ai.name, normalizedUrl, isIncognitoMode);
        const isAlreadyAdded = activeTabIds.includes(id);
        const blocksIncognito = isIncognitoMode && ai.requiresLogin;

        const card = document.createElement('div');

        if (isAlreadyAdded) {
            card.className = "ai-tile is-used group relative p-4 sm:p-5 flex flex-col items-center gap-2 sm:gap-3";
            card.title = `${ai.name} (${isIncognitoMode ? 'Incognito' : 'Standard'}) is already open.`;
        } else if (blocksIncognito) {
            card.className = "ai-tile is-blocked group relative p-4 sm:p-5 flex flex-col items-center gap-2 sm:gap-3";
            card.title = `${ai.name} requires login and cannot be opened in Incognito Mode.`;
            card.onclick = () => showIncognitoLoginRequiredAlert(ai.name);
        } else {
            card.className = "ai-tile is-open group relative p-4 sm:p-5 flex flex-col items-center gap-2 sm:gap-3 transition-all";
            card.onclick = () => addFromHome(ai.name, normalizedUrl, ai.requiresLogin);
        }

        card.appendChild(createIconElement(parsedUrl, `ai-icon opacity-80 group-hover:opacity-100 transition-all`));

        const content = document.createElement('div');
        content.className = 'flex flex-col items-center gap-1 mt-2';

        const title = document.createElement('span');
        title.className = 'text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors text-center';
        title.textContent = ai.name;
        content.appendChild(title);

        if (ai.isPrivate) {
            const badge = document.createElement('span');
            badge.className = 'text-[9px] font-bold bg-green-500/10 text-green-500/80 px-1.5 py-0.5 border border-green-500/20 uppercase tracking-widest mt-1';
            badge.textContent = 'Private';
            content.appendChild(badge);
        }

        card.appendChild(content);

        grid.appendChild(card);
    });

    // Add Custom Card
    const customCard = document.createElement('div');
    customCard.className = "ai-tile is-open group relative p-4 sm:p-5 flex flex-col items-center gap-2 sm:gap-3 transition-all";
    customCard.innerHTML = `
        <div class="ai-icon flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 text-2xl sm:text-3xl font-light">
            +
        </div>
        <span class="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-200 transition-colors">Custom</span>
    `;
    customCard.onclick = () => openCustomModal();
    grid.appendChild(customCard);
}

window.onload = () => {
    // Sync Theme with Main Process (DOM already handled by inline script in index.html to avoid flicker)
    const savedTheme = localStorage.getItem('omni-theme') || 'dark';
    // We still send the IPC message to ensure main process is in sync
    omni.send('theme-changed', savedTheme);

    renderLauncher();

    // Re-enable transitions after a short delay to ensure initial paint is done
    setTimeout(() => {
        const noTransitions = document.getElementById('no-transitions');
        if (noTransitions) noTransitions.remove();
    }, 100);

    const saved = localStorage.getItem('omni-tabs');
    let loaded = false;

    if (saved) {
        try {
            const tabs = JSON.parse(saved);
            if (Array.isArray(tabs) && tabs.length > 0) {
                const lastActive = localStorage.getItem('omni-active-tab');
                tabs.forEach((t) => {
                    // Check if this tab matches the last active one
                    // We construct the ID effectively again here to check match
                    const id = buildTabId(t.name, t.url, t.isIncognito);
                    const isActive = (lastActive === id);
                    createTab(t.name, t.url, t.isIncognito, isActive, { bypassLicenseGate: true });
                });
                loaded = true;

                // Sync view with active tab without clicking (visuals already set)
                if (lastActive) {
                    omni.send('switch-tab', lastActive);
                    // Ensure launcher matches state
                    const launcher = document.getElementById('app-launcher');
                    launcher.classList.add('hidden');
                    launcher.classList.remove('flex');
                } else {
                    if (tabsContainer.firstElementChild) tabsContainer.firstElementChild.click();
                }
            }
        } catch (e) {
            console.error("Error loading saved tabs:", e);
        }
    }

    if (!loaded) {
        // We no longer add default AIs, the app starts at the Launcher
    }

    checkEmptyState();

    // Re-render when incognito toggle changes
    document.getElementById('incognito-check').addEventListener('change', () => renderLauncher());

    setTimeout(updateScrollButtons, 100);
};

const scrollLeftBtn = document.getElementById('scroll-left');
const scrollRightBtn = document.getElementById('scroll-right');

function scrollTabs(direction) {
    const scrollAmount = 200;
    tabsContainer.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

function updateScrollButtons() {
    // Check if content overflows
    if (tabsContainer.scrollWidth > tabsContainer.clientWidth) {
        // Show/Hide based on position
        scrollLeftBtn.style.display = tabsContainer.scrollLeft > 0 ? 'block' : 'none';
        scrollRightBtn.style.display =
            (tabsContainer.scrollLeft + tabsContainer.clientWidth < tabsContainer.scrollWidth - 1)
                ? 'block' : 'none';
    } else {
        scrollLeftBtn.style.display = 'none';
        scrollRightBtn.style.display = 'none';
    }
}

tabsContainer.addEventListener('scroll', updateScrollButtons);
window.addEventListener('resize', updateScrollButtons);

function openLauncher() {
    const launcher = document.getElementById('app-launcher');
    // Store current state but always try to show
    omni.send('hide-current-view');
    launcher.classList.remove('hidden');
    launcher.classList.add('flex');
}

function closeLauncher() {
    const launcher = document.getElementById('app-launcher');
    // Only allow hiding if we have tabs
    if (tabsContainer.children.length > 0) {
        launcher.classList.add('hidden');
        launcher.classList.remove('flex');

        const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
        if (activeBtn) omni.send('show-current-view', activeBtn.dataset.id);
    }
}

function addFromHome(name, url, requiresLogin = false) {
    const incognitoCheck = document.getElementById('incognito-check');
    const isIncognito = incognitoCheck.checked;

    if (isIncognito && requiresLogin) {
        showIncognitoLoginRequiredAlert(name);
        return;
    }

    const btn = createTab(name, url, isIncognito);
    if (!btn) {
        return;
    }
    btn.click();
    incognitoCheck.checked = false;

    // Use the safe close function
    closeLauncher();
}

/* Generic Alert Functions */
function showAlert(title, message) {
    omni.send('hide-current-view'); // Ensure webviews don't cover it
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;

    const modal = document.getElementById('alert-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAlertModal() {
    const modal = document.getElementById('alert-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    restoreViewIfIdle();
}

function reloadAll() {
    if (tabsContainer.children.length < 2) return;
    omni.send('reload-all-ais');
}

function toggleSplit() {
    try {
        const btn = document.getElementById('split-btn');
        const tabs = getOpenSplitTabs();

        if (!btn) return;

        if (btn.classList.contains('active')) {
            omni.send('toggle-split', { enabled: false });
            btn.classList.remove('active', 'is-active');
            checkEmptyState();
            return;
        }

        if (!appFeatures.splitView) {
            openLicenseModal('Split View is a Pro feature. Paste your license to unlock it.');
            return;
        }

        if (tabs.length < 2) {
            return;
        }

        if (tabs.length === 2) {
            const activeId = document.querySelector('#tabs .tab-btn.is-on')?.dataset.id;
            const leftId = tabs.some((tab) => tab.id === activeId) ? activeId : tabs[0].id;
            const rightId = tabs.find((tab) => tab.id !== leftId)?.id;
            enableSplitView(leftId, rightId);
            return;
        }

        openSplitPicker();
    } catch (e) {
        console.error("JS Error in toggleSplit: " + e.message);
        showAlert("Error", "An error occurred: " + e.message);
    }
}

let splitPickIds = [];
let lastSplitPick = null;

function getOpenSplitTabs() {
    return Array.from(tabsContainer.querySelectorAll('.tab-btn')).map((btn) => ({
        id: btn.dataset.id,
        name: btn.dataset.name || 'AI',
        url: btn.dataset.url || '',
        incognito: btn.dataset.incognito === 'true'
    }));
}

function splitTabLabel(tab) {
    return tab.incognito ? `${tab.name} (Incognito)` : tab.name;
}

function splitFaviconSrc(url) {
    try {
        return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`;
    } catch {
        return '';
    }
}

function markTabActive(id) {
    document.querySelectorAll('#tabs .tab-btn').forEach((btn) => {
        const on = btn.dataset.id === id;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (id) localStorage.setItem('omni-active-tab', id);
}

function enableSplitView(leftId, rightId) {
    if (!leftId || !rightId || leftId === rightId) return;
    lastSplitPick = { leftId, rightId };
    closeSplitPicker({ restoreView: false });
    markTabActive(leftId);
    const btn = document.getElementById('split-btn');
    btn?.classList.add('active', 'is-active');
    omni.send('toggle-split', { enabled: true, leftId, rightId });
    checkEmptyState();
}

function isSplitPickerOpen() {
    const modal = document.getElementById('split-picker-modal');
    return modal && !modal.classList.contains('hidden');
}

function openSplitPicker() {
    const tabs = getOpenSplitTabs();
    const modal = document.getElementById('split-picker-modal');
    const list = document.getElementById('split-pick-list');
    if (!modal || !list || tabs.length < 2) return;

    omni.send('hide-current-view');
    const activeId = document.querySelector('#tabs .tab-btn.is-on')?.dataset.id;
    const saved = lastSplitPick && tabs.some((tab) => tab.id === lastSplitPick.leftId)
        && tabs.some((tab) => tab.id === lastSplitPick.rightId)
        ? lastSplitPick
        : null;
    if (saved) {
        splitPickIds = [saved.leftId, saved.rightId];
    } else {
        const leftId = activeId || tabs[0].id;
        const rightId = tabs.find((tab) => tab.id !== leftId)?.id;
        splitPickIds = [leftId, rightId].filter(Boolean);
    }

    list.innerHTML = '';
    tabs.forEach((tab) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.id = tab.id;
        button.className = 'split-pick-btn';
        const icon = splitFaviconSrc(tab.url);
        button.innerHTML = `${icon ? `<img src="${icon}" alt="">` : ''}
            <span class="truncate">${escapeSplitHtml(splitTabLabel(tab))}</span>
            <span class="split-pick-slot"></span>`;
        button.onclick = () => toggleSplitPick(tab.id);
        list.appendChild(button);
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderSplitPickerSelection();
}

function escapeSplitHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toggleSplitPick(id) {
    const index = splitPickIds.indexOf(id);
    if (index >= 0) {
        splitPickIds.splice(index, 1);
    } else if (splitPickIds.length < 2) {
        splitPickIds.push(id);
    } else {
        splitPickIds[1] = id;
    }
    renderSplitPickerSelection();
}

function renderSplitPickerSelection() {
    const tabs = getOpenSplitTabs();
    const names = splitPickIds.map((id) => {
        const tab = tabs.find((item) => item.id === id);
        return tab ? splitTabLabel(tab) : '';
    });
    const left = document.getElementById('split-pick-left');
    const right = document.getElementById('split-pick-right');
    if (left) {
        left.textContent = names[0] || 'Select an AI';
        left.classList.toggle('text-zinc-500', !names[0]);
        left.classList.toggle('text-zinc-900', Boolean(names[0]));
        left.classList.toggle('dark:text-white', Boolean(names[0]));
    }
    if (right) {
        right.textContent = names[1] || 'Select an AI';
        right.classList.toggle('text-zinc-500', !names[1]);
        right.classList.toggle('text-zinc-900', Boolean(names[1]));
        right.classList.toggle('dark:text-white', Boolean(names[1]));
    }

    document.querySelectorAll('#split-pick-list .split-pick-btn').forEach((button) => {
        const slot = splitPickIds.indexOf(button.dataset.id);
        button.classList.toggle('is-picked', slot >= 0);
        const badge = button.querySelector('.split-pick-slot');
        if (badge) badge.textContent = slot === 0 ? 'Left' : slot === 1 ? 'Right' : '';
    });

    const confirm = document.getElementById('split-pick-confirm');
    if (confirm) confirm.disabled = splitPickIds.length !== 2;
}

function closeSplitPicker({ restoreView = true } = {}) {
    const modal = document.getElementById('split-picker-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (restoreView) restoreViewIfIdle();
}

function confirmSplitPicker() {
    if (splitPickIds.length !== 2) return;
    enableSplitView(splitPickIds[0], splitPickIds[1]);
}

function resetDefaults() {
    closeMoreMenu({ restoreView: false });
    showConfirm({
        title: 'Reset to Defaults?',
        message: 'All your tabs and custom settings will be lost. This action cannot be undone.',
        confirmLabel: 'Reset Everything',
        onConfirm: confirmReset
    });
}

let pendingConfirmAction = null;

function showConfirm({ title, message, confirmLabel = 'Confirm', onConfirm } = {}) {
    omni.send('hide-current-view');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const actionBtn = document.getElementById('confirm-action-btn');
    if (titleEl) titleEl.textContent = title || 'Confirm';
    if (messageEl) messageEl.textContent = message || '';
    if (actionBtn) actionBtn.textContent = confirmLabel;
    pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    const modal = document.getElementById('confirmation-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = '';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingConfirmAction = null;
    restoreViewIfIdle();
}

function confirmModalAction() {
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = '';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (typeof action === 'function') {
        action();
        return;
    }
    restoreViewIfIdle();
}

function confirmReset() {
    omni.send('reset-all');
    localStorage.removeItem('omni-tabs');
    localStorage.removeItem('omni-active-tab');
    localStorage.removeItem('omni-theme');
    document.documentElement.classList.add('dark');
    tabsContainer.innerHTML = '';
    const splitBtn = document.getElementById('split-btn');
    if (splitBtn) {
        splitBtn.classList.remove('active', 'is-active');
    }
    location.reload();
}

/* Broadcast Modal Functions */
function openBroadcastModal() {
    const splitBtn = document.getElementById('split-btn');
    if (tabsContainer.children.length < 2) return; // Silent return if not enough tabs
    if (splitBtn && splitBtn.classList.contains('active')) return; // Silent return if split mode is on

    if (!appFeatures.askAll) {
        openLicenseModal('Ask All is a Pro feature. Paste your license to unlock it.');
        return;
    }

    omni.send('hide-current-view');
    const modal = document.getElementById('broadcast-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        document.getElementById('broadcast-input').focus();
    }, 100);
}

function closeBroadcastModal() {
    const modal = document.getElementById('broadcast-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    const launcher = document.getElementById('app-launcher');
    if (!launcher.classList.contains('hidden')) return;

    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        omni.send('show-current-view', activeBtn.dataset.id);
    }
}

/* Help & About Modal Functions */
function isMoreMenuOpen() {
    return false;
}

function restoreViewIfIdle() {
    const launcher = document.getElementById('app-launcher');
    if (launcher && !launcher.classList.contains('hidden')) return;
    if (!document.getElementById('help-modal').classList.contains('hidden')) return;
    if (!document.getElementById('about-modal').classList.contains('hidden')) return;
    if (!document.getElementById('license-modal')?.classList.contains('hidden')) return;
    if (!document.getElementById('confirmation-modal').classList.contains('hidden')) return;
    if (!document.getElementById('broadcast-modal').classList.contains('hidden')) return;
    if (!document.getElementById('custom-app-modal').classList.contains('hidden')) return;
    if (!document.getElementById('alert-modal').classList.contains('hidden')) return;
    if (!document.getElementById('prompts-modal').classList.contains('hidden')) return;
    if (!document.getElementById('split-picker-modal')?.classList.contains('hidden')) return;

    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) omni.send('show-current-view', activeBtn.dataset.id);
}

function openMoreMenu() {
    const btn = document.getElementById('more-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    omni.send('show-more-menu', {
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    });
}

function closeMoreMenu() {
    // Native menus dismiss themselves.
}

function toggleMoreMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    openMoreMenu();
}

document.getElementById('more-btn')?.addEventListener('click', toggleMoreMenu);
omni.on('more-menu-action', (action) => {
    if (action === 'help') openHelpModal();
    if (action === 'license') openLicenseModal();
    if (action === 'reset') resetDefaults();
});

/* License Modal */
let appFeatures = {
    isPro: false,
    maxTabs: 3,
    askAll: false,
    splitView: false,
    myPrompts: false,
    checkoutUrl: 'https://polar.sh/'
};
let licenseBusy = false;

function applyLicenseStatus(status) {
    if (!status || typeof status !== 'object') return;
    if (status.features) {
        appFeatures = { ...appFeatures, ...status.features };
    } else if (typeof status.isPro === 'boolean') {
        appFeatures.isPro = status.isPro;
        appFeatures.maxTabs = status.isPro ? Number.POSITIVE_INFINITY : 3;
        appFeatures.askAll = status.isPro;
        appFeatures.splitView = status.isPro;
        appFeatures.myPrompts = status.isPro;
    }
    if (status.checkoutUrl) {
        appFeatures.checkoutUrl = status.checkoutUrl;
    }

    const planLabel = document.getElementById('license-plan-label');
    const badge = document.getElementById('license-plan-badge');
    const keyMeta = document.getElementById('license-key-meta');
    const message = document.getElementById('license-message');
    const activatePanel = document.getElementById('license-activate-panel');
    const proActions = document.getElementById('license-pro-actions');
    const keyInput = document.getElementById('license-key-input');

    if (planLabel) planLabel.textContent = appFeatures.isPro ? 'Pro' : 'Free';
    if (badge) {
        badge.textContent = appFeatures.isPro ? 'Pro' : 'Free';
        badge.className = appFeatures.isPro
            ? 'text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-seizia/40 text-seizia bg-seizia/10'
            : 'text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300';
    }

    if (keyMeta) {
        if (appFeatures.isPro && status.displayKey) {
            keyMeta.textContent = `Key ${status.displayKey}`;
        } else if (status.localDevHint) {
            keyMeta.textContent = status.localDevHint;
        } else {
            keyMeta.textContent = 'No license on this computer.';
        }
    }

    if (message) {
        const text = status.error || status.warning || message.dataset.hint || '';
        message.textContent = text;
        message.classList.toggle('hidden', !text);
        message.classList.toggle('text-red-600', Boolean(status.error));
        message.classList.toggle('dark:text-red-400', Boolean(status.error));
        message.classList.toggle('text-amber-700', Boolean(status.warning) && !status.error);
        message.classList.toggle('dark:text-amber-400', Boolean(status.warning) && !status.error);
    }

    if (activatePanel) activatePanel.classList.toggle('hidden', appFeatures.isPro);
    if (proActions) {
        proActions.classList.toggle('hidden', !appFeatures.isPro);
        proActions.classList.toggle('flex', appFeatures.isPro);
    }
    if (keyInput && appFeatures.isPro) keyInput.value = '';

    document.getElementById('ask-all-btn')?.classList.toggle('opacity-60', !appFeatures.askAll);
    document.getElementById('split-btn')?.classList.toggle('opacity-60', !appFeatures.splitView);
}

async function refreshLicenseStatus() {
    try {
        const status = await omni.invoke('license:status');
        applyLicenseStatus(status);
        return status;
    } catch (error) {
        console.error('Failed to load license status:', error);
        return null;
    }
}

function openLicenseModal(hint) {
    closeMoreMenu({ restoreView: false });
    omni.send('hide-current-view');
    const modal = document.getElementById('license-modal');
    const message = document.getElementById('license-message');
    if (message) {
        if (hint) {
            message.dataset.hint = hint;
            message.textContent = hint;
            message.classList.remove('hidden', 'text-red-600', 'dark:text-red-400');
            message.classList.add('text-zinc-600', 'dark:text-zinc-400');
        } else {
            delete message.dataset.hint;
        }
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    refreshLicenseStatus().then(() => {
        if (!appFeatures.isPro) {
            setTimeout(() => document.getElementById('license-key-input')?.focus(), 80);
        }
    });
}

function closeLicenseModal() {
    const modal = document.getElementById('license-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const message = document.getElementById('license-message');
    if (message) delete message.dataset.hint;
    restoreViewIfIdle();
}

async function activateLicenseKey() {
    if (licenseBusy) return;
    const input = document.getElementById('license-key-input');
    const key = input?.value || '';
    const btn = document.getElementById('license-activate-btn');
    licenseBusy = true;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Checking…';
    }
    try {
        const result = await omni.invoke('license:activate', key);
        applyLicenseStatus(result);
        if (result.ok) {
            const message = document.getElementById('license-message');
            if (message) {
                message.dataset.hint = 'Pro unlocked on this computer.';
                message.textContent = message.dataset.hint;
                message.classList.remove('hidden', 'text-red-600', 'dark:text-red-400');
                message.classList.add('text-zinc-600', 'dark:text-zinc-400');
            }
        }
    } catch (error) {
        applyLicenseStatus({
            isPro: appFeatures.isPro,
            features: appFeatures,
            error: error.message || 'Activation failed'
        });
    } finally {
        licenseBusy = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Activate';
        }
    }
}

async function clearLicenseKey() {
    if (licenseBusy) return;
    licenseBusy = true;
    try {
        const result = await omni.invoke('license:clear');
        applyLicenseStatus(result);
    } catch (error) {
        console.error('Failed to clear license:', error);
    } finally {
        licenseBusy = false;
    }
}

function openLicenseCheckout() {
    const url = appFeatures.checkoutUrl || 'https://polar.sh/';
    omni.openExternal(url);
}

document.getElementById('license-key-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        activateLicenseKey();
    }
});

omni.on('license-updated', (status) => applyLicenseStatus(status));
refreshLicenseStatus();

function openHelpModal() {
    closeMoreMenu({ restoreView: false });
    omni.send('hide-current-view');
    const modal = document.getElementById('help-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    const launcher = document.getElementById('app-launcher');
    if (!launcher.classList.contains('hidden')) return;

    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) omni.send('show-current-view', activeBtn.dataset.id);
}

function openAboutModal() {
    closeHelpModal();
    omni.send('hide-current-view');
    const modal = document.getElementById('about-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAboutModal() {
    const modal = document.getElementById('about-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    const launcher = document.getElementById('app-launcher');
    if (!launcher.classList.contains('hidden')) return;

    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) omni.send('show-current-view', activeBtn.dataset.id);
}

function sendBroadcast() {
    const input = document.getElementById('broadcast-input');
    const prompt = input.value;
    if (prompt.trim()) {
        omni.send('broadcast-prompt', prompt);
        input.value = ''; // Clear input
        closeBroadcastModal();
    }
}

/* Custom App Modal Functions */
function openCustomModal() {
    omni.send('hide-current-view');
    const modal = document.getElementById('custom-app-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const nameInput = document.getElementById('custom-name');
    const urlInput = document.getElementById('custom-url');

    setTimeout(() => {
        nameInput.focus();
    }, 100);

    // Enter key support
    urlInput.onkeyup = (e) => {
        if (e.key === 'Enter') addCustomApp();
    };
    nameInput.onkeyup = (e) => {
        if (e.key === 'Enter') urlInput.focus();
    };
}

function closeCustomModal() {
    const modal = document.getElementById('custom-app-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    // Clear inputs
    document.getElementById('custom-name').value = '';
    document.getElementById('custom-url').value = '';

    const launcher = document.getElementById('app-launcher');
    if (!launcher.classList.contains('hidden')) return;

    const activeBtn = document.querySelector('#tabs .tab-btn.is-on');
    if (activeBtn) {
        omni.send('show-current-view', activeBtn.dataset.id);
    }
}

function addCustomApp() {
    const name = document.getElementById('custom-name').value.trim();
    let url = document.getElementById('custom-url').value.trim();
    const isIncognito = document.getElementById('incognito-check').checked;

    if (!name || !url) {
        showAlert('Missing Info', 'Please fill in both name and URL fields.');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    const parsedUrl = parseAppUrl(url);
    if (!parsedUrl) {
        showAlert('Invalid URL', 'Please enter a valid http or https URL.');
        return;
    }

    const btn = createTab(name, parsedUrl.toString(), isIncognito);
    if (!btn) {
        return;
    }
    btn.click();
    closeCustomModal();
    document.getElementById('incognito-check').checked = false;
}


tabsContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const afterElement = getDragAfterElement(tabsContainer, e.clientX);
    const draggable = document.querySelector('.dragging');
    if (draggable) {
        if (afterElement == null) {
            tabsContainer.appendChild(draggable);
        } else {
            tabsContainer.insertBefore(draggable, afterElement);
        }
    }
});

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.tab-btn:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Auto-Update Logic Integrated into Help Menu
let updateUrl = "";
let currentAppVersion = "---";

// HTML Elements
const helpVersionText = document.getElementById('help-version-text');
const updateActionBtn = document.getElementById('update-action-btn');
const versionStatusBadge = document.getElementById('version-status-badge');
const helpNotificationDot = document.getElementById('help-notification-dot');

omni.on('app-version', (version) => {
    currentAppVersion = version;
    if (helpVersionText) helpVersionText.textContent = `v${version}`;
    const aboutVer = document.getElementById('about-version');
    if (aboutVer) aboutVer.textContent = `Version ${version}`;
});

omni.on('update-status', (text) => {
    if (text.includes('App is up to date') || text.includes('Client is up to date')) {
        if (versionStatusBadge) {
            versionStatusBadge.classList.remove('hidden');
            versionStatusBadge.textContent = "Latest";
        }
        if (helpVersionText) helpVersionText.textContent = `v${currentAppVersion}`;
    } else if (text.toLowerCase().includes('error')) {
        if (helpVersionText) helpVersionText.textContent = "Error checking";
        console.error(text);
    } else {
        if (helpVersionText) helpVersionText.textContent = "Checking...";
    }
});

omni.on('update-available', (info) => {
    updateUrl = info.url;

    // 1. Show Red Dot on Help Icon
    if (helpNotificationDot) {
        helpNotificationDot.classList.remove('hidden');
    }

    // 2. Update Help Menu UI
    if (helpVersionText) helpVersionText.textContent = `v${currentAppVersion}`;

    if (versionStatusBadge) {
        versionStatusBadge.textContent = "UPDATE AVAILABLE";
        versionStatusBadge.classList.remove('bg-zinc-800', 'text-zinc-400', 'hidden');
        versionStatusBadge.classList.add('bg-green-500/10', 'text-green-500', 'border', 'border-green-500/20');
    }

    if (updateActionBtn) {
        updateActionBtn.classList.remove('hidden');
        updateActionBtn.classList.add('inline-flex');
    }
});

function restartAndInstall() {
    if (updateUrl) {
        omni.send('install-update', updateUrl);
    }
}

function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('omni-theme', 'light');
        omni.send('theme-changed', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('omni-theme', 'dark');
        omni.send('theme-changed', 'dark');
    }
}
