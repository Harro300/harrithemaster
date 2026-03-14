// Global state
let currentCalculator = '';
let settings = {
    gapOption: 8,
    paneCount: 1,
    kickPlateEnabled: true,
    sealThresholdEnabled: false
};

// Firebase state
let firebaseInitialized = false;
let currentUser = null;
let isAdmin = false;
let isCoordinator = false;
let presetsUnsubscribe = null;
let checkedStatesUnsubscribe = null;
let formulaSetsUnsubscribe = null;
let mitatStateUnsubscribe = null;

// Admin email addresses
const ADMIN_EMAILS = [
    'admin@teras.fi',
    'admin@terasovi.local',
    'admin01@teras.local',
    'admin02@teras.local'
];
const COORDINATOR_EMAIL = 'koordinaattori@teras.fi';

// ========== UTILITY FUNCTIONS ==========

// Show toast notification
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
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${title}</div>` : ''}
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
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
    return email === COORDINATOR_EMAIL;
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
        mittatNotes: JSON.parse(localStorage.getItem('mittatNotes') || '{}')
    };
}

function applyMitatStateToLocalStorage(state) {
    localStorage.setItem('mittatData', JSON.stringify(state.mittatData || {}));
    localStorage.setItem('checkedMitat', JSON.stringify(state.checkedMitat || {}));
    localStorage.setItem('doneMitat', JSON.stringify(state.doneMitat || {}));
    localStorage.setItem('packedMitat', JSON.stringify(state.packedMitat || {}));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(state.packedPackageNumbers || {}));
    localStorage.setItem('mittatNotes', JSON.stringify(state.mittatNotes || {}));
}

async function syncMitatStateToFirestore() {
    if (!window.firebase || !window.firebase.db || !currentUser) {
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
    if (!window.firebase || !window.firebase.db) {
        console.warn('⚠️ Firebase ei ole saatavilla, käytetään vain localStoragea');
        return;
    }
    
    const { db, collection, onSnapshot, doc } = window.firebase;
    
    console.log('🎧 Aloitetaan reaaliaikainen kuuntelu...');
    
    // LISTENER 1: Presets collection
    try {
        let isFirstLoad = true;
        presetsUnsubscribe = onSnapshot(
            collection(db, 'presets'),
            (snapshot) => {
                console.log('🔔 Esiasetukset päivitetty!');
                
                // Update localStorage backup
                const presets = {};
                snapshot.forEach((doc) => {
                    presets[doc.data().name || doc.id] = {
                        ...doc.data(),
                        _firestoreId: doc.id
                    };
                });
                localStorage.setItem('doorPresets', JSON.stringify(presets));
                
                // Refresh UI if preset dialog is open
                const presetModal = document.getElementById('loadPresetModal');
                if (presetModal && presetModal.classList.contains('show')) {
                    refreshPresetList();
                }
                
                // Show toast (but not on first load)
                if (!isFirstLoad) {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === "added") {
                            showToast(`Uusi esiasetus: ${change.doc.data().name}`, 'info');
                        } else if (change.type === "removed") {
                            showToast(`Esiasetus poistettu`, 'info');
                        }
                    });
                }
                isFirstLoad = false;
            },
            (error) => {
                console.error('❌ Presets-kuunteluvirhe:', error);
                updateSyncStatus(false);
                showToast('Synkronointivirhe, käytetään offline-tilaa', 'warning');
            }
        );
    } catch (error) {
        console.error('❌ Virhe presets-kuuntelijan luonnissa:', error);
    }
    
    // LISTENER 2: Checked states document
    try {
        checkedStatesUnsubscribe = onSnapshot(
            doc(db, 'checkedStates', 'global'),
            (docSnapshot) => {
                if (docSnapshot.exists()) {
                    console.log('🔔 Checkbox-tilat päivitetty!');
                    
                    const checks = docSnapshot.data().checks || {};
                    localStorage.setItem('checkedPresets', JSON.stringify(checks));
                    
                    // Update UI if preset list is visible
                    const presetModal = document.getElementById('loadPresetModal');
                    if (presetModal && presetModal.classList.contains('show')) {
                        refreshPresetList();
                    }
                }
            },
            (error) => {
                console.error('❌ CheckedStates-kuunteluvirhe:', error);
            }
        );
    } catch (error) {
        console.error('❌ Virhe checkedStates-kuuntelijan luonnissa:', error);
    }
    
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
                    mittatNotes: data.mittatNotes || {}
                });

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
                    loadPaketitView();
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
    
    console.log('✅ Reaaliaikaiset kuuntelijat aktivoitu!');
}

// Stop realtime listeners
function stopRealtimeListeners() {
    console.log('🛑 Lopetetaan reaaliaikaiset kuuntelijat...');
    
    if (presetsUnsubscribe) {
        presetsUnsubscribe();
        presetsUnsubscribe = null;
    }
    
    if (checkedStatesUnsubscribe) {
        checkedStatesUnsubscribe();
        checkedStatesUnsubscribe = null;
    }
    
    if (formulaSetsUnsubscribe) {
        formulaSetsUnsubscribe();
        formulaSetsUnsubscribe = null;
    }

    if (mitatStateUnsubscribe) {
        mitatStateUnsubscribe();
        mitatStateUnsubscribe = null;
    }
    
    console.log('✅ Kuuntelijat lopetettu');
}

// Dark mode initialization
document.addEventListener('DOMContentLoaded', function() {
    // Load dark mode preference
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) toggle.checked = true;
    }
    
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
    
    // Initialize Firebase Auth listener
    initializeFirebaseAuth();
    
    // Update settings info display
    updateSettingsInfo();
});

// Valid passwords
const VALID_PASSWORDS = ['Soma<3', '1234'];

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
        
        // Hide login screen
        console.log('🔵 Piilotetaan loginScreen...');
        document.getElementById('loginScreen').classList.add('d-none');
        
        // Update sync status
        updateSyncStatus(true);
        
        // Setup realtime listeners
        setupRealtimeListeners();

        // Coordinator sees only Mitat view
        if (isCoordinator) {
            console.log('🔵 Koordinaattori: avataan vain Mitat-näkymä');
            switchView('mitat');
        } else {
            // Show calculator screen
            console.log('🔵 Näytetään calculatorScreen...');
            document.getElementById('calculatorScreen').classList.remove('d-none');
            console.log('✅ Näyttö vaihdettu!');
            
            // Select default calculator
            console.log('🔵 Valitaan default-laskuri...');
            selectCalculator('janisol-pariovi');
        }
        
        // Show welcome toast
        showToast(`Tervetuloa${isAdmin ? ' Admin' : ''}!`, 'success');
        console.log('✅ Kirjautuminen valmis!');
        
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
function selectCalculator(type) {
    currentCalculator = type;
    
    // Update button states
    const buttons = document.querySelectorAll('.btn-group .btn-outline-primary');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${type}`).classList.add('active');
    
    const isWindowCalculator = type.includes('ikkuna');
    
    // Show/hide side door input
    const sideDoorContainer = document.getElementById('sideDoorWidthContainer');
    if (type.includes('pariovi')) {
        sideDoorContainer.style.display = 'block';
    } else {
        sideDoorContainer.style.display = 'none';
    }
    
    // For window calculators, change label text and adjust layout
    const mainDoorInput = document.getElementById('mainDoorWidth');
    const mainDoorLabel = document.getElementById('mainDoorWidthLabel');
    
    if (mainDoorInput && mainDoorLabel) {
        if (isWindowCalculator) {
            mainDoorLabel.textContent = 'Ruudun leveys (mm)';
            mainDoorInput.value = '800';  // Default window width
            mainDoorInput.min = '100';
        } else {
            mainDoorLabel.textContent = 'Käyntioven leveys (mm)';
            mainDoorInput.value = '795';  // Default door width
            mainDoorInput.min = '500';
        }
    }
    
    // Settings button is always visible now (windows also have settings)
    
    // For window calculators with multiple panes, hide the main width input
    const mainWidthContainer = document.getElementById('mainDoorWidthContainer');
    if (mainWidthContainer) {
        if (isWindowCalculator && settings.paneCount > 1) {
            mainWidthContainer.style.display = 'none';
        } else {
            mainWidthContainer.style.display = '';
        }
    }
    
    // Reset settings (but keep kick plate and seal threshold toggles)
    const savedKickPlateEnabled = localStorage.getItem('kickPlateEnabled');
    const kickPlateEnabled = savedKickPlateEnabled !== null ? savedKickPlateEnabled === 'true' : true;
    const savedSealThresholdEnabled = localStorage.getItem('sealThresholdEnabled');
    const sealThresholdEnabled = savedSealThresholdEnabled !== null ? savedSealThresholdEnabled === 'true' : false;
    
    settings = {
        gapOption: 8,
        paneCount: 1,
        kickPlateEnabled: kickPlateEnabled,
        sealThresholdEnabled: sealThresholdEnabled
    };
    document.getElementById('gapOption').value = '8';
    document.getElementById('paneCount').value = '1';
    
    // Update kick plate toggle state
    const kickPlateToggle = document.getElementById('kickPlateToggle');
    if (kickPlateToggle) {
        kickPlateToggle.checked = kickPlateEnabled;
    }
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) {
        sealThresholdToggle.checked = sealThresholdEnabled;
    }
    
    // Update kick plate visibility (hide for windows)
    const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
    if (kickPlateContainer) {
        if (isWindowCalculator) {
            kickPlateContainer.style.display = 'none';
        } else {
            kickPlateContainer.style.display = kickPlateEnabled ? '' : 'none';
        }
    }
    
    updatePaneInputs();
    updateSettingsInfo();
    
    // Calculate initial results
    calculate();
}

