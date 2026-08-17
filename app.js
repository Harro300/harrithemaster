// Global state
let currentCalculator = '';
let mergeMode = false;
let frozenFirstResult = null;
let lastRawResult = null;
let mergeCount = 0;
let mergeLiveCommitted = false;
let settings = {
    gapOption: 8,
    paneCount: 1,
    kickPlateEnabled: true,
    sealThresholdEnabled: false,
    umpioviEnabled: false,
    umpivasikkaEnabled: false
};
const calculatorInputCache = {};

// Firebase state
let firebaseInitialized = false;
let currentUser = null;
let isAdmin = false;
let isCoordinator = false;
let formulaSetsUnsubscribe = null;
let mitatStateUnsubscribe = null;
let mitatInputsUnsubscribe = null;
let mitatStateLoaded = false;
let lastKnownJobCount = -1;
let pendingJobDeepLink = null;
let skipNextPaketitViewReload = false;
let deepLinkHighlightTimer = null;

// Admin email addresses
const ADMIN_EMAILS = [
    'admin@teras.fi',
    'admin@terasovi.local',
    'admin01@teras.local',
    'admin02@teras.local'
];
const COORDINATOR_EMAILS = [
    'koordinaattori@teras.fi',
    'logistiikka@teras.fi'
];

// ========== UTILITY FUNCTIONS ==========

// Show toast notification (textContent only — no HTML from message/title)
function showToast(message, type = 'info', title = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Assertive announcement for errors, polite otherwise (matches container).
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[type] || icons.info;

    const content = document.createElement('div');
    content.className = 'toast-content';

    if (title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.textContent = title;
        content.appendChild(titleEl);
    }

    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message == null ? '' : String(message);
    content.appendChild(messageEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Sulje ilmoitus');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toast.remove());

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Update sync status indicator
function updateSyncStatus(online) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;
    
    const indicator = statusEl.querySelector('.sync-indicator');
    const text = statusEl.querySelector('.sync-text');
    
    if (online) {
        statusEl.classList.remove('offline');
        statusEl.classList.add('online');
        indicator.textContent = '🟢';
        text.textContent = 'Online';
    } else {
        statusEl.classList.remove('online');
        statusEl.classList.add('offline');
        indicator.textContent = '🔴';
        text.textContent = 'Offline';
    }
}

// Check if user is admin
function checkIsAdmin(email) {
    return ADMIN_EMAILS.includes(email);
}

function checkIsCoordinator(email) {
    return COORDINATOR_EMAILS.includes(email);
}

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseReady) {
            resolve();
        } else {
            window.addEventListener('firebaseReady', () => resolve(), { once: true });
        }
    });
}

// ============================================
// MITAT FIREBASE SYNC HELPERS
// ============================================

function getMitatStateFromLocalStorage() {
    return {
        mittatData: JSON.parse(localStorage.getItem('mittatData') || '{}'),
        checkedMitat: JSON.parse(localStorage.getItem('checkedMitat') || '{}'),
        doneMitat: JSON.parse(localStorage.getItem('doneMitat') || '{}'),
        packedMitat: JSON.parse(localStorage.getItem('packedMitat') || '{}'),
        packedPackageNumbers: JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}'),
        hiddenMitatItems: JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}'),
        mittatNotes: JSON.parse(localStorage.getItem('mittatNotes') || '{}'),
        packedTimestamps: JSON.parse(localStorage.getItem('packedTimestamps') || '{}')
    };
}

function applyMitatStateToLocalStorage(state) {
    localStorage.setItem('mittatData', JSON.stringify(state.mittatData || {}));
    localStorage.setItem('checkedMitat', JSON.stringify(state.checkedMitat || {}));
    localStorage.setItem('doneMitat', JSON.stringify(state.doneMitat || {}));
    localStorage.setItem('packedMitat', JSON.stringify(state.packedMitat || {}));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(state.packedPackageNumbers || {}));
    localStorage.setItem('hiddenMitatItems', JSON.stringify(state.hiddenMitatItems || {}));
    localStorage.setItem('mittatNotes', JSON.stringify(state.mittatNotes || {}));
    localStorage.setItem('packedTimestamps', JSON.stringify(state.packedTimestamps || {}));
}

async function syncMitatStateToFirestore() {
    if (!window.firebase || !window.firebase.db || !currentUser || !mitatStateLoaded) {
        return;
    }

    const currentJobCount = Object.keys(
        JSON.parse(localStorage.getItem('mittatData') || '{}')
    ).length;
    if (currentJobCount === 0 && lastKnownJobCount > 0) {
        console.warn('Synkka estetty: mittatData on tyhjä mutta Firestoressa oli', lastKnownJobCount, 'työtä');
        return;
    }

    try {
        const { db, doc, setDoc, serverTimestamp } = window.firebase;
        const state = getMitatStateFromLocalStorage();
        // Overwrite full document to ensure deleted note keys are removed too.
        // Using merge:true would keep omitted map keys in Firestore.
        await setDoc(
            doc(db, 'mitatState', 'global'),
            {
                ...state,
                updatedBy: currentUser.email,
                updatedAt: serverTimestamp()
            }
        );
    } catch (error) {
        console.error('❌ Mitat-synkronointi Firestoreen epäonnistui:', error);
    }
}

function downloadBackup(source) {
    if (!isAdmin) {
        showToast('Vain admin voi ladata varmuuskopion.', 'warning');
        return;
    }
    const state = getMitatStateFromLocalStorage();
    const inputs = JSON.parse(localStorage.getItem('mitatInputs') || '{}');
    const backup = {
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser?.email || 'tuntematon',
        source,
        version: 1,
        mittatState: state,
        inputs
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${source}-varmuuskopio-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Varmuuskopio ladattu', 'success');
}

async function syncMitatInputsToFirestore() {
    if (!window.firebase || !window.firebase.db || !currentUser || !mitatStateLoaded) {
        return;
    }
    try {
        const { db, doc, setDoc } = window.firebase;
        const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
        const inputsMap = {};
        for (const jobNumber of Object.keys(mittatData)) {
            for (const itemName of Object.keys(mittatData[jobNumber])) {
                const item = mittatData[jobNumber][itemName];
                if (item && (item.inputs || item.inputsHistory)) {
                    if (!inputsMap[jobNumber]) inputsMap[jobNumber] = {};
                    inputsMap[jobNumber][itemName] = {
                        inputs: item.inputs || null,
                        inputsHistory: item.inputsHistory || null
                    };
                }
            }
        }
        await setDoc(doc(db, 'mitatState', 'inputs'), { inputs: inputsMap });
    } catch (error) {
        console.error('❌ Inputs-synkronointi Firestoreen epäonnistui:', error);
    }
}

// ========== JOB DEEP LINK (?tyo=) ==========

function readJobDeepLinkFromUrl() {
    try {
        const tyo = new URLSearchParams(window.location.search).get('tyo');
        if (tyo && String(tyo).trim()) {
            pendingJobDeepLink = String(tyo).trim();
        }
    } catch (error) {
        console.warn('Deep link URL-luku epäonnistui:', error);
    }
}

function jobDomId(prefix, jobNumber) {
    return `${prefix}-${String(jobNumber).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function isJobFullyPacked(jobNumber) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const itemNames = Object.keys(mittatData[jobNumber] || {});
    return itemNames.length > 0 &&
        itemNames.every((itemName) => packedMitat[`${jobNumber}-${itemName}`]);
}

function clearJobDeepLinkFromUrl() {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('tyo')) return;
        url.searchParams.delete('tyo');
        const search = url.searchParams.toString();
        const newUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
        history.replaceState(null, '', newUrl);
    } catch (error) {
        console.warn('Deep link URL-siivous epäonnistui:', error);
    }
}

function focusJobSection(jobId) {
    const itemsEl = document.getElementById(jobId);
    if (!itemsEl) return false;

    if (itemsEl.style.display === 'none') {
        toggleJobDetails(jobId);
    }

    const section = itemsEl.closest('.mitat-job-section') || itemsEl;
    section.classList.add('mitat-job-deep-link-target');
    if (deepLinkHighlightTimer) {
        clearTimeout(deepLinkHighlightTimer);
    }
    deepLinkHighlightTimer = setTimeout(() => {
        section.classList.remove('mitat-job-deep-link-target');
        deepLinkHighlightTimer = null;
    }, 2000);

    const mitatPanel = document.getElementById('mitatJobPanel');
    if (mitatPanel && mitatPanel.contains(section)) {
        mitatPanel.scrollTo({ top: 0, behavior: 'auto' });
    } else {
        section.scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    const sidebarBtn = document.querySelector('#mitatJobSidebar .mitat-sidebar-item--selected');
    if (sidebarBtn) {
        sidebarBtn.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
    return true;
}

function applyPendingJobDeepLink() {
    if (!pendingJobDeepLink || !mitatStateLoaded) return;

    const jobNumber = pendingJobDeepLink;
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');

    if (!Object.prototype.hasOwnProperty.call(mittatData, jobNumber)) {
        showToast(`Työnumeroa ${jobNumber} ei löytynyt.`, 'warning');
        pendingJobDeepLink = null;
        clearJobDeepLinkFromUrl();
        return;
    }

    if (isJobFullyPacked(jobNumber)) {
        const paketitView = document.getElementById('paketitView');
        const paketitVisible = paketitView && !paketitView.classList.contains('d-none');
        if (!paketitVisible) {
            // switchView → loadPaketitView → applyPendingJobDeepLink again (single focus)
            switchView('paketit');
            // Prevent mitatState listener from re-rendering Paketit in the same snapshot turn
            // (would collapse the accordion opened by focusJobSection).
            skipNextPaketitViewReload = true;
            return;
        }
        const jobId = jobDomId('paketit-job', jobNumber);
        if (focusJobSection(jobId)) {
            pendingJobDeepLink = null;
            clearJobDeepLinkFromUrl();
        } else {
            showToast(`Työnumeroa ${jobNumber} ei löytynyt paketeista.`, 'warning');
            pendingJobDeepLink = null;
            clearJobDeepLinkFromUrl();
        }
        return;
    }

    selectedMitatJobNumber = jobNumber;
    const mittatView = document.getElementById('mittatView');
    const mitatVisible = mittatView && !mittatView.classList.contains('d-none');
    if (!mitatVisible) {
        switchView('mitat');
        return;
    }

    const panelSection = document.querySelector('#mitatJobPanel .mitat-job-section');
    const panelJob = panelSection && panelSection.dataset.jobNumber
        ? decodeURIComponent(panelSection.dataset.jobNumber)
        : null;
    if (panelJob !== jobNumber) {
        loadMittatView();
        return;
    }

    const jobId = jobDomId('job', jobNumber);
    if (focusJobSection(jobId)) {
        pendingJobDeepLink = null;
        clearJobDeepLinkFromUrl();
    } else {
        showToast(`Työnumeroa ${jobNumber} ei löytynyt tuotannosta.`, 'warning');
        pendingJobDeepLink = null;
        clearJobDeepLinkFromUrl();
    }
}

function enterAuthenticatedApp() {
    const loginScreen = document.getElementById('loginScreen');
    if (!loginScreen || loginScreen.classList.contains('d-none')) {
        return;
    }

    console.log('🔵 Piilotetaan loginScreen...');
    loginScreen.classList.add('d-none');
    updateSyncStatus(true);
    setupRealtimeListeners();

    if (pendingJobDeepLink || isCoordinator) {
        console.log('🔵 Avataan Mitat-näkymä (deep link tai koordinaattori)');
        switchView('mitat');
    } else {
        console.log('🔵 Näytetään calculatorScreen...');
        document.getElementById('calculatorScreen').classList.remove('d-none');

        scannerEnabled = false;
        localStorage.setItem('scannerEnabled', 'false');
        const scanToggle = document.getElementById('scannerToggle');
        if (scanToggle) scanToggle.checked = false;
        const scannerPanel = document.getElementById('scannerPanel');
        const inputsRow = document.getElementById('calculatorInputsRow');
        if (scannerPanel) scannerPanel.style.display = 'none';
        if (inputsRow) inputsRow.style.display = '';
        const scanReviewCard = document.getElementById('scanReviewCard');
        if (scanReviewCard) scanReviewCard.style.display = 'none';

        pystypaneliEnabled = false;
        localStorage.setItem('pystypaneliEnabled', 'false');
        const pystypaneliToggle = document.getElementById('pystypaneliToggle');
        if (pystypaneliToggle) pystypaneliToggle.checked = false;

        verkkoEnabled = false;
        localStorage.setItem('verkkoEnabled', 'false');
        const verkkoToggle = document.getElementById('verkkoToggle');
        if (verkkoToggle) verkkoToggle.checked = false;
        updateCalculatorButtonVisibility();

        console.log('🔵 Valitaan default-laskuri...');
        selectCalculator('janisol-pariovi');
    }

    showToast(`Tervetuloa${isAdmin ? ' Admin' : ''}!`, 'success');
    console.log('✅ Kirjautuminen valmis!');
}

// Firebase Auth State Listener
async function initializeFirebaseAuth() {
    await waitForFirebase();
    
    const { auth, onAuthStateChanged } = window.firebase;
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('🔐 Käyttäjä kirjautunut:', user.email);
            currentUser = user;
            isAdmin = checkIsAdmin(user.email);
            isCoordinator = checkIsCoordinator(user.email);
            updateSyncStatus(true);
            updateAdminAccessUI();
            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen && !loginScreen.classList.contains('d-none')) {
                enterAuthenticatedApp();
            }
        } else {
            console.log('🔓 Ei kirjautunutta käyttäjää');
            currentUser = null;
            isAdmin = false;
            isCoordinator = false;
            updateSyncStatus(false);
            updateAdminAccessUI();
        }
    });
}

// Setup realtime listeners for Firestore
function setupRealtimeListeners() {
    stopRealtimeListeners();
    if (!window.firebase || !window.firebase.db) {
        console.warn('⚠️ Firebase ei ole saatavilla, käytetään vain localStoragea');
        return;
    }
    
    const { db, collection, onSnapshot, doc } = window.firebase;
    
    console.log('🎧 Aloitetaan reaaliaikainen kuuntelu...');
    
    // LISTENER 3: Formula sets collection
    try {
        console.log('🎧 Aloitetaan kaavasetit-listener...');
        let isFirstLoadFormulas = true;
        formulaSetsUnsubscribe = onSnapshot(
            collection(db, 'formulaSets'),
            (snapshot) => {
                console.log('🔔🔔🔔 KAAVASETIT PÄIVITETTY FIRESTORESTA!');
                console.log('  - Dokumentteja:', snapshot.size);
                console.log('  - Ensimmäinen lataus:', isFirstLoadFormulas);
                
                // Update localStorage backup
                const sets = {};
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const setName = data.name || doc.id;
                    console.log('  📋 Kaavasetti:', setName, '(ID:', doc.id, ')');
                    sets[setName] = {
                        ...data.formulas,
                        _firestoreId: doc.id,
                        _createdBy: data.createdBy,
                        _createdAt: data.createdAt
                    };
                });
                console.log('  - Kaavasetit yhteensä:', Object.keys(sets).length);
                localStorage.setItem('formulaSets', JSON.stringify(sets));
                
                // Refresh formula sets dropdown
                const select = document.getElementById('activeFormulaSet');
                if (select) {
                    const currentValue = select.value;
                    loadFormulaSetsList();
                    // Try to restore previous selection if it still exists
                    if (select.querySelector(`option[value="${currentValue}"]`)) {
                        select.value = currentValue;
                    }
                }
                
                // Show toast notifications (but not on first load)
                if (!isFirstLoadFormulas) {
                    snapshot.docChanges().forEach((change) => {
                        const data = change.doc.data();
                        if (change.type === "added") {
                            showToast(`Uusi kaavasetti: ${data.name}`, 'info');
                        } else if (change.type === "modified") {
                            showToast(`Kaavasetti päivitetty: ${data.name}`, 'info');
                        } else if (change.type === "removed") {
                            showToast(`Kaavasetti poistettu`, 'info');
                        }
                    });
                }
                isFirstLoadFormulas = false;
            },
            (error) => {
                console.error('❌ FormulaSets-kuunteluvirhe:', error);
            }
        );
    } catch (error) {
        console.error('❌ Virhe formulaSets-kuuntelijan luonnissa:', error);
    }

    // LISTENER 4: Mitat state document
    try {
        let isFirstLoadMitat = true;
        mitatStateUnsubscribe = onSnapshot(
            doc(db, 'mitatState', 'global'),
            (docSnapshot) => {
                if (!docSnapshot.exists()) {
                    return;
                }

                const data = docSnapshot.data();
                applyMitatStateToLocalStorage({
                    mittatData: data.mittatData || {},
                    checkedMitat: data.checkedMitat || {},
                    doneMitat: data.doneMitat || {},
                    packedMitat: data.packedMitat || {},
                    packedPackageNumbers: data.packedPackageNumbers || {},
                    hiddenMitatItems: data.hiddenMitatItems || {},
                    mittatNotes: data.mittatNotes || {},
                    packedTimestamps: data.packedTimestamps || {}
                });
                lastKnownJobCount = Object.keys(data.mittatData || {}).length;
                mitatStateLoaded = true;

                const isOwnUpdate = data.updatedBy === currentUser?.email;

                // Refresh Mitat view if visible.
                // Skip self-originated updates to avoid double-render flicker:
                // local actions already update UI immediately, while remote
                // updates from other users should still re-render in real time.
                const mittatView = document.getElementById('mittatView');
                if (mittatView && !mittatView.classList.contains('d-none') && (!isOwnUpdate || isFirstLoadMitat)) {
                    loadMittatView();
                }
                const paketitView = document.getElementById('paketitView');
                if (paketitView && !paketitView.classList.contains('d-none') && (!isOwnUpdate || isFirstLoadMitat)) {
                    if (skipNextPaketitViewReload) {
                        skipNextPaketitViewReload = false;
                    } else {
                        loadPaketitView();
                    }
                }

                if (isFirstLoadMitat || pendingJobDeepLink) {
                    applyPendingJobDeepLink();
                }

                if (!isFirstLoadMitat && !isOwnUpdate) {
                    showToast('Mitat-sivu päivitetty reaaliajassa', 'info');
                }
                isFirstLoadMitat = false;
            },
            (error) => {
                console.error('❌ MitatState-kuunteluvirhe:', error);
            }
        );
    } catch (error) {
        console.error('❌ Virhe mitatState-kuuntelijan luonnissa:', error);
    }

    // LISTENER 5: Mitat inputs document (erillinen pieni dokumentti luotettavaa inputs-synkronia varten)
    try {
        mitatInputsUnsubscribe = onSnapshot(
            doc(db, 'mitatState', 'inputs'),
            (docSnapshot) => {
                if (!docSnapshot.exists()) return;
                const data = docSnapshot.data();
                localStorage.setItem('mitatInputs', JSON.stringify(data.inputs || {}));
            },
            (error) => {
                console.error('❌ MitatInputs-kuunteluvirhe:', error);
            }
        );
    } catch (error) {
        console.error('❌ Virhe mitatInputs-kuuntelijan luonnissa:', error);
    }
    
    console.log('✅ Reaaliaikaiset kuuntelijat aktivoitu!');
}

// Stop realtime listeners
function stopRealtimeListeners() {
    console.log('🛑 Lopetetaan reaaliaikaiset kuuntelijat...');
    
    if (formulaSetsUnsubscribe) {
        formulaSetsUnsubscribe();
        formulaSetsUnsubscribe = null;
    }

    if (mitatStateUnsubscribe) {
        mitatStateUnsubscribe();
        mitatStateUnsubscribe = null;
    }

    if (mitatInputsUnsubscribe) {
        mitatInputsUnsubscribe();
        mitatInputsUnsubscribe = null;
    }
    
    console.log('✅ Kuuntelijat lopetettu');
}

// Global keyboard accessibility delegation.
// Custom role="button" divs and the preset-checkbox widget are not
// natively focusable/actionable; this makes Enter/Space activate them.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;

    const target = e.target;
    if (!target || typeof target.matches !== 'function') return;

    if (target.matches('[role="button"], .admin-accordion-header, .formula-sub-header, .mitat-job-header, .mitat-item-header')) {
        // Avoid double-firing when focus is inside a real <button> within the header.
        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
        e.preventDefault();
        target.click();
    }
});

// Close admin panel on Escape key.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('adminPanelOverlay');
    if (overlay && !overlay.classList.contains('d-none')) {
        closeAdminPanel();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Load kick plate setting
    const kickPlateEnabled = localStorage.getItem('kickPlateEnabled');
    if (kickPlateEnabled !== null) {
        settings.kickPlateEnabled = kickPlateEnabled === 'true';
        const toggle = document.getElementById('kickPlateToggle');
        if (toggle) toggle.checked = settings.kickPlateEnabled;
        
        // Update field visibility on page load
        const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
        if (kickPlateContainer) {
            kickPlateContainer.style.display = settings.kickPlateEnabled ? '' : 'none';
        }
    }

    // Load seal threshold setting
    const sealThresholdEnabled = localStorage.getItem('sealThresholdEnabled');
    if (sealThresholdEnabled !== null) {
        settings.sealThresholdEnabled = sealThresholdEnabled === 'true';
    }

    const umpioviEnabled = localStorage.getItem('umpioviEnabled');
    if (umpioviEnabled !== null) {
        settings.umpioviEnabled = umpioviEnabled === 'true';
    }

    const umpivasikkaEnabled = localStorage.getItem('umpivasikkaEnabled');
    if (umpivasikkaEnabled !== null) {
        settings.umpivasikkaEnabled = umpivasikkaEnabled === 'true';
    }
    
    // Initialize Firebase Auth listener
    readJobDeepLinkFromUrl();
    initializeFirebaseAuth();
    
    // Update settings info display
    updateSettingsInfo();
    updateCalculatorInputVisibility();
    bindSettingsLiveUpdateHandlers();
    initScanner();
    initPystypaneli();
    initVerkko();
});

// Valid passwords
const VALID_PASSWORDS = ['Soma<3', '1234'];

function isWindowCalculatorType(type = currentCalculator) {
    return Boolean(type && type.includes('ikkuna'));
}

function isVerkkoCalculatorType(type = currentCalculator) {
    return Boolean(type && String(type).startsWith('verkko-'));
}

function isDoorCalculatorType(type = currentCalculator) {
    return Boolean(type && !type.includes('ikkuna') && !String(type).startsWith('verkko-'));
}

function isUmpioviNoResultsMode() {
    return isDoorCalculatorType() &&
        settings.umpioviEnabled === true &&
        settings.kickPlateEnabled === false &&
        settings.sealThresholdEnabled === true;
}

const SCANNER_HIDDEN_SETTINGS = [
    'gapOptionSetting', 'paneCountSetting', 'calculatorTogglesRow',
    'umpioviSetting', 'umpivasikkaSetting', 'kickPlateSetting', 'sealThresholdSetting'
];

const VERKKO_HIDDEN_SETTINGS = [
    'gapOptionSetting', 'calculatorTogglesRow',
    'umpioviSetting', 'umpivasikkaSetting', 'kickPlateSetting', 'sealThresholdSetting'
];

const STANDARD_CALC_BUTTON_IDS = [
    'btn-janisol-pariovi', 'btn-janisol-kayntiovi',
    'btn-economy-kayntiovi', 'btn-economy-pariovi',
    'btn-janisol-ikkuna', 'btn-economy-ikkuna'
];

const WINDOW_CALC_BUTTON_IDS = ['btn-janisol-ikkuna', 'btn-economy-ikkuna'];

const VERKKO_CALC_BUTTON_IDS = ['btn-verkko-ovi', 'btn-verkko-seina'];

function hideScannerSettings() {
    SCANNER_HIDDEN_SETTINGS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function hideVerkkoSettings() {
    VERKKO_HIDDEN_SETTINGS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function updateCalculatorButtonVisibility() {
    STANDARD_CALC_BUTTON_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const hideWindow = pystypaneliEnabled && WINDOW_CALC_BUTTON_IDS.includes(id);
        el.classList.toggle('d-none', !!verkkoEnabled || hideWindow);
    });
    VERKKO_CALC_BUTTON_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('d-none', !verkkoEnabled);
    });
}

function updateCalculatorInputVisibility() {
    const peittoContainer = document.getElementById('pystypaneliYContainer');
    if (peittoContainer) {
        peittoContainer.style.display = (pystypaneliEnabled && !scannerEnabled && !verkkoEnabled) ? '' : 'none';
    }

    if (scannerEnabled) {
        hideScannerSettings();
        return;
    }
    if (verkkoEnabled || isVerkkoCalculatorType()) {
        hideVerkkoSettings();
        const mainWidthContainer = document.getElementById('mainDoorWidthContainer');
        const sideDoorContainer = document.getElementById('sideDoorWidthContainer');
        const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
        const paneInputsContainer = document.getElementById('paneHeightInputs');
        const paneCountSetting = document.getElementById('paneCountSetting');
        const isVerkkoSeinaMulti = currentCalculator === 'verkko-seina' && settings.paneCount > 1;
        if (mainWidthContainer) mainWidthContainer.style.display = isVerkkoSeinaMulti ? 'none' : '';
        if (sideDoorContainer) sideDoorContainer.style.display = 'none';
        if (kickPlateContainer) kickPlateContainer.style.display = 'none';
        if (paneInputsContainer) paneInputsContainer.style.display = '';
        if (paneCountSetting) paneCountSetting.style.display = '';
        return;
    }
    const isWindowCalculator = isWindowCalculatorType();
    const isPariovi = currentCalculator && currentCalculator.includes('pariovi');
    const isUmpiovi = isDoorCalculatorType() && settings.umpioviEnabled === true;

    const mainWidthContainer = document.getElementById('mainDoorWidthContainer');
    const sideDoorContainer = document.getElementById('sideDoorWidthContainer');
    const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
    const paneInputsContainer = document.getElementById('paneHeightInputs');

    if (mainWidthContainer) {
        if (isWindowCalculator && settings.paneCount > 1) {
            mainWidthContainer.style.display = 'none';
        } else {
            mainWidthContainer.style.display = '';
        }
    }

    if (sideDoorContainer) {
        if (isWindowCalculator) {
            sideDoorContainer.style.display = 'none';
        } else {
            sideDoorContainer.style.display = isPariovi ? 'block' : 'none';
        }
    }

    if (kickPlateContainer) {
        kickPlateContainer.style.display = settings.kickPlateEnabled ? '' : 'none';
    }

    if (paneInputsContainer) {
        paneInputsContainer.style.display = isUmpiovi ? 'none' : '';
    }

    const umpioviSettingEl = document.getElementById('umpioviSetting');
    if (umpioviSettingEl) {
        umpioviSettingEl.style.display = isWindowCalculator ? 'none' : '';
    }

    const sealThresholdSettingEl = document.getElementById('sealThresholdSetting');
    if (sealThresholdSettingEl) {
        sealThresholdSettingEl.style.display = isWindowCalculator ? 'none' : '';
    }

    const gapOptionSettingEl = document.getElementById('gapOptionSetting');
    if (gapOptionSettingEl) {
        gapOptionSettingEl.style.display = isWindowCalculator ? 'none' : '';
    }

    const umpivasikkaSettingEl = document.getElementById('umpivasikkaSetting');
    if (umpivasikkaSettingEl) {
        const showUmpivasikka = isPariovi && !settings.umpioviEnabled;
        umpivasikkaSettingEl.style.display = showUmpivasikka ? '' : 'none';
    }
}

function bindSettingsLiveUpdateHandlers() {
    const settingIds = ['gapOption', 'paneCount', 'kickPlateToggle', 'sealThresholdToggle', 'umpioviToggle', 'umpivasikkaToggle'];

    settingIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.liveApplyBound === '1') return;

        // Ensure result updates immediately from settings controls.
        el.addEventListener('input', applySettings);
        el.addEventListener('change', applySettings);
        el.dataset.liveApplyBound = '1';
    });
}

function updateAdminAccessUI() {
    const adminLockButton = document.getElementById('adminLockButton');
    if (adminLockButton) {
        adminLockButton.style.display = isAdmin ? '' : 'none';
    }

    const laskinToggleMain = document.getElementById('btn-view-laskin');
    const laskinToggleMitat = document.getElementById('btn-view-laskin-2');
    const laskinTogglePaketit = document.getElementById('btn-view-laskin-3');
    if (laskinToggleMain) {
        laskinToggleMain.style.display = isCoordinator ? 'none' : '';
    }
    if (laskinToggleMitat) {
        laskinToggleMitat.style.display = isCoordinator ? 'none' : '';
    }
    if (laskinTogglePaketit) {
        laskinTogglePaketit.style.display = isCoordinator ? 'none' : '';
    }
}

// Wait for DOM to be ready before attaching login handler
function attachLoginHandler() {
    console.log('🔵 Yritetään liittää login event listener...');
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        console.error('❌ VIRHE: loginForm-elementtiä ei löydy!');
        return;
    }
    console.log('✅ loginForm löytyi, liitetään event listener');

    // Login handling with Firebase
    loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log('🔵 Login-lomake lähetetty!');
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    console.log('🔵 Email:', email);
    console.log('🔵 Odotetaan Firebasea...');
    
    // Wait for Firebase to be ready
    await waitForFirebase();
    console.log('✅ Firebase valmis!');
    
    // Validate email format
    if (!email.includes('@')) {
        console.log('❌ Virheellinen email-muoto');
        errorDiv.textContent = 'Anna kelvollinen sähköpostiosoite.';
        errorDiv.classList.add('show');
        document.getElementById('email').classList.add('is-invalid');
        return;
    }
    
    console.log('🔵 Haetaan Firebase auth ja signIn...');
    // Try to sign in with Firebase directly with provided email and password
    const { auth, signIn } = window.firebase;
    console.log('🔵 Firebase auth:', auth ? 'OK' : 'PUUTTUU');
    console.log('🔵 signIn-funktio:', signIn ? 'OK' : 'PUUTTUU');
    
    try {
        console.log('🔵 Yritetään kirjautua Firebaseen...');
        const userCredential = await signIn(auth, email, password);
        console.log('✅ Firebase kirjautuminen onnistui:', userCredential.user.email);
        
        // Clear error and form
        errorDiv.classList.remove('show');
        errorDiv.textContent = '';
        document.getElementById('email').classList.remove('is-invalid');
        document.getElementById('password').classList.remove('is-invalid');
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
        // Update global state
        currentUser = userCredential.user;
        isAdmin = checkIsAdmin(currentUser.email);
        isCoordinator = checkIsCoordinator(currentUser.email);
        console.log('🔵 Käyttäjä asetettu:', currentUser.email, 'Admin:', isAdmin);
        updateAdminAccessUI();
        enterAuthenticatedApp();
        
    } catch (error) {
        console.error('❌ Firebase kirjautuminen epäonnistui:', error);
        
        // Show appropriate error message based on error code
        let errorMessage = 'Kirjautuminen epäonnistui.';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Käyttäjää ei löydy. Tarkista sähköposti.';
            document.getElementById('email').classList.add('is-invalid');
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Väärä salasana. Yritä uudelleen.';
            document.getElementById('password').classList.add('is-invalid');
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Virheellinen sähköpostiosoite.';
            document.getElementById('email').classList.add('is-invalid');
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Verkkovirhe. Tarkista internet-yhteys.';
        } else {
            errorMessage = `Virhe: ${error.message}`;
        }
        
        errorDiv.textContent = errorMessage;
        errorDiv.classList.add('show');
    }
    });
}

// Attach login handler when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLoginHandler);
} else {
    // DOM already loaded
    attachLoginHandler();
}

// Logout
// Switch between Laskin, Mitat and Paketit views
function switchView(view) {
    const calculatorScreen = document.getElementById('calculatorScreen');
    const mittatView = document.getElementById('mittatView');
    const paketitView = document.getElementById('paketitView');

    if (isCoordinator && view === 'laskin') {
        showToast('Koordinaattori-käyttäjällä on pääsy vain Mitat-sivulle.', 'warning');
        view = 'mitat';
    }

    if (view !== 'mitat' && isMitatPanelFullscreen) {
        setMitatPanelFullscreen(false);
    }

    if (calculatorScreen) calculatorScreen.classList.add('d-none');
    if (mittatView) mittatView.classList.add('d-none');
    if (paketitView) paketitView.classList.add('d-none');

    if (view === 'laskin') {
        if (calculatorScreen) calculatorScreen.classList.remove('d-none');
    } else if (view === 'mitat') {
        if (mittatView) mittatView.classList.remove('d-none');
        loadMittatView();
    } else if (view === 'paketit') {
        if (paketitView) paketitView.classList.remove('d-none');
        loadPaketitView();
    }

    const allViews = ['laskin', 'mitat', 'paketit'];
    const toggleGroups = [
        ['btn-view-laskin', 'btn-view-mitat', 'btn-view-paketit'],
        ['btn-view-laskin-2', 'btn-view-mitat-2', 'btn-view-paketit-2'],
        ['btn-view-laskin-3', 'btn-view-mitat-3', 'btn-view-paketit-3']
    ];
    toggleGroups.forEach((group) => {
        group.forEach((buttonId, index) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.toggle('active', allViews[index] === view);
            }
        });
    });
}

async function logout() {
    // Stop realtime listeners first
    stopRealtimeListeners();
    mitatStateLoaded = false;
    lastKnownJobCount = -1;

    if (isMitatPanelFullscreen) {
        setMitatPanelFullscreen(false);
    }
    
    // Sign out from Firebase
    if (window.firebase && currentUser) {
        try {
            await window.firebase.signOut(window.firebase.auth);
            console.log('✅ Firebase uloskirjautuminen onnistui');
        } catch (error) {
            console.error('❌ Uloskirjautumisvirhe:', error);
        }
    }
    
    // Clear state
    currentUser = null;
    isAdmin = false;
    isCoordinator = false;
    currentCalculator = '';
    updateAdminAccessUI();
    
    // Update UI
    document.getElementById('calculatorScreen').classList.add('d-none');
    document.getElementById('mittatView').classList.add('d-none');
    const paketitView = document.getElementById('paketitView');
    if (paketitView) {
        paketitView.classList.add('d-none');
    }
    document.getElementById('loginScreen').classList.remove('d-none');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('email').classList.remove('is-invalid');
    document.getElementById('password').classList.remove('is-invalid');
    updateSyncStatus(false);
    
    showToast('Uloskirjauduttu', 'info');
}

// Select calculator
function saveCalculatorInputs() {
    if (!currentCalculator) return;
    const entry = {
        mainDoorWidth: document.getElementById('mainDoorWidth')?.value,
        sideDoorWidth: document.getElementById('sideDoorWidth')?.value,
        kickPlateHeight: document.getElementById('kickPlateHeight')?.value,
        gapOption: settings.gapOption,
        paneCount: settings.paneCount,
        kickPlateEnabled: settings.kickPlateEnabled,
        sealThresholdEnabled: settings.sealThresholdEnabled,
        umpioviEnabled: settings.umpioviEnabled,
        umpivasikkaEnabled: settings.umpivasikkaEnabled,
        paneHeights: [],
        paneWidths: []
    };
    for (let i = 1; i <= settings.paneCount; i++) {
        entry.paneHeights.push(document.getElementById(`paneHeight${i}`)?.value || '800');
        entry.paneWidths.push(document.getElementById(`paneWidth${i}`)?.value || '800');
    }
    calculatorInputCache[currentCalculator] = entry;
}

function selectCalculator(type) {
    if (pystypaneliEnabled && type && type.includes('ikkuna')) {
        type = 'janisol-pariovi';
    }
    saveCalculatorInputs();
    currentCalculator = type;
    
    // Update button states
    const buttons = document.querySelectorAll('.btn-group .btn-outline-primary');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btn-${type}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const isWindowCalculator = type.includes('ikkuna');
    const isVerkkoCalculator = type.startsWith('verkko-');
    const cached = calculatorInputCache[type];
    
    const mainDoorInput = document.getElementById('mainDoorWidth');
    const mainDoorLabel = document.getElementById('mainDoorWidthLabel');
    
    if (mainDoorInput && mainDoorLabel) {
        if (isVerkkoCalculator) {
            mainDoorLabel.textContent = 'Leveys (mm)';
            mainDoorInput.min = type === 'verkko-seina' ? '100' : '500';
            mainDoorInput.value = cached ? cached.mainDoorWidth : '765';
        } else if (isWindowCalculator) {
            mainDoorLabel.textContent = 'Ruudun leveys (mm)';
            mainDoorInput.min = '100';
            mainDoorInput.value = cached ? cached.mainDoorWidth : '800';
        } else {
            mainDoorLabel.textContent = 'Käyntioven leveys (mm)';
            mainDoorInput.min = '500';
            mainDoorInput.value = cached ? cached.mainDoorWidth : '795';
        }
    }
    
    const sideDoorInput = document.getElementById('sideDoorWidth');
    if (sideDoorInput && cached) {
        sideDoorInput.value = cached.sideDoorWidth;
    }
    
    const kickPlateInput = document.getElementById('kickPlateHeight');
    if (kickPlateInput && cached) {
        kickPlateInput.value = cached.kickPlateHeight;
    }
    
    const savedKickPlateEnabled = localStorage.getItem('kickPlateEnabled');
    const kickPlateEnabled = cached?.kickPlateEnabled !== undefined
        ? cached.kickPlateEnabled
        : (savedKickPlateEnabled !== null ? savedKickPlateEnabled === 'true' : true);
    const savedSealThresholdEnabled = localStorage.getItem('sealThresholdEnabled');
    const sealThresholdEnabled = cached?.sealThresholdEnabled !== undefined
        ? cached.sealThresholdEnabled
        : (savedSealThresholdEnabled !== null ? savedSealThresholdEnabled === 'true' : false);
    const savedUmpioviEnabled = localStorage.getItem('umpioviEnabled');
    const umpioviEnabled = cached?.umpioviEnabled !== undefined
        ? cached.umpioviEnabled
        : (savedUmpioviEnabled !== null ? savedUmpioviEnabled === 'true' : false);
    const savedUmpivasikkaEnabled = localStorage.getItem('umpivasikkaEnabled');
    const umpivasikkaEnabled = cached?.umpivasikkaEnabled !== undefined
        ? cached.umpivasikkaEnabled
        : (savedUmpivasikkaEnabled !== null ? savedUmpivasikkaEnabled === 'true' : false);
    
    settings = {
        gapOption: cached ? cached.gapOption : 8,
        paneCount: cached ? cached.paneCount : 1,
        kickPlateEnabled: kickPlateEnabled,
        sealThresholdEnabled: sealThresholdEnabled,
        umpioviEnabled: umpioviEnabled,
        umpivasikkaEnabled: umpivasikkaEnabled
    };
    document.getElementById('gapOption').value = String(settings.gapOption);
    document.getElementById('paneCount').value = String(settings.paneCount);
    
    const kickPlateToggle = document.getElementById('kickPlateToggle');
    if (kickPlateToggle) {
        kickPlateToggle.checked = kickPlateEnabled;
    }
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) {
        sealThresholdToggle.checked = sealThresholdEnabled;
    }
    const umpioviToggle = document.getElementById('umpioviToggle');
    if (umpioviToggle) {
        umpioviToggle.checked = umpioviEnabled;
    }
    const umpivasikkaToggle = document.getElementById('umpivasikkaToggle');
    if (umpivasikkaToggle) {
        umpivasikkaToggle.checked = umpivasikkaEnabled;
    }
    
    updatePaneInputs();
    
    if (cached) {
        cached.paneHeights.forEach((val, i) => {
            const el = document.getElementById(`paneHeight${i + 1}`);
            if (el) el.value = val;
        });
        cached.paneWidths.forEach((val, i) => {
            const el = document.getElementById(`paneWidth${i + 1}`);
            if (el) el.value = val;
        });
    }
    
    updateCalculatorInputVisibility();
    updateSettingsInfo();
    calculate();
}

// Open settings modal
function openSettings() {
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');

    // Update kick plate toggle state
    const kickPlateToggle = document.getElementById('kickPlateToggle');
    if (kickPlateToggle) {
        kickPlateToggle.checked = settings.kickPlateEnabled !== false;
    }
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) {
        sealThresholdToggle.checked = settings.sealThresholdEnabled === true;
    }
    const umpioviToggle = document.getElementById('umpioviToggle');
    if (umpioviToggle) {
        umpioviToggle.checked = settings.umpioviEnabled === true;
    }
    const umpivasikkaToggle = document.getElementById('umpivasikkaToggle');
    if (umpivasikkaToggle) {
        umpivasikkaToggle.checked = settings.umpivasikkaEnabled === true;
    }
    const pystypaneliToggle = document.getElementById('pystypaneliToggle');
    if (pystypaneliToggle) {
        pystypaneliToggle.checked = pystypaneliEnabled === true;
    }
    const verkkoToggle = document.getElementById('verkkoToggle');
    if (verkkoToggle) {
        verkkoToggle.checked = verkkoEnabled === true;
    }
    
    // Hide door-specific settings for window calculators (skip when scanner/verkko is active)
    if (!scannerEnabled && !verkkoEnabled) {
        const gapOptionSetting = document.getElementById('gapOptionSetting');
        const umpioviSetting = document.getElementById('umpioviSetting');
        const kickPlateSetting = document.getElementById('kickPlateSetting');
        const sealThresholdSetting = document.getElementById('sealThresholdSetting');

        if (gapOptionSetting) {
            gapOptionSetting.style.display = isWindowCalculator ? 'none' : '';
        }
        if (umpioviSetting) {
            umpioviSetting.style.display = isWindowCalculator ? 'none' : '';
        }
        if (kickPlateSetting) {
            kickPlateSetting.style.display = '';
        }
        if (sealThresholdSetting) {
            sealThresholdSetting.style.display = isWindowCalculator ? 'none' : '';
        }
    } else if (verkkoEnabled) {
        hideVerkkoSettings();
    } else {
        hideScannerSettings();
    }

    // Keep formula set options and selection in sync for all users
    loadFormulaSetsList();
    
    modal.show();
}

// Update settings info display
function updateSettingsInfo() {
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const gapSettingEl = document.getElementById('currentGapSetting');
    const formulaSetEl = document.getElementById('currentFormulaSet');
    const settingsInfoEl = document.getElementById('currentSettingsInfo');
    
    if (!settingsInfoEl) return;
    
    settingsInfoEl.style.visibility = 'visible';
    
    const gapRow = gapSettingEl ? gapSettingEl.parentElement : null;
    if (gapRow) {
        gapRow.style.display = isWindowCalculator ? 'none' : '';
    }
    
    if (!isWindowCalculator && gapSettingEl) {
        let gapText = '';
        if (settings.gapOption === 'saneeraus') {
            gapText = 'Saneerauskynnys';
        } else {
            gapText = `${settings.gapOption} mm rako`;
        }
        gapSettingEl.textContent = gapText;
    }
    
    // Update formula set text (always shown)
    if (formulaSetEl) {
        const activeSetName = localStorage.getItem('activeFormulaSet') || 'default';
        if (activeSetName === 'default') {
            formulaSetEl.textContent = 'Default Kaavat';
        } else {
            formulaSetEl.textContent = activeSetName;
        }
    }

}

// Apply settings
function applySettings() {
    const gapValue = document.getElementById('gapOption').value;
    settings.gapOption = gapValue === 'saneeraus' ? 'saneeraus' : parseInt(gapValue);
    settings.paneCount = parseInt(document.getElementById('paneCount').value);
    settings.kickPlateEnabled = document.getElementById('kickPlateToggle').checked;
    settings.sealThresholdEnabled = !!document.getElementById('sealThresholdToggle')?.checked;
    settings.umpioviEnabled = !!document.getElementById('umpioviToggle')?.checked;
    settings.umpivasikkaEnabled = !!document.getElementById('umpivasikkaToggle')?.checked;
    
    // Save settings to localStorage
    localStorage.setItem('kickPlateEnabled', settings.kickPlateEnabled);
    localStorage.setItem('sealThresholdEnabled', settings.sealThresholdEnabled);
    localStorage.setItem('umpioviEnabled', settings.umpioviEnabled);
    localStorage.setItem('umpivasikkaEnabled', settings.umpivasikkaEnabled);
    
    const savedPaneValues = [];
    for (let i = 1; i <= settings.paneCount; i++) {
        savedPaneValues.push({
            height: document.getElementById(`paneHeight${i}`)?.value,
            width: document.getElementById(`paneWidth${i}`)?.value
        });
    }

    updatePaneInputs();

    savedPaneValues.forEach((val, i) => {
        if (val.height) {
            const el = document.getElementById(`paneHeight${i + 1}`);
            if (el) el.value = val.height;
        }
        if (val.width) {
            const el = document.getElementById(`paneWidth${i + 1}`);
            if (el) el.value = val.width;
        }
    });

    updateCalculatorInputVisibility();
    updateSettingsInfo();
    calculate();
}

// Fill all fields below with the same value
function fillFieldsBelow(currentIndex, fieldType) {
    const totalPanes = settings.paneCount;
    
    // Get current field value
    const currentField = document.getElementById(`${fieldType}${currentIndex}`);
    if (!currentField) return;
    
    const value = currentField.value;
    
    // Fill all fields below (from currentIndex+1 to totalPanes)
    for (let i = currentIndex + 1; i <= totalPanes; i++) {
        const fieldBelow = document.getElementById(`${fieldType}${i}`);
        if (fieldBelow) {
            fieldBelow.value = value;
        }
    }
    
    // Trigger calculation after filling
    calculate();
}

// Update pane height inputs based on pane count
function updatePaneInputs() {
    const container = document.getElementById('paneHeightInputs');
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const isVerkkoSeinaMulti = currentCalculator === 'verkko-seina' && settings.paneCount > 1;
    const isUmpioviMode = isDoorCalculatorType() && settings.umpioviEnabled === true;

    if (isUmpioviMode) {
        container.className = 'col-md-6 col-lg-3';
        container.innerHTML = '';
        return;
    }
    
    // For window / verkkoseinä calculators with multiple panes, show width + height for each
    if ((isWindowCalculator || isVerkkoSeinaMulti) && settings.paneCount > 1) {
    container.innerHTML = '';
        container.className = 'col-12';
        
        for (let i = 1; i <= settings.paneCount; i++) {
            // Create a new row for each pane
            const row = document.createElement('div');
            row.className = 'row';
            
            // Width input
            const colWidth = document.createElement('div');
            colWidth.className = 'col-md-6 col-lg-3';
            
            const divWidth = document.createElement('div');
            divWidth.className = 'mb-3';
            
            const labelWidth = document.createElement('label');
            labelWidth.className = 'form-label';
            labelWidth.htmlFor = `paneWidth${i}`;
            labelWidth.textContent = `Ruutu ${i} leveys (mm)`;
            
            // Input group with button
            const inputGroupWidth = document.createElement('div');
            inputGroupWidth.className = 'input-group';
            
            const inputWidth = document.createElement('input');
            inputWidth.type = 'number';
            inputWidth.className = 'form-control';
            inputWidth.id = `paneWidth${i}`;
            inputWidth.min = '100';
            inputWidth.value = '800';
            inputWidth.oninput = calculate;
            
            const buttonWidth = document.createElement('button');
            buttonWidth.className = 'btn btn-outline-secondary';
            buttonWidth.type = 'button';
            buttonWidth.innerHTML = '↓';
            buttonWidth.title = 'Täytä kaikki alla olevat leveys-kentät';
            buttonWidth.onclick = () => fillFieldsBelow(i, 'paneWidth');
            
            inputGroupWidth.appendChild(inputWidth);
            inputGroupWidth.appendChild(buttonWidth);
            
            divWidth.appendChild(labelWidth);
            divWidth.appendChild(inputGroupWidth);
            colWidth.appendChild(divWidth);
            row.appendChild(colWidth);
            
            // Height input
            const colHeight = document.createElement('div');
            colHeight.className = 'col-md-6 col-lg-3';
            
            const divHeight = document.createElement('div');
            divHeight.className = 'mb-3';
            
            const labelHeight = document.createElement('label');
            labelHeight.className = 'form-label';
            labelHeight.htmlFor = `paneHeight${i}`;
            labelHeight.textContent = `Ruutu ${i} korkeus (mm)`;
            
            // Input group with button
            const inputGroupHeight = document.createElement('div');
            inputGroupHeight.className = 'input-group';
            
            const inputHeight = document.createElement('input');
            inputHeight.type = 'number';
            inputHeight.className = 'form-control';
            inputHeight.id = `paneHeight${i}`;
            inputHeight.min = '100';
            inputHeight.value = '800';
            inputHeight.oninput = calculate;
            
            const buttonHeight = document.createElement('button');
            buttonHeight.className = 'btn btn-outline-secondary';
            buttonHeight.type = 'button';
            buttonHeight.innerHTML = '↓';
            buttonHeight.title = 'Täytä kaikki alla olevat korkeus-kentät';
            buttonHeight.onclick = () => fillFieldsBelow(i, 'paneHeight');
            
            inputGroupHeight.appendChild(inputHeight);
            inputGroupHeight.appendChild(buttonHeight);
            
            divHeight.appendChild(labelHeight);
            divHeight.appendChild(inputGroupHeight);
            colHeight.appendChild(divHeight);
            row.appendChild(colHeight);
            
            // Append this row to the container
            container.appendChild(row);
        }
    }
    // For door calculators or single pane windows
    else if (settings.paneCount > 1) {
        container.innerHTML = '';
        container.className = 'col-12';
        const row = document.createElement('div');
        row.className = 'row';
        
        for (let i = 1; i <= settings.paneCount; i++) {
            const col = document.createElement('div');
            col.className = 'col-md-6 col-lg-3';
            
        const div = document.createElement('div');
        div.className = 'mb-3';
            
            const label = document.createElement('label');
            label.className = 'form-label';
            label.htmlFor = `paneHeight${i}`;
            label.textContent = `Ruutu ${i} korkeus (mm)`;
            
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'form-control';
            input.id = `paneHeight${i}`;
            input.min = '100';
            input.value = '800';
            input.oninput = calculate;
            
            div.appendChild(label);
            div.appendChild(input);
            col.appendChild(div);
            row.appendChild(col);
        }
        container.appendChild(row);
    } else {
        // Single pane - restore original structure
        container.className = 'col-md-6 col-lg-3';
        container.innerHTML = '';
        
        const div = document.createElement('div');
        div.className = 'mb-3';
        
        const label = document.createElement('label');
        label.className = 'form-label';
        label.htmlFor = 'paneHeight1';
        label.textContent = 'Ruudun korkeus (mm)';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control';
        input.id = 'paneHeight1';
        input.min = '100';
        input.value = '800';
        input.oninput = calculate;
        
        div.appendChild(label);
        div.appendChild(input);
        container.appendChild(div);
    }
}

// Main calculation function
function calculate() {
    if (!currentCalculator) return;
    
    // Get inputs
    const mainDoorWidth = parseInt(document.getElementById('mainDoorWidth').value) || 0;
    const sideDoorWidth = parseInt(document.getElementById('sideDoorWidth').value) || 0;
    const kickPlateHeight = parseInt(document.getElementById('kickPlateHeight').value) || 0;
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const isUmpioviMode = isDoorCalculatorType() && settings.umpioviEnabled === true;

    if (isUmpioviNoResultsMode()) {
        let html = '<p class="text-muted">Umpiovi + Tiivistekynnys ilman potkupeltiä: ei laskettavia mittoja.</p>';
        if (pystypaneliEnabled) html += `<div class="row">${buildPystypaneliResultsHtml()}</div>`;
        document.getElementById('results').innerHTML = html;
        return;
    }
    
    const paneHeights = [];
    const paneWidths = [];
    const isVerkkoSeina = currentCalculator === 'verkko-seina';
    const isVerkkoSeinaMulti = isVerkkoSeina && settings.paneCount > 1;
    
    // Umpiovi mode does not use pane inputs.
    if (!isUmpioviMode) {
        // For window / verkkoseinä calculators with multiple panes, collect widths and heights
        if ((isWindowCalculator || isVerkkoSeinaMulti) && settings.paneCount > 1) {
            for (let i = 1; i <= settings.paneCount; i++) {
                const widthEl = document.getElementById(`paneWidth${i}`);
                const heightEl = document.getElementById(`paneHeight${i}`);
                const width = parseInt(widthEl?.value) || 0;
                const height = parseInt(heightEl?.value) || 0;
                paneWidths.push(width);
                paneHeights.push(height);
            }
        } else {
            // For doors or single pane windows/verkkoseinä, collect heights only
            for (let i = 1; i <= settings.paneCount; i++) {
                const heightEl = document.getElementById(`paneHeight${i}`);
                const height = parseInt(heightEl?.value) || 0;
                paneHeights.push(height);
            }
            // For single pane windows / verkkoseinä, use mainDoorWidth as the only width
            if (isWindowCalculator || isVerkkoSeina) {
                paneWidths.push(mainDoorWidth);
            }
        }
    }
    
    // Validate inputs
    const isVerkkoCalculator = isVerkkoCalculatorType();
    if (!isWindowCalculator && !isVerkkoSeina && mainDoorWidth < 500) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Leveys ≥ 500 mm.</p>';
        return;
    }
    
    if ((isWindowCalculator || isVerkkoSeina) && settings.paneCount === 1 && mainDoorWidth < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Ruudun leveys ≥ 100 mm.</p>';
        return;
    }

    if (isVerkkoSeinaMulti && paneWidths.some(w => w < 100)) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Ruudun leveys ≥ 100 mm.</p>';
        return;
    }
    
    if (!isVerkkoCalculator && settings.kickPlateEnabled && kickPlateHeight < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Potkupellin korkeus ≥ 100 mm.</p>';
            return;
    }
    
    let results = {};
    
    // Calculate based on calculator type
    if (isVerkkoCalculator) {
        results = calculateVerkko(
            mainDoorWidth,
            paneHeights,
            isVerkkoSeina ? paneWidths : null,
            currentCalculator
        );
    } else if (currentCalculator === 'janisol-pariovi') {
        results = isUmpioviMode
            ? calculateUmpioviResults(mainDoorWidth, sideDoorWidth, kickPlateHeight, 'janisol-pariovi')
            : calculateJanisolPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'janisol-kayntiovi') {
        results = isUmpioviMode
            ? calculateUmpioviResults(mainDoorWidth, 0, kickPlateHeight, 'janisol-kayntiovi')
            : calculateJanisolKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'janisol-ikkuna') {
        results = calculateJanisolIkkuna(paneWidths, paneHeights, kickPlateHeight);
    } else if (currentCalculator === 'economy-pariovi') {
        results = isUmpioviMode
            ? calculateUmpioviResults(mainDoorWidth, sideDoorWidth, kickPlateHeight, 'economy-pariovi')
            : calculateEconomyPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-kayntiovi') {
        results = isUmpioviMode
            ? calculateUmpioviResults(mainDoorWidth, 0, kickPlateHeight, 'economy-kayntiovi')
            : calculateEconomyKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-ikkuna') {
        results = calculateEconomyIkkuna(paneWidths, paneHeights, kickPlateHeight);
    }
    
    lastRawResult = results;
    if (mergeMode && frozenFirstResult) {
        mergeLiveCommitted = false;
        let mergeRaw = results;
        if (currentCalculator.includes('ikkuna') && settings.kickPlateEnabled && kickPlateHeight > 0) {
            mergeRaw = currentCalculator === 'janisol-ikkuna'
                ? calculateJanisolIkkuna(paneWidths, paneHeights, kickPlateHeight, true)
                : calculateEconomyIkkuna(paneWidths, paneHeights, kickPlateHeight, true);
        }
        const secondData = formatResultToData(mergeRaw, currentCalculator, {...settings});
        const incoming = {
            data: secondData,
            calculator: currentCalculator,
            lasilistaSize: '',
            lasilistaColor: '',
            inputs: captureCurrentInputsForMerge(),
            timestamp: new Date().toISOString()
        };
        const merged = mergeResults(frozenFirstResult, incoming);
        displayMergedResults(merged.data);
    } else {
        displayResults(results);
    }
}

function getGapFormulaSuffix() {
    if (settings.gapOption === 'saneeraus') return 'saneeraus';
    if (settings.gapOption === 10 || settings.gapOption === '10mm' || settings.gapOption === '10') return '10mm';
    if (settings.gapOption === 15 || settings.gapOption === '15mm' || settings.gapOption === '15') return '15mm';
    return '8mm';
}

function getUretaaniHeightAdjust(activeFormulas, fallbackValue) {
    const gapSuffix = getGapFormulaSuffix();
    const normalKey = `uretaani_${gapSuffix}`;
    const sealKey = `tiiviste_uretaani_${gapSuffix}`;

    if (settings.sealThresholdEnabled) {
        return activeFormulas[sealKey] ?? activeFormulas[normalKey] ?? fallbackValue;
    }
    return activeFormulas[normalKey] ?? fallbackValue;
}

function getSealPotkuHeightAdjust(activeFormulas, type) {
    const gapSuffix = getGapFormulaSuffix();
    const key = `tiiviste_potku_${type}_${gapSuffix}`;
    return activeFormulas[key];
}

function getUmpioviFormulaSet(calculatorType, formulas) {
    if (calculatorType === 'janisol-pariovi') return formulas.janisol_pariovi;
    if (calculatorType === 'janisol-kayntiovi') return formulas.janisol_kayntiovi;
    if (calculatorType === 'economy-pariovi') return formulas.economy_pariovi;
    if (calculatorType === 'economy-kayntiovi') return formulas.economy_kayntiovi;
    return null;
}

function getUmpioviHarjalistaAdjust(calculatorType, formulas) {
    if (calculatorType.startsWith('janisol')) return formulas?.janisol_pariovi?.harjalista ?? 141;
    return formulas?.economy_pariovi?.harjalista ?? 141;
}

function calculateUmpioviResults(mainWidth, sideWidth, kickHeight, calculatorType) {
    const formulas = getPanelAwareFormulas();
    const activeFormulaSet = getUmpioviFormulaSet(calculatorType, formulas);
    const harjalistaAdjust = getUmpioviHarjalistaAdjust(calculatorType, formulas);

    const isPariovi = calculatorType && calculatorType.includes('pariovi');
    const leaves = isPariovi
        ? [{ width: mainWidth, type: 'main' }, { width: sideWidth, type: 'side' }]
        : [{ width: mainWidth, type: 'main' }];

    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: leaves.map((leaf) => leaf.width + harjalistaAdjust)
    };

    if (settings.kickPlateEnabled) {
        const isJanisol = calculatorType.startsWith('janisol');
        const fallbackInnerHeight = isJanisol ? -67 : -65;
        const fallbackInnerWidth = isJanisol ? 115 : 110;
        const fallbackOuterHeight = isJanisol ? -18 : -20;
        const fallbackOuterWidth = isJanisol ? 165 : 160;
        const gapSuffix = getGapFormulaSuffix();

        leaves.forEach((leaf) => {
            const width = leaf.width;
            const useSideFormulas = isPariovi && leaf.type === 'side';

            const gapInnerHeight = activeFormulaSet?.[`umpiovi_potku_sisa_${gapSuffix}`];
            const gapOuterHeight = activeFormulaSet?.[`umpiovi_potku_ulko_${gapSuffix}`];

            // Tiivistekynnys ei koskaan vaikuta uretaaniin (umpiovi-tilassa uretaania ei muutenkaan ole)
            // eikä leveyteen — ainoastaan potkupellin korkeuteen.
            const sealInnerHeight = settings.sealThresholdEnabled
                ? (useSideFormulas
                    ? activeFormulaSet?.tiiviste_umpiovi_potku_lisa_sisa_korkeus ?? activeFormulaSet?.tiiviste_umpiovi_potku_sisa_korkeus
                    : activeFormulaSet?.tiiviste_umpiovi_potku_sisa_korkeus)
                : null;
            const sealOuterHeight = settings.sealThresholdEnabled
                ? (useSideFormulas
                    ? activeFormulaSet?.tiiviste_umpiovi_potku_lisa_ulko_korkeus ?? activeFormulaSet?.tiiviste_umpiovi_potku_ulko_korkeus
                    : activeFormulaSet?.tiiviste_umpiovi_potku_ulko_korkeus)
                : null;

            const innerHeightAdjust = sealInnerHeight ?? (useSideFormulas
                ? (gapInnerHeight ?? activeFormulaSet?.umpiovi_potku_lisa_sisa_korkeus ?? activeFormulaSet?.umpiovi_potku_sisa_korkeus ?? activeFormulaSet?.umpiovi_potku_korkeus ?? fallbackInnerHeight)
                : (gapInnerHeight ?? activeFormulaSet?.umpiovi_potku_sisa_korkeus ?? activeFormulaSet?.umpiovi_potku_korkeus ?? fallbackInnerHeight));
            const innerWidthAdjust = useSideFormulas
                ? (activeFormulaSet?.umpiovi_potku_lisa_sisa_leveys ?? activeFormulaSet?.umpiovi_potku_sisa_leveys ?? activeFormulaSet?.umpiovi_potku_leveys ?? fallbackInnerWidth)
                : (activeFormulaSet?.umpiovi_potku_sisa_leveys ?? activeFormulaSet?.umpiovi_potku_leveys ?? fallbackInnerWidth);
            const outerHeightAdjust = sealOuterHeight ?? (useSideFormulas
                ? (gapOuterHeight ?? activeFormulaSet?.umpiovi_potku_lisa_ulko_korkeus ?? activeFormulaSet?.umpiovi_potku_ulko_korkeus ?? fallbackOuterHeight)
                : (gapOuterHeight ?? activeFormulaSet?.umpiovi_potku_ulko_korkeus ?? fallbackOuterHeight));
            const outerWidthAdjust = useSideFormulas
                ? (activeFormulaSet?.umpiovi_potku_lisa_ulko_leveys ?? activeFormulaSet?.umpiovi_potku_ulko_leveys ?? fallbackOuterWidth)
                : (activeFormulaSet?.umpiovi_potku_ulko_leveys ?? fallbackOuterWidth);

            // Inner kickplate (Umpiovi formula pair)
            results.potkupelti.push(`${kickHeight + innerHeightAdjust} x ${width + innerWidthAdjust}`);

            // Outer kickplate (Umpiovi-specific formula pair)
            let outerWidth = width + outerWidthAdjust;
            if (kickHeight > 310) {
                outerWidth -= 5;
            }
            results.potkupelti.push(`${kickHeight + outerHeightAdjust} x ${outerWidth}`);
        });
    }

    return results;
}

// Calculate Janisol Pariovi
function calculateJanisolPariovi(mainWidth, sideWidth, kickHeight, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas
    const formulas = getPanelAwareFormulas();
    const jf = formulas.janisol_pariovi;
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = jf.rako_10_inner || 32;
        outerHeightAdjust = jf.rako_10_outer || 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = jf.rako_15_inner || 27;
        outerHeightAdjust = jf.rako_15_outer || 2;
    }
    
    // Lasilistat (Glass strips) - Use dynamic formulas
    // Vertical strips for main door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + jf.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Vertical strips for side door (2 per pane)
    if (!settings.umpivasikkaEnabled) {
        paneHeights.forEach(height => {
            const verticalLength = height + jf.lasilista_pysty;
            results.lasilista.push(verticalLength);
            results.lasilista.push(verticalLength);
        });
    }
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth + jf.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    if (!settings.umpivasikkaEnabled) {
        paneHeights.forEach(() => {
            const horizontalLength = sideWidth + jf.lasilista_vaaka;
            results.lasilista.push(horizontalLength);
            results.lasilista.push(horizontalLength);
        });
    }
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat (Urethane pieces)
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(jf, jf.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + jf.uretaani_leveys}`);
        if (!settings.umpivasikkaEnabled) {
            results.uretaani.push(`${uretaaniHeight} x ${sideWidth + jf.uretaani_leveys}`);
        }
        
        // Potkupellit - Käyntiovi (Kick plates - Main door)
    let mainInnerHeight, mainOuterHeight;
    if (settings.sealThresholdEnabled) {
        mainInnerHeight = kickHeight + (getSealPotkuHeightAdjust(jf, 'inner') ?? (jf.potku_kaynti_sisa_korkeus + innerHeightAdjust));
        mainOuterHeight = kickHeight + (getSealPotkuHeightAdjust(jf, 'outer') ?? (jf.potku_kaynti_ulko_korkeus + outerHeightAdjust));
    } else if (settings.gapOption === 'saneeraus') {
        // Saneerauskynnys: Use values from admin panel
        mainInnerHeight = kickHeight + (jf.rako_saneeraus_inner || -25);
        mainOuterHeight = kickHeight + (jf.rako_saneeraus_outer || 0);
    } else {
        mainInnerHeight = kickHeight + jf.potku_kaynti_sisa_korkeus + innerHeightAdjust;
        mainOuterHeight = kickHeight + jf.potku_kaynti_ulko_korkeus + outerHeightAdjust;
    }
    const mainInnerWidth = mainWidth + jf.potku_kaynti_sisa_leveys;
    results.potkupelti.push(`${mainInnerHeight} x ${mainInnerWidth}`);
    
    let mainOuterWidth = mainWidth + jf.potku_kaynti_ulko_leveys;
    if (kickHeight > 310) {
        mainOuterWidth -= 5;
    }
    results.potkupelti.push(`${mainOuterHeight} x ${mainOuterWidth}`);
    
    // Potkupellit - Lisäovi (Kick plates - Side door)
    let sideInnerHeight, sideOuterHeight;
    if (settings.sealThresholdEnabled) {
        sideInnerHeight = kickHeight + (getSealPotkuHeightAdjust(jf, 'inner') ?? (jf.potku_lisa_sisa_korkeus + innerHeightAdjust));
        sideOuterHeight = kickHeight + (getSealPotkuHeightAdjust(jf, 'outer') ?? (jf.potku_lisa_ulko_korkeus + outerHeightAdjust));
    } else if (settings.gapOption === 'saneeraus') {
        // Saneerauskynnys: Use values from admin panel
        sideInnerHeight = kickHeight + (jf.rako_saneeraus_inner || -25);
        sideOuterHeight = kickHeight + (jf.rako_saneeraus_outer || 0);
    } else {
        sideInnerHeight = kickHeight + jf.potku_lisa_sisa_korkeus + innerHeightAdjust;
        sideOuterHeight = kickHeight + jf.potku_lisa_ulko_korkeus + outerHeightAdjust;
    }
    const sideInnerWidth = settings.umpivasikkaEnabled
        ? sideWidth + (jf.umpiovi_potku_lisa_sisa_leveys ?? jf.umpiovi_potku_sisa_leveys ?? jf.umpiovi_potku_leveys ?? 115)
        : sideWidth + jf.potku_lisa_sisa_leveys;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    let sideOuterWidth = settings.umpivasikkaEnabled
        ? sideWidth + (jf.umpiovi_potku_lisa_ulko_leveys ?? jf.umpiovi_potku_ulko_leveys ?? 165)
        : sideWidth + jf.potku_lisa_ulko_leveys;
    if (kickHeight > 310) {
        sideOuterWidth -= 5;
    }
        results.potkupelti.push(`${sideOuterHeight} x ${sideOuterWidth}`);
    }
    
    // Harjalistat (Brush strips)
    if (!settings.sealThresholdEnabled) {
        results.harjalista.push(mainWidth + jf.harjalista);
        results.harjalista.push(sideWidth + jf.harjalista);
    }
    
    return results;
}

// Calculate Janisol Käyntiovi
function calculateJanisolKayntiovi(mainWidth, kickHeight, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas
    const formulas = getPanelAwareFormulas();
    const jf = formulas.janisol_pariovi; // Use same base formulas as pariovi
    const jkf = formulas.janisol_kayntiovi; // But use own rako settings
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = jkf.rako_10_inner || 32;
        outerHeightAdjust = jkf.rako_10_outer || 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = jkf.rako_15_inner || 27;
        outerHeightAdjust = jkf.rako_15_outer || 2;
    }
    
    // Lasilistat - Use dynamic formulas
    paneHeights.forEach(height => {
        // 2 vertical strips per pane
        const verticalLength = height + jf.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = mainWidth + jf.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(jkf, jf.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + jf.uretaani_leveys}`);
        
        // Potkupellit
        let innerHeight, outerHeight;
        if (settings.sealThresholdEnabled) {
            innerHeight = kickHeight + (getSealPotkuHeightAdjust(jkf, 'inner') ?? (jf.potku_kaynti_sisa_korkeus + innerHeightAdjust));
            outerHeight = kickHeight + (getSealPotkuHeightAdjust(jkf, 'outer') ?? (jf.potku_kaynti_ulko_korkeus + outerHeightAdjust));
        } else if (settings.gapOption === 'saneeraus') {
            // Saneerauskynnys: Use values from admin panel
            innerHeight = kickHeight + (jkf.rako_saneeraus_inner || -25);
            outerHeight = kickHeight + (jkf.rako_saneeraus_outer || 0);
        } else {
            innerHeight = kickHeight + jf.potku_kaynti_sisa_korkeus + innerHeightAdjust;
            outerHeight = kickHeight + jf.potku_kaynti_ulko_korkeus + outerHeightAdjust;
        }
        const innerWidth = mainWidth + jf.potku_kaynti_sisa_leveys;
        results.potkupelti.push(`${innerHeight} x ${innerWidth}`);
        
        let outerWidth = mainWidth + jf.potku_kaynti_ulko_leveys;
        if (kickHeight > 310) {
            outerWidth -= 5;
        }
        results.potkupelti.push(`${outerHeight} x ${outerWidth}`);
    }
    
    // Harjalistat
    if (!settings.sealThresholdEnabled) {
        results.harjalista.push(mainWidth + jf.harjalista);
    }
    
    return results;
}

// Calculate Economy Pariovi
function calculateEconomyPariovi(mainWidth, sideWidth, kickHeight, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas
    const formulas = getPanelAwareFormulas();
    const ef = formulas.economy_pariovi;
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = ef.rako_10_inner || 32;
        outerHeightAdjust = ef.rako_10_outer || 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = ef.rako_15_inner || 27;
        outerHeightAdjust = ef.rako_15_outer || 2;
    }
    
    // Lasilistat - Use dynamic formulas
    // Vertical strips for main door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + ef.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Vertical strips for side door (2 per pane)
    if (!settings.umpivasikkaEnabled) {
        paneHeights.forEach(height => {
            const verticalLength = height + ef.lasilista_pysty;
            results.lasilista.push(verticalLength);
            results.lasilista.push(verticalLength);
        });
    }
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth + ef.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    if (!settings.umpivasikkaEnabled) {
        paneHeights.forEach(() => {
            const horizontalLength = sideWidth + ef.lasilista_vaaka;
            results.lasilista.push(horizontalLength);
            results.lasilista.push(horizontalLength);
        });
    }
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(ef, ef.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + ef.uretaani_leveys}`);
        if (!settings.umpivasikkaEnabled) {
            results.uretaani.push(`${uretaaniHeight} x ${sideWidth + ef.uretaani_leveys}`);
        }
        
        // Potkupellit - Käyntiovi
    let mainInnerHeight, mainOuterHeight;
    if (settings.sealThresholdEnabled) {
        mainInnerHeight = kickHeight + (getSealPotkuHeightAdjust(ef, 'inner') ?? (ef.potku_kaynti_sisa_korkeus + innerHeightAdjust));
        mainOuterHeight = kickHeight + (getSealPotkuHeightAdjust(ef, 'outer') ?? (ef.potku_kaynti_ulko_korkeus + outerHeightAdjust));
    } else if (settings.gapOption === 'saneeraus') {
        // Saneerauskynnys: Use values from admin panel
        mainInnerHeight = kickHeight + (ef.rako_saneeraus_inner || -25);
        mainOuterHeight = kickHeight + (ef.rako_saneeraus_outer || 0);
    } else {
        mainInnerHeight = kickHeight + ef.potku_kaynti_sisa_korkeus + innerHeightAdjust;
        mainOuterHeight = kickHeight + ef.potku_kaynti_ulko_korkeus + outerHeightAdjust;
    }
    const mainInnerWidth = mainWidth + ef.potku_kaynti_sisa_leveys;
    results.potkupelti.push(`${mainInnerHeight} x ${mainInnerWidth}`);
    
    let mainOuterWidth = mainWidth + ef.potku_kaynti_ulko_leveys;
    if (kickHeight > 310) {
        mainOuterWidth -= 5;
    }
    results.potkupelti.push(`${mainOuterHeight} x ${mainOuterWidth}`);
    
    // Potkupellit - Lisäovi
    let sideInnerHeight, sideOuterHeight;
    if (settings.sealThresholdEnabled) {
        sideInnerHeight = kickHeight + (getSealPotkuHeightAdjust(ef, 'inner') ?? (ef.potku_lisa_sisa_korkeus + innerHeightAdjust));
        sideOuterHeight = kickHeight + (getSealPotkuHeightAdjust(ef, 'outer') ?? (ef.potku_lisa_ulko_korkeus + outerHeightAdjust));
    } else if (settings.gapOption === 'saneeraus') {
        // Saneerauskynnys: Use values from admin panel
        sideInnerHeight = kickHeight + (ef.rako_saneeraus_inner || -25);
        sideOuterHeight = kickHeight + (ef.rako_saneeraus_outer || 0);
    } else {
        sideInnerHeight = kickHeight + ef.potku_lisa_sisa_korkeus + innerHeightAdjust;
        sideOuterHeight = kickHeight + ef.potku_lisa_ulko_korkeus + outerHeightAdjust;
    }
    const sideInnerWidth = settings.umpivasikkaEnabled
        ? sideWidth + (ef.umpiovi_potku_lisa_sisa_leveys ?? ef.umpiovi_potku_sisa_leveys ?? ef.umpiovi_potku_leveys ?? 110)
        : sideWidth + ef.potku_lisa_sisa_leveys;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    let sideOuterWidth = settings.umpivasikkaEnabled
        ? sideWidth + (ef.umpiovi_potku_lisa_ulko_leveys ?? ef.umpiovi_potku_ulko_leveys ?? 160)
        : sideWidth + ef.potku_lisa_ulko_leveys;
    if (kickHeight > 310) {
        sideOuterWidth -= 5;
    }
        results.potkupelti.push(`${sideOuterHeight} x ${sideOuterWidth}`);
    }
    
    // Harjalistat
    if (!settings.sealThresholdEnabled) {
        results.harjalista.push(mainWidth + ef.harjalista);
        results.harjalista.push(sideWidth + ef.harjalista);
    }
    
    return results;
}

// Calculate Economy Käyntiovi
function calculateEconomyKayntiovi(mainWidth, kickHeight, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas
    const formulas = getPanelAwareFormulas();
    const ef = formulas.economy_pariovi; // Use same base formulas as pariovi
    const ekf = formulas.economy_kayntiovi; // But use own rako settings
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = ekf.rako_10_inner || 32;
        outerHeightAdjust = ekf.rako_10_outer || 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = ekf.rako_15_inner || 27;
        outerHeightAdjust = ekf.rako_15_outer || 2;
    }
    
    // Lasilistat - Use dynamic formulas
    paneHeights.forEach(height => {
        // 2 vertical strips per pane
        const verticalLength = height + ef.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = mainWidth + ef.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(ekf, ef.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + ef.uretaani_leveys}`);
        
        // Potkupellit
        let innerHeight, outerHeight;
        if (settings.sealThresholdEnabled) {
            innerHeight = kickHeight + (getSealPotkuHeightAdjust(ekf, 'inner') ?? (ef.potku_kaynti_sisa_korkeus + innerHeightAdjust));
            outerHeight = kickHeight + (getSealPotkuHeightAdjust(ekf, 'outer') ?? (ef.potku_kaynti_ulko_korkeus + outerHeightAdjust));
        } else if (settings.gapOption === 'saneeraus') {
            // Saneerauskynnys: Use values from admin panel
            innerHeight = kickHeight + (ekf.rako_saneeraus_inner || -25);
            outerHeight = kickHeight + (ekf.rako_saneeraus_outer || 0);
        } else {
            innerHeight = kickHeight + ef.potku_kaynti_sisa_korkeus + innerHeightAdjust;
            outerHeight = kickHeight + ef.potku_kaynti_ulko_korkeus + outerHeightAdjust;
        }
        const innerWidth = mainWidth + ef.potku_kaynti_sisa_leveys;
        results.potkupelti.push(`${innerHeight} x ${innerWidth}`);
        
        let outerWidth = mainWidth + ef.potku_kaynti_ulko_leveys;
        if (kickHeight > 310) {
            outerWidth -= 5;
        }
        results.potkupelti.push(`${outerHeight} x ${outerWidth}`);
    }
    
    // Harjalistat
    if (!settings.sealThresholdEnabled) {
        results.harjalista.push(mainWidth + ef.harjalista);
    }
    
    return results;
}

// Calculate Janisol Ikkuna (Windows only - glass strips only)
function calculateJanisolIkkuna(paneWidths, paneHeights, kickPlateHeight, useYhdistettyLeveys = false) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    const formulas = getActiveFormulas();
    const jif = formulas.janisol_ikkuna;
    
    paneHeights.forEach((height, index) => {
        const width = paneWidths[index] || paneWidths[0];
        
        const verticalLength = height + jif.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        const horizontalLength = width + jif.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    if (settings.kickPlateEnabled && kickPlateHeight) {
        const width = paneWidths.length > 0 ? paneWidths[0] : 0;

        const uretaaniH = kickPlateHeight + (jif.uretaani_korkeus || -126);
        const uretaaniW = width + (jif.uretaani_leveys || 46);
        results.uretaani.push(`${uretaaniH} x ${uretaaniW}`);

        const innerH = kickPlateHeight + (jif.potku_sisa_korkeus || -67);
        const innerW = width + (useYhdistettyLeveys
            ? (jif.potku_yhdistetty_sisa_leveys ?? jif.potku_sisa_leveys ?? 115)
            : (jif.potku_sisa_leveys ?? 115));
        results.potkupelti.push(`${innerH} x ${innerW}`);

        const outerH = kickPlateHeight + (jif.potku_ulko_korkeus || -18);
        const outerW = width + (useYhdistettyLeveys
            ? (jif.potku_yhdistetty_ulko_leveys ?? jif.potku_ulko_leveys ?? 165)
            : (jif.potku_ulko_leveys ?? 165));
        results.potkupelti.push(`${outerH} x ${outerW}`);
    }
    
    return results;
}

// Calculate Economy Ikkuna (Windows only - glass strips only)
function calculateEconomyIkkuna(paneWidths, paneHeights, kickPlateHeight, useYhdistettyLeveys = false) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    const formulas = getActiveFormulas();
    const eif = formulas.economy_ikkuna;
    
    paneHeights.forEach((height, index) => {
        const width = paneWidths[index] || paneWidths[0];
        
        const verticalLength = height + eif.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        const horizontalLength = width + eif.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    if (settings.kickPlateEnabled && kickPlateHeight) {
        const width = paneWidths.length > 0 ? paneWidths[0] : 0;

        const uretaaniH = kickPlateHeight + (eif.uretaani_korkeus || -121);
        const uretaaniW = width + (eif.uretaani_leveys || 41);
        results.uretaani.push(`${uretaaniH} x ${uretaaniW}`);

        const innerH = kickPlateHeight + (eif.potku_sisa_korkeus || -65);
        const innerW = width + (useYhdistettyLeveys
            ? (eif.potku_yhdistetty_sisa_leveys ?? eif.potku_sisa_leveys ?? 110)
            : (eif.potku_sisa_leveys ?? 110));
        results.potkupelti.push(`${innerH} x ${innerW}`);

        const outerH = kickPlateHeight + (eif.potku_ulko_korkeus || -20);
        const outerW = width + (useYhdistettyLeveys
            ? (eif.potku_yhdistetty_ulko_leveys ?? eif.potku_ulko_leveys ?? 160)
            : (eif.potku_ulko_leveys ?? 160));
        results.potkupelti.push(`${outerH} x ${outerW}`);
    }
    
    return results;
}

function isLasilistaSectionTitle(title) {
    return String(title || '').trim().toLowerCase().startsWith('lasilista');
}

function itemHasLasilistat(item) {
    return Array.isArray(item?.data) &&
        item.data.some((section) => isLasilistaSectionTitle(section.title));
}

function isKulmalistatSectionTitle(title) {
    return String(title || '').trim().toLowerCase().startsWith('kulmalista');
}

const KULMALISTA_OFFSET_MM = 35;
const KULMALISTA_END_CLEARANCE_MM = 100;
const KULMALISTA_SPACING_MIN = 200;
const KULMALISTA_SPACING_MAX = 300;

function formatKulmalistaNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return n.toFixed(1).replace('.', ',');
}

function calcKulmalistaHolePattern(lengthMm) {
    const L = Number(lengthMm);
    if (!Number.isFinite(L)) return null;
    const usable = L - KULMALISTA_END_CLEARANCE_MM;
    if (usable < KULMALISTA_SPACING_MIN) return null;

    let best = null;
    const maxN = Math.floor(usable / KULMALISTA_SPACING_MIN);
    for (let n = 1; n <= maxN; n++) {
        const spacing = usable / n;
        if (spacing >= KULMALISTA_SPACING_MIN && spacing <= KULMALISTA_SPACING_MAX) {
            if (!best || spacing > best.spacing) {
                best = { n, spacing, holes: n + 1 };
            }
        }
    }
    return best;
}

function formatKulmalistaItem(lengthMm, count = 1) {
    const length = Number(lengthMm);
    const pattern = calcKulmalistaHolePattern(length);
    let label = formatKulmalistaNumber(length);
    if (count > 1) label += ` x ${count}`;
    if (pattern) {
        label += ` · väli ${formatKulmalistaNumber(pattern.spacing)} · ${pattern.holes} reikää`;
    }
    return label;
}

function combineKulmalistat(items) {
    const counts = new Map();
    const order = [];
    (items || []).forEach(item => {
        const length = typeof item === 'object' && item !== null
            ? Number(item.length)
            : Number(item);
        if (!Number.isFinite(length)) return;
        const key = String(length);
        if (counts.has(key)) {
            counts.set(key, counts.get(key) + 1);
        } else {
            counts.set(key, 1);
            order.push(key);
        }
    });
    return order
        .sort((a, b) => Number(b) - Number(a))
        .map(key => formatKulmalistaItem(Number(key), counts.get(key)));
}

function parseKulmalistaRow(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    // New: "835 x 14 · väli …" / "835 · väli …" ; also tolerates optional "mm"
    // Old: "835 mm · väli … × 14"
    const headMatch = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:mm)?(?:\s*[×xX]\s*(\d+))?/i);
    if (!headMatch) return null;
    const length = Number(headMatch[1].replace(',', '.'));
    let count = headMatch[2] ? Number(headMatch[2]) : 1;
    if (!headMatch[2]) {
        const trailing = raw.match(/[×xX]\s*(\d+)\s*$/);
        if (trailing) count = Number(trailing[1]);
    }
    if (!Number.isFinite(length) || !Number.isFinite(count)) return null;
    return { length, count };
}

function mergeKulmalistaItems(existingItems, incomingItems) {
    const countMap = new Map();
    const order = [];
    const nonParseable = [];

    function addItems(items) {
        (items || []).forEach(item => {
            const parsed = parseKulmalistaRow(item.label);
            if (parsed) {
                const key = String(parsed.length);
                if (countMap.has(key)) {
                    countMap.set(key, countMap.get(key) + parsed.count);
                } else {
                    countMap.set(key, parsed.count);
                    order.push(key);
                }
            } else {
                nonParseable.push({ label: item.label, value: item.value || '' });
            }
        });
    }

    addItems(existingItems);
    addItems(incomingItems);

    const result = order.map(key => ({
        label: formatKulmalistaItem(Number(key), countMap.get(key)),
        value: ''
    }));
    return result.concat(nonParseable);
}

function calculateVerkko(mainWidth, paneHeights, paneWidths = null, calcType = currentCalculator) {
    const results = { kulmalistat: [] };
    const formulaKey = String(calcType || '').startsWith('verkko-seina') || calcType === 'verkko_seina'
        ? 'verkko_seina'
        : 'verkko_ovi';
    const formulas = getActiveFormulas();
    const vf = formulas[formulaKey] || {};
    const offsetPysty = Number.isFinite(vf.kulmalista_pysty) ? vf.kulmalista_pysty : KULMALISTA_OFFSET_MM;
    const offsetVaaka = Number.isFinite(vf.kulmalista_vaaka) ? vf.kulmalista_vaaka : KULMALISTA_OFFSET_MM;

    const fallbackWidth = Number(mainWidth) || 0;
    const widths = Array.isArray(paneWidths) && paneWidths.length > 0 ? paneWidths : null;
    (paneHeights || []).forEach((height, index) => {
        const h = Number(height) || 0;
        const width = widths
            ? (Number(widths[index]) || Number(widths[0]) || 0)
            : fallbackWidth;
        const verticalLength = h + offsetPysty;
        const horizontalLength = width + offsetVaaka;
        results.kulmalistat.push({ length: verticalLength });
        results.kulmalistat.push({ length: verticalLength });
        results.kulmalistat.push({ length: horizontalLength });
        results.kulmalistat.push({ length: horizontalLength });
    });
    return results;
}

function getLasilistaSectionTitle(sectionTitle, itemData) {
    const originalTitle = String(sectionTitle || '').trim();
    if (!isLasilistaSectionTitle(originalTitle)) {
        return originalTitle;
    }

    const color = String(itemData?.lasilistaColor || '').trim();
    const withColor = (baseTitle) => {
        if (!color) return baseTitle;
        if (/\([^()]+\)\s*$/i.test(baseTitle)) return baseTitle;
        return `${baseTitle} (${color})`;
    };

    // Keep fully explicit old/custom title as-is.
    if (/^lasilista\s+\d+\s*mm\s*\(.+\)$/i.test(originalTitle)) {
        return originalTitle;
    }

    // Keep explicit size in old/custom data as-is (e.g. "Lasilista 12mm").
    if (/^lasilista\s+\d+\s*mm$/i.test(originalTitle)) {
        return withColor(originalTitle);
    }

    const size = String(itemData?.lasilistaSize || '').trim();
    if (size) return withColor(`Lasilista ${size}`);

    const titleSize = parseSizeFromSectionTitle(originalTitle);
    if (titleSize) return withColor(`Lasilista ${titleSize}`);

    return withColor('Lasilista');
}

function parseLasilistaRow(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const cleaned = raw.replace(/mm/gi, '').trim();
    const matchWithCount = cleaned.match(/^(-?\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+)$/);
    if (matchWithCount) {
        const length = Number(matchWithCount[1].replace(',', '.'));
        const count = Number(matchWithCount[2]);
        if (Number.isFinite(length) && Number.isFinite(count)) {
            return { length, count };
        }
    }

    const matchSingle = cleaned.match(/^(-?\d+(?:[.,]\d+)?)$/);
    if (matchSingle) {
        const length = Number(matchSingle[1].replace(',', '.'));
        if (Number.isFinite(length)) {
            return { length, count: 1 };
        }
    }

    return null;
}

function sortByFinnishNumberString(a, b) {
    return b.localeCompare(a, 'fi', { numeric: true, sensitivity: 'base' });
}

// Display results with combined duplicates
function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const isVerkkoCalculator = isVerkkoCalculatorType();
    const isUmpioviMode = isDoorCalculatorType() && settings.umpioviEnabled === true;
    let html = '<div class="row">';

    if (isVerkkoCalculator) {
        html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Kulmalistat</h5>';
        const combinedKulmalistat = combineKulmalistat(results.kulmalistat || []);
        combinedKulmalistat.forEach(item => {
            html += `<div class="result-item">${item}</div>`;
        });
        const hasMissingHoles = (results.kulmalistat || []).some(item => {
            const length = typeof item === 'object' ? item.length : item;
            return !calcKulmalistaHolePattern(length);
        });
        if (hasMissingHoles) {
            html += '<div class="text-muted small mt-2">Joillekin pituuksille ei löytynyt reikäväliä välillä 200–300 mm.</div>';
        }
        html += '</div></div></div>';
        resultsDiv.innerHTML = html;
        if (!mergeMode) {
            const btnYhdista = document.getElementById('btnYhdistaMerge');
            if (btnYhdista) btnYhdista.style.display = '';
        }
        return;
    }
    
    if (!isUmpioviMode && !pystypaneliEnabled) {
        // Lasilista
        html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Lasilista</h5>';
        const combinedLasilista = combineResults(results.lasilista);
        combinedLasilista.forEach(item => {
            html += `<div class="result-item">${item}</div>`;
        });
        html += '</div></div>';
    }
    
    // Uretaani (doors and windows when kickplate enabled)
    if (!isUmpioviMode && settings.kickPlateEnabled && results.uretaani.length > 0) {
        html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Uretaani</h5>';
        results.uretaani.forEach(item => {
            html += `<div class="result-item">${item}</div>`;
        });
        html += '</div></div>';
    }
    
    // Potkupelti (doors and windows when kickplate enabled)
    if (settings.kickPlateEnabled && results.potkupelti.length > 0) {
        html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Potkupelti</h5>';
        results.potkupelti.forEach(item => {
            html += `<div class="result-item">${item}</div>`;
        });
        html += '</div></div>';
    }
    
    // Harjalista (only for doors)
    if (!isWindowCalculator) {
        if (isUmpioviMode || !settings.sealThresholdEnabled) {
            html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Harjalista</h5>';
            results.harjalista.forEach(item => {
                html += `<div class="result-item">${item}</div>`;
            });
            html += '</div></div>';
        }
    }

    if (pystypaneliEnabled) html += buildPystypaneliResultsHtml();
    
    html += '</div>';
    resultsDiv.innerHTML = html;

    if (!mergeMode) {
        const btnYhdista = document.getElementById('btnYhdistaMerge');
        if (btnYhdista) btnYhdista.style.display = '';
    }
}

// Combine duplicate results (e.g., "841 x 2" instead of two "841")
function combineResults(items) {
    const counts = {};
    items.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
    });
    
    return Object.entries(counts)
        .sort((a, b) => b[0] - a[0]) // Sort by value descending
        .map(([value, count]) => count > 1 ? `${value} x ${count}` : value);
}

// --- Merge mode functions ---

function attachPystypaneliInputs(inputs) {
    inputs.pystypaneliEnabled = !!pystypaneliEnabled;
    inputs.pystypaneliY = pystypaneliEnabled
        ? (document.getElementById('pystypaneliY')?.value || '')
        : '';
    return inputs;
}

function captureCurrentInputsForMerge() {
    const inputs = {
        calculator: currentCalculator,
        mainDoorWidth: document.getElementById('mainDoorWidth')?.value || '',
        sideDoorWidth: document.getElementById('sideDoorWidth')?.value || '',
        kickPlateHeight: document.getElementById('kickPlateHeight')?.value || '',
        gapOption: settings.gapOption,
        paneCount: settings.paneCount,
        kickPlateEnabled: settings.kickPlateEnabled,
        sealThresholdEnabled: settings.sealThresholdEnabled,
        umpioviEnabled: settings.umpioviEnabled,
        umpivasikkaEnabled: settings.umpivasikkaEnabled,
        formulaSet: localStorage.getItem('activeFormulaSet') || 'default',
        paneHeights: [],
        paneWidths: []
    };
    const isWindowCalc = (currentCalculator || '').includes('ikkuna');
    const isVerkkoSeina = currentCalculator === 'verkko-seina';
    for (let i = 1; i <= settings.paneCount; i++) {
        inputs.paneHeights.push(document.getElementById(`paneHeight${i}`)?.value || '');
        const widthEl = document.getElementById(`paneWidth${i}`);
        const widthVal = widthEl?.value
            || ((isWindowCalc || isVerkkoSeina) && !widthEl ? (document.getElementById('mainDoorWidth')?.value || '') : '')
            || '';
        inputs.paneWidths.push(widthVal);
    }
    return attachPystypaneliInputs(inputs);
}

function getIkkunaRawForMerge(inp) {
    if (!currentCalculator.includes('ikkuna') || !settings.kickPlateEnabled) return lastRawResult;
    const pw = (inp.paneWidths || []).map(Number);
    const ph = (inp.paneHeights || []).map(Number);
    const kph = parseInt(inp.kickPlateHeight) || 0;
    if (kph <= 0) return lastRawResult;
    return currentCalculator === 'janisol-ikkuna'
        ? calculateJanisolIkkuna(pw, ph, kph, true)
        : calculateEconomyIkkuna(pw, ph, kph, true);
}

function activateMergeMode() {
    if (!lastRawResult) {
        showToast('Syötä ensin mitat ennen yhdistämistä.', 'warning');
        return;
    }

    if (mergeMode && frozenFirstResult) {
        // Lisätään uusi tulos kertymään
        const inp = captureCurrentInputsForMerge();
        const secondData = formatResultToData(getIkkunaRawForMerge(inp), currentCalculator, {...settings});
        if (!secondData || secondData.length === 0) {
            showToast('Ei yhdistettäviä tuloksia.', 'warning');
            return;
        }
        const incoming = {
            data: secondData,
            calculator: currentCalculator,
            lasilistaSize: '',
            lasilistaColor: '',
            inputs: inp,
            timestamp: new Date().toISOString()
        };
        frozenFirstResult = mergeResults(frozenFirstResult, incoming);
        mergeCount++;
        mergeLiveCommitted = true;
        updateMergeFirstCard();
        displayMergedResults(frozenFirstResult.data);
        return;
    }

    // Ensimmäinen aktivointi
    const firstInp = captureCurrentInputsForMerge();
    const firstData = formatResultToData(getIkkunaRawForMerge(firstInp), currentCalculator, {...settings});
    if (!firstData || firstData.length === 0) {
        showToast('Ei yhdistettäviä tuloksia.', 'warning');
        return;
    }
    frozenFirstResult = {
        data: firstData,
        calculator: currentCalculator,
        lasilistaSize: '',
        lasilistaColor: '',
        inputs: firstInp,
        timestamp: new Date().toISOString()
    };
    mergeMode = true;
    mergeCount = 1;
    mergeLiveCommitted = true;

    updateMergeFirstCard();

    const btnPeruuta = document.getElementById('btnPeruutaMerge');
    if (btnPeruuta) btnPeruuta.style.display = '';

    // Näytä ensimmäinen tulos sellaisenaan – odota käyttäjän syötteitä toiselle laskimelle
    displayMergedResults(frozenFirstResult.data);
}

function cancelMergeMode() {
    mergeMode = false;
    frozenFirstResult = null;
    mergeCount = 0;
    mergeLiveCommitted = false;

    const card = document.getElementById('mergeFirstCard');
    if (card) card.classList.add('d-none');

    const btnYhdista = document.getElementById('btnYhdistaMerge');
    const btnPeruuta = document.getElementById('btnPeruutaMerge');
    if (btnYhdista) btnYhdista.style.display = lastRawResult ? '' : 'none';
    if (btnPeruuta) btnPeruuta.style.display = 'none';

    calculate();
}

function buildMergeFirstSummary(frozenResult) {
    const calc = frozenResult.inputs?.calculator || frozenResult.calculator || '';
    const labels = {
        'janisol-kayntiovi': 'Janisol käyntiovi',
        'janisol-pariovi': 'Janisol pariovi',
        'economy-kayntiovi': 'Economy käyntiovi',
        'economy-pariovi': 'Economy pariovi',
        'janisol-ikkuna': 'Janisol ikkuna',
        'economy-ikkuna': 'Economy ikkuna',
        'verkko-ovi': 'Verkko-ovi',
        'verkko-seina': 'Verkkoseinä'
    };
    const calcLabel = labels[calc] || calc;
    const inp = frozenResult.inputs || {};
    const parts = [calcLabel];
    if (inp.mainDoorWidth) parts.push(`${inp.mainDoorWidth} mm`);
    if (inp.sideDoorWidth && parseInt(inp.sideDoorWidth) > 0) parts.push(`+ ${inp.sideDoorWidth} mm`);
    if (inp.kickPlateEnabled && inp.kickPlateHeight) parts.push(`potku ${inp.kickPlateHeight} mm`);
    return parts.join(', ');
}

function buildMergeFirstItems(frozenResult) {
    const sections = frozenResult.data || [];
    return sections.map(s => {
        const itemsText = (s.items || []).map(it => it.label).join(', ');
        return `<span class="text-muted me-3"><strong>${s.title}:</strong> ${itemsText}</span>`;
    }).join('');
}

function updateMergeFirstCard() {
    const labelEl = document.getElementById('mergeFirstLabel');
    const summaryEl = document.getElementById('mergeFirstSummary');
    const itemsEl = document.getElementById('mergeFirstItems');
    if (labelEl) labelEl.textContent = mergeCount > 1 ? `Yhdistetty (${mergeCount} kpl):` : '1. laskuri:';
    if (summaryEl) summaryEl.innerHTML = mergeCount > 1 ? '' : buildMergeFirstSummary(frozenFirstResult);
    if (itemsEl) itemsEl.innerHTML = buildMergeFirstItems(frozenFirstResult);
    const card = document.getElementById('mergeFirstCard');
    if (card) card.classList.remove('d-none');
}

function displayMergedResults(dataArray) {
    const resultsDiv = document.getElementById('results');
    let html = '<div class="row">';
    (dataArray || []).forEach(section => {
        html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section">';
        html += `<h5>${section.title}</h5>`;
        (section.items || []).forEach(item => {
            if (item.value) {
                html += `<div class="result-item">${item.label}: ${item.value}</div>`;
            } else {
                html += `<div class="result-item">${item.label}</div>`;
            }
        });
        html += '</div></div>';
    });
    html += '</div>';
    resultsDiv.innerHTML = html;

    const btnYhdista = document.getElementById('btnYhdistaMerge');
    if (btnYhdista) btnYhdista.style.display = '';
}

// Copy results to clipboard
function copyResults(event) {
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0) {
        alert('Ei tuloksia kopioitavaksi. Syötä ensin mitat.');
        return;
    }
    
    // Build text format
    const titles = {
        'janisol-pariovi': 'Janisol Pariovi',
        'janisol-kayntiovi': 'Janisol Käyntiovi',
        'janisol-ikkuna': 'Janisol Ikkuna',
        'economy-pariovi': 'Economy Pariovi',
        'economy-kayntiovi': 'Economy Käyntiovi',
        'economy-ikkuna': 'Economy Ikkuna',
        'verkko-ovi': 'Verkko-ovi',
        'verkko-seina': 'Verkkoseinä'
    };
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const isVerkkoCalculator = isVerkkoCalculatorType();
    
    let text = 'Harrin Teräsovi Mittalaskuri\n';
    text += titles[currentCalculator] + '\n';
    text += '='.repeat(40) + '\n\n';
    
    // Add inputs
    text += 'Syötteet:\n';
    
    if (isVerkkoCalculator) {
        const isVerkkoSeinaMulti = currentCalculator === 'verkko-seina' && settings.paneCount > 1;
        if (!isVerkkoSeinaMulti) {
            text += `Leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
        }
        for (let i = 1; i <= settings.paneCount; i++) {
            const widthEl = document.getElementById(`paneWidth${i}`);
            const heightEl = document.getElementById(`paneHeight${i}`);
            if (isVerkkoSeinaMulti && widthEl && heightEl) {
                text += `Ruutu ${i}: ${widthEl.value} × ${heightEl.value} mm (L × K)\n`;
            } else if (heightEl) {
                text += `Ruutu ${i} korkeus: ${heightEl.value} mm\n`;
            }
        }
    } else if (isWindowCalculator) {
        text += `Ruudun leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
    } else {
        text += `Käyntioven leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
        
        if (currentCalculator.includes('pariovi')) {
            text += `Lisäoven leveys: ${document.getElementById('sideDoorWidth').value} mm\n`;
        }
        
        text += `Potkupellin korkeus: ${document.getElementById('kickPlateHeight').value} mm\n`;
    }
    
    if (!isVerkkoCalculator) {
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            text += `Ruutu ${i} korkeus: ${el.value} mm\n`;
        }
    }
    }
    
    if (!isWindowCalculator && !isVerkkoCalculator) {
        const rakoText = settings.gapOption === 'saneeraus' ? 'Saneerauskynnys' : `${settings.gapOption} mm rako`;
        text += `Rako: ${rakoText}\n`;
    }
    text += `Ruutujen määrä: ${settings.paneCount}\n`;
    text += '\n';
    
    // Add results
    text += 'Tulokset:\n';
    text += '-'.repeat(40) + '\n\n';
    
    sections.forEach(section => {
        const title = section.querySelector('h5').textContent;
        text += title + '\n';
        
        const items = section.querySelectorAll('.result-item');
        items.forEach(item => {
            text += '  ' + item.textContent + '\n';
        });
        text += '\n';
    });
    
    // Copy to clipboard
    const btn = event.currentTarget;
    
    navigator.clipboard.writeText(text).then(() => {
        // Show success message
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Kopioitu!';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('btn-success');
            btn.classList.add('btn-primary');
        }, 2000);
    }).catch(err => {
        // Fallback for older browsers or HTTP context
        try {
            // Try older method
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✓ Kopioitu!';
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-success');
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary');
                }, 2000);
            } else {
                alert('Kopiointi epäonnistui. Kokeile avata sovellus HTTPS:n kautta tai kopioi tulokset manuaalisesti.');
            }
        } catch (err2) {
            alert('Kopiointi epäonnistui. Selaimesi ei tue leikepöydän käyttöä. Avaa sovellus HTTPS:n kautta tai localhost:ssa.');
            console.error('Copy failed:', err, err2);
        }
    });
}

// Copy named mitat results to clipboard
function copyMittaResults(jobNumber, itemName, event) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const mitta = mittatData[jobNumber] && mittatData[jobNumber][itemName];
    if (!mitta) {
        showToast('Tallennettuja mittoja ei löytynyt.', 'warning');
        return;
    }

    let text = 'Teräsovi Mittaohjelmisto\n';
    text += `Työ ${jobNumber} / ${itemName}\n`;
    text += '='.repeat(40) + '\n\n';
    text += 'Tulokset:\n';
    text += '-'.repeat(40) + '\n\n';

    mitta.data.forEach(section => {
        const sectionTitle = getLasilistaSectionTitle(section.title, mitta);
        text += sectionTitle + '\n';
        section.items.forEach(resultItem => {
            const valuePart = resultItem.value ? `: ${resultItem.value}` : '';
            text += `  ${resultItem.label}${valuePart}\n`;
        });
        text += '\n';
    });

    const btn = event.currentTarget;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Kopioitu!';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('btn-success');
            btn.classList.add('btn-primary');
        }, 2000);
    }).catch(() => {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✓ Kopioitu!';
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-success');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary');
                }, 2000);
            } else {
                alert('Kopiointi epäonnistui. Kokeile kopioida manuaalisesti.');
            }
        } catch {
            alert('Kopiointi epäonnistui. Kokeile kopioida manuaalisesti.');
        }
    });
}

// Export to PDF - Show modal first
let pdfExportContext = { type: 'calculator', jobNumber: null, itemName: null };

function exportToPDF() {
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0) {
        alert('Ei tuloksia vietäväksi. Syötä ensin mitat.');
        return;
    }
    
    pdfExportContext = { type: 'calculator', jobNumber: null, itemName: null };

    // Clear previous input and show modal
    document.getElementById('pdfFileName').value = '';
    const modal = new bootstrap.Modal(document.getElementById('pdfExportModal'));
    modal.show();
}

// Export named mitta to PDF - show same modal
function exportMittaToPDF(jobNumber, itemName) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!mittatData[jobNumber] || !mittatData[jobNumber][itemName]) {
        showToast('Tallennettuja mittoja ei löytynyt.', 'warning');
        return;
    }

    pdfExportContext = { type: 'mitat', jobNumber, itemName };
    document.getElementById('pdfFileName').value = `${jobNumber}_${itemName}`;
    const modal = new bootstrap.Modal(document.getElementById('pdfExportModal'));
    modal.show();
}

// Admin Panel Functions
function openAdminPanel() {
    if (!isAdmin) {
        showToast('Ei oikeuksia kaavahallintaan.', 'warning');
        return;
    }
    showAdminPanelView();
}

// Tracks the element that opened the admin panel so focus can be restored on close.
let adminPanelOpenerElement = null;

function showAdminPanelView() {
    if (!isAdmin) {
        return;
    }

    adminPanelOpenerElement = document.activeElement;
    const overlay = document.getElementById('adminPanelOverlay');
    overlay.classList.remove('d-none');
    overlay.setAttribute('aria-hidden', 'false');
    loadFormulasToPanel();

    // Move focus into the dialog (first focusable element).
    requestAnimationFrame(() => {
        const firstFocusable = overlay.querySelector(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) firstFocusable.focus();
    });
}

function closeAdminPanel() {
    const overlay = document.getElementById('adminPanelOverlay');
    overlay.classList.add('d-none');
    overlay.setAttribute('aria-hidden', 'true');

    // Restore focus to the element that opened the dialog.
    if (adminPanelOpenerElement && typeof adminPanelOpenerElement.focus === 'function') {
        adminPanelOpenerElement.focus();
    }
    adminPanelOpenerElement = null;
}

// Focus trap for the admin panel: Tab/Shift+Tab cycles within the dialog.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    const overlay = document.getElementById('adminPanelOverlay');
    if (!overlay || overlay.classList.contains('d-none')) return;

    const focusables = overlay.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

function toggleAdminAccordion(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.admin-accordion-icon');

    content.classList.toggle('active');
    const isOpen = content.classList.contains('active');
    icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    header.setAttribute('aria-expanded', String(isOpen));
}

function toggleFormulaSubAccordion(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.formula-sub-icon');
    content.classList.toggle('active');
    const isOpen = content.classList.contains('active');
    icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    header.setAttribute('aria-expanded', String(isOpen));
}

// Get default formulas
function getDefaultFormulas() {
    return {
        janisol_pariovi: {
            lasilista_pysty: 41,
            lasilista_vaaka: 3,
            uretaani_korkeus: -126,
            uretaani_leveys: 46,
            potku_kaynti_sisa_korkeus: -67,
            potku_kaynti_sisa_leveys: 115,
            potku_kaynti_ulko_korkeus: -18,
            potku_kaynti_ulko_leveys: 165,
            potku_lisa_sisa_korkeus: -67,
            potku_lisa_sisa_leveys: 140,
            potku_lisa_ulko_korkeus: -18,
            potku_lisa_ulko_leveys: 140,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -126,
            uretaani_10mm: -126,
            uretaani_15mm: -126,
            uretaani_saneeraus: -126,
            tiiviste_uretaani_8mm: -126,
            tiiviste_uretaani_10mm: -126,
            tiiviste_uretaani_15mm: -126,
            tiiviste_uretaani_saneeraus: -126,
            tiiviste_potku_inner_8mm: -67,
            tiiviste_potku_outer_8mm: -18,
            tiiviste_potku_inner_10mm: -35,
            tiiviste_potku_outer_10mm: -11,
            tiiviste_potku_inner_15mm: -40,
            tiiviste_potku_outer_15mm: -16,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -67,
            umpiovi_potku_sisa_leveys: 115,
            umpiovi_potku_ulko_korkeus: -18,
            umpiovi_potku_ulko_leveys: 165,
            umpiovi_potku_sisa_8mm: -67,
            umpiovi_potku_sisa_10mm: -67,
            umpiovi_potku_sisa_15mm: -67,
            umpiovi_potku_sisa_saneeraus: -67,
            umpiovi_potku_ulko_8mm: -18,
            umpiovi_potku_ulko_10mm: -18,
            umpiovi_potku_ulko_15mm: -18,
            umpiovi_potku_ulko_saneeraus: -18,
            umpiovi_potku_lisa_sisa_korkeus: -67,
            umpiovi_potku_lisa_sisa_leveys: 140,
            umpiovi_potku_lisa_ulko_korkeus: -18,
            umpiovi_potku_lisa_ulko_leveys: 140,
            tiiviste_umpiovi_potku_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_ulko_korkeus: -18,
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: -18
        },
        janisol_kayntiovi: {
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -126,
            uretaani_10mm: -126,
            uretaani_15mm: -126,
            uretaani_saneeraus: -126,
            tiiviste_uretaani_8mm: -126,
            tiiviste_uretaani_10mm: -126,
            tiiviste_uretaani_15mm: -126,
            tiiviste_uretaani_saneeraus: -126,
            tiiviste_potku_inner_8mm: -67,
            tiiviste_potku_outer_8mm: -18,
            tiiviste_potku_inner_10mm: -35,
            tiiviste_potku_outer_10mm: -11,
            tiiviste_potku_inner_15mm: -40,
            tiiviste_potku_outer_15mm: -16,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -67,
            umpiovi_potku_sisa_leveys: 115,
            umpiovi_potku_ulko_korkeus: -18,
            umpiovi_potku_ulko_leveys: 165,
            umpiovi_potku_sisa_8mm: -67,
            umpiovi_potku_sisa_10mm: -67,
            umpiovi_potku_sisa_15mm: -67,
            umpiovi_potku_sisa_saneeraus: -67,
            umpiovi_potku_ulko_8mm: -18,
            umpiovi_potku_ulko_10mm: -18,
            umpiovi_potku_ulko_15mm: -18,
            umpiovi_potku_ulko_saneeraus: -18,
            tiiviste_umpiovi_potku_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_ulko_korkeus: -18
        },
        economy_pariovi: {
            lasilista_pysty: 38,
            lasilista_vaaka: -2,
            uretaani_korkeus: -121,
            uretaani_leveys: 41,
            potku_kaynti_sisa_korkeus: -65,
            potku_kaynti_sisa_leveys: 110,
            potku_kaynti_ulko_korkeus: -20,
            potku_kaynti_ulko_leveys: 160,
            potku_lisa_sisa_korkeus: -65,
            potku_lisa_sisa_leveys: 135,
            potku_lisa_ulko_korkeus: -20,
            potku_lisa_ulko_leveys: 135,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -121,
            uretaani_10mm: -121,
            uretaani_15mm: -121,
            uretaani_saneeraus: -121,
            tiiviste_uretaani_8mm: -121,
            tiiviste_uretaani_10mm: -121,
            tiiviste_uretaani_15mm: -121,
            tiiviste_uretaani_saneeraus: -121,
            tiiviste_potku_inner_8mm: -65,
            tiiviste_potku_outer_8mm: -20,
            tiiviste_potku_inner_10mm: -33,
            tiiviste_potku_outer_10mm: -13,
            tiiviste_potku_inner_15mm: -38,
            tiiviste_potku_outer_15mm: -18,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -65,
            umpiovi_potku_sisa_leveys: 110,
            umpiovi_potku_ulko_korkeus: -20,
            umpiovi_potku_ulko_leveys: 160,
            umpiovi_potku_sisa_8mm: -65,
            umpiovi_potku_sisa_10mm: -65,
            umpiovi_potku_sisa_15mm: -65,
            umpiovi_potku_sisa_saneeraus: -65,
            umpiovi_potku_ulko_8mm: -20,
            umpiovi_potku_ulko_10mm: -20,
            umpiovi_potku_ulko_15mm: -20,
            umpiovi_potku_ulko_saneeraus: -20,
            umpiovi_potku_lisa_sisa_korkeus: -65,
            umpiovi_potku_lisa_sisa_leveys: 135,
            umpiovi_potku_lisa_ulko_korkeus: -20,
            umpiovi_potku_lisa_ulko_leveys: 135,
            tiiviste_umpiovi_potku_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_ulko_korkeus: -20,
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: -20
        },
        economy_kayntiovi: {
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -121,
            uretaani_10mm: -121,
            uretaani_15mm: -121,
            uretaani_saneeraus: -121,
            tiiviste_uretaani_8mm: -121,
            tiiviste_uretaani_10mm: -121,
            tiiviste_uretaani_15mm: -121,
            tiiviste_uretaani_saneeraus: -121,
            tiiviste_potku_inner_8mm: -65,
            tiiviste_potku_outer_8mm: -20,
            tiiviste_potku_inner_10mm: -33,
            tiiviste_potku_outer_10mm: -13,
            tiiviste_potku_inner_15mm: -38,
            tiiviste_potku_outer_15mm: -18,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -65,
            umpiovi_potku_sisa_leveys: 110,
            umpiovi_potku_ulko_korkeus: -20,
            umpiovi_potku_ulko_leveys: 160,
            umpiovi_potku_sisa_8mm: -65,
            umpiovi_potku_sisa_10mm: -65,
            umpiovi_potku_sisa_15mm: -65,
            umpiovi_potku_sisa_saneeraus: -65,
            umpiovi_potku_ulko_8mm: -20,
            umpiovi_potku_ulko_10mm: -20,
            umpiovi_potku_ulko_15mm: -20,
            umpiovi_potku_ulko_saneeraus: -20,
            tiiviste_umpiovi_potku_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_ulko_korkeus: -20
        },
        janisol_ikkuna: {
            lasilista_pysty: 41,
            lasilista_vaaka: 3,
            uretaani_korkeus: -126,
            uretaani_leveys: 46,
            potku_sisa_korkeus: -67,
            potku_sisa_leveys: 115,
            potku_ulko_korkeus: -18,
            potku_ulko_leveys: 165,
            potku_yhdistetty_sisa_leveys: 155,
            potku_yhdistetty_ulko_leveys: 125
        },
        economy_ikkuna: {
            lasilista_pysty: 38,
            lasilista_vaaka: -2,
            uretaani_korkeus: -121,
            uretaani_leveys: 41,
            potku_sisa_korkeus: -65,
            potku_sisa_leveys: 110,
            potku_ulko_korkeus: -20,
            potku_ulko_leveys: 160,
            potku_yhdistetty_sisa_leveys: 150,
            potku_yhdistetty_ulko_leveys: 120
        },
        verkko_ovi: {
            kulmalista_pysty: 35,
            kulmalista_vaaka: 35
        },
        verkko_seina: {
            kulmalista_pysty: 35,
            kulmalista_vaaka: 35
        },
        pystypaneli_janisol_pariovi: {
            pituus: 78,
            alotus: -5,
            uretaani_korkeus: -126,
            uretaani_leveys: 46,
            potku_kaynti_sisa_korkeus: -67,
            potku_kaynti_sisa_leveys: 115,
            potku_kaynti_ulko_korkeus: -18,
            potku_kaynti_ulko_leveys: 165,
            potku_lisa_sisa_korkeus: -67,
            potku_lisa_sisa_leveys: 140,
            potku_lisa_ulko_korkeus: -18,
            potku_lisa_ulko_leveys: 140,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -126,
            uretaani_10mm: -126,
            uretaani_15mm: -126,
            uretaani_saneeraus: -126,
            tiiviste_uretaani_8mm: -126,
            tiiviste_uretaani_10mm: -126,
            tiiviste_uretaani_15mm: -126,
            tiiviste_uretaani_saneeraus: -126,
            tiiviste_potku_inner_8mm: -67,
            tiiviste_potku_outer_8mm: -18,
            tiiviste_potku_inner_10mm: -35,
            tiiviste_potku_outer_10mm: -11,
            tiiviste_potku_inner_15mm: -40,
            tiiviste_potku_outer_15mm: -16,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -67,
            umpiovi_potku_sisa_leveys: 115,
            umpiovi_potku_ulko_korkeus: -18,
            umpiovi_potku_ulko_leveys: 165,
            umpiovi_potku_sisa_8mm: -67,
            umpiovi_potku_sisa_10mm: -67,
            umpiovi_potku_sisa_15mm: -67,
            umpiovi_potku_sisa_saneeraus: -67,
            umpiovi_potku_ulko_8mm: -18,
            umpiovi_potku_ulko_10mm: -18,
            umpiovi_potku_ulko_15mm: -18,
            umpiovi_potku_ulko_saneeraus: -18,
            umpiovi_potku_lisa_sisa_korkeus: -67,
            umpiovi_potku_lisa_sisa_leveys: 140,
            umpiovi_potku_lisa_ulko_korkeus: -18,
            umpiovi_potku_lisa_ulko_leveys: 140,
            tiiviste_umpiovi_potku_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_ulko_korkeus: -18,
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: -18
        },
        pystypaneli_janisol_kayntiovi: {
            pituus: 78,
            alotus: -5,
            uretaani_korkeus: -126,
            uretaani_leveys: 46,
            potku_kaynti_sisa_korkeus: -67,
            potku_kaynti_sisa_leveys: 115,
            potku_kaynti_ulko_korkeus: -18,
            potku_kaynti_ulko_leveys: 165,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -126,
            uretaani_10mm: -126,
            uretaani_15mm: -126,
            uretaani_saneeraus: -126,
            tiiviste_uretaani_8mm: -126,
            tiiviste_uretaani_10mm: -126,
            tiiviste_uretaani_15mm: -126,
            tiiviste_uretaani_saneeraus: -126,
            tiiviste_potku_inner_8mm: -67,
            tiiviste_potku_outer_8mm: -18,
            tiiviste_potku_inner_10mm: -35,
            tiiviste_potku_outer_10mm: -11,
            tiiviste_potku_inner_15mm: -40,
            tiiviste_potku_outer_15mm: -16,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -67,
            umpiovi_potku_sisa_leveys: 115,
            umpiovi_potku_ulko_korkeus: -18,
            umpiovi_potku_ulko_leveys: 165,
            umpiovi_potku_sisa_8mm: -67,
            umpiovi_potku_sisa_10mm: -67,
            umpiovi_potku_sisa_15mm: -67,
            umpiovi_potku_sisa_saneeraus: -67,
            umpiovi_potku_ulko_8mm: -18,
            umpiovi_potku_ulko_10mm: -18,
            umpiovi_potku_ulko_15mm: -18,
            umpiovi_potku_ulko_saneeraus: -18,
            tiiviste_umpiovi_potku_sisa_korkeus: -67,
            tiiviste_umpiovi_potku_ulko_korkeus: -18
        },
        pystypaneli_economy_kayntiovi: {
            pituus: 78,
            alotus: -5,
            uretaani_korkeus: -121,
            uretaani_leveys: 41,
            potku_kaynti_sisa_korkeus: -65,
            potku_kaynti_sisa_leveys: 110,
            potku_kaynti_ulko_korkeus: -20,
            potku_kaynti_ulko_leveys: 160,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -121,
            uretaani_10mm: -121,
            uretaani_15mm: -121,
            uretaani_saneeraus: -121,
            tiiviste_uretaani_8mm: -121,
            tiiviste_uretaani_10mm: -121,
            tiiviste_uretaani_15mm: -121,
            tiiviste_uretaani_saneeraus: -121,
            tiiviste_potku_inner_8mm: -65,
            tiiviste_potku_outer_8mm: -20,
            tiiviste_potku_inner_10mm: -33,
            tiiviste_potku_outer_10mm: -13,
            tiiviste_potku_inner_15mm: -38,
            tiiviste_potku_outer_15mm: -18,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -65,
            umpiovi_potku_sisa_leveys: 110,
            umpiovi_potku_ulko_korkeus: -20,
            umpiovi_potku_ulko_leveys: 160,
            umpiovi_potku_sisa_8mm: -65,
            umpiovi_potku_sisa_10mm: -65,
            umpiovi_potku_sisa_15mm: -65,
            umpiovi_potku_sisa_saneeraus: -65,
            umpiovi_potku_ulko_8mm: -20,
            umpiovi_potku_ulko_10mm: -20,
            umpiovi_potku_ulko_15mm: -20,
            umpiovi_potku_ulko_saneeraus: -20,
            tiiviste_umpiovi_potku_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_ulko_korkeus: -20
        },
        pystypaneli_economy_pariovi: {
            pituus: 78,
            alotus: -5,
            uretaani_korkeus: -121,
            uretaani_leveys: 41,
            potku_kaynti_sisa_korkeus: -65,
            potku_kaynti_sisa_leveys: 110,
            potku_kaynti_ulko_korkeus: -20,
            potku_kaynti_ulko_leveys: 160,
            potku_lisa_sisa_korkeus: -65,
            potku_lisa_sisa_leveys: 135,
            potku_lisa_ulko_korkeus: -20,
            potku_lisa_ulko_leveys: 135,
            harjalista: 141,
            rako_10_inner: 32,
            rako_10_outer: 7,
            rako_15_inner: 27,
            rako_15_outer: 2,
            rako_saneeraus_inner: -25,
            rako_saneeraus_outer: 0,
            uretaani_8mm: -121,
            uretaani_10mm: -121,
            uretaani_15mm: -121,
            uretaani_saneeraus: -121,
            tiiviste_uretaani_8mm: -121,
            tiiviste_uretaani_10mm: -121,
            tiiviste_uretaani_15mm: -121,
            tiiviste_uretaani_saneeraus: -121,
            tiiviste_potku_inner_8mm: -65,
            tiiviste_potku_outer_8mm: -20,
            tiiviste_potku_inner_10mm: -33,
            tiiviste_potku_outer_10mm: -13,
            tiiviste_potku_inner_15mm: -38,
            tiiviste_potku_outer_15mm: -18,
            tiiviste_potku_inner_saneeraus: -25,
            tiiviste_potku_outer_saneeraus: 0,
            umpiovi_potku_sisa_korkeus: -65,
            umpiovi_potku_sisa_leveys: 110,
            umpiovi_potku_ulko_korkeus: -20,
            umpiovi_potku_ulko_leveys: 160,
            umpiovi_potku_sisa_8mm: -65,
            umpiovi_potku_sisa_10mm: -65,
            umpiovi_potku_sisa_15mm: -65,
            umpiovi_potku_sisa_saneeraus: -65,
            umpiovi_potku_ulko_8mm: -20,
            umpiovi_potku_ulko_10mm: -20,
            umpiovi_potku_ulko_15mm: -20,
            umpiovi_potku_ulko_saneeraus: -20,
            umpiovi_potku_lisa_sisa_korkeus: -65,
            umpiovi_potku_lisa_sisa_leveys: 135,
            umpiovi_potku_lisa_ulko_korkeus: -20,
            umpiovi_potku_lisa_ulko_leveys: 135,
            tiiviste_umpiovi_potku_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_ulko_korkeus: -20,
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: -65,
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: -20
        }
    };
}

// Load formulas from localStorage or use defaults
function getActiveFormulas() {
    const storedFormulas = localStorage.getItem('formulaSets');
    const activeSetName = localStorage.getItem('activeFormulaSet') || 'default';
    
    if (storedFormulas) {
        const sets = JSON.parse(storedFormulas);
        if (sets[activeSetName]) {
            return sets[activeSetName];
        }
    }
    
    return getDefaultFormulas();
}

function getPystypaneliFormulaKey(type = currentCalculator) {
    if (type === 'janisol-pariovi') return 'pystypaneli_janisol_pariovi';
    if (type === 'janisol-kayntiovi') return 'pystypaneli_janisol_kayntiovi';
    if (type === 'economy-pariovi') return 'pystypaneli_economy_pariovi';
    if (type === 'economy-kayntiovi') return 'pystypaneli_economy_kayntiovi';
    return null;
}

function getPystypaneliFormulaSet(type = currentCalculator) {
    const formulas = getActiveFormulas();
    const key = getPystypaneliFormulaKey(type);
    return (key && formulas[key]) || formulas.pystypaneli || null;
}

function getPanelAwareFormulas() {
    const formulas = getActiveFormulas();
    if (!pystypaneliEnabled) return formulas;
    const p = getPystypaneliFormulaSet();
    if (!p) return formulas;
    return {
        ...formulas,
        janisol_pariovi: p,
        janisol_kayntiovi: p,
        economy_pariovi: p,
        economy_kayntiovi: p
    };
}

// Load formulas into admin panel
function loadFormulasToPanel() {
    const formulas = getActiveFormulas();
    
    // Janisol Pariovi
    if (formulas.janisol_pariovi) {
        Object.keys(formulas.janisol_pariovi).forEach(key => {
            const input = document.getElementById(`janisol_pariovi_${key}`);
            if (input) input.value = formulas.janisol_pariovi[key];
        });
    }
    
    // Janisol Käyntiovi
    if (formulas.janisol_kayntiovi) {
        Object.keys(formulas.janisol_kayntiovi).forEach(key => {
            const input = document.getElementById(`janisol_kayntiovi_${key}`);
            if (input) input.value = formulas.janisol_kayntiovi[key];
        });
    }
    
    // Economy Pariovi
    if (formulas.economy_pariovi) {
        Object.keys(formulas.economy_pariovi).forEach(key => {
            const input = document.getElementById(`economy_pariovi_${key}`);
            if (input) input.value = formulas.economy_pariovi[key];
        });
    }
    
    // Economy Käyntiovi
    if (formulas.economy_kayntiovi) {
        Object.keys(formulas.economy_kayntiovi).forEach(key => {
            const input = document.getElementById(`economy_kayntiovi_${key}`);
            if (input) input.value = formulas.economy_kayntiovi[key];
        });
    }
    
    // Janisol Ikkuna
    if (formulas.janisol_ikkuna) {
        Object.keys(formulas.janisol_ikkuna).forEach(key => {
            const input = document.getElementById(`janisol_ikkuna_${key}`);
            if (input) input.value = formulas.janisol_ikkuna[key];
        });
    }
    
    // Economy Ikkuna
    if (formulas.economy_ikkuna) {
        Object.keys(formulas.economy_ikkuna).forEach(key => {
            const input = document.getElementById(`economy_ikkuna_${key}`);
            if (input) input.value = formulas.economy_ikkuna[key];
        });
    }

    // Verkko-ovi
    if (formulas.verkko_ovi) {
        Object.keys(formulas.verkko_ovi).forEach(key => {
            const input = document.getElementById(`verkko_ovi_${key}`);
            if (input) input.value = formulas.verkko_ovi[key];
        });
    }

    // Verkkoseinä
    if (formulas.verkko_seina) {
        Object.keys(formulas.verkko_seina).forEach(key => {
            const input = document.getElementById(`verkko_seina_${key}`);
            if (input) input.value = formulas.verkko_seina[key];
        });
    }

    ['pystypaneli_janisol_pariovi', 'pystypaneli_janisol_kayntiovi', 'pystypaneli_economy_kayntiovi', 'pystypaneli_economy_pariovi'].forEach(calcKey => {
        if (!formulas[calcKey]) return;
        Object.keys(formulas[calcKey]).forEach(key => {
            const input = document.getElementById(`${calcKey}_${key}`);
            if (input) input.value = formulas[calcKey][key];
        });
    });
    
    // Load available formula sets
    loadFormulaSetsList();
}

// Load formula sets to dropdown
async function loadFormulaSetsList() {
    // Try to fetch from Firestore on initial load
    if (window.firebase && window.firebase.db && currentUser) {
        try {
            const { db, collection, getDocs } = window.firebase;
            const querySnapshot = await getDocs(collection(db, 'formulaSets'));
            
            // Update localStorage with fresh data from Firestore
            const sets = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const setName = data.name || doc.id;
                sets[setName] = {
                    ...data.formulas,
                    _firestoreId: doc.id,
                    _createdBy: data.createdBy
                };
            });
            
            if (Object.keys(sets).length > 0) {
                localStorage.setItem('formulaSets', JSON.stringify(sets));
                console.log('✅ Kaavasetit ladattu Firestoresta');
            }
            
        } catch (error) {
            console.error('❌ Virhe ladattaessa kaavoja Firestoresta:', error);
            // Continue with localStorage data
        }
    }
    
    // Load from localStorage (either fresh from Firestore or existing)
    const storedFormulas = localStorage.getItem('formulaSets');
    const activeSetName = localStorage.getItem('activeFormulaSet') || 'default';
    const adminSelect = document.getElementById('activeFormulaSet');
    const settingsSelect = document.getElementById('settingsFormulaSet');
    const targets = [adminSelect, settingsSelect].filter(Boolean);

    targets.forEach((select) => {
        select.innerHTML = '<option value="default">Default Kaavat</option>';
    });
    
    if (storedFormulas) {
        const sets = JSON.parse(storedFormulas);
        Object.keys(sets).forEach(setName => {
            if (setName !== 'default') {
                targets.forEach((select) => {
                    const option = document.createElement('option');
                    option.value = setName;
                    option.textContent = setName;
                    select.appendChild(option);
                });
            }
        });
    }

    targets.forEach((select) => {
        const hasOption = Array.from(select.options).some((opt) => opt.value === activeSetName);
        select.value = hasOption ? activeSetName : 'default';
    });
}

// Switch formula set
function switchFormulaSet() {
    const setName = document.getElementById('activeFormulaSet').value;
    localStorage.setItem('activeFormulaSet', setName);
    const settingsSelect = document.getElementById('settingsFormulaSet');
    if (settingsSelect) {
        settingsSelect.value = setName;
    }
    loadFormulasToPanel();
    updateSettingsInfo();
    calculate(); // Recalculate with new formulas
}

// Switch formula set from settings modal (available to all users)
function switchFormulaSetFromSettings() {
    const settingsSelect = document.getElementById('settingsFormulaSet');
    if (!settingsSelect) return;

    const setName = settingsSelect.value;
    localStorage.setItem('activeFormulaSet', setName);

    const adminSelect = document.getElementById('activeFormulaSet');
    if (adminSelect) {
        adminSelect.value = setName;
    }

    loadFormulasToPanel();
    updateSettingsInfo();
    calculate();
}

// Delete selected formula set (admin only)
async function deleteFormulaSet() {
    if (!isAdmin) {
        showToast('Ei oikeuksia kaavasetin poistoon.', 'warning');
        return;
    }

    const adminSelect = document.getElementById('activeFormulaSet');
    if (!adminSelect) return;

    const setName = adminSelect.value;
    if (!setName || setName === 'default') {
        showToast('Default-kaavasettiä ei voi poistaa.', 'warning');
        return;
    }

    if (!confirm(`Haluatko varmasti poistaa kaavasetin "${setName}"?`)) {
        return;
    }

    let firestoreDeleteFailed = false;

    // Delete matching formula set documents from Firestore
    if (window.firebase && window.firebase.db && currentUser) {
        try {
            const { db, collection, getDocs, doc, deleteDoc } = window.firebase;
            const querySnapshot = await getDocs(collection(db, 'formulaSets'));
            const deletePromises = [];

            querySnapshot.forEach((formulaDoc) => {
                const data = formulaDoc.data();
                const firestoreSetName = data.name || formulaDoc.id;
                if (firestoreSetName === setName) {
                    deletePromises.push(deleteDoc(doc(db, 'formulaSets', formulaDoc.id)));
                }
            });

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
        } catch (error) {
            firestoreDeleteFailed = true;
            console.error('❌ Virhe kaavasetin poistossa Firestoresta:', error);
        }
    }

    // Delete from localStorage and fallback to default
    const storedFormulas = localStorage.getItem('formulaSets');
    const sets = storedFormulas ? JSON.parse(storedFormulas) : {};
    delete sets[setName];
    localStorage.setItem('formulaSets', JSON.stringify(sets));
    localStorage.setItem('activeFormulaSet', 'default');

    const settingsSelect = document.getElementById('settingsFormulaSet');
    if (settingsSelect) {
        settingsSelect.value = 'default';
    }
    adminSelect.value = 'default';

    loadFormulasToPanel();
    updateSettingsInfo();
    calculate();

    if (firestoreDeleteFailed) {
        showToast(`Kaavasetti "${setName}" poistettu paikallisesti (synkronointivirhe).`, 'warning');
    } else {
        showToast(`Kaavasetti "${setName}" poistettu.`, 'success');
    }
}

// Save formula changes - Step 1: Ask for name
function saveFormulaChanges() {
    if (!isAdmin) {
        showToast('Ei oikeuksia kaavojen tallennukseen.', 'warning');
        return;
    }

    // Show name input modal
    const currentSet = document.getElementById('activeFormulaSet').value;
    document.getElementById('formulaSetName').value = currentSet === 'default' ? '' : currentSet;
    
    const modal = new bootstrap.Modal(document.getElementById('saveNameModal'));
    modal.show();
}

// Confirm and save formulas (admin only, no extra password)
async function confirmSaveFormulas() {
    if (!isAdmin) {
        showToast('Ei oikeuksia kaavojen tallennukseen.', 'warning');
        return;
    }

    const formulas = collectFormulasFromPanel();
    let setName = document.getElementById('formulaSetName').value.trim();

    // Validate name
    if (setName === 'default') {
        alert('Nimi "default" on varattu. Valitse toinen nimi.');
        return;
    }

    // If no name provided, use current active set
    if (!setName) {
        setName = document.getElementById('activeFormulaSet').value;
    }

    // Close name modal
    const nameModal = bootstrap.Modal.getInstance(document.getElementById('saveNameModal'));
    if (nameModal) {
        nameModal.hide();
    }
        
    // Try to save to Firestore first
    console.log('🔍 DEBUG - Tallennus alkaa:');
    console.log('  - Firebase käytössä:', !!window.firebase);
    console.log('  - DB käytössä:', !!window.firebase?.db);
    console.log('  - Käyttäjä kirjautunut:', !!currentUser);
    console.log('  - Käyttäjän email:', currentUser?.email);
        
    if (window.firebase && window.firebase.db && currentUser) {
            try {
                const { db, collection, addDoc, serverTimestamp } = window.firebase;
                
                console.log('🔥 Tallennetaan Firestoreen...');
                console.log('  - Kaavasetti nimi:', setName);
                console.log('  - Kaavoja määrä:', Object.keys(formulas).length);
                
                const formulaSetData = {
                    name: setName,
                    formulas: formulas,
                    createdBy: currentUser.email,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                const docRef = await addDoc(collection(db, 'formulaSets'), formulaSetData);
                console.log('✅ ONNISTUI! Kaavasetti tallennettu Firestoreen:', docRef.id);
                
                // Also save to localStorage with Firestore ID
                const storedFormulas = localStorage.getItem('formulaSets');
                const sets = storedFormulas ? JSON.parse(storedFormulas) : {};
                sets[setName] = { ...formulas, _firestoreId: docRef.id };
                localStorage.setItem('formulaSets', JSON.stringify(sets));
                localStorage.setItem('activeFormulaSet', setName);
                
                showToast(`✅ Kaavasetti "${setName}" tallennettu ja synkronoitu!`, 'success');
                
            } catch (error) {
                console.error('❌❌❌ VIRHE: Firestore-tallennus epäonnistui!');
                console.error('Virheen tyyppi:', error.name);
                console.error('Virheviesti:', error.message);
                console.error('Virhekoodi:', error.code);
                console.error('Koko virhe:', error);
                
                // Fallback to localStorage only
                const storedFormulas = localStorage.getItem('formulaSets');
                const sets = storedFormulas ? JSON.parse(storedFormulas) : {};
                sets[setName] = formulas;
                localStorage.setItem('formulaSets', JSON.stringify(sets));
                localStorage.setItem('activeFormulaSet', setName);
                
                showToast(`⚠️ Tallennettu vain paikallisesti - Firebase-virhe: ${error.message}`, 'warning');
            }
        } else {
            // Firebase not available, save to localStorage only
            console.warn('⚠️ Firebase ei käytettävissä - tallennetaan vain localStorageen');
            const storedFormulas = localStorage.getItem('formulaSets');
            const sets = storedFormulas ? JSON.parse(storedFormulas) : {};
            sets[setName] = formulas;
            localStorage.setItem('formulaSets', JSON.stringify(sets));
            localStorage.setItem('activeFormulaSet', setName);
            
            showToast(`⚠️ Tallennettu vain paikallisesti - Firebase ei käytettävissä`, 'warning');
        }
        
    // Reload the list and set active
    loadFormulaSetsList();
        
    // Update settings info display
    updateSettingsInfo();
        
    // Recalculate with new formulas
    calculate();
}

// Collect formulas from panel
function collectFormulasFromPanel() {
    return {
        janisol_pariovi: {
            lasilista_pysty: parseFloat(document.getElementById('janisol_pariovi_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('janisol_pariovi_lasilista_vaaka').value),
            uretaani_korkeus: parseFloat(document.getElementById('janisol_pariovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('janisol_pariovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('janisol_pariovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('janisol_pariovi_potku_kaynti_ulko_leveys').value),
            potku_lisa_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_potku_lisa_sisa_korkeus').value),
            potku_lisa_sisa_leveys: parseFloat(document.getElementById('janisol_pariovi_potku_lisa_sisa_leveys').value),
            potku_lisa_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_potku_lisa_ulko_korkeus').value),
            potku_lisa_ulko_leveys: parseFloat(document.getElementById('janisol_pariovi_potku_lisa_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('janisol_pariovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('janisol_pariovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('janisol_pariovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('janisol_pariovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('janisol_pariovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('janisol_pariovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('janisol_pariovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('janisol_pariovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('janisol_pariovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('janisol_pariovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('janisol_pariovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_ulko_saneeraus').value),
            umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_lisa_sisa_korkeus').value),
            umpiovi_potku_lisa_sisa_leveys: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_lisa_sisa_leveys').value),
            umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_lisa_ulko_korkeus').value),
            umpiovi_potku_lisa_ulko_leveys: parseFloat(document.getElementById('janisol_pariovi_umpiovi_potku_lisa_ulko_leveys').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_umpiovi_potku_ulko_korkeus').value),
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_umpiovi_potku_lisa_sisa_korkeus').value),
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_umpiovi_potku_lisa_ulko_korkeus').value)
        },
        janisol_kayntiovi: {
            rako_10_inner: parseFloat(document.getElementById('janisol_kayntiovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('janisol_kayntiovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('janisol_kayntiovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('janisol_kayntiovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('janisol_kayntiovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('janisol_kayntiovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('janisol_kayntiovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('janisol_kayntiovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('janisol_kayntiovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_umpiovi_potku_ulko_saneeraus').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_umpiovi_potku_ulko_korkeus').value)
        },
        economy_pariovi: {
            lasilista_pysty: parseFloat(document.getElementById('economy_pariovi_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('economy_pariovi_lasilista_vaaka').value),
            uretaani_korkeus: parseFloat(document.getElementById('economy_pariovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('economy_pariovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('economy_pariovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('economy_pariovi_potku_kaynti_ulko_leveys').value),
            potku_lisa_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_potku_lisa_sisa_korkeus').value),
            potku_lisa_sisa_leveys: parseFloat(document.getElementById('economy_pariovi_potku_lisa_sisa_leveys').value),
            potku_lisa_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_potku_lisa_ulko_korkeus').value),
            potku_lisa_ulko_leveys: parseFloat(document.getElementById('economy_pariovi_potku_lisa_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('economy_pariovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('economy_pariovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('economy_pariovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('economy_pariovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('economy_pariovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('economy_pariovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('economy_pariovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('economy_pariovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('economy_pariovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('economy_pariovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('economy_pariovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('economy_pariovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_ulko_saneeraus').value),
            umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_lisa_sisa_korkeus').value),
            umpiovi_potku_lisa_sisa_leveys: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_lisa_sisa_leveys').value),
            umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_lisa_ulko_korkeus').value),
            umpiovi_potku_lisa_ulko_leveys: parseFloat(document.getElementById('economy_pariovi_umpiovi_potku_lisa_ulko_leveys').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_tiiviste_umpiovi_potku_ulko_korkeus').value),
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('economy_pariovi_tiiviste_umpiovi_potku_lisa_sisa_korkeus').value),
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('economy_pariovi_tiiviste_umpiovi_potku_lisa_ulko_korkeus').value)
        },
        economy_kayntiovi: {
            rako_10_inner: parseFloat(document.getElementById('economy_kayntiovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('economy_kayntiovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('economy_kayntiovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('economy_kayntiovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('economy_kayntiovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('economy_kayntiovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('economy_kayntiovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('economy_kayntiovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('economy_kayntiovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_umpiovi_potku_ulko_saneeraus').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_umpiovi_potku_ulko_korkeus').value)
        },
        janisol_ikkuna: {
            lasilista_pysty: parseFloat(document.getElementById('janisol_ikkuna_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('janisol_ikkuna_lasilista_vaaka').value),
            uretaani_korkeus: parseFloat(document.getElementById('janisol_ikkuna_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('janisol_ikkuna_uretaani_leveys').value),
            potku_sisa_korkeus: parseFloat(document.getElementById('janisol_ikkuna_potku_sisa_korkeus').value),
            potku_sisa_leveys: parseFloat(document.getElementById('janisol_ikkuna_potku_sisa_leveys').value),
            potku_ulko_korkeus: parseFloat(document.getElementById('janisol_ikkuna_potku_ulko_korkeus').value),
            potku_ulko_leveys: parseFloat(document.getElementById('janisol_ikkuna_potku_ulko_leveys').value),
            potku_yhdistetty_sisa_leveys: parseFloat(document.getElementById('janisol_ikkuna_potku_yhdistetty_sisa_leveys').value),
            potku_yhdistetty_ulko_leveys: parseFloat(document.getElementById('janisol_ikkuna_potku_yhdistetty_ulko_leveys').value)
        },
        economy_ikkuna: {
            lasilista_pysty: parseFloat(document.getElementById('economy_ikkuna_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('economy_ikkuna_lasilista_vaaka').value),
            uretaani_korkeus: parseFloat(document.getElementById('economy_ikkuna_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('economy_ikkuna_uretaani_leveys').value),
            potku_sisa_korkeus: parseFloat(document.getElementById('economy_ikkuna_potku_sisa_korkeus').value),
            potku_sisa_leveys: parseFloat(document.getElementById('economy_ikkuna_potku_sisa_leveys').value),
            potku_ulko_korkeus: parseFloat(document.getElementById('economy_ikkuna_potku_ulko_korkeus').value),
            potku_ulko_leveys: parseFloat(document.getElementById('economy_ikkuna_potku_ulko_leveys').value),
            potku_yhdistetty_sisa_leveys: parseFloat(document.getElementById('economy_ikkuna_potku_yhdistetty_sisa_leveys').value),
            potku_yhdistetty_ulko_leveys: parseFloat(document.getElementById('economy_ikkuna_potku_yhdistetty_ulko_leveys').value)
        },
        verkko_ovi: {
            kulmalista_pysty: parseFloat(document.getElementById('verkko_ovi_kulmalista_pysty').value),
            kulmalista_vaaka: parseFloat(document.getElementById('verkko_ovi_kulmalista_vaaka').value)
        },
        verkko_seina: {
            kulmalista_pysty: parseFloat(document.getElementById('verkko_seina_kulmalista_pysty').value),
            kulmalista_vaaka: parseFloat(document.getElementById('verkko_seina_kulmalista_vaaka').value)
        },
        pystypaneli_janisol_pariovi: {
            pituus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_pituus').value),
            alotus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_alotus').value),
            uretaani_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_kaynti_ulko_leveys').value),
            potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_lisa_sisa_korkeus').value),
            potku_lisa_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_lisa_sisa_leveys').value),
            potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_lisa_ulko_korkeus').value),
            potku_lisa_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_potku_lisa_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_ulko_saneeraus').value),
            umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_lisa_sisa_korkeus').value),
            umpiovi_potku_lisa_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_lisa_sisa_leveys').value),
            umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_lisa_ulko_korkeus').value),
            umpiovi_potku_lisa_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_umpiovi_potku_lisa_ulko_leveys').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_umpiovi_potku_ulko_korkeus').value),
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_umpiovi_potku_lisa_sisa_korkeus').value),
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_pariovi_tiiviste_umpiovi_potku_lisa_ulko_korkeus').value)
        },
        pystypaneli_janisol_kayntiovi: {
            pituus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_pituus').value),
            alotus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_alotus').value),
            uretaani_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_potku_kaynti_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_umpiovi_potku_ulko_saneeraus').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_janisol_kayntiovi_tiiviste_umpiovi_potku_ulko_korkeus').value)
        },
        pystypaneli_economy_kayntiovi: {
            pituus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_pituus').value),
            alotus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_alotus').value),
            uretaani_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_potku_kaynti_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_umpiovi_potku_ulko_saneeraus').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_kayntiovi_tiiviste_umpiovi_potku_ulko_korkeus').value)
        },
        pystypaneli_economy_pariovi: {
            pituus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_pituus').value),
            alotus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_alotus').value),
            uretaani_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_korkeus').value),
            uretaani_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_leveys').value),
            potku_kaynti_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_kaynti_sisa_korkeus').value),
            potku_kaynti_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_kaynti_sisa_leveys').value),
            potku_kaynti_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_kaynti_ulko_korkeus').value),
            potku_kaynti_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_kaynti_ulko_leveys').value),
            potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_lisa_sisa_korkeus').value),
            potku_lisa_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_lisa_sisa_leveys').value),
            potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_lisa_ulko_korkeus').value),
            potku_lisa_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_potku_lisa_ulko_leveys').value),
            harjalista: parseFloat(document.getElementById('pystypaneli_economy_pariovi_harjalista').value),
            rako_10_inner: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_10_inner').value),
            rako_10_outer: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_10_outer').value),
            rako_15_inner: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_15_inner').value),
            rako_15_outer: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_15_outer').value),
            rako_saneeraus_inner: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_saneeraus_inner').value),
            rako_saneeraus_outer: parseFloat(document.getElementById('pystypaneli_economy_pariovi_rako_saneeraus_outer').value),
            uretaani_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_8mm').value),
            uretaani_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_10mm').value),
            uretaani_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_15mm').value),
            uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_uretaani_saneeraus').value),
            tiiviste_uretaani_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_uretaani_8mm').value),
            tiiviste_uretaani_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_uretaani_10mm').value),
            tiiviste_uretaani_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_uretaani_15mm').value),
            tiiviste_uretaani_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_uretaani_saneeraus').value),
            tiiviste_potku_inner_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_inner_8mm').value),
            tiiviste_potku_outer_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_outer_8mm').value),
            tiiviste_potku_inner_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_inner_10mm').value),
            tiiviste_potku_outer_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_outer_10mm').value),
            tiiviste_potku_inner_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_inner_15mm').value),
            tiiviste_potku_outer_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_outer_15mm').value),
            tiiviste_potku_inner_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_inner_saneeraus').value),
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_potku_outer_saneeraus').value),
            umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_korkeus').value),
            umpiovi_potku_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_leveys').value),
            umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_korkeus').value),
            umpiovi_potku_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_leveys').value),
            umpiovi_potku_sisa_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_8mm').value),
            umpiovi_potku_sisa_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_10mm').value),
            umpiovi_potku_sisa_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_15mm').value),
            umpiovi_potku_sisa_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_sisa_saneeraus').value),
            umpiovi_potku_ulko_8mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_8mm').value),
            umpiovi_potku_ulko_10mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_10mm').value),
            umpiovi_potku_ulko_15mm: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_15mm').value),
            umpiovi_potku_ulko_saneeraus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_ulko_saneeraus').value),
            umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_lisa_sisa_korkeus').value),
            umpiovi_potku_lisa_sisa_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_lisa_sisa_leveys').value),
            umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_lisa_ulko_korkeus').value),
            umpiovi_potku_lisa_ulko_leveys: parseFloat(document.getElementById('pystypaneli_economy_pariovi_umpiovi_potku_lisa_ulko_leveys').value),
            tiiviste_umpiovi_potku_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_umpiovi_potku_sisa_korkeus').value),
            tiiviste_umpiovi_potku_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_umpiovi_potku_ulko_korkeus').value),
            tiiviste_umpiovi_potku_lisa_sisa_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_umpiovi_potku_lisa_sisa_korkeus').value),
            tiiviste_umpiovi_potku_lisa_ulko_korkeus: parseFloat(document.getElementById('pystypaneli_economy_pariovi_tiiviste_umpiovi_potku_lisa_ulko_korkeus').value)
        }
    };
}

// Reset to defaults
function resetToDefaults() {
    if (!confirm('Haluatko varmasti palauttaa oletuskaavat? Tämä ei poista mukautettuja kaavaseттejä.')) {
        return;
    }
    
    localStorage.setItem('activeFormulaSet', 'default');
    loadFormulasToPanel();
    updateSettingsInfo();
    calculate();
    alert('Oletuskaavat palautettu!');
}

// Confirm and create PDF
function confirmExportToPDF() {
    const fileName = document.getElementById('pdfFileName').value.trim();
    
    if (!fileName) {
        alert('Anna nimi tiedostolle.');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Branch: export from named Mitat
    if (pdfExportContext.type === 'mitat') {
        const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
        const mitta = mittatData[pdfExportContext.jobNumber] &&
            mittatData[pdfExportContext.jobNumber][pdfExportContext.itemName];
        if (!mitta) {
            alert('Tallennettua mittaa ei löytynyt.');
            return;
        }

        doc.setFontSize(18);
        doc.text('Teräsovi Mittaohjelmisto', 105, 20, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`Työ ${pdfExportContext.jobNumber} / ${pdfExportContext.itemName}`, 105, 30, { align: 'center' });
        doc.setFontSize(12);
        doc.text(fileName, 105, 38, { align: 'center' });

        let yPosM = 52;
        doc.setFontSize(12);
        doc.text('Tulokset:', 20, yPosM);
        yPosM += 10;
        doc.setFontSize(10);

        mitta.data.forEach(section => {
            if (yPosM > 275) {
                doc.addPage();
                yPosM = 20;
            }
            const sectionTitle = getLasilistaSectionTitle(section.title, mitta);
            doc.setFont(undefined, 'bold');
            doc.text(sectionTitle, 25, yPosM);
            yPosM += 7;
            doc.setFont(undefined, 'normal');

            section.items.forEach(resultItem => {
                if (yPosM > 280) {
                    doc.addPage();
                    yPosM = 20;
                }
                const line = resultItem.value ? `${resultItem.label}: ${resultItem.value}` : resultItem.label;
                doc.text(line, 30, yPosM);
                yPosM += 6;
            });
            yPosM += 4;
        });

        const dateM = new Date().toLocaleDateString('fi-FI');
        const cleanFileNameM = fileName.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').replace(/\s+/g, '_');
        doc.save(`${cleanFileNameM}_${dateM}.pdf`);

        const modalM = bootstrap.Modal.getInstance(document.getElementById('pdfExportModal'));
        modalM.hide();
        pdfExportContext = { type: 'calculator', jobNumber: null, itemName: null };
        return;
    }
    
    // Title
    const titles = {
        'janisol-pariovi': 'Janisol Pariovi',
        'janisol-kayntiovi': 'Janisol Käyntiovi',
        'janisol-ikkuna': 'Janisol Ikkuna',
        'economy-pariovi': 'Economy Pariovi',
        'economy-kayntiovi': 'Economy Käyntiovi',
        'economy-ikkuna': 'Economy Ikkuna',
        'verkko-ovi': 'Verkko-ovi',
        'verkko-seina': 'Verkkoseinä'
    };
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const isVerkkoCalculator = isVerkkoCalculatorType();
    
    doc.setFontSize(18);
    doc.text('Harrin Teräsovi Mittalaskuri', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(titles[currentCalculator] || currentCalculator || '', 105, 30, { align: 'center' });
    
    // Add user-provided name
    doc.setFontSize(12);
    doc.text(fileName, 105, 38, { align: 'center' });
    
    // Inputs
    doc.setFontSize(12);
    let yPos = 50;
    
    doc.text('Syötteet:', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    
    if (isVerkkoCalculator) {
        const isVerkkoSeinaMulti = currentCalculator === 'verkko-seina' && settings.paneCount > 1;
        if (!isVerkkoSeinaMulti) {
            doc.text(`Leveys: ${document.getElementById('mainDoorWidth').value} mm`, 25, yPos);
            yPos += 7;
        }
        for (let i = 1; i <= settings.paneCount; i++) {
            const widthEl = document.getElementById(`paneWidth${i}`);
            const heightEl = document.getElementById(`paneHeight${i}`);
            if (isVerkkoSeinaMulti && widthEl && heightEl) {
                doc.text(`Ruutu ${i}: ${widthEl.value} × ${heightEl.value} mm (L × K)`, 25, yPos);
                yPos += 7;
            } else if (heightEl) {
                doc.text(`Ruutu ${i} korkeus: ${heightEl.value} mm`, 25, yPos);
                yPos += 7;
            }
        }
    } else if (isWindowCalculator) {
        doc.text(`Ruudun leveys: ${document.getElementById('mainDoorWidth').value} mm`, 25, yPos);
        yPos += 7;
    } else {
        doc.text(`Käyntioven leveys: ${document.getElementById('mainDoorWidth').value} mm`, 25, yPos);
        yPos += 7;
    
    if (currentCalculator.includes('pariovi')) {
            doc.text(`Lisäoven leveys: ${document.getElementById('sideDoorWidth').value} mm`, 25, yPos);
            yPos += 7;
        }
        
        doc.text(`Potkupellin oletuskorkeus: ${document.getElementById('kickPlateHeight').value} mm`, 25, yPos);
        yPos += 7;
    }
    
    if (!isVerkkoCalculator) {
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            doc.text(`Ruutu ${i} korkeus: ${el.value} mm`, 25, yPos);
            yPos += 7;
        }
    }
    }
    
    if (!isWindowCalculator && !isVerkkoCalculator) {
        const rakoText = settings.gapOption === 'saneeraus' ? 'Saneerauskynnys' : `${settings.gapOption} mm rako`;
        doc.text(`Rako: ${rakoText}`, 25, yPos);
        yPos += 7;
    }
    doc.text(`Ruutujen määrä: ${settings.paneCount}`, 25, yPos);
    yPos += 12;
    
    // Results
    doc.setFontSize(12);
    doc.text('Tulokset:', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    
    // Get results from display
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    sections.forEach(section => {
        const title = section.querySelector('h5').textContent;
        doc.setFont(undefined, 'bold');
        doc.text(title, 25, yPos);
        yPos += 7;
        
        doc.setFont(undefined, 'normal');
        const items = section.querySelectorAll('.result-item');
        items.forEach(item => {
            if (yPos > 280) {
                doc.addPage();
                yPos = 20;
            }
            doc.text(item.textContent, 30, yPos);
            yPos += 6;
        });
        yPos += 5;
    });
    
    // Save with user-provided name
    const date = new Date().toLocaleDateString('fi-FI');
    // Clean filename (remove special characters)
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').replace(/\s+/g, '_');
    doc.save(`${cleanFileName}_${date}.pdf`);
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('pdfExportModal'));
    modal.hide();
}

// ============================================
// MITAT VIEW - Transfer Results Functionality
// ============================================

function getJobLatestTransferDefaults(jobNumber) {
    const normalizedJobNumber = String(jobNumber || '').trim();
    if (!normalizedJobNumber) {
        return { itemName: '', lasilistaSize: '', lasilistaColor: '' };
    }

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const jobData = mittatData[normalizedJobNumber];
    if (!jobData || typeof jobData !== 'object') {
        return { itemName: '', lasilistaSize: '', lasilistaColor: '' };
    }

    let latestItemName = '';
    let latestItemData = null;
    let latestTimestamp = Number.NEGATIVE_INFINITY;
    let fallbackItemName = '';
    let fallbackItemData = null;

    Object.entries(jobData).forEach(([itemName, itemData]) => {
        if (!itemData || typeof itemData !== 'object') return;

        // Fallback to latest observed object order if timestamps are missing/invalid.
        fallbackItemName = String(itemName || '').trim();
        fallbackItemData = itemData;

        const timestamp = Date.parse(String(itemData?.timestamp || ''));
        if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
            latestItemName = String(itemName || '').trim();
            latestItemData = itemData;
        }
    });

    const chosenItemName = latestItemName || fallbackItemName;
    const chosenItemData = latestItemData || fallbackItemData || {};

    return {
        itemName: chosenItemName,
        lasilistaSize: String(chosenItemData?.lasilistaSize || '').trim(),
        lasilistaColor: String(chosenItemData?.lasilistaColor || '').trim()
    };
}

function applyTransferFieldAutofill(field, suggestedValue) {
    if (!field) return;

    const currentValue = String(field.value || '').trim();
    const wasAutofilled = field.dataset.autofilled === '1';

    if (!suggestedValue) {
        if (wasAutofilled) {
            field.value = '';
            field.dataset.autofilled = '0';
        }
        return;
    }

    if (!currentValue || wasAutofilled) {
        field.value = suggestedValue;
        field.dataset.autofilled = '1';
    }
}

function updateYhdistettyCheckbox() {
    const yhdistettyCheck = document.getElementById('transferYhdistetty');
    const yhdistettyRow = document.getElementById('transferYhdistettyRow');
    if (!yhdistettyCheck || !yhdistettyRow || yhdistettyRow.style.display === 'none') return;

    const jobNumber = document.getElementById('transferJobNumber')?.value.trim();
    const name = document.getElementById('transferItemName')?.value.trim();

    if (jobNumber && name) {
        const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
        const exists = !!(mittatData[jobNumber] && mittatData[jobNumber][name]);
        yhdistettyCheck.checked = exists;
    } else {
        yhdistettyCheck.checked = false;
    }
}

function shouldForceNoLasilista() {
    return (isDoorCalculatorType() && settings.umpioviEnabled === true)
        || isVerkkoCalculatorType()
        || !!pystypaneliEnabled;
}

function prefillTransferFields() {
    const jobInput = document.getElementById('transferJobNumber');
    const itemNameInput = document.getElementById('transferItemName');
    const sizeSelect = document.getElementById('transferLasilistaSize');
    const colorInput = document.getElementById('transferLasilistaColor');
    if (!jobInput || !itemNameInput || !sizeSelect || !colorInput) return;

    const jobNumber = jobInput.value.trim();
    const forceNoLasilista = shouldForceNoLasilista();

    if (!jobNumber) {
        [itemNameInput, sizeSelect, colorInput].forEach((field) => {
            if (field === sizeSelect && forceNoLasilista) {
                field.value = 'ei-lasilistaa';
                field.dataset.autofilled = '1';
                return;
            }
            if (field.dataset.autofilled === '1') {
                field.value = '';
            }
            field.dataset.autofilled = '0';
        });
        return;
    }

    const defaults = getJobLatestTransferDefaults(jobNumber);
    const sizeSuggestion = forceNoLasilista ? 'ei-lasilistaa' : defaults.lasilistaSize;

    applyTransferFieldAutofill(itemNameInput, defaults.itemName);
    applyTransferFieldAutofill(sizeSelect, sizeSuggestion);
    applyTransferFieldAutofill(colorInput, defaults.lasilistaColor);
    updateYhdistettyCheckbox();
}

function normalizeLasilistaColor(colorValue) {
    return String(colorValue || '').trim().toUpperCase();
}

function populateJobNumberSuggestions() {
    const datalist = document.getElementById('jobNumberSuggestions');
    if (!datalist) return;
    datalist.innerHTML = '';

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const jobEntries = Object.entries(mittatData)
        .map(([jobNum, items]) => {
            let latest = 0;
            Object.values(items).forEach(item => {
                const ts = Date.parse(String(item?.timestamp || ''));
                if (Number.isFinite(ts) && ts > latest) latest = ts;
            });
            return { jobNum, latest };
        })
        .sort((a, b) => b.latest - a.latest)
        .slice(0, 6);

    jobEntries.forEach(({ jobNum }) => {
        const opt = document.createElement('option');
        opt.value = jobNum;
        datalist.appendChild(opt);
    });
}

// Open transfer modal
function transferResults() {
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    const isNoResultsTransferMode = isUmpioviNoResultsMode();
    
    if (sections.length === 0 && !isNoResultsTransferMode) {
        showToast('Ei tuloksia siirrettäväksi. Syötä ensin mitat.', 'warning');
        return;
    }
    
    // Clear previous values
    document.getElementById('transferJobNumber').value = '';
    const itemNameInput = document.getElementById('transferItemName');
    if (itemNameInput) {
        itemNameInput.value = '';
        itemNameInput.dataset.autofilled = '0';
    }
    const sizeSelect = document.getElementById('transferLasilistaSize');
    if (sizeSelect) {
        if (shouldForceNoLasilista()) {
            sizeSelect.value = 'ei-lasilistaa';
            sizeSelect.dataset.autofilled = '1';
        } else {
            sizeSelect.value = '';
            sizeSelect.dataset.autofilled = '0';
        }
    }
    const colorInput = document.getElementById('transferLasilistaColor');
    if (colorInput) {
        colorInput.value = '';
        colorInput.dataset.autofilled = '0';
    }
    const countInput = document.getElementById('transferItemCount');
    if (countInput) countInput.value = 1;

    const jobInput = document.getElementById('transferJobNumber');
    if (jobInput && !jobInput.dataset.transferPrefillBound) {
        jobInput.addEventListener('input', prefillTransferFields);
        jobInput.addEventListener('change', prefillTransferFields);
        jobInput.dataset.transferPrefillBound = '1';
    }
    if (itemNameInput && !itemNameInput.dataset.autofillTrackBound) {
        itemNameInput.addEventListener('input', () => {
            itemNameInput.dataset.autofilled = '0';
            updateYhdistettyCheckbox();
        });
        itemNameInput.dataset.autofillTrackBound = '1';
    }
    if (sizeSelect && !sizeSelect.dataset.autofillTrackBound) {
        sizeSelect.addEventListener('change', () => {
            sizeSelect.dataset.autofilled = '0';
        });
        sizeSelect.dataset.autofillTrackBound = '1';
    }
    if (colorInput && !colorInput.dataset.autofillTrackBound) {
        colorInput.addEventListener('input', () => {
            colorInput.dataset.autofilled = '0';
        });
        colorInput.dataset.autofillTrackBound = '1';
    }
    
    populateJobNumberSuggestions();

    const yhdistettyRow = document.getElementById('transferYhdistettyRow');
    if (yhdistettyRow) {
        const isWindowCalc = (currentCalculator || '').includes('ikkuna');
        yhdistettyRow.style.display = isWindowCalc && settings.kickPlateEnabled && !mergeMode ? '' : 'none';
    }
    const yhdistettyCheck = document.getElementById('transferYhdistetty');
    if (yhdistettyCheck) yhdistettyCheck.checked = false;

    const modal = new bootstrap.Modal(document.getElementById('transferToMittatModal'));
    modal.show();
}

// Confirm and save to Mitat
function mergeMeasurementItems(existingItems, incomingItems) {
    const countMap = new Map();
    const order = [];
    const nonParseable = [];

    function addItems(items) {
        (items || []).forEach(item => {
            const parsed = parseLasilistaRow(item.label);
            if (parsed) {
                const key = String(parsed.length);
                if (countMap.has(key)) {
                    countMap.set(key, countMap.get(key) + parsed.count);
                } else {
                    countMap.set(key, parsed.count);
                    order.push(key);
                }
            } else {
                nonParseable.push({ label: item.label, value: item.value || '' });
            }
        });
    }

    addItems(existingItems);
    addItems(incomingItems);

    const result = order.map(key => {
        const count = countMap.get(key);
        const label = count > 1 ? `${key} x ${count}` : key;
        return { label, value: '' };
    });

    return result.concat(nonParseable);
}

function mergeResults(existing, incoming) {
    function withTs(inputs, ts) {
        if (!inputs) return null;
        return inputs._mergedAt ? inputs : { ...inputs, _mergedAt: ts };
    }
    const existingHistory = existing.inputsHistory
        ? existing.inputsHistory
        : (existing.inputs ? [withTs(existing.inputs, existing.timestamp)] : []);
    const newEntry = incoming.inputs ? withTs(incoming.inputs, incoming.timestamp) : null;
    const inputsHistory = newEntry ? [...existingHistory, newEntry] : existingHistory;

    const merged = {
        calculator: existing.calculator,
        timestamp: incoming.timestamp,
        lasilistaSize: existing.lasilistaSize || incoming.lasilistaSize,
        lasilistaColor: existing.lasilistaColor || incoming.lasilistaColor,
        metadataOnly: existing.metadataOnly && incoming.metadataOnly,
        inputs: incoming.inputs || existing.inputs || null,
        inputsHistory: inputsHistory.length > 0 ? inputsHistory : undefined,
        data: JSON.parse(JSON.stringify(existing.data || []))
    };

    const existingSize = (existing.lasilistaSize || '').trim();
    const incomingSize = (incoming.lasilistaSize || '').trim();
    const sameLasilistaSize = existingSize === incomingSize;

    (incoming.data || []).forEach(incomingSection => {
        const isLasilista = isLasilistaSectionTitle(incomingSection.title);
        const isKulmalistat = isKulmalistatSectionTitle(incomingSection.title);

        if (isLasilista) {
            let matchingSection = null;

            if (incomingSize) {
                const expectedTitle = `Lasilista ${incomingSize}`;
                matchingSection = merged.data.find(s =>
                    s.title.trim().toLowerCase() === expectedTitle.toLowerCase()
                );
            }

            if (!matchingSection && sameLasilistaSize) {
                matchingSection = merged.data.find(s => isLasilistaSectionTitle(s.title));
            }

            if (matchingSection) {
                matchingSection.items = mergeMeasurementItems(matchingSection.items, incomingSection.items);
            } else {
                const newSection = JSON.parse(JSON.stringify(incomingSection));
                if (incomingSize && !/(?:\d+x\d+|\d+\s*mm)/i.test(newSection.title)) {
                    newSection.title = `Lasilista ${incomingSize}`;
                }
                if (existingSize) {
                    merged.data.forEach(s => {
                        if (isLasilistaSectionTitle(s.title) && !/(?:\d+x\d+|\d+\s*mm)/i.test(s.title)) {
                            s.title = `Lasilista ${existingSize}`;
                        }
                    });
                }
                merged.data.push(newSection);

                const uniqueSizes = new Set();
                merged.data.forEach(s => {
                    if (!isLasilistaSectionTitle(s.title)) return;
                    const parsed = parseSizeFromSectionTitle(s.title);
                    if (parsed) uniqueSizes.add(parsed.toLowerCase());
                });
                merged.lasilistaSize = uniqueSizes.size === 1
                    ? [...uniqueSizes][0]
                    : '';
            }
        } else if (isKulmalistat) {
            const existingSection = merged.data.find(s => isKulmalistatSectionTitle(s.title));
            if (existingSection) {
                existingSection.items = mergeKulmalistaItems(existingSection.items, incomingSection.items);
            } else {
                merged.data.push(JSON.parse(JSON.stringify(incomingSection)));
            }
        } else {
            const existingSection = merged.data.find(s => s.title === incomingSection.title);
            if (existingSection) {
                existingSection.items = existingSection.items.concat(
                    JSON.parse(JSON.stringify(incomingSection.items))
                );
            } else {
                merged.data.push(JSON.parse(JSON.stringify(incomingSection)));
            }
        }
    });

    return merged;
}

function confirmTransferToMitat() {
    const jobNumber = document.getElementById('transferJobNumber').value.trim();
    const itemName = document.getElementById('transferItemName').value.trim();
    const rawLasilistaSize = document.getElementById('transferLasilistaSize')?.value || '';
    const lasilistaSize = rawLasilistaSize === 'ei-lasilistaa' ? '' : rawLasilistaSize;
    const lasilistaColor = normalizeLasilistaColor(document.getElementById('transferLasilistaColor')?.value || '');
    const isNoResultsTransferMode = isUmpioviNoResultsMode();
    
    if (!jobNumber || !itemName || (!isNoResultsTransferMode && !rawLasilistaSize)) {
        showToast('Täytä kaikki kentät!', 'warning');
        return;
    }
    
    // Get current results
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0 && !isNoResultsTransferMode) {
        showToast('Ei tuloksia siirrettäväksi.', 'warning');
        return;
    }
    
    // Build results object
    const results = {
        calculator: currentCalculator,
        timestamp: new Date().toISOString(),
        lasilistaSize: lasilistaSize,
        lasilistaColor: lasilistaColor,
        metadataOnly: isNoResultsTransferMode,
        inputs: {
            calculator: currentCalculator,
            mainDoorWidth: document.getElementById('mainDoorWidth')?.value || '',
            sideDoorWidth: document.getElementById('sideDoorWidth')?.value || '',
            kickPlateHeight: document.getElementById('kickPlateHeight')?.value || '',
            gapOption: settings.gapOption,
            paneCount: settings.paneCount,
            kickPlateEnabled: settings.kickPlateEnabled,
            sealThresholdEnabled: settings.sealThresholdEnabled,
            umpioviEnabled: settings.umpioviEnabled,
            umpivasikkaEnabled: settings.umpivasikkaEnabled,
            formulaSet: localStorage.getItem('activeFormulaSet') || 'default',
            paneHeights: [],
            paneWidths: []
        },
        data: []
    };
    const isWindowCalc = (currentCalculator || '').includes('ikkuna');
    for (let i = 1; i <= settings.paneCount; i++) {
        results.inputs.paneHeights.push(document.getElementById(`paneHeight${i}`)?.value || '');
        const widthEl = document.getElementById(`paneWidth${i}`);
        const widthVal = widthEl?.value
            || (isWindowCalc && !widthEl ? (document.getElementById('mainDoorWidth')?.value || '') : '')
            || '';
        results.inputs.paneWidths.push(widthVal);
    }
    attachPystypaneliInputs(results.inputs);
    
    sections.forEach(section => {
        const title = section.querySelector('h5').textContent;
        const items = [];
        
        section.querySelectorAll('.result-item').forEach(item => {
            // Result items contain full text like "Sisä vasen: 2500 mm"
            const fullText = item.textContent.trim();
            
            // Split by colon to separate label and value
            const colonIndex = fullText.indexOf(':');
            if (colonIndex !== -1) {
                const label = fullText.substring(0, colonIndex).trim();
                const value = fullText.substring(colonIndex + 1).trim();
                items.push({ label, value });
            } else {
                // If no colon, use full text as label
                items.push({ label: fullText, value: '' });
            }
        });
        
        results.data.push({ title, items });
    });

    const isYhdistetty = document.getElementById('transferYhdistetty')?.checked;
    if (isYhdistetty && isWindowCalc && settings.kickPlateEnabled) {
        const paneWidths = results.inputs.paneWidths.map(Number);
        const paneHeights = results.inputs.paneHeights.map(Number);
        const kph = parseFloat(results.inputs.kickPlateHeight) || 0;
        let recalc;
        if (currentCalculator === 'janisol-ikkuna') {
            recalc = calculateJanisolIkkuna(paneWidths, paneHeights, kph, true);
        } else {
            recalc = calculateEconomyIkkuna(paneWidths, paneHeights, kph, true);
        }
        const potkuIdx = results.data.findIndex(s => s.title === 'Potkupelti');
        if (potkuIdx !== -1) {
            results.data[potkuIdx].items = recalc.potkupelti.map(v => ({ label: v, value: '' }));
        }
        results.inputs.yhdistettyLeveys = true;
    }

    if (mergeMode && frozenFirstResult) {
        const existingHistory = frozenFirstResult.inputsHistory
            ? frozenFirstResult.inputsHistory
            : (frozenFirstResult.inputs
                ? [{ ...frozenFirstResult.inputs, _mergedAt: frozenFirstResult.timestamp }]
                : []);
        if (!mergeLiveCommitted) {
            results.inputsHistory = [...existingHistory, { ...results.inputs, _mergedAt: results.timestamp }];
        } else {
            results.inputsHistory = [...existingHistory];
        }
    }
    
    const itemCount = Math.max(1, Math.min(99, parseInt(document.getElementById('transferItemCount')?.value) || 1));

    // Load existing mitat from localStorage
    let mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    
    // Initialize job if doesn't exist
    if (!mittatData[jobNumber]) {
        mittatData[jobNumber] = {};
    }

    const namesToSave = [];
    if (itemCount === 1) {
        namesToSave.push(itemName);
    } else {
        for (let i = 1; i <= itemCount; i++) {
            namesToSave.push(`${itemName} (${i}.)`);
        }
    }

    namesToSave.forEach(finalName => {
        const resultsCopy = JSON.parse(JSON.stringify(results));
        resultsCopy.timestamp = new Date().toISOString();

        if (mittatData[jobNumber][finalName]) {
            const action = confirm(
                `"${finalName}" on jo tallennettu työnumerolle ${jobNumber}.\n\n` +
                `OK = Yhdistä mitat\nPeruuta = Korvaa vanhat mitat`
            );
            if (action) {
                mittatData[jobNumber][finalName] = mergeResults(mittatData[jobNumber][finalName], resultsCopy);
            } else {
                mittatData[jobNumber][finalName] = resultsCopy;
            }
        } else {
            mittatData[jobNumber][finalName] = resultsCopy;
        }
    });
    
    // Save to localStorage
    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    syncMitatStateToFirestore();
    syncMitatInputsToFirestore();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('transferToMittatModal'));
    modal.hide();
    
    const countLabel = itemCount > 1 ? ` (${itemCount} kpl)` : '';
    showToast(`Mitat siirretty: ${jobNumber} - ${itemName}${countLabel}`, 'success');
    
    console.log('✅ Mitat tallennettu:', { jobNumber, itemName, itemCount, results });
}

// Load and display Mitat view
function loadMittatView() {
    const container = document.getElementById('mittatContainer');
    const openState = captureMitatOpenState();
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
    let hiddenItemsCount = 0;
    Object.keys(mittatData).forEach((jobNumber) => {
        Object.keys(mittatData[jobNumber]).forEach((itemName) => {
            if (hiddenMitatItems[`${jobNumber}-${itemName}`]) {
                hiddenItemsCount++;
            }
        });
    });
    const togglePackingBtn = document.getElementById('togglePackingListBtn');
    const toggleLasilistaPdfBtn = document.getElementById('toggleLasilistaPdfBtn');
    const toggleShowHiddenItemsBtn = document.getElementById('toggleShowHiddenItemsBtn');
    const tuotantoBackupBtn = document.getElementById('tuotantoBackupBtn');
    if (tuotantoBackupBtn) {
        tuotantoBackupBtn.style.display = isAdmin ? '' : 'none';
    }
    if (togglePackingBtn) {
        togglePackingBtn.classList.toggle('btn-primary', !isPackingListMode);
        togglePackingBtn.classList.toggle('btn-success', isPackingListMode);
        togglePackingBtn.textContent = isPackingListMode ? '✅ Pakkausluettelo-tila päällä' : '📦 Tee pakkausluettelo';
    }
    if (toggleLasilistaPdfBtn) {
        toggleLasilistaPdfBtn.classList.toggle('btn-info', !isLasilistaPdfMode);
        toggleLasilistaPdfBtn.classList.toggle('btn-success', isLasilistaPdfMode);
        toggleLasilistaPdfBtn.textContent = isLasilistaPdfMode ? '✅ Lasilistat PDF -tila päällä' : '📄 Lasilistat PDF';
    }
    if (toggleShowHiddenItemsBtn) {
        toggleShowHiddenItemsBtn.classList.toggle('btn-outline-secondary', !isShowingHiddenItems);
        toggleShowHiddenItemsBtn.classList.toggle('btn-secondary', isShowingHiddenItems);
        toggleShowHiddenItemsBtn.textContent = isShowingHiddenItems ? `Piilota piilotetut (${hiddenItemsCount})` : `Näytä piilotetut (${hiddenItemsCount})`;
    }
    
    // Check if empty
    if (Object.keys(mittatData).length === 0) {
        showMitatSplitMessage('Ei tallennettuja mittoja. Käytä laskimessa "Siirrä"-nappia siirtääksesi tuloksia tänne.');
        return;
    }
    
    // Build HTML
    let html = '';
    
    // Sort job numbers by latest added/updated item timestamp:
    // oldest first, newest last (newest appears on the bottom row).
    const getJobLatestTimestamp = (jobNumber) => {
        const jobData = mittatData[jobNumber];
        if (!jobData || typeof jobData !== 'object') return Number.NEGATIVE_INFINITY;

        let latestTimestamp = Number.NEGATIVE_INFINITY;
        let fallbackTimestamp = Number.NEGATIVE_INFINITY;

        Object.values(jobData).forEach((itemData) => {
            if (!itemData || typeof itemData !== 'object') return;

            // Fallback to latest observed object order when timestamp is missing/invalid.
            fallbackTimestamp += 1;

            const parsedTimestamp = Date.parse(String(itemData?.timestamp || ''));
            if (Number.isFinite(parsedTimestamp) && parsedTimestamp > latestTimestamp) {
                latestTimestamp = parsedTimestamp;
            }
        });

        return Number.isFinite(latestTimestamp) ? latestTimestamp : fallbackTimestamp;
    };

    const jobNumbers = Object.keys(mittatData).sort((a, b) => {
        const aLatest = getJobLatestTimestamp(a);
        const bLatest = getJobLatestTimestamp(b);
        if (aLatest !== bLatest) return aLatest - bLatest;
        return a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' });
    });
    
    jobNumbers.forEach(jobNumber => {
        const jobId = `job-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Check if job has notes
        const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
        const jobNoteKey = `job-${jobNumber}`;
        const hasJobNote = mittatNotes[jobNoteKey] && mittatNotes[jobNoteKey].trim() !== '';
        const jobNoteClass = hasJobNote ? 'btn-note-active' : 'btn-note-empty';
        
        const itemNames = Object.keys(mittatData[jobNumber]).sort((a, b) => a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' }));
        const jobHasHiddenItems = itemNames.some((itemName) => hiddenMitatItems[`${jobNumber}-${itemName}`]);
        const visibleItemNames = itemNames.filter((itemName) => {
            const checkKey = `${jobNumber}-${itemName}`;
            const passesHidden = isShowingHiddenItems || !hiddenMitatItems[checkKey];
            if (!passesHidden) return false;
            return matchesMitatSearch(jobNumber, itemName, mittatData[jobNumber][itemName], mitatSearchQuery);
        });
        const totalCount = itemNames.length;
        const doneCount = itemNames.filter((itemName) => doneMitat[`${jobNumber}-${itemName}`]).length;

        const isFullyPacked = itemNames.length > 0 &&
            itemNames.every((itemName) => packedMitat[`${jobNumber}-${itemName}`]);
        if (isFullyPacked) return;

        if (mitatSearchQuery && visibleItemNames.length === 0) return;

        html += `<div class="mitat-job-section" data-job-number="${encodeURIComponent(jobNumber)}">`;
        html += `<div class="mitat-job-header" onclick="toggleJobDetails('${jobId}')" role="button" tabindex="0" aria-expanded="false" aria-controls="${jobId}" aria-label="Avaa/sulje työ ${jobNumber}">`;
        html += `<div class="d-flex align-items-center gap-2">`;
        const jobTitleClass = isShowingHiddenItems && jobHasHiddenItems ? 'mitat-job-title mitat-job-title-blink' : 'mitat-job-title';
        html += `<h4 class="${jobTitleClass}">Työ ${jobNumber}</h4>`;
        html += `<button class="btn-note ${jobNoteClass}" onclick="event.stopPropagation(); openMittatNote('job', '${jobNumber}', '', this)" title="Muistiinpano">📝</button>`;
        const progressCircumference = 2 * Math.PI * 15.5;
        const progressPercent = totalCount > 0 ? doneCount / totalCount : 0;
        const progressOffset = (progressCircumference * (1 - progressPercent)).toFixed(2);
        html += `<div class="mitat-job-progress" id="${jobId}-done-counter" title="${doneCount}/${totalCount} tehty">`;
        html += `<svg viewBox="0 0 36 36" class="mitat-job-progress-ring" aria-hidden="true">`;
        html += `<circle class="mitat-job-progress-track" cx="18" cy="18" r="15.5"></circle>`;
        html += `<circle class="mitat-job-progress-fill" id="${jobId}-progress-fill" cx="18" cy="18" r="15.5" stroke-dasharray="${progressCircumference.toFixed(2)}" stroke-dashoffset="${progressOffset}"></circle>`;
        html += `</svg>`;
        html += `<span class="mitat-job-progress-text" id="${jobId}-progress-text">${doneCount}/${totalCount}</span>`;
        html += `</div>`;
        if (isPackingListMode) {
            const isSelectedJob = selectedPackingJobNumber === jobNumber;
            const selectClass = isSelectedJob ? 'btn-success' : 'btn-outline-primary';
            const selectText = isSelectedJob ? 'Valittu' : 'Valitse';
            html += `<button class="btn btn-sm ${selectClass}" onclick="event.stopPropagation(); selectPackingJob('${sanitizeForAttribute(jobNumber)}')">${selectText}</button>`;
            if (isSelectedJob) {
                html += `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); downloadPackingList('${sanitizeForAttribute(jobNumber)}')">Lataa pakkausluettelo</button>`;
            }
        } else if (isLasilistaPdfMode) {
            const isSelectedJob = selectedLasilistaPdfJobNumber === jobNumber;
            const selectClass = isSelectedJob ? 'btn-success' : 'btn-outline-primary';
            const selectText = isSelectedJob ? 'Valittu' : 'Valitse';
            html += `<button class="btn btn-sm ${selectClass}" onclick="event.stopPropagation(); selectLasilistaPdfJob('${sanitizeForAttribute(jobNumber)}')">${selectText}</button>`;
            if (isSelectedJob) {
                html += `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); downloadLasilistaSummaryPdf('${sanitizeForAttribute(jobNumber)}')">Lataa Lasilistat PDF</button>`;
            }
        }
        html += `</div>`;
        html += `<div class="d-flex align-items-center gap-2">`;
        if (isAdmin) {
            html += `<button class="mitat-job-delete-btn" onclick="event.stopPropagation(); deleteJobMitat('${jobNumber}')" title="Poista työ">🗑️</button>`;
        }
        const isSearchExpanded = mitatSearchQuery.length > 0;
        html += `<span class="mitat-job-expand-btn"><span class="mitat-toggle-icon${isSearchExpanded ? ' rotated' : ''}" id="${jobId}-icon">${isSearchExpanded ? '▲' : '▼'}</span></span>`;
        html += `</div>`;
        html += `</div>`;
        
        // Job items container (auto-expanded when searching)
        html += `<div class="mitat-job-items" id="${jobId}" style="${isSearchExpanded ? '' : 'display: none;'}">`;

        const isPackingSelectedForJob = isPackingListMode && selectedPackingJobNumber === jobNumber;
        const isLasilistaSelectedForJob = isLasilistaPdfMode && selectedLasilistaPdfJobNumber === jobNumber;
        const jobPackingBtnClass = isPackingSelectedForJob ? 'btn btn-success' : 'btn btn-primary';
        const jobPackingBtnText = isPackingSelectedForJob ? '✅ Pakkausluettelo-tila päällä' : '📦 Tee pakkausluettelo';
        const jobLasilistaBtnClass = isLasilistaSelectedForJob ? 'btn btn-success' : 'btn btn-info';
        const jobLasilistaBtnText = isLasilistaSelectedForJob ? '✅ Lasilistat PDF -tila päällä' : '📄 Lasilistat PDF';
        html += `<div class="mitat-job-quick-actions d-flex gap-2">`;
        html += `<button class="${jobPackingBtnClass}" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); startPackingListForJob('${sanitizeForAttribute(jobNumber)}')">${jobPackingBtnText}</button>`;
        html += `<button class="${jobLasilistaBtnClass}" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); startLasilistaPdfForJob('${sanitizeForAttribute(jobNumber)}')">${jobLasilistaBtnText}</button>`;
        html += `</div>`;

        if (visibleItemNames.length === 0) {
            html += `<p class="text-muted small mb-0 px-2 py-2">Kaikki tuotteet on piilotettu.</p>`;
        }

        visibleItemNames.forEach(itemName => {
            const item = mittatData[jobNumber][itemName];
            const date = new Date(item.timestamp).toLocaleString('fi-FI');
            const uniqueId = `mitat-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}-${itemName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const checkKey = `${jobNumber}-${itemName}`;
            const isHidden = !!hiddenMitatItems[checkKey];
            
            // Get checked state
            const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
            const isChecked = checkedMitat[checkKey] || false;
            const checkboxClass = isChecked ? 'preset-checkbox checked' : 'preset-checkbox';
            const hasLasilistat = itemHasLasilistat(item);
            const lasilistatOk = !hasLasilistat || isChecked;
            const doneChecked = doneMitat[checkKey] || false;
            const doneCheckboxClass = !lasilistatOk && !doneChecked
                ? 'preset-checkbox disabled'
                : (doneChecked ? 'preset-checkbox checked' : 'preset-checkbox');
            
            // Check if item has notes
            const itemNoteKey = `item-${jobNumber}-${itemName}`;
            const hasItemNote = mittatNotes[itemNoteKey] && mittatNotes[itemNoteKey].trim() !== '';
            const itemNoteClass = hasItemNote ? 'btn-note-active' : 'btn-note-empty';
            
            html += `<div class="mitat-item-section">`;
            html += `<div class="mitat-item-header" onclick="toggleMitatDetails('${uniqueId}')" role="button" tabindex="0" aria-expanded="false" aria-controls="${uniqueId}" aria-label="Avaa/sulje ${itemName}">`;
            html += `<div class="mitat-item-header-main">`;
            html += `<div class="d-flex align-items-center gap-2 mitat-checkpoints">`;
            const itemTitleClass = isShowingHiddenItems && isHidden ? 'mitat-item-title mitat-item-title-hidden' : 'mitat-item-title';
            html += `<h5 class="${itemTitleClass}">- ${itemName}</h5>`;
            const safeJobAttr = sanitizeForAttribute(jobNumber);
            const safeItemAttr = sanitizeForAttribute(itemName);
            html += `<div class="dropdown mitat-item-actions">`;
            html += `<button class="btn-item-actions" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" onclick="event.stopPropagation();" title="Toiminnot">⚙️</button>`;
            html += `<ul class="dropdown-menu p-2" onclick="event.stopPropagation();">`;
            const hideLabel = isHidden && isShowingHiddenItems ? 'Palauta näkyviin' : 'Piilota';
            const hideCls = isHidden && isShowingHiddenItems ? 'btn btn-sm btn-outline-success w-100' : 'btn btn-sm btn-outline-danger w-100';
            html += `<li class="d-flex align-items-center gap-2">`;
            html += `<button class="btn btn-sm btn-primary" onclick="cloneMitatItem('${safeJobAttr}', '${safeItemAttr}', this)">Clone</button>`;
            html += `<input type="number" class="form-control form-control-sm clone-count-input" value="1" min="1" max="99">`;
            html += `<span class="small">x</span>`;
            html += `</li>`;
            html += `<li class="mt-1">`;
            html += `<button class="btn btn-sm btn-outline-secondary w-100" onclick="showMitatItemInputs('${safeJobAttr}', '${safeItemAttr}')">Syötteet</button>`;
            html += `</li>`;
            html += `<li class="mt-1">`;
            html += `<button class="btn btn-sm btn-outline-warning w-100" onclick="renameMitatItem('${safeJobAttr}', '${safeItemAttr}', this)">Muokkaa nimeä</button>`;
            html += `</li>`;
            html += `<li class="mt-1">`;
            html += `<button class="${hideCls}" type="button" onclick="hideMitatItem('${safeJobAttr}', '${safeItemAttr}')">${hideLabel}</button>`;
            html += `</li>`;
            html += `</ul>`;
            html += `</div>`;
            html += `<button class="btn-note ${itemNoteClass}" onclick="event.stopPropagation(); openMittatNote('item', '${jobNumber}', '${itemName}', this)" title="Muistiinpano">📝</button>`;
            if (hasLasilistat) {
                html += `<span class="mitat-mini-label">lasilistat</span>`;
                html += `<div class="${checkboxClass}" role="checkbox" tabindex="0" aria-checked="${isChecked}" aria-label="Lasilistat tehty ${itemName}" onclick="event.stopPropagation(); toggleMittatCheck('${checkKey}', this)">`;
                html += `${isChecked ? '✓' : ''}`;
                html += `</div>`;
                html += `<span class="mitat-checkpoint-separator">/</span>`;
            }
            html += `<span class="mitat-mini-label">tehty</span>`;
            const doneDisabled = !lasilistatOk && !doneChecked;
            html += `<div class="${doneCheckboxClass}" role="checkbox" tabindex="${doneDisabled ? '-1' : '0'}" aria-checked="${doneChecked}" aria-disabled="${doneDisabled}" aria-label="Tehty ${itemName}" title="${lasilistatOk || doneChecked ? 'Merkitse tehdyksi' : 'Merkitse ensin lasilistat'}" onclick="event.stopPropagation(); toggleMittatDone('${checkKey}', '${sanitizeForAttribute(jobNumber)}', this)">`;
            html += `${doneChecked ? '✓' : ''}`;
            html += `</div>`;
            if (isPackingListMode && selectedPackingJobNumber === jobNumber) {
                const packingKey = `${jobNumber}||${itemName}`;
                const packingChecked = !!selectedPackingItems[packingKey];
                const btnClass = packingChecked ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-primary';
                const btnText = packingChecked ? 'Valittu' : 'Valitse';
                const disabledAttr = doneChecked ? '' : ' disabled';
                const titleAttr = doneChecked ? '' : ' title="Merkitse ensin tehdyksi"';
                html += `<button class="${btnClass}"${disabledAttr}${titleAttr} onclick="event.stopPropagation(); togglePackingItem('${sanitizeForAttribute(jobNumber)}', '${sanitizeForAttribute(itemName)}')">${btnText}</button>`;
            }
            if (hasLasilistat && isLasilistaPdfMode && selectedLasilistaPdfJobNumber === jobNumber) {
                const pdfKey = `${jobNumber}||${itemName}`;
                const pdfChecked = !!selectedLasilistaPdfItems[pdfKey];
                const btnClass = pdfChecked ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-primary';
                const btnText = pdfChecked ? 'Valittu' : 'Valitse';
                const disabledAttr = isChecked ? ' disabled' : '';
                const titleAttr = isChecked ? ' title="Lasilistat jo merkitty"' : '';
                html += `<button class="${btnClass}"${disabledAttr}${titleAttr} onclick="event.stopPropagation(); toggleLasilistaPdfItem('${sanitizeForAttribute(jobNumber)}', '${sanitizeForAttribute(itemName)}')">${btnText}</button>`;
            }
            if (doneChecked && packedMitat[checkKey]) {
                html += `<span class="mitat-packed-label">(Pakattu!)</span>`;
            }
            html += `</div>`;
            html += `<div class="d-flex align-items-center gap-2">`;
            if (isAdmin) {
                html += `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 3px 6px;" onclick="event.stopPropagation(); deleteMitta('${jobNumber}', '${itemName}')">🗑️</button>`;
            }
            html += `<span class="mitat-toggle-icon" id="${uniqueId}-icon">▼</span>`;
            html += `</div>`;
            html += `</div>`;
            html += `<div class="mitat-item-header-secondary">`;
            html += `<small class="text-muted">${date}</small>`;
            html += `<div></div>`;
            html += `</div>`;
            html += `</div>`;
            
            // Render results (hidden by default)
            html += `<div class="mitat-details" id="${uniqueId}" style="display: none;">`;
            item.data.forEach(section => {
                const sectionTitle = getLasilistaSectionTitle(section.title, item);
                html += `<div class="mitat-result-section">`;
                html += `<h6>${sectionTitle}</h6>`;
                html += `<div class="mitat-result-items">`;
                
                section.items.forEach(resultItem => {
                    html += `<div class="mitat-result-item">`;
                    html += `<span class="mitat-result-label">${resultItem.label}</span>`;
                    html += `<span class="mitat-result-value">${resultItem.value}</span>`;
                    html += `</div>`;
                });
                
                html += `</div>`;
                html += `</div>`;
            });
            html += `<div class="d-flex justify-content-end align-items-center gap-2 mt-2">`;
            html += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); copyMittaResults('${jobNumber}', '${itemName}', event)">📋 Kopioi</button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); exportMittaToPDF('${jobNumber}', '${itemName}')">📄 PDF</button>`;
            html += `</div>`;
            html += `</div>`;
            
            html += `</div>`;
        });
        
        html += `</div>`; // Close mitat-job-items
        html += `</div>`; // Close mitat-job-section
    });
    
    if (html === '' && mitatSearchQuery) {
        showMitatSplitMessage(`Ei hakutuloksia haulle "<strong>${mitatSearchQuery}</strong>".`);
        applyPendingJobDeepLink();
        return;
    }
    if (html === '') {
        showMitatSplitMessage('Kaikki työnumerot on pakattu. Katso Paketit-sivu.');
        applyPendingJobDeepLink();
        return;
    }
    container.innerHTML = html;
    if (!mitatSearchQuery) {
        if (mitatSearchWasActive) {
            mitatSearchWasActive = false;
        } else {
            restoreMitatOpenState(openState);
        }
    }
    setupMitatSplitLayout();
    applyPendingJobDeepLink();
}

function showMitatSplitMessage(message) {
    const container = document.getElementById('mittatContainer');
    const sidebar = document.getElementById('mitatJobSidebar');
    const panel = document.getElementById('mitatJobPanel');
    if (container) container.innerHTML = '';
    if (sidebar) sidebar.innerHTML = '';
    if (panel) panel.innerHTML = `<p class="text-muted text-center">${message}</p>`;
}

function setupMitatSplitLayout() {
    const container = document.getElementById('mittatContainer');
    const sidebar = document.getElementById('mitatJobSidebar');
    const panel = document.getElementById('mitatJobPanel');
    if (!container || !sidebar || !panel) return;

    const jobSections = Array.from(container.querySelectorAll('.mitat-job-section'));
    if (jobSections.length === 0) return;

    const visibleJobNumbers = jobSections.map((section) => decodeURIComponent(section.dataset.jobNumber));
    if (!visibleJobNumbers.includes(selectedMitatJobNumber)) {
        selectedMitatJobNumber = visibleJobNumbers[visibleJobNumbers.length - 1];
    }

    sidebar.innerHTML = '';
    panel.innerHTML = '';

    jobSections.forEach((section) => {
        const jobNumber = decodeURIComponent(section.dataset.jobNumber);
        const isSelected = jobNumber === selectedMitatJobNumber;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mitat-sidebar-item${isSelected ? ' mitat-sidebar-item--selected' : ''}`;
        button.setAttribute('aria-current', isSelected ? 'true' : 'false');
        button.setAttribute('aria-label', `Avaa työ ${jobNumber}`);

        const progress = section.querySelector('.mitat-job-progress');
        if (progress) {
            const progressClone = progress.cloneNode(true);
            progressClone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
            button.appendChild(progressClone);
        }

        const title = document.createElement('span');
        title.className = 'mitat-sidebar-title';
        title.textContent = `Työ ${jobNumber}`;
        if (section.querySelector('.mitat-job-title-blink')) {
            title.classList.add('mitat-job-title-blink');
        }
        button.appendChild(title);

        const chevron = document.createElement('span');
        chevron.className = 'mitat-sidebar-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '›';
        button.appendChild(chevron);

        button.addEventListener('click', () => selectMitatJob(jobNumber));
        sidebar.appendChild(button);

        if (!isSelected) {
            section.remove();
            return;
        }

        const jobItems = section.querySelector('.mitat-job-items');
        const jobIcon = section.querySelector('.mitat-job-expand-btn .mitat-toggle-icon');
        const jobHeader = section.querySelector('.mitat-job-header');
        if (jobItems) jobItems.style.display = 'block';
        if (jobIcon) {
            jobIcon.textContent = '▲';
            jobIcon.classList.add('rotated');
        }
        if (jobHeader) jobHeader.setAttribute('aria-expanded', 'true');
        panel.appendChild(section);
        addMitatPanelFullscreenControl(jobHeader);
    });

    syncMitatFullscreenDom();
}

function selectMitatJob(jobNumber) {
    if (selectedMitatJobNumber === jobNumber) return;
    selectedMitatJobNumber = jobNumber;
    loadMittatView();
}

function addMitatPanelFullscreenControl(jobHeader) {
    if (!jobHeader || jobHeader.querySelector('.mitat-job-fullscreen-btn')) return;

    const actions = jobHeader.children[1];
    if (!actions) return;

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'mitat-job-fullscreen-btn';
    fullscreenButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMitatPanelFullscreen();
    });
    actions.insertBefore(fullscreenButton, actions.firstChild);

    jobHeader.addEventListener('dblclick', (event) => {
        if (event.target.closest('button, input, a, [role="checkbox"]')) return;
        toggleMitatPanelFullscreen();
    });

    updateMitatPanelFullscreenControl();
}

function updateMitatPanelFullscreenTop() {
    const headerCard = document.querySelector('#mittatView > .card');
    const root = getMitatFullscreenRoot();
    if (!headerCard || !root) return;

    root.style.setProperty(
        '--mitat-fullscreen-top',
        `${Math.max(0, Math.ceil(headerCard.getBoundingClientRect().bottom))}px`
    );
}

function getMitatFullscreenRoot() {
    const root = document.getElementById('mitatFullscreenRoot');
    if (root && root.parentElement !== document.body) {
        document.body.appendChild(root);
    }
    return root;
}

function getMitatSplitLayout() {
    const root = getMitatFullscreenRoot();
    return root?.querySelector('.mitat-split-layout')
        || document.querySelector('#mitatSplitLayoutHost .mitat-split-layout');
}

function syncMitatFullscreenDom() {
    const host = document.getElementById('mitatSplitLayoutHost');
    const root = getMitatFullscreenRoot();
    const layout = getMitatSplitLayout();
    if (!host || !root || !layout) return;

    if (isMitatPanelFullscreen && layout.parentElement !== root) {
        root.appendChild(layout);
    } else if (!isMitatPanelFullscreen && layout.parentElement !== host) {
        host.appendChild(layout);
    }
}

function setMitatPanelFullscreen(enabled) {
    const host = document.getElementById('mitatSplitLayoutHost');
    const root = getMitatFullscreenRoot();
    const layout = getMitatSplitLayout();
    if (!host || !root || !layout) return;

    if (isMitatPanelFullscreen === enabled) {
        syncMitatFullscreenDom();
        return;
    }

    if (enabled) {
        isMitatPanelFullscreen = true;
        mitatFullscreenPreviousBodyOverflow = document.body.style.overflow;
        mitatFullscreenPreviousDocumentOverflow = document.documentElement.style.overflow;
        layout.classList.add('mitat-split-layout--fullscreen');
        root.appendChild(layout);
        updateMitatPanelFullscreenTop();
        root.hidden = false;
        root.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        mitatFullscreenResizeHandler = updateMitatPanelFullscreenTop;
        window.addEventListener('resize', mitatFullscreenResizeHandler);
    } else {
        root.hidden = true;
        root.setAttribute('aria-hidden', 'true');
        layout.classList.remove('mitat-split-layout--fullscreen');
        host.appendChild(layout);
        document.body.style.overflow = mitatFullscreenPreviousBodyOverflow;
        document.documentElement.style.overflow = mitatFullscreenPreviousDocumentOverflow;
        mitatFullscreenPreviousBodyOverflow = '';
        mitatFullscreenPreviousDocumentOverflow = '';
        root.style.removeProperty('--mitat-fullscreen-top');
        if (mitatFullscreenResizeHandler) {
            window.removeEventListener('resize', mitatFullscreenResizeHandler);
            mitatFullscreenResizeHandler = null;
        }
        isMitatPanelFullscreen = false;
    }

    updateMitatPanelFullscreenControl();
}

function toggleMitatPanelFullscreen() {
    setMitatPanelFullscreen(!isMitatPanelFullscreen);
}

function updateMitatPanelFullscreenControl() {
    const isFullscreen = isMitatPanelFullscreen;
    document.querySelectorAll('.mitat-job-fullscreen-btn').forEach((button) => {
        button.textContent = isFullscreen ? '×' : '⛶';
        button.title = isFullscreen ? 'Poistu koko näytön tilasta' : 'Näytä tuotelista koko näytössä';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(isFullscreen));
    });
}

// Capture currently open Mitat accordion state before rerender
function captureMitatOpenState() {
    const state = { openJobs: [], openItems: [] };

    document.querySelectorAll('.mitat-job-items').forEach((el) => {
        if (el.style.display !== 'none') {
            state.openJobs.push(el.id);
        }
    });

    document.querySelectorAll('.mitat-details').forEach((el) => {
        if (el.style.display !== 'none') {
            state.openItems.push(el.id);
        }
    });

    return state;
}

// Restore open Mitat accordion state after rerender
function restoreMitatOpenState(state) {
    if (!state) return;

    (state.openJobs || []).forEach((jobId) => {
        const jobEl = document.getElementById(jobId);
        const jobIcon = document.getElementById(`${jobId}-icon`);
        if (jobEl) {
            jobEl.style.display = 'block';
        }
        if (jobIcon) {
            jobIcon.textContent = '▲';
            jobIcon.classList.add('rotated');
        }
    });

    (state.openItems || []).forEach((itemId) => {
        const itemEl = document.getElementById(itemId);
        const itemIcon = document.getElementById(`${itemId}-icon`);
        if (itemEl) {
            itemEl.style.display = 'block';
        }
        if (itemIcon) {
            itemIcon.textContent = '▲';
            itemIcon.classList.add('rotated');
        }
    });
}

function loadPaketitView() {
    const container = document.getElementById('paketitContainer');
    if (!container) return;

    const paketitBackupBtn = document.getElementById('paketitBackupBtn');
    if (paketitBackupBtn) {
        paketitBackupBtn.style.display = isAdmin ? '' : 'none';
    }
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
    const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
    const packedTimestamps = JSON.parse(localStorage.getItem('packedTimestamps') || '{}');

    const packedByJob = {};
    Object.keys(mittatData).forEach((jobNumber) => {
        const itemNames = Object.keys(mittatData[jobNumber] || {});
        const packedItems = itemNames
            .filter((itemName) => {
                const checkKey = `${jobNumber}-${itemName}`;
                return packedMitat[checkKey] && !hiddenMitatItems[checkKey];
            })
            .map((itemName) => {
                const checkKey = `${jobNumber}-${itemName}`;
                const packageNumber = Number(packedPackageNumbers[checkKey]);
                return {
                    itemName,
                    packageNumber: Number.isFinite(packageNumber) && packageNumber > 0 ? packageNumber : null
                };
            });
        if (packedItems.length > 0) {
            packedByJob[jobNumber] = packedItems.sort((a, b) => {
                const aPkg = a.packageNumber ?? Number.MAX_SAFE_INTEGER;
                const bPkg = b.packageNumber ?? Number.MAX_SAFE_INTEGER;
                if (aPkg !== bPkg) return aPkg - bPkg;
                return a.itemName.localeCompare(b.itemName, 'fi', { numeric: true, sensitivity: 'base' });
            });
        }
    });

    if (paketitSearchQuery) {
        Object.keys(packedByJob).forEach((jobNumber) => {
            packedByJob[jobNumber] = packedByJob[jobNumber].filter(
                (item) => matchesPaketitSearch(jobNumber, item, paketitSearchQuery, packedTimestamps)
            );
            if (packedByJob[jobNumber].length === 0) delete packedByJob[jobNumber];
        });
    }

    const getLatestPackedTimestamp = (jobNumber) => {
        const prefix = `${jobNumber}-`;
        let latest = Number.NEGATIVE_INFINITY;
        Object.entries(packedTimestamps).forEach(([key, ts]) => {
            if (!key.startsWith(prefix)) return;
            const parsed = Date.parse(String(ts || ''));
            if (Number.isFinite(parsed) && parsed > latest) latest = parsed;
        });
        return latest;
    };

    // Päivämääräväli-haussa näytetään tulokset kronologisesti (pienin pakkausaika ylimpänä)
    const isRangeQuery = PAKETIT_DATE_RANGE_REGEX.test((paketitSearchQuery || '').toLowerCase().trim());

    const getEarliestMatchedTimestamp = (jobNumber) => {
        let earliest = Number.POSITIVE_INFINITY;
        (packedByJob[jobNumber] || []).forEach((item) => {
            if (item.packageNumber == null) return;
            const ts = packedTimestamps[`${jobNumber}-${item.packageNumber}`];
            const parsed = ts ? new Date(ts).getTime() : NaN;
            if (Number.isFinite(parsed) && parsed < earliest) earliest = parsed;
        });
        return earliest;
    };

    const jobNumbers = Object.keys(packedByJob).sort((a, b) => {
        if (isRangeQuery) {
            const diff = getEarliestMatchedTimestamp(a) - getEarliestMatchedTimestamp(b);
            if (diff !== 0) return diff;
            return a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' });
        }
        const diff = getLatestPackedTimestamp(b) - getLatestPackedTimestamp(a);
        if (diff !== 0) return diff;
        return b.localeCompare(a, 'fi', { numeric: true, sensitivity: 'base' });
    });

    if (jobNumbers.length === 0) {
        if (paketitSearchQuery) {
            container.innerHTML = `<p class="text-muted text-center">Ei hakutuloksia haulle "<strong>${paketitSearchQuery}</strong>".</p>`;
        } else {
            container.innerHTML = '<p class="text-muted text-center">Ei pakattuja tuotteita. Tuotteet siirtyvät tänne, kun niistä tehdään pakkausluettelo.</p>';
        }
        applyPendingJobDeepLink();
        return;
    }

    const isSearchExpanded = !!paketitSearchQuery;

    let html = '';
    jobNumbers.forEach((jobNumber) => {
        const jobId = `paketit-job-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const packedItems = packedByJob[jobNumber];
        const numberedPackageCount = new Set(
            packedItems
                .map((item) => item.packageNumber)
                .filter((value) => Number.isFinite(value) && value > 0)
        ).size;
        const hasUnnumberedItems = packedItems.some((item) => !item.packageNumber);
        const packageCount = numberedPackageCount + (hasUnnumberedItems ? 1 : 0);

        html += `<div class="mitat-job-section">`;
        html += `<div class="mitat-job-header" onclick="toggleJobDetails('${jobId}')" role="button" tabindex="0" aria-expanded="${isSearchExpanded}" aria-controls="${jobId}" aria-label="Avaa/sulje työ ${jobNumber}">`;
        html += `<div class="d-flex align-items-center gap-2">`;
        html += `<h4 class="mitat-job-title">Työ ${jobNumber}</h4>`;
        html += `<span class="mitat-mini-label">(${packedItems.length} PAKATTU / ${packageCount} PAKETTIA)</span>`;
        html += `</div>`;
        html += `<div class="d-flex align-items-center gap-2">`;
        if (isAdmin) {
            html += `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 3px 6px;" onclick="event.stopPropagation(); deleteJobMitat('${sanitizeForAttribute(jobNumber)}')">🗑️</button>`;
        }
        html += `<span class="mitat-toggle-icon" id="${jobId}-icon">${isSearchExpanded ? '▲' : '▼'}</span>`;
        html += `</div>`;
        html += `</div>`;

        html += `<div class="mitat-job-items" id="${jobId}" style="display: ${isSearchExpanded ? 'block' : 'none'};">`;

        // Group items by package number
        const packageGroups = new Map();
        packedItems.forEach((packedItem) => {
            const key = packedItem.packageNumber ?? 0;
            if (!packageGroups.has(key)) packageGroups.set(key, []);
            packageGroups.get(key).push(packedItem);
        });
        const sortedPackageKeys = Array.from(packageGroups.keys()).sort((a, b) => {
            if (isRangeQuery) {
                const tsA = a === 0 ? Number.POSITIVE_INFINITY : (new Date(packedTimestamps[`${jobNumber}-${a}`] || 0).getTime() || Number.POSITIVE_INFINITY);
                const tsB = b === 0 ? Number.POSITIVE_INFINITY : (new Date(packedTimestamps[`${jobNumber}-${b}`] || 0).getTime() || Number.POSITIVE_INFINITY);
                if (tsA !== tsB) return tsA - tsB;
                return a - b;
            }
            if (a === 0) return 1;
            if (b === 0) return -1;
            return b - a;
        });
        sortedPackageKeys.forEach((pkgKey) => {
            const groupItems = packageGroups.get(pkgKey);
            const groupLabel = pkgKey === 0 ? 'Pakattu' : `Paketti ${pkgKey}`;
            let groupTimestamp = '';
            if (pkgKey !== 0) {
                const ts = packedTimestamps[`${jobNumber}-${pkgKey}`];
                if (ts) {
                    const d = new Date(ts);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    groupTimestamp = ` (${day}.${month}.${year} klo ${hours}.${minutes})`;
                }
            }
            const dropZoneAttrs = isAdmin
                ? ` paketit-drop-zone" data-job-number="${sanitizeForAttribute(jobNumber)}" data-pkg-key="${pkgKey}`
                : '';
            html += `<div class="paketit-package-group${dropZoneAttrs}">`;
            html += `<div class="paketit-package-header">${groupLabel}${groupTimestamp}</div>`;
            groupItems.forEach((packedItem) => {
                const draggableAttrs = isAdmin
                    ? ` draggable="true" data-job-number="${sanitizeForAttribute(jobNumber)}" data-item-name="${sanitizeForAttribute(packedItem.itemName)}" data-pkg-key="${pkgKey}"`
                    : '';
                html += `<div class="mitat-item-section${isAdmin ? ' paketit-item-draggable' : ''}"${draggableAttrs}>`;
                html += `<div class="mitat-item-header-main">`;
                html += `<div class="d-flex align-items-center gap-2">`;
                html += `<h5 class="mitat-item-title">- ${packedItem.itemName}</h5>`;
                if (isAdmin) {
                    const safeJob = sanitizeForAttribute(jobNumber);
                    const safeItem = sanitizeForAttribute(packedItem.itemName);
                    html += `<div class="dropdown mitat-item-actions">`;
                    html += `<button class="btn-item-actions" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" onclick="event.stopPropagation();" title="Toiminnot">⚙️</button>`;
                    html += `<ul class="dropdown-menu p-2" onclick="event.stopPropagation();">`;
                    html += `<li>`;
                    html += `<button class="btn btn-sm btn-outline-info w-100" onclick="showPaketitItemDetails('${safeJob}', '${safeItem}', this)">Tiedot</button>`;
                    html += `</li>`;
                    html += `<li class="mt-1">`;
                    html += `<button class="btn btn-sm btn-outline-warning w-100" onclick="renamePaketitItem('${safeJob}', '${safeItem}', this)">Muokkaa nimeä</button>`;
                    html += `</li>`;
                    html += `</ul>`;
                    html += `</div>`;
                }
                html += `</div>`;
                html += `</div>`;
                html += `</div>`;
            });
            html += `</div>`;
        });

        html += `</div>`;
        html += `</div>`;
    });

    container.innerHTML = html;

    if (isAdmin) {
        initPaketitDragAndDrop(container);
    }
    applyPendingJobDeepLink();
}

// ============================================
// PAKETIT DRAG-AND-DROP (admin only)
// ============================================

let paketitDraggedJobNumber = null;
let paketitDraggedItemName = null;

function initPaketitDragAndDrop(container) {
    const draggables = container.querySelectorAll('.paketit-item-draggable[draggable="true"]');
    const dropZones = container.querySelectorAll('.paketit-drop-zone');

    draggables.forEach((el) => {
        el.addEventListener('dragstart', (e) => {
            paketitDraggedJobNumber = el.dataset.jobNumber;
            paketitDraggedItemName = el.dataset.itemName;
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('paketit-dragging');
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('paketit-dragging');
            dropZones.forEach((z) => z.classList.remove('drag-over', 'drag-invalid'));
        });
    });

    dropZones.forEach((zone) => {
        zone.addEventListener('dragover', (e) => {
            if (zone.dataset.jobNumber !== paketitDraggedJobNumber) {
                zone.classList.add('drag-invalid');
                return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
            zone.classList.remove('drag-invalid');
        });
        zone.addEventListener('dragleave', (e) => {
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove('drag-over', 'drag-invalid');
            }
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over', 'drag-invalid');

            if (zone.dataset.jobNumber !== paketitDraggedJobNumber) return;

            const newPkgKey = Number(zone.dataset.pkgKey);
            const currentPkgKey = Number(
                container.querySelector(
                    `.paketit-item-draggable[data-job-number="${paketitDraggedJobNumber}"][data-item-name="${paketitDraggedItemName}"]`
                )?.dataset.pkgKey ?? 0
            );
            if (newPkgKey === currentPkgKey) return;

            const checkKey = `${paketitDraggedJobNumber}-${paketitDraggedItemName}`;
            const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
            if (newPkgKey === 0) {
                delete packedPackageNumbers[checkKey];
            } else {
                packedPackageNumbers[checkKey] = newPkgKey;
            }
            localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
            syncMitatStateToFirestore();

            const openJobIds = Array.from(
                container.querySelectorAll('.mitat-job-items')
            ).filter((el) => el.style.display !== 'none')
             .map((el) => el.id);

            loadPaketitView();

            openJobIds.forEach((jobId) => {
                const el = document.getElementById(jobId);
                if (el && el.style.display === 'none') {
                    toggleJobDetails(jobId);
                }
            });
        });
    });
}

function renamePaketitItem(jobNumber, itemName, btn) {
    const newName = prompt('Anna uusi nimi:', itemName);
    if (!newName || newName.trim() === itemName) return;
    const trimmedName = newName.trim();

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!mittatData[jobNumber]?.[itemName]) {
        showToast('Mittaa ei löydetty.', 'warning');
        return;
    }
    if (mittatData[jobNumber][trimmedName]) {
        showToast(`Nimi "${trimmedName}" on jo käytössä.`, 'warning');
        return;
    }

    mittatData[jobNumber][trimmedName] = mittatData[jobNumber][itemName];
    delete mittatData[jobNumber][itemName];
    localStorage.setItem('mittatData', JSON.stringify(mittatData));

    const oldKey = `${jobNumber}-${itemName}`;
    const newKey = `${jobNumber}-${trimmedName}`;
    ['checkedMitat', 'doneMitat', 'packedMitat', 'packedPackageNumbers', 'hiddenMitatItems'].forEach((storeKey) => {
        const obj = JSON.parse(localStorage.getItem(storeKey) || '{}');
        if (oldKey in obj) {
            obj[newKey] = obj[oldKey];
            delete obj[oldKey];
            localStorage.setItem(storeKey, JSON.stringify(obj));
        }
    });

    const notes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    const oldNoteKey = `item-${jobNumber}-${itemName}`;
    const newNoteKey = `item-${jobNumber}-${trimmedName}`;
    if (oldNoteKey in notes) {
        notes[newNoteKey] = notes[oldNoteKey];
        delete notes[oldNoteKey];
        localStorage.setItem('mittatNotes', JSON.stringify(notes));
    }

    syncMitatStateToFirestore();

    const menu = btn.closest('.dropdown-menu');
    const dropdownToggle = menu?.previousElementSibling;
    if (dropdownToggle && window.bootstrap?.Dropdown) {
        const instance = bootstrap.Dropdown.getInstance(dropdownToggle);
        if (instance) instance.hide();
    }

    const container = document.getElementById('paketitContainer');
    const openJobIds = Array.from(
        container?.querySelectorAll('.mitat-job-items') || []
    ).filter((el) => el.style.display !== 'none').map((el) => el.id);

    loadPaketitView();

    openJobIds.forEach((jobId) => {
        const el = document.getElementById(jobId);
        if (el && el.style.display === 'none') toggleJobDetails(jobId);
    });

    showToast(`Nimi muutettu: "${trimmedName}"`, 'success');
}

function showPaketitItemDetails(jobNumber, itemName, btn, editEntryIdx = -1, editMeta = false) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const item = mittatData[jobNumber]?.[itemName];
    if (!item) {
        showToast('Mittaa ei löytynyt.', 'warning');
        return;
    }

    if (btn) {
        const menu = btn.closest('.dropdown-menu');
        const toggle = menu?.previousElementSibling;
        if (toggle && window.bootstrap?.Dropdown) {
            bootstrap.Dropdown.getInstance(toggle)?.hide();
        }
    }

    const fallback = JSON.parse(localStorage.getItem('mitatInputs') || '{}')?.[jobNumber]?.[itemName] || {};
    const inputsHistory = item.inputsHistory || fallback.inputsHistory || null;
    const singleInputs = item.inputs || fallback.inputs || null;
    const calcLabel = itemUsesPystypaneli(item, inputsHistory, singleInputs)
        ? `${getCalculatorLabel(item.calculator)} (pystypaneli)`
        : getCalculatorLabel(item.calculator);
    const date = item.timestamp ? new Date(item.timestamp).toLocaleString('fi-FI') : '—';
    const safeJob = sanitizeForAttribute(jobNumber);
    const safeItem = sanitizeForAttribute(itemName);

    let html = '';

    // Syötteet-osio
    html += `<h6 class="fw-bold mb-2">Syötteet</h6>`;
    html += `<div class="mitat-inputs-list">`;
    const headerRows = [
        { label: 'Laskin', value: calcLabel },
        { label: 'Siirretty', value: date }
    ];
    if (editMeta) {
        html += renderInputsRows(headerRows);
        html += buildLasilistaMetaEditForm(item, jobNumber, itemName, 'paketit');
    } else {
        if (item.lasilistaSize) headerRows.push({ label: 'Lasilistan koko', value: item.lasilistaSize });
        if (item.lasilistaColor) headerRows.push({ label: 'Lasilistan väri', value: item.lasilistaColor });
        html += renderInputsRows(headerRows);
        html += `<div class="mt-2 mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="showPaketitItemDetails('${safeJob}','${safeItem}',null,-1,true)">Muokkaa lasilistaa</button></div>`;
    }

    if (inputsHistory && inputsHistory.length > 1) {
        inputsHistory.forEach((entry, idx) => {
            const entryDate = entry._mergedAt ? new Date(entry._mergedAt).toLocaleString('fi-FI') : '—';
            const entryCalcLabel = calculatorLabelWithPanel(entry.calculator || item.calculator, entry);
            const entryCalc = entry.calculator || '';
            const entryIsWindow = entryCalc.includes('ikkuna');
            const entryIsPariovi = entryCalc.includes('pariovi');
            const editBtn = editEntryIdx !== idx
                ? `<button class="btn btn-sm mitat-edit-btn btn-outline-secondary" onclick="showPaketitItemDetails('${safeJob}','${safeItem}',null,${idx})">Muokkaa</button>`
                : '';
            const partLabel = entryIsWindow ? 'Ikkuna' : 'Ovi';
            html += `<div class="mitat-inputs-section-header d-flex justify-content-between align-items-center">
                <span>${partLabel} — ${entryCalcLabel} — ${entryDate}</span>${editBtn}
            </div>`;
            if (editEntryIdx === idx) {
                html += buildInputsEditForm(entry, entryIsWindow, entryIsPariovi, idx, jobNumber, itemName, 'paketit');
            } else {
                html += renderInputsRows(buildInputsRows(entry, entryIsWindow, entryIsPariovi));
            }
        });
    } else {
        const inputs = (inputsHistory && inputsHistory.length === 1) ? inputsHistory[0] : singleInputs;
        const inputsCalc = (inputs && inputs.calculator) || (item.calculator || '');
        const inputsIsWindow = inputsCalc.includes('ikkuna');
        const inputsIsPariovi = inputsCalc.includes('pariovi');
        if (editEntryIdx === 0 && inputs) {
            html += buildInputsEditForm(inputs, inputsIsWindow, inputsIsPariovi, 0, jobNumber, itemName, 'paketit');
        } else {
            html += renderInputsRows(buildInputsRows(inputs, inputsIsWindow, inputsIsPariovi));
            if (!inputs) {
                html += `<div class="mitat-inputs-note text-muted small mt-2">Alkuperäisiä syötteitä ei ole tallennettu tälle mitalle.</div>`;
            } else {
                html += `<div class="mt-3"><button class="btn btn-sm btn-outline-secondary" onclick="showPaketitItemDetails('${safeJob}','${safeItem}',null,0)">Muokkaa syötteitä</button></div>`;
            }
        }
    }
    html += `</div>`;

    // Mitat-osio
    if (item.data && item.data.length > 0) {
        html += `<hr><h6 class="fw-bold mb-2">Mitat</h6>`;
        item.data.forEach((section) => {
            html += `<div class="mitat-result-section">`;
            html += `<h6>${getLasilistaSectionTitle(section.title, item)}</h6>`;
            html += `<div class="mitat-result-items">`;
            section.items.forEach((row) => {
                html += `<div class="mitat-result-item">`;
                html += `<span class="mitat-result-label">${row.label}</span>`;
                html += `<span class="mitat-result-value">${row.value}</span>`;
                html += `</div>`;
            });
            html += `</div></div>`;
        });
    }

    document.getElementById('mitatInputsTitle').textContent = `${jobNumber} — ${itemName}`;
    document.getElementById('mitatInputsBody').innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('mitatInputsModal')).show();
}

// ============================================
// MITAT NOTES FUNCTIONALITY
// ============================================

let currentNoteType = null;
let currentNoteJobNumber = null;
let currentNoteItemName = null;
let currentNoteButtonElement = null;
let isPackingListMode = false;
let selectedPackingJobNumber = null;
let selectedPackingItems = {};
let isLasilistaPdfMode = false;
let selectedLasilistaPdfJobNumber = null;
let selectedLasilistaPdfItems = {};
let isShowingHiddenItems = false;
let mitatSearchQuery = '';
let mitatSearchWasActive = false;
let selectedMitatJobNumber = null;
let isMitatPanelFullscreen = false;
let mitatFullscreenResizeHandler = null;
let mitatFullscreenPreviousBodyOverflow = '';
let mitatFullscreenPreviousDocumentOverflow = '';
let paketitSearchQuery = '';

function handlePaketitSearchInput(value) {
    paketitSearchQuery = value.trim();
    loadPaketitView();
}

const PAKETIT_DATE_RANGE_REGEX = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function matchesPaketitSearch(jobNumber, packedItem, query, packedTimestamps) {
    if (!query) return true;
    const q = query.toLowerCase().trim();

    // Päivämääräväli, esim. "01.06.2026-15.06.2026" -> osuu pakkausaikaan välillä (molemmat päivät mukaan lukien)
    const rangeMatch = q.match(PAKETIT_DATE_RANGE_REGEX);
    if (rangeMatch) {
        const [, d1, m1, y1, d2, m2, y2] = rangeMatch;
        let start = new Date(Number(y1), Number(m1) - 1, Number(d1), 0, 0, 0, 0).getTime();
        let end = new Date(Number(y2), Number(m2) - 1, Number(d2), 23, 59, 59, 999).getTime();
        if (start > end) [start, end] = [end, start];

        if (packedItem.packageNumber != null && packedTimestamps) {
            const ts = packedTimestamps[`${jobNumber}-${packedItem.packageNumber}`];
            const parsed = ts ? new Date(ts).getTime() : NaN;
            if (Number.isFinite(parsed) && parsed >= start && parsed <= end) return true;
        }
        return false;
    }

    if (String(jobNumber).toLowerCase().includes(q)) return true;
    if (String(packedItem.itemName).toLowerCase().includes(q)) return true;

    if (packedItem.packageNumber != null) {
        if (String(packedItem.packageNumber).includes(q)) return true;
        if (`paketti ${packedItem.packageNumber}`.includes(q)) return true;

        const ts = packedTimestamps && packedTimestamps[`${jobNumber}-${packedItem.packageNumber}`];
        if (ts) {
            const d = new Date(ts);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            if (`${day}.${month}.${year}`.includes(q)) return true;
        }
    }

    return false;
}

function handleMitatSearchInput(value) {
    const trimmed = value.trim();
    if (trimmed) mitatSearchWasActive = true;
    mitatSearchQuery = trimmed;
    loadMittatView();
}

function matchesMitatSearch(jobNumber, itemName, item, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();

    // Lasilista-pituushaku: "lasilista 798" tai "lasilista 798mm"
    const lasilistaLengthMatch = q.match(/^lasilista\s+(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i);
    if (lasilistaLengthMatch) {
        const targetLength = Number(lasilistaLengthMatch[1].replace(',', '.'));
        for (const section of (item.data || [])) {
            if (!isLasilistaSectionTitle(section.title)) continue;
            for (const row of (section.items || [])) {
                const parsed = parseLasilistaRow(row.label);
                if (parsed && Math.abs(parsed.length - targetLength) < 0.5) return true;
            }
        }
        return false;
    }

    if (String(jobNumber).toLowerCase().includes(q)) return true;
    if (String(itemName).toLowerCase().includes(q)) return true;

    const calc = String(item.calculator || '').toLowerCase();
    if (calc.includes(q)) return true;

    if (String(item.lasilistaColor || '').toLowerCase().includes(q)) return true;
    if (String(item.lasilistaSize || '').toLowerCase().includes(q)) return true;

    for (const section of (item.data || [])) {
        if (String(section.title || '').toLowerCase().includes(q)) return true;
        for (const row of (section.items || [])) {
            if (String(row.label || '').toLowerCase().includes(q)) return true;
            if (String(row.value || '').toLowerCase().includes(q)) return true;
        }
    }

    return false;
}

function sanitizeForAttribute(value) {
    return String(value).replace(/'/g, "\\'");
}

function toggleShowHiddenItems() {
    isShowingHiddenItems = !isShowingHiddenItems;
    loadMittatView();
}

function hideMitatItem(jobNumber, itemName) {
    const checkKey = `${jobNumber}-${itemName}`;
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');

    if (!mittatData[jobNumber]?.[itemName]) {
        showToast('Tuotetta ei löytynyt.', 'warning');
        return;
    }

    const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
    const wasHidden = !!hiddenMitatItems[checkKey];
    if (wasHidden) {
        delete hiddenMitatItems[checkKey];
    } else {
        hiddenMitatItems[checkKey] = true;
    }
    localStorage.setItem('hiddenMitatItems', JSON.stringify(hiddenMitatItems));
    syncMitatStateToFirestore();

    const mittatView = document.getElementById('mittatView');
    if (mittatView && !mittatView.classList.contains('d-none')) {
        loadMittatView();
    }
    const paketitView = document.getElementById('paketitView');
    if (paketitView && !paketitView.classList.contains('d-none')) {
        loadPaketitView();
    }
    showToast(wasHidden ? 'Tuote palautettu näkyviin' : 'Tuote piilotettu', 'info');
}

function formatFinnishDate(date) {
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

function startPackingListForJob(jobNumber) {
    const isAlreadySelected = isPackingListMode && selectedPackingJobNumber === jobNumber;
    if (isAlreadySelected) {
        isPackingListMode = false;
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
    } else {
        isPackingListMode = true;
        isLasilistaPdfMode = false;
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
        selectedPackingJobNumber = jobNumber;
        selectedPackingItems = {};
    }
    loadMittatView();
}

function startLasilistaPdfForJob(jobNumber) {
    const isAlreadySelected = isLasilistaPdfMode && selectedLasilistaPdfJobNumber === jobNumber;
    if (isAlreadySelected) {
        isLasilistaPdfMode = false;
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
    } else {
        isLasilistaPdfMode = true;
        isPackingListMode = false;
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
        selectedLasilistaPdfJobNumber = jobNumber;
        selectedLasilistaPdfItems = {};
    }
    loadMittatView();
}

function togglePackingListMode() {
    isPackingListMode = !isPackingListMode;

    if (isPackingListMode) {
        isLasilistaPdfMode = false;
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
    }

    if (!isPackingListMode) {
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
    }

    loadMittatView();
}

function selectPackingJob(jobNumber) {
    if (!isPackingListMode) return;

    if (selectedPackingJobNumber === jobNumber) {
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
    } else {
        selectedPackingJobNumber = jobNumber;
        selectedPackingItems = {};
    }

    loadMittatView();
}

function togglePackingItem(jobNumber, itemName) {
    if (!isPackingListMode || selectedPackingJobNumber !== jobNumber) return;

    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const doneKey = `${jobNumber}-${itemName}`;
    if (!doneMitat[doneKey]) {
        showToast('Merkitse tuote ensin tehdyksi ennen pakkausta.', 'warning');
        return;
    }

    const itemKey = `${jobNumber}||${itemName}`;
    selectedPackingItems[itemKey] = !selectedPackingItems[itemKey];

    if (!selectedPackingItems[itemKey]) {
        delete selectedPackingItems[itemKey];
    }

    loadMittatView();
}

function toggleLasilistaPdfMode() {
    isLasilistaPdfMode = !isLasilistaPdfMode;

    if (isLasilistaPdfMode) {
        isPackingListMode = false;
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
    } else {
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
    }

    loadMittatView();
}

function selectLasilistaPdfJob(jobNumber) {
    if (!isLasilistaPdfMode) return;

    if (selectedLasilistaPdfJobNumber === jobNumber) {
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
    } else {
        selectedLasilistaPdfJobNumber = jobNumber;
        selectedLasilistaPdfItems = {};
    }

    loadMittatView();
}

function toggleLasilistaPdfItem(jobNumber, itemName) {
    if (!isLasilistaPdfMode || selectedLasilistaPdfJobNumber !== jobNumber) return;

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!itemHasLasilistat(mittatData[jobNumber]?.[itemName])) {
        showToast('Tuotteessa ei ole lasilistoja.', 'warning');
        return;
    }

    const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
    if (checkedMitat[`${jobNumber}-${itemName}`]) {
        showToast('Tuote on jo merkitty lasilistat-checkpointilla.', 'warning');
        return;
    }

    const itemKey = `${jobNumber}||${itemName}`;
    selectedLasilistaPdfItems[itemKey] = !selectedLasilistaPdfItems[itemKey];

    if (!selectedLasilistaPdfItems[itemKey]) {
        delete selectedLasilistaPdfItems[itemKey];
    }

    loadMittatView();
}

function parseSizeFromSectionTitle(title) {
    const match = String(title || '').match(/lasilista\s+(\d+(?:x\d+|\s*mm))/i);
    return match ? match[1].replace(/\s+/g, '') : '';
}

function collectCombinedLasilistaRows(jobNumber, selectedItemNames) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const jobData = mittatData[jobNumber] || {};
    const grouped = {};

    selectedItemNames.forEach((itemName) => {
        const itemData = jobData[itemName];
        if (!itemData || !Array.isArray(itemData.data)) return;

        const lasilistaSections = itemData.data.filter((section) => isLasilistaSectionTitle(section.title));
        if (lasilistaSections.length === 0) return;

        lasilistaSections.forEach((section) => {
            if (!Array.isArray(section.items)) return;

            const displayTitle = getLasilistaSectionTitle(section.title, itemData);
            const size = parseSizeFromSectionTitle(displayTitle) || 'määrittämätön';

            if (!grouped[size]) {
                grouped[size] = {};
            }

            section.items.forEach((resultItem) => {
                const parsed = parseLasilistaRow(resultItem?.label || '');
                if (!parsed) return;
                const lengthKey = String(parsed.length);
                grouped[size][lengthKey] = (grouped[size][lengthKey] || 0) + parsed.count;
            });
        });
    });

    return grouped;
}

async function generateLasilistaSummaryPdf(jobNumber, groupedRows, lasilistaColor = '') {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        throw new Error('jsPDF ei ole saatavilla.');
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateText = formatFinnishDate(new Date());
    const textScale = 2.2;
    const lasilistaRowsScale = 1.4;
    const scaled = (value) => value * textScale;
    let y = scaled(24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(scaled(22));
    doc.text('LASILISTAT', pageWidth / 2, y, { align: 'center' });
    y += scaled(11);

    doc.setFontSize(scaled(12));
    const jobLine = lasilistaColor ? `TYÖNRO: ${jobNumber} / ${lasilistaColor}` : `TYÖNRO: ${jobNumber}`;
    doc.text(jobLine, 20, y);
    y += scaled(9);
    doc.text(`PVM: ${dateText}`, pageWidth - 20, y, { align: 'right' });
    y += scaled(9);

    const sizeKeys = Object.keys(groupedRows).sort((a, b) =>
        a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' })
    );

    sizeKeys.forEach((size) => {
        const lengths = Object.keys(groupedRows[size]).sort((a, b) => {
            const aNum = Number(a);
            const bNum = Number(b);
            if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                return bNum - aNum;
            }
            return sortByFinnishNumberString(a, b);
        });

        if (lengths.length === 0) return;

        if (y > pageHeight - scaled(30)) {
            doc.addPage();
            y = scaled(20);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(scaled(14 * lasilistaRowsScale));
        doc.text(`Lasilista ${size}`, 20, y);
        y += scaled(8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(scaled(12 * lasilistaRowsScale));
        lengths.forEach((lengthKey) => {
            if (y > pageHeight - scaled(20)) {
                doc.addPage();
                y = scaled(20);
            }
            const count = groupedRows[size][lengthKey];
            const lengthText = Number.isFinite(Number(lengthKey))
                ? String(Number(lengthKey))
                : lengthKey;
            doc.text(`${lengthText} x ${count}`, 28, y);
            y += scaled(9.8);
        });

        y += scaled(3);
    });

    const cleanJob = String(jobNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDate = dateText.replace(/\./g, '-');
    doc.save(`lasilistat_${cleanJob}_${cleanDate}.pdf`);
}

async function downloadLasilistaSummaryPdf(jobNumber) {
    if (!isLasilistaPdfMode || !jobNumber) {
        showToast('Valitse ensin työnumero.', 'warning');
        return;
    }

    const selectedItemNames = Object.keys(selectedLasilistaPdfItems)
        .filter((key) => key.startsWith(`${jobNumber}||`) && selectedLasilistaPdfItems[key])
        .map((key) => key.split('||')[1]);

    if (selectedItemNames.length === 0) {
        showToast('Valitse vähintään yksi ovi tai ikkuna.', 'warning');
        return;
    }

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const jobData = mittatData[jobNumber] || {};
    const selectedColors = Array.from(new Set(
        selectedItemNames
            .map((itemName) => String(jobData[itemName]?.lasilistaColor || '').trim())
            .filter((color) => color !== '')
    ));

    if (selectedColors.length > 1) {
        showToast('Et voi yhdistää eri värisiä lasilistoja samaan Lasilistat PDF -tiedostoon.', 'warning');
        return;
    }

    const groupedRows = collectCombinedLasilistaRows(jobNumber, selectedItemNames);
    const hasRows = Object.values(groupedRows).some((rowsByLength) => Object.keys(rowsByLength).length > 0);
    if (!hasRows) {
        showToast('Valituista tuotteista ei löytynyt lasilistoja.', 'warning');
        return;
    }

    try {
        await generateLasilistaSummaryPdf(jobNumber, groupedRows, selectedColors[0] || '');

        const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
        selectedItemNames.forEach((itemName) => {
            checkedMitat[`${jobNumber}-${itemName}`] = true;
        });
        localStorage.setItem('checkedMitat', JSON.stringify(checkedMitat));
        syncMitatStateToFirestore();

        isLasilistaPdfMode = false;
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
        const mittatView = document.getElementById('mittatView');
        if (mittatView && !mittatView.classList.contains('d-none')) {
            loadMittatView();
        }
        showToast('Lasilistat PDF ladattu. Lasilistat merkitty.', 'success');
    } catch (error) {
        console.error('❌ Lasilistat PDF -luonti epäonnistui:', error);
        showToast('Lasilistat PDF -luonti epäonnistui.', 'error');
    }
}

async function loadImageAsDataUrl(imagePath) {
    const response = await fetch(imagePath);
    if (!response.ok) {
        throw new Error(`Kuvan lataus epäonnistui: ${imagePath}`);
    }

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function generatePackingListPdf(jobNumber, selectedItemNames, packerName, packageNumber) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        throw new Error('jsPDF ei ole saatavilla.');
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateText = formatFinnishDate(new Date());

    const rowLeftX = 24;
    const rowRightX = 188;
    const rowHeight = 16;
    const itemRowFontSize = 22.4; // 20% smaller than previous 28
    const bottomReserve = 55;
    let rowY = 95;

    // Resolve image paths relative to current page so they work on localhost and GitHub Pages.
    const logoPath = new URL('assets/packing-logo.png', window.location.href).toString();
    const qrPath = new URL('assets/packing-qr.png', window.location.href).toString();

    // Shared page header block
    const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.text('PAKKAUSLUETTELO', pageWidth / 2, 30, { align: 'center' });

        const infoFontSize = 16.8; // 30% smaller than previous 24
        doc.setFontSize(infoFontSize);
        doc.text('PAKKAUSPVM:', 22, 58);
        doc.text('PAKKAAJA:', 84, 58);
        doc.text('TYÖNRO:', 145, 58);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(infoFontSize);
        doc.text(dateText, 22, 75);
        doc.text(packerName, 84, 75);
        doc.text(jobNumber, 145, 75);
    };

    drawHeader();

    const sortedItems = [...selectedItemNames].sort((a, b) =>
        a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' })
    );

    const kplPattern = /^(.*?)\s*\(\d+\.\)$/;
    const grouped = [];
    const groupedMap = {};
    sortedItems.forEach((name) => {
        const match = name.match(kplPattern);
        const baseName = match ? match[1].trim() : name;
        if (groupedMap[baseName] !== undefined) {
            grouped[groupedMap[baseName]].count++;
        } else {
            groupedMap[baseName] = grouped.length;
            grouped.push({ name: baseName, count: 1 });
        }
    });

    grouped.forEach(({ name, count }) => {
        if (rowY > pageHeight - bottomReserve) {
            doc.addPage();
            rowY = 30;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(itemRowFontSize);
        doc.text(name.toUpperCase(), rowLeftX, rowY);
        doc.text(`${count} KPL`, rowRightX, rowY, { align: 'right' });
        rowY += rowHeight;
    });

    const logoDataUrl = await loadImageAsDataUrl(logoPath);
    const qrDataUrl = await loadImageAsDataUrl(qrPath);
    const logoWidth = 45;
    const logoHeight = 22;
    const qrSize = 35;
    const imagesY = pageHeight - 40;

    doc.addImage(logoDataUrl, 'PNG', 38, imagesY, logoWidth, logoHeight);
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 38 - qrSize, imagesY - 6, qrSize, qrSize);

    doc.addPage('a4', 'l');
    const labelPageWidth = doc.internal.pageSize.getWidth();
    const labelPageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    const gapMm = 12;
    doc.setFontSize(120);
    const titleDim = doc.getTextDimensions('PAKETTI');
    doc.setFontSize(200);
    const numDim = doc.getTextDimensions(String(packageNumber));
    const titleBaselineY = (labelPageHeight + titleDim.h - gapMm - numDim.h) / 2;
    const numberBaselineY = titleBaselineY + gapMm + numDim.h;

    doc.setFontSize(120);
    doc.text('PAKETTI', labelPageWidth / 2, titleBaselineY, { align: 'center' });
    doc.setFontSize(200);
    doc.text(String(packageNumber), labelPageWidth / 2, numberBaselineY, { align: 'center' });

    const cleanJob = String(jobNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanDate = dateText.replace(/\./g, '-');
    doc.save(`pakkausluettelo_${cleanJob}_${cleanDate}.pdf`);
}

async function downloadPackingList(jobNumber) {
    if (!isPackingListMode || !jobNumber) {
        showToast('Valitse ensin työnumero.', 'warning');
        return;
    }

    const selectedItemNames = Object.keys(selectedPackingItems)
        .filter((key) => key.startsWith(`${jobNumber}||`) && selectedPackingItems[key])
        .map((key) => key.split('||')[1]);

    if (selectedItemNames.length === 0) {
        showToast('Valitse vähintään yksi ovi pakkausluetteloon.', 'warning');
        return;
    }

    const packerNameInput = window.prompt('Anna pakkaajan nimi:');
    if (packerNameInput === null) {
        showToast('Pakkausluettelon luonti peruttu.', 'info');
        return;
    }
    const packerName = packerNameInput.trim();
    if (!packerName) {
        showToast('Anna pakkaajan nimi.', 'warning');
        return;
    }

    try {
        const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
        const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
        const existingPackageNumbers = Object.entries(packedPackageNumbers)
            .filter(([key, value]) => key.startsWith(`${jobNumber}-`) && Number(value) > 0)
            .map(([, value]) => Number(value));
        const nextPackageNumber = existingPackageNumbers.length > 0
            ? Math.max(...existingPackageNumbers) + 1
            : 1;

        await generatePackingListPdf(jobNumber, selectedItemNames, packerName, nextPackageNumber);

        selectedItemNames.forEach((itemName) => {
            const checkKey = `${jobNumber}-${itemName}`;
            packedMitat[checkKey] = true;
            packedPackageNumbers[checkKey] = nextPackageNumber;
        });
        localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
        localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
        const packedTimestamps = JSON.parse(localStorage.getItem('packedTimestamps') || '{}');
        packedTimestamps[`${jobNumber}-${nextPackageNumber}`] = new Date().toISOString();
        localStorage.setItem('packedTimestamps', JSON.stringify(packedTimestamps));
        syncMitatStateToFirestore();
        isPackingListMode = false;
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
        const mittatView = document.getElementById('mittatView');
        const paketitView = document.getElementById('paketitView');
        if (mittatView && !mittatView.classList.contains('d-none')) {
            loadMittatView();
        }
        if (paketitView && !paketitView.classList.contains('d-none')) {
            loadPaketitView();
        }
        showToast('Pakkausluettelo ladattu.', 'success');
    } catch (error) {
        console.error('❌ Pakkausluettelon PDF-luonti epäonnistui:', error);
        showToast('Pakkausluettelon luonti epäonnistui.', 'error');
    }
}

function cloneMitatItem(jobNumber, itemName, btn) {
    const menu = btn.closest('.dropdown-menu');
    const countInput = menu?.querySelector('.clone-count-input');
    const count = Math.max(1, Math.min(99, parseInt(countInput?.value) || 1));

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const source = mittatData[jobNumber]?.[itemName];
    if (!source) {
        showToast('Alkuperäistä mittaa ei löytynyt.', 'warning');
        return;
    }

    const suffixPattern = /^(.*?)\s*\((\d+)\.\)$/;
    const baseMatch = itemName.match(suffixPattern);
    const baseName = baseMatch ? baseMatch[1].trim() : itemName;

    const usedNumbers = new Set();
    Object.keys(mittatData[jobNumber] || {}).forEach(name => {
        const m = name.match(suffixPattern);
        if (m && m[1].trim() === baseName) {
            usedNumbers.add(parseInt(m[2]));
        } else if (name === baseName) {
            usedNumbers.add(1);
        }
    });
    const next = (usedNumbers.size > 0 ? Math.max(...usedNumbers) : 0) + 1;

    for (let i = 0; i < count; i++) {
        const newName = `${baseName} (${next + i}.)`;
        const copy = JSON.parse(JSON.stringify(source));
        copy.timestamp = new Date().toISOString();
        mittatData[jobNumber][newName] = copy;
    }

    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    syncMitatStateToFirestore();

    const dropdownToggle = menu?.previousElementSibling;
    if (dropdownToggle && window.bootstrap?.Dropdown) {
        const instance = bootstrap.Dropdown.getInstance(dropdownToggle);
        if (instance) instance.hide();
    }

    loadMittatView();
    showToast(`Luotu ${count} kpl kopio${count === 1 ? '' : 'ita'}: ${baseName}`, 'success');
}

function renameMitatItem(jobNumber, itemName, btn) {
    const newName = prompt('Anna uusi nimi:', itemName);
    if (!newName || newName.trim() === itemName) return;
    const trimmedName = newName.trim();

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!mittatData[jobNumber]?.[itemName]) {
        showToast('Mittaa ei löydetty.', 'warning');
        return;
    }
    if (mittatData[jobNumber][trimmedName]) {
        showToast(`Nimi "${trimmedName}" on jo käytössä.`, 'warning');
        return;
    }

    mittatData[jobNumber][trimmedName] = mittatData[jobNumber][itemName];
    delete mittatData[jobNumber][itemName];
    localStorage.setItem('mittatData', JSON.stringify(mittatData));

    const oldKey = `${jobNumber}-${itemName}`;
    const newKey = `${jobNumber}-${trimmedName}`;
    ['checkedMitat', 'doneMitat', 'packedMitat', 'packedPackageNumbers', 'hiddenMitatItems'].forEach(storeKey => {
        const obj = JSON.parse(localStorage.getItem(storeKey) || '{}');
        if (oldKey in obj) {
            obj[newKey] = obj[oldKey];
            delete obj[oldKey];
            localStorage.setItem(storeKey, JSON.stringify(obj));
        }
    });

    const notes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    const oldNoteKey = `item-${jobNumber}-${itemName}`;
    const newNoteKey = `item-${jobNumber}-${trimmedName}`;
    if (oldNoteKey in notes) {
        notes[newNoteKey] = notes[oldNoteKey];
        delete notes[oldNoteKey];
        localStorage.setItem('mittatNotes', JSON.stringify(notes));
    }

    syncMitatStateToFirestore();

    const menu = btn.closest('.dropdown-menu');
    const dropdownToggle = menu?.previousElementSibling;
    if (dropdownToggle && window.bootstrap?.Dropdown) {
        const instance = bootstrap.Dropdown.getInstance(dropdownToggle);
        if (instance) instance.hide();
    }

    loadMittatView();
    showToast(`Nimi muutettu: "${trimmedName}"`, 'success');
}

function getCalculatorLabel(type) {
    const labels = {
        'janisol-kayntiovi': 'Janisol Käyntiovi',
        'janisol-pariovi': 'Janisol Pariovi',
        'economy-kayntiovi': 'Economy Käyntiovi',
        'economy-pariovi': 'Economy Pariovi',
        'janisol-ikkuna': 'Janisol Ikkuna',
        'economy-ikkuna': 'Economy Ikkuna',
        'verkko-ovi': 'Verkko-ovi',
        'verkko-seina': 'Verkkoseinä'
    };
    return labels[type] || type || '—';
}

function calculatorLabelWithPanel(type, inputs) {
    const label = getCalculatorLabel(type);
    if (inputs && inputs.pystypaneliEnabled) return `${label} (pystypaneli)`;
    return label;
}

function itemUsesPystypaneli(item, history, singleInputs) {
    if (singleInputs?.pystypaneliEnabled || item?.inputs?.pystypaneliEnabled) return true;
    return Array.isArray(history) && history.some(entry => entry?.pystypaneliEnabled);
}

function buildInputsRows(inputs, isWindow, isPariovi) {
    if (!inputs) return [];
    const isVerkko = isVerkkoCalculatorType(inputs.calculator);
    const rows = [];
    if (!isVerkko) {
        rows.push({ label: 'Kaavasetti', value: inputs.formulaSet === 'default' ? 'Default Kaavat' : (inputs.formulaSet || 'default') });
    }
    if (isVerkko) {
        const isVerkkoSeina = inputs.calculator === 'verkko-seina';
        const paneHeights = inputs.paneHeights || [];
        const paneWidths = inputs.paneWidths || [];
        const paneCount = Math.max(
            Number(inputs.paneCount) || 0,
            paneHeights.length,
            isVerkkoSeina ? paneWidths.length : 0
        ) || 1;
        rows.push({ label: 'Ruutujen määrä', value: String(inputs.paneCount ?? paneCount) });
        if (isVerkkoSeina && paneCount > 1) {
            for (let i = 0; i < paneCount; i++) {
                const w = paneWidths[i] || '—';
                const h = paneHeights[i] || '—';
                rows.push({
                    label: `Ruutu ${i + 1}`,
                    value: `${w} × ${h} mm (L × K)`
                });
            }
        } else {
            rows.push({ label: 'Leveys (mm)', value: inputs.mainDoorWidth || paneWidths[0] || '—' });
            paneHeights.forEach((h, i) => {
                const lbl = paneHeights.length > 1 ? `Ruutu ${i + 1} korkeus (mm)` : 'Ruudun korkeus (mm)';
                rows.push({ label: lbl, value: h || '—' });
            });
        }
        return rows;
    }
    if (!isWindow) {
        const gapText = inputs.gapOption === 'saneeraus'
            ? 'Saneerauskynnys'
            : `${inputs.gapOption} mm rako`;
        rows.push({ label: 'Rako-asetus', value: gapText });
        rows.push({ label: 'Potkupelti', value: inputs.kickPlateEnabled ? 'Päällä' : 'Pois' });
        rows.push({ label: 'Tiivistekynnys', value: inputs.sealThresholdEnabled ? 'Päällä' : 'Pois' });
        rows.push({ label: 'Umpiovi', value: inputs.umpioviEnabled ? 'Päällä' : 'Pois' });
        if (isPariovi) {
            rows.push({ label: 'Umpivasikka', value: inputs.umpivasikkaEnabled ? 'Päällä' : 'Pois' });
        }
        if (inputs.pystypaneliEnabled) {
            rows.push({ label: 'Pystypanelilaskin', value: 'Päällä' });
            rows.push({
                label: 'Panelin peittoväli',
                value: inputs.pystypaneliY ? `${inputs.pystypaneliY} mm` : '—'
            });
        }
    } else {
        rows.push({ label: 'Potkupelti', value: inputs.kickPlateEnabled ? 'Päällä' : 'Pois' });
        rows.push({ label: 'Ruutujen määrä', value: String(inputs.paneCount ?? '—') });
    }
    if (!isWindow) {
        const paneCount = inputs.paneHeights?.length || 0;
        if (paneCount > 1) {
            rows.push({ label: 'Ruutujen määrä', value: String(paneCount) });
        }
        if (isPariovi && inputs.sideDoorWidth) {
            rows.push({ label: 'Lisäoven leveys', value: `${inputs.sideDoorWidth} mm` });
        }
        for (let i = 0; i < paneCount; i++) {
            const w = inputs.mainDoorWidth || '—';
            const h = inputs.paneHeights[i] || '—';
            rows.push({
                label: paneCount > 1 ? `Ruutu ${i + 1}` : 'Ruutu',
                value: `${w} × ${h} mm (L × K)`
            });
        }
        if (inputs.kickPlateEnabled && inputs.kickPlateHeight) {
            rows.push({ label: 'Potkupellin oletuskorkeus', value: `${inputs.kickPlateHeight} mm` });
        }
    } else {
        if (inputs.kickPlateEnabled && inputs.kickPlateHeight) {
            rows.push({ label: 'Potkupellin oletuskorkeus', value: `${inputs.kickPlateHeight} mm` });
        }
        const count = Math.max(inputs.paneHeights?.length || 0, inputs.paneWidths?.length || 0);
        for (let i = 0; i < count; i++) {
            const h = inputs.paneHeights?.[i] || '—';
            const w = inputs.paneWidths?.[i] || (isWindow ? (inputs.mainDoorWidth || '—') : '—');
            rows.push({
                label: count > 1 ? `Ruutu ${i + 1}` : 'Ruutu',
                value: `${w} × ${h} mm (L × K)`
            });
        }
    }
    return rows;
}

function renderInputsRows(rows) {
    return rows.map(r => {
        const safeLabel = String(r.label ?? '').replace(/[<>]/g, '');
        const safeValue = String(r.value ?? '').replace(/[<>]/g, '');
        return `<div class="mitat-inputs-row"><span class="mitat-inputs-label">${safeLabel}</span><span class="mitat-inputs-value">${safeValue}</span></div>`;
    }).join('');
}

// ============================================
// INPUTS EDIT — recalculate & save
// ============================================

function formatResultToData(result, calc, settingsSnap) {
    const data = [];
    if (isVerkkoCalculatorType(calc)) {
        const combined = combineKulmalistat(result.kulmalistat || []);
        if (combined.length > 0) {
            data.push({ title: 'Kulmalistat', items: combined.map(v => ({ label: v, value: '' })) });
        }
        return data;
    }
    const isWindow = calc.includes('ikkuna');
    const isUmpiovi = !isWindow && settingsSnap.umpioviEnabled;
    const panelOn = !!(settingsSnap.pystypaneliEnabled ?? pystypaneliEnabled);
    if (!isUmpiovi && !panelOn) {
        const combined = combineResults(result.lasilista || []);
        if (combined.length > 0)
            data.push({ title: 'Lasilista', items: combined.map(v => ({ label: v, value: '' })) });
    }
    if (!isUmpiovi && settingsSnap.kickPlateEnabled && (result.uretaani || []).length > 0)
        data.push({ title: 'Uretaani', items: result.uretaani.map(v => ({ label: v, value: '' })) });
    if (settingsSnap.kickPlateEnabled && (result.potkupelti || []).length > 0)
        data.push({ title: 'Potkupelti', items: result.potkupelti.map(v => ({ label: v, value: '' })) });
    if (!isWindow && (isUmpiovi || !settingsSnap.sealThresholdEnabled) && (result.harjalista || []).length > 0)
        data.push({ title: 'Harjalista', items: result.harjalista.map(v => ({ label: String(v), value: '' })) });
    if (panelOn) {
        const panelOpts = {
            calculator: calc,
            pystypaneliY: settingsSnap.pystypaneliY,
            umpioviEnabled: settingsSnap.umpioviEnabled,
            kickPlateEnabled: settingsSnap.kickPlateEnabled
        };
        if (settingsSnap.mainDoorWidth != null) {
            panelOpts.mainWidth = parseFloat(settingsSnap.mainDoorWidth) || 0;
            panelOpts.sideWidth = parseFloat(settingsSnap.sideDoorWidth) || 0;
            panelOpts.kickHeight = parseFloat(settingsSnap.kickPlateHeight) || 0;
            panelOpts.paneHeights = settingsSnap.paneHeights;
        }
        const panelSection = buildPystypaneliDataItems(panelOpts);
        if (panelSection) data.push(panelSection);
    }
    return data;
}

function recalculateFromInputs(inputs) {
    const savedSettings = { ...settings };
    const savedFormula = localStorage.getItem('activeFormulaSet');
    const savedPanel = pystypaneliEnabled;
    const savedCalc = currentCalculator;
    try {
        pystypaneliEnabled = !!inputs.pystypaneliEnabled;
        if (inputs.calculator) currentCalculator = inputs.calculator;
        Object.assign(settings, {
            gapOption: inputs.gapOption,
            paneCount: inputs.paneCount || 1,
            kickPlateEnabled: !!inputs.kickPlateEnabled,
            sealThresholdEnabled: !!inputs.sealThresholdEnabled,
            umpioviEnabled: !!inputs.umpioviEnabled,
            umpivasikkaEnabled: !!inputs.umpivasikkaEnabled
        });
        localStorage.setItem('activeFormulaSet', inputs.formulaSet || 'default');
        const c = inputs.calculator || '';
        const w = parseInt(inputs.mainDoorWidth) || 0;
        const s = parseInt(inputs.sideDoorWidth) || 0;
        const k = parseInt(inputs.kickPlateHeight) || 0;
        const ph = (inputs.paneHeights || []).map(v => parseInt(v) || 0);
        const pw = (inputs.paneWidths || []).map(v => parseInt(v) || 0);
        const umpi = settings.umpioviEnabled;
        let result;
        if      (c === 'economy-kayntiovi') result = umpi ? calculateUmpioviResults(w, 0, k, c) : calculateEconomyKayntiovi(w, k, ph);
        else if (c === 'economy-pariovi')   result = umpi ? calculateUmpioviResults(w, s, k, c) : calculateEconomyPariovi(w, s, k, ph);
        else if (c === 'janisol-kayntiovi') result = umpi ? calculateUmpioviResults(w, 0, k, c) : calculateJanisolKayntiovi(w, k, ph);
        else if (c === 'janisol-pariovi')   result = umpi ? calculateUmpioviResults(w, s, k, c) : calculateJanisolPariovi(w, s, k, ph);
        else if (c === 'economy-ikkuna')    result = calculateEconomyIkkuna(pw.length ? pw : [w], ph, k);
        else if (c === 'janisol-ikkuna')    result = calculateJanisolIkkuna(pw.length ? pw : [w], ph, k);
        else if (c === 'verkko-ovi') result = calculateVerkko(w, ph, null, c);
        else if (c === 'verkko-seina') result = calculateVerkko(w, ph, pw.length ? pw : [w], c);
        else result = { lasilista: [], uretaani: [], potkupelti: [], harjalista: [] };
        return formatResultToData(result, c, {
            ...settings,
            pystypaneliEnabled: !!inputs.pystypaneliEnabled,
            pystypaneliY: inputs.pystypaneliY,
            mainDoorWidth: w,
            sideDoorWidth: s,
            kickPlateHeight: k,
            paneHeights: ph
        });
    } finally {
        pystypaneliEnabled = savedPanel;
        currentCalculator = savedCalc;
        Object.assign(settings, savedSettings);
        savedFormula !== null
            ? localStorage.setItem('activeFormulaSet', savedFormula)
            : localStorage.removeItem('activeFormulaSet');
    }
}

function mergeDataArrays(dataArrays) {
    if (!dataArrays || dataArrays.length === 0) return [];
    if (dataArrays.length === 1) return dataArrays[0];
    let merged = JSON.parse(JSON.stringify(dataArrays[0]));
    for (let i = 1; i < dataArrays.length; i++) {
        (dataArrays[i] || []).forEach(section => {
            const isLasil = isLasilistaSectionTitle(section.title);
            const isKulma = isKulmalistatSectionTitle(section.title);
            const existing = merged.find(s =>
                isLasil ? isLasilistaSectionTitle(s.title)
                    : isKulma ? isKulmalistatSectionTitle(s.title)
                    : s.title === section.title
            );
            if (existing && isLasil)
                existing.items = mergeMeasurementItems(existing.items, section.items);
            else if (existing && isKulma)
                existing.items = mergeKulmalistaItems(existing.items, section.items);
            else if (existing)
                existing.items = existing.items.concat(JSON.parse(JSON.stringify(section.items)));
            else
                merged.push(JSON.parse(JSON.stringify(section)));
        });
    }
    return merged;
}

function buildInputsEditForm(inputs, isWindow, isPariovi, entryIdx, jobNumber, itemName, context = 'mitat') {
    if (!inputs) return '<p class="text-muted small">Syötteitä ei saatavilla muokkaukseen.</p>';
    const safeJob = sanitizeForAttribute(jobNumber);
    const safeItem = sanitizeForAttribute(itemName);
    const isVerkko = isVerkkoCalculatorType(inputs.calculator);

    function editRow(label, controlHtml) {
        return `<div class="mitat-inputs-row mitat-inputs-edit-row">
            <span class="mitat-inputs-label">${label}</span>
            <div class="mitat-inputs-edit-control">${controlHtml}</div>
        </div>`;
    }

    let html = `<div class="mitat-inputs-edit-form" data-entry-idx="${entryIdx}">`;

    if (isVerkko) {
        const isVerkkoSeina = inputs.calculator === 'verkko-seina';
        const paneHeights = inputs.paneHeights || [];
        const paneWidths = inputs.paneWidths || [];
        const paneCount = Math.max(
            Number(inputs.paneCount) || 0,
            paneHeights.length,
            isVerkkoSeina ? paneWidths.length : 0
        ) || 1;
        html += editRow('Ruutujen määrä', `<span class="mitat-inputs-value">${inputs.paneCount || paneCount}</span>`);
        if (isVerkkoSeina && paneCount > 1) {
            for (let i = 0; i < paneCount; i++) {
                const w = paneWidths[i] || '';
                const h = paneHeights[i] || '';
                html += editRow(`Ruutu ${i + 1} (L × K, mm)`,
                    `<span class="d-flex align-items-center gap-1">
                        <input type="number" name="paneWidth_${i}" class="form-control form-control-sm" value="${w}" min="100" style="width:78px">
                        <span class="text-muted">×</span>
                        <input type="number" name="paneHeight_${i}" class="form-control form-control-sm" value="${h}" min="100" style="width:78px">
                    </span>`
                );
            }
        } else {
            const widthMin = isVerkkoSeina ? '100' : '500';
            html += editRow('Leveys (mm)', `<input type="number" name="mainDoorWidth" class="form-control form-control-sm" value="${inputs.mainDoorWidth || paneWidths[0] || ''}" min="${widthMin}" style="width:90px">`);
            paneHeights.forEach((h, i) => {
                const lbl = paneHeights.length > 1 ? `Ruutu ${i + 1} korkeus (mm)` : 'Ruudun korkeus (mm)';
                html += editRow(lbl, `<input type="number" name="paneHeight_${i}" class="form-control form-control-sm" value="${h || ''}" min="100" style="width:90px">`);
            });
        }
    } else {
        const formulaSets = JSON.parse(localStorage.getItem('formulaSets') || '{}');
        let formulaOptions = `<option value="default"${!inputs.formulaSet || inputs.formulaSet === 'default' ? ' selected' : ''}>Default Kaavat</option>`;
        Object.keys(formulaSets).forEach(key => {
            formulaOptions += `<option value="${key}"${inputs.formulaSet === key ? ' selected' : ''}>${key}</option>`;
        });

        html += editRow('Kaavasetti', `<select name="formulaSet" class="form-select form-select-sm" style="width:auto">${formulaOptions}</select>`);

        if (!isWindow) {
            const gapVal = String(inputs.gapOption);
            const gapOpts = [
                ['8', '8 mm rako'], ['10', '10 mm rako'], ['15', '15 mm rako'], ['saneeraus', 'Saneerauskynnys']
            ].map(([v, l]) => `<option value="${v}"${gapVal === v ? ' selected' : ''}>${l}</option>`).join('');
            html += editRow('Rako-asetus', `<select name="gapOption" class="form-select form-select-sm" style="width:auto">${gapOpts}</select>`);
        }

        html += editRow('Potkupelti', `<input type="checkbox" name="kickPlateEnabled" class="form-check-input"${inputs.kickPlateEnabled ? ' checked' : ''}>`);
        html += editRow('Potkupellin korkeus (mm)', `<input type="number" name="kickPlateHeight" class="form-control form-control-sm" value="${inputs.kickPlateHeight || ''}" min="100" style="width:90px">`);

        if (!isWindow) {
            html += editRow('Tiivistekynnys', `<input type="checkbox" name="sealThresholdEnabled" class="form-check-input"${inputs.sealThresholdEnabled ? ' checked' : ''}>`);
            html += editRow('Umpiovi', `<input type="checkbox" name="umpioviEnabled" class="form-check-input"${inputs.umpioviEnabled ? ' checked' : ''}>`);
            if (isPariovi) {
                html += editRow('Umpivasikka', `<input type="checkbox" name="umpivasikkaEnabled" class="form-check-input"${inputs.umpivasikkaEnabled ? ' checked' : ''}>`);
            }
            if (inputs.pystypaneliEnabled) {
                html += editRow('Pystypanelilaskin', `<span class="mitat-inputs-value">Päällä</span>`);
                html += editRow('Panelin peittoväli (mm)', `<input type="number" name="pystypaneliY" class="form-control form-control-sm" value="${inputs.pystypaneliY || ''}" min="1" step="any" style="width:90px">`);
            }
            const widthLabel = isPariovi ? 'Käyntioven leveys (mm)' : 'Oven leveys (mm)';
            html += editRow(widthLabel, `<input type="number" name="mainDoorWidth" class="form-control form-control-sm" value="${inputs.mainDoorWidth || ''}" min="500" style="width:90px">`);
            if (isPariovi) {
                html += editRow('Lisäoven leveys (mm)', `<input type="number" name="sideDoorWidth" class="form-control form-control-sm" value="${inputs.sideDoorWidth || ''}" min="100" style="width:90px">`);
            }
            const paneHeights = inputs.paneHeights || [];
            paneHeights.forEach((h, i) => {
                const lbl = paneHeights.length > 1 ? `Ruutu ${i + 1} korkeus (mm)` : 'Ruudun korkeus (mm)';
                html += editRow(lbl, `<input type="number" name="paneHeight_${i}" class="form-control form-control-sm" value="${h || ''}" min="100" style="width:90px">`);
            });
        } else {
            const paneCount = inputs.paneCount || 1;
            html += editRow('Ruutujen määrä', `<span class="mitat-inputs-value">${paneCount}</span>`);
            for (let i = 0; i < paneCount; i++) {
                const w = (inputs.paneWidths || [])[i] || inputs.mainDoorWidth || '';
                const h = (inputs.paneHeights || [])[i] || '';
                const lbl = paneCount > 1 ? `Ruutu ${i + 1} (L × K, mm)` : 'Ruutu (L × K, mm)';
                html += editRow(lbl,
                    `<span class="d-flex align-items-center gap-1">
                        <input type="number" name="paneWidth_${i}" class="form-control form-control-sm" value="${w}" min="100" style="width:78px">
                        <span class="text-muted">×</span>
                        <input type="number" name="paneHeight_${i}" class="form-control form-control-sm" value="${h}" min="100" style="width:78px">
                    </span>`
                );
            }
        }
    }

    const saveCtx = context === 'paketit' ? `,'paketit'` : '';
    const cancelOnclick = context === 'paketit'
        ? `showPaketitItemDetails('${safeJob}','${safeItem}',null)`
        : `showMitatItemInputs('${safeJob}','${safeItem}')`;
    html += `<div class="d-flex gap-2 mt-3">
        <button class="btn btn-sm btn-primary" onclick="saveEditedMitatInputs('${safeJob}','${safeItem}',${entryIdx},this.closest('.mitat-inputs-edit-form')${saveCtx})">Tallenna ja laske</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="${cancelOnclick}">Peruuta</button>
    </div>`;
    html += `</div>`;
    return html;
}

function collectInputsFromEditForm(formEl, baseInputs) {
    const get = n => formEl.querySelector(`[name="${n}"]`);
    const val = n => { const el = get(n); return el ? el.value : undefined; };
    const chk = n => { const el = get(n); return el ? el.checked : undefined; };
    const upd = (obj, key, v) => { if (v !== undefined) obj[key] = v; };

    const inp = { ...baseInputs };
    upd(inp, 'formulaSet', val('formulaSet'));
    const gapRaw = val('gapOption');
    if (gapRaw !== undefined) inp.gapOption = isNaN(parseInt(gapRaw)) ? gapRaw : parseInt(gapRaw);
    upd(inp, 'kickPlateEnabled', chk('kickPlateEnabled'));
    upd(inp, 'kickPlateHeight', val('kickPlateHeight'));
    upd(inp, 'sealThresholdEnabled', chk('sealThresholdEnabled'));
    upd(inp, 'umpioviEnabled', chk('umpioviEnabled'));
    upd(inp, 'umpivasikkaEnabled', chk('umpivasikkaEnabled'));
    upd(inp, 'mainDoorWidth', val('mainDoorWidth'));
    upd(inp, 'sideDoorWidth', val('sideDoorWidth'));
    upd(inp, 'pystypaneliY', val('pystypaneliY'));

    const newHeights = [], newWidths = [];
    for (let i = 0; get(`paneHeight_${i}`) !== null; i++) {
        newHeights.push(get(`paneHeight_${i}`).value);
        const wEl = get(`paneWidth_${i}`);
        if (wEl) newWidths.push(wEl.value);
    }
    if (newHeights.length > 0) inp.paneHeights = newHeights;
    if (newWidths.length > 0) inp.paneWidths = newWidths;

    return inp;
}

function saveEditedMitatInputs(jobNumber, itemName, entryIdx, formEl, context = 'mitat') {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const item = mittatData[jobNumber]?.[itemName];
    if (!item) { showToast('Mittaa ei löytynyt.', 'warning'); return; }

    const hasHistory = item.inputsHistory && item.inputsHistory.length > 0;
    const baseInputs = hasHistory
        ? (item.inputsHistory[entryIdx] || item.inputsHistory[0])
        : (item.inputs || {});
    const newInputs = collectInputsFromEditForm(formEl, baseInputs);

    if (hasHistory) {
        item.inputsHistory[entryIdx] = newInputs;
    } else {
        item.inputs = newInputs;
    }

    const entries = (item.inputsHistory && item.inputsHistory.length > 0)
        ? item.inputsHistory
        : [item.inputs];
    const allData = entries.map(e => {
        if (!e || !e.calculator) return null;
        try { return recalculateFromInputs(e); } catch (err) {
            console.error('Laskenta epäonnistui siirrolle:', e?.calculator, err);
            return null;
        }
    }).filter(Boolean);

    const calcOk = allData.length > 0;
    if (calcOk) item.data = mergeDataArrays(allData);

    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    syncMitatStateToFirestore();
    syncMitatInputsToFirestore();

    if (calcOk) {
        showToast('Syötteet päivitetty ja tulokset laskettu uudelleen.', 'success');
    } else {
        showToast('Syötteet tallennettu, mutta laskenta epäonnistui — tarkista syötteet.', 'warning');
    }

    if (context === 'paketit') {
        showPaketitItemDetails(jobNumber, itemName, null);
    } else {
        loadMittatView();
        showMitatItemInputs(jobNumber, itemName);
    }
}

function buildLasilistaMetaEditForm(item, jobNumber, itemName, context = 'mitat') {
    const safeJob = sanitizeForAttribute(jobNumber);
    const safeItem = sanitizeForAttribute(itemName);
    const currentSize = String(item?.lasilistaSize || '').trim();
    const sizeVal = currentSize || 'ei-lasilistaa';
    const colorVal = String(item?.lasilistaColor || '').replace(/"/g, '&quot;');
    const sizeOpts = [
        ['ei-lasilistaa', 'Ei lasilistaa'],
        ['12x20', '12x20'], ['15x20', '15x20'], ['20x20', '20x20'],
        ['25x20', '25x20'], ['30x20', '30x20'], ['35x20', '35x20'], ['40x20', '40x20']
    ].map(([v, l]) => `<option value="${v}"${sizeVal === v ? ' selected' : ''}>${l}</option>`).join('');

    const editRow = (label, controlHtml) =>
        `<div class="mitat-inputs-row mitat-inputs-edit-row">
            <span class="mitat-inputs-label">${label}</span>
            <div class="mitat-inputs-edit-control">${controlHtml}</div>
        </div>`;

    const saveCtx = context === 'paketit' ? `,'paketit'` : '';
    const cancelOnclick = context === 'paketit'
        ? `showPaketitItemDetails('${safeJob}','${safeItem}',null)`
        : `showMitatItemInputs('${safeJob}','${safeItem}')`;

    let html = `<div class="mitat-inputs-edit-form" data-meta-edit="1">`;
    html += editRow('Lasilistan koko',
        `<select name="lasilistaSize" class="form-select form-select-sm" style="width:auto">${sizeOpts}</select>`);
    html += editRow('Lasilistan väri',
        `<input type="text" name="lasilistaColor" class="form-control form-control-sm" value="${colorVal}" placeholder="esim. RAL 7024" style="width:140px">`);
    html += `<div class="d-flex gap-2 mt-3">
        <button class="btn btn-sm btn-primary" onclick="saveEditedMitatLasilistaMeta('${safeJob}','${safeItem}',this.closest('.mitat-inputs-edit-form')${saveCtx})">Tallenna</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="${cancelOnclick}">Peruuta</button>
    </div>`;
    html += `</div>`;
    return html;
}

function saveEditedMitatLasilistaMeta(jobNumber, itemName, formEl, context = 'mitat') {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const item = mittatData[jobNumber]?.[itemName];
    if (!item) { showToast('Mittaa ei löytynyt.', 'warning'); return; }

    const rawSize = formEl?.querySelector('[name="lasilistaSize"]')?.value || '';
    const rawColor = formEl?.querySelector('[name="lasilistaColor"]')?.value || '';
    item.lasilistaSize = rawSize === 'ei-lasilistaa' ? '' : rawSize;
    item.lasilistaColor = normalizeLasilistaColor(rawColor);

    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    syncMitatStateToFirestore();
    syncMitatInputsToFirestore();

    if (context === 'paketit') {
        loadPaketitView();
        showToast('Lasilistan tiedot päivitetty.', 'success');
        showPaketitItemDetails(jobNumber, itemName, null);
    } else {
        loadMittatView();
        showToast('Lasilistan tiedot päivitetty.', 'success');
        showMitatItemInputs(jobNumber, itemName);
    }
}

function showMitatItemInputs(jobNumber, itemName, editEntryIdx = -1, editMeta = false) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const item = mittatData[jobNumber] && mittatData[jobNumber][itemName];
    if (!item) {
        showToast('Mittaa ei löytynyt.', 'warning');
        return;
    }

    const fallbackEntry = (() => {
        const map = JSON.parse(localStorage.getItem('mitatInputs') || '{}');
        return map[jobNumber]?.[itemName] || {};
    })();
    const inputsHistory = item.inputsHistory || fallbackEntry.inputsHistory || null;
    const singleInputs = item.inputs || fallbackEntry.inputs || null;
    const calcLabel = itemUsesPystypaneli(item, inputsHistory, singleInputs)
        ? `${getCalculatorLabel(item.calculator)} (pystypaneli)`
        : getCalculatorLabel(item.calculator);
    const date = item.timestamp ? new Date(item.timestamp).toLocaleString('fi-FI') : '—';
    const safeJob = sanitizeForAttribute(jobNumber);
    const safeItem = sanitizeForAttribute(itemName);

    let html = `<div class="mitat-inputs-list">`;

    // Top-level item info (always shown)
    const headerRows = [
        { label: 'Laskin', value: calcLabel },
        { label: 'Siirretty', value: date }
    ];
    if (editMeta) {
        html += renderInputsRows(headerRows);
        html += buildLasilistaMetaEditForm(item, jobNumber, itemName, 'mitat');
    } else {
        if (item.lasilistaSize) {
            headerRows.push({ label: 'Lasilistan koko', value: item.lasilistaSize });
        } else if (item.lasilistaSize === '' && !item.metadataOnly) {
            headerRows.push({ label: 'Lasilistan koko', value: 'Ei lasilistaa' });
        }
        if (item.lasilistaColor) {
            headerRows.push({ label: 'Lasilistan väri', value: item.lasilistaColor });
        }
        html += renderInputsRows(headerRows);
        html += `<div class="mt-2 mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="showMitatItemInputs('${safeJob}','${safeItem}',-1,true)">Muokkaa lasilistaa</button></div>`;
    }

    if (inputsHistory && inputsHistory.length > 1) {
        // Multi-transfer: show each set of inputs as a separate block
        inputsHistory.forEach((entry, idx) => {
            const entryDate = entry._mergedAt ? new Date(entry._mergedAt).toLocaleString('fi-FI') : '—';
            const entryCalcLabel = calculatorLabelWithPanel(entry.calculator || item.calculator, entry);
            const entryCalc = entry.calculator || '';
            const entryIsWindow = entryCalc.includes('ikkuna');
            const entryIsPariovi = entryCalc.includes('pariovi');
            const editBtn = editEntryIdx !== idx
                ? `<button class="btn btn-sm mitat-edit-btn btn-outline-secondary" onclick="showMitatItemInputs('${safeJob}','${safeItem}',${idx})">Muokkaa</button>`
                : '';
            html += `<div class="mitat-inputs-section-header d-flex justify-content-between align-items-center">
                <span>Siirto ${idx + 1} — ${entryCalcLabel} — ${entryDate}</span>${editBtn}
            </div>`;
            if (editEntryIdx === idx) {
                html += buildInputsEditForm(entry, entryIsWindow, entryIsPariovi, idx, jobNumber, itemName);
            } else {
                html += renderInputsRows(buildInputsRows(entry, entryIsWindow, entryIsPariovi));
            }
        });
    } else {
        // Single transfer
        const inputs = (inputsHistory && inputsHistory.length === 1) ? inputsHistory[0] : singleInputs;
        const inputsCalc = (inputs && inputs.calculator) || (item.calculator || '');
        const inputsIsWindow = inputsCalc.includes('ikkuna');
        const inputsIsPariovi = inputsCalc.includes('pariovi');
        if (editEntryIdx === 0 && inputs) {
            html += buildInputsEditForm(inputs, inputsIsWindow, inputsIsPariovi, 0, jobNumber, itemName);
        } else {
            html += renderInputsRows(buildInputsRows(inputs, inputsIsWindow, inputsIsPariovi));
            if (!inputs) {
                html += `<div class="mitat-inputs-note text-muted small mt-2">Alkuperäisiä syötteitä ei ole tallennettu tälle mitalle. Näytetään vain saatavilla olevat tiedot.</div>`;
            } else {
                html += `<div class="mt-3"><button class="btn btn-sm btn-outline-secondary" onclick="showMitatItemInputs('${safeJob}','${safeItem}',0)">Muokkaa syötteitä</button></div>`;
            }
        }
    }

    html += `</div>`;

    const modalEl = document.getElementById('mitatInputsModal');
    document.getElementById('mitatInputsTitle').textContent = `${jobNumber} — ${itemName}`;
    document.getElementById('mitatInputsBody').innerHTML = html;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

// Open notes modal
function openMittatNote(type, jobNumber, itemName, buttonElement = null) {
    currentNoteType = type;
    currentNoteJobNumber = jobNumber;
    currentNoteItemName = itemName;
    currentNoteButtonElement = buttonElement;
    
    // Load existing note
    const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    let noteKey;
    let title;
    
    if (type === 'job') {
        noteKey = `job-${jobNumber}`;
        title = `📝 Muistiinpano: Työ ${jobNumber}`;
    } else {
        noteKey = `item-${jobNumber}-${itemName}`;
        title = `📝 Muistiinpano: ${itemName} (Työ ${jobNumber})`;
    }
    
    const existingNote = mittatNotes[noteKey] || '';
    
    // Set modal content
    document.getElementById('mittatNotesTitle').textContent = title;
    document.getElementById('mittatNotesText').value = existingNote;
    
    // Open modal
    const modal = new bootstrap.Modal(document.getElementById('mittatNotesModal'));
    modal.show();
}

// Save note
function saveMittatNote() {
    const noteText = document.getElementById('mittatNotesText').value;
    
    // Get notes from localStorage
    const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    
    // Build note key
    let noteKey;
    if (currentNoteType === 'job') {
        noteKey = `job-${currentNoteJobNumber}`;
    } else {
        noteKey = `item-${currentNoteJobNumber}-${currentNoteItemName}`;
    }
    
    // Save or delete note
    if (noteText.trim() === '') {
        delete mittatNotes[noteKey];
    } else {
        mittatNotes[noteKey] = noteText;
    }
    
    localStorage.setItem('mittatNotes', JSON.stringify(mittatNotes));
    syncMitatStateToFirestore();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('mittatNotesModal'));
    modal.hide();
    
    // Update note button UI in-place so open panels don't collapse
    if (currentNoteButtonElement) {
        const hasNote = noteText.trim() !== '';
        currentNoteButtonElement.classList.remove('btn-note-empty', 'btn-note-active');
        currentNoteButtonElement.classList.add(hasNote ? 'btn-note-active' : 'btn-note-empty');
    }
    
    showToast('Muistiinpano tallennettu', 'success');
}

// Toggle job details visibility
function toggleJobDetails(jobId) {
    const jobItemsElement = document.getElementById(jobId);
    const iconElement = document.getElementById(`${jobId}-icon`);
    const headerElement = jobItemsElement ? jobItemsElement.previousElementSibling : null;

    const isOpening = jobItemsElement.style.display === 'none';
    jobItemsElement.style.display = isOpening ? 'block' : 'none';
    if (iconElement) {
        iconElement.textContent = isOpening ? '▲' : '▼';
        iconElement.classList.toggle('rotated', isOpening);
    }
    if (headerElement && headerElement.classList.contains('mitat-job-header')) {
        headerElement.setAttribute('aria-expanded', String(isOpening));
    }
}

// Toggle mitta checkbox (lasilistat)
function toggleMittatCheck(checkKey, checkboxElement) {
    // Update localStorage
    const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
    const isChecked = !checkedMitat[checkKey];
    checkedMitat[checkKey] = isChecked;
    localStorage.setItem('checkedMitat', JSON.stringify(checkedMitat));
    syncMitatStateToFirestore();
    
    // Update checkbox UI in-place so open panels don't collapse
    if (checkboxElement) {
        if (isChecked) {
            checkboxElement.classList.add('checked');
            checkboxElement.textContent = '✓';
        } else {
            checkboxElement.classList.remove('checked');
            checkboxElement.textContent = '';
        }
        checkboxElement.setAttribute('aria-checked', String(isChecked));
    }
}

function updateJobDoneCounter(jobNumber) {
    const jobId = `job-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const wrapperElement = document.getElementById(`${jobId}-done-counter`);
    const fillElement = document.getElementById(`${jobId}-progress-fill`);
    const textElement = document.getElementById(`${jobId}-progress-text`);
    if (!wrapperElement || !fillElement || !textElement) return;

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const itemNames = Object.keys(mittatData[jobNumber] || {});
    const totalCount = itemNames.length;
    const doneCount = itemNames.filter((itemName) => doneMitat[`${jobNumber}-${itemName}`]).length;
    const circumference = 2 * Math.PI * 15.5;
    const percent = totalCount > 0 ? doneCount / totalCount : 0;
    const offset = circumference * (1 - percent);

    fillElement.style.strokeDashoffset = offset.toFixed(2);
    textElement.textContent = `${doneCount}/${totalCount}`;
    wrapperElement.title = `${doneCount}/${totalCount} tehty`;
}

// Toggle mitta checkbox (tehty)
function toggleMittatDone(checkKey, jobNumber, checkboxElement) {
    const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
    const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
    const isDone = !doneMitat[checkKey];
    const itemName = checkKey.startsWith(`${jobNumber}-`) ? checkKey.slice(jobNumber.length + 1) : '';
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const item = mittatData[jobNumber]?.[itemName];
    if (isDone && itemHasLasilistat(item) && !checkedMitat[checkKey]) {
        showToast('Merkitse ensin lasilistat ennen tehty-merkintää.', 'warning');
        return;
    }
    if (isDone) {
        doneMitat[checkKey] = true;
    } else {
        delete doneMitat[checkKey];
        // If item is no longer "done", remove packed marker as well.
        delete packedMitat[checkKey];
        delete packedPackageNumbers[checkKey];
        delete hiddenMitatItems[checkKey];
    }
    localStorage.setItem('doneMitat', JSON.stringify(doneMitat));
    localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
    localStorage.setItem('hiddenMitatItems', JSON.stringify(hiddenMitatItems));
    syncMitatStateToFirestore();

    // Update checkbox UI in-place so open panels don't collapse
    if (checkboxElement) {
        if (isDone) {
            checkboxElement.classList.add('checked');
            checkboxElement.textContent = '✓';
        } else {
            checkboxElement.classList.remove('checked');
            checkboxElement.textContent = '';
        }
        checkboxElement.setAttribute('aria-checked', String(isDone));
    }

    updateJobDoneCounter(jobNumber);
    loadMittatView();
}

// Toggle mitta details visibility
function toggleMitatDetails(detailsId) {
    const detailsElement = document.getElementById(detailsId);
    const iconElement = document.getElementById(`${detailsId}-icon`);
    // Header drives aria-expanded; locate it via aria-controls="<detailsId>".
    const headerElement = document.querySelector(`[aria-controls="${detailsId}"]`);

    const isOpening = detailsElement.style.display === 'none';
    detailsElement.style.display = isOpening ? 'block' : 'none';
    if (iconElement) {
        iconElement.textContent = isOpening ? '▲' : '▼';
        iconElement.classList.toggle('rotated', isOpening);
    }
    if (headerElement) {
        headerElement.setAttribute('aria-expanded', String(isOpening));
    }
}

// Delete all named mitat under a job number
function deleteJobMitat(jobNumber) {
    if (!isAdmin) {
        showToast('Vain admin voi poistaa mittoja.', 'warning');
        return;
    }

    if (!confirm(`Haluatko varmasti poistaa koko työn: ${jobNumber}?`)) {
        return;
    }
    
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!mittatData[jobNumber]) {
        return;
    }

    // Remove checkbox states and item notes for all items in job
    const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
    const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
    const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    const itemNames = Object.keys(mittatData[jobNumber]);
    
    itemNames.forEach(itemName => {
        const checkKey = `${jobNumber}-${itemName}`;
        delete checkedMitat[checkKey];
        delete doneMitat[checkKey];
        delete packedMitat[checkKey];
        delete packedPackageNumbers[checkKey];
        delete hiddenMitatItems[checkKey];
        delete mittatNotes[`item-${jobNumber}-${itemName}`];
    });
    
    // Remove job note and job data
    delete mittatNotes[`job-${jobNumber}`];
    delete mittatData[jobNumber];

    // Remove packedTimestamps for this job (keys: jobNumber-packageNumber)
    const packedTimestamps = JSON.parse(localStorage.getItem('packedTimestamps') || '{}');
    Object.keys(packedTimestamps).forEach(key => {
        if (key.startsWith(`${jobNumber}-`)) delete packedTimestamps[key];
    });
    localStorage.setItem('packedTimestamps', JSON.stringify(packedTimestamps));

    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    localStorage.setItem('checkedMitat', JSON.stringify(checkedMitat));
    localStorage.setItem('doneMitat', JSON.stringify(doneMitat));
    localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
    localStorage.setItem('hiddenMitatItems', JSON.stringify(hiddenMitatItems));
    localStorage.setItem('mittatNotes', JSON.stringify(mittatNotes));
    syncMitatStateToFirestore();

    if (selectedPackingJobNumber === jobNumber) {
        selectedPackingJobNumber = null;
        selectedPackingItems = {};
    } else {
        Object.keys(selectedPackingItems).forEach((key) => {
            if (key.startsWith(`${jobNumber}||`)) {
                delete selectedPackingItems[key];
            }
        });
    }
    if (selectedLasilistaPdfJobNumber === jobNumber) {
        selectedLasilistaPdfJobNumber = null;
        selectedLasilistaPdfItems = {};
    } else {
        Object.keys(selectedLasilistaPdfItems).forEach((key) => {
            if (key.startsWith(`${jobNumber}||`)) {
                delete selectedLasilistaPdfItems[key];
            }
        });
    }
    
    loadMittatView();
    showToast(`Työ ${jobNumber} poistettu`, 'info');
}

// Delete a single mitta
function deleteMitta(jobNumber, itemName) {
    if (!isAdmin) {
        showToast('Vain admin voi poistaa mittoja.', 'warning');
        return;
    }

    if (!confirm(`Haluatko varmasti poistaa: ${jobNumber} - ${itemName}?`)) {
        return;
    }
    
    let mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    
    if (mittatData[jobNumber] && mittatData[jobNumber][itemName]) {
        delete mittatData[jobNumber][itemName];
        
        // If job has no items left, delete job
        if (Object.keys(mittatData[jobNumber]).length === 0) {
            delete mittatData[jobNumber];
            // Remove packedTimestamps for this job (keys: jobNumber-packageNumber)
            const packedTimestamps = JSON.parse(localStorage.getItem('packedTimestamps') || '{}');
            Object.keys(packedTimestamps).forEach(key => {
                if (key.startsWith(`${jobNumber}-`)) delete packedTimestamps[key];
            });
            localStorage.setItem('packedTimestamps', JSON.stringify(packedTimestamps));
        }
        
        localStorage.setItem('mittatData', JSON.stringify(mittatData));
        
        // Also remove checkbox state
        const checkKey = `${jobNumber}-${itemName}`;
        const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
        if (checkedMitat[checkKey]) {
            delete checkedMitat[checkKey];
            localStorage.setItem('checkedMitat', JSON.stringify(checkedMitat));
        }

        const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
        if (Object.prototype.hasOwnProperty.call(doneMitat, checkKey)) {
            delete doneMitat[checkKey];
            localStorage.setItem('doneMitat', JSON.stringify(doneMitat));
        }

        const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
        if (Object.prototype.hasOwnProperty.call(packedMitat, checkKey)) {
            delete packedMitat[checkKey];
            localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
        }

        const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
        if (Object.prototype.hasOwnProperty.call(packedPackageNumbers, checkKey)) {
            delete packedPackageNumbers[checkKey];
            localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
        }

        const hiddenMitatItems = JSON.parse(localStorage.getItem('hiddenMitatItems') || '{}');
        if (Object.prototype.hasOwnProperty.call(hiddenMitatItems, checkKey)) {
            delete hiddenMitatItems[checkKey];
            localStorage.setItem('hiddenMitatItems', JSON.stringify(hiddenMitatItems));
        }

        const packingKey = `${jobNumber}||${itemName}`;
        if (selectedPackingItems[packingKey]) {
            delete selectedPackingItems[packingKey];
        }
        const lasilistaPdfKey = `${jobNumber}||${itemName}`;
        if (selectedLasilistaPdfItems[lasilistaPdfKey]) {
            delete selectedLasilistaPdfItems[lasilistaPdfKey];
        }
        
        // Also remove notes
        const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
        const itemNoteKey = `item-${jobNumber}-${itemName}`;
        if (mittatNotes[itemNoteKey]) {
            delete mittatNotes[itemNoteKey];
            localStorage.setItem('mittatNotes', JSON.stringify(mittatNotes));
        }
        
        // If job is being deleted, remove job note too
        if (Object.keys(mittatData[jobNumber] || {}).length === 0) {
            const jobNoteKey = `job-${jobNumber}`;
            if (mittatNotes[jobNoteKey]) {
                delete mittatNotes[jobNoteKey];
                localStorage.setItem('mittatNotes', JSON.stringify(mittatNotes));
            }
            if (selectedPackingJobNumber === jobNumber) {
                selectedPackingJobNumber = null;
                selectedPackingItems = {};
            }
            if (selectedLasilistaPdfJobNumber === jobNumber) {
                selectedLasilistaPdfJobNumber = null;
                selectedLasilistaPdfItems = {};
            }
        }

        syncMitatStateToFirestore();
        
        loadMittatView();
        showToast('Mitat poistettu', 'info');
    }
}

/* ===========================================================================
   PDF-SKANNERI
   Lukee oven/ikkunan piirustuksen PDF:stä laskin- ja tuotantokentät.
   - Renderöinti: pdf.js. Jos PDF:ssä on valittava tekstikerros, käytetään sitä;
     muuten ajetaan Tesseract.js-OCR (vaaka + 2 pystysuuntaa kierrettyä passia).
   - Tulkinta on sääntö-/avainsanapohjainen ja sietää pientä asettelun vaihtelua.
   - Tulokset näytetään aina muokattavassa esikatselussa ennen hyväksyntää.
   =========================================================================== */

let scannerEnabled = false;
let pystypaneliEnabled = false;
let verkkoEnabled = false;
let scanBatchFiles = [];
let scanBatchIndex = 0;
let scanBatchJobNumber = null;
let scanBatchActive = false;
let scanTransferQueue = [];
let scanTransferQueueOpen = false;
let scanQueueIdSeq = 1;

function disableVerkkoModeUi() {
    verkkoEnabled = false;
    localStorage.setItem('verkkoEnabled', 'false');
    const verkkoToggle = document.getElementById('verkkoToggle');
    if (verkkoToggle) verkkoToggle.checked = false;
    updateCalculatorButtonVisibility();
    if (isVerkkoCalculatorType()) {
        currentCalculator = 'janisol-pariovi';
        document.querySelectorAll('.btn-group .btn-outline-primary').forEach(btn => btn.classList.remove('active'));
        const btn = document.getElementById('btn-janisol-pariovi');
        if (btn) btn.classList.add('active');
    }
}

function toggleScanner(enabled) {
    scannerEnabled = !!enabled;
    localStorage.setItem('scannerEnabled', scannerEnabled);

    if (scannerEnabled && pystypaneliEnabled) {
        pystypaneliEnabled = false;
        localStorage.setItem('pystypaneliEnabled', 'false');
        const pystypaneliToggle = document.getElementById('pystypaneliToggle');
        if (pystypaneliToggle) pystypaneliToggle.checked = false;
    }

    if (scannerEnabled && verkkoEnabled) {
        disableVerkkoModeUi();
    }

    const panel = document.getElementById('scannerPanel');
    const inputsRow = document.getElementById('calculatorInputsRow');
    const toggle = document.getElementById('scannerToggle');
    if (panel) panel.style.display = scannerEnabled ? '' : 'none';
    if (inputsRow) inputsRow.style.display = scannerEnabled ? 'none' : '';
    if (toggle) toggle.checked = scannerEnabled;
    updateCalculatorButtonVisibility();

    if (scannerEnabled) {
        hideScannerSettings();
    } else {
        SCANNER_HIDDEN_SETTINGS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        updateCalculatorInputVisibility();
    }

    const resultsDiv = document.getElementById('results');
    if (enabled) {
        if (resultsDiv) {
            resultsDiv.innerHTML = '<p class="text-muted text-center">Lataa piirustus PDF-skannerilla nähdäksesi tulokset.</p>';
        }
        scanner_resetPanel();
    } else {
        calculate();
    }
}

function applyKickHeightOuterWidthAdjust(width, kickHeight) {
    return kickHeight > 310 ? width - 5 : width;
}

function calcPystypaneliStartEnd(X, Y, alotus = -5) {
    const Z = X % Y;
    const W = (Y + Z) / 2;
    return W + alotus;
}

function getPystypaneliOuterWidths(opts) {
    const calcType = opts?.calculator || currentCalculator;
    const mainWidth = opts?.mainWidth != null
        ? Number(opts.mainWidth) || 0
        : (parseFloat(document.getElementById('mainDoorWidth')?.value) || 0);
    const sideWidth = opts?.sideWidth != null
        ? Number(opts.sideWidth) || 0
        : (parseFloat(document.getElementById('sideDoorWidth')?.value) || 0);
    const kickHeight = opts?.kickHeight != null
        ? Number(opts.kickHeight) || 0
        : (parseFloat(document.getElementById('kickPlateHeight')?.value) || 0);
    const formulas = getPanelAwareFormulas();
    const isPariovi = calcType && calcType.includes('pariovi');
    const isUmpiovi = isDoorCalculatorType(calcType) && settings.umpioviEnabled === true;
    const isJanisol = calcType && calcType.startsWith('janisol');
    const items = [];

    if (isUmpiovi) {
        const fs = getUmpioviFormulaSet(calcType, formulas);
        const fallbackOuter = isJanisol ? 165 : 160;
        const mainAdj = fs?.umpiovi_potku_ulko_leveys ?? fallbackOuter;
        items.push({
            label: isPariovi ? 'Käyntiovi' : '',
            width: applyKickHeightOuterWidthAdjust(mainWidth + mainAdj, kickHeight)
        });
        if (isPariovi) {
            const sideAdj = fs?.umpiovi_potku_lisa_ulko_leveys ?? fs?.umpiovi_potku_ulko_leveys ?? fallbackOuter;
            items.push({
                label: 'Lisäovi',
                width: applyKickHeightOuterWidthAdjust(sideWidth + sideAdj, kickHeight)
            });
        }
        return items;
    }

    const fs = isJanisol ? formulas.janisol_pariovi : formulas.economy_pariovi;
    items.push({
        label: isPariovi ? 'Käyntiovi' : '',
        width: applyKickHeightOuterWidthAdjust(mainWidth + (fs?.potku_kaynti_ulko_leveys || 0), kickHeight)
    });
    if (isPariovi) {
        const sideAdj = settings.umpivasikkaEnabled
            ? (fs?.umpiovi_potku_lisa_ulko_leveys ?? fs?.umpiovi_potku_ulko_leveys ?? (isJanisol ? 165 : 160))
            : (fs?.potku_lisa_ulko_leveys || 0);
        items.push({
            label: 'Lisäovi',
            width: applyKickHeightOuterWidthAdjust(sideWidth + sideAdj, kickHeight)
        });
    }
    return items;
}

const PYSTYPANELI_LENGTH_OFFSET_MM = 78;

function getPystypaneliPaneHeightSum(opts) {
    const umpiovi = opts?.umpioviEnabled != null ? !!opts.umpioviEnabled : !!settings.umpioviEnabled;
    if (umpiovi) return 0;
    if (Array.isArray(opts?.paneHeights)) {
        return opts.paneHeights.reduce((sum, h) => sum + (parseInt(h, 10) || 0), 0);
    }
    const count = settings.paneCount || 1;
    let sum = 0;
    for (let i = 1; i <= count; i++) {
        sum += parseInt(document.getElementById(`paneHeight${i}`)?.value, 10) || 0;
    }
    return sum;
}

function buildPystypaneliDataItems(opts = {}) {
    const items = [];
    const calcType = opts.calculator || currentCalculator;
    const panelFormulas = getPystypaneliFormulaSet(calcType) || {};
    const pituusOffset = Number.isFinite(panelFormulas.pituus) ? panelFormulas.pituus : PYSTYPANELI_LENGTH_OFFSET_MM;
    const alotusOffset = Number.isFinite(panelFormulas.alotus) ? panelFormulas.alotus : -5;
    const umpiovi = opts.umpioviEnabled != null ? !!opts.umpioviEnabled : !!settings.umpioviEnabled;
    const kickEnabled = opts.kickPlateEnabled != null ? !!opts.kickPlateEnabled : settings.kickPlateEnabled !== false;
    const paneSum = getPystypaneliPaneHeightSum(opts);
    const Y = parseFloat(opts.pystypaneliY != null ? opts.pystypaneliY : document.getElementById('pystypaneliY')?.value);

    if (!umpiovi && paneSum > 0) {
        items.push({ label: 'Panelin pituus', value: `${paneSum + pituusOffset} mm` });
    }
    if (kickEnabled && Y > 0) {
        getPystypaneliOuterWidths(opts).forEach(item => {
            if (!(item.width > 0)) return;
            const result = calcPystypaneliStartEnd(item.width, Y, alotusOffset);
            const prefix = item.label ? `${item.label}: alotus-/lopetuspaneeli` : 'Alotus-/lopetuspaneeli';
            items.push({ label: prefix, value: `${result.toFixed(1)} mm` });
        });
    }
    if (items.length === 0) return null;
    return { title: 'Pystypaneli', items };
}

function buildPystypaneliResultsHtml() {
    let html = '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Pystypaneli</h5>';
    const section = buildPystypaneliDataItems({
        pystypaneliY: document.getElementById('pystypaneliY')?.value
    });
    (section?.items || []).forEach(item => {
        html += `<div class="result-item">${item.label}: ${item.value}</div>`;
    });
    const hasPituus = (section?.items || []).some(item => item.label === 'Panelin pituus');
    const hasAlotus = (section?.items || []).some(item => String(item.label).includes('alotus-/lopetuspaneeli'));
    if (settings.umpioviEnabled && !hasPituus) {
        html += '<div class="result-item text-muted">Umpiovessa ei ruudun korkeutta — panelin pituutta ei lasketa.</div>';
    }
    if (!settings.kickPlateEnabled) {
        html += '<div class="result-item text-muted">Kytke potkupelti päälle alotus-/lopetuspaneelin laskemiseksi.</div>';
    } else if (!hasAlotus) {
        html += '<div class="result-item text-muted">Syötä panelin peittoväli (> 0).</div>';
    }
    html += '</div></div>';
    return html;
}

function togglePystypaneli(enabled) {
    pystypaneliEnabled = !!enabled;
    localStorage.setItem('pystypaneliEnabled', pystypaneliEnabled);

    if (pystypaneliEnabled && scannerEnabled) {
        scannerEnabled = false;
        localStorage.setItem('scannerEnabled', 'false');
        const scanToggle = document.getElementById('scannerToggle');
        if (scanToggle) scanToggle.checked = false;
        const scannerPanel = document.getElementById('scannerPanel');
        if (scannerPanel) scannerPanel.style.display = 'none';
        const scanReviewCard = document.getElementById('scanReviewCard');
        if (scanReviewCard) scanReviewCard.style.display = 'none';
        const scanPdfPreview = document.getElementById('scanPdfPreview');
        if (scanPdfPreview) scanPdfPreview.style.display = 'none';
        const inputsRow = document.getElementById('calculatorInputsRow');
        if (inputsRow) inputsRow.style.display = '';
    }

    if (pystypaneliEnabled && verkkoEnabled) {
        disableVerkkoModeUi();
    }

    const toggle = document.getElementById('pystypaneliToggle');
    if (toggle) toggle.checked = pystypaneliEnabled;

    updateCalculatorButtonVisibility();

    if (pystypaneliEnabled && isWindowCalculatorType()) {
        selectCalculator('janisol-pariovi');
        return;
    }

    updateCalculatorInputVisibility();
    calculate();
}

function toggleVerkko(enabled) {
    verkkoEnabled = !!enabled;
    localStorage.setItem('verkkoEnabled', verkkoEnabled);

    if (verkkoEnabled && scannerEnabled) {
        scannerEnabled = false;
        localStorage.setItem('scannerEnabled', 'false');
        const scanToggle = document.getElementById('scannerToggle');
        if (scanToggle) scanToggle.checked = false;
        const scannerPanel = document.getElementById('scannerPanel');
        if (scannerPanel) scannerPanel.style.display = 'none';
        const scanReviewCard = document.getElementById('scanReviewCard');
        if (scanReviewCard) scanReviewCard.style.display = 'none';
        const scanPdfPreview = document.getElementById('scanPdfPreview');
        if (scanPdfPreview) scanPdfPreview.style.display = 'none';
    }

    if (verkkoEnabled && pystypaneliEnabled) {
        pystypaneliEnabled = false;
        localStorage.setItem('pystypaneliEnabled', 'false');
        const pystypaneliToggle = document.getElementById('pystypaneliToggle');
        if (pystypaneliToggle) pystypaneliToggle.checked = false;
    }

    const inputsRow = document.getElementById('calculatorInputsRow');
    const toggle = document.getElementById('verkkoToggle');
    if (inputsRow) inputsRow.style.display = scannerEnabled ? 'none' : '';
    if (toggle) toggle.checked = verkkoEnabled;
    updateCalculatorButtonVisibility();

    if (verkkoEnabled) {
        hideVerkkoSettings();
        if (!isVerkkoCalculatorType()) {
            selectCalculator('verkko-ovi');
        } else {
            updateCalculatorInputVisibility();
            calculate();
        }
    } else {
        VERKKO_HIDDEN_SETTINGS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        if (isVerkkoCalculatorType()) {
            selectCalculator('janisol-pariovi');
        } else {
            updateCalculatorInputVisibility();
            calculate();
        }
    }
}

function initVerkko() {
    verkkoEnabled = localStorage.getItem('verkkoEnabled') === 'true';
    const toggle = document.getElementById('verkkoToggle');
    if (toggle) toggle.checked = verkkoEnabled;
    updateCalculatorButtonVisibility();
    if (verkkoEnabled) toggleVerkko(true);
}

function initPystypaneli() {
    pystypaneliEnabled = localStorage.getItem('pystypaneliEnabled') === 'true';
    const toggle = document.getElementById('pystypaneliToggle');
    if (toggle) toggle.checked = pystypaneliEnabled;
    if (pystypaneliEnabled) togglePystypaneli(true);
}

function initScanner() {
    scannerEnabled = localStorage.getItem('scannerEnabled') === 'true';
    const toggle = document.getElementById('scannerToggle');
    if (toggle) toggle.checked = scannerEnabled;
    if (scannerEnabled) toggleScanner(true);

    const dz = document.getElementById('scannerDropZone');
    if (dz && !dz.dataset.bound) {
        ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => {
            e.preventDefault();
            dz.classList.add('dragover');
        }));
        ['dragleave', 'dragend'].forEach(ev => dz.addEventListener(ev, e => {
            e.preventDefault();
            dz.classList.remove('dragover');
        }));
        dz.addEventListener('drop', e => {
            e.preventDefault();
            dz.classList.remove('dragover');
            const list = e.dataTransfer && e.dataTransfer.files;
            if (list && list.length) startScanBatch(Array.from(list));
        });
        dz.dataset.bound = '1';
    }

    const calcSel = document.getElementById('scanCalculator');
    if (calcSel && !calcSel.dataset.bound) {
        calcSel.addEventListener('change', updateScanReviewVisibility);
        calcSel.dataset.bound = '1';
    }
    const kickToggle = document.getElementById('scanKickEnabled');
    if (kickToggle && !kickToggle.dataset.bound) {
        kickToggle.addEventListener('change', updateScanReviewVisibility);
        kickToggle.dataset.bound = '1';
    }

    const umpioviCheck = document.getElementById('scanUmpiovi');
    if (umpioviCheck && !umpioviCheck.dataset.bound) {
        umpioviCheck.addEventListener('change', updateScanReviewVisibility);
        umpioviCheck.dataset.bound = '1';
    }

    const scanCalcFields = [
        'scanCalculator', 'scanGap', 'scanPaneCount',
        'scanMainWidth', 'scanSideWidth', 'scanKickEnabled',
        'scanKickHeight',
        'scanUmpiovi', 'scanUmpivasikka', 'scanSealThreshold'
    ];
    scanCalcFields.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.calcBound) {
            el.addEventListener('input', calculateFromScanReview);
            el.addEventListener('change', calculateFromScanReview);
            el.dataset.calcBound = '1';
        }
    });
}

function handleScanFileInput(event) {
    const list = event.target && event.target.files;
    if (list && list.length) startScanBatch(Array.from(list));
}

function isScanBatchMode() {
    return scanBatchActive && scanBatchFiles.length > 1;
}

function collectPdfFiles(files) {
    return (files || []).filter(f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')));
}

function startScanBatch(files) {
    const pdfs = collectPdfFiles(files);
    if (!pdfs.length) {
        scanner_showError('Valitse PDF-tiedosto.');
        return;
    }
    if (pdfs.length === 1) {
        scanBatchFiles = [];
        scanBatchIndex = 0;
        scanBatchActive = false;
        setScanBatchErrorActions(false);
        updateScanBatchActions();
        processScanFile(pdfs[0]);
        return;
    }
    scanBatchFiles = pdfs;
    scanBatchIndex = 0;
    if (!scanTransferQueue.length) {
        scanBatchJobNumber = null;
    } else if (!scanBatchJobNumber) {
        scanBatchJobNumber = scanTransferQueue[0].jobNumber || null;
    }
    scanBatchActive = true;
    updateScanBatchActions();
    renderScanTransferQueue();
    processScanFile(scanBatchFiles[0]);
}

function clearScanBatchState(keepQueue) {
    scanBatchFiles = [];
    scanBatchIndex = 0;
    scanBatchJobNumber = null;
    scanBatchActive = false;
    if (!keepQueue) {
        // keepQueue=true: säilytä siirtojono (Peruuta kesken erän)
    }
    setScanBatchErrorActions(false);
    updateScanBatchActions();
    renderScanTransferQueue();
}

function setScanBatchErrorActions(show) {
    const el = document.getElementById('scannerBatchErrorActions');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
}

function updateScanBatchActions() {
    const batch = isScanBatchMode();
    const prog = document.getElementById('scanBatchProgress');
    if (prog) {
        if (batch) {
            prog.style.display = '';
            prog.textContent = `PDF ${scanBatchIndex + 1} / ${scanBatchFiles.length}`;
        } else {
            prog.style.display = 'none';
        }
    }
    const skipBtn = document.getElementById('scanSkipBtn');
    const singleBtn = document.getElementById('scanAcceptSingleBtn');
    const queueBtn = document.getElementById('scanAcceptQueueBtn');
    if (skipBtn) skipBtn.style.display = batch ? '' : 'none';
    if (singleBtn) singleBtn.style.display = batch ? 'none' : '';
    if (queueBtn) queueBtn.style.display = batch ? '' : 'none';
}

function applyScanBatchJobLock(parsedJob) {
    const jobEl = document.getElementById('scanJobNumber');
    const warn = document.getElementById('scanJobMismatchWarn');
    if (!jobEl) return;

    if (!isScanBatchMode()) {
        jobEl.readOnly = false;
        if (warn) { warn.style.display = 'none'; warn.textContent = ''; }
        return;
    }

    if (scanBatchJobNumber) {
        jobEl.value = scanBatchJobNumber;
        jobEl.readOnly = true;
        const ocrJob = (parsedJob || '').trim();
        if (warn) {
            if (ocrJob && ocrJob !== scanBatchJobNumber) {
                warn.style.display = '';
                warn.textContent = `Piirustuksen työnumero (${ocrJob}) poikkeaa erän työnumerosta (${scanBatchJobNumber}). Käytetään erän työnumeroa.`;
            } else {
                warn.style.display = 'none';
                warn.textContent = '';
            }
        }
    } else {
        jobEl.readOnly = false;
        if (warn) { warn.style.display = 'none'; warn.textContent = ''; }
    }
}

async function advanceScanBatch() {
    if (!scanBatchActive) return;
    scanBatchIndex += 1;
    if (scanBatchIndex >= scanBatchFiles.length) {
        const card = document.getElementById('scanReviewCard');
        if (card) card.style.display = 'none';
        clearScanPdfPreview();
        scanner_resetPanel();
        scanBatchFiles = [];
        scanBatchActive = false;
        scanBatchIndex = 0;
        // scanBatchJobNumber säilyy kunnes jono tyhjennetään / siirretään
        updateScanBatchActions();
        renderScanTransferQueue();
        if (scanTransferQueue.length) {
            scanTransferQueueOpen = true;
            renderScanTransferQueue();
            const panel = document.getElementById('scanTransferQueuePanel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showToast(`Erä valmis. Siirtojonossa ${scanTransferQueue.length} tuotetta.`, 'success');
        } else {
            showToast('Erä valmis. Siirtojono on tyhjä.', 'info');
        }
        return;
    }
    updateScanBatchActions();
    await processScanFile(scanBatchFiles[scanBatchIndex]);
}

function retryCurrentScanBatchFile() {
    if (!scanBatchActive || !scanBatchFiles[scanBatchIndex]) return;
    setScanBatchErrorActions(false);
    processScanFile(scanBatchFiles[scanBatchIndex]);
}

function skipScanInBatch() {
    if (!isScanBatchMode()) return;
    setScanBatchErrorActions(false);
    const card = document.getElementById('scanReviewCard');
    if (card) card.style.display = 'none';
    clearScanPdfPreview();
    advanceScanBatch();
}

function toggleScanTransferQueuePanel() {
    scanTransferQueueOpen = !scanTransferQueueOpen;
    renderScanTransferQueue();
}

function removeFromScanTransferQueue(id) {
    scanTransferQueue = scanTransferQueue.filter(e => e.id !== id);
    renderScanTransferQueue();
}

function renderScanTransferQueue() {
    const panel = document.getElementById('scanTransferQueuePanel');
    const countEl = document.getElementById('scanTransferQueueCount');
    const body = document.getElementById('scanTransferQueueBody');
    const list = document.getElementById('scanTransferQueueList');
    const bulkBtn = document.getElementById('scanBulkTransferBtn');
    const chevron = document.getElementById('scanTransferQueueChevron');
    const n = scanTransferQueue.length;
    if (countEl) countEl.textContent = String(n);
    if (!panel) return;

    const showPanel = n > 0 || (scanBatchActive && scanBatchFiles.length > 1);
    panel.style.display = showPanel ? '' : 'none';
    if (body) body.style.display = scanTransferQueueOpen ? '' : 'none';
    if (chevron) chevron.textContent = scanTransferQueueOpen ? '▴' : '▾';

    if (list) {
        if (!n) {
            list.innerHTML = '<p class="text-muted small mb-0 px-3 py-2">Jono on tyhjä.</p>';
        } else {
            list.innerHTML = scanTransferQueue.map(e => {
                const calcLabel = (e.calculator || '').replace(/-/g, ' ');
                const q = e.quantity > 1 ? ` · ${e.quantity} kpl` : '';
                return `<div class="scan-transfer-queue-item">
                    <div class="scan-transfer-queue-item-main">
                        <div class="scan-transfer-queue-item-name">${escapeHtml(e.itemName || '(nimetön)')}</div>
                        <div class="scan-transfer-queue-item-meta text-muted">${escapeHtml(calcLabel)}${q}${e.fileName ? ' · ' + escapeHtml(e.fileName) : ''}</div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeFromScanTransferQueue(${e.id})">Poista</button>
                </div>`;
            }).join('');
        }
    }

    const canBulk = n > 0 && !scanBatchActive;
    if (bulkBtn) {
        bulkBtn.style.display = canBulk ? '' : 'none';
        bulkBtn.textContent = n === 1 ? 'Siirrä 1 tuote Tuotantoon' : `Siirrä ${n} tuotetta Tuotantoon`;
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyScanReviewToCalculator() {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const calc = val('scanCalculator');
    const isPari = calc.includes('pariovi');

    selectCalculator(calc);

    const gapVal = val('scanGap');
    settings.gapOption = gapVal === 'saneeraus' ? 'saneeraus' : (parseInt(gapVal, 10) || 8);
    const gapSel = document.getElementById('gapOption');
    if (gapSel) gapSel.value = String(settings.gapOption);

    const kickEnabled = document.getElementById('scanKickEnabled').checked;
    settings.kickPlateEnabled = kickEnabled;
    const kickToggle = document.getElementById('kickPlateToggle');
    if (kickToggle) kickToggle.checked = kickEnabled;
    localStorage.setItem('kickPlateEnabled', kickEnabled);

    const umpioviEnabled = !!document.getElementById('scanUmpiovi')?.checked;
    settings.umpioviEnabled = umpioviEnabled;
    const umpioviToggle = document.getElementById('umpioviToggle');
    if (umpioviToggle) umpioviToggle.checked = umpioviEnabled;
    localStorage.setItem('umpioviEnabled', umpioviEnabled);

    const umpivasikkaEnabled = !!document.getElementById('scanUmpivasikka')?.checked;
    settings.umpivasikkaEnabled = umpivasikkaEnabled;
    const umpivasikkaToggle = document.getElementById('umpivasikkaToggle');
    if (umpivasikkaToggle) umpivasikkaToggle.checked = umpivasikkaEnabled;
    localStorage.setItem('umpivasikkaEnabled', umpivasikkaEnabled);

    const sealEnabled = !!document.getElementById('scanSealThreshold')?.checked;
    settings.sealThresholdEnabled = sealEnabled;
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) sealThresholdToggle.checked = sealEnabled;
    localStorage.setItem('sealThresholdEnabled', sealEnabled);

    const paneCount = parseInt(val('scanPaneCount'), 10) || 1;
    settings.paneCount = paneCount;
    const paneCountSel = document.getElementById('paneCount');
    if (paneCountSel) paneCountSel.value = String(paneCount);
    updatePaneInputs();

    const setInput = (id, v) => { const el = document.getElementById(id); if (el && v !== '') el.value = v; };
    setInput('mainDoorWidth', val('scanMainWidth'));
    if (isPari) setInput('sideDoorWidth', val('scanSideWidth'));
    if (kickEnabled) setInput('kickPlateHeight', val('scanKickHeight'));
    for (let i = 1; i <= paneCount; i++) {
        const v = val('scanPaneHeight' + i) || val('scanPaneHeight');
        setInput('paneHeight' + i, v);
    }

    updateCalculatorInputVisibility();
    updateSettingsInfo();
    calculate();
}

function buildMittatResultsFromDom(lasilistaSize, lasilistaColor) {
    const isNoResultsTransferMode = isUmpioviNoResultsMode();
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv ? resultsDiv.querySelectorAll('.result-section') : [];
    const results = {
        calculator: currentCalculator,
        timestamp: new Date().toISOString(),
        lasilistaSize: lasilistaSize || '',
        lasilistaColor: lasilistaColor || '',
        metadataOnly: isNoResultsTransferMode,
        inputs: {
            calculator: currentCalculator,
            mainDoorWidth: document.getElementById('mainDoorWidth')?.value || '',
            sideDoorWidth: document.getElementById('sideDoorWidth')?.value || '',
            kickPlateHeight: document.getElementById('kickPlateHeight')?.value || '',
            gapOption: settings.gapOption,
            paneCount: settings.paneCount,
            kickPlateEnabled: settings.kickPlateEnabled,
            sealThresholdEnabled: settings.sealThresholdEnabled,
            umpioviEnabled: settings.umpioviEnabled,
            umpivasikkaEnabled: settings.umpivasikkaEnabled,
            formulaSet: localStorage.getItem('activeFormulaSet') || 'default',
            paneHeights: [],
            paneWidths: []
        },
        data: []
    };
    const isWindowCalc = (currentCalculator || '').includes('ikkuna');
    for (let i = 1; i <= settings.paneCount; i++) {
        results.inputs.paneHeights.push(document.getElementById(`paneHeight${i}`)?.value || '');
        const widthEl = document.getElementById(`paneWidth${i}`);
        const widthVal = widthEl?.value
            || (isWindowCalc && !widthEl ? (document.getElementById('mainDoorWidth')?.value || '') : '')
            || '';
        results.inputs.paneWidths.push(widthVal);
    }
    sections.forEach(section => {
        const titleEl = section.querySelector('h5');
        const title = titleEl ? titleEl.textContent : '';
        const items = [];
        section.querySelectorAll('.result-item').forEach(item => {
            const fullText = item.textContent.trim();
            const colonIndex = fullText.indexOf(':');
            if (colonIndex !== -1) {
                items.push({
                    label: fullText.substring(0, colonIndex).trim(),
                    value: fullText.substring(colonIndex + 1).trim()
                });
            } else {
                items.push({ label: fullText, value: '' });
            }
        });
        results.data.push({ title, items });
    });
    return results;
}

function writeMittatItems(jobNumber, itemName, itemCount, results, opts) {
    const silentMerge = !!(opts && opts.silentMerge);
    let mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    if (!mittatData[jobNumber]) mittatData[jobNumber] = {};

    const namesToSave = [];
    const count = Math.max(1, Math.min(99, parseInt(itemCount, 10) || 1));
    if (count === 1) namesToSave.push(itemName);
    else {
        for (let i = 1; i <= count; i++) namesToSave.push(`${itemName} (${i}.)`);
    }

    namesToSave.forEach(finalName => {
        const resultsCopy = JSON.parse(JSON.stringify(results));
        resultsCopy.timestamp = new Date().toISOString();
        if (mittatData[jobNumber][finalName]) {
            if (silentMerge) {
                mittatData[jobNumber][finalName] = mergeResults(mittatData[jobNumber][finalName], resultsCopy);
            } else {
                const action = confirm(
                    `"${finalName}" on jo tallennettu työnumerolle ${jobNumber}.\n\n` +
                    `OK = Yhdistä mitat\nPeruuta = Korvaa vanhat mitat`
                );
                if (action) {
                    mittatData[jobNumber][finalName] = mergeResults(mittatData[jobNumber][finalName], resultsCopy);
                } else {
                    mittatData[jobNumber][finalName] = resultsCopy;
                }
            }
        } else {
            mittatData[jobNumber][finalName] = resultsCopy;
        }
    });

    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    return namesToSave.length;
}

function acceptScanToQueue() {
    if (!isScanBatchMode()) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    let jobNumber = scanBatchJobNumber || val('scanJobNumber');
    const itemName = val('scanItemName');
    const quantity = Math.max(1, Math.min(99, parseInt(val('scanQuantity'), 10) || 1));
    const rawSize = val('scanLasilistaSize');
    const color = normalizeLasilistaColor(val('scanColor') || '');

    if (!jobNumber) {
        showToast('Syötä työnumero ennen hyväksyntää.', 'warning');
        return;
    }
    if (!itemName) {
        showToast('Syötä oven / ikkunan nimi ennen hyväksyntää.', 'warning');
        return;
    }

    const isNoResultsTransferMode = !isScanDoorWindowMode() && isUmpioviNoResultsMode();
    if (!isNoResultsTransferMode && !rawSize) {
        showToast('Valitse lasilistojen koko ennen hyväksyntää.', 'warning');
        return;
    }
    const lasilistaSize = rawSize === 'ei-lasilistaa' ? '' : rawSize;
    let results;
    if (isScanDoorWindowMode()) {
        results = buildDoorWindowScanResults(lasilistaSize, color);
        if (!results || !(results.data || []).length) {
            showToast('Ei kelvollisia tuloksia siirrettäväksi. Tarkista syötteet.', 'warning');
            return;
        }
        applyScanReviewToCalculator();
    } else {
        applyScanReviewToCalculator();
        results = buildMittatResultsFromDom(lasilistaSize, color);
    }
    const sections = document.getElementById('results')?.querySelectorAll('.result-section') || [];
    if (sections.length === 0 && !isNoResultsTransferMode) {
        showToast('Ei kelvollisia tuloksia jonoon. Tarkista syötteet.', 'warning');
        return;
    }

    if (!scanBatchJobNumber) scanBatchJobNumber = jobNumber;

    const file = scanBatchFiles[scanBatchIndex];
    scanTransferQueue.push({
        id: scanQueueIdSeq++,
        fileName: file ? file.name : '',
        jobNumber: scanBatchJobNumber,
        itemName,
        quantity,
        lasilistaSize,
        lasilistaColor: color,
        calculator: currentCalculator,
        results
    });

    const card = document.getElementById('scanReviewCard');
    if (card) card.style.display = 'none';
    clearScanPdfPreview();
    renderScanTransferQueue();
    showToast(`Lisätty siirtojonoon: ${itemName}`, 'success');
    advanceScanBatch();
}

function bulkTransferScanQueue() {
    if (!scanTransferQueue.length) {
        showToast('Siirtojono on tyhjä.', 'warning');
        return;
    }
    if (scanBatchActive) {
        showToast('Odota erän valmistumista ennen siirtoa.', 'warning');
        return;
    }

    let saved = 0;
    const jobs = new Set();
    scanTransferQueue.forEach(entry => {
        const jobNumber = entry.jobNumber || scanBatchJobNumber;
        if (!jobNumber) return;
        jobs.add(jobNumber);
        saved += writeMittatItems(
            jobNumber,
            entry.itemName,
            entry.quantity,
            entry.results,
            { silentMerge: true }
        );
    });

    if (!saved) {
        showToast('Työnumero puuttuu — siirto epäonnistui.', 'warning');
        return;
    }

    syncMitatStateToFirestore();
    syncMitatInputsToFirestore();
    scanTransferQueue = [];
    scanBatchJobNumber = null;
    scanTransferQueueOpen = false;
    renderScanTransferQueue();
    const jobLabel = [...jobs].join(', ');
    showToast(`Siirretty Tuotantoon: ${saved} tuotetta (työ ${jobLabel})`, 'success');
    if (typeof loadMittatView === 'function') {
        try { loadMittatView(); } catch (e) { /* ohitetaan */ }
    }
}

function scanner_setStatus(active, text, pct) {
    const s = document.getElementById('scannerStatus');
    const dz = document.getElementById('scannerDropZone');
    if (!s) return;
    s.style.display = active ? '' : 'none';
    if (dz) dz.style.display = active ? 'none' : '';
    if (text) {
        const t = document.getElementById('scannerStatusText');
        if (t) t.textContent = text;
    }
    if (pct != null) {
        const bar = document.getElementById('scannerProgressBar');
        if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
}

function scanner_showError(msg) {
    const e = document.getElementById('scannerError');
    if (!e) return;
    if (msg) {
        e.textContent = msg;
        e.style.display = '';
    } else {
        e.style.display = 'none';
    }
}

function scanner_resetPanel() {
    scanner_setStatus(false);
    scanner_showError('');
    const fi = document.getElementById('scannerFileInput');
    if (fi) fi.value = '';
    clearScanPdfPreview();
}

function clearScanPdfPreview() {
    const preview = document.getElementById('scanPdfPreview');
    const host = document.getElementById('scanPdfPreviewHost');
    if (host) host.innerHTML = '';
    if (preview) preview.style.display = 'none';
}

function showScanPdfPreview(canvas) {
    const preview = document.getElementById('scanPdfPreview');
    const host = document.getElementById('scanPdfPreviewHost');
    if (!preview || !host || !canvas) return;
    host.innerHTML = '';
    canvas.className = 'scan-pdf-preview-canvas';
    host.appendChild(canvas);
    preview.style.display = '';
}

async function processScanFile(file) {
    const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    if (!isPdf) {
        scanner_showError('Valitse PDF-tiedosto.');
        return;
    }
    if (!window.pdfjsLib) {
        scanner_showError('PDF-kirjasto ei latautunut. Tarkista verkkoyhteys ja päivitä sivu.');
        return;
    }
    scanner_showError('');
    setScanBatchErrorActions(false);
    const batchLabel = isScanBatchMode()
        ? `Avataan PDF ${scanBatchIndex + 1}/${scanBatchFiles.length}…`
        : 'Avataan PDF…';
    scanner_setStatus(true, batchLabel, 5);
    try {
        const { canvas, width, height, textTokens } = await scanner_loadPdf(file);
        let tokens = textTokens;
        if (!tokens || tokens.length < 6) {
            if (!window.Tesseract) throw new Error('OCR-kirjasto ei latautunut.');
            scanner_setStatus(true, 'Luetaan tekstiä (OCR)…', 20);
            tokens = await scanner_ocr(canvas, p =>
                scanner_setStatus(true, 'Luetaan tekstiä (OCR)…', 20 + Math.round((p || 0) * 70)));
        }
        scanner_setStatus(true, 'Tulkitaan tietoja…', 96);
        const parsed = scanner_parse(tokens, width, height);
        scanner_setStatus(false);
        showScanReview(parsed, canvas);
    } catch (err) {
        console.error('Skannausvirhe:', err);
        scanner_setStatus(false);
        scanner_showError('Skannaus epäonnistui: ' + ((err && err.message) || err));
        if (isScanBatchMode()) setScanBatchErrorActions(true);
    }
}

async function scanner_loadPdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, Math.max(1.5, 2200 / base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    let textTokens = null;
    try {
        const tc = await page.getTextContent();
        const toks = [];
        tc.items.forEach(it => {
            const s = (it.str || '').trim();
            if (!s) return;
            const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
            const x = tx[4];
            const y = tx[5];
            const vertical = Math.abs(tx[0]) < Math.abs(tx[1]);
            const wpx = (it.width || 0) * scale;
            const hpx = (it.height || 0) * scale || Math.hypot(tx[2], tx[3]) || 10;
            const cx = vertical ? x : x + wpx / 2;
            const cy = vertical ? y + wpx / 2 : y - hpx / 2;
            toks.push({ text: s, cx, cy, vertical, conf: 99 });
        });
        const totalChars = toks.reduce((n, t) => n + t.text.length, 0);
        if (totalChars >= 25) textTokens = toks;
    } catch (e) {
        // Ei tekstikerrosta -> OCR hoitaa
    }
    return { canvas, width: canvas.width, height: canvas.height, textTokens };
}

function scanner_rotate(src, dir) {
    const W = src.width;
    const H = src.height;
    const out = document.createElement('canvas');
    const ctx = out.getContext('2d');
    out.width = H;
    out.height = W;
    if (dir === 'cw') {
        ctx.translate(H, 0);
        ctx.rotate(Math.PI / 2);
    } else {
        ctx.translate(0, W);
        ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(src, 0, 0);
    const map = dir === 'cw'
        ? (rcx, rcy) => ({ cx: rcy, cy: H - rcx })
        : (rcx, rcy) => ({ cx: W - rcy, cy: rcx });
    return { canvas: out, map };
}

async function scanner_ocr(canvas, onProgress) {
    const worker = await Tesseract.createWorker('fin+eng', 1, {
        logger: m => {
            if (m && m.status === 'recognizing text' && onProgress) onProgress(m.progress);
        }
    });
    const tokens = [];
    const pushWords = (words, orient, map) => {
        (words || []).forEach(w => {
            const text = (w.text || '').trim();
            if (!text) return;
            if (w.confidence != null && w.confidence < 35) return;
            const bx = (w.bbox.x0 + w.bbox.x1) / 2;
            const by = (w.bbox.y0 + w.bbox.y1) / 2;
            const p = map ? map(bx, by) : { cx: bx, cy: by };
            tokens.push({ text, cx: p.cx, cy: p.cy, vertical: orient === 'v', conf: w.confidence == null ? 50 : w.confidence });
        });
    };
    try {
        let r = await worker.recognize(canvas);
        pushWords(r.data.words, 'h');
        const cw = scanner_rotate(canvas, 'cw');
        r = await worker.recognize(cw.canvas);
        pushWords(r.data.words, 'v', cw.map);
        const ccw = scanner_rotate(canvas, 'ccw');
        r = await worker.recognize(ccw.canvas);
        pushWords(r.data.words, 'v', ccw.map);
    } finally {
        await worker.terminate();
    }
    return tokens;
}

function scanner_parse(tokens, W, H) {
    const norm = tokens.map(t => ({ ...t, nx: t.cx / W, ny: t.cy / H }));
    const all = norm.map(t => t.text).join(' ');
    const low = all.toLowerCase();
    const conf = {};

    // --- Orientaatio: vaaka vs pysty ---
    // Luotettavin indikaattori on sivun itsensä dimensiosuhde W/H:
    //   Landscape-piirustus (Kontulan tyyli): PDF-sivu on vaakasuuntainen → W > H
    //   Portrait-piirustus (Kaakonojantie tyyli): PDF-sivu on pystysuuntainen → H > W
    const isLandscape = W > H;
    // Vaakakuvassa piirrustus alkaa vasta nx > 0.38 → suodatetaan vasemman tekstipalkin numerot pois
    const drawingMinNx = isLandscape ? 0.38 : 0.08;

    // --- Laskuri: ovi/ikkuna, pari/käynti, janisol/economy ---
    const hasIkkuna = /ikkuna/.test(low);
    const hasOvi = /ovi|ovet|luukku/.test(low);
    const isWindow = hasIkkuna && !hasOvi;

    // Etsi käyntioven R/L-kirjain ruudun sisältä.
    // Landscape: vain vaakateksti (Kontula). Portrait: myös pysty-R/L (moniruutu-pariovi).
    const rlTok = norm.find(t =>
        /^[RLrl]$/.test(t.text.trim()) &&
        (isLandscape ? !t.vertical : true) &&
        t.ny > 0.22 && t.ny < 0.82 &&
        t.nx > 0.15 && t.nx < 0.88
    );

    // Laske leveysvyöhykkeet heti R/L:n perusteella, jotta pariovi/käyntiovi voidaan erottaa.
    // Pariovi: molemmat puolet sivua tuottavat leveysmitta.
    // Käyntiovi: mitat löytyvät vain yhdeltä puolelta (lisäovi-puoli jää tyhjäksi).
    let _kayntiWidths = [], _lisaWidths = [];
    let splitNx = 0.5;
    let rlOnRight = false;
    if (rlTok) {
        // Vaakakuvassa leveysmitat ovat piirrustuksen yläosassa (kiinteä zona).
        // Pystykuvassa leveysmitat ovat lähellä R/L-kirjainta (ny-suhteinen).
        const _pw = isLandscape
            ? norm
                .filter(t => !t.vertical &&
                          t.nx > drawingMinNx && t.nx < 0.88 &&
                          t.ny > 0.25 && t.ny < 0.50 &&
                          /^\d{3,4}$/.test(t.text.trim()))
                .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
                .filter(o => o.v >= 150 && o.v <= 1800)
            : norm
                .filter(t => !t.vertical &&
                          t.ny > 0.50 && t.ny < 0.80 &&
                          /^\d{3,4}$/.test(t.text.trim()))
                .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
                .filter(o => o.v >= 150 && o.v <= 1800);
        if (_pw.length >= 2) {
            // Etsi leveyskandidaattien suurin nx-väli = paneelien välinen raja
            const sorted = [..._pw].sort((a, b) => a.nx - b.nx);
            let maxGap = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                const gap = sorted[i + 1].nx - sorted[i].nx;
                if (gap > maxGap) { maxGap = gap; splitNx = (sorted[i].nx + sorted[i + 1].nx) / 2; }
            }
            // rlTok kertoo kumpi puoli on käyntiovi
            rlOnRight = rlTok.nx >= splitNx;
            _kayntiWidths = _pw.filter(o => rlOnRight ? o.nx >= splitNx : o.nx < splitNx);
            _lisaWidths   = _pw.filter(o => rlOnRight ? o.nx < splitNx  : o.nx >= splitNx);
        }
        // Käyntioven ja lisäoven leveydet samalla rivillä (landscape + portrait).
        // Filtteröidään käyntiovi-kandidaatit lisäoven ny:n perusteella (Δny < 0.05),
        // jotta eri rivin kokonaisleveys (esim. alaosan 1390/990) ei päädy syötteeksi.
        if (_lisaWidths.length > 0 && _kayntiWidths.length > 0) {
            const refNy = _lisaWidths[0].ny;
            const sameRow = _kayntiWidths.filter(o => Math.abs(o.ny - refNy) < 0.05);
            _kayntiWidths = sameRow.length > 0 ? sameRow : [];
        }
    }
    // --- Moniruutu-tunnistus ENNEN pariovi/kayntiovi-valintaa ---
    // >=2 samaa pystykorkeutta alueella 200-900 -> lasiruudut (ei kokonaiskorkeus 1400+)
    const phMinNx = Math.max(drawingMinNx, 0.08);
    const phMaxNx = isLandscape ? 0.90 : 0.80;
    let paneCount = 1;
    conf.paneCount = 'low';
    let isMultiPane = false;
    let multiPaneHeight = null;
    {
        const multiCands = norm
            .filter(t => t.vertical && t.nx > phMinNx && t.nx < phMaxNx && /^\d{3,4}$/.test(t.text.trim()))
            .map(t => parseInt(t.text, 10))
            .filter(v => v >= 200 && v <= 900);
        const freq = {};
        multiCands.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        let bestV = null, bestN = 0;
        Object.keys(freq).forEach(k => {
            const n = freq[k];
            const v = parseInt(k, 10);
            if (n >= 2 && n > bestN) { bestN = n; bestV = v; }
        });
        if (bestV != null && bestN >= 2 && bestN <= 12) {
            isMultiPane = true;
            paneCount = bestN;
            multiPaneHeight = bestV;
            conf.paneCount = 'ok';
        }
    }

    // Pariovi: isPariByRL TAI moniruutu-pariovi (vahvistettu kahdella leveydella).
    // Moniruutu-kayntiovi: katisyys-L + alaosan 990 ei saa tehda pariovea.
    const isPariByRL = rlTok != null && _kayntiWidths.length > 0 && _lisaWidths.length > 0;
    let isMultiPanePari = false;
    if (isMultiPane && isPariByRL) {
        const multiPwProbe = norm
            .filter(t => !t.vertical &&
                         t.nx > drawingMinNx && t.nx < 0.92 &&
                         t.ny > 0.40 && t.ny < 0.70 &&
                         /^\d{3,4}$/.test(t.text.trim()))
            .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
            .filter(o => o.v >= 150 && o.v <= 1800 && o.v !== multiPaneHeight);
        if (multiPwProbe.length >= 2) {
            const sorted = [...multiPwProbe].sort((a, b) => a.nx - b.nx);
            let localSplit = 0.5, maxGap = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                const gap = sorted[i + 1].nx - sorted[i].nx;
                if (gap > maxGap) { maxGap = gap; localSplit = (sorted[i].nx + sorted[i + 1].nx) / 2; }
            }
            if (maxGap > 0.06) {
                const kayntiOnRight = rlTok.nx >= localSplit;
                let kW = multiPwProbe.filter(o => kayntiOnRight ? o.nx >= localSplit : o.nx < localSplit);
                const lW = multiPwProbe.filter(o => kayntiOnRight ? o.nx < localSplit : o.nx >= localSplit);
                if (kW.length && lW.length) {
                    const refNy = lW[0].ny;
                    kW = kW.filter(o => Math.abs(o.ny - refNy) < 0.05);
                    isMultiPanePari = kW.length > 0;
                }
            }
        }
    }
    const isPari = isMultiPanePari || (!isMultiPane && (isPariByRL || /pariov|pari\s*-?\s*ov|2\s*-?\s*lehti|kaksilehti/.test(low)));

    const family = /economy|\beco\b/.test(low) ? 'economy' : 'janisol';
    let calculator;
    if (isWindow) calculator = family + '-ikkuna';
    else calculator = family + (isPari ? '-pariovi' : '-kayntiovi');
    conf.calculator = (hasIkkuna || hasOvi || isPariByRL || isMultiPane) ? 'ok' : 'low';

    // --- Rako (vain ovet) ---
    let gapOption = 8;
    conf.gapOption = 'low';
    const gm = low.match(/(8|10|15)\s*mm\s*rako/) || low.match(/rako\s*:?\s*(8|10|15)/);
    if (gm) {
        gapOption = parseInt(gm[1], 10);
        conf.gapOption = 'ok';
    }
    if (/saneeraus/.test(low)) {
        gapOption = 'saneeraus';
        conf.gapOption = 'ok';
    }

    // --- Lasilista / lyöntilista paksuus (esim 12x20) ---
    let lasilistaSize = '';
    conf.lasilistaSize = 'low';
    const sm = all.match(/\b(12|15|20|25|30|35|40)\s*[xX×*]\s*20\b/);
    if (sm) {
        lasilistaSize = sm[1] + 'x20';
        conf.lasilistaSize = 'ok';
    }

    // --- Potkupelti + korkeus ---
    const kickPlateEnabled = /potku/.test(low);
    let kickPlateHeight = '';
    conf.kickPlateHeight = 'low';
    if (kickPlateEnabled) {
        const kc = norm
            .filter(t => {
                const raw = t.text.trim();
                if (!(t.nx > drawingMinNx && t.nx > (isLandscape ? 0.75 : 0.5) && t.ny > 0.62)) return false;
                return /^[Ll]?\d{3}$/.test(raw);
            })
            .map(t => ({
                v: parseInt(t.text.trim().replace(/^[Ll]/, ''), 10),
                ny: t.ny,
                vertical: !!t.vertical
            }))
            .filter(o => o.v >= 100 && o.v <= 800);
        if (kc.length) {
            const vert = kc.filter(o => o.vertical);
            const pool = vert.length ? vert : kc;
            pool.sort((a, b) => b.ny - a.ny);
            kickPlateHeight = pool[0].v;
            conf.kickPlateHeight = 'ok';
        }
    }

    // --- Leveydet (vaaka, alaosa) ---
    const widthCands = norm
        .filter(t => !t.vertical && t.nx > drawingMinNx && t.ny > 0.6 && /^\d{3,4}$/.test(t.text.trim()))
        .map(t => parseInt(t.text, 10))
        .filter(v => v >= 400 && v <= 4000);
    const uniqW = [...new Set(widthCands)].sort((a, b) => b - a);
    let mainDoorWidth = '';
    let sideDoorWidth = '';
    conf.mainDoorWidth = 'low';
    conf.sideDoorWidth = 'low';
    if (isWindow) {
        if (uniqW.length) mainDoorWidth = uniqW[0];
    } else if (isMultiPanePari) {
        // Moniruutu-pariovi: leveydet ruudun sisalla (ny 0.40-0.70), sama rivi (Δny < 0.05).
        const multiPw = norm
            .filter(t => !t.vertical &&
                         t.nx > drawingMinNx && t.nx < 0.92 &&
                         t.ny > 0.40 && t.ny < 0.70 &&
                         /^\d{3,4}$/.test(t.text.trim()))
            .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
            .filter(o => o.v >= 150 && o.v <= 1800 && o.v !== multiPaneHeight);
        if (multiPw.length >= 2) {
            const sorted = [...multiPw].sort((a, b) => a.nx - b.nx);
            let localSplit = 0.5, maxGap = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                const gap = sorted[i + 1].nx - sorted[i].nx;
                if (gap > maxGap) { maxGap = gap; localSplit = (sorted[i].nx + sorted[i + 1].nx) / 2; }
            }
            const kayntiOnRight = rlTok.nx >= localSplit;
            let kW = multiPw.filter(o => kayntiOnRight ? o.nx >= localSplit : o.nx < localSplit);
            const lW = multiPw.filter(o => kayntiOnRight ? o.nx < localSplit : o.nx >= localSplit);
            if (kW.length && lW.length) {
                const refNy = lW[0].ny;
                kW = kW.filter(o => Math.abs(o.ny - refNy) < 0.05);
            }
            if (kW.length) { mainDoorWidth = Math.max(...kW.map(o => o.v)); conf.mainDoorWidth = 'ok'; }
            if (lW.length) { sideDoorWidth = Math.max(...lW.map(o => o.v)); conf.sideDoorWidth = 'ok'; }
        }
    } else if (isMultiPane) {
        // Moniruutu-kayntiovi: leveys ruudun sisalla (ny 0.40-0.70); ei lisaovea
        const topNxMin = isLandscape ? drawingMinNx : 0.42;
        const multiW = norm
            .filter(t => !t.vertical &&
                         t.nx > topNxMin && t.nx < 0.92 &&
                         t.ny > 0.40 && t.ny < 0.70 &&
                         /^\d{3,4}$/.test(t.text.trim()))
            .map(t => parseInt(t.text, 10))
            .filter(v => v >= 200 && v <= 1800 && v !== multiPaneHeight);
        if (multiW.length) {
            mainDoorWidth = Math.min(...multiW);
            conf.mainDoorWidth = 'ok';
        }
        if (!mainDoorWidth) {
            if (uniqW.length >= 2) mainDoorWidth = uniqW[1];
            else if (uniqW.length === 1) mainDoorWidth = uniqW[0];
        }
        sideDoorWidth = '';
        conf.sideDoorWidth = 'ok';
    } else if (isPariByRL) {
        // Kaytetaan jo laskettuja vyohyketaulukoita (_kayntiWidths / _lisaWidths)
        if (_kayntiWidths.length) { mainDoorWidth = Math.max(..._kayntiWidths.map(o => o.v)); conf.mainDoorWidth = 'ok'; }
        if (_lisaWidths.length)   { sideDoorWidth = Math.max(..._lisaWidths.map(o => o.v));   conf.sideDoorWidth = 'ok'; }
    } else if (isPari) {
        if (uniqW.length >= 3) { mainDoorWidth = uniqW[1]; sideDoorWidth = uniqW[2]; }
        else if (uniqW.length === 2) { mainDoorWidth = uniqW[0]; sideDoorWidth = uniqW[1]; }
        else if (uniqW.length === 1) { mainDoorWidth = uniqW[0]; }
    } else {
        // Käyntiovi (yksittäinen): etsi ruudun sisäinen leveys piirustuksen yläosasta.
        // Landscape-sivulla sisämitta on ny < 0.50, portrait-sivulla ny < 0.55.
        // Ulkokehysmitta on alaosassa (ny > 0.6) → widthCands-fallback jos ei löydy.
        const topNyMax = isLandscape ? 0.50 : 0.55;
        const topNxMin = isLandscape ? drawingMinNx : 0.42;
        const upperW = norm
            .filter(t => !t.vertical &&
                         t.nx > topNxMin && t.nx < 0.92 &&
                         t.ny > 0.10 && t.ny < topNyMax &&
                         /^\d{3,4}$/.test(t.text.trim()))
            .map(t => parseInt(t.text, 10))
            .filter(v => v >= 200 && v <= 1800);
        if (upperW.length) {
            mainDoorWidth = Math.min(...upperW);
            conf.mainDoorWidth = 'ok';
        }
        if (!mainDoorWidth) {
            if (uniqW.length >= 2) mainDoorWidth = uniqW[1];
            else if (uniqW.length === 1) mainDoorWidth = uniqW[0];
        }
    }

    // --- Ruudun korkeus (pysty, keskialue) ---
    // Moniruutu: toistuva lasiruudun korkeus (isMultiPane) - ei Math.max / kokonaiskorkeus.
    // Landscape + rlTok: paneelin korkeusmerkki on aina lahimpana rlTok:ia.
    // Portrait / ei rlTok: kaytetaan kiinteaa nx-aluetta ja Math.max:ia.
    let paneHeight = '';
    conf.paneHeight = 'low';
    if (isMultiPane && multiPaneHeight != null) {
        paneHeight = multiPaneHeight;
        conf.paneHeight = 'ok';
    } else {
        let phCands = norm
            .filter(t => t.vertical && t.nx > phMinNx && t.nx < phMaxNx && /^\d{3,4}$/.test(t.text.trim()))
            .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
            .filter(o => o.v >= 200 && o.v <= 4000);
        if (!phCands.length && !isLandscape && isPariByRL) {
            phCands = norm
                .filter(t => t.vertical && Math.abs(t.nx - rlTok.nx) < 0.22 && /^\d{3,4}$/.test(t.text.trim()))
                .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
                .filter(o => o.v >= 200 && o.v <= 4000);
        }
        if (!phCands.length) {
            const fbMinNx = isLandscape ? phMinNx : 0.08;
            const fbMaxNx = isLandscape ? 0.90 : 0.82;
            phCands = norm
                .filter(t => t.vertical && t.nx > fbMinNx && t.nx < fbMaxNx && /^\d{3,4}$/.test(t.text.trim()))
                .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
                .filter(o => o.v >= 200 && o.v <= 4000);
        }
        if (phCands.length) {
            if (isLandscape && rlTok) {
                // Oven ruutu on R/L-lehden keskivyöhykkeellä — ei yläikkunan 345 (pdf.js: R vaakasuora)
                const midPh = phCands.filter(o => o.ny > 0.40 && o.ny < 0.78);
                const pool = midPh.length ? midPh : phCands;
                pool.sort((a, b) => Math.abs(a.nx - rlTok.nx) - Math.abs(b.nx - rlTok.nx));
                paneHeight = pool[0].v;
            } else {
                paneHeight = Math.max(...phCands.map(o => o.v));
            }
            conf.paneHeight = 'ok';
        }
    }

    // --- Työnumero ---
    // Labelin jälkeen: viivamuoto (123-26) TAI kompakti 4–6 numeroa (12326 / 15926).
    // Fallback ilman labelia: vain viivamuoto (ei pelkkää 4–6-numeroista → mitat kuten 1875).
    let jobNumber = '';
    conf.jobNumber = 'low';
    const jm = all.match(/ty[öo]\s*-?\s*numero\s*:?\s*([0-9]{1,4}\s*-\s*[0-9]{2,4}|[0-9]{4,6})/i);
    if (jm) {
        jobNumber = jm[1].replace(/\s+/g, '');
        conf.jobNumber = 'ok';
    } else {
        const j2 = all.match(/\b(\d{2,4}-\d{2,4})\b/);
        if (j2) jobNumber = j2[1];
    }

    // --- Määrä ---
    let quantity = 1;
    conf.quantity = 'low';
    const qm = all.match(/m[äa]{1,2}r[äa]\s*:?\s*(\d{1,3})/i);
    if (qm) {
        quantity = parseInt(qm[1], 10) || 1;
        conf.quantity = 'ok';
    }

    // --- Väri (kaksivärisessä lasilista = sisäväri) ---
    let color = '';
    conf.color = 'low';
    const sisaM = low.match(/sis[äa][^]{0,30}?ral\s*([0-9]{3,4})/i);
    const ralAll = [...all.matchAll(/ral\s*([0-9]{3,4})/ig)];
    if (sisaM) {
        color = 'RAL ' + sisaM[1].trim().toUpperCase();
        conf.color = 'ok';
    } else if (ralAll.length) {
        color = 'RAL ' + ralAll[0][1];
        conf.color = ralAll.length === 1 ? 'ok' : 'low';
    }
    // RR-värit (Ruukki), esim. "RR 23" — käytetään jos RAL ei löytynyt
    if (!color) {
        const rrM = all.match(/\bRR\s*(\d{2,3})\b/i);
        if (rrM) {
            color = 'RR ' + rrM[1];
            conf.color = 'ok';
        }
    }

    // --- Nimi (otsikkolohko, vasen ylä) ---
    // Otsikkolohkon rakenne on AINA: Rivi1=Pos./Määrä, Rivi2=Tuotekoodi, Rivi3=Työmaa, Rivi4=Työnumero, Rivi5=Ulkoa katsottuna
    let itemName = '';
    conf.itemName = 'low';
    const titleToks = norm
        .filter(t => !t.vertical && t.ny < 0.32 && t.nx < 0.62)
        .sort((a, b) => (a.ny - b.ny) || (a.nx - b.nx));
    const lines = [];
    titleToks.forEach(t => {
        let line = lines.find(L => Math.abs(L.ny - t.ny) < 0.02);
        if (!line) {
            line = { ny: t.ny, parts: [] };
            lines.push(line);
        }
        line.parts.push(t);
    });
    lines.sort((a, b) => a.ny - b.ny);
    const lineStrs = lines.map(L => L.parts.sort((a, b) => a.nx - b.nx).map(p => p.text).join(' ').trim());

    // Rakenteellinen poiminta: etsi "Pos."-rivi → seuraava rivi on tuotekoodi/nimi
    // Nimi saattaa jakautua kahdelle riville: Rivi2=koodi, Rivi3=tyyppi.
    // Rivi3 otetaan mukaan jos se ei ole "Työ:", "Työnumero:", "Ulkoa katsottuna" jne.
    const skipLine = /ty[öo]\s*:|työnumero|ulkoa\s*katsottuna|pos\./i;
    const posLineIdx = lines.findIndex(L =>
        L.parts.some(p => /^pos\./i.test(p.text.trim()))
    );
    if (posLineIdx >= 0 && posLineIdx + 1 < lines.length) {
        const nextLine = lines[posLineIdx + 1];
        const candidate = nextLine.parts.sort((a, b) => a.nx - b.nx).map(p => p.text).join(' ').trim();
        if (candidate.length >= 2) {
            itemName = candidate;
            conf.itemName = 'ok';
            // Tarkista myös Pos.+2 — nimi saattaa jakautua kahdelle riville
            if (posLineIdx + 2 < lines.length) {
                const nextLine2 = lines[posLineIdx + 2];
                const candidate2 = nextLine2.parts.sort((a, b) => a.nx - b.nx).map(p => p.text).join(' ').trim();
                if (candidate2.length >= 2 && !skipLine.test(candidate2)) {
                    itemName = itemName + ' ' + candidate2;
                }
            }
        }
    }

    // Fallback: avainsana- ja exclude-pohjainen haku
    // Exclude-regex: m[äa]{1,2}r\b ei osu "MÄRKÄET"-sanaan (K seuraa R:ää, ei sanarajaa)
    const exclude = /ty[öo]|numero|m[äa]{1,2}r\b|pos\.|\bral\b|janisol|economy|lasi|kynnys|profiili|matta|lyönti/i;
    if (!itemName) {
        for (const s of lineStrs) {
            if (/ovi|ikkuna|ovet|luukku/i.test(s) && !exclude.test(s)) {
                itemName = s.replace(/\s+/g, ' ').trim();
                conf.itemName = 'ok';
                break;
            }
        }
    }
    if (!itemName) {
        const cand = lineStrs.find(s => s.length >= 4 && !exclude.test(s) && /[a-zäöå]/i.test(s));
        if (cand) itemName = cand.replace(/\s+/g, ' ').trim();
    }

    // --- Ruutumaara (teksti) — moniruutu-haara asettaa paneCount jo aiemmin ---
    if (!isMultiPane) {
        const pcm = all.match(/\b(\d{1,2})\s*ruut/i);
        if (pcm) {
            const v = parseInt(pcm[1], 10);
            if (v >= 1 && v <= 12) { paneCount = v; conf.paneCount = 'ok'; }
        }
    }

    // --- Umpiovi ---
    let umpioviEnabled = false;
    conf.umpioviEnabled = 'low';
    if (/umpiov|umpi.?ov/i.test(all)) { umpioviEnabled = true; conf.umpioviEnabled = 'ok'; }

    // --- Umpivasikka ---
    let umpivasikkaEnabled = false;
    conf.umpivasikkaEnabled = 'low';
    if (/umpivasikka|vasikka/i.test(all)) { umpivasikkaEnabled = true; conf.umpivasikkaEnabled = 'ok'; }

    // --- Tiivistekynnys ---
    let sealThresholdEnabled = false;
    conf.sealThresholdEnabled = 'low';
    if (/tiiviste\s*kynnys|tiivistekynnys/i.test(all)) { sealThresholdEnabled = true; conf.sealThresholdEnabled = 'ok'; }

    // --- Ovi + yläikkuna (erillinen haara; ei muuta _pw / isPariByRL) ---
    let isDoorWindow = false;
    let windowWidth = '';
    let windowHeight = '';
    let windowCalculator = '';
    conf.windowWidth = 'low';
    conf.windowHeight = 'low';
    if (!isWindow && !isMultiPane) {
        const winNyMax = isLandscape ? 0.38 : 0.32;
        const winNyMin = isLandscape ? 0.12 : 0.08;
        const doorLeafSet = new Set(
            [mainDoorWidth, sideDoorWidth].filter(v => v !== '' && v != null).map(Number)
        );
        const wwCands = norm
            .filter(t => !t.vertical &&
                         t.nx > drawingMinNx && t.nx < 0.92 &&
                         t.ny > winNyMin && t.ny < winNyMax &&
                         /^\d{3,4}$/.test(t.text.trim()))
            .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
            .filter(o => o.v >= 400 && o.v <= 2500 && !doorLeafSet.has(o.v));
        // Älä sulje pois early paneHeightia (pdf.js voi asettaa sen 345:ksi ennen ovi+ikkuna-haaraa)
        const whCands = norm
            .filter(t => t.vertical &&
                         t.nx > drawingMinNx && t.nx < 0.88 &&
                         t.ny > winNyMin && t.ny < winNyMax &&
                         /^\d{3}$/.test(t.text.trim()))
            .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
            .filter(o => o.v >= 200 && o.v <= 700 &&
                         o.v !== Number(kickPlateHeight));
        if (wwCands.length && whCands.length) {
            wwCands.sort((a, b) => b.v - a.v);
            const ww = wwCands[0];
            windowWidth = ww.v;

            // R/L myös pystytokenina (TLO landscape) — ruutukorkeus luetaan tämän lehden SISÄLTÄ
            const rlFlex = rlTok || norm.find(t =>
                /^[RLrl]$/.test(t.text.trim()) &&
                t.ny > 0.22 && t.ny < 0.82 &&
                t.nx > drawingMinNx && t.nx < 0.88
            );

            // Landscape + pysty-R: palauta käynti/lisä oven vyöhykkeestä ikkunan alta
            if (!mainDoorWidth || !sideDoorWidth || !rlTok) {
                const doorPw = norm
                    .filter(t => !t.vertical &&
                                 t.nx > drawingMinNx && t.nx < 0.88 &&
                                 t.ny >= winNyMax && t.ny < (isLandscape ? 0.55 : 0.80) &&
                                 /^\d{3,4}$/.test(t.text.trim()))
                    .map(t => ({ v: parseInt(t.text, 10), nx: t.nx, ny: t.ny }))
                    .filter(o => o.v >= 150 && o.v <= 1800 && o.v !== windowWidth);
                if (doorPw.length >= 2) {
                    const sorted = [...doorPw].sort((a, b) => a.nx - b.nx);
                    let localSplit = 0.5, maxGap = 0;
                    for (let i = 0; i < sorted.length - 1; i++) {
                        const gap = sorted[i + 1].nx - sorted[i].nx;
                        if (gap > maxGap) { maxGap = gap; localSplit = (sorted[i].nx + sorted[i + 1].nx) / 2; }
                    }
                    const refNx = rlFlex ? rlFlex.nx : localSplit;
                    const kayntiOnRight = refNx >= localSplit;
                    let kW = doorPw.filter(o => kayntiOnRight ? o.nx >= localSplit : o.nx < localSplit);
                    let lW = doorPw.filter(o => kayntiOnRight ? o.nx < localSplit : o.nx >= localSplit);
                    if (kW.length && lW.length) {
                        const refNy = lW[0].ny;
                        kW = kW.filter(o => Math.abs(o.ny - refNy) < 0.05);
                        if (kW.length) {
                            mainDoorWidth = Math.max(...kW.map(o => o.v));
                            sideDoorWidth = Math.max(...lW.map(o => o.v));
                            conf.mainDoorWidth = 'ok';
                            conf.sideDoorWidth = 'ok';
                            if (!String(calculator).includes('pariovi') && !String(calculator).includes('ikkuna')) {
                                calculator = family + '-pariovi';
                            }
                        }
                    }
                }
            }

            // Oven ruutukorkeus: R/L-ruudun SISÄLTÄ (lähin rlFlex.nx) — ei ulkokehystä 2090/2530
            const doorPhAll = norm
                .filter(t => t.vertical &&
                             t.nx > drawingMinNx && t.nx < 0.88 &&
                             t.ny >= winNyMax && t.ny < 0.78 &&
                             /^\d{3,4}$/.test(t.text.trim()))
                .map(t => ({ v: parseInt(t.text, 10), nx: t.nx }))
                .filter(o => o.v >= 800 && o.v <= 2500);
            let doorPh = doorPhAll;
            if (rlFlex) {
                doorPh = doorPhAll.filter(o => Math.abs(o.nx - rlFlex.nx) < 0.22);
                if (!doorPh.length) doorPh = doorPhAll;
                doorPh = doorPh.slice().sort((a, b) => Math.abs(a.nx - rlFlex.nx) - Math.abs(b.nx - rlFlex.nx));
            } else {
                doorPh = doorPhAll.slice().sort((a, b) => Math.abs(a.nx - ww.nx) - Math.abs(b.nx - ww.nx));
            }

            if (doorPh.length) {
                const doorPick = doorPh[0];
                paneHeight = doorPick.v;
                conf.paneHeight = 'ok';
                // Ikkunan korkeus: sama pystylinja kuin oven ruutu (yläikkuna)
                const whAligned = whCands
                    .filter(o => o.v !== Number(paneHeight) && o.v !== Number(kickPlateHeight))
                    .slice()
                    .sort((a, b) => Math.abs(a.nx - doorPick.nx) - Math.abs(b.nx - doorPick.nx));
                const wh = whAligned[0];
                if (wh && Math.abs(wh.nx - doorPick.nx) < 0.12) {
                    isDoorWindow = true;
                    windowHeight = wh.v;
                    windowCalculator = family + '-ikkuna';
                    conf.windowWidth = 'ok';
                    conf.windowHeight = 'ok';
                } else {
                    windowWidth = '';
                }
            } else {
                windowWidth = '';
            }
        }
    }

    return {
        calculator, gapOption, lasilistaSize,
        kickPlateEnabled, kickPlateHeight,
        mainDoorWidth, sideDoorWidth, paneHeight,
        paneCount, umpioviEnabled, umpivasikkaEnabled, sealThresholdEnabled,
        jobNumber, itemName, quantity, color,
        isDoorWindow, windowWidth, windowHeight, windowCalculator,
        conf
    };
}


function updateScanPaneInputs(count, heights) {
    let container = document.getElementById('scanPaneHeightInputs');
    if (!container) {
        container = document.createElement('div');
        container.className = 'row';
        container.id = 'scanPaneHeightInputs';
        const kickWrap = document.getElementById('scanKickHeightWrap');
        const measureRow = kickWrap && kickWrap.parentElement;
        if (measureRow && measureRow.parentElement) {
            measureRow.insertAdjacentElement('afterend', container);
        } else {
            const body = document.querySelector('#scanReviewCard .card-body');
            const prod = body && body.querySelector('.border-top');
            if (!body) return;
            if (prod) body.insertBefore(container, prod);
            else body.appendChild(container);
        }
    }
    const n = Math.max(1, Math.min(12, parseInt(count, 10) || 1));
    const vals = Array.isArray(heights) ? heights : [];
    container.innerHTML = '';
    for (let i = 1; i <= n; i++) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-3';
        const wrap = document.createElement('div');
        wrap.className = 'mb-3';
        const label = document.createElement('label');
        label.className = 'form-label';
        label.setAttribute('for', 'scanPaneHeight' + i);
        label.textContent = n === 1 ? 'Ruudun korkeus (mm)' : ('Ruutu ' + i + ' korkeus (mm)');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control';
        input.id = 'scanPaneHeight' + i;
        const hv = vals[i - 1];
        input.value = (hv == null || hv === '') ? '' : hv;
        input.addEventListener('input', () => calculateFromScanReview());
        wrap.appendChild(label);
        wrap.appendChild(input);
        col.appendChild(wrap);
        container.appendChild(col);
    }
}

function updateScanReviewVisibility() {
    const calc = document.getElementById('scanCalculator').value;
    const isPari = calc.includes('pariovi');
    const isWindow = calc.includes('ikkuna');
    const isDoor = !isWindow;
    const umpioviChecked = !!document.getElementById('scanUmpiovi')?.checked;
    const doorWindowOn = !!document.getElementById('scanDoorWindowMode')?.checked;

    const sideWrap = document.getElementById('scanSideWidthWrap');
    const gapWrap = document.getElementById('scanGapWrap');
    const mainLabel = document.getElementById('scanMainWidthLabel');
    const umpioviWrap = document.getElementById('scanUmpioviWrap');
    const umpivasikkaWrap = document.getElementById('scanUmpivasikkaWrap');
    const sealWrap = document.getElementById('scanSealThresholdWrap');
    const kickHeightWrap = document.getElementById('scanKickHeightWrap');
    const kickEnabled = !!document.getElementById('scanKickEnabled')?.checked;
    const doorSec = document.getElementById('scanDoorSectionLabel');
    const winSec = document.getElementById('scanWindowSection');
    const badge = document.getElementById('scanDoorWindowBadge');
    const winKickWrap = document.getElementById('scanWindowKickHeightWrap');
    const winKickOn = !!document.getElementById('scanWindowKickEnabled')?.checked;

    if (sideWrap) sideWrap.style.display = isPari ? '' : 'none';
    if (gapWrap) gapWrap.style.display = isWindow ? 'none' : '';
    if (mainLabel) mainLabel.textContent = isWindow ? 'Ruudun leveys' : 'Käyntioven leveys';
    if (umpioviWrap) umpioviWrap.style.display = isDoor ? '' : 'none';
    if (sealWrap) sealWrap.style.display = isDoor ? '' : 'none';
    if (umpivasikkaWrap) umpivasikkaWrap.style.display = (isPari && !umpioviChecked) ? '' : 'none';
    if (kickHeightWrap) kickHeightWrap.style.display = kickEnabled ? '' : 'none';
    if (doorSec) doorSec.style.display = doorWindowOn ? '' : 'none';
    if (winSec) winSec.style.display = doorWindowOn ? '' : 'none';
    if (badge) badge.style.display = doorWindowOn ? '' : 'none';
    if (winKickWrap) winKickWrap.style.display = (doorWindowOn && winKickOn) ? '' : 'none';
    syncScanWindowCalculatorFromDoor();
}

function showScanReview(parsed, canvas) {
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    const mark = (id, ok) => { const el = document.getElementById(id); if (el) el.classList.toggle('scan-uncertain', ok !== 'ok'); };

    if (canvas) showScanPdfPreview(canvas);

    setV('scanCalculator', parsed.calculator);
    setV('scanGap', String(parsed.gapOption));
    setV('scanMainWidth', parsed.mainDoorWidth);
    setV('scanSideWidth', parsed.sideDoorWidth);
    setV('scanKickHeight', parsed.kickPlateHeight);
    const _pc = parsed.paneCount || 1;
    const _ph = parsed.paneHeight;
    updateScanPaneInputs(_pc, Array.from({ length: _pc }, () => _ph));
    setV('scanJobNumber', parsed.jobNumber);
    setV('scanItemName', parsed.itemName);
    setV('scanQuantity', parsed.quantity || 1);
    setV('scanLasilistaSize', parsed.lasilistaSize);
    setV('scanColor', parsed.color);

    applyScanBatchJobLock(parsed.jobNumber);
    updateScanBatchActions();
    renderScanTransferQueue();

    const kickToggle = document.getElementById('scanKickEnabled');
    if (kickToggle) kickToggle.checked = parsed.kickPlateEnabled;

    setV('scanPaneCount', parsed.paneCount || 1);
    const umpioviEl = document.getElementById('scanUmpiovi');
    if (umpioviEl) umpioviEl.checked = !!parsed.umpioviEnabled;
    const umpivasikkaEl = document.getElementById('scanUmpivasikka');
    if (umpivasikkaEl) umpivasikkaEl.checked = !!parsed.umpivasikkaEnabled;
    const sealEl = document.getElementById('scanSealThreshold');
    if (sealEl) sealEl.checked = !!parsed.sealThresholdEnabled;

    const dwMode = document.getElementById('scanDoorWindowMode');
    if (dwMode) dwMode.checked = !!parsed.isDoorWindow;
    setV('scanWindowWidth', parsed.windowWidth || '');
    setV('scanWindowHeight', parsed.windowHeight || '');
    setV('scanWindowCalculator', parsed.windowCalculator || '');
    const winCalcLabel = document.getElementById('scanWindowCalculatorLabel');
    if (winCalcLabel) {
        winCalcLabel.textContent = parsed.windowCalculator
            ? getCalculatorLabel(parsed.windowCalculator)
            : '—';
    }
    const winKick = document.getElementById('scanWindowKickEnabled');
    if (winKick) winKick.checked = false;
    setV('scanWindowKickHeight', '');

    updateScanReviewVisibility();

    const isWindow = parsed.calculator.includes('ikkuna');
    const isPari = parsed.calculator.includes('pariovi');
    mark('scanCalculator', parsed.conf.calculator);
    mark('scanWindowWidth', parsed.conf && parsed.conf.windowWidth);
    mark('scanWindowHeight', parsed.conf && parsed.conf.windowHeight);
    mark('scanGap', isWindow ? 'ok' : parsed.conf.gapOption);
    mark('scanMainWidth', parsed.conf.mainDoorWidth);
    mark('scanSideWidth', isPari ? parsed.conf.sideDoorWidth : 'ok');
    mark('scanKickHeight', parsed.kickPlateEnabled ? parsed.conf.kickPlateHeight : 'ok');
    mark('scanPaneHeight1', parsed.conf.paneHeight);
    mark('scanPaneCount', parsed.conf.paneCount);
    const umpioviLabel = document.getElementById('scanUmpiovi')?.closest('.form-check');
    if (umpioviLabel) umpioviLabel.classList.toggle('scan-uncertain', isWindow ? false : parsed.conf.umpioviEnabled !== 'ok');
    const umpivasikkaLabel = document.getElementById('scanUmpivasikka')?.closest('.form-check');
    if (umpivasikkaLabel) umpivasikkaLabel.classList.toggle('scan-uncertain', parsed.conf.umpivasikkaEnabled !== 'ok');
    const sealLabel = document.getElementById('scanSealThreshold')?.closest('.form-check');
    if (sealLabel) sealLabel.classList.toggle('scan-uncertain', isWindow ? false : parsed.conf.sealThresholdEnabled !== 'ok');
    mark('scanJobNumber', parsed.conf.jobNumber);
    mark('scanItemName', parsed.conf.itemName);
    mark('scanLasilistaSize', parsed.conf.lasilistaSize);
    mark('scanColor', parsed.conf.color);

    const card = document.getElementById('scanReviewCard');
    if (card) card.style.display = '';
    const scrollTarget = document.getElementById('scanPdfPreview') || card;
    if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    calculateFromScanReview();
}

function applyScanResult() {
    if (isScanBatchMode()) {
        acceptScanToQueue();
        return;
    }
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const jobNumber = val('scanJobNumber');
    const itemName = val('scanItemName');
    const quantity = Math.max(1, Math.min(99, parseInt(val('scanQuantity'), 10) || 1));
    const rawSize = val('scanLasilistaSize');
    const color = normalizeLasilistaColor(val('scanColor') || '');

    if (!jobNumber) {
        showToast('Syötä työnumero ennen hyväksyntää.', 'warning');
        return;
    }
    if (!itemName) {
        showToast('Syötä oven / ikkunan nimi ennen hyväksyntää.', 'warning');
        return;
    }

    const isNoResultsTransferMode = !isScanDoorWindowMode() && isUmpioviNoResultsMode();
    if (!isNoResultsTransferMode && !rawSize) {
        showToast('Valitse lasilistojen koko ennen hyväksyntää.', 'warning');
        return;
    }
    const lasilistaSize = rawSize === 'ei-lasilistaa' ? '' : rawSize;

    let results;
    if (isScanDoorWindowMode()) {
        results = buildDoorWindowScanResults(lasilistaSize, color);
        if (!results || !(results.data || []).length) {
            showToast('Ei kelvollisia tuloksia siirrettäväksi. Tarkista syötteet.', 'warning');
            return;
        }
        applyScanReviewToCalculator();
    } else {
        applyScanReviewToCalculator();
        results = buildMittatResultsFromDom(lasilistaSize, color);
        const sections = document.getElementById('results')?.querySelectorAll('.result-section') || [];
        if (sections.length === 0 && !isNoResultsTransferMode) {
            showToast('Ei kelvollisia tuloksia siirrettäväksi. Tarkista syötteet.', 'warning');
            return;
        }
    }

    const saved = writeMittatItems(jobNumber, itemName, quantity, results, { silentMerge: false });
    syncMitatStateToFirestore();
    syncMitatInputsToFirestore();
    closeScanReview();
    const countLabel = quantity > 1 ? ` (${quantity} kpl)` : '';
    showToast(`Mitat siirretty: ${jobNumber} - ${itemName}${countLabel}`, 'success');
    if (typeof loadMittatView === 'function') {
        try { loadMittatView(); } catch (e) { /* ohitetaan */ }
    }
    console.log('✅ Skanneri: mitat tallennettu suoraan', { jobNumber, itemName, quantity, saved });
}

function closeScanReview() {
    const card = document.getElementById('scanReviewCard');
    if (card) card.style.display = 'none';
    clearScanPdfPreview();
    // Keskeytä jäljellä olevat PDF:t, säilytä siirtojono
    if (scanBatchActive) {
        scanBatchFiles = [];
        scanBatchActive = false;
        scanBatchIndex = 0;
        setScanBatchErrorActions(false);
        updateScanBatchActions();
        renderScanTransferQueue();
    }
    const jobEl = document.getElementById('scanJobNumber');
    if (jobEl) jobEl.readOnly = false;
    const warn = document.getElementById('scanJobMismatchWarn');
    if (warn) { warn.style.display = 'none'; warn.textContent = ''; }
    scanner_resetPanel();
}


function isScanDoorWindowMode() {
    return !!document.getElementById('scanDoorWindowMode')?.checked;
}

function windowCalculatorForDoor(doorCalc) {
    return String(doorCalc || '').startsWith('economy') ? 'economy-ikkuna' : 'janisol-ikkuna';
}

function syncScanWindowCalculatorFromDoor() {
    if (!isScanDoorWindowMode()) return;
    const doorCalc = document.getElementById('scanCalculator')?.value || '';
    const winCalc = windowCalculatorForDoor(doorCalc);
    const hidden = document.getElementById('scanWindowCalculator');
    if (hidden) hidden.value = winCalc;
    const label = document.getElementById('scanWindowCalculatorLabel');
    if (label) label.textContent = getCalculatorLabel(winCalc);
}

function readScanDoorSettings() {
    const gapVal = document.getElementById('scanGap')?.value;
    const gapOption = gapVal === 'saneeraus' ? 'saneeraus' : (parseInt(gapVal, 10) || 8);
    const kickEnabled = !!document.getElementById('scanKickEnabled')?.checked;
    const kickHeight = parseInt(document.getElementById('scanKickHeight')?.value, 10) || 0;
    const mainWidth = parseInt(document.getElementById('scanMainWidth')?.value, 10) || 0;
    const sideWidth = parseInt(document.getElementById('scanSideWidth')?.value, 10) || 0;
    const paneCount = Math.max(1, Math.min(12, parseInt(document.getElementById('scanPaneCount')?.value, 10) || 1));
    const umpioviEnabled = !!document.getElementById('scanUmpiovi')?.checked;
    const umpivasikkaEnabled = !!document.getElementById('scanUmpivasikka')?.checked;
    const sealEnabled = !!document.getElementById('scanSealThreshold')?.checked;
    const heightContainer = document.getElementById('scanPaneHeightInputs');
    const existingInputs = heightContainer
        ? Array.from(heightContainer.querySelectorAll('input[id^="scanPaneHeight"]'))
        : [];
    if (existingInputs.length !== paneCount) {
        const keepHeights = existingInputs.map(el => {
            const v = parseInt(el.value, 10);
            return Number.isFinite(v) ? v : '';
        });
        updateScanPaneInputs(paneCount, keepHeights);
    }
    const paneHeights = [];
    for (let i = 1; i <= paneCount; i++) {
        paneHeights.push(parseInt(document.getElementById('scanPaneHeight' + i)?.value, 10) || 0);
    }
    return {
        calc: document.getElementById('scanCalculator')?.value || '',
        gapOption, kickEnabled, kickHeight, mainWidth, sideWidth,
        paneCount, umpioviEnabled, umpivasikkaEnabled, sealEnabled, paneHeights
    };
}

function computeScanRawResults(calc, s) {
    const isWindow = calc.includes('ikkuna');
    const isUmpiovi = !isWindow && s.umpioviEnabled;
    const paneWidths = [s.mainWidth];
    if (isUmpiovi) return calculateUmpioviResults(s.mainWidth, calc.includes('pariovi') ? s.sideWidth : 0, s.kickHeight, calc);
    if (calc === 'janisol-pariovi') return calculateJanisolPariovi(s.mainWidth, s.sideWidth, s.kickHeight, s.paneHeights);
    if (calc === 'janisol-kayntiovi') return calculateJanisolKayntiovi(s.mainWidth, s.kickHeight, s.paneHeights);
    if (calc === 'janisol-ikkuna') return calculateJanisolIkkuna(paneWidths, s.paneHeights, s.kickEnabled ? s.kickHeight : 0, !!s.useYhdistettyLeveys);
    if (calc === 'economy-pariovi') return calculateEconomyPariovi(s.mainWidth, s.sideWidth, s.kickHeight, s.paneHeights);
    if (calc === 'economy-kayntiovi') return calculateEconomyKayntiovi(s.mainWidth, s.kickHeight, s.paneHeights);
    if (calc === 'economy-ikkuna') return calculateEconomyIkkuna(paneWidths, s.paneHeights, s.kickEnabled ? s.kickHeight : 0, !!s.useYhdistettyLeveys);
    return {};
}

function snapshotScanInputs(calc, s, opts) {
    const isWin = calc.includes('ikkuna');
    const paneHeights = (s.paneHeights || []).map(v => String(v || ''));
    const n = s.paneCount || paneHeights.length || 1;
    const paneWidths = [];
    for (let i = 0; i < n; i++) {
        paneWidths.push(isWin ? String(s.mainWidth || '') : '');
    }
    const out = {
        calculator: calc,
        mainDoorWidth: String(s.mainWidth || ''),
        sideDoorWidth: String(s.sideWidth || ''),
        kickPlateHeight: String(s.kickHeight || ''),
        gapOption: s.gapOption,
        paneCount: s.paneCount || 1,
        kickPlateEnabled: !!s.kickEnabled,
        sealThresholdEnabled: !!s.sealEnabled,
        umpioviEnabled: !!s.umpioviEnabled,
        umpivasikkaEnabled: !!s.umpivasikkaEnabled,
        formulaSet: localStorage.getItem('activeFormulaSet') || 'default',
        paneHeights,
        paneWidths
    };
    if (opts && opts.yhdistettyLeveys) out.yhdistettyLeveys = true;
    return out;
}

function buildDoorWindowScanResults(lasilistaSize, color) {
    const door = readScanDoorSettings();
    const winW = parseInt(document.getElementById('scanWindowWidth')?.value, 10) || 0;
    const winH = parseInt(document.getElementById('scanWindowHeight')?.value, 10) || 0;
    const winKickOn = !!document.getElementById('scanWindowKickEnabled')?.checked;
    const winKickH = parseInt(document.getElementById('scanWindowKickHeight')?.value, 10) || 0;
    const winCalc = windowCalculatorForDoor(door.calc);

    const prevCalc = currentCalculator;
    const prevSettings = { ...settings };
    try {
        currentCalculator = door.calc;
        settings = {
            ...prevSettings,
            gapOption: door.gapOption,
            paneCount: door.paneCount,
            kickPlateEnabled: door.kickEnabled,
            sealThresholdEnabled: door.sealEnabled,
            umpioviEnabled: door.umpioviEnabled,
            umpivasikkaEnabled: door.umpivasikkaEnabled
        };
        const doorRaw = computeScanRawResults(door.calc, door);
        const doorBlob = {
            calculator: door.calc,
            timestamp: new Date().toISOString(),
            lasilistaSize: lasilistaSize || '',
            lasilistaColor: color || '',
            metadataOnly: false,
            inputs: snapshotScanInputs(door.calc, door),
            data: formatResultToData(doorRaw, door.calc, { ...settings })
        };

        const winSettings = {
            mainWidth: winW,
            sideWidth: 0,
            kickEnabled: winKickOn,
            kickHeight: winKickH,
            paneCount: 1,
            paneHeights: [winH],
            gapOption: 8,
            umpioviEnabled: false,
            umpivasikkaEnabled: false,
            sealEnabled: false,
            useYhdistettyLeveys: winKickOn
        };
        currentCalculator = winCalc;
        settings = {
            ...prevSettings,
            gapOption: 8,
            paneCount: 1,
            kickPlateEnabled: winKickOn,
            sealThresholdEnabled: false,
            umpioviEnabled: false,
            umpivasikkaEnabled: false
        };
        const winRaw = computeScanRawResults(winCalc, winSettings);
        const winBlob = {
            calculator: winCalc,
            timestamp: new Date().toISOString(),
            lasilistaSize: lasilistaSize || '',
            lasilistaColor: color || '',
            metadataOnly: false,
            inputs: snapshotScanInputs(winCalc, winSettings, { yhdistettyLeveys: winKickOn }),
            data: formatResultToData(winRaw, winCalc, { ...settings })
        };
        return mergeResults(doorBlob, winBlob);
    } finally {
        currentCalculator = prevCalc;
        settings = prevSettings;
    }
}

function calculateFromScanReview() {
    const card = document.getElementById('scanReviewCard');
    if (!card || card.style.display === 'none') return;

    if (isScanDoorWindowMode()) {
        const door = readScanDoorSettings();
        if (!door.calc) return;
        if (door.mainWidth < 500) {
            document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Leveys ≥ 500 mm.</p>';
            return;
        }
        const winW = parseInt(document.getElementById('scanWindowWidth')?.value, 10) || 0;
        const winH = parseInt(document.getElementById('scanWindowHeight')?.value, 10) || 0;
        if (winW < 100 || winH < 100) {
            document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista ikkunan syötteet (leveys ja korkeus).</p>';
            return;
        }
        const merged = buildDoorWindowScanResults('', '');
        if (merged && merged.data) displayMergedResults(merged.data);
        return;
    }

    const calc = document.getElementById('scanCalculator')?.value;
    if (!calc) return;

    const gapVal = document.getElementById('scanGap')?.value;
    const gapOption = gapVal === 'saneeraus' ? 'saneeraus' : (parseInt(gapVal, 10) || 8);
    const kickEnabled = !!document.getElementById('scanKickEnabled')?.checked;
    const kickHeight  = parseInt(document.getElementById('scanKickHeight')?.value, 10) || 0;
    const mainWidth   = parseInt(document.getElementById('scanMainWidth')?.value, 10)  || 0;
    const sideWidth   = parseInt(document.getElementById('scanSideWidth')?.value, 10)  || 0;
    const paneCount   = Math.max(1, Math.min(12, parseInt(document.getElementById('scanPaneCount')?.value, 10) || 1));
    const umpioviEnabled     = !!document.getElementById('scanUmpiovi')?.checked;
    const umpivasikkaEnabled = !!document.getElementById('scanUmpivasikka')?.checked;
    const sealEnabled        = !!document.getElementById('scanSealThreshold')?.checked;

    const heightContainer = document.getElementById('scanPaneHeightInputs');
    const existingInputs = heightContainer
        ? Array.from(heightContainer.querySelectorAll('input[id^="scanPaneHeight"]'))
        : [];
    if (existingInputs.length !== paneCount) {
        const keepHeights = existingInputs.map(el => {
            const v = parseInt(el.value, 10);
            return Number.isFinite(v) ? v : '';
        });
        updateScanPaneInputs(paneCount, keepHeights);
    }

    const paneHeights = [];
    for (let i = 1; i <= paneCount; i++) {
        paneHeights.push(parseInt(document.getElementById('scanPaneHeight' + i)?.value, 10) || 0);
    }

    const prevCalc     = currentCalculator;
    const prevSettings = { ...settings };

    currentCalculator = calc;
    settings = {
        ...prevSettings,
        gapOption,
        paneCount,
        kickPlateEnabled: kickEnabled,
        sealThresholdEnabled: sealEnabled,
        umpioviEnabled,
        umpivasikkaEnabled
    };

    const isWindow  = calc.includes('ikkuna');
    const isUmpiovi = !isWindow && umpioviEnabled;
    const paneWidths  = [mainWidth];

    const restore = () => {
        currentCalculator = prevCalc;
        settings = prevSettings;
    };

    if (isUmpioviNoResultsMode()) {
        document.getElementById('results').innerHTML = '<p class="text-muted">Umpiovi + Tiivistekynnys ilman potkupeltiä: ei laskettavia mittoja.</p>';
        restore();
        return;
    }
    if (!isWindow && mainWidth < 500) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Leveys ≥ 500 mm.</p>';
        restore();
        return;
    }
    if (isWindow && paneCount === 1 && mainWidth < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Ruudun leveys ≥ 100 mm.</p>';
        restore();
        return;
    }
    if (kickEnabled && kickHeight < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Potkupellin korkeus ≥ 100 mm.</p>';
        restore();
        return;
    }

    let results = {};

    if      (calc === 'janisol-pariovi')   results = isUmpiovi ? calculateUmpioviResults(mainWidth, sideWidth, kickHeight, calc) : calculateJanisolPariovi(mainWidth, sideWidth, kickHeight, paneHeights);
    else if (calc === 'janisol-kayntiovi') results = isUmpiovi ? calculateUmpioviResults(mainWidth, 0, kickHeight, calc)         : calculateJanisolKayntiovi(mainWidth, kickHeight, paneHeights);
    else if (calc === 'janisol-ikkuna')    results = calculateJanisolIkkuna(paneWidths, paneHeights, kickEnabled ? kickHeight : 0);
    else if (calc === 'economy-pariovi')   results = isUmpiovi ? calculateUmpioviResults(mainWidth, sideWidth, kickHeight, calc) : calculateEconomyPariovi(mainWidth, sideWidth, kickHeight, paneHeights);
    else if (calc === 'economy-kayntiovi') results = isUmpiovi ? calculateUmpioviResults(mainWidth, 0, kickHeight, calc)         : calculateEconomyKayntiovi(mainWidth, kickHeight, paneHeights);
    else if (calc === 'economy-ikkuna')    results = calculateEconomyIkkuna(paneWidths, paneHeights, kickEnabled ? kickHeight : 0);

    displayResults(results);
    restore();
}
