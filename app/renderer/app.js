/* global monaco, require, bridge, classIcon, setupLuau */
'use strict';

const $ = (s) => document.querySelector(s);
// Monaco cancels diffs and suggestions when they are replaced; that is expected, not an error.
addEventListener('unhandledrejection', (e) => { const m = String(e.reason && (e.reason.message || e.reason.name) || ''); if (/^(Canceled|no diff result available)/.test(m)) e.preventDefault(); });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// macOS: Cmd instead of Ctrl (Ctrl+Tab stays, Cmd+Tab belongs to the system).
const IS_MAC = bridge.platform === 'darwin';
const MOD = IS_MAC ? '⌘' : 'Ctrl';
if (IS_MAC) {
  document.body.classList.add('mac');
  for (const el of document.querySelectorAll('kbd')) {
    if (el.textContent === 'Ctrl' && el.nextElementSibling?.textContent !== 'Tab') el.textContent = '⌘';
    else if (el.textContent.startsWith('Ctrl+')) el.textContent = el.textContent.replace('Ctrl+', '⌘');
  }
  for (const el of document.querySelectorAll('[title*="Ctrl+"]')) el.title = el.title.replace('Ctrl+Shift+', '⇧⌘').replace('Ctrl+', '⌘');
}

const ROW_H = 22;
const SERVICE_ORDER = ['Workspace', 'Players', 'Lighting', 'MaterialService', 'ReplicatedFirst', 'ReplicatedStorage',
  'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService',
  'TextChatService'];