// Open settings modal
function openSettings() {
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    
    // Update dark mode toggle state
    const darkModeToggle = document.getElementById('darkModeToggle');
    darkModeToggle.checked = document.body.classList.contains('dark-mode');
    
    // Update kick plate toggle state
    const kickPlateToggle = document.getElementById('kickPlateToggle');
    if (kickPlateToggle) {
        kickPlateToggle.checked = settings.kickPlateEnabled !== false;
    }
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) {
        sealThresholdToggle.checked = settings.sealThresholdEnabled === true;
    }
    
    // Hide rako, kick plate and seal threshold settings for window calculators
    const gapOptionSetting = document.getElementById('gapOptionSetting');
    const kickPlateSetting = document.getElementById('kickPlateSetting');
    const sealThresholdSetting = document.getElementById('sealThresholdSetting');
    
    if (gapOptionSetting) {
        gapOptionSetting.style.display = isWindowCalculator ? 'none' : '';
    }
    if (kickPlateSetting) {
        kickPlateSetting.style.display = isWindowCalculator ? 'none' : '';
    }
    if (sealThresholdSetting) {
        sealThresholdSetting.style.display = isWindowCalculator ? 'none' : '';
    }

    // Keep formula set options and selection in sync for all users
    loadFormulaSetsList();
    
    modal.show();
}

// Toggle dark mode
function toggleDarkMode() {
    const isDark = document.getElementById('darkModeToggle').checked;
    
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'false');
    }
}

