let entries = [];
let filteredEntries = [];
let editingId = null;
let heats = [];
let currentHeatId = null;

const els = {};
const CSV_HEADER_ALIASES = {
  bibno: 'bibNo',
  bib: 'bibNo',
  bibnumber: 'bibNo',
  zekken: 'bibNo',
  '\u30bc\u30c3\u30b1\u30f3': 'bibNo',
  name: 'name',
  driver: 'name',
  '\u540d\u524d': 'name',
  kana: 'kana',
  '\u304b\u306a': 'kana',
  '\u30d5\u30ea\u30ac\u30ca': 'kana',
  furigana: 'kana',
  carno: 'carNo',
  car: 'carNo',
  carnumber: 'carNo',
  '\u8eca\u756a': 'carNo',
  '\u8eca\u4e21\u756a\u53f7': 'carNo',
  startorder: 'startOrder',
  order: 'startOrder',
  '\u51fa\u8d70\u9806': 'startOrder',
  '\u958b\u59cb\u9806': 'startOrder',
  displayorder: 'effectiveOrder',
  effectiveorder: 'effectiveOrder',
  sortorder: 'effectiveOrder',
  '\u8868\u793a\u9806': 'effectiveOrder',
  memo: 'memo',
  note: 'memo',
  '\u30e1\u30e2': 'memo',
};

document.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  bindEvents();
  await Promise.all([loadEntries(), loadHeats()]);
});

function bindElements() {
  els.form = document.getElementById('entryForm');
  els.entryId = document.getElementById('entryId');
  els.bibNo = document.getElementById('bibNo');
  els.name = document.getElementById('name');
  els.kana = document.getElementById('kana');
  els.carNo = document.getElementById('carNo');
  els.startOrder = document.getElementById('startOrder');
  els.effectiveOrder = document.getElementById('effectiveOrder');
  els.memo = document.getElementById('memo');
  els.entriesBody = document.getElementById('entriesBody');
  els.currentHeatId = document.getElementById('currentHeatId');
  els.heatCode = document.getElementById('heatCode');
  els.heatTitle = document.getElementById('heatTitle');
  els.selectHeatBtn = document.getElementById('selectHeatBtn');
  els.saveHeatBtn = document.getElementById('saveHeatBtn');
  els.searchInput = document.getElementById('searchInput');
  els.refreshBtn = document.getElementById('refreshBtn');
  els.normalizeBtn = document.getElementById('normalizeBtn');
  els.resetEntryBtn = document.getElementById('resetEntryBtn');
  els.csvFile = document.getElementById('csvFile');
  els.importCsvBtn = document.getElementById('importCsvBtn');
  els.sumTotal = document.getElementById('sumTotal');
  els.sumActive = document.getElementById('sumActive');
  els.sumSkipped = document.getElementById('sumSkipped');
}

function bindEvents() {
  els.form?.addEventListener('submit', onSubmit);
  els.refreshBtn?.addEventListener('click', () => loadEntries());
  els.resetEntryBtn?.addEventListener('click', resetForm);
  els.normalizeBtn?.addEventListener('click', normalizeOrders);
  els.selectHeatBtn?.addEventListener('click', selectCurrentHeat);
  els.saveHeatBtn?.addEventListener('click', saveHeat);
  els.importCsvBtn?.addEventListener('click', importCsv);
  els.searchInput?.addEventListener('input', applyFilterAndRender);
  els.entriesBody?.addEventListener('click', onTableClick);
}

async function loadEntries() {
  try {
    const res = await fetch('/api/entries', { cache: 'no-store' });
    const data = await res.json();
    entries = Array.isArray(data) ? data : [];
    applyFilterAndRender();
    if (!editingId) autofillNextDefaults();
  } catch (err) {
    console.error(err);
    alert('Failed to load entries');
  }
}

