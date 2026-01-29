// Global state
let currentCalculator = '';
let settings = {
    gapOption: 8,
    paneCount: 1
};

// Firebase state
let firebaseInitialized = false;
let currentUser = null;
let isAdmin = false;
let presetsUnsubscribe = null;
let checkedStatesUnsubscribe = null;

// Admin email addresses
const ADMIN_EMAILS = ['admin@terasovi.local'];

// Password to email mapping for backwards compatibility
const PASSWORD_TO_EMAIL = {
    'Soma<3': 'soma@terasovi.local',
    '1234': 'soma@terasovi.local',
    'HarriTheMaster': 'admin@terasovi.local',
    '4321': 'admin@terasovi.local'
};

// Default passwords for Firebase users
const DEFAULT_PASSWORDS = {
    'soma@terasovi.local': 'Soma<3',
    'admin@terasovi.local': 'HarriTheMaster'
};

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

// Firebase Auth State Listener
async function initializeFirebaseAuth() {
    await waitForFirebase();
    
    const { auth, onAuthStateChanged } = window.firebase;
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('🔐 Käyttäjä kirjautunut:', user.email);
            currentUser = user;
            isAdmin = checkIsAdmin(user.email);
            updateSyncStatus(true);
        } else {
            console.log('🔓 Ei kirjautunutta käyttäjää');
            currentUser = null;
            isAdmin = false;
            updateSyncStatus(false);
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
    
    // Initialize Firebase Auth listener
    initializeFirebaseAuth();
});

// Valid passwords
const VALID_PASSWORDS = ['Soma<3', '1234'];
const ADMIN_PASSWORDS = ['HarriTheMaster', '4321'];
const SAVE_PASSWORD = '0303';

// Login handling with Firebase
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    // Wait for Firebase to be ready
    await waitForFirebase();
    
    // Map password to email
    const email = PASSWORD_TO_EMAIL[password];
    
    if (!email) {
        errorDiv.textContent = 'Väärä salasana. Yritä uudelleen.';
        errorDiv.classList.add('show');
        document.getElementById('password').classList.add('is-invalid');
        return;
    }
    
    // Try to sign in with Firebase
    const firebasePassword = DEFAULT_PASSWORDS[email];
    const { auth, signIn } = window.firebase;
    
    try {
        const userCredential = await signIn(auth, email, firebasePassword);
        console.log('✅ Firebase kirjautuminen onnistui:', userCredential.user.email);
        
        // Clear error
        errorDiv.classList.remove('show');
        errorDiv.textContent = '';
        document.getElementById('password').classList.remove('is-invalid');
        document.getElementById('password').value = '';
        
        // Update global state
        currentUser = userCredential.user;
        isAdmin = checkIsAdmin(currentUser.email);
        
        // Show calculator screen
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('calculatorScreen').classList.remove('d-none');
        
        // Update sync status
        updateSyncStatus(true);
        
        // Setup realtime listeners
        setupRealtimeListeners();
        
        // Select default calculator
        selectCalculator('janisol-pariovi');
        
        // Show welcome toast
        showToast(`Tervetuloa${isAdmin ? ' Admin' : ''}!`, 'success');
        
    } catch (error) {
        console.error('❌ Firebase kirjautuminen epäonnistui:', error);
        
        // If Firebase fails, try to create the user first
        if (error.code === 'auth/user-not-found') {
            try {
                const { createUser } = window.firebase;
                await createUser(auth, email, firebasePassword);
                console.log('✅ Käyttäjä luotu, yritetään kirjautua uudelleen...');
                
                // Try login again
                const userCredential = await signIn(auth, email, firebasePassword);
                currentUser = userCredential.user;
                isAdmin = checkIsAdmin(currentUser.email);
                
                document.getElementById('loginScreen').classList.add('d-none');
                document.getElementById('calculatorScreen').classList.remove('d-none');
                updateSyncStatus(true);
                setupRealtimeListeners();
                selectCalculator('janisol-pariovi');
                showToast('Tervetuloa!', 'success');
                
            } catch (createError) {
                console.error('❌ Käyttäjän luonti epäonnistui:', createError);
                errorDiv.textContent = 'Verkkovirhe. Tarkista yhteys.';
                errorDiv.classList.add('show');
                document.getElementById('password').classList.add('is-invalid');
            }
        } else {
            // Fall back to localStorage-only mode
            if (VALID_PASSWORDS.includes(password)) {
                console.warn('⚠️ Käytetään offline-tilaa (Firebase ei toimi)');
                document.getElementById('loginScreen').classList.add('d-none');
                document.getElementById('calculatorScreen').classList.remove('d-none');
                updateSyncStatus(false);
                selectCalculator('janisol-pariovi');
                showToast('Offline-tila: muutokset eivät synkronoidu', 'warning');
            } else {
                errorDiv.textContent = 'Verkkovirhe. Tarkista yhteys.';
                errorDiv.classList.add('show');
                document.getElementById('password').classList.add('is-invalid');
            }
        }
    }
});

