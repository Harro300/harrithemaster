// Global state
let currentCalculator = '';
let settings = {
    gapOption: 8,
    paneCount: 1
};

// Dark mode initialization
document.addEventListener('DOMContentLoaded', function() {
    // Load dark mode preference
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) toggle.checked = true;
    }
});

// Valid passwords
const VALID_PASSWORDS = ['Soma<3', 'Harri10K'];

// Login handling
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    if (VALID_PASSWORDS.includes(password)) {
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('calculatorScreen').classList.remove('d-none');
        errorDiv.classList.remove('show');
        errorDiv.textContent = '';
        // Select default calculator
        selectCalculator('janisol-pariovi');
    } else {
        errorDiv.textContent = 'Väärä salasana. Yritä uudelleen.';
        errorDiv.classList.add('show');
        document.getElementById('password').classList.add('is-invalid');
    }
});

// Logout
function logout() {
    document.getElementById('calculatorScreen').classList.add('d-none');
    document.getElementById('loginScreen').classList.remove('d-none');
    document.getElementById('password').value = '';
    document.getElementById('password').classList.remove('is-invalid');
    currentCalculator = '';
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
    settings.gapOption = parseInt(document.getElementById('gapOption').value);
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
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = 32;
        outerHeightAdjust = 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = 27;
        outerHeightAdjust = 2;
    }
    
    // Lasilistat (Glass strips) - Janisol formulas
    // Vertical strips for main door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + 41;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Vertical strips for side door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + 41;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth + 3;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = sideWidth + 3;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Uretaanipalat (Urethane pieces)
    const uretaaniHeight = kickHeight - 126;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + 46}`);
    results.uretaani.push(`${uretaaniHeight} x ${sideWidth + 46}`);
    
    // Potkupellit - Käyntiovi (Kick plates - Main door)
    const mainInnerHeight = kickHeight - 67 + innerHeightAdjust;
    const mainInnerWidth = mainWidth + 115;
    results.potkupelti.push(`${mainInnerHeight} x ${mainInnerWidth}`);
    
    const mainOuterHeight = kickHeight - 18 + outerHeightAdjust;
    let mainOuterWidth = mainWidth + 165;
    if (mainOuterHeight > 310) {
        mainOuterWidth -= 5;
    }
    results.potkupelti.push(`${mainOuterHeight} x ${mainOuterWidth}`);
    
    // Potkupellit - Lisäovi (Kick plates - Side door)
    const sideInnerHeight = kickHeight - 67 + innerHeightAdjust;
    const sideInnerWidth = sideWidth + 140;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    const sideOuterHeight = kickHeight - 18 + outerHeightAdjust;
    let sideOuterWidth = sideWidth + 140;
    if (sideOuterHeight > 310) {
        sideOuterWidth -= 5;
    }
    results.potkupelti.push(`${sideOuterHeight} x ${sideOuterWidth}`);
    
    // Harjalistat (Brush strips)
    results.harjalista.push(mainWidth + 141);
    results.harjalista.push(sideWidth + 141);
    
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
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = 32;
        outerHeightAdjust = 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = 27;
        outerHeightAdjust = 2;
    }
    
    // Lasilistat - Janisol formulas
    paneHeights.forEach(height => {
        // 2 vertical strips per pane
        const verticalLength = height + 41;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = mainWidth + 3;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Uretaanipalat
    const uretaaniHeight = kickHeight - 126;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + 46}`);
    
    // Potkupellit
    const innerHeight = kickHeight - 67 + innerHeightAdjust;
    const innerWidth = mainWidth + 115;
    results.potkupelti.push(`${innerHeight} x ${innerWidth}`);
    
    const outerHeight = kickHeight - 18 + outerHeightAdjust;
    let outerWidth = mainWidth + 165;
    if (outerHeight > 310) {
        outerWidth -= 5;
    }
    results.potkupelti.push(`${outerHeight} x ${outerWidth}`);
    
    // Harjalistat
    results.harjalista.push(mainWidth + 141);
    
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
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = 32;
        outerHeightAdjust = 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = 27;
        outerHeightAdjust = 2;
    }
    
    // Lasilistat - Economy formulas
    // Vertical strips for main door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + 38;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Vertical strips for side door (2 per pane)
    paneHeights.forEach(height => {
        const verticalLength = height + 38;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
    });
    
    // Horizontal strips for main door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = mainWidth - 2;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Horizontal strips for side door (2 per pane)
    paneHeights.forEach(() => {
        const horizontalLength = sideWidth - 2;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Uretaanipalat
    const uretaaniHeight = kickHeight - 121;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + 41}`);
    results.uretaani.push(`${uretaaniHeight} x ${sideWidth + 41}`);
    
    // Potkupellit - Käyntiovi
    const mainInnerHeight = kickHeight - 65 + innerHeightAdjust;
    const mainInnerWidth = mainWidth + 110;
    results.potkupelti.push(`${mainInnerHeight} x ${mainInnerWidth}`);
    
    const mainOuterHeight = kickHeight - 20 + outerHeightAdjust;
    let mainOuterWidth = mainWidth + 160;
    if (mainOuterHeight > 310) {
        mainOuterWidth -= 5;
    }
    results.potkupelti.push(`${mainOuterHeight} x ${mainOuterWidth}`);
    
    // Potkupellit - Lisäovi
    const sideInnerHeight = kickHeight - 65 + innerHeightAdjust;
    const sideInnerWidth = sideWidth + 135;
    results.potkupelti.push(`${sideInnerHeight} x ${sideInnerWidth}`);
    
    const sideOuterHeight = kickHeight - 20 + outerHeightAdjust;
    let sideOuterWidth = sideWidth + 135;
    if (sideOuterHeight > 310) {
        sideOuterWidth -= 5;
    }
    results.potkupelti.push(`${sideOuterHeight} x ${sideOuterWidth}`);
    
    // Harjalistat
    results.harjalista.push(mainWidth + 141);
    results.harjalista.push(sideWidth + 141);
    
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
    
    // Gap adjustments
    let innerHeightAdjust = 0;
    let outerHeightAdjust = 0;
    
    if (settings.gapOption === 10) {
        innerHeightAdjust = 32;
        outerHeightAdjust = 7;
    } else if (settings.gapOption === 15) {
        innerHeightAdjust = 27;
        outerHeightAdjust = 2;
    }
    
    // Lasilistat - Economy formulas
    paneHeights.forEach(height => {
        // 2 vertical strips per pane
        const verticalLength = height + 38;
        results.lasilista.push(verticalLength);
        results.lasilista.push(verticalLength);
        
        // 2 horizontal strips per pane
        const horizontalLength = mainWidth - 2;
        results.lasilista.push(horizontalLength);
        results.lasilista.push(horizontalLength);
    });
    
    // Uretaanipalat
    const uretaaniHeight = kickHeight - 121;
    results.uretaani.push(`${uretaaniHeight} x ${mainWidth + 41}`);
    
    // Potkupellit
    const innerHeight = kickHeight - 65 + innerHeightAdjust;
    const innerWidth = mainWidth + 110;
    results.potkupelti.push(`${innerHeight} x ${innerWidth}`);
    
    const outerHeight = kickHeight - 20 + outerHeightAdjust;
    let outerWidth = mainWidth + 160;
    if (outerHeight > 310) {
        outerWidth -= 5;
    }
    results.potkupelti.push(`${outerHeight} x ${outerWidth}`);
    
    // Harjalistat
    results.harjalista.push(mainWidth + 141);
    
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
    modal.show();
}

function confirmSavePreset() {
    const name = document.getElementById('presetName').value.trim();
    if (!name) {
        alert('Anna nimi esiasetukselle.');
        return;
    }
    
    const preset = {
        calculator: currentCalculator,
        mainDoorWidth: document.getElementById('mainDoorWidth').value,
        sideDoorWidth: document.getElementById('sideDoorWidth').value,
        kickPlateHeight: document.getElementById('kickPlateHeight').value,
        settings: { ...settings },
        paneHeights: []
    };
    
    for (let i = 1; i <= settings.paneCount; i++) {
        const el = document.getElementById(`paneHeight${i}`);
        if (el) preset.paneHeights.push(el.value);
    }
    
    // Save to localStorage
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    presets[name] = preset;
    localStorage.setItem('doorPresets', JSON.stringify(presets));
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('savePresetModal'));
    modal.hide();
    
    alert('Esiasetus tallennettu!');
}

// Load preset dialog
function loadPresetDialog() {
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    const listDiv = document.getElementById('presetList');
    
    if (Object.keys(presets).length === 0) {
        listDiv.innerHTML = '<p class="text-muted p-3">Ei tallennettuja esiasetuksia.</p>';
    } else {
        listDiv.innerHTML = '';
        Object.keys(presets).forEach(name => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <span>${name}</span>
                <button class="btn btn-sm btn-danger" onclick="deletePreset('${name}', event)">🗑️</button>
            `;
            item.onclick = (e) => {
                if (!e.target.classList.contains('btn-danger')) {
                    loadPreset(name);
                }
            };
            listDiv.appendChild(item);
        });
    }
    
    const modal = new bootstrap.Modal(document.getElementById('loadPresetModal'));
    modal.show();
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

function deletePreset(name, event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!confirm(`Haluatko varmasti poistaa esiasetuksen "${name}"?`)) {
        return;
    }
    
    const presets = JSON.parse(localStorage.getItem('doorPresets') || '{}');
    delete presets[name];
    localStorage.setItem('doorPresets', JSON.stringify(presets));
    
    loadPresetDialog();
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
    
    text += `Rako: ${settings.gapOption} mm\n`;
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
    
    doc.text(`Rako: ${settings.gapOption} mm`, 25, yPos);
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
