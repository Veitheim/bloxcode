/* global monaco, bridge, $, esc, toast, loadSetting, saveSetting, tree, docs, activeId:writable, pathOf, openAt, classIcon, sortedRoots, sortedChildren, scheduleRender, treeChanged, cleanErr, currentMonacoTheme, editorOptions, applyRemoteSource */
// Bottom panel: Output (Studio prints, warnings, errors), Problems (type errors) and History.
'use strict';

const MAX_OUTPUT_LINES = 3000;
let panelTab = loadSetting('panelTab', 'output');
const outputState = { lines: [], level: 'all', context: 'all', query: '', time: loadSetting('outputTime', true), unseenErrors: 0 };
const problems = new Map(); // id -> [{ line, col, endLine, endCol, severity, message }]

// ---------- open / close ----------
function panelOpen() { return !$('#panel').classList.contains('hidden'); }
function showPanel(tab) {
  $('#panel').classList.remove('hidden');
  $('#panel-sash').classList.remove('hidden');
  saveSetting('panelOpen', true);
  if (tab) panelTab = tab;
  saveSetting('panelTab', panelTab);
  document.querySelectorAll('.panel-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.panel === panelTab));
  document.querySelectorAll('.panel-view').forEach((v) => v.classList.toggle('active', v.id === 'panel-' + panelTab));
  renderPanelActions();
  if (panelTab === 'output') { outputState.unseenErrors = 0; renderOutputBadge(); renderOutput(); }
  if (panelTab === 'problems') renderProblems();
  if (panelTab === 'history') renderHistory();
}
function hidePanel() {
  $('#panel').classList.add('hidden');
  $('#panel-sash').classList.add('hidden');
  saveSetting('panelOpen', false);
}
function togglePanel() { if (panelOpen()) hidePanel(); else showPanel(); }

document.querySelector('.panel-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-panel]');
  if (b) showPanel(b.dataset.panel);
});
$('#sb-output').addEventListener('click', togglePanel);
$('#sb-problems').addEventListener('click', () => showPanel('problems'));

(function panelSash() {
  const s = $('#panel-sash');
  document.documentElement.style.setProperty('--panel-h', loadSetting('panelHeight', 220) + 'px');
  s.addEventListener('mousedown', (e) => {
    const startY = e.clientY;
    const startH = $('#panel').offsetHeight;
    s.classList.add('dragging');
    const move = (ev) => {
      const h = Math.max(90, Math.min(innerHeight - 200, startH - (ev.clientY - startY)));
      document.documentElement.style.setProperty('--panel-h', h + 'px');
    };
    const up = () => {
      s.classList.remove('dragging');
      removeEventListener('mousemove', move); removeEventListener('mouseup', up);
      saveSetting('panelHeight', $('#panel').offsetHeight);
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
})();

function renderPanelActions() {
  const el = $('#panel-actions');
  const close = '<button data-pa="close" title="Close panel (Ctrl+J)"><svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>';
  if (panelTab === 'output') {
    el.innerHTML = `<input id="out-filter" placeholder="Filter output" value="${esc(outputState.query)}" spellcheck="false">
      <select id="out-level" title="Show"><option value="all">All</option><option value="errors">Errors</option><option value="warnings">Warnings & errors</option><option value="prints">Prints</option></select>
      <select id="out-context" title="Where"><option value="all">Everywhere</option><option value="edit">Edit</option><option value="server">Play test: server</option><option value="client">Play test: client</option></select>
      <button data-pa="time" title="Show times" class="text">${outputState.time ? '🕒 On' : '🕒 Off'}</button>
      <button data-pa="clear" title="Clear output"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4.2 11.8l7.6-7.6" stroke="currentColor" stroke-width="1.2"/></svg></button>${close}`;
    $('#out-level').value = outputState.level;
    $('#out-context').value = outputState.context;
  } else if (panelTab === 'problems') {
    el.innerHTML = `<button data-pa="lsp" class="text" title="Luau language server settings">Settings</button>${close}`;
  } else {
    el.innerHTML = close;
  }
}
$('#panel-actions').addEventListener('input', (e) => {
  if (e.target.id === 'out-filter') { outputState.query = e.target.value; renderOutput(); }
});
$('#panel-actions').addEventListener('change', (e) => {
  if (e.target.id === 'out-level') { outputState.level = e.target.value; renderOutput(); }
  if (e.target.id === 'out-context') { outputState.context = e.target.value; renderOutput(); }
});
$('#panel-actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pa]');
  if (!b) return;
  if (b.dataset.pa === 'close') hidePanel();
  if (b.dataset.pa === 'clear') outputClear(true);
  if (b.dataset.pa === 'time') { outputState.time = !outputState.time; saveSetting('outputTime', outputState.time); renderPanelActions(); renderOutput(); }
  if (b.dataset.pa === 'lsp') openSettings('luau');
});

// ---------- paths in messages ----------
function findNodeByPath(path) {
  const parts = String(path).replace(/^game\./, '').split('.');
  let candidates = sortedRoots().filter((r) => r.name === parts[0] || r.cls === parts[0]);
  for (let i = 1; i < parts.length && candidates.length; i++) {
    const next = [];
    for (const c of candidates) for (const k of sortedChildren(c)) if (k.name === parts[i]) next.push(k);
    candidates = next;
  }
  return candidates[0] || null;
}

function linkify(text) {
  const out = [];
  const re = /([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+):(\d+)|Script '([^']+)', Line (\d+)|([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+), line (\d+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    const path = m[1] || m[3] || m[5];
    const line = m[2] || m[4] || m[6];
    const node = findNodeByPath(path);
    out.push(esc(text.slice(last, m.index)));
    out.push(node ? `<span class="out-link" data-open="${esc(node.id)}" data-line="${line}">${esc(m[0])}</span>` : esc(m[0]));
    last = m.index + m[0].length;
  }
  out.push(esc(text.slice(last)));
  return out.join('');
}