// Update settings info display
function updateSettingsInfo() {
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    const gapSettingEl = document.getElementById('currentGapSetting');
    const formulaSetEl = document.getElementById('currentFormulaSet');
    const settingsInfoEl = document.getElementById('currentSettingsInfo');
    
    if (!settingsInfoEl) return;
    
    // Hide for window calculators (no gap setting)
    if (isWindowCalculator) {
        settingsInfoEl.style.visibility = 'hidden';
    } else {
        settingsInfoEl.style.visibility = 'visible';
        
        // Update gap setting text
        if (gapSettingEl) {
            let gapText = '';
            if (settings.gapOption === 'saneeraus') {
                gapText = 'Saneerauskynnys';
            } else {
                gapText = `${settings.gapOption} mm rako`;
            }
            gapSettingEl.textContent = gapText;
        }
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
    
    // Save settings to localStorage
    localStorage.setItem('kickPlateEnabled', settings.kickPlateEnabled);
    localStorage.setItem('sealThresholdEnabled', settings.sealThresholdEnabled);
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    
    // Show/hide kick plate height input (always hide for window calculators)
    const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
    if (kickPlateContainer) {
        if (isWindowCalculator) {
            kickPlateContainer.style.display = 'none'; // Always hide for windows
        } else {
            kickPlateContainer.style.display = settings.kickPlateEnabled ? '' : 'none';
        }
    }
    
    // For window calculators with multiple panes, hide the main width input
    const mainWidthContainer = document.getElementById('mainDoorWidthContainer');
    if (mainWidthContainer) {
        if (isWindowCalculator && settings.paneCount > 1) {
            mainWidthContainer.style.display = 'none';
        } else {
            mainWidthContainer.style.display = '';
        }
    }
    
    updatePaneInputs();
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
    
    // For window calculators with multiple panes, show width + height for each
    if (isWindowCalculator && settings.paneCount > 1) {
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
    
    const paneHeights = [];
    const paneWidths = [];
    
    // For window calculators with multiple panes, collect widths and heights
    if (isWindowCalculator && settings.paneCount > 1) {
        for (let i = 1; i <= settings.paneCount; i++) {
            const width = parseInt(document.getElementById(`paneWidth${i}`).value) || 0;
            const height = parseInt(document.getElementById(`paneHeight${i}`).value) || 0;
            paneWidths.push(width);
            paneHeights.push(height);
        }
    } else {
        // For doors or single pane windows, collect heights only
        for (let i = 1; i <= settings.paneCount; i++) {
            const height = parseInt(document.getElementById(`paneHeight${i}`).value) || 0;
            paneHeights.push(height);
        }
        // For single pane windows, use mainDoorWidth as the only width
        if (isWindowCalculator) {
            paneWidths.push(mainDoorWidth);
        }
    }
    
    // Validate inputs
    if (!isWindowCalculator && mainDoorWidth < 500) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Leveys ≥ 500 mm.</p>';
        return;
    }
    
    if (isWindowCalculator && settings.paneCount === 1 && mainDoorWidth < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Ruudun leveys ≥ 100 mm.</p>';
        return;
    }
    
    if (!isWindowCalculator && settings.kickPlateEnabled && kickPlateHeight < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Potkupellin korkeus ≥ 100 mm.</p>';
            return;
    }
    
    let results = {};
    
    // Calculate based on calculator type
    if (currentCalculator === 'janisol-pariovi') {
        results = calculateJanisolPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'janisol-kayntiovi') {
        results = calculateJanisolKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'janisol-ikkuna') {
        results = calculateJanisolIkkuna(paneWidths, paneHeights);
    } else if (currentCalculator === 'economy-pariovi') {
        results = calculateEconomyPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-kayntiovi') {
        results = calculateEconomyKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-ikkuna') {
        results = calculateEconomyIkkuna(paneWidths, paneHeights);
    }
    
    displayResults(results);
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

// Calculate Janisol Pariovi
function calculateJanisolPariovi(mainWidth, sideWidth, kickHeight, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas
    const formulas = getActiveFormulas();
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
    paneHeights.forEach(height => {
        const verticalLength = height + jf.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth + jf.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = sideWidth + jf.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat (Urethane pieces)
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(jf, jf.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + jf.uretaani_leveys}`);
        results.uretaani.push(`${uretaaniHeight} x ${sideWidth + jf.uretaani_leveys}`);
        
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
    const sideInnerWidth = sideWidth + jf.potku_lisa_sisa_leveys;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    let sideOuterWidth = sideWidth + jf.potku_lisa_ulko_leveys;
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
    const formulas = getActiveFormulas();
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
    const formulas = getActiveFormulas();
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
    paneHeights.forEach(height => {
        const verticalLength = height + ef.lasilista_pysty;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth + ef.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = sideWidth + ef.lasilista_vaaka;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Only calculate kick plates and urethane if enabled
    if (settings.kickPlateEnabled) {
        // Uretaanipalat
        const uretaaniHeightAdjust = getUretaaniHeightAdjust(ef, ef.uretaani_korkeus);
        const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
        results.uretaani.push(`${uretaaniHeight} x ${mainWidth + ef.uretaani_leveys}`);
        results.uretaani.push(`${uretaaniHeight} x ${sideWidth + ef.uretaani_leveys}`);
        
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
    const sideInnerWidth = sideWidth + ef.potku_lisa_sisa_leveys;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    let sideOuterWidth = sideWidth + ef.potku_lisa_ulko_leveys;
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
    const formulas = getActiveFormulas();
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
function calculateJanisolIkkuna(paneWidths, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas (use Janisol Ikkuna formulas)
    const formulas = getActiveFormulas();
    const jif = formulas.janisol_ikkuna;
    
    // Lasilistat - Use Janisol Ikkuna formulas
    paneHeights.forEach((height, index) => {
        const width = paneWidths[index] || paneWidths[0]; // Use first width if not specified
        
        // 2 vertical strips per pane
        const verticalLength = height + jif.lasilista_pysty;  // height + 41mm (default)
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = width + jif.lasilista_vaaka;  // width + 3mm (default)
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    return results;
}

// Calculate Economy Ikkuna (Windows only - glass strips only)
function calculateEconomyIkkuna(paneWidths, paneHeights) {
    const results = {
        lasilista: [],
        uretaani: [],
        potkupelti: [],
        harjalista: []
    };
    
    // Get formulas (use Economy Ikkuna formulas)
    const formulas = getActiveFormulas();
    const eif = formulas.economy_ikkuna;
    
    // Lasilistat - Use Economy Ikkuna formulas
    paneHeights.forEach((height, index) => {
        const width = paneWidths[index] || paneWidths[0]; // Use first width if not specified
        
        // 2 vertical strips per pane
        const verticalLength = height + eif.lasilista_pysty;  // height + 38mm (default)
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = width + eif.lasilista_vaaka;  // width - 2mm (default)
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    return results;
}

function isLasilistaSectionTitle(title) {
    return String(title || '').trim().toLowerCase().startsWith('lasilista');
}

function getLasilistaSectionTitle(sectionTitle, itemData) {
    const originalTitle = String(sectionTitle || '').trim();
    if (!isLasilistaSectionTitle(originalTitle)) {
        return originalTitle;
    }

    // Keep explicit size in old/custom data as-is (e.g. "Lasilista 12mm").
    if (/^lasilista\s+\d+\s*mm$/i.test(originalTitle)) {
        return originalTitle;
    }

    const size = String(itemData?.lasilistaSize || '').trim();
    return size ? `Lasilista ${size}` : 'Lasilista';
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
    let html = '<div class="row">';
    
    // Lasilista
    html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Lasilista</h5>';
    const combinedLasilista = combineResults(results.lasilista);
    combinedLasilista.forEach(item => {
        html += `<div class="result-item">${item}</div>`;
    });
    html += '</div></div>';
    
    // For window calculators, only show glass strips
    if (!isWindowCalculator) {
        // Uretaani (only show if kick plates are enabled)
        if (settings.kickPlateEnabled && results.uretaani.length > 0) {
            html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Uretaani</h5>';
            results.uretaani.forEach(item => {
                html += `<div class="result-item">${item}</div>`;
            });
            html += '</div></div>';
        }
        
        // Potkupelti (only show if kick plates are enabled)
        if (settings.kickPlateEnabled && results.potkupelti.length > 0) {
            html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Potkupelti</h5>';
            results.potkupelti.forEach(item => {
                html += `<div class="result-item">${item}</div>`;
            });
            html += '</div></div>';
        }
        
        // Harjalista (hidden when seal threshold is enabled)
        if (!settings.sealThresholdEnabled) {
            html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Harjalista</h5>';
            results.harjalista.forEach(item => {
                html += `<div class="result-item">${item}</div>`;
            });
            html += '</div></div>';
        }
    }
    
    html += '</div>';
    resultsDiv.innerHTML = html;
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

// Save preset
function savePreset() {
    const modal = new bootstrap.Modal(document.getElementById('savePresetModal'));
    document.getElementById('presetName').value = '';
    document.getElementById('presetMessage').value = '';
    modal.show();
}

async function confirmSavePreset() {
    const name = document.getElementById('presetName').value.trim();
    if (!name) {
        alert('Anna nimi esiasetukselle.');
        return;
    }
    
    // Check if preset with this name already exists (in localStorage for now)
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    if (presets[name]) {
        alert(`Esiasetus nimellä "${name}" on jo olemassa. Valitse toinen nimi.`);
        return;
    }
    
    const message = document.getElementById('presetMessage')?.value.trim() || '';
    
    const preset = {
        name: name,
        calculator: currentCalculator,
        mainDoorWidth: parseInt(document.getElementById('mainDoorWidth').value),
        sideDoorWidth: parseInt(document.getElementById('sideDoorWidth').value),
        kickPlateHeight: parseInt(document.getElementById('kickPlateHeight').value),
        settings: { ...settings },
        paneHeights: [],
        paneWidths: [],
        message: message
    };
    
    // Save pane heights and widths
    for (let i = 1; i <= settings.paneCount; i++) {
        const heightEl = document.getElementById(`paneHeight${i}`);
        if (heightEl) preset.paneHeights.push(parseInt(heightEl.value));
        
        const widthEl = document.getElementById(`paneWidth${i}`);
        if (widthEl) preset.paneWidths.push(parseInt(widthEl.value));
    }
    
    // Close modal first
    const modal = bootstrap.Modal.getInstance(document.getElementById('savePresetModal'));
    modal.hide();
    
    // Try to save to Firestore
    if (window.firebase && window.firebase.db && currentUser) {
        try {
            const { db, collection, addDoc, serverTimestamp } = window.firebase;
            
            const presetWithMetadata = {
                ...preset,
                createdBy: currentUser.email,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            const docRef = await addDoc(collection(db, 'presets'), presetWithMetadata);
            console.log('✅ Esiasetus tallennettu Firestoreen:', docRef.id);
            
            // Also save to localStorage as backup
            presets[name] = { ...preset, _firestoreId: docRef.id };
            localStorage.setItem('doorPresets', JSON.stringify(presets));
            
            showToast(`Esiasetus "${name}" tallennettu!`, 'success');
            
        } catch (error) {
            console.error('❌ Firestore-tallennusvirhe:', error);
            
            // Fallback to localStorage only
    presets[name] = preset;
    localStorage.setItem('doorPresets', JSON.stringify(presets));
    
            showToast('Tallennettu paikallisesti (offline)', 'warning');
        }
    } else {
        // Firebase not available, use localStorage only
        presets[name] = preset;
        localStorage.setItem('doorPresets', JSON.stringify(presets));
        
        showToast('Tallennettu paikallisesti', 'success');
    }
}

// Load preset dialog
async function loadPresetDialog() {
    const modal = new bootstrap.Modal(document.getElementById('loadPresetModal'));
    const listDiv = document.getElementById('presetList');
    
    // Show loading indicator
    listDiv.innerHTML = '<div class="p-3 text-center"><div class="loading-spinner"></div><p class="mt-2">Ladataan...</p></div>';
    modal.show();
    
    // Try to fetch from Firestore
    if (window.firebase && window.firebase.db && currentUser) {
        try {
            const { db, collection, getDocs } = window.firebase;
            const querySnapshot = await getDocs(collection(db, 'presets'));
            
            // Update localStorage with fresh data
            const presets = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                presets[data.name || doc.id] = {
                    ...data,
                    _firestoreId: doc.id
                };
            });
            localStorage.setItem('doorPresets', JSON.stringify(presets));
            
            console.log('✅ Esiasetukset ladattu Firestoresta');
            
        } catch (error) {
            console.error('❌ Virhe ladattaessa Firestoresta:', error);
            showToast('Käytetään paikallisia tietoja', 'warning');
        }
    }
    
    // Refresh the list (from localStorage)
    refreshPresetList();
}

function loadPresetFromList(name) {
    loadPreset(name);
}

async function togglePresetCheck(name, event) {
    event.stopPropagation();
    
    // Optimistic UI update - update localStorage immediately
    const checkedPresets = JSON.parse(localStorage.getItem('checkedPresets') || '{}');
    checkedPresets[name] = !checkedPresets[name];
    localStorage.setItem('checkedPresets', JSON.stringify(checkedPresets));
    refreshPresetList(); // Refresh UI immediately
    
    // Try to sync to Firestore
    if (window.firebase && window.firebase.db && currentUser) {
        try {
            const { db, doc, setDoc, getDoc } = window.firebase;
            const docRef = doc(db, 'checkedStates', 'global');
            
            // Get current document or create new object
            const docSnap = await getDoc(docRef);
            const currentChecks = docSnap.exists() ? (docSnap.data().checks || {}) : {};
            
            // Update the specific preset check
            currentChecks[name] = checkedPresets[name];
            
            // Save back to Firestore
            await setDoc(docRef, {
                checks: currentChecks,
                updatedAt: window.firebase.serverTimestamp()
            });
            
            console.log('✅ Checkbox-tila synkronoitu Firestoreen');
            
        } catch (error) {
            console.error('❌ Virhe checkbox-tilan synkronoinnissa:', error);
            // Don't show error toast, localStorage update already happened
        }
    }
}

function refreshPresetList() {
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    const listDiv = document.getElementById('presetList');
    
    if (Object.keys(presets).length === 0) {
        listDiv.innerHTML = '<p class="text-muted p-3">Ei tallennettuja esiasetuksia.</p>';
    } else {
        listDiv.innerHTML = '';
        Object.keys(presets).forEach(name => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            const preset = presets[name];
            const hasMessage = preset.message && preset.message.trim() !== '';
            
            // Escape single quotes in name and message for onclick attributes
            const escapedName = name.replace(/'/g, "\\'");
            const escapedMessage = hasMessage ? preset.message.replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';
            
            const messageIcon = hasMessage ? 
                `<span onclick="showPresetMessage('${escapedMessage}', event)" style="cursor: pointer; font-size: 1.2rem;" title="Näytä viesti">💬</span>` : '';
            
            item.innerHTML = `
                <div class="d-flex align-items-center gap-2 flex-grow-1">
                    <span class="preset-name" onclick="loadPresetFromList('${escapedName}')" style="cursor: pointer;">${name}</span>
                    ${messageIcon}
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-danger" onclick="deletePreset('${escapedName}', event)">🗑️</button>
                </div>
            `;
            listDiv.appendChild(item);
        });
    }
    }
    
function showPresetMessage(message, event) {
    event.stopPropagation();
    alert(message);
}

function loadPreset(name) {
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    const preset = presets[name];
    
    if (!preset) return;
    
    // If calculator doesn't match, switch to the correct one automatically
    if (preset.calculator !== currentCalculator) {
        selectCalculator(preset.calculator);
    }
    
    const isWindowCalculator = currentCalculator.includes('ikkuna');
    
    // Load values
    document.getElementById('mainDoorWidth').value = preset.mainDoorWidth;
    document.getElementById('sideDoorWidth').value = preset.sideDoorWidth;
    document.getElementById('kickPlateHeight').value = preset.kickPlateHeight;
    
    // Apply settings from preset
    settings = { ...preset.settings };
    if (settings.sealThresholdEnabled === undefined) {
        settings.sealThresholdEnabled = false;
    }
    document.getElementById('gapOption').value = settings.gapOption;
    document.getElementById('paneCount').value = settings.paneCount;
    
    // Update kick plate toggle state
    const kickPlateToggle = document.getElementById('kickPlateToggle');
    if (kickPlateToggle) {
        kickPlateToggle.checked = settings.kickPlateEnabled;
    }
    const sealThresholdToggle = document.getElementById('sealThresholdToggle');
    if (sealThresholdToggle) {
        sealThresholdToggle.checked = settings.sealThresholdEnabled === true;
    }
    localStorage.setItem('kickPlateEnabled', settings.kickPlateEnabled); // Ensure localStorage is updated
    localStorage.setItem('sealThresholdEnabled', settings.sealThresholdEnabled === true);
    
    applySettings(); // Apply all settings, which also calls updatePaneInputs and calculate
    
    // Ensure kick plate field is hidden for window calculators (double-check)
    const kickPlateContainer = document.getElementById('kickPlateHeightContainer');
    if (kickPlateContainer && isWindowCalculator) {
        kickPlateContainer.style.display = 'none';
    }
    
    // Load pane heights and widths
    if (isWindowCalculator && settings.paneCount > 1) {
        // For multi-pane windows, load both width and height
        preset.paneHeights.forEach((height, i) => {
            const heightEl = document.getElementById(`paneHeight${i + 1}`);
            if (heightEl) heightEl.value = height;
            const widthEl = document.getElementById(`paneWidth${i + 1}`);
            if (widthEl && preset.paneWidths && preset.paneWidths[i]) {
                widthEl.value = preset.paneWidths[i];
            }
        });
    } else {
        // For single pane or doors, just load pane heights
        preset.paneHeights.forEach((height, i) => {
            const el = document.getElementById(`paneHeight${i + 1}`);
            if (el) el.value = height;
        });
    }
    
    calculate(); // Recalculate after all values are loaded
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('loadPresetModal'));
    modal.hide();
}

async function deletePreset(name, event) {
    event.preventDefault();
    event.stopPropagation();
    
    // Check if user is admin
    if (!isAdmin) {
        showToast('Vain admin-käyttäjät voivat poistaa esiasetuksia', 'error');
        return;
    }
    
    if (!confirm(`Haluatko varmasti poistaa esiasetuksen "${name}"?`)) {
        return;
    }
    
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    const presetData = presets[name];
    const firestoreId = presetData?._firestoreId;
    
    // Delete from localStorage
    delete presets[name];
    localStorage.setItem('doorPresets', JSON.stringify(presets));
    
    // Also remove from checked presets
    const checkedPresets = JSON.parse(localStorage.getItem('checkedPresets') || '{}');
    delete checkedPresets[name];
    localStorage.setItem('checkedPresets', JSON.stringify(checkedPresets));
    
    // Refresh UI immediately (optimistic update)
    refreshPresetList();
    
    // Try to delete from Firestore
    if (window.firebase && window.firebase.db && firestoreId) {
        try {
            const { db, doc, deleteDoc } = window.firebase;
            await deleteDoc(doc(db, 'presets', firestoreId));
            
            console.log('✅ Esiasetus poistettu Firestoresta');
            showToast(`Esiasetus "${name}" poistettu`, 'success');
            
        } catch (error) {
            console.error('❌ Virhe Firestore-poistossa:', error);
            showToast('Poistettu paikallisesti (synkronointivirhe)', 'warning');
        }
    } else {
        showToast(`Esiasetus "${name}" poistettu`, 'success');
    }
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
        'economy-ikkuna': 'Economy Ikkuna'
    };
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    
    let text = 'Harrin Teräsovi Mittalaskuri\n';
    text += titles[currentCalculator] + '\n';
    text += '='.repeat(40) + '\n\n';
    
    // Add inputs
    text += 'Syötteet:\n';
    
    if (isWindowCalculator) {
        text += `Ruudun leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
    } else {
        text += `Käyntioven leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
        
        if (currentCalculator.includes('pariovi')) {
            text += `Lisäoven leveys: ${document.getElementById('sideDoorWidth').value} mm\n`;
        }
        
        text += `Potkupellin korkeus: ${document.getElementById('kickPlateHeight').value} mm\n`;
    }
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            text += `Ruutu ${i} korkeus: ${el.value} mm\n`;
        }
    }
    
    if (!isWindowCalculator) {
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

function showAdminPanelView() {
    if (!isAdmin) {
        return;
    }

    // Show the admin panel overlay
    document.getElementById('adminPanelOverlay').classList.remove('d-none');
    // Load current formulas
    loadFormulasToPanel();
}

function closeAdminPanel() {
    document.getElementById('adminPanelOverlay').classList.add('d-none');
}

function toggleAdminAccordion(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.admin-accordion-icon');
    
    content.classList.toggle('active');
    if (content.classList.contains('active')) {
        icon.style.transform = 'rotate(180deg)';
    } else {
        icon.style.transform = 'rotate(0deg)';
    }
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
            tiiviste_potku_outer_saneeraus: 0
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
            tiiviste_potku_outer_saneeraus: 0
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
            tiiviste_potku_outer_saneeraus: 0
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
            tiiviste_potku_outer_saneeraus: 0
        },
        janisol_ikkuna: {
            lasilista_pysty: 41,
            lasilista_vaaka: 3
        },
        economy_ikkuna: {
            lasilista_pysty: 38,
            lasilista_vaaka: -2
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
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('janisol_pariovi_tiiviste_potku_outer_saneeraus').value)
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
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_tiiviste_potku_outer_saneeraus').value)
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
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('economy_pariovi_tiiviste_potku_outer_saneeraus').value)
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
            tiiviste_potku_outer_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_tiiviste_potku_outer_saneeraus').value)
        },
        janisol_ikkuna: {
            lasilista_pysty: parseFloat(document.getElementById('janisol_ikkuna_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('janisol_ikkuna_lasilista_vaaka').value)
        },
        economy_ikkuna: {
            lasilista_pysty: parseFloat(document.getElementById('economy_ikkuna_lasilista_pysty').value),
            lasilista_vaaka: parseFloat(document.getElementById('economy_ikkuna_lasilista_vaaka').value)
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
        'economy-ikkuna': 'Economy Ikkuna'
    };
    
    const isWindowCalculator = currentCalculator && currentCalculator.includes('ikkuna');
    
    doc.setFontSize(18);
    doc.text('Harrin Teräsovi Mittalaskuri', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(titles[currentCalculator], 105, 30, { align: 'center' });
    
    // Add user-provided name
    doc.setFontSize(12);
    doc.text(fileName, 105, 38, { align: 'center' });
    
    // Inputs
    doc.setFontSize(12);
    let yPos = 50;
    
    doc.text('Syötteet:', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    
    if (isWindowCalculator) {
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
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            doc.text(`Ruutu ${i} korkeus: ${el.value} mm`, 25, yPos);
            yPos += 7;
        }
    }
    
    if (!isWindowCalculator) {
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

// Open transfer modal
function transferResults() {
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0) {
        showToast('Ei tuloksia siirrettäväksi. Syötä ensin mitat.', 'warning');
        return;
    }
    
    // Clear previous values
    document.getElementById('transferJobNumber').value = '';
    document.getElementById('transferItemName').value = '';
    const sizeSelect = document.getElementById('transferLasilistaSize');
    if (sizeSelect) {
        sizeSelect.value = '';
    }
    
    // Open modal
    const modal = new bootstrap.Modal(document.getElementById('transferToMittatModal'));
    modal.show();
}

// Confirm and save to Mitat
function confirmTransferToMitat() {
    const jobNumber = document.getElementById('transferJobNumber').value.trim();
    const itemName = document.getElementById('transferItemName').value.trim();
    const lasilistaSize = document.getElementById('transferLasilistaSize')?.value || '';
    
    if (!jobNumber || !itemName || !lasilistaSize) {
        showToast('Täytä kaikki kentät!', 'warning');
        return;
    }
    
    // Get current results
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0) {
        showToast('Ei tuloksia siirrettäväksi.', 'warning');
        return;
    }
    
    // Build results object
    const results = {
        calculator: currentCalculator,
        timestamp: new Date().toISOString(),
        lasilistaSize: lasilistaSize,
        data: []
    };
    
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
    
    // Load existing mitat from localStorage
    let mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    
    // Initialize job if doesn't exist
    if (!mittatData[jobNumber]) {
        mittatData[jobNumber] = {};
    }
    
    // Save results under job number and item name
    mittatData[jobNumber][itemName] = results;
    
    // Save to localStorage
    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    syncMitatStateToFirestore();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('transferToMittatModal'));
    modal.hide();
    
    showToast(`Mitat siirretty: ${jobNumber} - ${itemName}`, 'success');
    
    console.log('✅ Mitat tallennettu:', { jobNumber, itemName, results });
}

// Load and display Mitat view
function loadMittatView() {
    const container = document.getElementById('mittatContainer');
    const openState = captureMitatOpenState();
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const clearAllBtn = document.getElementById('clearAllMitatBtn');
    const togglePackingBtn = document.getElementById('togglePackingListBtn');
    const toggleLasilistaPdfBtn = document.getElementById('toggleLasilistaPdfBtn');
    if (clearAllBtn) {
        clearAllBtn.style.display = isAdmin ? '' : 'none';
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
    
    // Check if empty
    if (Object.keys(mittatData).length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Ei tallennettuja mittoja. Käytä laskimessa "Siirrä"-nappia siirtääksesi tuloksia tänne.</p>';
        return;
    }
    
    // Build HTML
    let html = '';
    
    // Sort job numbers
    const jobNumbers = Object.keys(mittatData).sort();
    
    jobNumbers.forEach(jobNumber => {
        const jobId = `job-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Check if job has notes
        const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
        const jobNoteKey = `job-${jobNumber}`;
        const hasJobNote = mittatNotes[jobNoteKey] && mittatNotes[jobNoteKey].trim() !== '';
        const jobNoteClass = hasJobNote ? 'btn-note-active' : 'btn-note-empty';
        
        const itemNames = Object.keys(mittatData[jobNumber]).sort();
        const totalCount = itemNames.length;
        const doneCount = itemNames.filter((itemName) => doneMitat[`${jobNumber}-${itemName}`]).length;

        html += `<div class="mitat-job-section">`;
        html += `<div class="mitat-job-header" onclick="toggleJobDetails('${jobId}')">`;
        html += `<div class="d-flex align-items-center gap-2">`;
        html += `<h4 class="mitat-job-title">Työ ${jobNumber}</h4>`;
        html += `<button class="btn-note ${jobNoteClass}" onclick="event.stopPropagation(); openMittatNote('job', '${jobNumber}', '', this)" title="Muistiinpano">📝</button>`;
        html += `<span class="mitat-mini-label" id="${jobId}-done-counter">(${totalCount} KPL / ${doneCount} TEHTY)</span>`;
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
            html += `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 3px 6px;" onclick="event.stopPropagation(); deleteJobMitat('${jobNumber}')">🗑️</button>`;
        }
        html += `<span class="mitat-toggle-icon" id="${jobId}-icon">▼</span>`;
        html += `</div>`;
        html += `</div>`;
        
        // Job items container (hidden by default)
        html += `<div class="mitat-job-items" id="${jobId}" style="display: none;">`;

        itemNames.forEach(itemName => {
            const item = mittatData[jobNumber][itemName];
            const date = new Date(item.timestamp).toLocaleString('fi-FI');
            const uniqueId = `mitat-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}-${itemName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const checkKey = `${jobNumber}-${itemName}`;
            
            // Get checked state
            const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
            const isChecked = checkedMitat[checkKey] || false;
            const checkboxClass = isChecked ? 'preset-checkbox checked' : 'preset-checkbox';
            const doneChecked = doneMitat[checkKey] || false;
            const doneCheckboxClass = !isChecked && !doneChecked
                ? 'preset-checkbox disabled'
                : (doneChecked ? 'preset-checkbox checked' : 'preset-checkbox');
            
            // Check if item has notes
            const itemNoteKey = `item-${jobNumber}-${itemName}`;
            const hasItemNote = mittatNotes[itemNoteKey] && mittatNotes[itemNoteKey].trim() !== '';
            const itemNoteClass = hasItemNote ? 'btn-note-active' : 'btn-note-empty';
            
            html += `<div class="mitat-item-section">`;
            html += `<div class="mitat-item-header" onclick="toggleMitatDetails('${uniqueId}')">`;
            html += `<div class="mitat-item-header-main">`;
            html += `<div class="d-flex align-items-center gap-2 mitat-checkpoints">`;
            html += `<h5 class="mitat-item-title">- ${itemName}</h5>`;
            html += `<button class="btn-note ${itemNoteClass}" onclick="event.stopPropagation(); openMittatNote('item', '${jobNumber}', '${itemName}', this)" title="Muistiinpano">📝</button>`;
            if (isPackingListMode && selectedPackingJobNumber === jobNumber) {
                const packingKey = `${jobNumber}||${itemName}`;
                const packingChecked = !!selectedPackingItems[packingKey];
                const packingClass = doneChecked
                    ? (packingChecked ? 'preset-checkbox checked' : 'preset-checkbox')
                    : 'preset-checkbox disabled';
                html += `<span class="mitat-mini-label">pakkaus</span>`;
                html += `<div class="${packingClass}" title="${doneChecked ? 'Merkitse pakattavaksi' : 'Merkitse ensin tehdyksi'}" onclick="event.stopPropagation(); togglePackingItem('${sanitizeForAttribute(jobNumber)}', '${sanitizeForAttribute(itemName)}')">`;
                html += `${packingChecked ? '✓' : ''}`;
                html += `</div>`;
                html += `<span class="mitat-checkpoint-separator">/</span>`;
            } else if (isLasilistaPdfMode && selectedLasilistaPdfJobNumber === jobNumber) {
                const pdfKey = `${jobNumber}||${itemName}`;
                const pdfChecked = !!selectedLasilistaPdfItems[pdfKey];
                const pdfClass = pdfChecked ? 'preset-checkbox checked' : 'preset-checkbox';
                html += `<span class="mitat-mini-label">lasilistat PDF</span>`;
                html += `<div class="${pdfClass}" title="Valitse lasilistojen PDF:ään" onclick="event.stopPropagation(); toggleLasilistaPdfItem('${sanitizeForAttribute(jobNumber)}', '${sanitizeForAttribute(itemName)}')">`;
                html += `${pdfChecked ? '✓' : ''}`;
                html += `</div>`;
                html += `<span class="mitat-checkpoint-separator">/</span>`;
            }
            html += `<span class="mitat-mini-label">lasilistat</span>`;
            html += `<div class="${checkboxClass}" onclick="event.stopPropagation(); toggleMittatCheck('${checkKey}', this)">`;
            html += `${isChecked ? '✓' : ''}`;
            html += `</div>`;
            html += `<span class="mitat-checkpoint-separator">/</span>`;
            html += `<span class="mitat-mini-label">tehty</span>`;
            html += `<div class="${doneCheckboxClass}" title="${isChecked || doneChecked ? 'Merkitse tehdyksi' : 'Merkitse ensin lasilistat'}" onclick="event.stopPropagation(); toggleMittatDone('${checkKey}', '${sanitizeForAttribute(jobNumber)}', this)">`;
            html += `${doneChecked ? '✓' : ''}`;
            html += `</div>`;
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
    
    container.innerHTML = html;
    restoreMitatOpenState(openState);
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

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');

    const packedByJob = {};
    Object.keys(mittatData).forEach((jobNumber) => {
        const itemNames = Object.keys(mittatData[jobNumber] || {});
        const packedItems = itemNames
            .filter((itemName) => packedMitat[`${jobNumber}-${itemName}`])
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

    const jobNumbers = Object.keys(packedByJob).sort((a, b) =>
        a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' })
    );

    if (jobNumbers.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Ei pakattuja tuotteita. Tuotteet siirtyvät tänne, kun niistä tehdään pakkausluettelo.</p>';
        return;
    }

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
        html += `<div class="mitat-job-header" onclick="toggleJobDetails('${jobId}')">`;
        html += `<div class="d-flex align-items-center gap-2">`;
        html += `<h4 class="mitat-job-title">Työ ${jobNumber}</h4>`;
        html += `<span class="mitat-mini-label">(${packedItems.length} PAKATTU / ${packageCount} PAKETTIA)</span>`;
        html += `</div>`;
        html += `<div class="d-flex align-items-center gap-2">`;
        if (isAdmin) {
            html += `<button class="btn btn-danger" style="font-size: 0.7rem; padding: 3px 6px;" onclick="event.stopPropagation(); deleteJobMitat('${sanitizeForAttribute(jobNumber)}')">🗑️</button>`;
        }
        html += `<span class="mitat-toggle-icon" id="${jobId}-icon">▼</span>`;
        html += `</div>`;
        html += `</div>`;

        html += `<div class="mitat-job-items" id="${jobId}" style="display: none;">`;
        packedItems.forEach((packedItem) => {
            const packageText = packedItem.packageNumber ? `(Paketti ${packedItem.packageNumber})` : '(Pakattu!)';
            html += `<div class="mitat-item-section">`;
            html += `<div class="mitat-item-header-main">`;
            html += `<div class="d-flex align-items-center gap-2">`;
            html += `<h5 class="mitat-item-title">- ${packedItem.itemName}</h5>`;
            html += `<span class="mitat-packed-label">${packageText}</span>`;
            html += `</div>`;
            html += `</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        html += `</div>`;
    });

    container.innerHTML = html;
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

function sanitizeForAttribute(value) {
    return String(value).replace(/'/g, "\\'");
}

function formatFinnishDate(date) {
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
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

    const itemKey = `${jobNumber}||${itemName}`;
    selectedLasilistaPdfItems[itemKey] = !selectedLasilistaPdfItems[itemKey];

    if (!selectedLasilistaPdfItems[itemKey]) {
        delete selectedLasilistaPdfItems[itemKey];
    }

    loadMittatView();
}

function collectCombinedLasilistaRows(jobNumber, selectedItemNames) {
    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const jobData = mittatData[jobNumber] || {};
    const grouped = {};

    selectedItemNames.forEach((itemName) => {
        const itemData = jobData[itemName];
        if (!itemData || !Array.isArray(itemData.data)) return;

        const lasilistaSection = itemData.data.find((section) => isLasilistaSectionTitle(section.title));
        if (!lasilistaSection || !Array.isArray(lasilistaSection.items)) return;

        const size = String(itemData.lasilistaSize || '').trim() || 'määrittämätön';
        if (!grouped[size]) {
            grouped[size] = {};
        }

        lasilistaSection.items.forEach((resultItem) => {
            const parsed = parseLasilistaRow(resultItem?.label || '');
            if (!parsed) return;
            const lengthKey = String(parsed.length);
            grouped[size][lengthKey] = (grouped[size][lengthKey] || 0) + parsed.count;
        });
    });

    return grouped;
}

async function generateLasilistaSummaryPdf(jobNumber, groupedRows) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        throw new Error('jsPDF ei ole saatavilla.');
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateText = formatFinnishDate(new Date());
    let y = 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('LASILISTAT', pageWidth / 2, y, { align: 'center' });
    y += 11;

    doc.setFontSize(12);
    doc.text(`TYÖNRO: ${jobNumber}`, 20, y);
    doc.text(`PVM: ${dateText}`, pageWidth - 20, y, { align: 'right' });
    y += 9;

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

        if (y > pageHeight - 30) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`Lasilista ${size}`, 20, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        lengths.forEach((lengthKey) => {
            if (y > pageHeight - 20) {
                doc.addPage();
                y = 20;
            }
            const count = groupedRows[size][lengthKey];
            const lengthText = Number.isFinite(Number(lengthKey))
                ? String(Number(lengthKey))
                : lengthKey;
            doc.text(`${lengthText} x ${count}`, 28, y);
            y += 7;
        });

        y += 3;
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

    const groupedRows = collectCombinedLasilistaRows(jobNumber, selectedItemNames);
    const hasRows = Object.values(groupedRows).some((rowsByLength) => Object.keys(rowsByLength).length > 0);
    if (!hasRows) {
        showToast('Valituista tuotteista ei löytynyt lasilistoja.', 'warning');
        return;
    }

    try {
        await generateLasilistaSummaryPdf(jobNumber, groupedRows);
        showToast('Lasilistat PDF ladattu.', 'success');
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

async function generatePackingListPdf(jobNumber, selectedItemNames) {
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
    let rowY = 176;

    // Resolve image paths relative to current page so they work on localhost and GitHub Pages.
    const logoPath = new URL('assets/packing-logo.png', window.location.href).toString();
    const qrPath = new URL('assets/packing-qr.png', window.location.href).toString();

    // Shared page header block
    const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.text('PAKKAUSLUETTELO', pageWidth / 2, 30, { align: 'center' });

        doc.setFontSize(28);
        doc.text('LÄHETYKSEN VASTAANOTTAJA:', pageWidth / 2, 58, { align: 'center' });

        const infoFontSize = 16.8; // 30% smaller than previous 24
        doc.setFontSize(infoFontSize);
        doc.text('PAKKAUSPVM:', 22, 118);
        doc.text('PAKKAAJA:', 84, 118);
        doc.text('TYÖNRO:', 145, 118);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(infoFontSize);
        doc.text(dateText, 22, 135);
        doc.text(jobNumber, 145, 135);
    };

    drawHeader();

    const sortedItems = [...selectedItemNames].sort((a, b) =>
        a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' })
    );

    sortedItems.forEach((itemName) => {
        if (rowY > pageHeight - bottomReserve) {
            doc.addPage();
            rowY = 30;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(itemRowFontSize);
        doc.text(itemName.toUpperCase(), rowLeftX, rowY);
        doc.text('1 KPL', rowRightX, rowY, { align: 'right' });
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

    try {
        await generatePackingListPdf(jobNumber, selectedItemNames);
        const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
        const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
        const existingPackageNumbers = Object.entries(packedPackageNumbers)
            .filter(([key, value]) => key.startsWith(`${jobNumber}-`) && Number(value) > 0)
            .map(([, value]) => Number(value));
        const nextPackageNumber = existingPackageNumbers.length > 0
            ? Math.max(...existingPackageNumbers) + 1
            : 1;

        selectedItemNames.forEach((itemName) => {
            const checkKey = `${jobNumber}-${itemName}`;
            packedMitat[checkKey] = true;
            packedPackageNumbers[checkKey] = nextPackageNumber;
        });
        localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
        localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
        syncMitatStateToFirestore();
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
    
    if (jobItemsElement.style.display === 'none') {
        jobItemsElement.style.display = 'block';
        iconElement.textContent = '▲';
        iconElement.classList.add('rotated');
    } else {
        jobItemsElement.style.display = 'none';
        iconElement.textContent = '▼';
        iconElement.classList.remove('rotated');
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
    }
}

function updateJobDoneCounter(jobNumber) {
    const jobId = `job-${jobNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const counterElement = document.getElementById(`${jobId}-done-counter`);
    if (!counterElement) return;

    const mittatData = JSON.parse(localStorage.getItem('mittatData') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const itemNames = Object.keys(mittatData[jobNumber] || {});
    const totalCount = itemNames.length;
    const doneCount = itemNames.filter((itemName) => doneMitat[`${jobNumber}-${itemName}`]).length;

    counterElement.textContent = `(${totalCount} KPL / ${doneCount} TEHTY)`;
}

// Toggle mitta checkbox (tehty)
function toggleMittatDone(checkKey, jobNumber, checkboxElement) {
    const checkedMitat = JSON.parse(localStorage.getItem('checkedMitat') || '{}');
    const doneMitat = JSON.parse(localStorage.getItem('doneMitat') || '{}');
    const packedMitat = JSON.parse(localStorage.getItem('packedMitat') || '{}');
    const packedPackageNumbers = JSON.parse(localStorage.getItem('packedPackageNumbers') || '{}');
    const isDone = !doneMitat[checkKey];
    if (isDone && !checkedMitat[checkKey]) {
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
    }
    localStorage.setItem('doneMitat', JSON.stringify(doneMitat));
    localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
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
    }

    updateJobDoneCounter(jobNumber);
    loadMittatView();
}

// Toggle mitta details visibility
function toggleMitatDetails(detailsId) {
    const detailsElement = document.getElementById(detailsId);
    const iconElement = document.getElementById(`${detailsId}-icon`);
    
    if (detailsElement.style.display === 'none') {
        detailsElement.style.display = 'block';
        iconElement.textContent = '▲';
        iconElement.classList.add('rotated');
    } else {
        detailsElement.style.display = 'none';
        iconElement.textContent = '▼';
        iconElement.classList.remove('rotated');
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
    const mittatNotes = JSON.parse(localStorage.getItem('mittatNotes') || '{}');
    const itemNames = Object.keys(mittatData[jobNumber]);
    
    itemNames.forEach(itemName => {
        const checkKey = `${jobNumber}-${itemName}`;
        delete checkedMitat[checkKey];
        delete doneMitat[checkKey];
        delete packedMitat[checkKey];
        delete packedPackageNumbers[checkKey];
        delete mittatNotes[`item-${jobNumber}-${itemName}`];
    });
    
    // Remove job note and job data
    delete mittatNotes[`job-${jobNumber}`];
    delete mittatData[jobNumber];
    
    localStorage.setItem('mittatData', JSON.stringify(mittatData));
    localStorage.setItem('checkedMitat', JSON.stringify(checkedMitat));
    localStorage.setItem('doneMitat', JSON.stringify(doneMitat));
    localStorage.setItem('packedMitat', JSON.stringify(packedMitat));
    localStorage.setItem('packedPackageNumbers', JSON.stringify(packedPackageNumbers));
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

// Clear all mitat
function clearAllMitat() {
    if (!isAdmin) {
        showToast('Vain admin voi poistaa mittoja.', 'warning');
        return;
    }

    if (!confirm('Haluatko varmasti tyhjentää KAIKKI tallennetut mitat? Tätä toimintoa ei voi perua!')) {
        return;
    }
    
    localStorage.removeItem('mittatData');
    localStorage.removeItem('checkedMitat');
    localStorage.removeItem('doneMitat');
    localStorage.removeItem('packedMitat');
    localStorage.removeItem('packedPackageNumbers');
    localStorage.removeItem('mittatNotes');
    syncMitatStateToFirestore();
    selectedPackingJobNumber = null;
    selectedPackingItems = {};
    isPackingListMode = false;
    selectedLasilistaPdfJobNumber = null;
    selectedLasilistaPdfItems = {};
    isLasilistaPdfMode = false;
    loadMittatView();
    showToast('Kaikki mitat tyhjennetty', 'info');
}
