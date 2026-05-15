'use strict';

const state = {
  htmlPath: null,
  htmlOriginal: '',
  htmlCurrent: '',
  doc: null,
  fields: [],
  dataRows: [],
  dataColumns: [],
  mapping: {},
  currentRowIndex: 0
};

const el = {
  btnOpenHtml: document.getElementById('btn-open-html'),
  btnImportData: document.getElementById('btn-import-data'),
  btnAutoMap: document.getElementById('btn-auto-map'),
  btnFill: document.getElementById('btn-fill'),
  btnExportSingle: document.getElementById('btn-export-single'),
  btnExportBatch: document.getElementById('btn-export-batch'),
  btnPrevRow: document.getElementById('btn-prev-row'),
  btnNextRow: document.getElementById('btn-next-row'),
  btnReloadPreview: document.getElementById('btn-reload-preview'),
  btnCopySource: document.getElementById('btn-copy-source'),
  btnCloseAbout: document.getElementById('btn-close-about'),
  htmlStatus: document.getElementById('html-status'),
  dataStatus: document.getElementById('data-status'),
  mappingArea: document.getElementById('mapping-area'),
  rowIndicator: document.getElementById('row-indicator'),
  fieldsCount: document.getElementById('fields-count'),
  dataCount: document.getElementById('data-count'),
  fieldsTable: document.getElementById('fields-table').querySelector('tbody'),
  fieldsEmpty: document.getElementById('fields-empty'),
  dataTable: document.getElementById('data-table'),
  dataEmpty: document.getElementById('data-empty'),
  previewFrame: document.getElementById('preview-frame'),
  sourceView: document.getElementById('source-view'),
  toast: document.getElementById('toast'),
  aboutModal: document.getElementById('about-modal'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content')
};

// ---------- Toast ----------
function showToast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.className = 'toast show ' + type;
  setTimeout(() => {
    el.toast.className = 'toast';
  }, 2500);
}

// ---------- Tabs ----------
el.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    el.tabs.forEach(t => t.classList.toggle('active', t === tab));
    el.tabContents.forEach(c =>
      c.classList.toggle('active', c.dataset.tab === name)
    );
  });
});

// ---------- HTML Loading ----------
async function loadHtmlFile() {
  const result = await window.electronAPI.openHtml();
  if (!result) return;
  state.htmlPath = result.path;
  state.htmlOriginal = result.content;
  state.htmlCurrent = result.content;
  parseHtml(result.content);
  renderPreview(result.content);
  renderSource(result.content);
  renderFields();
  updateMappingUI();
  updateButtons();
  const filename = result.path.split(/[\\/]/).pop();
  el.htmlStatus.textContent = filename;
  el.htmlStatus.classList.add('loaded');
  showToast(`已加载 ${filename}，检测到 ${state.fields.length} 个字段`, 'success');
}

function parseHtml(html) {
  const parser = new DOMParser();
  state.doc = parser.parseFromString(html, 'text/html');
  state.fields = extractFields(state.doc);
}

function extractFields(doc) {
  const fields = [];
  const seen = new Set();

  const fieldSelectors = [
    'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="hidden"])',
    'textarea',
    'select'
  ];

  fieldSelectors.forEach(selector => {
    doc.querySelectorAll(selector).forEach(node => {
      const info = buildFieldInfo(node, doc);
      if (!info) return;

      // For radio groups, only add the group once
      if (info.type === 'radio') {
        const key = `radio:${info.name}`;
        if (seen.has(key)) return;
        seen.add(key);
      }

      fields.push(info);
    });
  });

  return fields;
}

function buildFieldInfo(node, doc) {
  const tag = node.tagName.toLowerCase();
  let type = tag;
  if (tag === 'input') type = (node.getAttribute('type') || 'text').toLowerCase();

  const name = node.getAttribute('name') || '';
  const id = node.getAttribute('id') || '';
  const placeholder = node.getAttribute('placeholder') || '';
  const value = readValue(node);
  const label = findLabel(node, doc);

  // Build a stable identifier
  const identifier = id || name || `${type}-${label}`;
  if (!identifier) return null;

  return {
    identifier,
    name,
    id,
    type,
    label,
    placeholder,
    value,
    tag
  };
}

function readValue(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'textarea') return node.textContent.trim();
  if (tag === 'select') {
    const opt = node.querySelector('option[selected]');
    return opt ? (opt.getAttribute('value') || opt.textContent || '') : '';
  }
  const type = (node.getAttribute('type') || 'text').toLowerCase();
  if (type === 'checkbox' || type === 'radio') {
    return node.hasAttribute('checked') ? (node.getAttribute('value') || 'on') : '';
  }
  return node.getAttribute('value') || '';
}