const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);
const QUICK_CREATE = ['Script', 'LocalScript', 'ModuleScript', 'Folder', 'RemoteEvent', 'RemoteFunction'];
const INSERTABLE = [
  ['Scripts', ['Script', 'LocalScript', 'ModuleScript']],
  ['Communication', ['RemoteEvent', 'RemoteFunction', 'UnreliableRemoteEvent', 'BindableEvent', 'BindableFunction']],
  ['Organization', ['Folder', 'Model', 'Configuration']],
  ['Values', ['StringValue', 'NumberValue', 'IntValue', 'BoolValue', 'ObjectValue', 'CFrameValue', 'Vector3Value', 'Color3Value']],
  ['Parts', ['Part', 'MeshPart', 'WedgePart', 'SpawnLocation', 'Attachment', 'WeldConstraint', 'ProximityPrompt', 'ClickDetector', 'Sound', 'PointLight', 'ParticleEmitter', 'Tool']],
  ['GUI', ['ScreenGui', 'Frame', 'ScrollingFrame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'UICorner', 'UIStroke', 'UIListLayout', 'UIPadding']],
];
const CHEVRON = '<svg viewBox="0 0 10 10"><path d="M3 1.5L6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const X_ICON = '<svg viewBox="0 0 16 16" class="x"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem('bloxcode.' + key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
}
function saveSetting(key, value) {
  try { localStorage.setItem('bloxcode.' + key, JSON.stringify(value)); } catch (_) {}
}

// =====================================================================
// Tree model (mirror of the Studio DataModel)
// =====================================================================
const tree = {
  nodes: new Map(),   // id -> { id, name, cls, parent, children:Set, sorted }
  roots: new Set(),
  orphans: new Map(), // parentId -> Set(childId) for children that arrived before their parent
};

function attach(n) {
  if (!n.parent) { tree.roots.add(n.id); return; }
  const p = tree.nodes.get(n.parent);
  if (p) { p.children.add(n.id); p.sorted = null; } else {
    if (!tree.orphans.has(n.parent)) tree.orphans.set(n.parent, new Set());
    tree.orphans.get(n.parent).add(n.id);
  }
}
function detach(n) {
  if (!n.parent) { tree.roots.delete(n.id); return; }
  const p = tree.nodes.get(n.parent);
  if (p) { p.children.delete(n.id); p.sorted = null; }
  const o = tree.orphans.get(n.parent);
  if (o) o.delete(n.id);
}

function upsertNode(e) {
  const parent = e.parent || null;
  let n = tree.nodes.get(e.id);
  if (n) {
    if (n.parent !== parent) { detach(n); n.parent = parent; attach(n); }
    if (n.name !== e.name) { n.name = e.name; markParentUnsorted(n); }
    n.cls = e.cls || n.cls;
  } else {
    n = { id: e.id, name: e.name, cls: e.cls, parent, children: new Set(), sorted: null };
    tree.nodes.set(n.id, n);
    attach(n);
    const waiting = tree.orphans.get(n.id);
    if (waiting) {
      tree.orphans.delete(n.id);
      waiting.forEach((cid) => n.children.add(cid));
    }
  }
  const doc = docs.get(n.id);
  if (doc) { doc.name = n.name; doc.cls = n.cls; doc.deleted = false; }
}

function markParentUnsorted(n) {
  const p = n.parent && tree.nodes.get(n.parent);
  if (p) p.sorted = null;
}

function removeNode(id) {
  const n = tree.nodes.get(id);
  if (!n) return;
  detach(n);
  const stack = [n];
  while (stack.length) {
    const cur = stack.pop();
    tree.nodes.delete(cur.id);
    const doc = docs.get(cur.id);
    if (doc) doc.deleted = true;
    cur.children.forEach((cid) => { const c = tree.nodes.get(cid); if (c) stack.push(c); });
  }
}

function resetTree() {
  tree.nodes.clear(); tree.roots.clear(); tree.orphans.clear();
}

function sortedChildren(n) {
  if (!n.sorted) {
    n.sorted = [...n.children].map((id) => tree.nodes.get(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return n.sorted;
}
function sortedRoots() {
  return [...tree.roots].map((id) => tree.nodes.get(id)).filter(Boolean).sort((a, b) => {
    const ia = SERVICE_ORDER.indexOf(a.cls), ib = SERVICE_ORDER.indexOf(b.cls);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
}

function pathOf(n) {
  const parts = [];
  for (let cur = n; cur; cur = cur.parent && tree.nodes.get(cur.parent)) parts.unshift(cur);
  return parts;
}
function luaPath(n) {
  const parts = pathOf(n);
  if (!parts.length) return '';
  let out = parts[0].cls === 'Workspace' ? 'workspace' : `game:GetService("${parts[0].cls}")`;
  for (const p of parts.slice(1)) out += /^[A-Za-z_]\w*$/.test(p.name) ? `.${p.name}` : `["${p.name.replace(/"/g, '\\"')}"]`;
  return out;
}
function isAncestor(maybeAncestorId, n) {
  for (let cur = n; cur; cur = cur.parent && tree.nodes.get(cur.parent)) if (cur.id === maybeAncestorId) return true;
  return false;
}

// =====================================================================
// Explorer view (virtualised)
// =====================================================================
const treeEl = $('#tree');
const spacer = $('#tree-spacer');
const expanded = new Set();
let rows = [];
let rowsDirty = true;
let selectedId = null;
let filterText = '';
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderTree(); renderTabs(); updateBreadcrumbs(); renderPackages(); });
}
function treeChanged() { rowsDirty = true; scheduleRender(); }

function buildRows() {
  rows = [];
  if (filterText) {
    const q = filterText.toLowerCase();
    const keep = new Set();
    for (const n of tree.nodes.values()) {
      if (n.name.toLowerCase().includes(q)) {
        for (let cur = n; cur && !keep.has(cur.id); cur = cur.parent && tree.nodes.get(cur.parent)) keep.add(cur.id);
      }
    }
    const walk = (n, depth) => {
      if (!keep.has(n.id)) return;
      rows.push({ n, depth, open: true });
      sortedChildren(n).forEach((c) => walk(c, depth + 1));
    };
    sortedRoots().forEach((r) => walk(r, 0));
  } else {
    const walk = (n, depth) => {
      const open = expanded.has(n.id);
      rows.push({ n, depth, open });
      if (open) sortedChildren(n).forEach((c) => walk(c, depth + 1));
    };
    sortedRoots().forEach((r) => walk(r, 0));
  }
  rowsDirty = false;
}

function highlight(name) {
  if (!filterText) return esc(name);
  const i = name.toLowerCase().indexOf(filterText.toLowerCase());
  if (i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + filterText.length)) + '</mark>' + esc(name.slice(i + filterText.length));
}

function renderTree() {
  if (rowsDirty) buildRows();
  spacer.style.height = rows.length * ROW_H + 'px';
  const top = treeEl.scrollTop;
  const first = Math.max(0, Math.floor(top / ROW_H) - 10);
  const last = Math.min(rows.length, Math.ceil((top + treeEl.clientHeight) / ROW_H) + 10);
  let html = '';
  for (let i = first; i < last; i++) {
    const { n, depth, open } = rows[i];
    const hasKids = n.children.size > 0;
    const cls = ['row'];
    if (open && hasKids) cls.push('open');
    if (n.id === selectedId) cls.push('selected');
    if (n.id === activeId) cls.push('active-doc');
    let guides = '';
    for (let d = 1; d <= depth; d++) guides += `<span class="guide" style="left:${d * 12 + 3}px"></span>`;
    html += `<div class="${cls.join(' ')}" data-id="${esc(n.id)}" draggable="${n.parent ? 'true' : 'false'}" style="top:${i * ROW_H}px;padding-left:${depth * 12 + 4}px">` +
      guides +
      `<span class="twist">${hasKids ? CHEVRON : ''}</span>${classIcon(n.cls)}` +
      `<span class="name">${highlight(n.name)}</span>${typeof diagBadge === 'function' ? diagBadge(n.id) : ''}</div>`;
  }
  spacer.innerHTML = html;
  renderEmptyState();
}
treeEl.addEventListener('scroll', () => renderTree());
new ResizeObserver(() => renderTree()).observe(treeEl);

function renderEmptyState() {
  const el = $('#tree-empty');
  if (tree.nodes.size) { el.innerHTML = ''; return; }
  if (!status.connected) {
    el.innerHTML = 'Not connected to Roblox Studio yet.<br><br>Open Studio, go to the <b>Plugins</b> tab → <b>Bloxcode</b> and turn on <b>Code Mode</b>.' +
      '<button data-view-jump="plugin">Show plugin help</button>';
  } else {
    el.innerHTML = 'Loading explorer from Studio…';
  }
}
$('#tree-empty').addEventListener('click', (e) => {
  if (e.target.dataset.viewJump) showView(e.target.dataset.viewJump);
});

function toggle(id, force) {
  const open = force !== undefined ? force : !expanded.has(id);
  if (open) expanded.add(id); else expanded.delete(id);
  treeChanged();
}
function select(id, reveal) {
  selectedId = id;
  if (reveal) revealNode(id);
  scheduleRender();
}
function revealNode(id) {
  const n = tree.nodes.get(id);
  if (!n) return;
  for (let cur = n.parent && tree.nodes.get(n.parent); cur; cur = cur.parent && tree.nodes.get(cur.parent)) expanded.add(cur.id);
  rowsDirty = true;
  buildRows();
  const idx = rows.findIndex((r) => r.n.id === id);
  if (idx >= 0) {
    const y = idx * ROW_H;
    if (y < treeEl.scrollTop || y > treeEl.scrollTop + treeEl.clientHeight - ROW_H) treeEl.scrollTop = y - treeEl.clientHeight / 2;
  }
  scheduleRender();
}

treeEl.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.id;
  const n = tree.nodes.get(id);
  select(id);
  if (!n || e.detail > 1) return;
  if (e.target.closest('.twist')) toggle(id);
  else if (SCRIPT_CLASSES.has(n.cls)) openFromTree(id, true);
  else if (n.children.size) toggle(id);
});
treeEl.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const n = tree.nodes.get(row.dataset.id);
  if (n && SCRIPT_CLASSES.has(n.cls)) { openFromTree(n.id, false); editor && editor.focus(); }
});
treeEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const row = e.target.closest('.row');
  if (!row) return;
  select(row.dataset.id);
  showNodeMenu(tree.nodes.get(row.dataset.id), e.clientX, e.clientY);
});
treeEl.addEventListener('keydown', (e) => {
  if (rowsDirty) buildRows();
  const idx = rows.findIndex((r) => r.n.id === selectedId);
  const cur = idx >= 0 ? rows[idx].n : null;
  const move = (i) => { if (rows[i]) { select(rows[i].n.id, true); } };
  if (e.key === 'ArrowDown') { move(idx + 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { move(Math.max(0, idx - 1)); e.preventDefault(); }
  else if (e.key === 'ArrowRight' && cur) { if (cur.children.size && !expanded.has(cur.id)) toggle(cur.id, true); else move(idx + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' && cur) { if (expanded.has(cur.id)) toggle(cur.id, false); else if (cur.parent) select(cur.parent, true); e.preventDefault(); }
  else if (e.key === 'Enter' && cur) { if (SCRIPT_CLASSES.has(cur.cls)) { openFromTree(cur.id, false); editor.focus(); } else toggle(cur.id); }
  else if (e.key === 'F2' && cur) promptRename(cur);
  else if (e.key === 'Delete' && cur) confirmDelete(cur);
});

// drag & drop to re-parent
let dragId = null;
treeEl.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  dragId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
treeEl.addEventListener('dragover', (e) => {
  const row = e.target.closest('.row');
  if (!row || !dragId) return;
  const target = tree.nodes.get(row.dataset.id);
  const src = tree.nodes.get(dragId);
  if (!target || !src || isAncestor(src.id, target) || src.parent === target.id) return;
  e.preventDefault();
  treeEl.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
  row.classList.add('drop-target');
});
treeEl.addEventListener('dragleave', (e) => {
  const row = e.target.closest('.row');
  if (row) row.classList.remove('drop-target');
});
treeEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const row = e.target.closest('.row');
  treeEl.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
  if (!row || !dragId) return;
  const target = tree.nodes.get(row.dataset.id);
  if (target && target.id !== dragId) {
    bridge.send({ type: 'move', id: dragId, parentId: target.id });
    expanded.add(target.id);
  }
  dragId = null;
});
treeEl.addEventListener('dragend', () => { dragId = null; });

$('#tree-filter').addEventListener('input', (e) => { filterText = e.target.value.trim(); treeChanged(); });

// =====================================================================
// Context menu & quick input
// =====================================================================
const ctx = $('#ctxmenu');
function showMenu(items, x, y) {
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<div class="msep"></div>' :
    `<div class="mi${it.disabled ? ' disabled' : ''}" data-i="${i}">${it.icon || '<span style="width:16px"></span>'}<span>${esc(it.label)}</span>${it.key ? `<span class="mk">${esc(it.key)}</span>` : ''}</div>`).join('');
  ctx.classList.remove('hidden');
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  ctx.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  ctx.onclick = (e) => {
    const mi = e.target.closest('.mi');
    if (!mi) return;
    hideMenu();
    items[+mi.dataset.i].run();
  };
}
function hideMenu() { ctx.classList.add('hidden'); }
addEventListener('mousedown', (e) => { if (!ctx.contains(e.target)) hideMenu(); });
addEventListener('blur', hideMenu);

function showNodeMenu(n, x, y) {
  if (!n) return;
  const isService = !n.parent;
  const items = QUICK_CREATE.map((cls) => ({
    label: `New ${cls}`, icon: classIcon(cls), run: () => promptCreate(n, cls),
  }));
  items.push({ label: 'Insert Object…', icon: '<span style="width:16px;text-align:center">＋</span>', run: () => pickInsertClass(n) });
  items.push('-');
  if (SCRIPT_CLASSES.has(n.cls)) items.push({ label: 'Open', key: 'Enter', run: () => openFromTree(n.id, false) });
  items.push({ label: 'Select in Studio', run: () => bridge.send({ type: 'select', id: n.id }) });
  items.push({ label: 'Copy Lua Path', run: () => { bridge.copy(luaPath(n)); toast('Copied path: ' + luaPath(n)); } });
  items.push('-');
  items.push({ label: 'Rename', key: 'F2', disabled: isService, run: () => promptRename(n) });
  items.push({ label: 'Duplicate', disabled: isService, run: () => bridge.send({ type: 'duplicate', id: n.id }) });
  items.push({ label: 'Delete', key: 'Del', disabled: isService, run: () => confirmDelete(n) });
  showMenu(items, x, y);
}

const quick = $('#quick');
const quickInput = $('#quick-input');
const quickList = $('#quick-list');
const quickMsg = $('#quick-msg');
let quickState = null;

function closeQuick() {
  quick.classList.add('hidden');
  quickState = null;
}
function openQuick(state) {
  quickState = Object.assign({ sel: 0, shown: [] }, state);
  quick.classList.remove('hidden');
  quickInput.placeholder = state.placeholder || '';
  quickInput.value = state.value || '';
  quickMsg.textContent = state.message || '';
  quickMsg.className = '';
  renderQuick();
  quickInput.focus();
  if (state.selectAll !== false) quickInput.select();
}
function fuzzyScore(text, q) {
  if (!q) return 1;
  text = text.toLowerCase(); q = q.toLowerCase();
  const direct = text.indexOf(q);
  if (direct >= 0) return 1000 - direct * 2 - text.length * 0.01;
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const f = text.indexOf(ch, ti);
    if (f < 0) return -1;
    streak = f === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - (f - ti);
    ti = f + 1;
  }
  return score;
}
function renderQuick() {
  const s = quickState;
  if (!s) return;
  if (!s.items) { quickList.innerHTML = ''; return; }
  const q = quickInput.value.trim();
  let shown = s.items
    .map((it) => ({ it, score: fuzzyScore(it.label, q) }))
    .filter((x) => x.score >= 0);
  if (q) shown.sort((a, b) => b.score - a.score);
  shown = shown.slice(0, 80).map((x) => x.it);
  s.shown = shown;
  s.sel = Math.min(s.sel, Math.max(0, shown.length - 1));
  let html = '';
  let lastGroup = null;
  shown.forEach((it, i) => {
    if (!q && it.group && it.group !== lastGroup) { html += `<div class="qhead">${esc(it.group)}</div>`; lastGroup = it.group; }
    html += `<div class="qi${i === s.sel ? ' sel' : ''}" data-i="${i}">${it.icon || ''}<span class="ql">${esc(it.label)}</span><span class="qd">${esc(it.detail || '')}</span></div>`;
  });
  quickList.innerHTML = html || '<div class="qd" style="padding:6px 8px">No results</div>';
  const selEl = quickList.querySelector('.qi.sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}
quickInput.addEventListener('input', () => { if (quickState) { quickState.sel = 0; quickMsg.className = ''; quickMsg.textContent = quickState.message || ''; renderQuick(); } });
quickInput.addEventListener('keydown', (e) => {
  const s = quickState;
  if (!s) return;
  if (e.key === 'Escape') { closeQuick(); restoreFocus(); }
  else if (e.key === 'ArrowDown' && s.items) { s.sel = Math.min(s.sel + 1, s.shown.length - 1); renderQuick(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && s.items) { s.sel = Math.max(s.sel - 1, 0); renderQuick(); e.preventDefault(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (s.items) {
      const it = s.shown[s.sel];
      const custom = quickInput.value.trim();
      if (it) { closeQuick(); s.onPick(it); }
      else if (s.onCustom && /^[A-Za-z]\w*$/.test(custom)) { closeQuick(); s.onCustom(custom); }
    }
    else {
      const v = quickInput.value;
      const err = s.validate ? s.validate(v) : null;
      if (err) { quickMsg.textContent = err; quickMsg.className = 'error'; return; }
      closeQuick();
      s.onSubmit(v);
    }
  }
});
quickList.addEventListener('mousedown', (e) => {
  const qi = e.target.closest('.qi');
  if (!qi || !quickState) return;
  e.preventDefault();
  const s = quickState;
  const it = s.shown[+qi.dataset.i];
  closeQuick();
  s.onPick(it);
});
quickInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== quickInput) closeQuick(); }, 100));
function restoreFocus() { if (editor && activeId) editor.focus(); }