async function loadHeats() {
  try {
    const heatsRes = await fetch('/api/heats', { cache: 'no-store' });
    const heatsJson = await heatsRes.json().catch(() => ([]));
    if (!heatsRes.ok) {
      throw new Error(heatsJson.error || 'Failed to load heats');
    }
    heats = Array.isArray(heatsJson) ? heatsJson : [];
    renderHeatOptions();

    const controlRes = await fetch('/api/control/state', { cache: 'no-store' });
    const controlJson = await controlRes.json().catch(() => ({}));
    if (controlRes.ok) {
      currentHeatId = controlJson.heatId ?? null;
      renderHeatOptions();
    } else {
      console.warn('Failed to load control state for heat selection', controlJson);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load heats');
  }
}

function renderHeatOptions() {
  if (!els.currentHeatId) return;
  const options = ['<option value="">-</option>'];
  for (const heat of heats) {
    const label = [heat.code || heat.heat_no || '-', heat.title].filter(Boolean).join(' / ');
    options.push(`<option value="${heat.id}">${escapeHtml(label)}</option>`);
  }
  els.currentHeatId.innerHTML = options.join('');
  els.currentHeatId.value = currentHeatId ? String(currentHeatId) : '';
}

function applyFilterAndRender() {
  const keyword = (els.searchInput?.value || '').trim().toLowerCase();
  filteredEntries = entries.filter((row) => {
    if (!keyword) return true;
    return [row.bib_no, row.name, row.kana, row.car_no]
      .filter((v) => v !== null && v !== undefined)
      .some((v) => String(v).toLowerCase().includes(keyword));
  });
  renderSummary();
  renderTable();
}

function renderSummary() {
  const total = entries.length;
  const skipped = entries.filter((row) => Number(row.is_skipped) === 1).length;
  const active = total - skipped;
  els.sumTotal.textContent = total;
  els.sumActive.textContent = active;
  els.sumSkipped.textContent = skipped;
}

function renderTable() {
  if (!filteredEntries.length) {
    els.entriesBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No entries found</td></tr>';
    return;
  }

  els.entriesBody.innerHTML = filteredEntries.map((row) => {
    const skipped = Number(row.is_skipped) === 1;
    const isEditing = Number(row.id) === Number(editingId);
    return `
      <tr data-id="${row.id}" class="${skipped ? 'is-skipped' : ''} ${isEditing ? 'is-editing' : ''}">
        <td>${escapeHtml(String(row.effective_order ?? ''))}</td>
        <td>${escapeHtml(String(row.bib_no ?? ''))}</td>
        <td>${escapeHtml(row.name ?? '')}</td>
        <td>${escapeHtml(row.kana ?? '')}</td>
        <td>${escapeHtml(row.car_no ?? '')}</td>
        <td><button type="button" class="status-pill ${skipped ? 'is-skipped' : 'is-active'}" data-action="toggle-skip">${skipped ? '\u30b9\u30ad\u30c3\u30d7' : '\u6709\u52b9'}</button></td>
        <td class="actions-cell">
          <button type="button" class="table-btn" data-action="edit">Edit</button>
          <button type="button" class="table-btn" data-action="toggle-skip">${skipped ? 'Undo' : 'Skip'}</button>
          <button type="button" class="table-btn warn" data-action="delete">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function onSubmit(event) {
  event.preventDefault();

  const bibNo = Number(els.bibNo.value);
  const startOrder = Number(els.startOrder.value);
  const effectiveOrder = Number(els.effectiveOrder.value || els.startOrder.value);
  const payload = {
    bibNo,
    name: els.name.value.trim(),
    kana: normalizeEmpty(els.kana.value),
    carNo: normalizeEmpty(els.carNo.value),
    startOrder,
    effectiveOrder,
    memo: normalizeEmpty(els.memo.value),
  };

  if (!Number.isInteger(payload.bibNo) || payload.bibNo <= 0) {
    alert('Bib No must be a positive integer');
    return;
  }
  if (!payload.name) {
    alert('Name is required');
    return;
  }
  if (!Number.isInteger(payload.startOrder) || payload.startOrder <= 0) {
    alert('Start Order is required');
    return;
  }
  if (!Number.isInteger(payload.effectiveOrder) || payload.effectiveOrder <= 0) {
    alert('Display Order is required');
    return;
  }

  const duplicateBib = entries.find((row) => Number(row.bib_no) === payload.bibNo && Number(row.id) !== Number(editingId));
  if (duplicateBib) {
    alert('Duplicate Bib No');
    return;
  }

  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/entries/${editingId}` : '/api/entries';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to save entry');
      return;
    }
    resetForm();
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('Failed to save entry');
  }
}

function onTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const tr = event.target.closest('tr[data-id]');
  if (!tr) return;

  const id = Number(tr.dataset.id);
  const action = button.dataset.action;

  if (action === 'edit') {
    startEdit(id);
    return;
  }
  if (action === 'toggle-skip') {
    toggleSkip(id);
    return;
  }
  if (action === 'delete') {
    deleteEntry(id);
  }
}

