(function () {
    const STORAGE_KEY = 'kuormaKapasiteetti';
    const DEFAULT_HOURS = 6.5;
    const DEFAULT_DOC = 'kokoonpano-kapasiteetti';
    const DEPARTMENTS = ['saha', 'hitsaus', 'maalaus', 'kokoonpano'];
    const PREVIOUS_DEPARTMENT = {
        hitsaus: 'saha',
        maalaus: 'hitsaus',
        kokoonpano: 'maalaus'
    };
    const SIIRTYMA_DEPARTMENTS = ['saha', 'hitsaus', 'maalaus'];
    const DEPARTMENT_LABELS = {
        saha: 'Saha',
        hitsaus: 'Hitsaus',
        maalaus: 'Maalaus',
        kokoonpano: 'Kokoonpano'
    };
    const WEEKDAYS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];
    const WEEKDAY_NAMES = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai'];
    const DOCS = [
        { id: 'saha-kuorma', department: 'saha', kind: 'kuorma', label: 'Saha kuorma' },
        { id: 'saha-kapasiteetti', department: 'saha', kind: 'kapasiteetti', label: 'Saha kapasiteetti' },
        { id: 'hitsaus-kuorma', department: 'hitsaus', kind: 'kuorma', label: 'Hitsaus kuorma' },
        { id: 'hitsaus-kapasiteetti', department: 'hitsaus', kind: 'kapasiteetti', label: 'Hitsaus kapasiteetti' },
        { id: 'maalaus-kuorma', department: 'maalaus', kind: 'kuorma', label: 'Maalaus kuorma' },
        { id: 'maalaus-kapasiteetti', department: 'maalaus', kind: 'kapasiteetti', label: 'Maalaus kapasiteetti' },
        { id: 'kokoonpano-kuorma', department: 'kokoonpano', kind: 'kuorma', label: 'Kokoonpano kuorma' },
        { id: 'kokoonpano-kapasiteetti', department: 'kokoonpano', kind: 'kapasiteetti', label: 'Kokoonpano kapasiteetti' }
    ];
    const DOOR_TIME_FIELDS = [
        { key: 'standardi', label: 'Standardi' },
        { key: 'ruutu', label: '+1 ruutu' },
        { key: 'potkupelti', label: '+potkupelti' },
        { key: 'tiivistekynnys', label: '+tiivistekynnys' }
    ];
    const WINDOW_TIME_FIELDS = [
        { key: 'standardi', label: 'Standardi' },
        { key: 'ruutu', label: '+1 ruutu' },
        { key: 'potkupelti', label: '+potkupelti' }
    ];
    const UMPIOVI_TIME_FIELDS = [
        { key: 'umpiovi', label: 'Umpiovi' },
        { key: 'umpioviPotkupelti', label: '+potkupelti' },
        { key: 'umpioviTiivistekynnys', label: '+tiivistekynnys' }
    ];
    const PRODUCTS = [
        { id: 'janisol_kayntiovi', label: 'Janisol käyntiovi', kind: 'ovi' },
        { id: 'janisol_pariovi', label: 'Janisol pariovi', kind: 'ovi' },
        { id: 'janisol_ikkuna', label: 'Janisol ikkuna', kind: 'ikkuna' },
        { id: 'economy_kayntiovi', label: 'Economy käyntiovi', kind: 'ovi' },
        { id: 'economy_pariovi', label: 'Economy pariovi', kind: 'ovi' },
        { id: 'economy_ikkuna', label: 'Economy ikkuna', kind: 'ikkuna' }
    ];
    const CALCULATOR_PRODUCT_IDS = {
        'janisol-kayntiovi': 'janisol_kayntiovi',
        'janisol-pariovi': 'janisol_pariovi',
        'janisol-ikkuna': 'janisol_ikkuna',
        'economy-kayntiovi': 'economy_kayntiovi',
        'economy-pariovi': 'economy_pariovi',
        'economy-ikkuna': 'economy_ikkuna'
    };

    let state = loadState();
    let selectedWeekKey = null;
    let openDayKey = null;
    let settingsKeyHandler = null;
    let weekPanel = 'viikko';
    let expandedWeeks = false;
    let productionSnapshot = null;
    let reviewDayIndex = null;
    let reviewSelection = new Set();

    function defaultState() {
        const kapasiteetti = {};
        DEPARTMENTS.forEach((department) => {
            kapasiteetti[department] = { workers: [] };
        });
        return {
            enabled: false,
            selectedDoc: DEFAULT_DOC,
            kapasiteetti,
            kuorma: defaultDepartmentKuorma(),
            kuormaSets: {},
            activeKuormaSet: '',
            siirtymaAika: defaultSiirtymaAika()
        };
    }

    function timeFieldsFor(product) {
        if (product.kind === 'ikkuna') return WINDOW_TIME_FIELDS;
        return DOOR_TIME_FIELDS.concat(UMPIOVI_TIME_FIELDS);
    }

    function emptyProductTimes(product) {
        const times = {};
        timeFieldsFor(product).forEach((field) => {
            times[field.key] = 0;
        });
        return times;
    }

    function defaultKokoonpanoTimes() {
        return normalizeKokoonpanoTimes(null);
    }

    function normalizeKokoonpanoTimes(source) {
        const kokoonpano = {};
        PRODUCTS.forEach((product) => {
            const saved = source && source[product.id];
            const times = emptyProductTimes(product);
            timeFieldsFor(product).forEach((field) => {
                const minutes = clampMinutes(saved && saved[field.key]);
                times[field.key] = minutes === null ? 0 : minutes;
            });
            kokoonpano[product.id] = times;
        });
        return kokoonpano;
    }

    function cloneKokoonpanoTimes(source) {
        return normalizeKokoonpanoTimes(source);
    }

    function defaultSiirtymaAika() {
        return { saha: 1, hitsaus: 1, maalaus: 1 };
    }

    function clampSiirtyma(value) {
        if (value === '' || value == null) return 1;
        const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(raw)) return 1;
        return Math.min(30, Math.max(0, Math.round(raw)));
    }

    function normalizeSiirtymaAika(source) {
        const next = defaultSiirtymaAika();
        if (!source || typeof source !== 'object' || Array.isArray(source)) return next;
        SIIRTYMA_DEPARTMENTS.forEach((department) => {
            if (!Object.prototype.hasOwnProperty.call(source, department)) return;
            next[department] = clampSiirtyma(source[department]);
        });
        return next;
    }

    function kuormaSetIsLegacy(source) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
        if (source.kokoonpano && typeof source.kokoonpano === 'object') return false;
        return PRODUCTS.some((product) => source[product.id] && typeof source[product.id] === 'object');
    }

    function defaultDepartmentKuorma() {
        const kuorma = {};
        DEPARTMENTS.forEach((department) => {
            kuorma[department] = defaultKokoonpanoTimes();
        });
        return kuorma;
    }

    function normalizeDepartmentKuorma(source) {
        const kuorma = defaultDepartmentKuorma();
        if (!source || typeof source !== 'object' || Array.isArray(source)) return kuorma;
        if (kuormaSetIsLegacy(source)) {
            kuorma.kokoonpano = normalizeKokoonpanoTimes(source);
            return kuorma;
        }
        DEPARTMENTS.forEach((department) => {
            kuorma[department] = normalizeKokoonpanoTimes(source[department]);
        });
        return kuorma;
    }

    function cloneDepartmentKuorma(source) {
        return normalizeDepartmentKuorma(source);
    }

    function clampMinutes(value) {
        if (value === '' || value == null) return null;
        const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(raw)) return null;
        return Math.max(0, Math.round(raw));
    }

    function clampHours(value) {
        const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(raw)) return DEFAULT_HOURS;
        return Math.min(24, Math.max(0, raw));
    }

    function normalize(parsed) {
        const next = defaultState();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return next;
        next.enabled = parsed.enabled === true;
        if (DOCS.some((doc) => doc.id === parsed.selectedDoc)) {
            next.selectedDoc = parsed.selectedDoc;
        }
        DEPARTMENTS.forEach((department) => {
            const source = parsed.kapasiteetti && parsed.kapasiteetti[department];
            const workers = source && Array.isArray(source.workers) ? source.workers : [];
            next.kapasiteetti[department].workers = workers.filter((worker) => {
                return worker && typeof worker.id === 'string' && worker.id &&
                    typeof worker.name === 'string' && worker.name.trim();
            }).map((worker) => ({
                id: worker.id,
                name: worker.name.trim(),
                weeks: normalizeWorkerWeeks(worker),
                absence: normalizeAbsence(worker)
            }));
        });
        next.kuorma = normalizeDepartmentKuorma(parsed.kuorma);
        next.siirtymaAika = normalizeSiirtymaAika(parsed.siirtymaAika);
        const sets = {};
        const rawSets = parsed.kuormaSets;
        if (rawSets && typeof rawSets === 'object' && !Array.isArray(rawSets)) {
            Object.keys(rawSets).forEach((name) => {
                const trimmed = String(name || '').trim();
                if (!trimmed || trimmed.length > 80) return;
                sets[trimmed] = normalizeDepartmentKuorma(rawSets[name]);
            });
        }
        next.kuormaSets = sets;
        const active = typeof parsed.activeKuormaSet === 'string' ? parsed.activeKuormaSet.trim() : '';
        next.activeKuormaSet = sets[active] ? active : '';
        if (next.activeKuormaSet) {
            next.kuorma = cloneDepartmentKuorma(sets[next.activeKuormaSet]);
        }
        return next;
    }

    function persist(next) {
        const payload = {
            enabled: next.enabled === true,
            selectedDoc: next.selectedDoc,
            kapasiteetti: next.kapasiteetti,
            kuorma: next.kuorma,
            kuormaSets: next.kuormaSets || {},
            activeKuormaSet: next.activeKuormaSet || '',
            siirtymaAika: next.siirtymaAika || defaultSiirtymaAika()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultState();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultState();
            return normalize(parsed);
        } catch (error) {
            return defaultState();
        }
    }

    function save() {
        persist(state);
    }

    function formatSum(total) {
        const rounded = Math.round(total * 10) / 10;
        if (rounded === 0) return '0 h';
        return rounded.toLocaleString('fi-FI', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }) + ' h';
    }

    function clampDayHours(value) {
        if (value === '' || value == null) return null;
        const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(raw)) return null;
        return Math.min(24, Math.max(0, raw));
    }

    function defaultDayHours(weekdayHours) {
        const days = {};
        WEEKDAYS.forEach((key, index) => {
            days[key] = index < 5 ? weekdayHours : 0;
        });
        return days;
    }

    function normalizeDays(source, weekdayFallback) {
        const days = {};
        WEEKDAYS.forEach((key, index) => {
            const hasDay = source && Object.prototype.hasOwnProperty.call(source, key);
            const parsed = hasDay ? clampDayHours(source[key]) : null;
            days[key] = parsed === null ? (index < 5 ? weekdayFallback : 0) : parsed;
        });
        return days;
    }

    function normalizeWorkerWeeks(worker) {
        const weeks = {};
        const source = worker && worker.weeks && typeof worker.weeks === 'object' ? worker.weeks : null;
        if (source) {
            Object.keys(source).forEach((key) => {
                if (!parseIsoWeekKey(key)) return;
                weeks[key] = normalizeDays(source[key], DEFAULT_HOURS);
            });
        }
        if (!source && worker && (worker.days || worker.hours != null)) {
            const legacyHours = clampDayHours(worker.hours);
            const fallback = legacyHours === null ? DEFAULT_HOURS : legacyHours;
            weeks[currentIsoWeekKey()] = worker.days
                ? normalizeDays(worker.days, fallback)
                : defaultDayHours(fallback);
        }
        return weeks;
    }

    function normalizeAbsence(worker) {
        const absence = {};
        const source = worker && worker.absence && typeof worker.absence === 'object' ? worker.absence : null;
        if (!source) return absence;
        Object.keys(source).forEach((weekKey) => {
            if (!parseIsoWeekKey(weekKey)) return;
            const days = source[weekKey];
            if (!days || typeof days !== 'object') return;
            const saved = {};
            WEEKDAYS.slice(0, 5).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(days, key)) return;
                const parsed = clampDayHours(days[key]);
                if (parsed === null) return;
                saved[key] = parsed;
            });
            if (Object.keys(saved).length) absence[weekKey] = saved;
        });
        return absence;
    }

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function zeroableWeekdays(weekKey) {
        const monday = mondayFromIsoWeekKey(weekKey);
        const today = startOfDay(new Date());
        return WEEKDAYS.slice(0, 5).filter((key, index) => {
            return startOfDay(addDays(monday, index)).getTime() >= today.getTime();
        });
    }

    function markAbsent(worker, weekKey) {
        const keys = zeroableWeekdays(weekKey);
        if (!keys.length) return;
        const days = daysFor(worker, weekKey);
        const saved = {};
        keys.forEach((key) => {
            saved[key] = typeof days[key] === 'number' ? days[key] : 0;
        });
        keys.forEach((key) => writeDay(worker, weekKey, key, 0));
        if (!worker.absence) worker.absence = {};
        worker.absence[weekKey] = saved;
    }

    function clearAbsent(worker, weekKey) {
        const saved = worker.absence && worker.absence[weekKey];
        if (!saved) return;
        Object.keys(saved).forEach((key) => writeDay(worker, weekKey, key, saved[key]));
        delete worker.absence[weekKey];
    }

    function daysFor(worker, weekKey) {
        if (worker.weeks && worker.weeks[weekKey]) return worker.weeks[weekKey];
        return defaultDayHours(DEFAULT_HOURS);
    }

    function writeDay(worker, weekKey, dayKey, value) {
        if (!worker.weeks) worker.weeks = {};
        if (!worker.weeks[weekKey]) worker.weeks[weekKey] = Object.assign({}, daysFor(worker, weekKey));
        worker.weeks[weekKey][dayKey] = value;
    }

    function departmentDayHours(department, dayKey) {
        const weekKey = activeWeekKey();
        return state.kapasiteetti[department].workers.reduce((sum, worker) => {
            return sum + (daysFor(worker, weekKey)[dayKey] || 0);
        }, 0);
    }

    function departmentHoursForWeek(department, weekKey) {
        const workers = state.kapasiteetti[department].workers;
        return WEEKDAYS.reduce((sum, dayKey) => {
            return sum + workers.reduce((workerSum, worker) => {
                return workerSum + (daysFor(worker, weekKey)[dayKey] || 0);
            }, 0);
        }, 0);
    }

    function workerWeekHours(worker) {
        const days = daysFor(worker, activeWeekKey());
        return WEEKDAYS.reduce((sum, key) => sum + (days[key] || 0), 0);
    }

    function formatHours(total) {
        const rounded = Math.round(total * 10) / 10;
        return rounded.toLocaleString('fi-FI', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
    }

    function nextWorkerId() {
        const id = 'w_' + Date.now();
        const taken = DEPARTMENTS.some((department) => {
            return state.kapasiteetti[department].workers.some((worker) => worker.id === id);
        });
        return taken ? id + '_' + Math.floor(Math.random() * 1000) : id;
    }

    function mount(host) {
        if (!host || host.dataset.kkReady === '1') return;
        const week = document.createElement('div');
        week.id = 'kkWeek';
        host.replaceChildren(week);
        host.dataset.kkReady = '1';
        renderWeekPage();
    }

    function settingsSwitch() {
        const section = document.createElement('div');
        section.className = 'kk-page-head';
        const switchWrap = document.createElement('div');
        switchWrap.className = 'form-check form-switch mb-2';
        const enabled = document.createElement('input');
        enabled.className = 'form-check-input';
        enabled.type = 'checkbox';
        enabled.id = 'kkEnabled';
        enabled.checked = state.enabled === true;
        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'form-check-label';
        enabledLabel.htmlFor = 'kkEnabled';
        enabledLabel.textContent = 'Näytä tuotannossa';
        switchWrap.append(enabled, enabledLabel);
        const note = document.createElement('p');
        note.className = 'kk-note';
        note.textContent = 'Kun pois, tuotantosivu pysyy ennallaan, ja tällä kierroksella kytkin ei vielä lisää tunteja tuotantoon.';
        enabled.addEventListener('change', () => {
            state.enabled = enabled.checked;
            save();
            if (typeof updateKuormaButton === 'function') updateKuormaButton();
        });
        section.append(switchWrap, note);
        return section;
    }

    function renderSettings() {
        const body = document.getElementById('kkSettingsBody');
        if (!body) return;
        body.replaceChildren();
        body.appendChild(settingsSwitch());
        body.appendChild(renderKuormaSetBar(body));
        DEPARTMENTS.forEach((department) => {
            const block = document.createElement('section');
            block.className = 'kk-dept-block';
            const heading = document.createElement('h3');
            heading.className = 'kk-capacity-heading';
            heading.textContent = DEPARTMENT_LABELS[department];
            block.appendChild(heading);
            if (department !== 'kokoonpano') block.appendChild(renderSiirtymaField(department));
            block.appendChild(renderLoad(department));
            body.appendChild(block);
        });
    }

    function closeSettings() {
        const layer = document.getElementById('kkSettingsLayer');
        if (layer) layer.hidden = true;
    }

    function openSettings() {
        let layer = document.getElementById('kkSettingsLayer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'kkSettingsLayer';
            layer.className = 'kk-settings-layer';
            layer.addEventListener('click', (event) => {
                if (event.target === layer) closeSettings();
            });
            const sheet = document.createElement('div');
            sheet.className = 'kk-settings-sheet';
            sheet.tabIndex = -1;
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            sheet.setAttribute('aria-labelledby', 'kkSettingsTitle');
            const head = document.createElement('header');
            head.className = 'kk-settings-head';
            const title = document.createElement('h2');
            title.id = 'kkSettingsTitle';
            title.textContent = 'Kuorma-asetukset';
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'kk-settings-close';
            close.setAttribute('aria-label', 'Sulje');
            close.textContent = '×';
            close.addEventListener('click', closeSettings);
            head.append(title, close);
            const body = document.createElement('div');
            body.id = 'kkSettingsBody';
            body.className = 'kk-settings-body';
            sheet.append(head, body);
            layer.appendChild(sheet);
            document.body.appendChild(layer);
        }
        layer.hidden = false;
        renderSettings();
        if (!settingsKeyHandler) {
            settingsKeyHandler = (event) => {
                const open = document.getElementById('kkSettingsLayer');
                if (!open || open.hidden || event.key !== 'Escape') return;
                event.preventDefault();
                closeSettings();
            };
            document.addEventListener('keydown', settingsKeyHandler);
        }
        const sheet = layer.querySelector('.kk-settings-sheet');
        if (sheet) sheet.focus();
    }

    function renderWeekPage() {
        const host = document.getElementById('kkWeek');
        if (!host) return;
        host.replaceChildren();
        host.appendChild(weekPanelTabs());
        host.appendChild(buildWeekControls(renderWeekPage));
        const grid = document.createElement('div');
        grid.id = 'kkWeekGrid';
        host.appendChild(grid);
        const tables = document.createElement('div');
        tables.id = 'kkCapacityTables';
        tables.className = 'kk-capacity-tables';
        host.appendChild(tables);
        showWeekPanel(weekPanel);
    }

    function weekPanelTabs() {
        const tabs = document.createElement('div');
        tabs.className = 'kk-view-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.append(
            weekPanelButton('viikko', 'Viikkonäkymä'),
            weekPanelButton('kapasiteetti', 'Kapasiteetti asetukset')
        );
        return tabs;
    }

    function weekPanelButton(panel, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kk-view-tab';
        button.dataset.kkPanel = panel;
        button.setAttribute('role', 'tab');
        button.textContent = label;
        button.addEventListener('click', () => showWeekPanel(panel));
        return button;
    }

    function markWeekPanelTabs() {
        document.querySelectorAll('.kk-view-tab').forEach((button) => {
            const active = button.dataset.kkPanel === weekPanel;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function showWeekPanel(panel) {
        weekPanel = panel === 'kapasiteetti' ? 'kapasiteetti' : 'viikko';
        const grid = document.getElementById('kkWeekGrid');
        const tables = document.getElementById('kkCapacityTables');
        if (weekPanel !== 'viikko') {
            openDayKey = null;
            removeDayScreen();
        }
        if (grid) grid.hidden = weekPanel !== 'viikko';
        if (tables) tables.hidden = weekPanel !== 'kapasiteetti';
        markWeekPanelTabs();
        if (weekPanel === 'viikko') paintWeekGrid();
        else paintCapacityTables();
    }

    function paintWeekGrid() {
        const grid = document.getElementById('kkWeekGrid');
        if (!grid) return;
        withProductionSnapshot(() => {
            const monday = viewedMonday();
            const today = new Date();
            grid.replaceChildren(expandedWeeks ? renderSpanTable(monday, today) : renderWeekTable(monday, today));
            removeDayScreen();
            const screen = renderOpenDay(monday);
            if (screen) document.body.appendChild(screen);
        });
    }

    function paintWeekGridOnly() {
        const grid = document.getElementById('kkWeekGrid');
        if (!grid) return;
        withProductionSnapshot(() => {
            const monday = viewedMonday();
            const today = new Date();
            grid.replaceChildren(expandedWeeks ? renderSpanTable(monday, today) : renderWeekTable(monday, today));
        });
    }

    function paintCapacityTables() {
        const tables = document.getElementById('kkCapacityTables');
        if (!tables) return;
        tables.replaceChildren();
        DEPARTMENTS.forEach((department) => {
            const section = document.createElement('section');
            section.className = 'kk-capacity-section';
            const heading = document.createElement('h3');
            heading.className = 'kk-capacity-heading';
            heading.textContent = DEPARTMENT_LABELS[department];
            section.append(heading, renderCapacity(department));
            tables.appendChild(section);
        });
    }

    function reloadCapacity(focusId) {
        paintCapacityTables();
        paintWeekGridOnly();
        if (!focusId) return;
        const field = document.getElementById(focusId);
        if (field) field.focus();
    }

    function addDays(date, count) {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        next.setDate(next.getDate() + count);
        return next;
    }

    function dateFromIso(iso) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        return date;
    }

    function isWorkday(date) {
        const day = date.getDay();
        return day !== 0 && day !== 6;
    }

    function shiftWorkdays(date, count) {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const step = count < 0 ? -1 : 1;
        let left = Math.abs(count);
        let guard = 0;
        while (left > 0 && guard < 400) {
            next.setDate(next.getDate() + step);
            guard += 1;
            if (isWorkday(next)) left -= 1;
        }
        return next;
    }

    function departmentLeadDays() {
        const maalaus = transitionDays('maalaus');
        const hitsaus = transitionDays('hitsaus');
        const saha = transitionDays('saha');
        return {
            saha: maalaus + hitsaus + saha,
            hitsaus: maalaus + hitsaus,
            maalaus: maalaus,
            kokoonpano: 0
        };
    }

    function departmentDayIso(shipIso, lead) {
        const ship = dateFromIso(shipIso);
        if (!ship || !lead) return shipIso;
        return isoFromDate(shiftWorkdays(ship, -lead));
    }

    function shipIsoForDepartmentDay(department, dayIso) {
        const day = dateFromIso(dayIso);
        const lead = departmentLeadDays()[department] || 0;
        if (!day || !lead) return dayIso;
        return isoFromDate(shiftWorkdays(day, lead));
    }

    function activeWeekKey() {
        if (selectedWeekKey) return selectedWeekKey;
        return currentIsoWeekKey();
    }

    function mondayFromIsoWeekKey(weekKey) {
        const parsed = parseIsoWeekKey(weekKey);
        const jan4 = new Date(Date.UTC(parsed.year, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7;
        const thursday = new Date(jan4);
        thursday.setUTCDate(jan4.getUTCDate() - jan4Day + 4 + (parsed.week - 1) * 7);
        const monday = new Date(thursday);
        monday.setUTCDate(thursday.getUTCDate() - 3);
        return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
    }

    function viewedMonday() {
        return mondayFromIsoWeekKey(activeWeekKey());
    }

    function weekChoices(selected) {
        const keys = new Set();
        for (let delta = -26; delta <= 12; delta += 1) {
            keys.add(shiftIsoWeekKey(selected, delta));
        }
        keys.add(currentIsoWeekKey());
        keys.add(selected);
        return [...keys].sort().reverse();
    }

    function formatDayMonth(date) {
        return date.getDate() + '.' + (date.getMonth() + 1) + '.';
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }

    function buildWeekControls(afterChange) {
        const weekKey = activeWeekKey();
        const controls = document.createElement('div');
        controls.className = 'lapivienti-week-controls kk-week-controls';

        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'lapivienti-week-btn';
        prev.setAttribute('aria-label', 'Edellinen viikko');
        prev.textContent = '‹';
        prev.addEventListener('click', () => {
            selectedWeekKey = shiftIsoWeekKey(weekKey, -1);
            afterChange();
        });

        const select = document.createElement('select');
        select.className = 'lapivienti-week-select';
        select.setAttribute('aria-label', 'Viikko');
        weekChoices(weekKey).forEach((key) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = formatIsoWeekLabel(key);
            option.selected = key === weekKey;
            select.appendChild(option);
        });
        select.addEventListener('change', () => {
            selectedWeekKey = select.value;
            afterChange();
        });

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'lapivienti-week-btn';
        next.setAttribute('aria-label', 'Seuraava viikko');
        next.textContent = '›';
        next.addEventListener('click', () => {
            selectedWeekKey = shiftIsoWeekKey(weekKey, 1);
            afterChange();
        });

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'kk-span-toggle' + (expandedWeeks ? ' is-active' : '');
        toggle.setAttribute('aria-pressed', expandedWeeks ? 'true' : 'false');
        toggle.textContent = 'Laajennettu viikkonäkymä';
        toggle.addEventListener('click', () => {
            expandedWeeks = !expandedWeeks;
            openDayKey = null;
            reviewDayIndex = null;
            reviewSelection.clear();
            afterChange();
        });

        controls.append(prev, select, next, toggle);
        return controls;
    }

    function isoFromDate(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return date.getFullYear() + '-' + month + '-' + day;
    }

    function readStorageMap(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function shipDateForItem(jobNumber, itemName, jobShipDates, jobBlocks, itemBlocks) {
        const blockId = itemBlocks[jobNumber + '-' + itemName];
        const blocks = Array.isArray(jobBlocks[jobNumber]) ? jobBlocks[jobNumber] : [];
        const block = blocks.find((entry) => entry && entry.id === blockId);
        const blockDate = typeof normalizeShipDate === 'function' ? normalizeShipDate(block && block.shipDate) : '';
        if (blockDate) return blockDate;
        return typeof normalizeShipDate === 'function' ? normalizeShipDate(jobShipDates[jobNumber]) : '';
    }

    function jobIsFullyPackedFromMaps(mittatData, packed, jobNumber) {
        const names = Object.keys(mittatData[jobNumber] || {});
        return names.length > 0 && names.every((itemName) => packed[jobNumber + '-' + itemName]);
    }

    function buildProductionSnapshot() {
        const mittatData = readStorageMap('mittatData');
        const packed = readStorageMap('packedMitat');
        const departmentDone = {
            saha: readStorageMap('checkedSahattu'),
            hitsaus: readStorageMap('checkedHitsattu'),
            maalaus: readStorageMap('checkedMaalattu'),
            kokoonpano: readStorageMap('doneMitat')
        };
        const jobShipDates = readStorageMap('jobShipDates');
        const jobBlocks = readStorageMap('jobBlocks');
        const itemBlocks = readStorageMap('itemBlocks');
        const jobs = typeof loadKuormaKoeJobs === 'function' ? loadKuormaKoeJobs() : [];
        const leadDays = departmentLeadDays();
        const byKey = new Map();
        jobs.forEach((jobNumber) => {
            const items = mittatData[jobNumber];
            if (!items || typeof items !== 'object') return;
            const names = Object.keys(items);
            if (!names.length || jobIsFullyPackedFromMaps(mittatData, packed, jobNumber)) return;
            names.forEach((itemName) => {
                if (packed[jobNumber + '-' + itemName]) return;
                const shipDay = shipDateForItem(jobNumber, itemName, jobShipDates, jobBlocks, itemBlocks);
                if (!shipDay) return;
                const checkKey = jobNumber + '-' + itemName;
                const jobKey = String(jobNumber);
                DEPARTMENTS.forEach((department) => {
                    const amount = items[itemName] && items[itemName].kuorma ? items[itemName].kuorma[department] : null;
                    const key = department + '|' + departmentDayIso(shipDay, leadDays[department] || 0);
                    let list = byKey.get(key);
                    if (!list) {
                        list = [];
                        byKey.set(key, list);
                    }
                    const ownDone = !!(departmentDone[department] && departmentDone[department][checkKey]);
                    const previous = PREVIOUS_DEPARTMENT[department] || '';
                    const previousDone = !previous || !!(departmentDone[previous] && departmentDone[previous][checkKey]);
                    list.push({
                        jobNumber: jobKey,
                        itemName: String(itemName),
                        minutes: typeof amount === 'number' ? amount : null,
                        done: ownDone,
                        ready: !ownDone && previousDone
                    });
                });
            });
        });
        return byKey;
    }

    function withProductionSnapshot(fn) {
        const previous = productionSnapshot;
        productionSnapshot = buildProductionSnapshot();
        try {
            return fn();
        } finally {
            productionSnapshot = previous;
        }
    }

    function productionDayItems(department, date) {
        const day = isoFromDate(date);
        if (!day) return [];
        const snapshot = productionSnapshot || buildProductionSnapshot();
        const list = snapshot.get(department + '|' + day);
        return list ? list.slice() : [];
    }

    function productionLoadMinutes(department, date) {
        return splitLoadMinutes(productionDayItems(department, date)).total;
    }

    function splitLoadMinutes(items) {
        const known = (items || []).filter((item) => !item.done && typeof item.minutes === 'number');
        if (!known.length) return { ready: null, upcoming: null, total: null };
        const sum = (list) => list.reduce((total, item) => total + item.minutes, 0);
        const ready = sum(known.filter((item) => item.ready));
        const upcoming = sum(known.filter((item) => !item.ready));
        return { ready: ready, upcoming: upcoming, total: ready + upcoming };
    }

    function loadPart(text, kind) {
        const part = document.createElement('span');
        part.className = 'kk-load-part ' + kind;
        part.textContent = text;
        return part;
    }

    function loadEquation(split) {
        const line = document.createElement('div');
        line.className = 'kk-day-line is-load';
        const label = document.createElement('span');
        label.className = 'kk-day-kicker';
        label.textContent = 'Kuorma';
        const value = document.createElement('span');
        value.className = 'kk-day-amount';
        if (split.total == null) {
            value.classList.add('is-empty');
            value.textContent = '—';
        } else {
            value.append(
                loadPart(formatLoadMinutes(split.ready), 'is-ready'),
                loadPart(' + ', 'is-join'),
                loadPart(formatLoadMinutes(split.upcoming), 'is-next'),
                loadPart(' = ', 'is-join'),
                loadPart(formatLoadMinutes(split.total), 'is-total')
            );
        }
        line.append(label, value);
        return line;
    }

    function loadSentence(split) {
        if (split.total == null) return 'Kuormaa ei ole.';
        return 'Tehtävissä ' + formatLoadMinutes(split.ready) + ', tuleva ' + formatLoadMinutes(split.upcoming) + ', yhteensä ' + formatLoadMinutes(split.total) + '.';
    }

    function formatLoadMinutes(minutes) {
        if (typeof minutes !== 'number') return '—';
        return formatSum(minutes / 60);
    }

    function weekKeyFromMonday(monday) {
        return typeof dateToIsoWeekKey === 'function' ? dateToIsoWeekKey(monday) : '';
    }

    function weekIsPast(monday) {
        return startOfDay(addDays(monday, 6)).getTime() < startOfDay(new Date()).getTime();
    }

    function spanMondays(startMonday) {
        const mondays = [];
        for (let index = 0; index < 5; index += 1) mondays.push(addDays(startMonday, index * 7));
        return mondays;
    }

    function spanRangeLabel(monday) {
        const mondays = spanMondays(monday);
        const first = parseIsoWeekKey(weekKeyFromMonday(mondays[0]));
        const last = parseIsoWeekKey(weekKeyFromMonday(mondays[4]));
        if (!first || !last) return 'Viikot';
        if (first.year === last.year) return 'Viikot ' + first.week + '–' + last.week;
        return 'Viikot ' + first.week + '/' + first.year + '–' + last.week + '/' + last.year;
    }

    function productionWeekItems(department, monday) {
        const items = [];
        for (let index = 0; index < 7; index += 1) {
            const date = addDays(monday, index);
            productionDayItems(department, date).forEach((item) => {
                items.push(Object.assign({}, item, { date: date, dayIndex: index }));
            });
        }
        return items;
    }

    function sumMinutes(items) {
        const known = (items || [])
            .filter((item) => !item.done)
            .map((item) => item.minutes)
            .filter((minutes) => typeof minutes === 'number');
        if (!known.length) return null;
        return known.reduce((sum, minutes) => sum + minutes, 0);
    }

    function removeDayScreen() {
        const existing = document.getElementById('kkDayScreen');
        if (existing) existing.remove();
    }

    function closeDayScreen() {
        openDayKey = null;
        reviewDayIndex = null;
        reviewSelection.clear();
        paintWeekGrid();
    }

    function loadRatio(minutes, hours) {
        if (typeof minutes !== 'number' || minutes <= 0) return null;
        return hours > 0 ? (minutes / 60) / hours : Infinity;
    }

    function formatRatio(ratio) {
        if (ratio === null) return '';
        if (!Number.isFinite(ratio)) return 'Ei kapasiteettia';
        return Math.round(ratio * 100) + ' %';
    }

    function dayFact(word, amount, extraClass) {
        const line = document.createElement('div');
        line.className = 'kk-day-line';
        const label = document.createElement('span');
        label.className = 'kk-day-kicker';
        label.textContent = word;
        const value = document.createElement('span');
        value.className = 'kk-day-amount' + (extraClass ? ' ' + extraClass : '');
        value.textContent = amount;
        line.append(label, value);
        return line;
    }

    function buildMeter(ratio) {
        const meter = document.createElement('div');
        meter.className = 'kk-meter';
        meter.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('div');
        fill.className = 'kk-meter-fill';
        if (ratio !== null) {
            fill.style.width = Math.min(100, ratio * 100) + '%';
            if (ratio > 1) fill.classList.add('is-over');
        }
        meter.appendChild(fill);
        return meter;
    }

    function weekdayIndex(date) {
        const day = date.getDay();
        return day === 0 ? 6 : day - 1;
    }

    function namedWorkers(department) {
        const workers = (state.kapasiteetti[department] && state.kapasiteetti[department].workers) || [];
        return workers
            .filter((worker) => String(worker.name || '').trim())
            .slice()
            .sort((a, b) => String(a.name).trim().localeCompare(String(b.name).trim(), 'fi'));
    }

    function hoursToAdd(minutes, capacityHours) {
        if (typeof minutes !== 'number' || minutes <= 0) return 0;
        const deficit = Math.round(((minutes / 60) - capacityHours) * 10) / 10;
        return deficit > 0 ? deficit : 0;
    }

    function renderOpenDay(monday) {
        if (!openDayKey) return null;
        if (openDayKey.indexOf('span|') === 0) {
            const parts = openDayKey.split('|');
            const department = parts[1];
            const weekKey = parts[2];
            if (!DEPARTMENT_LABELS[department] || !parseIsoWeekKey(weekKey)) return null;
            const visible = spanMondays(monday).some((day) => weekKeyFromMonday(day) === weekKey);
            if (!visible) return null;
            return renderSpanWeekScreen(department, weekKey);
        }
        if (openDayKey.indexOf('dept|') === 0) {
            const department = openDayKey.slice(5);
            if (!DEPARTMENT_LABELS[department]) return null;
            return renderDeptWeekScreen(department, monday);
        }
        const split = openDayKey.indexOf('|');
        if (split < 1) return null;
        const department = openDayKey.slice(0, split);
        const iso = openDayKey.slice(split + 1);
        if (!DEPARTMENT_LABELS[department]) return null;
        let date = null;
        for (let index = 0; index < 7; index += 1) {
            const candidate = addDays(monday, index);
            if (isoFromDate(candidate) === iso) date = candidate;
        }
        if (!date) return null;
        return renderDayScreen(department, date);
    }

    function renderWeekTable(monday, today) {
        const scroll = document.createElement('div');
        scroll.className = 'kk-week-scroll';
        const grid = document.createElement('div');
        grid.className = 'kk-timetable';

        const corner = document.createElement('div');
        corner.className = 'kk-corner';
        corner.textContent = 'Osasto';
        grid.appendChild(corner);

        for (let index = 0; index < 7; index += 1) {
            const date = addDays(monday, index);
            const head = document.createElement('div');
            head.className = 'kk-day-head' + (index >= 5 ? ' is-weekend' : '') + (sameDay(date, today) ? ' is-today' : '');
            const name = document.createElement('span');
            name.className = 'kk-day-name';
            const shortName = WEEKDAYS[index];
            name.textContent = shortName.charAt(0).toUpperCase() + shortName.slice(1);
            const num = document.createElement('span');
            num.className = 'kk-day-num';
            num.textContent = formatDayMonth(date);
            head.append(name, num);
            grid.appendChild(head);
        }

        DEPARTMENTS.forEach((department) => {
            const deptKey = 'dept|' + department;
            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'kk-dept-label' + (openDayKey === deptKey ? ' is-open' : '');
            label.setAttribute('aria-haspopup', 'dialog');
            label.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ', viikkokatsaus');
            const deptName = document.createElement('span');
            deptName.className = 'kk-dept-name';
            deptName.textContent = DEPARTMENT_LABELS[department];
            const deptSub = document.createElement('span');
            deptSub.className = 'kk-dept-sub';
            label.append(deptName, deptSub);
            label.addEventListener('click', () => {
                openDayKey = deptKey;
                paintWeekGrid();
            });
            grid.appendChild(label);

            let weekHours = 0;
            let weekMinutes = 0;
            let weekHasLoad = false;

            for (let index = 0; index < 7; index += 1) {
                const date = addDays(monday, index);
                const hours = departmentDayHours(department, WEEKDAYS[index]);
                const split = splitLoadMinutes(productionDayItems(department, date));
                const minutes = split.total;
                const ratio = loadRatio(minutes, hours);
                weekHours += hours;
                if (typeof minutes === 'number') {
                    weekMinutes += minutes;
                    weekHasLoad = true;
                }
                const hoursText = formatSum(hours);
                const dayKey = department + '|' + isoFromDate(date);

                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'kk-day'
                    + (index >= 5 ? ' is-weekend' : '')
                    + (sameDay(date, today) ? ' is-today' : '')
                    + (openDayKey === dayKey ? ' is-open' : '');
                cell.setAttribute('aria-haspopup', 'dialog');
                cell.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ', ' + WEEKDAY_NAMES[index] + ' ' + formatDayMonth(date) + '. Kapasiteetti ' + hoursText + '. ' + loadSentence(split));
                cell.addEventListener('click', () => {
                    openDayKey = dayKey;
                    paintWeekGrid();
                });

                cell.append(
                    loadEquation(split),
                    dayFact('Kapasiteetti', hoursText, '')
                );
                if (ratio !== null) {
                    const quota = document.createElement('div');
                    quota.className = 'kk-day-ratio' + (ratio > 1 ? ' is-over' : '');
                    quota.textContent = Number.isFinite(ratio)
                        ? ('=' + Math.round(ratio * 100) + '% kiintiö')
                        : 'Ei kapasiteettia';
                    cell.appendChild(quota);
                }
                cell.appendChild(buildMeter(ratio));
                grid.appendChild(cell);
            }

            deptSub.textContent = formatLoadMinutes(weekHasLoad ? weekMinutes : null) + ' / ' + formatSum(weekHours);
        });

        scroll.appendChild(grid);
        return scroll;
    }

    function renderSpanTable(startMonday, today) {
        const scroll = document.createElement('div');
        scroll.className = 'kk-week-scroll';
        const grid = document.createElement('div');
        grid.className = 'kk-timetable is-span';
        const currentKey = weekKeyFromMonday(startOfDay(today));

        const corner = document.createElement('div');
        corner.className = 'kk-corner';
        corner.textContent = 'Osasto';
        grid.appendChild(corner);

        const mondays = spanMondays(startMonday);
        mondays.forEach((monday) => {
            const weekKey = weekKeyFromMonday(monday);
            const parsed = parseIsoWeekKey(weekKey);
            const head = document.createElement('div');
            head.className = 'kk-day-head' + (weekKey === currentKey ? ' is-today' : '');
            const name = document.createElement('span');
            name.className = 'kk-day-name';
            name.textContent = 'Viikko ' + (parsed ? parsed.week : '');
            const num = document.createElement('span');
            num.className = 'kk-day-num';
            num.textContent = formatDayMonth(monday) + '–' + formatDayMonth(addDays(monday, 6));
            head.append(name, num);
            grid.appendChild(head);
        });

        DEPARTMENTS.forEach((department) => {
            const deptKey = 'dept|' + department;
            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'kk-dept-label' + (openDayKey === deptKey ? ' is-open' : '');
            label.setAttribute('aria-haspopup', 'dialog');
            label.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ', viikkokatsaus');
            const deptName = document.createElement('span');
            deptName.className = 'kk-dept-name';
            deptName.textContent = DEPARTMENT_LABELS[department];
            const deptSub = document.createElement('span');
            deptSub.className = 'kk-dept-sub';
            label.append(deptName, deptSub);
            label.addEventListener('click', () => {
                openDayKey = deptKey;
                paintWeekGrid();
            });
            grid.appendChild(label);

            let spanHours = 0;
            let spanMinutes = 0;
            let spanHasLoad = false;
            mondays.forEach((monday) => {
                const weekKey = weekKeyFromMonday(monday);
                const items = productionWeekItems(department, monday);
                const minutes = sumMinutes(items);
                const hours = departmentHoursForWeek(department, weekKey);
                const ratio = loadRatio(minutes, hours);
                spanHours += hours;
                if (typeof minutes === 'number') {
                    spanMinutes += minutes;
                    spanHasLoad = true;
                }
                const hoursText = formatSum(hours);
                const loadText = formatLoadMinutes(minutes);
                const cellKey = 'span|' + department + '|' + weekKey;
                const parsed = parseIsoWeekKey(weekKey);
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'kk-day'
                    + (weekKey === currentKey ? ' is-today' : '')
                    + (openDayKey === cellKey ? ' is-open' : '');
                const loadLabel = typeof minutes === 'number' ? ('Kuorma ' + loadText + '.') : 'Kuormaa ei ole.';
                cell.setAttribute('aria-haspopup', 'dialog');
                cell.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ', viikko ' + (parsed ? parsed.week : '') + '. Kapasiteetti ' + hoursText + '. ' + loadLabel);
                cell.addEventListener('click', () => {
                    openDayKey = cellKey;
                    paintWeekGrid();
                });
                cell.append(
                    dayFact('Kuorma', loadText, typeof minutes === 'number' ? '' : 'is-empty'),
                    dayFact('Kapasiteetti', hoursText, '')
                );
                if (ratio !== null) {
                    const quota = document.createElement('div');
                    quota.className = 'kk-day-ratio' + (ratio > 1 ? ' is-over' : '');
                    quota.textContent = Number.isFinite(ratio)
                        ? ('=' + Math.round(ratio * 100) + '% kiintiö')
                        : 'Ei kapasiteettia';
                    cell.appendChild(quota);
                }
                cell.appendChild(buildMeter(ratio));
                grid.appendChild(cell);
            });
            deptSub.textContent = formatLoadMinutes(spanHasLoad ? spanMinutes : null) + ' / ' + formatSum(spanHours);
        });

        scroll.appendChild(grid);
        return scroll;
    }

    function renderSpanWeekScreen(department, weekKey) {
        const monday = mondayFromIsoWeekKey(weekKey);
        const items = productionWeekItems(department, monday);
        const minutes = sumMinutes(items);
        const hours = departmentHoursForWeek(department, weekKey);
        const ratio = loadRatio(minutes, hours);
        const parsed = parseIsoWeekKey(weekKey);

        const screen = document.createElement('div');
        screen.id = 'kkDayScreen';
        screen.className = 'kk-day-screen';
        screen.addEventListener('click', (event) => {
            if (event.target === screen) closeDayScreen();
        });

        const sheet = document.createElement('div');
        sheet.className = 'kk-day-sheet';
        sheet.tabIndex = -1;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'kkDayTitle');
        sheet.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeDayScreen();
        });

        const head = document.createElement('header');
        head.className = 'kk-day-sheet-head';
        const titles = document.createElement('div');
        const eyebrow = document.createElement('div');
        eyebrow.className = 'kk-day-eyebrow';
        eyebrow.textContent = DEPARTMENT_LABELS[department];
        const title = document.createElement('h3');
        title.id = 'kkDayTitle';
        title.className = 'kk-day-title';
        title.textContent = 'Viikko ' + (parsed ? parsed.week : '');
        titles.append(eyebrow, title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'kk-day-close';
        close.textContent = 'Sulje';
        close.addEventListener('click', closeDayScreen);
        head.append(titles, close);

        const body = document.createElement('div');
        body.className = 'kk-day-body';
        const stats = document.createElement('div');
        stats.className = 'kk-day-stats';
        const over = ratio !== null && ratio > 1;
        stats.append(
            statCard('Kuorma', formatLoadMinutes(minutes)),
            statCard('Kapasiteetti', formatSum(hours)),
            statCard('Käyttöaste', ratio === null ? '—' : formatRatio(ratio), over ? 'is-over' : '')
        );
        const statsMeter = document.createElement('div');
        statsMeter.className = 'kk-day-stats-meter';
        statsMeter.appendChild(buildMeter(ratio));
        stats.appendChild(statsMeter);

        const columns = document.createElement('div');
        columns.className = 'kk-day-columns';

        const workerCol = document.createElement('section');
        const workers = namedWorkers(department);
        const activeCount = workers.filter((worker) => {
            const days = daysFor(worker, weekKey);
            return WEEKDAYS.some((key) => (days[key] || 0) > 0);
        }).length;
        workerCol.appendChild(sectionHeading('Työntekijät', activeCount ? String(activeCount) : ''));
        if (!workers.length) {
            workerCol.appendChild(emptyNote('Ei aktiivisia työntekijöitä.'));
        } else {
            const list = document.createElement('div');
            list.className = 'kk-list';
            workers.forEach((worker) => {
                const days = daysFor(worker, weekKey);
                const total = WEEKDAYS.reduce((sum, key) => sum + (days[key] || 0), 0);
                list.appendChild(listRow(String(worker.name || '').trim(), formatSum(total), false));
            });
            workerCol.appendChild(list);
        }
        const gap = hoursToAdd(minutes, hours);
        if (gap > 0) workerCol.appendChild(gapNote(gap));

        const productCol = document.createElement('section');
        productCol.appendChild(sectionHeading('Tuotteet', items.length ? items.length + ' kpl' : ''));
        if (!items.length) {
            productCol.appendChild(emptyNote('Ei tuotteita tälle viikolle.'));
        } else {
            const groups = new Map();
            items.forEach((item) => {
                if (!groups.has(item.jobNumber)) groups.set(item.jobNumber, []);
                groups.get(item.jobNumber).push(item);
            });
            [...groups.keys()].sort((a, b) => a.localeCompare(b, 'fi', { numeric: true })).forEach((jobNumber) => {
                const jobItems = groups.get(jobNumber);
                const jobMinutes = sumMinutes(jobItems);
                const job = document.createElement('div');
                job.className = 'kk-job';
                const jobHead = document.createElement('div');
                jobHead.className = 'kk-job-head';
                const jobName = document.createElement('span');
                jobName.textContent = 'Työ ' + jobNumber;
                const jobLoad = document.createElement('span');
                jobLoad.textContent = formatLoadMinutes(jobMinutes);
                jobHead.append(jobName, jobLoad);
                job.appendChild(jobHead);
                jobItems
                    .slice()
                    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'fi', { numeric: true }))
                    .forEach((item) => job.appendChild(listRow(item.itemName, formatLoadMinutes(item.minutes), item.done)));
                productCol.appendChild(job);
            });
        }

        columns.append(workerCol, productCol);
        body.append(stats, columns);
        sheet.append(head, body);
        screen.appendChild(sheet);
        setTimeout(() => sheet.focus(), 0);
        return screen;
    }

    function statCard(label, value, extraClass, key) {
        const card = document.createElement('div');
        card.className = 'kk-stat';
        const name = document.createElement('div');
        name.className = 'kk-stat-label';
        name.textContent = label;
        const amount = document.createElement('div');
        amount.className = 'kk-stat-value' + (extraClass ? ' ' + extraClass : '');
        amount.textContent = value;
        if (key) amount.dataset.kkStat = key;
        card.append(name, amount);
        return card;
    }

    function loadStatCard(split) {
        const card = document.createElement('div');
        card.className = 'kk-stat';
        const name = document.createElement('div');
        name.className = 'kk-stat-label';
        name.textContent = 'Kuorma';
        const amount = document.createElement('div');
        amount.className = 'kk-load-lines';
        if (split.total == null) {
            const empty = document.createElement('div');
            empty.className = 'kk-stat-value is-empty';
            empty.textContent = '—';
            amount.appendChild(empty);
        } else {
            [
                ['Tehtävissä', split.ready, 'is-ready'],
                ['Tuleva', split.upcoming, 'is-next'],
                ['Yhteensä', split.total, 'is-total']
            ].forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'kk-load-line ' + entry[2];
                const word = document.createElement('span');
                word.textContent = entry[0];
                const value = document.createElement('span');
                value.textContent = formatLoadMinutes(entry[1]);
                row.append(word, value);
                amount.appendChild(row);
            });
        }
        card.append(name, amount);
        return card;
    }

    function appendProductSection(host, title, items, emptyText) {
        host.appendChild(sectionHeading(title, items.length ? items.length + ' kpl' : ''));
        if (!items.length) {
            if (emptyText) host.appendChild(emptyNote(emptyText));
            return;
        }
        const groups = new Map();
        items.forEach((item) => {
            if (!groups.has(item.jobNumber)) groups.set(item.jobNumber, []);
            groups.get(item.jobNumber).push(item);
        });
        [...groups.keys()].sort((a, b) => a.localeCompare(b, 'fi', { numeric: true })).forEach((jobNumber) => {
            const jobItems = groups.get(jobNumber);
            const known = jobItems.filter((item) => !item.done).map((item) => item.minutes).filter((value) => typeof value === 'number');
            const jobMinutes = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
            const job = document.createElement('div');
            job.className = 'kk-job';
            const jobHead = document.createElement('div');
            jobHead.className = 'kk-job-head';
            const jobName = document.createElement('span');
            jobName.textContent = 'Työ ' + jobNumber;
            const jobLoad = document.createElement('span');
            jobLoad.textContent = formatLoadMinutes(jobMinutes);
            jobHead.append(jobName, jobLoad);
            job.appendChild(jobHead);
            jobItems
                .slice()
                .sort((a, b) => a.itemName.localeCompare(b.itemName, 'fi', { numeric: true }))
                .forEach((item) => job.appendChild(listRow(item.itemName, formatLoadMinutes(item.minutes), item.done)));
            host.appendChild(job);
        });
    }

    function sectionHeading(label, meta) {
        const heading = document.createElement('div');
        heading.className = 'kk-day-section';
        const title = document.createElement('h4');
        title.textContent = label;
        const info = document.createElement('span');
        info.textContent = meta;
        heading.append(title, info);
        return heading;
    }

    function listRow(label, value, done) {
        const row = document.createElement('div');
        row.className = 'kk-list-row';
        const name = document.createElement('span');
        name.textContent = label;
        const tail = document.createElement('span');
        tail.className = 'kk-list-tail';
        const amount = document.createElement('span');
        amount.textContent = value;
        tail.appendChild(amount);
        if (done) {
            const mark = document.createElement('span');
            mark.className = 'kk-done-mark';
            mark.textContent = 'Tehty';
            tail.appendChild(mark);
        }
        row.append(name, tail);
        return row;
    }

    function emptyNote(text) {
        const empty = document.createElement('p');
        empty.className = 'kk-day-empty';
        empty.textContent = text;
        return empty;
    }

    function dayAllative(name) {
        if (name === 'keskiviikko') return 'keskiviikolle';
        return name + 'lle';
    }

    function dayAblative(name) {
        if (name === 'keskiviikko') return 'keskiviikolta';
        return name + 'lta';
    }

    function reviewItemKey(item) {
        return String(item.jobNumber || '') + '|' + String(item.itemName || '');
    }

    function syncMoveHereButtons() {
        const hasSelection = reviewSelection.size > 0 && reviewDayIndex !== null;
        document.querySelectorAll('.kk-move-here').forEach((button) => {
            const sameDay = Number(button.dataset.kkDay) === reviewDayIndex;
            button.hidden = !hasSelection || sameDay;
        });
    }

    function nextEraName(blocks) {
        let max = 1;
        (blocks || []).forEach((block) => {
            const match = /^ERÄ\s+(\d+)$/i.exec(String(block && block.name || '').trim());
            if (!match) return;
            const number = parseInt(match[1], 10);
            if (number > max) max = number;
        });
        return 'ERÄ ' + (max + 1);
    }

    function moveReviewedItems(items, isoDate, options) {
        const department = options && options.department;
        const sourceIso = department ? shipIsoForDepartmentDay(department, isoDate) : isoDate;
        const shipDate = typeof normalizeShipDate === 'function' ? (normalizeShipDate(sourceIso) || sourceIso) : sourceIso;
        if (!shipDate || !items || !items.length) return;
        const groups = new Map();
        items.forEach((item) => {
            const jobNumber = String(item.jobNumber || '');
            const itemName = String(item.itemName || '');
            if (!jobNumber || !itemName) return;
            if (!groups.has(jobNumber)) groups.set(jobNumber, []);
            const names = groups.get(jobNumber);
            if (!names.includes(itemName)) names.push(itemName);
        });
        if (!groups.size) return;
        const jobBlocks = readStorageMap('jobBlocks');
        const itemBlocks = readStorageMap('itemBlocks');
        groups.forEach((names, jobNumber) => {
            const blocks = Array.isArray(jobBlocks[jobNumber]) ? jobBlocks[jobNumber].slice() : [];
            const id = typeof createJobBlockId === 'function'
                ? createJobBlockId()
                : ('blk_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000));
            blocks.push({ id: id, name: nextEraName(blocks), shipDate: shipDate });
            jobBlocks[jobNumber] = blocks;
            names.forEach((itemName) => {
                itemBlocks[jobNumber + '-' + itemName] = id;
            });
        });
        localStorage.setItem('jobBlocks', JSON.stringify(jobBlocks));
        localStorage.setItem('itemBlocks', JSON.stringify(itemBlocks));
        groups.forEach((names, jobNumber) => {
            if (typeof persistMitatBlockState === 'function') persistMitatBlockState(jobNumber);
        });
        if (options && options.silent) return;
        reviewSelection.clear();
        if (typeof loadMittatView === 'function') loadMittatView();
        paintWeekGrid();
        if (typeof showToast === 'function') showToast('Tuotteet siirretty', 'success');
    }

    function moveItemsKeepingWeekday(items, targetMonday, department) {
        const groups = new Map();
        (items || []).forEach((item) => {
            const offset = Number.isInteger(item.dayIndex) ? item.dayIndex : null;
            if (offset === null || offset < 0 || offset > 6) return;
            const target = isoFromDate(addDays(targetMonday, offset));
            if (!groups.has(target)) groups.set(target, []);
            groups.get(target).push(item);
        });
        if (!groups.size) return;
        groups.forEach((group, isoDate) => moveReviewedItems(group, isoDate, { silent: true, department: department }));
        reviewSelection.clear();
        if (typeof loadMittatView === 'function') loadMittatView();
        paintWeekGrid();
        if (typeof showToast === 'function') showToast('Tuotteet siirretty', 'success');
    }

    function toggleReviewPanel(header, panel, icon) {
        const open = panel.style.display === 'none';
        panel.style.display = open ? '' : 'none';
        header.setAttribute('aria-expanded', open ? 'true' : 'false');
        icon.textContent = open ? '▲' : '▼';
        icon.classList.toggle('rotated', open);
    }

    function renderReviewMeasures(record) {
        const details = document.createElement('div');
        details.className = 'mitat-details';
        details.style.display = 'none';
        const sections = record && Array.isArray(record.data) ? record.data : [];
        let shown = false;
        sections.forEach((section) => {
            const rows = section && Array.isArray(section.items) ? section.items : [];
            if (!rows.length) return;
            shown = true;
            const block = document.createElement('div');
            block.className = 'mitat-result-section';
            const title = document.createElement('h6');
            const rawTitle = section.title || '';
            title.textContent = typeof getLasilistaSectionTitle === 'function'
                ? getLasilistaSectionTitle(rawTitle, record)
                : String(rawTitle);
            const list = document.createElement('div');
            list.className = 'mitat-result-items';
            rows.forEach((resultItem) => {
                const line = document.createElement('div');
                line.className = 'mitat-result-item';
                const label = document.createElement('span');
                label.className = 'mitat-result-label';
                label.textContent = resultItem && resultItem.label != null ? String(resultItem.label) : '';
                const value = document.createElement('span');
                value.className = 'mitat-result-value';
                value.textContent = resultItem && resultItem.value != null ? String(resultItem.value) : '';
                line.append(label, value);
                list.appendChild(line);
            });
            block.append(title, list);
            details.appendChild(block);
        });
        if (!shown) details.appendChild(emptyNote('Ei mittoja.'));
        return details;
    }

    function renderReviewProducts(department, day, presetItems) {
        const host = document.createElement('div');
        host.className = 'kk-move-products';
        const items = Array.isArray(presetItems) ? presetItems : productionDayItems(department, day.date);
        if (!items.length) {
            host.appendChild(emptyNote(Array.isArray(presetItems) ? 'Ei tuotteita tälle viikolle.' : 'Ei tuotteita tälle päivälle.'));
            return host;
        }
        const mittatData = readStorageMap('mittatData');
        const byJob = new Map();
        items.forEach((item) => {
            if (!byJob.has(item.jobNumber)) byJob.set(item.jobNumber, []);
            byJob.get(item.jobNumber).push(item);
        });
        const nameSort = (a, b) => a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' });
        Array.from(byJob.keys()).sort(nameSort).forEach((jobNumber) => {
            const products = byJob.get(jobNumber).slice().sort((a, b) => nameSort(a.itemName, b.itemName));
            const section = document.createElement('div');
            section.className = 'mitat-job-section';
            const header = document.createElement('div');
            header.className = 'mitat-job-header';
            header.setAttribute('role', 'button');
            header.tabIndex = 0;
            header.setAttribute('aria-expanded', 'false');
            header.setAttribute('aria-label', 'Avaa/sulje työ ' + jobNumber);
            const heading = document.createElement('div');
            heading.className = 'mitat-job-heading';
            const title = document.createElement('h4');
            title.className = 'mitat-job-title';
            const prefix = document.createElement('span');
            prefix.textContent = 'Työ ';
            const number = document.createElement('span');
            number.className = 'mitat-job-number-text';
            number.textContent = jobNumber;
            title.append(prefix, number);
            heading.appendChild(title);
            const expand = document.createElement('span');
            expand.className = 'mitat-job-expand-btn';
            const icon = document.createElement('span');
            icon.className = 'mitat-toggle-icon';
            icon.textContent = '▼';
            expand.appendChild(icon);
            header.append(heading, expand);

            const jobItems = document.createElement('div');
            jobItems.className = 'mitat-job-items';
            jobItems.style.display = 'none';
            const records = mittatData[jobNumber] && typeof mittatData[jobNumber] === 'object' ? mittatData[jobNumber] : {};
            products.forEach((item) => {
                const record = records[item.itemName] || {};
                const product = document.createElement('div');
                product.className = 'mitat-item-section';
                const productHeader = document.createElement('div');
                productHeader.className = 'mitat-item-header';
                productHeader.setAttribute('role', 'button');
                productHeader.tabIndex = 0;
                productHeader.setAttribute('aria-expanded', 'false');
                productHeader.setAttribute('aria-label', 'Avaa/sulje ' + item.itemName + (item.done ? ', tehty' : ''));
                const main = document.createElement('div');
                main.className = 'mitat-item-header-main';
                const titleWrap = document.createElement('div');
                titleWrap.className = 'kk-review-title';
                const productTitle = document.createElement('h5');
                productTitle.className = 'mitat-item-title';
                productTitle.textContent = '- ' + item.itemName;
                titleWrap.appendChild(productTitle);
                if (item.done) {
                    const done = document.createElement('span');
                    done.className = 'kk-review-done';
                    done.textContent = 'Tehty';
                    titleWrap.appendChild(done);
                }
                const actions = document.createElement('div');
                actions.className = 'kk-review-actions';
                const pick = document.createElement('button');
                pick.type = 'button';
                pick.className = 'kk-day-close kk-move-select';
                const key = reviewItemKey(item);
                const paintPick = () => {
                    const chosen = reviewSelection.has(key);
                    pick.textContent = chosen ? 'Valittu' : 'Valitse';
                    pick.classList.toggle('is-chosen', chosen);
                    product.classList.toggle('is-selected', chosen);
                };
                paintPick();
                pick.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (reviewSelection.has(key)) reviewSelection.delete(key);
                    else reviewSelection.add(key);
                    paintPick();
                    syncMoveHereButtons();
                });
                const productIcon = document.createElement('span');
                productIcon.className = 'mitat-toggle-icon';
                productIcon.textContent = '▼';
                actions.append(pick, productIcon);
                main.append(titleWrap, actions);
                productHeader.appendChild(main);
                const color = String(record.lasilistaColor || '').trim();
                const unitPhrase = typeof formatItemUnitPhrase === 'function' ? formatItemUnitPhrase(record) : '';
                const metaParts = [];
                if (color) metaParts.push(color);
                if (unitPhrase) metaParts.push(unitPhrase);
                if (metaParts.length) {
                    const meta = document.createElement('div');
                    meta.className = 'mitat-item-header-secondary';
                    meta.textContent = metaParts.join(' / ');
                    productHeader.appendChild(meta);
                }
                const details = renderReviewMeasures(record);
                productHeader.addEventListener('click', (event) => {
                    event.stopPropagation();
                    toggleReviewPanel(productHeader, details, productIcon);
                });
                product.append(productHeader, details);
                jobItems.appendChild(product);
            });
            header.addEventListener('click', () => toggleReviewPanel(header, jobItems, icon));
            section.append(header, jobItems);
            host.appendChild(section);
        });
        return host;
    }

    function suggestWeekMoves(department, monday) {
        const today = startOfDay(new Date());
        const days = [];
        for (let index = 0; index < 5; index += 1) {
            const date = addDays(monday, index);
            const hours = departmentDayHours(department, WEEKDAYS[index]);
            const minutes = productionLoadMinutes(department, date);
            const capacityMinutes = Math.round(hours * 60);
            const load = typeof minutes === 'number' ? minutes : 0;
            const products = productionDayItems(department, date)
                .filter((item) => !item.done && typeof item.minutes === 'number' && item.minutes > 0)
                .slice()
                .sort((a, b) => b.minutes - a.minutes || a.itemName.localeCompare(b.itemName, 'fi'));
            days.push({
                index: index,
                date: date,
                name: WEEKDAY_NAMES[index],
                hours: hours,
                minutes: minutes,
                spare: capacityMinutes - load,
                overload: load - capacityMinutes,
                past: startOfDay(date).getTime() < today.getTime(),
                products: products
            });
        }
        const suggestions = [];
        const used = new Set();
        days.forEach((source, sourceIndex) => {
            if (source.past || source.overload <= 0) return;
            let remaining = source.overload;
            for (let targetIndex = 0; targetIndex < days.length && remaining > 0; targetIndex += 1) {
                if (targetIndex === sourceIndex) continue;
                const target = days[targetIndex];
                if (target.past || target.spare <= 0) continue;
                const picked = [];
                let taken = 0;
                source.products.forEach((item) => {
                    const key = item.jobNumber + '|' + item.itemName;
                    if (used.has(key) || taken >= remaining) return;
                    if (item.minutes > target.spare - taken) return;
                    picked.push(item);
                    taken += item.minutes;
                });
                if (!picked.length) continue;
                picked.forEach((item) => used.add(item.jobNumber + '|' + item.itemName));
                target.spare -= taken;
                remaining -= taken;
                const byJob = new Map();
                picked.forEach((item) => {
                    if (!byJob.has(item.jobNumber)) byJob.set(item.jobNumber, []);
                    byJob.get(item.jobNumber).push(item);
                });
                byJob.forEach((jobItems, jobNumber) => {
                    suggestions.push({
                        sourceName: source.name,
                        sourceIndex: source.index,
                        dayName: target.name,
                        targetDate: target.date,
                        jobNumber: jobNumber,
                        items: jobItems
                    });
                });
            }
        });
        return { days: days, suggestions: suggestions };
    }

    function suggestSpanMoves(department, startMonday) {
        const weeks = spanMondays(startMonday).map((monday, index) => {
            const weekKey = weekKeyFromMonday(monday);
            const parsed = parseIsoWeekKey(weekKey);
            const hours = departmentHoursForWeek(department, weekKey);
            const allItems = productionWeekItems(department, monday);
            const minutes = sumMinutes(allItems);
            const capacityMinutes = Math.round(hours * 60);
            const load = typeof minutes === 'number' ? minutes : 0;
            const products = allItems
                .filter((item) => !item.done && typeof item.minutes === 'number' && item.minutes > 0)
                .slice()
                .sort((a, b) => b.minutes - a.minutes || a.itemName.localeCompare(b.itemName, 'fi'));
            return {
                index: index,
                monday: monday,
                weekKey: weekKey,
                weekNumber: parsed ? parsed.week : index + 1,
                name: 'Viikko ' + (parsed ? parsed.week : ''),
                hours: hours,
                minutes: minutes,
                spare: capacityMinutes - load,
                overload: load - capacityMinutes,
                past: weekIsPast(monday),
                allItems: allItems,
                products: products
            };
        });
        const suggestions = [];
        const used = new Set();
        weeks.forEach((source, sourceIndex) => {
            if (source.past || source.overload <= 0) return;
            let remaining = source.overload;
            for (let targetIndex = 0; targetIndex < weeks.length && remaining > 0; targetIndex += 1) {
                if (targetIndex === sourceIndex) continue;
                const target = weeks[targetIndex];
                if (target.past || target.spare <= 0) continue;
                const picked = [];
                let taken = 0;
                source.products.forEach((item) => {
                    const key = item.jobNumber + '|' + item.itemName;
                    if (used.has(key) || taken >= remaining) return;
                    if (item.minutes > target.spare - taken) return;
                    picked.push(item);
                    taken += item.minutes;
                });
                if (!picked.length) continue;
                picked.forEach((item) => used.add(item.jobNumber + '|' + item.itemName));
                target.spare -= taken;
                remaining -= taken;
                const byJob = new Map();
                picked.forEach((item) => {
                    if (!byJob.has(item.jobNumber)) byJob.set(item.jobNumber, []);
                    byJob.get(item.jobNumber).push(item);
                });
                byJob.forEach((jobItems, jobNumber) => {
                    suggestions.push({
                        sourceWeek: source.weekNumber,
                        targetWeek: target.weekNumber,
                        targetMonday: target.monday,
                        jobNumber: jobNumber,
                        items: jobItems
                    });
                });
            }
        });
        return { days: weeks, suggestions: suggestions };
    }

    function buildDeptReviewBody(department, review) {
        const body = document.createElement('div');
        body.className = 'kk-day-body';
        const days = document.createElement('div');
        days.className = 'kk-move-days';
        review.days.forEach((day) => {
            const slot = document.createElement('div');
            slot.className = 'kk-move-slot';
            const field = document.createElement('div');
            field.className = 'kk-move-field';
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'kk-move-day' + (reviewDayIndex === day.index ? ' is-open' : '');
            const name = document.createElement('span');
            name.textContent = day.name.charAt(0).toUpperCase() + day.name.slice(1);
            const value = document.createElement('span');
            value.textContent = formatLoadMinutes(day.minutes) + ' / ' + formatSum(day.hours);
            if (!day.past && day.overload > 0) value.classList.add('is-over');
            row.append(name, value);
            row.addEventListener('click', () => {
                reviewSelection.clear();
                reviewDayIndex = reviewDayIndex === day.index ? null : day.index;
                refreshDeptReview();
            });
            const moveHere = document.createElement('button');
            moveHere.type = 'button';
            moveHere.className = 'kk-day-save kk-move-here';
            moveHere.textContent = 'Siirrä tähän';
            moveHere.dataset.kkDay = String(day.index);
            moveHere.hidden = reviewSelection.size === 0 || reviewDayIndex === day.index;
            moveHere.addEventListener('click', () => {
                if (reviewDayIndex === null || reviewDayIndex === day.index) return;
                const source = review.days[reviewDayIndex];
                if (!source) return;
                const chosen = productionDayItems(department, source.date)
                    .filter((item) => reviewSelection.has(reviewItemKey(item)));
                moveReviewedItems(chosen, isoFromDate(day.date), { department: department });
            });
            field.append(row, moveHere);
            slot.appendChild(field);
            if (reviewDayIndex === day.index) slot.appendChild(renderReviewProducts(department, day));
            days.appendChild(slot);
        });
        body.appendChild(days);

        if (!review.suggestions.length) {
            body.appendChild(emptyNote('Ei siirtoehdotuksia tälle viikolle.'));
        } else {
            review.suggestions.forEach((suggestion) => {
                const block = document.createElement('section');
                block.className = 'kk-move';
                const headRow = document.createElement('div');
                headRow.className = 'kk-move-head';
                const lead = document.createElement('p');
                lead.className = 'kk-move-lead';
                lead.textContent = 'Esimerkiksi siirrä nämä tuotteet ' + dayAblative(suggestion.sourceName) + ' ' + dayAllative(suggestion.dayName) + '. Työ ' + suggestion.jobNumber + '.';
                const apply = document.createElement('button');
                apply.type = 'button';
                apply.className = 'kk-day-save kk-move-apply';
                apply.textContent = 'Siirrä ' + dayAllative(suggestion.dayName);
                apply.addEventListener('click', () => moveReviewedItems(suggestion.items, isoFromDate(suggestion.targetDate), { department: department }));
                headRow.append(lead, apply);
                const list = document.createElement('ul');
                list.className = 'kk-move-items';
                suggestion.items.forEach((item) => {
                    const line = document.createElement('li');
                    line.textContent = item.itemName;
                    list.appendChild(line);
                });
                block.append(headRow, list);
                body.appendChild(block);
            });
        }
        return body;
    }

    function buildSpanReviewBody(department, review) {
        const body = document.createElement('div');
        body.className = 'kk-day-body';
        const days = document.createElement('div');
        days.className = 'kk-move-days';
        review.days.forEach((week) => {
            const slot = document.createElement('div');
            slot.className = 'kk-move-slot';
            const field = document.createElement('div');
            field.className = 'kk-move-field';
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'kk-move-day' + (reviewDayIndex === week.index ? ' is-open' : '');
            const name = document.createElement('span');
            name.textContent = week.name;
            const value = document.createElement('span');
            value.textContent = formatLoadMinutes(week.minutes) + ' / ' + formatSum(week.hours);
            if (!week.past && week.overload > 0) value.classList.add('is-over');
            row.append(name, value);
            row.addEventListener('click', () => {
                reviewSelection.clear();
                reviewDayIndex = reviewDayIndex === week.index ? null : week.index;
                refreshDeptReview();
            });
            const moveHere = document.createElement('button');
            moveHere.type = 'button';
            moveHere.className = 'kk-day-save kk-move-here';
            moveHere.textContent = 'Siirrä tähän';
            moveHere.dataset.kkDay = String(week.index);
            moveHere.hidden = reviewSelection.size === 0 || reviewDayIndex === week.index;
            moveHere.addEventListener('click', () => {
                if (reviewDayIndex === null || reviewDayIndex === week.index) return;
                const source = review.days[reviewDayIndex];
                if (!source) return;
                const chosen = source.allItems.filter((item) => reviewSelection.has(reviewItemKey(item)));
                moveItemsKeepingWeekday(chosen, week.monday, department);
            });
            field.append(row, moveHere);
            slot.appendChild(field);
            if (reviewDayIndex === week.index) slot.appendChild(renderReviewProducts(department, null, sourceItems(review, week.index)));
            days.appendChild(slot);
        });
        body.appendChild(days);

        if (!review.suggestions.length) {
            body.appendChild(emptyNote('Ei siirtoehdotuksia näille viikoille.'));
        } else {
            review.suggestions.forEach((suggestion) => {
                const block = document.createElement('section');
                block.className = 'kk-move';
                const headRow = document.createElement('div');
                headRow.className = 'kk-move-head';
                const lead = document.createElement('p');
                lead.className = 'kk-move-lead';
                lead.textContent = 'Esimerkiksi siirrä nämä tuotteet viikolta ' + suggestion.sourceWeek + ' viikolle ' + suggestion.targetWeek + '. Työ ' + suggestion.jobNumber + '.';
                const apply = document.createElement('button');
                apply.type = 'button';
                apply.className = 'kk-day-save kk-move-apply';
                apply.textContent = 'Siirrä viikolle ' + suggestion.targetWeek;
                apply.addEventListener('click', () => moveItemsKeepingWeekday(suggestion.items, suggestion.targetMonday, department));
                headRow.append(lead, apply);
                const list = document.createElement('ul');
                list.className = 'kk-move-items';
                suggestion.items.forEach((item) => {
                    const line = document.createElement('li');
                    line.textContent = item.itemName;
                    list.appendChild(line);
                });
                block.append(headRow, list);
                body.appendChild(block);
            });
        }
        return body;
    }

    function sourceItems(review, index) {
        const week = review.days[index];
        return week && week.allItems ? week.allItems : [];
    }

    function refreshDeptReview() {
        const sheet = document.querySelector('#kkDayScreen .kk-day-sheet');
        if (!sheet || !openDayKey || openDayKey.indexOf('dept|') !== 0) return;
        const department = openDayKey.slice(5);
        if (!DEPARTMENT_LABELS[department]) return;
        const scroll = sheet.scrollTop;
        const monday = viewedMonday();
        const body = withProductionSnapshot(() => {
            const review = expandedWeeks ? suggestSpanMoves(department, monday) : suggestWeekMoves(department, monday);
            return expandedWeeks ? buildSpanReviewBody(department, review) : buildDeptReviewBody(department, review);
        });
        const current = sheet.querySelector('.kk-day-body');
        if (current) current.replaceWith(body);
        else sheet.appendChild(body);
        sheet.scrollTop = scroll;
    }

    function renderDeptWeekScreen(department, monday) {
        const review = expandedWeeks ? suggestSpanMoves(department, monday) : suggestWeekMoves(department, monday);
        const parsedWeek = parseIsoWeekKey(activeWeekKey());
        const screen = document.createElement('div');
        screen.id = 'kkDayScreen';
        screen.className = 'kk-day-screen';
        screen.addEventListener('click', (event) => {
            if (event.target === screen) closeDayScreen();
        });

        const sheet = document.createElement('div');
        sheet.className = 'kk-day-sheet';
        sheet.tabIndex = -1;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'kkDayTitle');
        sheet.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeDayScreen();
        });

        const head = document.createElement('header');
        head.className = 'kk-day-sheet-head';
        const titles = document.createElement('div');
        const eyebrow = document.createElement('div');
        eyebrow.className = 'kk-day-eyebrow';
        eyebrow.textContent = DEPARTMENT_LABELS[department];
        const title = document.createElement('h3');
        title.id = 'kkDayTitle';
        title.className = 'kk-day-title';
        title.textContent = expandedWeeks
            ? spanRangeLabel(monday)
            : (parsedWeek ? 'Viikko ' + parsedWeek.week : 'Viikko');
        titles.append(eyebrow, title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'kk-day-close';
        close.textContent = 'Sulje';
        close.addEventListener('click', closeDayScreen);
        head.append(titles, close);

        const body = expandedWeeks ? buildSpanReviewBody(department, review) : buildDeptReviewBody(department, review);
        sheet.append(head, body);
        screen.appendChild(sheet);
        if (reviewDayIndex === null) setTimeout(() => sheet.focus(), 0);
        return screen;
    }

    function renderDayScreen(department, date) {
        const dayIndex = weekdayIndex(date);
        const dayKey = WEEKDAYS[dayIndex];
        const hours = departmentDayHours(department, dayKey);
        const items = productionDayItems(department, date);
        const split = splitLoadMinutes(items);
        const minutes = split.total;
        const ratio = loadRatio(minutes, hours);

        const screen = document.createElement('div');
        screen.id = 'kkDayScreen';
        screen.className = 'kk-day-screen';
        screen.addEventListener('click', (event) => {
            if (event.target === screen) closeDayScreen();
        });

        const sheet = document.createElement('div');
        sheet.className = 'kk-day-sheet';
        sheet.tabIndex = -1;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'kkDayTitle');
        sheet.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeDayScreen();
        });

        const head = document.createElement('header');
        head.className = 'kk-day-sheet-head';
        const titles = document.createElement('div');
        const eyebrow = document.createElement('div');
        eyebrow.className = 'kk-day-eyebrow';
        eyebrow.textContent = DEPARTMENT_LABELS[department];
        const title = document.createElement('h3');
        title.id = 'kkDayTitle';
        title.className = 'kk-day-title';
        const weekdayName = WEEKDAY_NAMES[dayIndex];
        title.textContent = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1) + ' ' + formatDayMonth(date);
        titles.append(eyebrow, title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'kk-day-close';
        close.textContent = 'Sulje';
        close.addEventListener('click', closeDayScreen);
        head.append(titles, close);

        const body = document.createElement('div');
        body.className = 'kk-day-body';

        const stats = document.createElement('div');
        stats.className = 'kk-day-stats';
        const over = ratio !== null && ratio > 1;
        stats.append(
            loadStatCard(split),
            statCard('Kapasiteetti', formatSum(hours), '', 'kapasiteetti'),
            statCard('Käyttöaste', ratio === null ? '—' : formatRatio(ratio), over ? 'is-over' : '', 'kayttoaste')
        );
        const statsMeter = document.createElement('div');
        statsMeter.className = 'kk-day-stats-meter';
        statsMeter.appendChild(buildMeter(ratio));
        stats.appendChild(statsMeter);

        const columns = document.createElement('div');
        columns.className = 'kk-day-columns';

        const workerCol = document.createElement('section');
        const weekKey = activeWeekKey();
        const workers = namedWorkers(department);
        const activeCount = workers.filter((worker) => (daysFor(worker, weekKey)[dayKey] || 0) > 0).length;
        const workerHeading = sectionHeading('Työntekijät', activeCount ? String(activeCount) : '');
        const activeMeta = workerHeading.querySelector('span');
        if (activeMeta) activeMeta.dataset.kkActive = '1';
        workerCol.appendChild(workerHeading);
        if (!workers.length) {
            workerCol.appendChild(emptyNote('Ei aktiivisia työntekijöitä.'));
        } else {
            const list = document.createElement('div');
            list.className = 'kk-list';
            workers.forEach((worker) => list.appendChild(workerHourRow(worker, dayKey, weekdayName)));
            workerCol.appendChild(list);
            workerCol.appendChild(saveHoursButton(sheet, workers, department, dayKey, date));
        }
        const gapHost = document.createElement('div');
        gapHost.dataset.kkGap = '1';
        const gap = hoursToAdd(minutes, hours);
        if (gap > 0) gapHost.appendChild(gapNote(gap));
        workerCol.appendChild(gapHost);

        const productCol = document.createElement('section');
        productCol.appendChild(sectionHeading('Tuotteet', items.length ? items.length + ' kpl' : ''));
        if (!items.length) {
            productCol.appendChild(emptyNote('Ei tuotteita tälle päivälle.'));
        } else {
            const readyItems = items.filter((item) => !item.done && item.ready);
            const upcomingItems = items.filter((item) => !item.done && !item.ready);
            const doneItems = items.filter((item) => item.done);
            appendProductSection(productCol, 'Tehtävissä', readyItems, 'Ei tehtävissä olevaa kuormaa.');
            appendProductSection(productCol, 'Tuleva', upcomingItems, 'Ei tulevaa kuormaa.');
            if (doneItems.length) appendProductSection(productCol, 'Tehty', doneItems, '');
        }

        columns.append(workerCol, productCol);
        body.append(stats, columns);
        sheet.append(head, body);
        screen.appendChild(sheet);
        setTimeout(() => sheet.focus(), 0);
        return screen;
    }

    function saveHoursButton(sheet, workers, department, dayKey, date) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kk-day-save';
        button.textContent = 'Tallenna tunnit';
        let resetTimer = 0;
        button.addEventListener('click', () => {
            const weekKey = activeWeekKey();
            let changed = false;
            workers.forEach((worker) => {
                const input = sheet.querySelector('[data-kk-worker="' + worker.id + '"]');
                if (!input) return;
                const stored = daysFor(worker, weekKey)[dayKey] || 0;
                const parsed = clampDayHours(input.value);
                if (parsed === null) {
                    input.value = String(stored);
                    return;
                }
                input.value = String(parsed);
                if (parsed === stored) return;
                writeDay(worker, weekKey, dayKey, parsed);
                changed = true;
            });
            if (changed) {
                save();
                paintCapacityTables();
                paintWeekGridOnly();
            }
            refreshDayCapacity(sheet, department, dayKey, date);
            button.textContent = 'Tallennettu';
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => {
                button.textContent = 'Tallenna tunnit';
            }, 1200);
        });
        return button;
    }

    function refreshDayCapacity(sheet, department, dayKey, date) {
        const weekKey = activeWeekKey();
        const hours = departmentDayHours(department, dayKey);
        const minutes = productionLoadMinutes(department, date);
        const ratio = loadRatio(minutes, hours);
        const over = ratio !== null && ratio > 1;
        const capacity = sheet.querySelector('[data-kk-stat="kapasiteetti"]');
        if (capacity) capacity.textContent = formatSum(hours);
        const rate = sheet.querySelector('[data-kk-stat="kayttoaste"]');
        if (rate) {
            rate.textContent = ratio === null ? '—' : formatRatio(ratio);
            rate.classList.toggle('is-over', over);
        }
        const fill = sheet.querySelector('.kk-day-stats-meter .kk-meter-fill');
        if (fill) {
            fill.style.width = ratio !== null ? (Math.min(100, ratio * 100) + '%') : '0';
            fill.classList.toggle('is-over', over);
        }
        const active = sheet.querySelector('[data-kk-active]');
        if (active) {
            const count = namedWorkers(department).filter((worker) => (daysFor(worker, weekKey)[dayKey] || 0) > 0).length;
            active.textContent = count ? String(count) : '';
        }
        const gapHost = sheet.querySelector('[data-kk-gap]');
        if (gapHost) {
            gapHost.replaceChildren();
            const gap = hoursToAdd(minutes, hours);
            if (gap > 0) gapHost.appendChild(gapNote(gap));
        }
    }

    function gapNote(hours) {
        const note = document.createElement('p');
        note.className = 'kk-day-gap';
        note.textContent = 'Lisää työntekijöille yhteensä ' + formatSum(hours) + '.';
        return note;
    }

    function workerHourRow(worker, dayKey, weekdayName) {
        const weekKey = activeWeekKey();
        const current = daysFor(worker, weekKey)[dayKey] || 0;
        const row = document.createElement('div');
        row.className = 'kk-list-row';
        const name = document.createElement('span');
        name.textContent = String(worker.name || '').trim();
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'kk-day-hours';
        input.min = '0';
        input.max = '24';
        input.step = '0.5';
        input.value = String(current);
        input.dataset.kkWorker = worker.id;
        input.setAttribute('aria-label', name.textContent + ', ' + weekdayName + ', tunteina');
        input.addEventListener('change', () => {
            const parsed = clampDayHours(input.value);
            const stored = daysFor(worker, weekKey)[dayKey] || 0;
            input.value = parsed === null ? String(stored) : String(parsed);
        });
        row.append(name, input);
        return row;
    }

    function unmount(host) {
        weekPanel = 'viikko';
        openDayKey = null;
        reviewDayIndex = null;
        reviewSelection.clear();
        removeDayScreen();
        if (!host || host.dataset.kkReady !== '1') return;
        host.dataset.kkReady = '';
        host.replaceChildren();
    }

    function renderCapacity(department) {
        const wrap = document.createElement('div');
        wrap.className = 'kk-sheet-scroll';
        const table = document.createElement('table');
        table.className = 'kk-sheet';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const parsedWeek = parseIsoWeekKey(activeWeekKey());
        const weekLabel = parsedWeek ? 'Viikko ' + parsedWeek.week : 'Viikko';
        const headers = ['Nimi'].concat(WEEKDAYS.map((key) => key.charAt(0).toUpperCase() + key.slice(1)), [weekLabel, '']);
        headers.forEach((label, index) => {
            const th = document.createElement('th');
            th.textContent = label;
            if (index === 0) th.className = 'kk-name-col';
            if (index === 8) th.classList.add('kk-week-heading');
            if (index >= 6 && index <= 7) th.classList.add('is-weekend');
            if (!label) th.setAttribute('aria-hidden', 'true');
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        const tbody = document.createElement('tbody');
        state.kapasiteetti[department].workers.forEach((worker) => {
            tbody.appendChild(renderWorkerRow(department, worker));
        });

        const tfoot = document.createElement('tfoot');
        const totalRow = document.createElement('tr');
        const totalLabel = document.createElement('th');
        totalLabel.scope = 'row';
        totalLabel.textContent = 'Yhteensä';
        totalRow.appendChild(totalLabel);
        WEEKDAYS.forEach((key, index) => {
            const cell = document.createElement('td');
            cell.id = 'kkSum-' + department + '-' + key;
            cell.textContent = formatHours(departmentDayHours(department, key));
            if (index >= 5) cell.classList.add('is-weekend');
            totalRow.appendChild(cell);
        });
        const weekTotal = document.createElement('td');
        weekTotal.id = 'kkSum-' + department + '-viikko';
        const weekSum = WEEKDAYS.reduce((sum, key) => sum + departmentDayHours(department, key), 0);
        weekTotal.textContent = formatHours(weekSum);
        totalRow.appendChild(weekTotal);
        totalRow.appendChild(document.createElement('td'));
        tfoot.appendChild(totalRow);
        table.append(thead, tbody, tfoot);

        const add = document.createElement('div');
        add.className = 'kk-add';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-control';
        nameInput.id = 'kkAddName-' + department;
        nameInput.maxLength = 80;
        nameInput.placeholder = 'Nimi';
        nameInput.setAttribute('aria-label', 'Aktiivisen työntekijän nimi');
        nameInput.autocomplete = 'off';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-success';
        addBtn.textContent = 'Lisää';

        function addFromField() {
            const name = nameInput.value.trim();
            if (!name) return;
            const weeks = {};
            weeks[activeWeekKey()] = defaultDayHours(DEFAULT_HOURS);
            state.kapasiteetti[department].workers.push({
                id: nextWorkerId(),
                name: name,
                weeks: weeks
            });
            save();
            reloadCapacity('kkAddName-' + department);
        }

        addBtn.addEventListener('click', addFromField);
        nameInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addFromField();
        });
        add.append(nameInput, addBtn);
        wrap.append(table, add);
        return wrap;
    }

    function renderWorkerRow(department, worker) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'kk-sheet-input kk-sheet-name';
        nameInput.value = worker.name;
        nameInput.maxLength = 80;
        nameInput.setAttribute('aria-label', 'Työntekijän nimi');
        nameInput.addEventListener('change', () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.value = worker.name;
                return;
            }
            worker.name = name;
            nameInput.value = name;
            save();
        });
        nameCell.className = 'kk-name-col';
        const nameWrap = document.createElement('div');
        nameWrap.className = 'kk-name-wrap';
        nameWrap.appendChild(nameInput);
        const weekKey = activeWeekKey();
        const absent = !!(worker.absence && worker.absence[weekKey]);
        const canMark = zeroableWeekdays(weekKey).length > 0 || absent;
        const check = document.createElement('div');
        check.className = 'preset-checkbox' + (absent ? ' checked' : '') + (canMark ? '' : ' disabled');
        check.setAttribute('role', 'checkbox');
        check.setAttribute('aria-checked', absent ? 'true' : 'false');
        check.setAttribute('aria-label', worker.name + ', nollaa tunnit tästä päivästä perjantaihin');
        check.tabIndex = canMark ? 0 : -1;
        check.title = absent ? 'Palauta tunnit' : 'Nollaa tunnit tästä päivästä perjantaihin. Menneet päivät säilyvät.';
        check.textContent = absent ? '✓' : '';
        const toggleAbsent = () => {
            if (!canMark) return;
            if (worker.absence && worker.absence[weekKey]) clearAbsent(worker, weekKey);
            else markAbsent(worker, weekKey);
            save();
            reloadCapacity();
        };
        check.addEventListener('click', toggleAbsent);
        check.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleAbsent();
        });
        nameWrap.appendChild(check);
        nameCell.appendChild(nameWrap);

        const days = daysFor(worker, weekKey);
        WEEKDAYS.forEach((key, index) => {
            const cell = document.createElement('td');
            if (index >= 5) cell.classList.add('is-weekend');
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'kk-sheet-input';
            input.min = '0';
            input.max = '24';
            input.step = '0.5';
            input.value = String(days[key]);
            input.setAttribute('aria-label', worker.name + ', ' + WEEKDAY_NAMES[index] + ', tunteina');
            input.addEventListener('change', () => {
                const parsed = clampDayHours(input.value);
                const current = daysFor(worker, weekKey);
                if (parsed === null) {
                    input.value = String(current[key]);
                    return;
                }
                writeDay(worker, weekKey, key, parsed);
                input.value = String(parsed);
                save();
                refreshCapacitySums(department, worker);
                paintWeekGridOnly();
            });
            cell.appendChild(input);
            row.appendChild(cell);
        });

        const weekCell = document.createElement('td');
        weekCell.className = 'kk-week-total';
        weekCell.id = 'kkRowSum-' + worker.id;
        weekCell.textContent = formatHours(workerWeekHours(worker));
        row.appendChild(weekCell);

        const removeCell = document.createElement('td');
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'kk-sheet-remove';
        removeBtn.textContent = 'Poista';
        removeBtn.addEventListener('click', () => {
            const workers = state.kapasiteetti[department].workers;
            state.kapasiteetti[department].workers = workers.filter((item) => item.id !== worker.id);
            save();
            reloadCapacity();
        });
        removeCell.appendChild(removeBtn);
        row.insertBefore(nameCell, row.firstChild);
        row.appendChild(removeCell);
        return row;
    }

    function refreshCapacitySums(department, worker) {
        const rowSum = document.getElementById('kkRowSum-' + worker.id);
        if (rowSum) rowSum.textContent = formatHours(workerWeekHours(worker));
        WEEKDAYS.forEach((key) => {
            const cell = document.getElementById('kkSum-' + department + '-' + key);
            if (cell) cell.textContent = formatHours(departmentDayHours(department, key));
        });
        const weekTotal = document.getElementById('kkSum-' + department + '-viikko');
        if (weekTotal) {
            const total = WEEKDAYS.reduce((sum, key) => sum + departmentDayHours(department, key), 0);
            weekTotal.textContent = formatHours(total);
        }
    }

    function renderSiirtymaField(department) {
        const row = document.createElement('div');
        row.className = 'kk-siirtyma';
        const label = document.createElement('label');
        label.htmlFor = 'kkSiirtyma-' + department;
        label.textContent = 'Siirtymäaika';
        const input = document.createElement('input');
        input.type = 'number';
        input.id = 'kkSiirtyma-' + department;
        input.className = 'form-control form-control-sm kk-siirtyma-input';
        input.min = '0';
        input.max = '30';
        input.step = '1';
        input.value = String(state.siirtymaAika[department]);
        input.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ', siirtymäaika, päivinä');
        const unit = document.createElement('span');
        unit.className = 'kk-unit';
        unit.textContent = 'pv';
        const note = document.createElement('p');
        note.className = 'kk-note';
        note.textContent = 'Päiviä ennen seuraavaa osastoa.';
        input.addEventListener('change', () => {
            const days = clampSiirtyma(input.value);
            state.siirtymaAika[department] = days;
            input.value = String(days);
            save();
        });
        row.append(label, input, unit, note);
        return row;
    }

    function renderTimeTable(department, product) {
        const times = state.kuorma[department][product.id];
        const note = document.createElement('p');
        note.className = 'kk-note';
        note.textContent = product.kind === 'ikkuna'
            ? 'Standardi on ikkuna, jossa on 1 ruutu eikä potkupeltiä. +1 ruutu lisätään jokaista ruutua kohti ensimmäisen jälkeen.'
            : 'Standardi on ovi ilman potkupeltiä, tiivistekynnystä, umpiovea ja umpivasikkaa. +1 ruutu lisätään jokaista ruutua kohti ensimmäisen jälkeen. Kun umpiovi on päällä, kuorma lasketaan umpioven kentistä.';
        const table = document.createElement('table');
        table.className = 'kk-table';
        const tbody = document.createElement('tbody');
        timeFieldsFor(product).forEach((field) => {
            const row = document.createElement('tr');
            if (field.key === 'umpiovi') row.className = 'kk-time-group';
            const labelCell = document.createElement('td');
            labelCell.textContent = field.label;
            const valueCell = document.createElement('td');
            valueCell.className = 'kk-minutes-cell';
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'form-control form-control-sm kk-minutes';
            input.min = '0';
            input.step = '1';
            input.value = String(times[field.key]);
            input.dataset.kkDepartment = department;
            input.dataset.kkProduct = product.id;
            input.dataset.kkField = field.key;
            input.dataset.kkDraft = String(times[field.key]);
            input.setAttribute('aria-label', product.label + ', ' + field.label + ', minuutteina');
            const unit = document.createElement('span');
            unit.className = 'kk-unit';
            unit.textContent = 'min';
            input.addEventListener('change', () => {
                const minutes = clampMinutes(input.value);
                if (minutes === null) {
                    input.value = input.dataset.kkDraft || '0';
                    return;
                }
                input.dataset.kkDraft = String(minutes);
                input.value = String(minutes);
            });
            valueCell.append(input, unit);
            row.append(labelCell, valueCell);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        const wrap = document.createElement('div');
        wrap.append(note, table);
        return wrap;
    }

    function collectKuormaDraft(root) {
        const draft = cloneDepartmentKuorma(state.kuorma);
        root.querySelectorAll('.kk-minutes').forEach((input) => {
            const department = input.dataset.kkDepartment;
            const productId = input.dataset.kkProduct;
            const field = input.dataset.kkField;
            if (!draft[department] || !draft[department][productId]) return;
            if (!Object.prototype.hasOwnProperty.call(draft[department][productId], field)) return;
            const minutes = clampMinutes(input.value);
            if (minutes === null) return;
            draft[department][productId][field] = minutes;
        });
        return draft;
    }

    function openKuormaNameDialog(root) {
        if (root.querySelector('.kk-name-dialog')) return;
        const dialog = document.createElement('form');
        dialog.className = 'kk-name-dialog';
        const label = document.createElement('label');
        label.textContent = 'Anna nimi kuorma-asetukselle';
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 80;
        input.required = true;
        input.className = 'form-control form-control-sm';
        input.value = state.activeKuormaSet || '';
        input.setAttribute('aria-label', 'Kuorma-asetuksen nimi');
        const error = document.createElement('p');
        error.className = 'kk-name-error';
        error.hidden = true;
        error.textContent = 'Anna nimi.';
        const actions = document.createElement('div');
        actions.className = 'kk-name-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'kk-day-close';
        cancel.textContent = 'Peruuta';
        cancel.addEventListener('click', () => dialog.remove());
        const saveBtn = document.createElement('button');
        saveBtn.type = 'submit';
        saveBtn.className = 'kk-day-save kk-set-save';
        saveBtn.textContent = 'Tallenna';
        actions.append(cancel, saveBtn);
        dialog.append(label, input, error, actions);
        dialog.addEventListener('submit', (event) => {
            event.preventDefault();
            const name = input.value.trim();
            if (!name) {
                error.hidden = false;
                input.focus();
                return;
            }
            const draft = collectKuormaDraft(root);
            state.kuormaSets[name] = draft;
            state.kuorma = cloneDepartmentKuorma(draft);
            state.activeKuormaSet = name;
            save();
            renderSettings();
        });
        const bar = root.querySelector('.kk-set-bar');
        if (bar) bar.after(dialog);
        else root.prepend(dialog);
        input.focus();
        input.select();
    }

    function renderKuormaSetBar(root) {
        const bar = document.createElement('div');
        bar.className = 'kk-set-bar';
        const label = document.createElement('label');
        label.htmlFor = 'kkActiveKuormaSet';
        label.textContent = 'Aktiivinen kuorma-asetus';
        const select = document.createElement('select');
        select.id = 'kkActiveKuormaSet';
        select.className = 'form-select form-select-sm kk-set-select';
        const names = Object.keys(state.kuormaSets).sort((a, b) => a.localeCompare(b, 'fi'));
        if (!state.activeKuormaSet) {
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'Ei nimettyä asetusta';
            select.appendChild(empty);
        }
        names.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = state.activeKuormaSet || '';
        select.addEventListener('change', () => {
            const name = select.value;
            if (!name || !state.kuormaSets[name]) return;
            state.kuorma = cloneDepartmentKuorma(state.kuormaSets[name]);
            state.activeKuormaSet = name;
            save();
            renderSettings();
        });
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kk-day-save kk-set-save';
        button.textContent = 'Tallenna kuorma-asetukset';
        button.addEventListener('click', () => openKuormaNameDialog(root));
        bar.append(label, select, button);
        return bar;
    }

    function renderLoad(department) {
        const wrap = document.createElement('div');
        PRODUCTS.forEach((product) => {
            const item = document.createElement('div');
            item.className = 'admin-accordion-item';
            const header = document.createElement('div');
            header.className = 'admin-accordion-header';
            header.setAttribute('role', 'button');
            header.tabIndex = 0;
            header.setAttribute('aria-expanded', 'false');
            const label = document.createElement('span');
            label.textContent = product.label;
            const icon = document.createElement('span');
            icon.className = 'admin-accordion-icon';
            icon.textContent = '▼';
            header.append(label, icon);
            const content = document.createElement('div');
            content.className = 'admin-accordion-content';
            content.appendChild(renderTimeTable(department, product));
            const toggle = () => {
                if (typeof toggleAdminAccordion === 'function') toggleAdminAccordion(header);
            };
            header.addEventListener('click', toggle);
            header.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggle();
            });
            item.append(header, content);
            wrap.appendChild(item);
        });
        return wrap;
    }

    function departmentMinutesForInputs(department, inputs) {
        if (!inputs || inputs.pystypaneliEnabled) return null;
        const productId = CALCULATOR_PRODUCT_IDS[inputs.calculator];
        const product = PRODUCTS.find((item) => item.id === productId);
        const times = productId && state.kuorma[department] && state.kuorma[department][productId];
        if (!product || !times) return null;
        if (product.kind === 'ovi' && inputs.umpioviEnabled) {
            let total = times.umpiovi || 0;
            if (inputs.kickPlateEnabled) total += times.umpioviPotkupelti || 0;
            if (inputs.sealThresholdEnabled) total += times.umpioviTiivistekynnys || 0;
            return total;
        }
        const panes = parseInt(inputs.paneCount, 10);
        const paneCount = Number.isFinite(panes) && panes >= 1 ? panes : 1;
        let total = (times.standardi || 0) + Math.max(0, paneCount - 1) * (times.ruutu || 0);
        if (inputs.kickPlateEnabled) total += times.potkupelti || 0;
        if (product.kind === 'ovi' && inputs.sealThresholdEnabled) total += times.tiivistekynnys || 0;
        return total;
    }

    function loadQuote(parts) {
        const list = Array.isArray(parts) ? parts : [];
        const quote = {};
        DEPARTMENTS.forEach((department) => {
            const known = list
                .map((inputs) => departmentMinutesForInputs(department, inputs))
                .filter((value) => typeof value === 'number');
            quote[department] = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
        });
        return quote;
    }

    function transitionDays(department) {
        if (!SIIRTYMA_DEPARTMENTS.includes(department)) return 0;
        const days = state.siirtymaAika && state.siirtymaAika[department];
        return typeof days === 'number' ? days : 1;
    }

    function open() {
        if (typeof setTuotantoNakyma === 'function') setTuotantoNakyma('kuorma');
        if (typeof switchView === 'function') switchView('mitat');
    }

    window.KuormaKapasiteetti = {
        open,
        openSettings,
        mount,
        unmount,
        loadQuote,
        transitionDays,
        isShownInProduction: function () { return state.enabled === true; }
    };
})();