// Logout
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
    currentCalculator = '';
    
    // Update UI
    document.getElementById('calculatorScreen').classList.add('d-none');
    document.getElementById('loginScreen').classList.remove('d-none');
    document.getElementById('password').value = '';
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
    
    // Show/hide side door input
    const sideDoorContainer = document.getElementById('sideDoorWidthContainer');
    if (type.includes('pariovi')) {
        sideDoorContainer.style.display = 'block';
    } else {
        sideDoorContainer.style.display = 'none';
    }
    
    // Reset settings
    settings = { gapOption: 8, paneCount: 1 };
    document.getElementById('gapOption').value = '8';
    document.getElementById('paneCount').value = '1';
    updatePaneInputs();
    
    // Calculate initial results
    calculate();
}

// Open settings modal
function openSettings() {
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    // Update dark mode toggle state
    const darkModeToggle = document.getElementById('darkModeToggle');
    darkModeToggle.checked = document.body.classList.contains('dark-mode');
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

// Apply settings
function applySettings() {
    const gapValue = document.getElementById('gapOption').value;
    settings.gapOption = gapValue === 'saneeraus' ? 'saneeraus' : parseInt(gapValue);
    settings.paneCount = parseInt(document.getElementById('paneCount').value);
    updatePaneInputs();
    calculate();
}

// Update pane height inputs based on pane count
function updatePaneInputs() {
    const container = document.getElementById('paneHeightInputs');
    
    // Create a row wrapper if multiple panes
    if (settings.paneCount > 1) {
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
    
    const paneHeights = [];
    for (let i = 1; i <= settings.paneCount; i++) {
        const height = parseInt(document.getElementById(`paneHeight${i}`).value) || 0;
        paneHeights.push(height);
    }
    
    // Validate inputs
    if (mainDoorWidth < 500 || kickPlateHeight < 100) {
        document.getElementById('results').innerHTML = '<p class="text-danger">Tarkista syötteet. Leveys ≥ 500 mm, korkeus ≥ 100 mm.</p>';
            return;
    }
    
    let results = {};
    
    // Calculate based on calculator type
    if (currentCalculator === 'janisol-pariovi') {
        results = calculateJanisolPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'janisol-kayntiovi') {
        results = calculateJanisolKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-pariovi') {
        results = calculateEconomyPariovi(mainDoorWidth, sideDoorWidth, kickPlateHeight, paneHeights);
    } else if (currentCalculator === 'economy-kayntiovi') {
        results = calculateEconomyKayntiovi(mainDoorWidth, kickPlateHeight, paneHeights);
    }
    
    displayResults(results);
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
    
    // Uretaanipalat (Urethane pieces)
    let uretaaniHeightAdjust;
    if (settings.gapOption === '10mm') {
        uretaaniHeightAdjust = jf.uretaani_10mm || jf.uretaani_korkeus;
    } else if (settings.gapOption === '15mm') {
        uretaaniHeightAdjust = jf.uretaani_15mm || jf.uretaani_korkeus;
    } else if (settings.gapOption === 'saneeraus') {
        uretaaniHeightAdjust = jf.uretaani_saneeraus || jf.uretaani_korkeus;
    } else {
        uretaaniHeightAdjust = jf.uretaani_8mm || jf.uretaani_korkeus;
    }
    const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + jf.uretaani_leveys}`);
    results.uretaani.push(`${uretaaniHeight} x ${sideWidth + jf.uretaani_leveys}`);
    
    // Potkupellit - Käyntiovi (Kick plates - Main door)
    let mainInnerHeight, mainOuterHeight;
    if (settings.gapOption === 'saneeraus') {
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
    if (settings.gapOption === 'saneeraus') {
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
    
    // Harjalistat (Brush strips)
    results.harjalista.push(mainWidth + jf.harjalista);
    results.harjalista.push(sideWidth + jf.harjalista);
    
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
    
    // Uretaanipalat
    let uretaaniHeightAdjust;
    if (settings.gapOption === '10mm') {
        uretaaniHeightAdjust = jkf.uretaani_10mm || jf.uretaani_korkeus;
    } else if (settings.gapOption === '15mm') {
        uretaaniHeightAdjust = jkf.uretaani_15mm || jf.uretaani_korkeus;
    } else if (settings.gapOption === 'saneeraus') {
        uretaaniHeightAdjust = jkf.uretaani_saneeraus || jf.uretaani_korkeus;
    } else {
        uretaaniHeightAdjust = jkf.uretaani_8mm || jf.uretaani_korkeus;
    }
    const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + jf.uretaani_leveys}`);
    
    // Potkupellit
    let innerHeight, outerHeight;
    if (settings.gapOption === 'saneeraus') {
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
    
    // Harjalistat
    results.harjalista.push(mainWidth + jf.harjalista);
    
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
    
    // Uretaanipalat
    let uretaaniHeightAdjust;
    if (settings.gapOption === '10mm') {
        uretaaniHeightAdjust = ef.uretaani_10mm || ef.uretaani_korkeus;
    } else if (settings.gapOption === '15mm') {
        uretaaniHeightAdjust = ef.uretaani_15mm || ef.uretaani_korkeus;
    } else if (settings.gapOption === 'saneeraus') {
        uretaaniHeightAdjust = ef.uretaani_saneeraus || ef.uretaani_korkeus;
    } else {
        uretaaniHeightAdjust = ef.uretaani_8mm || ef.uretaani_korkeus;
    }
    const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + ef.uretaani_leveys}`);
    results.uretaani.push(`${uretaaniHeight} x ${sideWidth + ef.uretaani_leveys}`);
    
    // Potkupellit - Käyntiovi
    let mainInnerHeight, mainOuterHeight;
    if (settings.gapOption === 'saneeraus') {
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
    if (settings.gapOption === 'saneeraus') {
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
    
    // Harjalistat
    results.harjalista.push(mainWidth + ef.harjalista);
    results.harjalista.push(sideWidth + ef.harjalista);
    
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
    
    // Uretaanipalat
    let uretaaniHeightAdjust;
    if (settings.gapOption === '10mm') {
        uretaaniHeightAdjust = ekf.uretaani_10mm || ef.uretaani_korkeus;
    } else if (settings.gapOption === '15mm') {
        uretaaniHeightAdjust = ekf.uretaani_15mm || ef.uretaani_korkeus;
    } else if (settings.gapOption === 'saneeraus') {
        uretaaniHeightAdjust = ekf.uretaani_saneeraus || ef.uretaani_korkeus;
    } else {
        uretaaniHeightAdjust = ekf.uretaani_8mm || ef.uretaani_korkeus;
    }
    const uretaaniHeight = kickHeight + uretaaniHeightAdjust;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + ef.uretaani_leveys}`);
    
    // Potkupellit
    let innerHeight, outerHeight;
    if (settings.gapOption === 'saneeraus') {
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
    
    // Harjalistat
    results.harjalista.push(mainWidth + ef.harjalista);
    
    return results;
}