function findLabel(node, doc) {
  const id = node.getAttribute('id');
  if (id) {
    const lbl = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  let parent = node.parentElement;
  while (parent && parent !== doc.body) {
    if (parent.tagName.toLowerCase() === 'label') {
      return parent.textContent.trim();
    }
    parent = parent.parentElement;
  }
  const placeholder = node.getAttribute('placeholder');
  if (placeholder) return placeholder;
  return node.getAttribute('name') || '';
}

function cssEscape(s) {
  return s.replace(/(["\\])/g, '\\$1');
}

// ---------- Data Loading ----------
async function loadDataFile() {
  const result = await window.electronAPI.openData();
  if (!result) return;
  try {
    if (result.type === 'csv') {
      const parsed = parseCSV(result.content);
      state.dataColumns = parsed.headers;
      state.dataRows = parsed.rows;
    } else if (result.type === 'json') {
      const parsed = parseJSON(result.content);
      state.dataColumns = parsed.headers;
      state.dataRows = parsed.rows;
    }
  } catch (err) {
    showToast(`数据解析失败：${err.message}`, 'error');
    return;
  }

  state.currentRowIndex = 0;
  renderDataTable();
  updateMappingUI();
  autoMap();
  updateRowIndicator();
  updateButtons();
  const filename = result.path.split(/[\\/]/).pop();
  el.dataStatus.textContent = `${filename}（${state.dataRows.length} 行）`;
  el.dataStatus.classList.add('loaded');
  showToast(`已导入 ${state.dataRows.length} 行数据`, 'success');
}

function parseCSV(text) {
  // Lightweight CSV parser with quote handling
  text = text.replace(/^﻿/, ''); // strip BOM
  const lines = [];
  let current = [''];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current[current.length - 1] += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current[current.length - 1] += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      current.push('');
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      lines.push(current);
      current = [''];
      i++;
      continue;
    }
    current[current.length - 1] += ch;
    i++;
  }
  if (current.length > 1 || current[0] !== '') lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map(h => h.trim());
  const rows = lines.slice(1)
    .filter(line => line.some(cell => cell !== ''))
    .map(line => {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (line[idx] !== undefined ? line[idx] : '').trim();
      });
      return row;
    });
  return { headers, rows };
}

function parseJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('JSON 文件必须是对象数组（[{...}, {...}]）');
  }
  if (data.length === 0) return { headers: [], rows: [] };
  const headerSet = new Set();
  data.forEach(obj => {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(k => headerSet.add(k));
    }
  });
  const headers = Array.from(headerSet);
  const rows = data.map(obj => {
    const row = {};
    headers.forEach(h => {
      row[h] = obj[h] !== undefined && obj[h] !== null ? String(obj[h]) : '';
    });
    return row;
  });
  return { headers, rows };
}

// ---------- Mapping ----------
function updateMappingUI() {
  el.mappingArea.innerHTML = '';
  if (state.fields.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = '先加载 HTML，识别字段后在此映射。';
    el.mappingArea.appendChild(p);
    return;
  }
  if (state.dataColumns.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = '请导入 CSV 或 JSON 数据。';
    el.mappingArea.appendChild(p);
    return;
  }

  state.fields.forEach(field => {
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const fieldLabel = document.createElement('span');
    fieldLabel.className = 'mapping-field';
    fieldLabel.title = field.identifier;
    fieldLabel.textContent = field.label || field.identifier;

    const select = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— 不映射 —';
    select.appendChild(none);
    state.dataColumns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      if (state.mapping[field.identifier] === col) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      if (select.value) {
        state.mapping[field.identifier] = select.value;
      } else {
        delete state.mapping[field.identifier];
      }
    });

    row.appendChild(fieldLabel);
    row.appendChild(select);
    el.mappingArea.appendChild(row);
  });
}

function autoMap() {
  if (state.fields.length === 0 || state.dataColumns.length === 0) return;
  const normalized = state.dataColumns.map(c => ({
    raw: c,
    norm: normalize(c)
  }));
  state.fields.forEach(field => {
    if (state.mapping[field.identifier]) return; // keep manual choice
    const candidates = [field.name, field.id, field.label, field.placeholder]
      .filter(Boolean)
      .map(normalize);
    for (const cand of candidates) {
      const match = normalized.find(col => col.norm === cand);
      if (match) {
        state.mapping[field.identifier] = match.raw;
        return;
      }
    }
    for (const cand of candidates) {
      const match = normalized.find(col =>
        col.norm.includes(cand) || cand.includes(col.norm)
      );
      if (match) {
        state.mapping[field.identifier] = match.raw;
        return;
      }
    }
  });
  updateMappingUI();
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[\s_\-]/g, '');
}

// ---------- Fill ----------
function fillCurrentRow() {
  if (!state.doc || state.dataRows.length === 0) return;
  const row = state.dataRows[state.currentRowIndex];
  const filled = applyDataToHtml(state.htmlOriginal, row);
  state.htmlCurrent = filled;
  renderPreview(filled);
  renderSource(filled);
  renderFields();
  showToast(`已填充第 ${state.currentRowIndex + 1} 行数据`, 'success');
}