const validName = (v) => (!v.trim() ? 'Name cannot be empty' : v.length > 100 ? 'Name is too long (max. 100 characters)' : null);

function promptCreate(parent, cls) {
  if (!requireConnection()) return;
  openQuick({
    placeholder: `Name for new ${cls} in ${parent.name}`,
    value: cls,
    message: `New ${cls} in ${pathOf(parent).map((p) => p.name).join(' › ')} · press Enter to create`,
    validate: validName,
    onSubmit: (name) => {
      expanded.add(parent.id);
      bridge.send({ type: 'create', parentId: parent.id, className: cls, name: name.trim() });
    },
  });
}
function pickInsertClass(parent) {
  const items = [];
  INSERTABLE.forEach(([group, list]) => list.forEach((cls) => items.push({ label: cls, group, icon: classIcon(cls), cls })));
  openQuick({
    placeholder: `Insert object into ${parent.name} (type a class name)…`,
    items,
    message: 'Tip: any Roblox class name works. Just type it and press Enter.',
    onPick: (it) => promptCreate(parent, it.cls),
    onCustom: (cls) => promptCreate(parent, cls),
  });
}
function promptRename(n) {
  if (!n.parent || !requireConnection()) return;
  openQuick({
    placeholder: 'New name',
    value: n.name,
    message: `Rename "${n.name}" · press Enter to confirm`,
    validate: validName,
    onSubmit: (name) => { if (name.trim() !== n.name) bridge.send({ type: 'rename', id: n.id, name: name.trim() }); },
  });
}
function confirmDelete(n) {
  if (!n.parent || !requireConnection()) return;
  const count = (function countAll(x) { let c = 1; x.children.forEach((id) => { const k = tree.nodes.get(id); if (k) c += countAll(k); }); return c; })(n);
  const extra = count > 1 ? ` and ${count - 1} objects inside it` : '';
  if (confirm(`Delete "${n.name}"${extra}?\n\nYou can undo this in Studio with ${MOD}+Z.`)) {
    bridge.send({ type: 'delete', id: n.id });
  }
}
function requireConnection() {
  if (status.connected) return true;
  toast('Not connected to Roblox Studio.', 'warn');
  return false;
}

function quickOpen() {
  const items = [];
  for (const n of tree.nodes.values()) {
    if (SCRIPT_CLASSES.has(n.cls)) {
      items.push({ label: n.name, detail: pathOf(n).slice(0, -1).map((p) => p.name).join(' › '), icon: classIcon(n.cls), id: n.id });
    }
  }
  items.sort((a, b) => a.label.localeCompare(b.label));
  openQuick({
    placeholder: items.length ? 'Search scripts…' : 'No scripts found (is Studio connected?)',
    items,
    onPick: (it) => { openFromTree(it.id, false); select(it.id, true); },
  });
}

function newScriptFlow() {
  if (!requireConnection()) return;
  const base = (selectedId && tree.nodes.get(selectedId)) || [...tree.nodes.values()].find((n) => n.cls === 'ServerScriptService');
  if (!base) return;
  const parent = SCRIPT_CLASSES.has(base.cls) && base.parent ? tree.nodes.get(base.parent) : base;
  openQuick({
    placeholder: 'What kind of script?',
    items: ['Script', 'LocalScript', 'ModuleScript'].map((cls) => ({ label: cls, detail: `in ${parent.name}`, icon: classIcon(cls), cls })),
    onPick: (it) => promptCreate(parent, it.cls),
  });
}

// =====================================================================
// Editor, tabs & documents
// =====================================================================
let editor = null; // editor of the focused group
const docs = new Map(); // id -> { id, name, cls, model, viewStates, dirty, deleted, timer, applying, lastSynced }
let tabOrder = []; // tabs of the focused group
let activeId = null; // active script of the focused group
let autoSync = loadSetting('autoSync', true);
let pendingOpen = new Map(); // id -> preview flag
const pendingReveal = new Map(); // id -> { line, col, endLine, endCol }

// Editor groups (split editor). The focused group's state lives in editor / tabOrder / activeId.
const groups = [{ index: 0, el: document.querySelector('.group[data-group="0"]'), editor: null, tabOrder: [], activeId: null }];
let focused = 0;
function syncFocused() { const g = groups[focused]; g.editor = editor; g.tabOrder = tabOrder; g.activeId = activeId; }
function focusGroup(i) {
  if (i === focused || !groups[i]) return;
  syncFocused();
  focused = i;
  const g = groups[i];
  editor = g.editor; tabOrder = g.tabOrder; activeId = g.activeId;
  groups.forEach((x) => x.el.classList.toggle('focused', x.index === i));
  scheduleRender(); updatePos(); onActiveChanged();
}
function groupsWith(id) { syncFocused(); return groups.filter((g) => g.tabOrder.includes(id)); }

function splitEditor(id = activeId) {
  if (groups.length > 1) { focusGroup(1); if (id) activate(id); return; }
  const el = document.createElement('div');
  el.className = 'group';
  el.dataset.group = '1';
  el.innerHTML = '<div class="tabs"></div><div class="breadcrumbs"></div><div class="editor-host"></div>';
  $('#groups').appendChild(el);
  const g = { index: 1, el, editor: null, tabOrder: [], activeId: null };
  groups.push(g);
  g.editor = createGroupEditor(g);
  focusGroup(1);
  if (id) activate(id);
}
function closeSplit() {
  if (groups.length < 2) return;
  syncFocused();
  const g = groups[1];
  for (const id of [...g.tabOrder]) {
    if (!groups[0].tabOrder.includes(id)) groups[0].tabOrder.push(id);
  }
  if (focused === 1) focusGroup(0);
  g.editor.dispose();
  g.el.remove();
  groups.length = 1;
  tabOrder = groups[0].tabOrder;
  if (!activeId && tabOrder.length) activate(tabOrder[0]);
  scheduleRender(); updateWelcome();
}
function updateWelcome() {
  syncFocused();
  const any = groups.some((g) => g.tabOrder.length);
  $('#welcome').classList.toggle('hidden', any);
}
function onActiveChanged() {
  const d = activeId && docs.get(activeId);
  const ext = d ? (d.cls === 'Script' ? '.server.luau' : d.cls === 'LocalScript' ? '.client.luau' : '.luau') : '';
  bridge.post('discord:file', d ? d.name + ext : null);
  if (typeof onActiveScriptChanged === 'function') onActiveScriptChanged(activeId);
}

function openFromTree(id, preview) {
  const n = tree.nodes.get(id);
  if (docs.has(id)) { activate(id); return; }
  if (!n) return;
  pendingOpen.set(id, true);
  bridge.send({ type: 'open', id });
}

function handleOpenEvent(e) {
  pendingOpen.delete(e.id);
  let doc = docs.get(e.id);
  if (doc) {
    if (!doc.dirty) applyRemoteSource(doc, e.source);
  } else {
    const uri = monaco.Uri.parse(`roblox:///${encodeURIComponent(e.id)}/${encodeURIComponent(e.name || 'Script')}.luau`);
    const model = monaco.editor.getModel(uri) || monaco.editor.createModel(e.source || '', 'luau', uri);
    model.updateOptions({ tabSize: 4, insertSpaces: false });
    doc = { id: e.id, name: e.name, cls: e.cls, model, viewState: null, dirty: false, deleted: false, timer: null, applying: false, lastSynced: e.source || '' };
    model.onDidChangeContent(() => onLocalEdit(doc));
    doc.viewStates = {};
    docs.set(e.id, doc);
    if (typeof onDocOpened === 'function') onDocOpened(doc);
    const insertAt = activeId ? tabOrder.indexOf(activeId) + 1 : tabOrder.length;
    tabOrder.splice(insertAt, 0, e.id);
  }
  // Claude opens what it edits, but doesn't pull the tab away while you are typing.
  if (e.agent && activeId && activeId !== e.id && Date.now() - lastTyped < 5000) { scheduleRender(); return; }
  activate(e.id);
  if (tree.nodes.has(e.id)) select(e.id, true);
  if (pendingReveal.has(e.id)) { const p = pendingReveal.get(e.id); pendingReveal.delete(e.id); setTimeout(() => revealPos(p), 30); }
}