// Display results with combined duplicates
function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    let html = '<div class="row">';
    
    // Lasilista
    html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Lasilista</h5>';
    const combinedLasilista = combineResults(results.lasilista);
    combinedLasilista.forEach(item => {
        html += `<div class="result-item">${item}</div>`;
    });
    html += '</div></div>';
    
    // Uretaani
    html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Uretaani</h5>';
        results.uretaani.forEach(item => {
        html += `<div class="result-item">${item}</div>`;
        });
    html += '</div></div>';
    
    // Potkupelti
    html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Potkupelti</h5>';
        results.potkupelti.forEach(item => {
        html += `<div class="result-item">${item}</div>`;
    });
    html += '</div></div>';
    
    // Harjalista
    html += '<div class="col-md-6 col-lg-3 mb-4"><div class="result-section"><h5>Harjalista</h5>';
        results.harjalista.forEach(item => {
        html += `<div class="result-item">${item}</div>`;
    });
    html += '</div></div>';
    
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
        message: message
    };
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) preset.paneHeights.push(parseInt(el.value));
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
    const checkedPresets = JSON.parse(localStorage.getItem('checkedPresets') || '{}');
    const listDiv = document.getElementById('presetList');
    
    if (Object.keys(presets).length === 0) {
        listDiv.innerHTML = '<p class="text-muted p-3">Ei tallennettuja esiasetuksia.</p>';
    } else {
        listDiv.innerHTML = '';
        Object.keys(presets).forEach(name => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            const isChecked = checkedPresets[name] || false;
            const checkboxClass = isChecked ? 'preset-checkbox checked' : 'preset-checkbox';
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
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">lasilistat</span>
                    <div class="${checkboxClass}" onclick="togglePresetCheck('${escapedName}', event)">
                        ${isChecked ? '✓' : ''}
                    </div>
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
    
    // Load values
    document.getElementById('mainDoorWidth').value = preset.mainDoorWidth;
    document.getElementById('sideDoorWidth').value = preset.sideDoorWidth;
    document.getElementById('kickPlateHeight').value = preset.kickPlateHeight;
    
    settings = { ...preset.settings };
    document.getElementById('gapOption').value = settings.gapOption;
    document.getElementById('paneCount').value = settings.paneCount;
    
    updatePaneInputs();
    
    preset.paneHeights.forEach((height, i) => {
        const el = document.getElementById(`paneHeight${i + 1}`);
        if (el) el.value = height;
    });
    
    calculate();
    
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
        'economy-pariovi': 'Economy Pariovi',
        'economy-kayntiovi': 'Economy Käyntiovi'
    };
    
    let text = 'Harrin Teräsovi Mittalaskuri\n';
    text += titles[currentCalculator] + '\n';
    text += '='.repeat(40) + '\n\n';
    
    // Add inputs
    text += 'Syötteet:\n';
    text += `Käyntioven leveys: ${document.getElementById('mainDoorWidth').value} mm\n`;
    
    if (currentCalculator.includes('pariovi')) {
        text += `Lisäoven leveys: ${document.getElementById('sideDoorWidth').value} mm\n`;
    }
    
    text += `Potkupellin korkeus: ${document.getElementById('kickPlateHeight').value} mm\n`;
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            text += `Ruutu ${i} korkeus: ${el.value} mm\n`;
        }
    }
    
    const rakoText = settings.gapOption === 'saneeraus' ? 'Saneerauskynnys' : `${settings.gapOption} mm rako`;
    text += `Rako: ${rakoText}\n`;
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