// ---------- output ----------
function outputMatches(l) {
  if (outputState.level === 'errors' && l.kind !== 'MessageError') return false;
  if (outputState.level === 'warnings' && l.kind !== 'MessageError' && l.kind !== 'MessageWarning') return false;
  if (outputState.level === 'prints' && l.kind !== 'MessageOutput') return false;
  if (outputState.context !== 'all' && l.context !== outputState.context) return false;
  if (outputState.query && !l.message.toLowerCase().includes(outputState.query.toLowerCase())) return false;
  return true;
}
function outputLineHtml(l) {
  const time = outputState.time ? `<span class="out-time">${new Date(l.time).toTimeString().slice(0, 8)}</span>` : '';
  const ctx = l.context !== 'edit' ? `<span class="out-ctx ${esc(l.context)}">${esc(l.context)}</span>` : '';
  return `<div class="out-line ${esc(l.kind)}">${time}${ctx}<span class="out-msg">${linkify(l.message)}</span></div>`;
}
function renderOutput() {
  const el = $('#panel-output');
  if (!panelOpen() || panelTab !== 'output') return;
  const list = outputState.lines.filter(outputMatches);
  el.innerHTML = list.length ? list.slice(-1500).map(outputLineHtml).join('') : '<div class="out-empty">No output yet. Prints, warnings and errors from Studio and your play tests show up here.</div>';
  el.scrollTop = el.scrollHeight;
}
function outputAdd(l) {
  outputState.lines.push(l);
  if (outputState.lines.length > MAX_OUTPUT_LINES) outputState.lines.splice(0, outputState.lines.length - MAX_OUTPUT_LINES);
  if (l.kind === 'MessageError' && !(panelOpen() && panelTab === 'output')) { outputState.unseenErrors++; renderOutputBadge(); }
  if (!panelOpen() || panelTab !== 'output' || !outputMatches(l)) return;
  const el = $('#panel-output');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const empty = el.querySelector('.out-empty');
  if (empty) empty.remove();
  el.insertAdjacentHTML('beforeend', outputLineHtml(l));
  while (el.childElementCount > 1500) el.firstElementChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function outputClear(alsoMain) {
  outputState.lines = [];
  outputState.unseenErrors = 0;
  renderOutputBadge();
  if (alsoMain) bridge.post('output:clear');
  renderOutput();
}
function renderOutputBadge() {
  const b = document.querySelector('[data-panel="output"]');
  b.innerHTML = outputState.unseenErrors ? `OUTPUT <span class="badge err">${outputState.unseenErrors}</span>` : 'OUTPUT';
}
$('#panel-output').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (a) openAt(a.dataset.open, Number(a.dataset.line));
});