/** Opens a script (if needed) and jumps to a position. */
function openAt(id, line, col = 1, endLine, endCol) {
  if (!id) return;
  const pos = { line, col, endLine, endCol };
  if (docs.has(id)) { activate(id); revealPos(pos); return; }
  pendingReveal.set(id, pos);
  openFromTree(id, false);
}
function revealPos(pos) {
  if (!editor || !pos || !pos.line) return;
  const range = new monaco.Range(pos.line, pos.col || 1, pos.endLine || pos.line, pos.endCol || pos.col || 1);
  editor.setSelection(range);
  editor.revealRangeInCenterIfOutsideViewport(range);
  editor.focus();
}

let lastTyped = 0;
function onLocalEdit(doc) {
  if (doc.applying) return;
  lastTyped = Date.now();
  doc.dirty = doc.model.getValue() !== doc.lastSynced;
  if (typeof lspNotify === 'function') lspNotify(doc);
  scheduleRender();
  if (autoSync) {
    clearTimeout(doc.timer);
    doc.timer = setTimeout(() => syncDoc(doc), 350);
  }
}

function syncDoc(doc) {
  clearTimeout(doc.timer);
  if (doc.deleted) { toast(`"${doc.name}" no longer exists in Studio.`, 'warn'); return; }
  if (!status.connected) { setSyncState('offline'); return; }
  const source = doc.model.getValue();
  bridge.send({ type: 'setSource', id: doc.id, source });
  doc.lastSynced = source;
  doc.dirty = false;
  setSyncState('sent');
  scheduleRender();
}

// Replace only the changed middle part so cursor and undo history survive.
function applyRemoteSource(doc, source) {
  const model = doc.model;
  const old = model.getValue();
  if (old === source) { doc.lastSynced = source; return; }
  let start = 0;
  const minLen = Math.min(old.length, source.length);
  while (start < minLen && old[start] === source[start]) start++;
  let endOld = old.length, endNew = source.length;
  while (endOld > start && endNew > start && old[endOld - 1] === source[endNew - 1]) { endOld--; endNew--; }
  const range = monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(endOld));
  doc.applying = true;
  model.pushEditOperations([], [{ range, text: source.slice(start, endNew) }], () => null);
  doc.applying = false;
  doc.lastSynced = source;
  doc.dirty = false;
}

function activate(id) {
  const doc = docs.get(id);
  if (!doc) return;
  if (!tabOrder.includes(id)) {
    const at = activeId ? tabOrder.indexOf(activeId) + 1 : tabOrder.length;
    tabOrder.splice(at, 0, id);
  }
  if (activeId && docs.has(activeId)) docs.get(activeId).viewStates[focused] = editor.saveViewState();
  activeId = id;
  editor.setModel(doc.model);
  if (doc.viewStates[focused]) editor.restoreViewState(doc.viewStates[focused]);
  editor.focus();
  updateWelcome();
  scheduleRender();
  updatePos();
  onActiveChanged();
}

function closeDoc(id, groupIndex = focused) {
  if (groupIndex !== focused) focusGroup(groupIndex);
  const doc = docs.get(id);
  if (!doc) return;
  const elsewhere = groupsWith(id).some((g) => g.index !== focused);
  if (!elsewhere && doc.dirty && !doc.deleted) {
    const answer = confirm(`"${doc.name}" has changes that were not sent to Studio yet.\n\nOK = send and close, Cancel = keep open`);
    if (!answer) return;
    syncDoc(doc);
  }
  const idx = tabOrder.indexOf(id);
  if (idx < 0) return;
  tabOrder.splice(idx, 1);
  if (!elsewhere) {
    clearTimeout(doc.timer);
    docs.delete(id);
    bridge.send({ type: 'closed', id });
  }
  if (activeId === id) {
    activeId = null;
    const next = tabOrder[Math.min(idx, tabOrder.length - 1)];
    if (next) activate(next);
    else editor.setModel(null);
  }
  if (!elsewhere) doc.model.dispose();
  if (!tabOrder.length && focused === 1) closeSplit();
  updateWelcome();
  scheduleRender();
  updatePos();
  onActiveChanged();
}

const SPLIT_ICON = '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 3v10" stroke="currentColor" stroke-width="1.1"/></svg>';
function renderTabs() {
  syncFocused();
  for (const g of groups) {
    const el = g.el.querySelector('.tabs');
    el.innerHTML = g.tabOrder.map((id) => {
      const d = docs.get(id);
      if (!d) return '';
      const cls = ['tab'];
      if (id === g.activeId) cls.push('active');
      if (d.dirty) cls.push('dirty');
      if (d.deleted) cls.push('deleted');
      if (typeof errorCount === 'function' && errorCount(id)) cls.push('has-errors');
      const n = tree.nodes.get(id);
      const title = n ? pathOf(n).map((p) => p.name).join('.') : d.name;
      return `<div class="${cls.join(' ')}" data-id="${esc(id)}" title="${esc(title)}">${classIcon(d.cls)}<span class="tname">${esc(d.name)}</span><span class="close">${X_ICON}</span></div>`;
    }).join('') + `<div class="tabs-actions">${g.index === 0 ? `<button data-tabact="split" title="Split Editor (${MOD}+\\)">${SPLIT_ICON}</button>` : `<button data-tabact="unsplit" title="Close Split">${X_ICON}</button>`}</div>`;
    g.el.classList.toggle('empty', !g.tabOrder.length);
    const active = el.querySelector('.tab.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
const groupsEl = $('#groups');
const groupOf = (el) => Number(el.closest('.group').dataset.group);
groupsEl.addEventListener('mousedown', (e) => {
  const act = e.target.closest('[data-tabact]');
  if (act) { e.preventDefault(); if (act.dataset.tabact === 'split') splitEditor(); else closeSplit(); return; }
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const gi = groupOf(tab);
  if (e.button === 1) { e.preventDefault(); closeDoc(tab.dataset.id, gi); return; }
  if (e.button !== 0) return;
  if (e.target.closest('.close')) { closeDoc(tab.dataset.id, gi); return; }
  focusGroup(gi);
  activate(tab.dataset.id);
});
groupsEl.addEventListener('contextmenu', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  e.preventDefault();
  const id = tab.dataset.id;
  const gi = groupOf(tab);
  focusGroup(gi);
  showMenu([
    { label: 'Close', key: `${MOD}+W`, run: () => closeDoc(id, gi) },
    { label: 'Close Others', run: () => tabOrder.filter((x) => x !== id).forEach((x) => closeDoc(x, gi)) },
    { label: 'Close All', run: () => [...tabOrder].forEach((x) => closeDoc(x, gi)) },
    '-',
    { label: gi === 0 ? 'Open to the Side' : 'Move to the Left', key: gi === 0 ? `${MOD}+\\` : '', run: () => { if (gi === 0) splitEditor(id); else { focusGroup(0); activate(id); } } },
    { label: 'Show History', run: () => typeof showHistoryFor === 'function' && showHistoryFor(id) },
    '-',
    { label: 'Reveal in Explorer', run: () => { showView('explorer'); select(id, true); } },
    { label: 'Select in Studio', run: () => bridge.send({ type: 'select', id }) },
    { label: 'Copy Lua Path', run: () => { const n = tree.nodes.get(id); if (n) { bridge.copy(luaPath(n)); toast('Copied path: ' + luaPath(n)); } } },
  ], e.clientX, e.clientY);
});

function updateBreadcrumbs() {
  syncFocused();
  for (const g of groups) {
    const el = g.el.querySelector('.breadcrumbs');
    const id = g.activeId;
    const n = id && tree.nodes.get(id);
    if (!id || !docs.has(id)) { el.innerHTML = ''; continue; }
    const parts = n ? pathOf(n) : [{ id, name: docs.get(id).name, cls: docs.get(id).cls }];
    el.innerHTML = parts.map((p, i) => (i ? '<span class="sep">›</span>' : '') + `<span class="crumb" data-id="${esc(p.id)}">${esc(p.name)}</span>`).join('');
  }
}
groupsEl.addEventListener('click', (e) => {
  const c = e.target.closest('.crumb');
  if (c) { showView('explorer'); select(c.dataset.id, true); treeEl.focus(); }
});

function updatePos() {
  const el = $('#sb-pos');
  if (!editor || !activeId) { el.textContent = ''; return; }
  const p = editor.getPosition();
  const sel = editor.getSelection();
  const selLen = sel && !sel.isEmpty() ? editor.getModel().getValueInRange(sel).length : 0;
  el.textContent = `Ln ${p.lineNumber}, Col ${p.column}` + (selLen ? ` (${selLen} selected)` : '');
}

// =====================================================================
// Status, sync indicator, plugin panel, toasts
// =====================================================================
let status = { connected: false, place: null, plugin: {} };
let syncTimer = null;

function setSyncState(state) {
  const el = $('#sb-sync');
  clearTimeout(syncTimer);
  if (state === 'sent') {
    el.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Sent to Studio';
    syncTimer = setTimeout(() => { el.innerHTML = ''; }, 1600);
  } else if (state === 'offline') {
    el.textContent = '⚠ Not sent: no connection';
  } else el.innerHTML = '';
}

function renderStatus() {
  const sb = $('#statusbar');
  sb.classList.toggle('connected', !!status.connected);
  const conn = $('#sb-conn');
  if (status.serverError) conn.textContent = '⚠ ' + status.serverError;
  else if (status.connected) conn.innerHTML = `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>Connected to Studio · ${esc(status.place ? status.place.name : '')}`;
  else conn.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Waiting for Roblox Studio…';
  $('#sb-autosync').textContent = `Auto Sync: ${autoSync ? 'On' : 'Off'}`;
  $('#tb-title').textContent = status.connected && status.place ? `${status.place.name} — Bloxcode` : 'Bloxcode';
  $('#tree-place').textContent = status.connected && status.place ? status.place.name : '';
  $('#welcome-status').innerHTML = status.connected
    ? `<span class="pill ok"><span class="dot"></span>Connected to ${esc(status.place ? status.place.name : 'Studio')}</span>`
    : '<span class="pill warn"><span class="dot"></span>Waiting for Roblox Studio</span>';
  $('#sb-update').textContent = !status.updateReady ? ''
    : IS_MAC ? `⟳ Bloxcode ${status.updateReady} is out · Download` : `⟳ Update ${status.updateReady} ready · Restart`;
  // snapshot progress
  const snap = status.snapshot;
  const loading = status.connected && snap && snap.total && snap.done < snap.total;
  $('#tree-progress').classList.toggle('hidden', !loading);
  if (loading) $('#tree-progress div').style.width = Math.round((snap.done / snap.total) * 100) + '%';
  // play test controls
  const pt = status.playtest || {};
  const play = $('#tb-play');
  play.classList.toggle('running', !!pt.running);
  play.classList.toggle('disabled', !status.connected || (status.pluginVersion || 0) < 3);
  play.title = (status.pluginVersion || 0) < 3 && status.connected ? 'Restart Roblox Studio to use play tests from Bloxcode' : '';
  const sbPlay = $('#sb-playtest');
  sbPlay.textContent = pt.running ? '● Play test running · Stop' : '';
  sbPlay.classList.toggle('playtest-on', !!pt.running);
  // language server
  const lspState = (status.lsp || {}).state;
  const lspLabel = { downloading: '⟳ Luau: downloading…', starting: '⟳ Luau: starting…', ready: '✓ Luau', error: '⚠ Luau' }[lspState] || '';
  $('#sb-lsp').textContent = lspLabel;
  $('#sb-lsp').title = (status.lsp && status.lsp.detail) || 'Luau language server';
  renderPluginPanel();
  renderClaudePanel();
  renderEmptyState();
}

function renderPluginPanel() {
  const p = status.plugin || {};
  $('#plugin-panel').innerHTML = `
    <p>${status.connected
      ? `<span class="pill ok"><span class="dot"></span>Connected · ${esc(status.place ? status.place.name : '')}</span>`
      : '<span class="pill warn"><span class="dot"></span>Not connected</span>'}</p>
    <h3>Plugin installation</h3>
    <p>${p.installed ? `Installed at<br><code>${esc(p.path)}</code>` : `Not installed${p.error ? ': ' + esc(p.error) : ''}`}</p>
    <button class="primary" data-plugin="install">Reinstall plugin</button>
    <button class="secondary" data-plugin="folder">Open plugins folder</button>
    <h3>How to connect Studio</h3>
    <ol>
      <li><b>Restart</b> Roblox Studio (or reopen your place) so the plugin loads.</li>
      <li>In the <b>Plugins</b> tab, click <b>Bloxcode</b>. A small window opens.</li>
      <li>Turn on <b>Code Mode</b>.</li>
      <li>The first time, Studio asks for permissions. Allow <b>HTTP requests to localhost</b> and <b>Script Injection</b>.</li>
    </ol>
    <h3>What happens then?</h3>
    <p>Every script you open in Studio (for example with a double-click) opens here instead of the Studio editor. Changes are sent back to Studio automatically. In the Explorer you can create, rename, move (drag & drop) and delete Scripts, ModuleScripts, LocalScripts, RemoteEvents and more.</p>
    <p>Bloxcode <code>v${esc(status.version || '')}</code> · Server port: <code>localhost:${status.port || 34872}</code></p>`;
}
$('#plugin-panel').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.plugin === 'install') {
    const r = await bridge.installPlugin();
    toast(r.installed ? (r.updated ? 'Plugin installed. Please restart Studio.' : 'Plugin is already up to date.') : 'Error: ' + r.error, r.installed ? 'info' : 'error');
  } else if (b.dataset.plugin === 'folder') bridge.openPluginFolder();
});