// Export to PDF - Show modal first
function exportToPDF() {
    const resultsDiv = document.getElementById('results');
    const sections = resultsDiv.querySelectorAll('.result-section');
    
    if (sections.length === 0) {
        alert('Ei tuloksia vietäväksi. Syötä ensin mitat.');
        return;
    }
    
    // Clear previous input and show modal
    document.getElementById('pdfFileName').value = '';
    const modal = new bootstrap.Modal(document.getElementById('pdfExportModal'));
    modal.show();
}

// Admin Panel Functions
function openAdminPanel() {
    // Show admin password modal
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPasswordError').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('adminPasswordModal'));
    modal.show();
    
    // Allow Enter key to submit
    document.getElementById('adminPassword').onkeypress = function(e) {
        if (e.key === 'Enter') {
            confirmAdminPassword();
        }
    };
}

function confirmAdminPassword() {
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('adminPasswordError');
    
    if (ADMIN_PASSWORDS.includes(password)) {
        // Correct password - close modal and show admin panel
        const modal = bootstrap.Modal.getInstance(document.getElementById('adminPasswordModal'));
        modal.hide();
        showAdminPanelView();
    } else {
        // Wrong password
        errorDiv.textContent = 'Väärä salasana. Yritä uudelleen.';
        errorDiv.style.display = 'block';
        document.getElementById('adminPassword').classList.add('is-invalid');
    }
}

function showAdminPanelView() {
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
            uretaani_saneeraus: -126
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
            uretaani_saneeraus: -126
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
            uretaani_saneeraus: -121
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
            uretaani_saneeraus: -121
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
    
    // Load available formula sets
    loadFormulaSetsList();
}

// Load formula sets to dropdown
function loadFormulaSetsList() {
    const storedFormulas = localStorage.getItem('formulaSets');
    const activeSetName = localStorage.getItem('activeFormulaSet') || 'default';
    const select = document.getElementById('activeFormulaSet');
    
    select.innerHTML = '<option value="default">Default Kaavat</option>';
    
    if (storedFormulas) {
        const sets = JSON.parse(storedFormulas);
        Object.keys(sets).forEach(setName => {
            if (setName !== 'default') {
                const option = document.createElement('option');
                option.value = setName;
                option.textContent = setName;
                select.appendChild(option);
            }
        });
    }
    
    select.value = activeSetName;
}

// Switch formula set
function switchFormulaSet() {
    const setName = document.getElementById('activeFormulaSet').value;
    localStorage.setItem('activeFormulaSet', setName);
    loadFormulasToPanel();
    calculate(); // Recalculate with new formulas
}

