(function () {
    const STORAGE_KEY = 'yleistaulukko';
    const ZOOM_KEY = 'yleistaulukkoZoom';
    const MIN_ZOOM = 50;
    const MAX_ZOOM = 200;
    const ZOOM_STEP = 10;
    const COLUMNS = [
        { key: 'week', label: 'Asennusvko' },
        { key: 'ship', label: 'Lähetyspvm' },
        { key: 'job', label: 'Työnro' },
        { key: 'recipient', label: 'Tilauksen vastaanottaja' },
        { key: 'count', label: 'Kpl' },
        { key: 'units', label: 'Yksiköt' },
        { key: 'saha', label: 'Saha+työstö' },
        { key: 'hitsaus', label: 'Hitsaus' },
        { key: 'maalaus', label: 'Maalaus' },
        { key: 'listotus', label: 'Listotus' },
        { key: 'valmis', label: 'Valmis' },
        { key: 'pakattu', label: 'Pakattu' }
    ];

    const expanded = new Set();
    let hostEl = null;

    function readMap(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function readSheet() {
        return readMap(STORAGE_KEY);
    }

    function writeSheet(sheet) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
    }

    function readZoom() {
        const zoom = parseInt(localStorage.getItem(ZOOM_KEY) || '100', 10);
        if (!Number.isFinite(zoom)) return 100;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    }

    function writeZoom(zoom) {
        localStorage.setItem(ZOOM_KEY, String(zoom));
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = String(text);
        return node;
    }

    function stageTone(doneCount, total) {
        if (!total || doneCount <= 0) return 'white';
        if (doneCount >= total) return 'green';
        return 'yellow';
    }

    function formatIsoDate(iso) {
        const normalized = typeof normalizeShipDate === 'function' ? normalizeShipDate(iso) : '';
        if (!normalized || typeof formatFinnishDate !== 'function') return '';
        const parts = normalized.split('-').map(Number);
        return formatFinnishDate(new Date(parts[0], parts[1] - 1, parts[2]));
    }

    function formatStamp(stamp) {
        const date = new Date(stamp);
        if (!Number.isFinite(date.getTime()) || typeof formatFinnishDate !== 'function') return '';
        return formatFinnishDate(date);
    }

    function packedStamp(jobNumber, itemName, packageNumbers, timestamps) {
        const packageNumber = packageNumbers[jobNumber + '-' + itemName];
        if (packageNumber == null || packageNumber === '') return '';
        return timestamps[jobNumber + '-' + packageNumber] || '';
    }

    function latestPackedLabel(products) {
        let latest = 0;
        products.forEach((product) => {
            const stamp = Date.parse(product.packedStamp || '');
            if (Number.isFinite(stamp) && stamp > latest) latest = stamp;
        });
        return latest ? formatStamp(latest) : '';
    }

    function sharedColor(products) {
        const colors = products.map((product) => product.color).filter(Boolean);
        if (!colors.length) return '';
        return colors.every((color) => color === colors[0]) ? colors[0] : '';
    }

    function weekNumber(week) {
        const text = String(week || '').trim();
        if (!text) return null;
        const number = parseInt(text, 10);
        return Number.isFinite(number) ? number : null;
    }

    function saveMeta(jobNumber, field, value) {
        const sheet = readSheet();
        const current = sheet[jobNumber] && typeof sheet[jobNumber] === 'object' ? sheet[jobNumber] : {};
        const next = {
            week: String(current.week || ''),
            recipient: String(current.recipient || '')
        };
        next[field] = String(value || '').trim();
        if (next.week || next.recipient) sheet[jobNumber] = next;
        else delete sheet[jobNumber];
        writeSheet(sheet);
        if (typeof syncKoeJobFromSheet === 'function') syncKoeJobFromSheet(jobNumber);
    }

    function buildJobs() {
        const jobs = typeof loadKuormaKoeJobs === 'function' ? loadKuormaKoeJobs() : [];
        const mittatData = readMap('mittatData');
        const sahattu = readMap('checkedSahattu');
        const hitsattu = readMap('checkedHitsattu');
        const maalattu = readMap('checkedMaalattu');
        const done = readMap('doneMitat');
        const packed = readMap('packedMitat');
        const packageNumbers = readMap('packedPackageNumbers');
        const timestamps = readMap('packedTimestamps');
        const jobShipDates = readMap('jobShipDates');
        const jobBlocks = readMap('jobBlocks');
        const itemBlocks = readMap('itemBlocks');
        const sheet = readSheet();
        const rows = [];

        jobs.forEach((jobNumber) => {
            const items = mittatData[jobNumber];
            if (!items || typeof items !== 'object') return;
            const names = Object.keys(items).sort((a, b) => a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' }));
            if (!names.length) return;
            const meta = sheet[jobNumber] && typeof sheet[jobNumber] === 'object' ? sheet[jobNumber] : {};
            const products = names.map((name) => {
                const key = jobNumber + '-' + name;
                const item = items[name] || {};
                const units = typeof parseItemUnitCount === 'function' ? parseItemUnitCount(item) : null;
                const isPacked = !!packed[key];
                return {
                    name: String(name),
                    units: units,
                    color: String(item.lasilistaColor || '').trim(),
                    sahattu: !!sahattu[key],
                    hitsattu: !!hitsattu[key],
                    maalattu: !!maalattu[key],
                    tehty: !!done[key],
                    packed: isPacked,
                    packedStamp: isPacked ? packedStamp(jobNumber, name, packageNumbers, timestamps) : ''
                };
            });
            const total = products.length;
            const doneCount = (match) => products.filter(match).length;
            const packedCount = doneCount((product) => product.packed);
            const hasUnits = products.some((product) => product.units != null);
            rows.push({
                jobNumber: String(jobNumber),
                week: String(meta.week || ''),
                recipient: String(meta.recipient || ''),
                ship: typeof getJobEffectiveShipDate === 'function'
                    ? getJobEffectiveShipDate(jobNumber, jobShipDates, jobBlocks)
                    : '',
                total: total,
                units: hasUnits ? products.reduce((sum, product) => sum + (product.units || 0), 0) : null,
                color: sharedColor(products),
                stages: {
                    saha: stageTone(doneCount((product) => product.sahattu), total),
                    hitsaus: stageTone(doneCount((product) => product.hitsattu), total),
                    maalaus: stageTone(doneCount((product) => product.maalattu), total),
                    listotus: stageTone(doneCount((product) => product.tehty), total),
                    valmis: stageTone(doneCount((product) => product.tehty), total),
                    pakattu: stageTone(packedCount, total)
                },
                packedLabel: packedCount === total ? latestPackedLabel(products) : '',
                products: products,
                groups: blockGroups(jobNumber, names, products, jobBlocks, itemBlocks)
            });
        });

        rows.sort((a, b) => {
            const aWeek = weekNumber(a.week);
            const bWeek = weekNumber(b.week);
            if (aWeek == null && bWeek != null) return 1;
            if (aWeek != null && bWeek == null) return -1;
            if (aWeek != null && bWeek != null && aWeek !== bWeek) return aWeek - bWeek;
            if (a.ship !== b.ship) {
                if (!a.ship) return 1;
                if (!b.ship) return -1;
                return a.ship < b.ship ? -1 : 1;
            }
            return a.jobNumber.localeCompare(b.jobNumber, 'fi', { numeric: true });
        });
        return rows;
    }

    function blockGroups(jobNumber, names, products, jobBlocks, itemBlocks) {
        const blockList = Array.isArray(jobBlocks[jobNumber]) ? jobBlocks[jobNumber] : [];
        if (!blockList.length || typeof getMitatItemBlockGroups !== 'function') return null;
        const byName = new Map(products.map((product) => [product.name, product]));
        return getMitatItemBlockGroups(jobNumber, names, blockList, itemBlocks)
            .map((group) => ({
                name: String(group.name || ''),
                shipDate: group.shipDate || '',
                products: (group.items || []).map((name) => byName.get(name)).filter(Boolean)
            }))
            .filter((group) => group.products.length > 0);
    }

    function textCell(text, className) {
        return element('td', className || '', text);
    }

    function stageCell(tone, text) {
        return element('td', 'yt-cell is-' + tone, text || '');
    }

    function productStage(on, text) {
        return stageCell(on ? 'green' : 'white', text || '');
    }

    function textInput(value, label, onCommit) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'yt-input';
        input.value = value;
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => onCommit(input.value));
        return input;
    }

    function appendJobRow(body, job) {
        const open = expanded.has(job.jobNumber);
        const row = document.createElement('tr');
        row.className = 'yt-job';

        const weekCell = document.createElement('td');
        weekCell.appendChild(textInput(job.week, 'Asennusviikko ' + job.jobNumber, (value) => {
            saveMeta(job.jobNumber, 'week', value);
            render();
        }));
        row.appendChild(weekCell);

        const shipCell = document.createElement('td');
        const shipInput = document.createElement('input');
        shipInput.type = 'date';
        shipInput.className = 'yt-input';
        shipInput.value = job.ship || '';
        shipInput.setAttribute('aria-label', 'Lähetyspäivä ' + job.jobNumber);
        shipInput.addEventListener('change', () => {
            const iso = typeof normalizeShipDate === 'function' ? normalizeShipDate(shipInput.value) : '';
            if (iso === (job.ship || '')) return;
            if (typeof saveShipDate === 'function') saveShipDate({ jobNumber: job.jobNumber, blockId: '' }, iso);
        });
        shipCell.appendChild(shipInput);
        row.appendChild(shipCell);

        row.appendChild(textCell(job.jobNumber, 'yt-job-number'));

        const recipientCell = document.createElement('td');
        const recipientRow = element('div', 'yt-recipient');
        recipientRow.appendChild(textInput(job.recipient, 'Tilauksen vastaanottaja ' + job.jobNumber, (value) => {
            saveMeta(job.jobNumber, 'recipient', value);
        }));
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'yt-expand';
        toggle.textContent = open ? '▾' : '▸';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', (open ? 'Piilota tuotteet ' : 'Näytä tuotteet ') + job.jobNumber);
        toggle.addEventListener('click', () => {
            if (expanded.has(job.jobNumber)) expanded.delete(job.jobNumber);
            else expanded.add(job.jobNumber);
            render();
        });
        recipientRow.appendChild(toggle);
        recipientCell.appendChild(recipientRow);
        row.appendChild(recipientCell);

        row.appendChild(textCell(job.total, 'yt-number'));
        row.appendChild(textCell(job.units == null ? '' : job.units, 'yt-number'));
        row.appendChild(stageCell(job.stages.saha));
        row.appendChild(stageCell(job.stages.hitsaus));
        row.appendChild(stageCell(job.stages.maalaus, job.color));
        row.appendChild(stageCell(job.stages.listotus));
        row.appendChild(stageCell(job.stages.valmis));
        row.appendChild(stageCell(job.stages.pakattu, job.packedLabel));
        body.appendChild(row);

        if (!open) return;
        if (job.groups && job.groups.length) job.groups.forEach((group) => appendBlockRows(body, group));
        else job.products.forEach((product) => body.appendChild(productRow(product, true)));
    }

    function appendProductCells(row, product) {
        row.appendChild(textCell(product.name, 'yt-product-name'));
        row.appendChild(textCell('1', 'yt-number'));
        row.appendChild(textCell(product.units == null ? '' : product.units, 'yt-number'));
        row.appendChild(productStage(product.sahattu));
        row.appendChild(productStage(product.hitsattu));
        row.appendChild(productStage(product.maalattu, product.color));
        row.appendChild(productStage(product.tehty));
        row.appendChild(productStage(product.tehty));
        row.appendChild(productStage(product.packed, product.packed ? formatStamp(product.packedStamp) : ''));
    }

    function productRow(product, plain) {
        const row = document.createElement('tr');
        row.className = 'yt-product';
        if (plain) {
            row.appendChild(textCell(''));
            row.appendChild(textCell(''));
            row.appendChild(textCell(''));
        }
        appendProductCells(row, product);
        return row;
    }

    function appendBlockRows(body, group) {
        const span = group.products.length;
        group.products.forEach((product, index) => {
            const row = document.createElement('tr');
            row.className = 'yt-product';
            row.appendChild(textCell(''));
            if (index === 0) {
                const dateCell = textCell(formatIsoDate(group.shipDate), 'yt-block-date');
                const nameCell = textCell(group.name, 'yt-block-name');
                dateCell.rowSpan = span;
                nameCell.rowSpan = span;
                row.append(dateCell, nameCell);
            }
            appendProductCells(row, product);
            body.appendChild(row);
        });
    }

    function renderZoom(zoom) {
        const bar = element('div', 'yt-zoom');
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'yt-zoom-btn';
        down.textContent = '−';
        down.setAttribute('aria-label', 'Pienennä taulukkoa');
        down.disabled = zoom <= MIN_ZOOM;
        down.addEventListener('click', () => {
            writeZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP));
            render();
        });
        const label = element('span', 'yt-zoom-label', zoom + '%');
        label.setAttribute('aria-live', 'polite');
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'yt-zoom-btn';
        up.textContent = '+';
        up.setAttribute('aria-label', 'Suurenna taulukkoa');
        up.disabled = zoom >= MAX_ZOOM;
        up.addEventListener('click', () => {
            writeZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP));
            render();
        });
        bar.append(down, label, up);
        return bar;
    }

    function render() {
        if (!hostEl) return;
        const zoom = readZoom();
        const jobs = buildJobs();
        const page = element('div', 'yt-page');
        const scroll = element('div', 'yt-scroll');
        const sheet = element('div', 'yt-sheet');
        sheet.style.zoom = String(zoom / 100);

        if (!jobs.length) {
            const empty = element('p', 'yt-empty', 'Ei koetöitä.');
            sheet.appendChild(empty);
        } else {
            const table = document.createElement('table');
            table.className = 'yt-table';
            const caption = element('caption', 'yt-caption', 'Yleistaulukko');
            const head = document.createElement('thead');
            const headRow = document.createElement('tr');
            COLUMNS.forEach((column) => {
                const cell = document.createElement('th');
                cell.scope = 'col';
                cell.textContent = column.label;
                headRow.appendChild(cell);
            });
            head.appendChild(headRow);
            const body = document.createElement('tbody');
            jobs.forEach((job) => appendJobRow(body, job));
            table.append(caption, head, body);
            sheet.appendChild(table);
        }

        scroll.appendChild(sheet);
        page.append(scroll, renderZoom(zoom));
        hostEl.replaceChildren(page);
    }

    function mount(host) {
        if (!host) return;
        hostEl = host;
        host.hidden = false;
        render();
    }

    function unmount(host) {
        if (host) {
            host.replaceChildren();
            host.hidden = true;
        }
        if (hostEl === host) hostEl = null;
    }

    function refresh() {
        if (hostEl) render();
    }

    window.Yleistaulukko = { mount: mount, unmount: unmount, refresh: refresh };
})();