// =====================================================================
// Claude
// =====================================================================
const STARTER_PROMPT = `You are my Roblox game developer. You work directly in my open Roblox Studio place through Bloxcode (the "bloxcode" tools).

Before you start: call get_status, then get_explorer (scripts_only) and read the scripts that matter for the task.

While you work:
- Make every change with the Bloxcode tools. Don't paste code for me to copy.
- Follow how my game is already organized and its code style. Server code goes in ServerScriptService, client code in StarterPlayerScripts or StarterGui, shared modules and RemoteEvents in ReplicatedStorage. Validate everything the client sends.
- Modern Luau only (task.wait, GetService, types where useful).
- Check your work: get_diagnostics for type errors, then a short play test (start_playtest with seconds) and get_output for runtime errors. Fix what you find.
- Ask me before deleting things or rewriting large parts of the game.

When you are done: a short summary of what changed (paths) and what I should test. Answer in my language.

My task: `;

const agentLog = [];
let agentTimer = null;
function onAgentActivity(text) {
  agentLog.unshift({ text, time: new Date() });
  agentLog.length = Math.min(agentLog.length, 30);
  const el = $('#sb-agent');
  el.textContent = 'Claude: ' + text;
  el.classList.add('live');
  clearTimeout(agentTimer);
  agentTimer = setTimeout(() => el.classList.remove('live'), 4000);
  renderClaudePanel();
}
$('#sb-agent').addEventListener('click', () => showView('claude'));

// ---------- in-app chat ----------
let chatState = null;
let chatSetupOpen = false;
let chatBusy = false;

function chatReady(st) {
  if (!st) return false;
  if (st.mode === 'api') return st.hasKey;
  if (st.mode === 'code') return !!(st.claudeCode && st.claudeCode.path && st.claudeCode.loggedIn);
  return false;
}

function renderClaudePanel() {
  // Called on every status change: only touch the parts that don't hold user input.
  const log = $('#claude-activity');
  if (log) log.innerHTML = activityHtml();
}

function activityHtml() {
  const time = (d) => d.toTimeString().slice(0, 5);
  return agentLog.length
    ? `<ul class="claude-log">${agentLog.map((a) => `<li><span>${time(a.time)}</span>${esc(a.text)}</li>`).join('')}</ul>`
    : '<p>Nothing yet. Claude\'s changes show up here.</p>';
}

function applyChatState() {
  const st = chatState;
  const ready = chatReady(st);
  const setup = !ready || chatSetupOpen;
  $('#chat-setup').classList.toggle('hidden', !setup);
  $('#chat-log').classList.toggle('hidden', setup);
  $('#chat-form').classList.toggle('hidden', setup);
  if (setup) renderChatSetup();
  $('#chat-mode').textContent = !st ? '' : st.mode === 'api' ? `API key · ${st.model || ''}` : st.mode === 'code' ? 'Your Claude plan (Claude Code)' : '';
  chatBusy = !!(st && st.busy);
  $('#chat-send').disabled = chatBusy;
  $('#chat-stop').classList.toggle('hidden', !chatBusy);
  if (!setup && !$('#chat-log').children.length) renderChatEmpty();
}

