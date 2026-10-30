(function () {
    const STORAGE_KEY = 'kuormaKapasiteetti';
    const DEFAULT_HOURS = 6.5;
    const DEFAULT_DOC = 'kokoonpano-kapasiteetti';
    const DEPARTMENTS = ['saha', 'hitsaus', 'maalaus', 'kokoonpano'];
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
    const PRODUCTS = [
        { id: 'janisol_kayntiovi', label: 'Janisol käyntiovi', kind: 'ovi' },
        { id: 'janisol_pariovi', label: 'Janisol pariovi', kind: 'ovi' },
        { id: 'janisol_ikkuna', label: 'Janisol ikkuna', kind: 'ikkuna' },
        { id: 'economy_kayntiovi', label: 'Economy käyntiovi', kind: 'ovi' },
        { id: 'economy_pariovi', label: 'Economy pariovi', kind: 'ovi' },
        { id: 'economy_ikkuna', label: 'Economy ikkuna', kind: 'ikkuna' }
    ];

    let state = loadState();
    let pageView = 'asetukset';
    let selectedWeekKey = null;

    function defaultState() {
        const kapasiteetti = {};
        DEPARTMENTS.forEach((department) => {
            kapasiteetti[department] = { workers: [] };
        });
        return {
            enabled: false,
            selectedDoc: DEFAULT_DOC,
            kapasiteetti,
            kuorma: { kokoonpano: defaultKokoonpanoTimes() }
        };
    }

    function timeFieldsFor(product) {
        return product.kind === 'ikkuna' ? WINDOW_TIME_FIELDS : DOOR_TIME_FIELDS;
    }

    function emptyProductTimes(product) {
        const times = {};
        timeFieldsFor(product).forEach((field) => {
            times[field.key] = 0;
        });
        return times;
    }

    function defaultKokoonpanoTimes() {
        const kokoonpano = {};
        PRODUCTS.forEach((product) => {
            kokoonpano[product.id] = emptyProductTimes(product);
        });
        return kokoonpano;
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
        const savedTimes = parsed.kuorma && parsed.kuorma.kokoonpano;
        PRODUCTS.forEach((product) => {
            const saved = savedTimes && savedTimes[product.id];
            const times = emptyProductTimes(product);
            timeFieldsFor(product).forEach((field) => {
                const minutes = clampMinutes(saved && saved[field.key]);
                times[field.key] = minutes === null ? 0 : minutes;
            });
            next.kuorma.kokoonpano[product.id] = times;
        });
        return next;
    }

    function persist(next) {
        const payload = {
            enabled: next.enabled === true,
            selectedDoc: next.selectedDoc,
            kapasiteetti: next.kapasiteetti,
            kuorma: next.kuorma
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultState();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                const fresh = defaultState();
                persist(fresh);
                return fresh;
            }
            return normalize(parsed);
        } catch (error) {
            const fresh = defaultState();
            try { persist(fresh); } catch (writeError) { /* storage may be blocked */ }
            return fresh;
        }
    }

    function save() {
        persist(state);
    }

    function selectedDocument() {
        return DOCS.find((doc) => doc.id === state.selectedDoc) || DOCS[DOCS.length - 1];
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

        const section = document.createElement('div');
        section.className = 'kk-page-head';

        const switchWrap = document.createElement('div');
        switchWrap.className = 'form-check form-switch mb-2';
        const enabled = document.createElement('input');
        enabled.className = 'form-check-input';
        enabled.type = 'checkbox';
        enabled.id = 'kkEnabled';
        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'form-check-label';
        enabledLabel.htmlFor = 'kkEnabled';
        enabledLabel.textContent = 'Näytä tuotannossa';
        switchWrap.append(enabled, enabledLabel);

        const note = document.createElement('p');
        note.className = 'kk-note';
        note.textContent = 'Kun pois, tuotantosivu pysyy ennallaan, ja tällä kierroksella kytkin ei vielä lisää tunteja tuotantoon.';

        const docLabel = document.createElement('label');
        docLabel.className = 'form-label';
        docLabel.htmlFor = 'kkDocSelect';
        docLabel.textContent = 'Dokumentti';
        const select = document.createElement('select');
        select.className = 'form-select';
        select.id = 'kkDocSelect';
        DOCS.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.label;
            select.appendChild(option);
        });

        const documentHost = document.createElement('div');
        documentHost.id = 'kkDocument';

        section.append(switchWrap, note, docLabel, select);

        const tabs = document.createElement('div');
        tabs.className = 'kk-view-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.append(
            viewTab('asetukset', 'Asetukset'),
            viewTab('viikko', 'Viikkonäkymä')
        );

        const settings = document.createElement('div');
        settings.id = 'kkSettings';
        settings.append(section, documentHost);

        const week = document.createElement('div');
        week.id = 'kkWeek';

        host.replaceChildren(tabs, settings, week);
        host.dataset.kkReady = '1';

        enabled.addEventListener('change', () => {
            state.enabled = enabled.checked;
            save();
        });
        select.addEventListener('change', () => {
            state.selectedDoc = select.value;
            save();
            renderDocument();
        });

        renderChrome();
        renderDocument();
        setPage(pageView);
    }

    function viewTab(view, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kk-view-tab';
        button.dataset.kkView = view;
        button.setAttribute('role', 'tab');
        button.textContent = label;
        button.addEventListener('click', () => setPage(view));
        return button;
    }

    function setPage(view) {
        pageView = view === 'viikko' ? 'viikko' : 'asetukset';
        const settings = document.getElementById('kkSettings');
        const week = document.getElementById('kkWeek');
        if (settings) settings.hidden = pageView !== 'asetukset';
        if (week) {
            week.hidden = pageView !== 'viikko';
            if (pageView === 'viikko') renderWeek();
        }
        document.querySelectorAll('.kk-view-tab').forEach((button) => {
            const active = button.dataset.kkView === pageView;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function addDays(date, count) {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        next.setDate(next.getDate() + count);
        return next;
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

        controls.append(prev, select, next);
        return controls;
    }

    function renderWeek() {
        const host = document.getElementById('kkWeek');
        if (!host) return;
        host.replaceChildren();

        const monday = viewedMonday();
        const today = new Date();
        host.appendChild(buildWeekControls(renderWeek));

        DEPARTMENTS.forEach((department) => {
            host.appendChild(renderDepartmentWeek(department, monday, today));
        });
    }

    function renderDepartmentWeek(department, monday, today) {
        const section = document.createElement('section');
        section.className = 'kk-dept';
        const heading = document.createElement('h3');
        heading.className = 'kk-dept-title';
        heading.textContent = DEPARTMENT_LABELS[department];
        section.appendChild(heading);

        const scroll = document.createElement('div');
        scroll.className = 'kk-week-scroll';
        const grid = document.createElement('div');
        grid.className = 'kk-timetable';

        for (let index = 0; index < 7; index += 1) {
            const date = addDays(monday, index);
            const weekend = index >= 5;
            const head = document.createElement('div');
            head.className = 'kk-day-head' + (weekend ? ' is-weekend' : '') + (sameDay(date, today) ? ' is-today' : '');
            const shortName = WEEKDAYS[index];
            head.textContent = shortName.charAt(0).toUpperCase() + shortName.slice(1);
            grid.appendChild(head);
        }
        for (let index = 0; index < 7; index += 1) {
            const date = addDays(monday, index);
            const weekend = index >= 5;
            const hoursText = formatSum(departmentDayHours(department, WEEKDAYS[index]));
            const cell = document.createElement('div');
            cell.className = 'kk-day' + (weekend ? ' is-weekend' : '') + (sameDay(date, today) ? ' is-today' : '');
            cell.setAttribute('aria-label', WEEKDAY_NAMES[index] + ' ' + formatDayMonth(date) + '. Kapasiteetti ' + hoursText + '. Kuormaa ei ole.');

            const dateLine = document.createElement('div');
            dateLine.className = 'kk-day-date';
            dateLine.textContent = formatDayMonth(date);

            const capacityRow = meterRow('Kapasiteetti', hoursText);
            const loadRow = meterRow('Kuorma', '—');

            const meter = document.createElement('div');
            meter.className = 'kk-meter';
            meter.setAttribute('aria-hidden', 'true');
            const fill = document.createElement('div');
            fill.className = 'kk-meter-fill';
            meter.appendChild(fill);

            cell.append(dateLine, capacityRow, loadRow, meter);
            grid.appendChild(cell);
        }

        scroll.appendChild(grid);
        section.appendChild(scroll);
        return section;
    }

    function meterRow(label, value) {
        const row = document.createElement('div');
        row.className = 'kk-meter-row';
        const name = document.createElement('span');
        name.textContent = label;
        const amount = document.createElement('span');
        amount.textContent = value;
        row.append(name, amount);
        return row;
    }

    function unmount(host) {
        if (!host || host.dataset.kkReady !== '1') return;
        host.dataset.kkReady = '';
        host.replaceChildren();
    }

    function renderChrome() {
        const enabled = document.getElementById('kkEnabled');
        const select = document.getElementById('kkDocSelect');
        if (enabled) enabled.checked = state.enabled === true;
        if (select) select.value = selectedDocument().id;
    }

    function renderDocument() {
        const host = document.getElementById('kkDocument');
        if (!host) return;
        host.replaceChildren();
        const doc = selectedDocument();
        if (doc.kind === 'kapasiteetti') {
            host.appendChild(renderCapacity(doc.department));
        } else {
            host.appendChild(renderLoad(doc.department));
        }
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
            cell.id = 'kkSum-' + key;
            cell.textContent = formatHours(departmentDayHours(department, key));
            if (index >= 5) cell.classList.add('is-weekend');
            totalRow.appendChild(cell);
        });
        const weekTotal = document.createElement('td');
        weekTotal.id = 'kkSum-viikko';
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
        nameInput.id = 'kkAddName';
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
            renderDocument();
            const field = document.getElementById('kkAddName');
            if (field) field.focus();
        }

        addBtn.addEventListener('click', addFromField);
        nameInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addFromField();
        });
        add.append(nameInput, addBtn);
        wrap.append(buildWeekControls(renderDocument), table, add);
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
            renderDocument();
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
            renderDocument();
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
            const cell = document.getElementById('kkSum-' + key);
            if (cell) cell.textContent = formatHours(departmentDayHours(department, key));
        });
        const weekTotal = document.getElementById('kkSum-viikko');
        if (weekTotal) {
            const total = WEEKDAYS.reduce((sum, key) => sum + departmentDayHours(department, key), 0);
            weekTotal.textContent = formatHours(total);
        }
    }

    function renderTimeTable(product) {
        const times = state.kuorma.kokoonpano[product.id];
        const note = document.createElement('p');
        note.className = 'kk-note';
        note.textContent = product.kind === 'ikkuna'
            ? 'Standardi on ikkuna, jossa on 1 ruutu eikä potkupeltiä. +1 ruutu lisätään jokaista ruutua kohti ensimmäisen jälkeen.'
            : 'Standardi on ovi ilman potkupeltiä, tiivistekynnystä, umpiovea ja umpivasikkaa. +1 ruutu lisätään jokaista ruutua kohti ensimmäisen jälkeen.';
        const table = document.createElement('table');
        table.className = 'kk-table';
        const tbody = document.createElement('tbody');
        timeFieldsFor(product).forEach((field) => {
            const row = document.createElement('tr');
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
            input.setAttribute('aria-label', product.label + ', ' + field.label + ', minuutteina');
            const unit = document.createElement('span');
            unit.className = 'kk-unit';
            unit.textContent = 'min';
            input.addEventListener('change', () => {
                const minutes = clampMinutes(input.value);
                if (minutes === null) {
                    input.value = String(times[field.key]);
                    return;
                }
                times[field.key] = minutes;
                input.value = String(minutes);
                save();
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
            if (department === 'kokoonpano') {
                content.appendChild(renderTimeTable(product));
            } else {
                const text = document.createElement('p');
                text.className = 'kk-note mb-0';
                text.textContent = 'Tekoaikojen säännöt määritellään myöhemmin.';
                content.appendChild(text);
            }
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

    function open() {
        if (typeof setTuotantoNakyma === 'function') setTuotantoNakyma('kuorma');
        if (typeof switchView === 'function') switchView('mitat');
    }

    window.KuormaKapasiteetti = { open, mount, unmount };
})();