// ---------- problems ----------
function setProblems(id, items) {
  if (items && items.length) problems.set(id, items); else problems.delete(id);
  renderProblemCounts();
  if (panelOpen() && panelTab === 'problems') renderProblems();
  scheduleRender();
  treeChanged();
}
function errorCount(id) { return (problems.get(id) || []).filter((i) => i.severity === 1).length; }
function warningCount(id) { return (problems.get(id) || []).filter((i) => i.severity === 2).length; }
function diagBadge(id) {
  const e = errorCount(id);
  if (e) return `<span class="diag err">${e}</span>`;
  const w = warningCount(id);
  return w ? `<span class="diag warn">${w}</span>` : '';
}
function renderProblemCounts() {
  let e = 0, w = 0;
  for (const items of problems.values()) for (const i of items) { if (i.severity === 1) e++; else if (i.severity === 2) w++; }
  $('#problems-count').textContent = e + w ? String(e + w) : '';
  $('#problems-count').classList.toggle('err', e > 0);
  const lspOn = ((typeof status !== 'undefined' && status.lsp) || {}).state === 'ready';
  $('#sb-problems').innerHTML = lspOn || e + w ? `<span style="color:${e ? 'inherit' : 'inherit'}">⊗ ${e}</span><span>⚠ ${w}</span>` : '';
}
function renderProblems() {
  const el = $('#panel-problems');
  const files = [...problems.entries()].map(([id, items]) => ({ id, node: tree.nodes.get(id), items })).filter((f) => f.node)
    .sort((a, b) => errorCount(b.id) - errorCount(a.id) || a.node.name.localeCompare(b.node.name));
  const st = (typeof status !== 'undefined' && status.lsp) || {};
  if (!files.length) {
    el.innerHTML = `<div class="panel-empty">${st.state === 'ready' ? 'No problems in your scripts. 🎉' : st.state === 'off' || !st.state ? 'Turn on the Luau language server in Settings to see type errors here.' : esc(st.detail || 'The Luau language server is starting…')}</div>`;
    return;
  }
  const sevCls = { 1: 'e', 2: 'w', 3: 'i', 4: 'i' };
  const sevSym = { 1: '⊗', 2: '⚠', 3: 'ℹ', 4: '·' };
  el.innerHTML = files.map((f) => `<div class="prob-file" data-open="${esc(f.id)}" data-line="${f.items[0].line}">${classIcon(f.node.cls)}${esc(f.node.name)} <span class="dim">${esc(pathOf(f.node).slice(0, -1).map((p) => p.name).join('.'))} · ${f.items.length}</span></div>` +
    f.items.slice().sort((a, b) => a.severity - b.severity || a.line - b.line).map((i) => `<div class="prob" data-open="${esc(f.id)}" data-line="${i.line}" data-col="${i.col}" data-eline="${i.endLine}" data-ecol="${i.endCol}"><span class="sev ${sevCls[i.severity] || 'e'}">${sevSym[i.severity] || '⊗'}</span><span>${esc(i.message)}</span><span class="at">[${i.line}, ${i.col}]</span></div>`).join('')).join('');
}
$('#panel-problems').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (a) openAt(a.dataset.open, Number(a.dataset.line), Number(a.dataset.col) || 1, Number(a.dataset.eline) || undefined, Number(a.dataset.ecol) || undefined);
});

// ---------- history ----------
const historyState = { id: null, versions: [], sel: null, diff: null };
function showHistoryFor(id) {
  historyState.id = id;
  historyState.sel = null;
  showPanel('history');
}
function onActiveScriptChanged(id) {
  if (panelOpen() && panelTab === 'history' && id && id !== historyState.id) { historyState.id = id; historyState.sel = null; renderHistory(); }
}
bridge.on('history:changed', ({ id }) => {
  if (panelOpen() && panelTab === 'history' && id === historyState.id) renderHistory(true);
});