function renderChatSetup() {
  const st = chatState || { claudeCode: {} };
  const cc = st.claudeCode || {};
  const codeReady = !!(cc.path && cc.loggedIn);
  let codeStatus;
  if (!cc.checked) codeStatus = '<span class="pill warn"><span class="dot"></span>Checking…</span>';
  else if (!cc.path) codeStatus = '<span class="pill warn"><span class="dot"></span>Claude Code is not installed</span>';
  else if (!cc.loggedIn) codeStatus = '<span class="pill warn"><span class="dot"></span>Installed, not signed in</span>';
  else codeStatus = `<span class="pill ok"><span class="dot"></span>Ready${cc.authMethod && cc.authMethod !== 'claude.ai' ? ' (' + esc(cc.authMethod) + ')' : ''}</span>`;
  const c = status.claude || {};
  const linked = c.desktop || c.code;
  $('#chat-setup').innerHTML = `
    <p>Chat with Claude right here. It reads your game, writes scripts, creates objects and fixes errors while you watch.</p>
    ${chatReady(st) ? '<button class="secondary" data-chat="back">← Back to the chat</button>' : ''}
    <div class="chat-card ${st.mode === 'code' ? 'active' : ''}">
      <h3>Use your Claude plan <span class="tag">Recommended</span></h3>
      <p>For Claude Pro or Max. Bloxcode uses Claude Code on this computer, so there is no extra cost and nothing to set up in Claude.</p>
      <p>${codeStatus}</p>
      ${codeReady
        ? `<button class="primary" data-chat="use-code">${st.mode === 'code' ? 'Using your Claude plan ✓' : 'Use my Claude plan'}</button>`
        : `<button class="primary" data-chat="install">${cc.path ? 'Sign in' : 'Install & sign in'}</button>
           <button class="secondary" data-chat="detect">I'm done, check again</button>
           <p class="fine">A terminal window opens. ${cc.path ? '' : 'It installs Claude Code, then '}sign in with your Claude account in the browser.</p>`}
    </div>
    <div class="chat-card ${st.mode === 'api' ? 'active' : ''}">
      <h3>Use an API key</h3>
      <p>Pay per use with your own key from the Claude Console, billed by Anthropic separately from a Claude plan.</p>
      ${st.hasKey
        ? `<p><span class="pill ok"><span class="dot"></span>Key saved (encrypted on this computer)</span></p>
           <button class="primary" data-chat="use-api">${st.mode === 'api' ? 'Using your API key ✓' : 'Use my API key'}</button>
           <button class="secondary" data-chat="clear-key">Remove key</button>`
        : `<input id="chat-key" type="password" placeholder="sk-ant-…" spellcheck="false" autocomplete="off">
           <button class="primary" data-chat="save-key">Save key</button>
           <p class="fine"><a href="https://console.anthropic.com/settings/keys" target="_blank">Get a key in the Claude Console</a></p>`}
    </div>
    <details>
      <summary>Use Claude Desktop instead (advanced)</summary>
      <p>Adds Bloxcode as an MCP server to Claude Desktop and Claude Code. Restart Claude afterwards, start a new chat and paste the starter prompt.</p>
      <p>${linked
        ? `<span class="pill ok"><span class="dot"></span>Set up for ${[c.desktop && 'Claude Desktop', c.code && 'Claude Code'].filter(Boolean).join(' and ')}</span>`
        : '<span class="pill warn"><span class="dot"></span>Not set up</span>'}</p>
      <button class="secondary" data-claude="connect">${linked ? 'Connect again' : 'Connect Claude Desktop'}</button>
      <button class="secondary" data-claude="copy">Copy starter prompt</button>
      <button class="secondary" data-claude="docs">How it works</button>
    </details>
    <details>
      <summary>Activity</summary>
      <div id="claude-activity">${activityHtml()}</div>
    </details>`;
}

$('#chat-setup').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.chat || b.dataset.claude;
  try {
    if (act === 'back') { chatSetupOpen = false; applyChatState(); }
    else if (act === 'install') { bridge.chat.install(); toast('Finish the sign-in in the terminal window, then click "check again".'); }
    else if (act === 'detect') { b.textContent = 'Checking…'; chatState = await bridge.chat.detect(); if (chatReady({ ...chatState, mode: 'code' })) { chatState = await bridge.chat.setMode('code'); chatSetupOpen = false; } applyChatState(); }
    else if (act === 'use-code') { chatState = await bridge.chat.setMode('code'); chatSetupOpen = false; applyChatState(); }
    else if (act === 'use-api') { chatState = await bridge.chat.setMode('api'); chatSetupOpen = false; applyChatState(); }
    else if (act === 'save-key') { chatState = await bridge.chat.saveKey($('#chat-key').value); chatSetupOpen = false; applyChatState(); toast('API key saved.'); }
    else if (act === 'clear-key') { chatState = await bridge.chat.clearKey(); applyChatState(); }
    else if (act === 'connect') {
      const r = await bridge.connectClaude();
      if (r.done.length) toast(`Connected: ${[...new Set(r.done.map((d) => d.app))].join(' and ')}. Restart Claude to load Bloxcode.`);
      if (r.errors.length) toast(r.errors.join(' '), 'error');
      renderChatSetup();
    } else if (act === 'copy') { bridge.copy(STARTER_PROMPT); toast('Prompt copied. Paste it into a new Claude chat and add your task.'); }
    else if (act === 'docs') window.open('https://bloxcode-docs.seidl.workers.dev/docs/claude');
  } catch (err) {
    toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
  }
});

const CHAT_SUGGESTIONS = [
  'Add a coin system: coins spawn on the map and the count shows in the leaderboard.',
  'Find and fix the errors from my last play-test.',
  'Make a shop GUI with three items that cost coins. Check purchases on the server.',
];
function renderChatEmpty() {
  $('#chat-log').innerHTML = `<div class="chat-empty">
    <h3>What should Claude build?</h3>
    ${status.connected ? '' : '<p>Connect Roblox Studio first: Plugins → Bloxcode → Code Mode.</p>'}
    <ul>${CHAT_SUGGESTIONS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p>Every change is one undo step in Studio.</p>
  </div>`;
}
$('#chat-log').addEventListener('click', (e) => {
  const li = e.target.closest('.chat-empty li');
  if (li) { $('#chat-input').value = li.textContent; $('#chat-input').focus(); }
});