function startEdit(id) {
  const row = entries.find((entry) => Number(entry.id) === Number(id));
  if (!row) return;

  editingId = row.id;
  els.entryId.value = row.id;
  els.bibNo.value = row.bib_no ?? '';
  els.name.value = row.name ?? '';
  els.kana.value = row.kana ?? '';
  els.carNo.value = row.car_no ?? '';
  els.startOrder.value = row.start_order ?? '';
  els.effectiveOrder.value = row.effective_order ?? '';
  els.memo.value = row.memo ?? '';
  applyFilterAndRender();
  els.name.focus();
}

async function toggleSkip(id) {
  const row = entries.find((entry) => Number(entry.id) === Number(id));
  if (!row) return;
  const skipped = Number(row.is_skipped) === 1;
  const endpoint = skipped ? 'unskip' : 'skip';

  try {
    const res = await fetch(`/api/entries/${id}/${endpoint}`, { method: 'POST' });
    if (!res.ok) throw new Error('skip toggle failed');
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('Failed to update skip state');
  }
}

async function deleteEntry(id) {
  const row = entries.find((entry) => Number(entry.id) === Number(id));
  if (!row) return;
  const ok = window.confirm(`Delete entry ${row.bib_no} / ${row.name}?`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to delete entry');
      return;
    }
    if (Number(editingId) === Number(id)) resetForm();
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('Failed to delete entry');
  }
}