// Save formula changes - Step 1: Ask for name
function saveFormulaChanges() {
    // Show name input modal
    const currentSet = document.getElementById('activeFormulaSet').value;
    document.getElementById('formulaSetName').value = currentSet === 'default' ? '' : currentSet;
    
    const modal = new bootstrap.Modal(document.getElementById('saveNameModal'));
    modal.show();
}

// Step 2: Ask for password
function askSavePassword() {
    const name = document.getElementById('formulaSetName').value.trim();
    
    // Validate name
    if (name === 'default') {
        alert('Nimi "default" on varattu. Valitse toinen nimi.');
        return;
    }
    
    // Close name modal
    const nameModal = bootstrap.Modal.getInstance(document.getElementById('saveNameModal'));
    nameModal.hide();
    
    // Show password modal
    document.getElementById('savePassword').value = '';
    document.getElementById('savePasswordError').style.display = 'none';
    document.getElementById('savePassword').classList.remove('is-invalid');
    
    const passwordModal = new bootstrap.Modal(document.getElementById('savePasswordModal'));
    passwordModal.show();
    
    // Allow Enter key to submit
    document.getElementById('savePassword').onkeypress = function(e) {
        if (e.key === 'Enter') {
            confirmSaveFormulas();
        }
    };
}

// Go back to name modal
function backToNameModal() {
    const passwordModal = bootstrap.Modal.getInstance(document.getElementById('savePasswordModal'));
    passwordModal.hide();
    
    const nameModal = new bootstrap.Modal(document.getElementById('saveNameModal'));
    nameModal.show();
}

// Step 3: Confirm and save
function confirmSaveFormulas() {
    const password = document.getElementById('savePassword').value;
    const errorDiv = document.getElementById('savePasswordError');
    
    if (password === SAVE_PASSWORD) {
        // Correct password - save formulas
        const passwordModal = bootstrap.Modal.getInstance(document.getElementById('savePasswordModal'));
        passwordModal.hide();
        
        const formulas = collectFormulasFromPanel();
        let setName = document.getElementById('formulaSetName').value.trim();
        
        // If no name provided, use current active set
        if (!setName) {
            setName = document.getElementById('activeFormulaSet').value;
        }
        
        const storedFormulas = localStorage.getItem('formulaSets');
        const sets = storedFormulas ? JSON.parse(storedFormulas) : {};
        
        sets[setName] = formulas;
        localStorage.setItem('formulaSets', JSON.stringify(sets));
        localStorage.setItem('activeFormulaSet', setName);
        
        // Reload the list and set active
        loadFormulaSetsList();
        
        // Recalculate with new formulas
        calculate();
        
        alert(`Kaavasetti "${setName}" tallennettu!`);
    } else {
        // Wrong password
        errorDiv.textContent = 'Väärä salasana. Yritä uudelleen.';
        errorDiv.style.display = 'block';
        document.getElementById('savePassword').classList.add('is-invalid');
    }
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
            uretaani_saneeraus: parseFloat(document.getElementById('janisol_pariovi_uretaani_saneeraus').value)
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
            uretaani_saneeraus: parseFloat(document.getElementById('janisol_kayntiovi_uretaani_saneeraus').value)
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
            uretaani_saneeraus: parseFloat(document.getElementById('economy_pariovi_uretaani_saneeraus').value)
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
            uretaani_saneeraus: parseFloat(document.getElementById('economy_kayntiovi_uretaani_saneeraus').value)
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
    
    // Title
    const titles = {
        'janisol-pariovi': 'Janisol Pariovi',
        'janisol-kayntiovi': 'Janisol Käyntiovi',
        'economy-pariovi': 'Economy Pariovi',
        'economy-kayntiovi': 'Economy Käyntiovi'
    };
    
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
    doc.text(`Käyntioven leveys: ${document.getElementById('mainDoorWidth').value} mm`, 25, yPos);
    yPos += 7;
    
    if (currentCalculator.includes('pariovi')) {
        doc.text(`Lisäoven leveys: ${document.getElementById('sideDoorWidth').value} mm`, 25, yPos);
        yPos += 7;
    }
    
    doc.text(`Potkupellin oletuskorkeus: ${document.getElementById('kickPlateHeight').value} mm`, 25, yPos);
    yPos += 7;
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) {
            doc.text(`Ruutu ${i} korkeus: ${el.value} mm`, 25, yPos);
            yPos += 7;
        }
    }
    
    const rakoText = settings.gapOption === 'saneeraus' ? 'Saneerauskynnys' : `${settings.gapOption} mm rako`;
    doc.text(`Rako: ${rakoText}`, 25, yPos);
    yPos += 7;
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