// rendering of the conversation
let curText = null; // { el, raw }
let curNote = null;
const pendingTools = [];
const TOOL_LABELS = {
  get_status: 'Checked the connection', get_explorer: 'Looked at the Explorer', read_script: 'Read', write_script: 'Wrote',
  edit_script: 'Edited', create_instance: 'Created', rename_instance: 'Renamed', move_instance: 'Moved', delete_instance: 'Deleted',
  get_properties: 'Read properties of', set_properties: 'Changed', search_scripts: 'Searched scripts for', get_output: 'Read the Output',
  get_selection: 'Checked your selection', open_in_editor: 'Opened', search_packages: 'Searched packages for', install_package: 'Installed',
};
function toolTarget(name, input) {
  const a = input || {};
  if (name === 'create_instance' && a.parent && a.name) return `${a.parent}.${a.name}`;
  if (name === 'move_instance' && a.path && a.new_parent) return `${a.path} → ${a.new_parent}`;
  if (name === 'rename_instance' && a.path && a.new_name) return `${a.path} → ${a.new_name}`;
  return a.path || a.query || a.package || '';
}
function mdLite(raw) {
  const inline = (t) => esc(t).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  return raw.split(/```/).map((part, i) => {
    if (i % 2) return `<pre><code>${esc(part.replace(/^[\w-]*\n/, ''))}</code></pre>`;
    return part.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${inline(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  }).join('');
}
function chatAppend(el) {
  const log = $('#chat-log');
  const empty = log.querySelector('.chat-empty');
  if (empty) empty.remove();
  const working = log.querySelector('.msg.working');
  log.insertBefore(el, working);
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  if (nearBottom || el.classList.contains('user')) log.scrollTop = log.scrollHeight;
}
function chatMsg(cls, html) {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.innerHTML = html;
  chatAppend(el);
  return el;
}
function setWorking(on) {
  const log = $('#chat-log');
  const w = log.querySelector('.msg.working');
  if (on && !w) { const el = document.createElement('div'); el.className = 'msg working'; el.textContent = 'Claude is working…'; log.appendChild(el); log.scrollTop = log.scrollHeight; }
  if (!on && w) w.remove();
}

bridge.chat.onEvent((ev) => {
  switch (ev.type) {
    case 'state': chatState = ev.state; applyChatState(); break;
    case 'reset': $('#chat-log').innerHTML = ''; curText = curNote = null; pendingTools.length = 0; renderChatEmpty(); break;
    case 'user': curText = curNote = null; chatMsg('user', esc(ev.text)); setWorking(true); break;
    case 'text':
      curNote = null;
      if (!curText) curText = { el: chatMsg('assistant', ''), raw: '' };
      curText.raw += ev.text;
      curText.el.innerHTML = mdLite(curText.raw);
      chatAppend(curText.el);
      break;
    case 'note':
      if (!curNote) curNote = { el: chatMsg('note', ''), raw: '' };
      curNote.raw += ev.text;
      curNote.el.textContent = curNote.raw.trim();
      break;
    case 'tool': {
      curText = curNote = null;
      const target = toolTarget(ev.name, ev.input);
      const el = chatMsg('tool', `<span class="ico">⋯</span><span><b>${esc(TOOL_LABELS[ev.name] || ev.name)}</b> ${esc(target)}</span>`);
      pendingTools.push({ name: ev.name, el });
      break;
    }
    case 'tool_result': {
      const i = pendingTools.findIndex((t) => t.name === ev.name);
      const t = i >= 0 ? pendingTools.splice(i, 1)[0] : pendingTools.shift();
      if (!t) break;
      t.el.classList.add(ev.isError ? 'err' : 'ok');
      t.el.querySelector('.ico').textContent = ev.isError ? '✕' : '✓';
      if (ev.isError && ev.text) t.el.lastElementChild.insertAdjacentHTML('beforeend', `<span class="err-text">${esc(ev.text)}</span>`);
      break;
    }
    case 'error': curText = curNote = null; chatMsg('error', esc(ev.message)); break;
    case 'done': setWorking(false); curText = curNote = null; pendingTools.length = 0; break;
  }
});

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || chatBusy) return;
  input.value = '';
  bridge.chat.send(text).catch((err) => toast(String(err.message || err), 'error'));
});
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); }
});
$('#chat-stop').addEventListener('click', () => bridge.chat.stop());
$('#chat-new').addEventListener('click', () => { if (!chatBusy || confirm('Stop Claude and start a new chat?')) { bridge.chat.reset(); chatSetupOpen = false; applyChatState(); } });
$('#chat-settings').addEventListener('click', () => { chatSetupOpen = !chatSetupOpen || !chatReady(chatState); applyChatState(); });

bridge.chat.state().then((st) => { chatState = st; applyChatState(); return bridge.chat.detect(); }).then((st) => { chatState = st; applyChatState(); });

function toast(text, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

$('#sb-update').addEventListener('click', () => bridge.restartToUpdate());
$('#sb-playtest').addEventListener('click', () => stopPlaytest());
$('#sb-lsp').addEventListener('click', () => { if ((status.lsp || {}).state === 'error') { bridge.invoke('lsp:restart'); toast('Restarting the Luau language server…'); } else openSettings('editor'); });

async function startPlaytest(mode) {
  if (!requireConnection()) return;
  if ((status.pluginVersion || 0) < 3) { toast('Restart Roblox Studio once so the Bloxcode 2.0 plugin loads, then play tests work from here.', 'warn'); return; }
  try {
    toast(mode === 'run' ? 'Starting the server (Run)…' : 'Starting a play test…');
    await bridge.invoke('playtest:start', mode, true);
  } catch (err) { toast(cleanErr(err), 'error'); }
}
async function stopPlaytest() {
  try { await bridge.invoke('playtest:stop'); } catch (err) { toast(cleanErr(err), 'error'); }
}
function cleanErr(err) { return String(err && err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }

$('#sb-autosync').addEventListener('click', () => {
  autoSync = !autoSync;
  saveSetting('autoSync', autoSync);
  renderStatus();
  toast(autoSync ? 'Auto Sync on: changes go to Studio right away.' : `Auto Sync off: press ${MOD}+S to send to Studio.`);
});

// =====================================================================
// Views, sash, global shortcuts, toolbar actions
// =====================================================================
function showView(name) {
  document.querySelectorAll('.ab-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  saveSetting('lastView', name);
  if (name === 'explorer') { treeChanged(); }
  if (name === 'packages') { renderPackages(); loadPopular(); setTimeout(() => $('#pkg-search').focus(), 0); }
  if (name === 'search' && typeof searchFocus === 'function') searchFocus();
  if (name === 'properties' && typeof propsShow === 'function') propsShow();
  if (name === 'github' && typeof githubShow === 'function') githubShow();
}
document.querySelectorAll('.ab-item[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'quickopen') quickOpen();
  else if (act === 'palette') openPalette();
  else if (act === 'settings') openSettings();
  else if (act === 'play') startPlaytest('play');
  else if (act === 'run') startPlaytest('run');
  else if (act === 'stop') stopPlaytest();
  else if (act === 'whatsnew') showWhatsNew();
  else if (act === 'wizard') showWizard();
  else if (act === 'newscript') newScriptFlow();
  else if (act === 'refresh') { if (requireConnection()) bridge.send({ type: 'snapshot' }); }
  else if (act === 'collapse') { expanded.clear(); treeChanged(); }
});

(function sash() {
  const s = $('#sash');
  let startX = 0, startW = 0;
  const w = loadSetting('sidebarWidth', 290);
  document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  s.addEventListener('mousedown', (e) => {
    startX = e.clientX; startW = $('#sidebar').offsetWidth;
    s.classList.add('dragging');
    const move = (ev) => {
      const nw = Math.max(170, Math.min(700, startW + ev.clientX - startX));
      document.documentElement.style.setProperty('--sidebar-w', nw + 'px');
    };
    const up = () => {
      s.classList.remove('dragging');
      removeEventListener('mousemove', move); removeEventListener('mouseup', up);
      saveSetting('sidebarWidth', $('#sidebar').offsetWidth);
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
})();

addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (!$('#modal').classList.contains('hidden') && e.key === 'Escape') { e.preventDefault(); if (modalCurrent && modalCurrent.dismissable !== false) closeModal(); return; }
  if (ctrl && e.shiftKey && key === 'p') { e.preventDefault(); openPalette(); }
  else if (ctrl && e.shiftKey && key === 'f') { e.preventDefault(); showView('search'); }
  else if (ctrl && e.shiftKey && key === 'h') { e.preventDefault(); showView('search'); if (typeof searchShowReplace === 'function') searchShowReplace(true); }
  else if (ctrl && !e.shiftKey && e.key === ',') { e.preventDefault(); openSettings(); }
  else if (ctrl && !e.shiftKey && (key === 'j' || e.key === '`')) { e.preventDefault(); togglePanel(); }
  else if (ctrl && !e.shiftKey && e.key === '\\') { e.preventDefault(); splitEditor(); }
  else if (ctrl && e.shiftKey && key === 'm') { e.preventDefault(); showPanel('problems'); }
  else if (ctrl && e.shiftKey && key === 'u') { e.preventDefault(); showPanel('output'); }
  else if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); stopPlaytest(); }
  else if (e.key === 'F5') { e.preventDefault(); startPlaytest('play'); }
  else if (e.key === 'F8') { e.preventDefault(); startPlaytest('run'); }
  else if (ctrl && !e.shiftKey && key === 'p') { e.preventDefault(); quickOpen(); }
  else if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeId) closeDoc(activeId); }
  else if (ctrl && e.key === 'Tab') {
    e.preventDefault();
    if (tabOrder.length > 1) {
      const i = tabOrder.indexOf(activeId);
      activate(tabOrder[(i + (e.shiftKey ? -1 : 1) + tabOrder.length) % tabOrder.length]);
    }
  } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); showView('explorer'); treeEl.focus(); }
  else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (activeId) syncDoc(docs.get(activeId)); }
  else if (e.key === 'Escape') { hideMenu(); if (!$('#settings-page').classList.contains('hidden') && document.activeElement === document.body) closeSettings(); }
}, true);

// =====================================================================
// Bridge events from Studio
// =====================================================================
function handleEvents(events) {
  let changed = false;
  for (const e of events) {
    switch (e.op) {
      case 'reset':
        resetTree(); changed = true; break;
      case 'add':
        upsertNode(e); changed = true; break;
      case 'snap':
        for (const r of e.nodes || []) upsertNode({ id: r[0], name: r[1], cls: r[2], parent: r[3] || null });
        changed = true; break;
      case 'log':
        if (typeof outputAdd === 'function') outputAdd(e);
        break;
      case 'logsCleared':
        if (typeof outputClear === 'function') outputClear(false);
        break;
      case 'remove':
        removeNode(e.id); changed = true; break;
      case 'rename': {
        const n = tree.nodes.get(e.id);
        if (n) { n.name = e.name; markParentUnsorted(n); }
        const d = docs.get(e.id);
        if (d) d.name = e.name;
        changed = true; break;
      }
      case 'move': {
        const n = tree.nodes.get(e.id);
        if (n && n.parent !== e.parent) { detach(n); n.parent = e.parent; attach(n); changed = true; }
        break;
      }
      case 'open':
        handleOpenEvent(e); break;
      case 'source': {
        const d = docs.get(e.id);
        if (d) {
          if (!d.dirty) applyRemoteSource(d, e.source);
          else if (e.source !== d.model.getValue()) showConflict(d, e.source);
        }
        break;
      }
      case 'created':
        if (e.id) { expanded.add(e.parent); selectedId = e.id; setTimeout(() => select(e.id, true), 50); }
        break;
      case 'error':
        toast('Studio: ' + e.message, 'error'); break;
      case 'info':
        toast(e.message); break;
      case 'agent':
        onAgentActivity(e.text); break;
      default: break;
    }
  }
  if (changed) treeChanged();
}

// =====================================================================
// Wally packages
// =====================================================================
const POPULAR = ['evaera/cmdr', 'sleitnick/knit', 'evaera/promise', 'sleitnick/signal', 'sleitnick/trove',
  'sleitnick/component', 'sleitnick/timer', 'elttob/fusion', 'jsdotlua/react', 'jsdotlua/react-roblox',
  'littensy/charm', 'ukendio/jecs'];
const pkgState = { results: [], query: '', busy: new Map(), popularLoaded: false, searchTimer: null };

// Reads what is installed from the mirrored explorer tree.
function installedPackages() {
  const out = [];
  const containers = [
    ['shared', 'ReplicatedStorage', 'Packages'],
    ['server', 'ServerScriptService', 'ServerPackages'],
  ];
  for (const [realm, serviceCls, folderName] of containers) {
    const service = sortedRoots().find((n) => n.cls === serviceCls);
    if (!service) continue;
    const folder = sortedChildren(service).find((c) => c.name === folderName);
    if (!folder) continue;
    const index = sortedChildren(folder).find((c) => c.name === '_Index');
    const keys = index ? sortedChildren(index) : [];
    for (const link of sortedChildren(folder)) {
      if (link.name === '_Index' || link.cls !== 'ModuleScript') continue;
      const lower = link.name.toLowerCase().replace(/[-_]/g, '');
      const match = keys.find((k) => {
        const m = k.name.match(/^([^_]+)_(.+)@(.+)$/);
        return m && m[2].toLowerCase().replace(/[-_]/g, '') === lower;
      });
      const m = match && match.name.match(/^([^_]+)_(.+)@(.+)$/);
      out.push({
        alias: link.name, realm, linkId: link.id, indexId: match && match.id,
        scope: m ? m[1] : '', name: m ? m[2] : link.name, version: m ? m[3] : '',
      });
    }
  }
  return out;
}

