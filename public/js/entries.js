let entries = [];
let filteredEntries = [];
let editingId = null;

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  loadEntries();
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
  els.searchInput = document.getElementById('searchInput');
  els.refreshBtn = document.getElementById('refreshBtn');
  els.normalizeBtn = document.getElementById('normalizeBtn');
  els.resetEntryBtn = document.getElementById('resetEntryBtn');
  els.sumTotal = document.getElementById('sumTotal');
  els.sumActive = document.getElementById('sumActive');
  els.sumSkipped = document.getElementById('sumSkipped');
}

function bindEvents() {
  els.form?.addEventListener('submit', onSubmit);
  els.refreshBtn?.addEventListener('click', () => loadEntries());
  els.resetEntryBtn?.addEventListener('click', resetForm);
  els.normalizeBtn?.addEventListener('click', normalizeOrders);
  els.searchInput?.addEventListener('input', applyFilterAndRender);
  els.entriesBody?.addEventListener('click', onTableClick);
}

async function loadEntries() {
  try {
    const res = await fetch('/api/entries', { cache: 'no-store' });
    const data = await res.json();
    entries = Array.isArray(data) ? data : [];
    applyFilterAndRender();
    if (!editingId) autofillNextOrder();
  } catch (err) {
    console.error(err);
    alert('Entries の読み込みに失敗しました');
  }
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
    els.entriesBody.innerHTML = '<tr><td colspan="7" class="empty-cell">該当データがありません</td></tr>';
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
        <td><span class="status-pill">${skipped ? 'SKIP' : 'READY'}</span></td>
        <td class="actions-cell">
          <button type="button" class="table-btn" data-action="edit">編集</button>
          <button type="button" class="table-btn" data-action="toggle-skip">${skipped ? '復帰' : 'スキップ'}</button>
          <button type="button" class="table-btn warn" data-action="delete">削除</button>
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
    alert('ゼッケン番号を入力してください');
    return;
  }
  if (!payload.name) {
    alert('選手名を入力してください');
    return;
  }
  if (!Number.isInteger(payload.startOrder) || payload.startOrder <= 0) {
    alert('スタート順を入力してください');
    return;
  }
  if (!Number.isInteger(payload.effectiveOrder) || payload.effectiveOrder <= 0) {
    alert('現在順を入力してください');
    return;
  }

  const duplicateBib = entries.find((row) => Number(row.bib_no) === payload.bibNo && Number(row.id) !== Number(editingId));
  if (duplicateBib) {
    alert('同じゼッケン番号が既に登録されています');
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
      alert(json.error || '保存に失敗しました');
      return;
    }
    resetForm();
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('保存に失敗しました');
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
    alert('スキップ状態の更新に失敗しました');
  }
}

async function deleteEntry(id) {
  const row = entries.find((entry) => Number(entry.id) === Number(id));
  if (!row) return;
  const ok = window.confirm(`ゼッケン ${row.bib_no} / ${row.name} を削除しますか？`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || '削除に失敗しました');
      return;
    }
    if (Number(editingId) === Number(id)) resetForm();
    await loadEntries();
  } catch (err) {
    console.error(err);
    alert('削除に失敗しました');
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
    alert('順番詰めに失敗しました');
  }
}

function resetForm() {
  editingId = null;
  els.entryId.value = '';
  els.form.reset();
  autofillNextOrder();
  applyFilterAndRender();
}

function autofillNextOrder() {
  const maxOrder = entries.reduce((max, row) => Math.max(max, Number(row.effective_order) || 0, Number(row.start_order) || 0), 0);
  const nextOrder = maxOrder + 1 || 1;
  els.startOrder.value = String(nextOrder);
  els.effectiveOrder.value = String(nextOrder);
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