function applyDataToHtml(htmlString, dataRow) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const fields = extractFields(doc);

  fields.forEach(field => {
    const col = state.mapping[field.identifier];
    if (!col) return;
    const value = dataRow[col];
    if (value === undefined) return;
    applyValueToDoc(doc, field, value);
  });

  // Refresh field state cache for the source view
  state.fields = extractFields(doc);

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function applyValueToDoc(doc, field, value) {
  const valueStr = String(value);

  if (field.tag === 'textarea') {
    const nodes = findNodes(doc, 'textarea', field);
    nodes.forEach(n => {
      n.textContent = valueStr;
      n.setAttribute('data-filled', '1');
    });
    return;
  }

  if (field.tag === 'select') {
    const nodes = findNodes(doc, 'select', field);
    nodes.forEach(select => {
      select.querySelectorAll('option').forEach(opt => opt.removeAttribute('selected'));
      const norm = normalize(valueStr);
      const options = Array.from(select.querySelectorAll('option'));
      let match = options.find(opt =>
        (opt.getAttribute('value') || '') === valueStr ||
        opt.textContent.trim() === valueStr
      );
      if (!match) {
        match = options.find(opt =>
          normalize(opt.getAttribute('value') || '') === norm ||
          normalize(opt.textContent || '') === norm
        );
      }
      if (match) match.setAttribute('selected', 'selected');
    });
    return;
  }

  // input
  if (field.type === 'radio') {
    const radios = Array.from(doc.querySelectorAll(`input[type="radio"][name="${cssEscape(field.name)}"]`));
    radios.forEach(r => r.removeAttribute('checked'));
    const norm = normalize(valueStr);
    let match = radios.find(r =>
      (r.getAttribute('value') || '') === valueStr
    );
    if (!match) {
      match = radios.find(r => normalize(r.getAttribute('value') || '') === norm);
    }
    if (match) match.setAttribute('checked', 'checked');
    return;
  }

  if (field.type === 'checkbox') {
    const nodes = findNodes(doc, 'input', field);
    const truthy = isTruthyValue(valueStr);
    nodes.forEach(n => {
      if (truthy) n.setAttribute('checked', 'checked');
      else n.removeAttribute('checked');
    });
    return;
  }

  // Text-like inputs (text, email, number, date, tel, url, password, etc.)
  const nodes = findNodes(doc, 'input', field);
  nodes.forEach(n => {
    n.setAttribute('value', valueStr);
    n.setAttribute('data-filled', '1');
  });
}

function findNodes(doc, tag, field) {
  if (field.id) {
    const byId = doc.getElementById(field.id);
    if (byId && byId.tagName.toLowerCase() === tag) return [byId];
  }
  if (field.name) {
    return Array.from(doc.querySelectorAll(`${tag}[name="${cssEscape(field.name)}"]`));
  }
  return [];
}

function isTruthyValue(v) {
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', '是', '真', 'checked'].includes(s);
}

// ---------- Rendering ----------
function renderPreview(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  el.previewFrame.src = url;
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function renderSource(html) {
  el.sourceView.textContent = html;
}

function renderFields() {
  el.fieldsTable.innerHTML = '';
  if (state.fields.length === 0) {
    el.fieldsEmpty.classList.remove('hidden');
    el.fieldsCount.textContent = '0 个字段';
    return;
  }
  el.fieldsEmpty.classList.add('hidden');
  el.fieldsCount.textContent = `${state.fields.length} 个字段`;

  state.fields.forEach((field, idx) => {
    const tr = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.textContent = idx + 1;

    const tdId = document.createElement('td');
    tdId.textContent = field.id || field.name || '(无标识)';

    const tdType = document.createElement('td');
    const typeTag = document.createElement('span');
    typeTag.className = 'type-tag';
    typeTag.textContent = field.type;
    tdType.appendChild(typeTag);

    const tdLabel = document.createElement('td');
    tdLabel.textContent = field.label || '-';

    const tdPlaceholder = document.createElement('td');
    tdPlaceholder.textContent = field.placeholder || '-';

    const tdValue = document.createElement('td');
    tdValue.textContent = field.value || '-';

    tr.appendChild(tdIdx);
    tr.appendChild(tdId);
    tr.appendChild(tdType);
    tr.appendChild(tdLabel);
    tr.appendChild(tdPlaceholder);
    tr.appendChild(tdValue);
    el.fieldsTable.appendChild(tr);
  });
}

function renderDataTable() {
  const thead = el.dataTable.querySelector('thead');
  const tbody = el.dataTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if (state.dataRows.length === 0) {
    el.dataEmpty.classList.remove('hidden');
    el.dataCount.textContent = '0 行';
    return;
  }
  el.dataEmpty.classList.add('hidden');
  el.dataCount.textContent = `${state.dataRows.length} 行`;

  const headerRow = document.createElement('tr');
  const numTh = document.createElement('th');
  numTh.textContent = '#';
  headerRow.appendChild(numTh);
  state.dataColumns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  state.dataRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    if (idx === state.currentRowIndex) tr.classList.add('highlight');
    const numTd = document.createElement('td');
    numTd.textContent = idx + 1;
    tr.appendChild(numTd);
    state.dataColumns.forEach(col => {
      const td = document.createElement('td');
      td.textContent = row[col] || '';
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => {
      state.currentRowIndex = idx;
      updateRowIndicator();
      renderDataTable();
    });
    tbody.appendChild(tr);
  });
}