function pkgCard(p, mode) {
  const full = p.scope ? `${p.scope}/${p.name}` : p.name;
  const busy = pkgState.busy.get(full);
  const letter = esc((p.alias || p.name || '?')[0].toUpperCase());
  let action = '';
  if (mode === 'installed') {
    action = `<button class="secondary" data-pkg-remove="${esc(p.linkId)}" data-pkg-index="${esc(p.indexId || '')}">Remove</button>`;
  } else {
    const inst = installedPackages().find((i) => `${i.scope}/${i.name}` === full);
    if (busy) action = '<button disabled>Installing…</button>';
    else if (inst && inst.version === p.version) action = '<button class="secondary" disabled>Installed</button>';
    else if (inst) action = `<button data-pkg-install="${esc(full)}">Update to ${esc(p.version)}</button>`;
    else action = `<button data-pkg-install="${esc(full)}">Install</button>`;
  }
  return `<div class="pkg">
    <div class="pkg-icon">${letter}</div>
    <div class="pkg-body">
      <div class="pkg-title"><span class="pkg-name">${esc(mode === 'installed' ? p.alias : p.name)}</span><span class="pkg-ver">v${esc(p.version || '?')}</span></div>
      ${p.description ? `<div class="pkg-desc">${esc(p.description)}</div>` : ''}
      <div class="pkg-foot"><span class="pkg-scope">${esc(mode === 'installed' ? `${full} · ${p.realm === 'server' ? 'ServerPackages' : 'Packages'}` : p.scope)}</span>${action}</div>
      <div class="pkg-progress">${busy ? esc(busy) : ''}</div>
    </div>
  </div>`;
}

function renderPackages() {
  if (!$('#view-packages').classList.contains('active')) return;
  const installed = installedPackages();
  $('#pkg-installed-title').classList.toggle('hidden', !installed.length);
  $('#pkg-installed').innerHTML = installed.map((p) => pkgCard(p, 'installed')).join('');
  $('#pkg-results-title').textContent = pkgState.query ? 'SEARCH RESULTS' : 'POPULAR';
  $('#pkg-results').innerHTML = pkgState.results.length
    ? pkgState.results.map((p) => pkgCard(p, 'result')).join('')
    : `<div class="pkg-empty">${pkgState.query ? 'No packages found.' : 'Loading…'}</div>`;
}

async function loadPopular() {
  if (pkgState.popularLoaded) return;
  pkgState.popularLoaded = true;
  const results = await Promise.all(POPULAR.map(async (full) => {
    const [scope, name] = full.split('/');
    try {
      const hits = await bridge.searchPackages(name);
      return hits.find((h) => h.scope === scope && h.name === name) || null;
    } catch (_) { return null; }
  }));
  if (!pkgState.query) { pkgState.results = results.filter(Boolean); renderPackages(); }
}

$('#pkg-search').addEventListener('input', (e) => {
  clearTimeout(pkgState.searchTimer);
  const q = e.target.value.trim();
  pkgState.searchTimer = setTimeout(async () => {
    pkgState.query = q;
    if (!q) { pkgState.popularLoaded = false; pkgState.results = []; renderPackages(); loadPopular(); return; }
    try {
      const results = await bridge.searchPackages(q);
      if (pkgState.query !== q) return;
      // exact name matches first
      results.sort((a, b) => (b.name === q) - (a.name === q));
      pkgState.results = results;
    } catch (err) {
      pkgState.results = [];
      toast('Could not reach the Wally registry: ' + err.message, 'error');
    }
    renderPackages();
  }, 250);
});

$('#view-packages').addEventListener('click', async (e) => {
  const install = e.target.closest('[data-pkg-install]');
  const remove = e.target.closest('[data-pkg-remove]');
  if (install) {
    if (!requireConnection()) return;
    const spec = install.dataset.pkgInstall;
    pkgState.busy.set(spec, 'Resolving…');
    renderPackages();
    try {
      const summary = await bridge.installPackage(spec);
      const deps = summary.dependencies ? ` with ${summary.dependencies} ${summary.dependencies === 1 ? 'dependency' : 'dependencies'}` : '';
      toast(`Installed ${summary.name}@${summary.version}${deps}. Use require(${summary.realm === 'server' ? 'ServerScriptService.ServerPackages' : 'ReplicatedStorage.Packages'}.${summary.alias})`);
      summary.warnings.forEach((w) => toast(w, 'warn'));
    } catch (err) {
      toast(`Could not install ${spec}: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error');
    }
    pkgState.busy.delete(spec);
    renderPackages();
  } else if (remove) {
    if (!requireConnection()) return;
    const linkNode = tree.nodes.get(remove.dataset.pkgRemove);
    if (!linkNode || !confirm(`Remove ${linkNode.name} from your place?\n\nYou can undo this in Studio with ${MOD}+Z.`)) return;
    bridge.send({ type: 'delete', id: remove.dataset.pkgRemove });
    if (remove.dataset.pkgIndex) bridge.send({ type: 'delete', id: remove.dataset.pkgIndex });
  }
});

bridge.onPackageProgress(({ spec, text }) => {
  if (pkgState.busy.has(spec)) { pkgState.busy.set(spec, text); renderPackages(); }
});

// =====================================================================
// Editor factory
// =====================================================================
function createGroupEditor(g) {
  const ed = monaco.editor.create(g.el.querySelector('.editor-host'), {
    model: null,
    theme: currentMonacoTheme(),
    automaticLayout: true,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: 'active', indentation: true },
    renderWhitespace: 'selection',
    insertSpaces: false,
    padding: { top: 6 },
    scrollBeyondLastLine: true,
    mouseWheelZoom: true,
    fixedOverflowWidgets: true,
    ...editorOptions(),
  });
  ed.onDidChangeCursorPosition(() => { if (g.index === focused) updatePos(); });
  ed.onDidChangeCursorSelection(() => { if (g.index === focused) updatePos(); });
  ed.onDidFocusEditorText(() => focusGroup(g.index));
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { if (activeId) syncDoc(docs.get(activeId)); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, quickOpen);
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, openPalette);
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash, () => splitEditor());
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, togglePanel);
  if (typeof setupEditorFeatures === 'function') setupEditorFeatures(ed, g);
  return ed;
}
function allEditors() { syncFocused(); return groups.map((g) => g.editor).filter(Boolean); }

// What Claude sees with get_editor_state.
window.__editorState = () => {
  syncFocused();
  const d = activeId && docs.get(activeId);
  const n = activeId && tree.nodes.get(activeId);
  const tabs = [...new Set(groups.flatMap((g) => g.tabOrder))].map((id) => { const x = tree.nodes.get(id); return x ? pathOf(x).map((p) => p.name).join('.') : id; });
  if (!d || !editor) return { active: null, tabs };
  const p = editor.getPosition();
  const sel = editor.getSelection();
  const selection = sel && !sel.isEmpty() ? d.model.getValueInRange(sel).slice(0, 8000) : '';
  return { active: { id: d.id, path: n ? pathOf(n).map((x) => x.name).join('.') : d.name, line: p ? p.lineNumber : 1, col: p ? p.column : 1, selection }, tabs };
};

// =====================================================================
// Boot
// =====================================================================
require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });
window.MonacoEnvironment = {
  getWorkerUrl() {
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
      `self.MonacoEnvironment={baseUrl:${JSON.stringify(new URL('../../node_modules/monaco-editor/min/', location.href).href)}};` +
      `importScripts(${JSON.stringify(new URL('../../node_modules/monaco-editor/min/vs/base/worker/workerMain.js', location.href).href)});`);
  },
};

require(['vs/editor/editor.main'], () => {
  setupLuau(() => ({
    roots: () => new Set(sortedRoots().map((n) => n.id)),
    get: (id) => tree.nodes.get(id),
    serviceByName: (name) => sortedRoots().find((n) => n.cls === name || n.name === name),
    currentNode: () => activeId && tree.nodes.get(activeId),
    childByName: (n, name) => {
      const ids = n.children instanceof Set ? n.children : new Set();
      for (const id of ids) { const c = tree.nodes.get(id); if (c && (c.name === name || (!c.parent && c.cls === name))) return c; }
      return null;
    },
    childrenOf: (n) => [...(n.children || [])].map((id) => tree.nodes.get(id)).filter(Boolean),
  }));

  applyAppearance();
  editor = createGroupEditor(groups[0]);
  groups[0].editor = editor;
  initFeatures();

  bridge.onEvents(handleEvents);
  bridge.onStatus((s) => {
    const was = status.connected;
    status = s;
    renderStatus();
    if (was && !s.connected) toast('Disconnected from Studio.', 'warn');
    if (!was && s.connected) {
      toast(`Connected to ${s.place ? s.place.name : 'Studio'}`);
      // Re-send anything typed while offline.
      docs.forEach((d) => { if (d.dirty && autoSync) syncDoc(d); });
    }
  });
  bridge.getStatus().then((s) => { status = s; renderStatus(); });
  renderStatus();
  treeChanged();
  const lastView = loadSetting('lastView', 'explorer');
  if (lastView !== 'explorer' && document.getElementById('view-' + lastView)) showView(lastView);
  if (typeof startOnboarding === 'function') startOnboarding();
});