async function normalizeOrders() {
  const sorted = [...entries].sort((a, b) => {
    return Number(a.effective_order) - Number(b.effective_order) || Number(a.bib_no) - Number(b.bib_no);
  });

  try {
    for (let index = 0; index < sorted.length; index += 1) {
      const row = sorted[index];
      const nextOrder = index + 1;
      if (Number(row.effective_order) === nextOrder) continue;
      await fetch(`/api/entries/${row.id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveOrder: nextOrder, reason: 'normalize from entries screen' }),
      });
    }
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('Failed to normalize orders');
  }
}

async function selectCurrentHeat() {
  const heatId = Number(els.currentHeatId.value);
  if (!heatId) {
    alert('Select a heat first');
    return;
  }

  try {
    const res = await fetch(`/api/heats/current/${heatId}`, { method: 'PUT' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to select heat');
      return;
    }
    currentHeatId = heatId;
    renderHeatOptions();
  } catch (err) {
    console.error(err);
    alert('Failed to select heat');
  }
}

async function saveHeat() {
  const code = String(els.heatCode.value || '').trim().toUpperCase();
  const title = normalizeEmpty(els.heatTitle.value);

  if (!/^[A-Z0-9]{1,2}$/.test(code)) {
    alert('Heat Code must be 1-2 alphanumeric characters');
    return;
  }

  try {
    const res = await fetch('/api/heats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        title,
        heatNo: heats.length + 1,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to add heat');
      return;
    }
    heats.push(json);
    heats.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')) || Number(a.heat_no || 0) - Number(b.heat_no || 0) || Number(a.id) - Number(b.id));
    els.heatCode.value = '';
    els.heatTitle.value = '';
    renderHeatOptions();
    els.currentHeatId.value = String(json.id);
    await selectCurrentHeat();
  } catch (err) {
    console.error(err);
    alert('Failed to add heat');
  }
}

function resetForm() {
  editingId = null;
  els.entryId.value = '';
  els.form.reset();
  autofillNextDefaults();
  applyFilterAndRender();
}

function autofillNextDefaults() {
  const nextDefaults = getNextDefaults(entries);
  els.bibNo.value = String(nextDefaults.bibNo);
  els.carNo.value = nextDefaults.carNo;
  els.startOrder.value = String(nextDefaults.startOrder);
  els.effectiveOrder.value = String(nextDefaults.effectiveOrder);
}

function getNextDefaults(sourceEntries) {
  const sorted = [...sourceEntries].sort((a, b) => {
    return Number(a.effective_order) - Number(b.effective_order)
      || Number(a.start_order) - Number(b.start_order)
      || Number(a.bib_no) - Number(b.bib_no)
      || Number(a.id) - Number(b.id);
  });
  const lastRow = sorted[sorted.length - 1] || null;
  const maxBib = sourceEntries.reduce((max, row) => Math.max(max, Number(row.bib_no) || 0), 0);
  const maxOrder = sourceEntries.reduce((max, row) => Math.max(max, Number(row.effective_order) || 0, Number(row.start_order) || 0), 0);
  return {
    bibNo: maxBib + 1 || 1,
    carNo: incrementCarNo(lastRow?.car_no ?? ''),
    startOrder: maxOrder + 1 || 1,
    effectiveOrder: maxOrder + 1 || 1,
  };
}

function incrementCarNo(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return '';
  const [, prefix, digits] = match;
  const nextValue = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${nextValue}`;
}

async function importCsv() {
  const file = els.csvFile?.files?.[0];
  if (!file) {
    alert('Select a CSV file first');
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      alert('CSV file is empty');
      return;
    }

    const normalizedRows = buildImportRows(rows);
    if (!normalizedRows.length) {
      alert('No importable rows found');
      return;
    }

    const res = await fetch('/api/entries/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: normalizedRows }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to import CSV');
      return;
    }

    els.csvFile.value = '';
    resetForm();
    await loadEntries();
    alert(`Imported ${json.count || normalizedRows.length} entries`);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to import CSV');
  }
}

function buildImportRows(csvRows) {
  const [headerRow, ...dataRows] = csvRows;
  const headerMap = headerRow.map((header) => CSV_HEADER_ALIASES[normalizeHeader(header)] || null);
  if (!headerMap.includes('name')) {
    throw new Error('CSV header must include Name');
  }

  const importRows = [];
  let nextDefaults = getNextDefaults(entries);

  for (const dataRow of dataRows) {
    if (!dataRow.some((cell) => String(cell ?? '').trim())) continue;

    const raw = {};
    for (let index = 0; index < headerMap.length; index += 1) {
      const key = headerMap[index];
      if (!key) continue;
      raw[key] = dataRow[index];
    }

    const name = String(raw.name || '').trim();
    if (!name) {
      throw new Error('CSV contains a row without Name');
    }

    const bibNo = parseOptionalPositiveInt(raw.bibNo) ?? nextDefaults.bibNo;
    const carNo = normalizeEmpty(raw.carNo) ?? nextDefaults.carNo;
    const startOrder = parseOptionalPositiveInt(raw.startOrder) ?? nextDefaults.startOrder;
    const effectiveOrder = parseOptionalPositiveInt(raw.effectiveOrder) ?? startOrder;

    const row = {
      bibNo,
      name,
      kana: normalizeEmpty(raw.kana),
      carNo,
      startOrder,
      effectiveOrder,
      memo: normalizeEmpty(raw.memo),
    };

    importRows.push(row);
    nextDefaults = {
      bibNo: bibNo + 1,
      carNo: incrementCarNo(carNo),
      startOrder: Math.max(startOrder, effectiveOrder) + 1,
      effectiveOrder: Math.max(startOrder, effectiveOrder) + 1,
    };
  }

  return importRows;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_./-]+/g, '');
}

function parseOptionalPositiveInt(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid number: ${text}`);
  }
  return parsed;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeEmpty(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