const WHO = { you: 'You', claude: 'Claude', studio: 'Studio', restore: 'Restore', replace: 'Replace', opened: 'First seen', earlier: 'Before' };
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
async function renderHistory(keepSel) {
  const el = $('#panel-history');
  const id = historyState.id || activeId;
  historyState.id = id;
  const n = id && tree.nodes.get(id);
  if (!n) { disposeHistoryDiff(); el.innerHTML = '<div class="panel-empty">Open a script to see its history. Bloxcode keeps earlier versions of every script on this computer: your changes, Claude\'s changes and changes made in Studio.</div>'; return; }
  const path = pathOf(n).map((p) => p.name).join('.');
  try { historyState.versions = await bridge.invoke('history:list', path); } catch (_) { historyState.versions = []; }
  if (!keepSel || historyState.sel == null) historyState.sel = historyState.versions.length > 1 ? historyState.versions[1].index : historyState.versions[0] ? historyState.versions[0].index : null;
  disposeHistoryDiff();
  if (!historyState.versions.length) { el.innerHTML = `<div class="panel-empty">No saved versions of ${esc(n.name)} yet. They appear as soon as the script changes.</div>`; return; }
  el.innerHTML = `<div class="hist-layout"><div class="hist-list">${historyState.versions.map((v, i) => `<div class="hist-item ${v.index === historyState.sel ? 'sel' : ''}" data-v="${v.index}"><span class="who ${esc(v.origin)}">${esc(WHO[v.origin] || v.origin)}</span><span class="when" title="${esc(new Date(v.time).toLocaleString())}">${i === 0 ? 'Current · ' : ''}${esc(ago(v.time))}</span><span class="meta">${v.lines} lines</span></div>`).join('')}</div>
    <div class="hist-diff"><div class="hist-diff-bar"><span id="hist-title"></span><span class="spacer"></span><button class="small-btn" data-h="copy">Copy</button><button class="small-btn primary" data-h="restore">Restore this version</button></div><div class="hist-diff-host" id="hist-host"></div></div></div>`;
  showHistoryDiff();
}
async function showHistoryDiff() {
  const id = historyState.id;
  const n = tree.nodes.get(id);
  if (!n || historyState.sel == null) return;
  const path = pathOf(n).map((p) => p.name).join('.');
  const old = await bridge.invoke('history:get', path, historyState.sel).catch(() => '');
  const current = docs.has(id) ? docs.get(id).model.getValue() : await bridge.invoke('sources:get', id).catch(() => '');
  const v = historyState.versions.find((x) => x.index === historyState.sel);
  const title = $('#hist-title');
  if (title) title.textContent = v ? `${WHO[v.origin] || v.origin}, ${new Date(v.time).toLocaleString()} (left) ↔ current (right)` : '';
  const host = $('#hist-host');
  if (!host) return;
  disposeHistoryDiff();
  const diff = monaco.editor.createDiffEditor(host, { readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: host.clientWidth > 700, theme: currentMonacoTheme(), minimap: { enabled: false }, fontSize: editorOptions().fontSize, fontFamily: editorOptions().fontFamily, scrollBeyondLastLine: false });
  const a = monaco.editor.createModel(old, 'luau');
  const b = monaco.editor.createModel(current, 'luau');
  diff.setModel({ original: a, modified: b });
  historyState.diff = { diff, a, b, old };
}
function disposeHistoryDiff() {
  const d = historyState.diff;
  if (!d) return;
  d.diff.dispose(); d.a.dispose(); d.b.dispose();
  historyState.diff = null;
}
$('#panel-history').addEventListener('click', async (e) => {
  const item = e.target.closest('[data-v]');
  if (item) {
    historyState.sel = Number(item.dataset.v);
    document.querySelectorAll('.hist-item').forEach((x) => x.classList.toggle('sel', x === item));
    showHistoryDiff();
    return;
  }
  const b = e.target.closest('[data-h]');
  if (!b || !historyState.diff) return;
  if (b.dataset.h === 'copy') { bridge.copy(historyState.diff.old); toast('Copied this version.'); }
  if (b.dataset.h === 'restore') {
    const id = historyState.id;
    if (!confirm('Replace the script with this version?\n\nYou can undo this in Studio with Ctrl+Z, and the current version stays in the history.')) return;
    try {
      const src = await bridge.invoke('history:restore', id, historyState.sel);
      const d = docs.get(id);
      if (d) applyRemoteSource(d, src);
      toast('Version restored.');
      renderHistory();
    } catch (err) { toast(cleanErr(err), 'error'); }
  }
});

// ---------- init ----------
async function initPanel() {
  try { (await bridge.invoke('output:all')).forEach((l) => outputState.lines.push(l)); } catch (_) {}
  if (loadSetting('panelOpen', false)) showPanel(panelTab);
  renderProblemCounts();
}