function updateRowIndicator() {
  const total = state.dataRows.length;
  if (total === 0) {
    el.rowIndicator.textContent = '0 / 0';
    return;
  }
  el.rowIndicator.textContent = `${state.currentRowIndex + 1} / ${total}`;
}

function updateButtons() {
  const hasHtml = state.fields.length > 0;
  const hasData = state.dataRows.length > 0;
  const ready = hasHtml && hasData;
  el.btnAutoMap.disabled = !ready;
  el.btnFill.disabled = !ready;
  el.btnExportSingle.disabled = !ready;
  el.btnExportBatch.disabled = !ready;
  el.btnPrevRow.disabled = !hasData || state.currentRowIndex <= 0;
  el.btnNextRow.disabled = !hasData || state.currentRowIndex >= state.dataRows.length - 1;
}

// ---------- Export ----------
async function exportSingle() {
  if (!state.htmlCurrent) return;
  const baseName = (state.htmlPath ? state.htmlPath.split(/[\\/]/).pop() : 'form.html')
    .replace(/\.html?$/i, '');
  const saved = await window.electronAPI.saveHtml({
    defaultName: `${baseName}-filled-${state.currentRowIndex + 1}.html`,
    content: state.htmlCurrent
  });
  if (saved) showToast(`已保存：${saved}`, 'success');
}

async function exportBatch() {
  if (state.dataRows.length === 0) return;
  const baseName = (state.htmlPath ? state.htmlPath.split(/[\\/]/).pop() : 'form.html')
    .replace(/\.html?$/i, '');
  const files = state.dataRows.map((row, idx) => ({
    name: `${baseName}-${String(idx + 1).padStart(3, '0')}.html`,
    content: applyDataToHtml(state.htmlOriginal, row)
  }));
  // Restore current preview state after batch generation
  if (state.dataRows[state.currentRowIndex]) {
    state.htmlCurrent = applyDataToHtml(state.htmlOriginal, state.dataRows[state.currentRowIndex]);
  }
  const result = await window.electronAPI.saveBatch({ files });
  if (result) {
    showToast(`已批量导出 ${result.files.length} 个文件至 ${result.directory}`, 'success');
  }
}

// ---------- Event Wiring ----------
el.btnOpenHtml.addEventListener('click', loadHtmlFile);
el.btnImportData.addEventListener('click', loadDataFile);
el.btnAutoMap.addEventListener('click', () => {
  state.mapping = {};
  autoMap();
  showToast('已重新自动映射', 'success');
});
el.btnFill.addEventListener('click', fillCurrentRow);
el.btnExportSingle.addEventListener('click', exportSingle);
el.btnExportBatch.addEventListener('click', exportBatch);
el.btnPrevRow.addEventListener('click', () => {
  if (state.currentRowIndex > 0) {
    state.currentRowIndex--;
    fillCurrentRow();
    renderDataTable();
    updateRowIndicator();
    updateButtons();
  }
});
el.btnNextRow.addEventListener('click', () => {
  if (state.currentRowIndex < state.dataRows.length - 1) {
    state.currentRowIndex++;
    fillCurrentRow();
    renderDataTable();
    updateRowIndicator();
    updateButtons();
  }
});
el.btnReloadPreview.addEventListener('click', () => {
  renderPreview(state.htmlCurrent || state.htmlOriginal);
});
el.btnCopySource.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.htmlCurrent || state.htmlOriginal);
    showToast('源码已复制', 'success');
  } catch {
    showToast('复制失败', 'error');
  }
});
el.btnCloseAbout.addEventListener('click', () => el.aboutModal.classList.add('hidden'));

// ---------- Menu wiring ----------
window.electronAPI.onMenuEvent('menu:open-html', loadHtmlFile);
window.electronAPI.onMenuEvent('menu:import-data', loadDataFile);
window.electronAPI.onMenuEvent('menu:export-result', exportSingle);
window.electronAPI.onMenuEvent('menu:about', () => el.aboutModal.classList.remove('hidden'));
