/* global bridge, $, esc, toast, status, classIcon, openAt, openFromTree, select, showView, tree, cleanErr, openModal, closeModal, requireConnection */
// Bloxcode 2.1 views: Remote map, Tags & attributes, Template gallery.
'use strict';

// ---------- Remote map ----------
const rmState = { list: null, open: new Set(), loading: false, error: null };

async function remotesShow(force) {
  if (rmState.list && !force) { renderRemotes(); return; }
  if (!status.connected) { $('#remotes-body').innerHTML = '<div class="props-empty">Connect Roblox Studio to map your RemoteEvents and RemoteFunctions.</div>'; return; }
  rmState.loading = true;
  $('#remotes-body').innerHTML = '<div class="props-empty">Reading all scripts…</div>';
  try { rmState.list = await bridge.invoke('remotes:scan'); rmState.error = null; } catch (err) { rmState.error = cleanErr(err); }
  rmState.loading = false;
  renderRemotes();
}

function renderRemotes() {
  const el = $('#remotes-body');
  if (rmState.error) { el.innerHTML = `<div class="props-empty">${esc(rmState.error)}</div>`; return; }
  const all = rmState.list || [];
  if (!all.length) { el.innerHTML = '<div class="props-empty">This place has no RemoteEvents, RemoteFunctions or BindableEvents yet.</div>'; return; }
  const q = $('#remotes-filter').value.trim().toLowerCase();
  const onlyIssues = $('#remotes-issues').checked;
  const list = all.filter((r) => (!q || r.path.toLowerCase().includes(q)) && (!onlyIssues || r.warnings.some((w) => w.level !== 'info')));
  const errors = all.reduce((n, r) => n + r.warnings.filter((w) => w.level === 'error').length, 0);
  const warnings = all.reduce((n, r) => n + r.warnings.filter((w) => w.level === 'warning').length, 0);
  const sideLabel = { server: 'server', client: 'client', shared: 'module', unknown: '?' };
  el.innerHTML = `<div class="rm-summary"><span>${all.length} remote${all.length === 1 ? '' : 's'}</span>${errors ? `<span style="color:var(--red)">⊗ ${errors} error${errors === 1 ? '' : 's'}</span>` : ''}${warnings ? `<span style="color:var(--orange)">⚠ ${warnings} warning${warnings === 1 ? '' : 's'}</span>` : ''}${!errors && !warnings ? '<span style="color:var(--green)">✓ No problems found</span>' : ''}</div>` +
    list.map((r) => {
      const e = r.warnings.filter((w) => w.level === 'error').length;
      const w = r.warnings.filter((x) => x.level === 'warning').length;
      const sends = r.usages.filter((u) => u.role === 'send');
      const listens = r.usages.filter((u) => u.role === 'listen');
      const open = rmState.open.has(r.id) || e || w;
      const use = (u) => `<div class="rm-use" data-open="${esc(u.scriptId)}" data-line="${u.line}" title="${esc(u.path)}:${u.line}"><span class="side ${esc(u.side)}">${esc(sideLabel[u.side] || u.side)}</span><span class="where">${esc(u.path.split('.').pop())}:${u.line}</span><span class="code">${esc(u.text)}</span></div>`;
      return `<div class="rm-card"><div class="rm-head" data-rm="${esc(r.id)}">${classIcon(r.cls)}<span class="rm-name">${esc(r.name)}</span><span class="rm-path">${esc(r.path.split('.').slice(0, -1).join('.'))}</span><span class="rm-counts">${e ? `<span class="e">${e}</span>` : ''}${w ? `<span class="w">${w}</span>` : ''}<span title="fired / listened">${sends.length}→${listens.length}</span></span></div>` +
        (open ? `<div class="rm-body">
          ${r.warnings.map((x) => `<div class="rm-warn ${x.level}" ${x.scriptId ? `data-open="${esc(x.scriptId)}" data-line="${x.line}"` : ''}><span class="lvl">${x.level === 'error' ? '⊗' : x.level === 'warning' ? '⚠' : 'ℹ'}</span><span class="msg">${esc(x.message)}</span></div>`).join('')}
          ${sends.length ? `<div class="rm-sec">Fired by</div>${sends.map(use).join('')}` : ''}
          ${listens.length ? `<div class="rm-sec">Listened to by</div>${listens.map(use).join('')}` : ''}
          <div class="rm-use" data-select="${esc(r.id)}"><span class="where" style="color:var(--link)">Select in Studio</span></div>
        </div>` : '') + '</div>';
    }).join('');
}

$('#remotes-body').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { openAt(o.dataset.open, Number(o.dataset.line)); return; }
  const s = e.target.closest('[data-select]');
  if (s) { bridge.send({ type: 'select', id: s.dataset.select }); select(s.dataset.select, true); return; }
  const h = e.target.closest('[data-rm]');
  if (h) { const id = h.dataset.rm; if (rmState.open.has(id)) rmState.open.delete(id); else rmState.open.add(id); renderRemotes(); }
});
$('#remotes-filter').addEventListener('input', renderRemotes);
$('#remotes-issues').addEventListener('change', renderRemotes);
$('#remotes-refresh').addEventListener('click', () => remotesShow(true));

// ---------- Tags & attributes ----------
const tgState = { data: null, open: new Set(), error: null };

async function tagsShow(force) {
  if (tgState.data && !force) { renderTags(); return; }
  if (!status.connected) { $('#tags-body').innerHTML = '<div class="props-empty">Connect Roblox Studio to see the tags and attributes in your place.</div>'; return; }
  if ((status.pluginVersion || 0) < 4) { $('#tags-body').innerHTML = '<div class="props-empty">Restart Roblox Studio once so the Bloxcode 2.1 plugin loads, then this view works.</div>'; return; }
  $('#tags-body').innerHTML = '<div class="props-empty">Scanning the place…</div>';
  try { tgState.data = await bridge.invoke('tags:scan'); tgState.error = null; } catch (err) { tgState.error = cleanErr(err); }
  renderTags();
}

function fmtValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v.value)) return `${v.type}(${v.value.map((n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n)).join(', ')})`;
  return String(v.value);
}

function renderTags() {
  const el = $('#tags-body');
  if (tgState.error) { el.innerHTML = `<div class="props-empty">${esc(tgState.error)}</div>`; return; }
  const d = tgState.data || { tags: {}, attributes: {} };
  const q = $('#tags-filter').value.trim().toLowerCase();
  const section = (kind, title, entries) => {
    const rows = entries.filter(([name]) => !q || name.toLowerCase().includes(q)).sort((a, b) => a[0].localeCompare(b[0]));
    let html = `<div class="pkg-section-title" style="padding-left:6px">${title} <span style="opacity:.6">(${rows.length})</span></div>`;
    if (!rows.length) return html + `<div class="props-empty" style="padding:4px 8px">${q ? 'Nothing matches.' : `No ${title.toLowerCase()} in this place.`}</div>`;
    for (const [name, list] of rows) {
      const key = kind + ':' + name;
      const open = tgState.open.has(key);
      html += `<div class="tg-row" data-tg="${esc(key)}"><span>${kind === 'tag' ? '🏷' : '◇'}</span><span class="tg-name">${esc(name)}</span><button data-selall="${esc(key)}" title="Select all of them in Studio">Select all</button><span class="tg-n">${list.length}</span></div>`;
      if (open) html += `<div class="tg-items">${list.map((x) => `<div class="tg-item" data-id="${esc(x.id)}" title="${esc(x.path)}">${classIcon(x.className)}<span class="p">${esc(x.path)}</span>${kind === 'attr' ? `<span class="v">${esc(fmtValue(x.value))}</span>` : ''}</div>`).join('')}</div>`;
    }
    return html;
  };
  el.innerHTML = section('tag', 'Tags', Object.entries(d.tags || {})) + section('attr', 'Attributes', Object.entries(d.attributes || {}));
}

function tagList(key) {
  const [kind, ...rest] = key.split(':');
  const name = rest.join(':');
  const d = tgState.data || {};
  return ((kind === 'tag' ? d.tags : d.attributes) || {})[name] || [];
}

$('#tags-body').addEventListener('click', async (e) => {
  const all = e.target.closest('[data-selall]');
  if (all) {
    e.stopPropagation();
    const ids = tagList(all.dataset.selall).map((x) => x.id);
    try { await bridge.invoke('select:many', ids); toast(`Selected ${ids.length} instance${ids.length === 1 ? '' : 's'} in Studio.`); } catch (err) { toast(cleanErr(err), 'error'); }
    return;
  }
  const item = e.target.closest('.tg-item');
  if (item) {
    const id = item.dataset.id;
    bridge.send({ type: 'select', id });
    if (tree.nodes.has(id)) { showView('explorer'); select(id, true); }
    return;
  }
  const row = e.target.closest('[data-tg]');
  if (row) { const k = row.dataset.tg; if (tgState.open.has(k)) tgState.open.delete(k); else tgState.open.add(k); renderTags(); }
});
$('#tags-filter').addEventListener('input', renderTags);
$('#tags-refresh').addEventListener('click', () => tagsShow(true));

// ---------- Template gallery ----------
let tplList = null;
let tplCategory = 'All';

async function showTemplates() {
  try { tplList = tplList || await bridge.invoke('templates:list'); } catch (err) { toast(cleanErr(err), 'error'); return; }
  openModal({
    wide: false,
    html: '',
    mount(card) {
      card.style.width = 'min(980px, 94vw)';
      const render = () => {
        const cats = ['All', ...new Set(tplList.map((t) => t.category))];
        const shown = tplList.filter((t) => tplCategory === 'All' || t.category === tplCategory);
        card.innerHTML = `<div class="modal-head"><h2>Templates</h2><button class="x" data-close title="Close">✕</button></div>
          <div class="modal-body" style="padding-top:0;flex:none"><p style="margin:0 0 10px">Ready-made, clean building blocks. Bloxcode adds them to your place as one undo step each; then change them however you like.</p></div>
          <div class="tpl-cats">${cats.map((c) => `<button data-cat="${esc(c)}" class="${c === tplCategory ? 'active' : ''}">${esc(c)}</button>`).join('')}</div>
          <div class="modal-body"><div class="tpl-grid">${shown.map((t) => `<div class="tpl-card"><span class="cat">${esc(t.category)}</span><h4>${esc(t.name)}</h4><p>${esc(t.description)}</p><div class="creates">${t.creates.map(esc).join('<br>')}${t.packages.length ? `<br>+ ${t.packages.map(esc).join(', ')} (Wally)` : ''}</div><button data-insert="${esc(t.id)}">Insert</button></div>`).join('')}</div></div>`;
      };
      render();
      card.addEventListener('click', async (e) => {
        if (e.target.closest('[data-close]')) { closeModal(); return; }
        const c = e.target.closest('[data-cat]');
        if (c) { tplCategory = c.dataset.cat; render(); return; }
        const b = e.target.closest('[data-insert]');
        if (!b) return;
        if (!requireConnection()) return;
        if ((status.pluginVersion || 0) < 3) { toast('Restart Roblox Studio once so the new Bloxcode plugin loads.', 'warn'); return; }
        b.disabled = true;
        b.textContent = 'Inserting…';
        try {
          const r = await bridge.invoke('templates:insert', b.dataset.insert);
          toast(`Added "${r.template}": ${r.created.map((x) => x.path).join(', ')}`);
          closeModal();
          if (r.mainId) setTimeout(() => { if (tree.nodes.has(r.mainId)) { showView('explorer'); select(r.mainId, true); if (/Script$/.test(tree.nodes.get(r.mainId).cls)) openFromTree(r.mainId, false); } }, 600);
        } catch (err) {
          toast(cleanErr(err), 'error');
          b.disabled = false;
          b.textContent = 'Insert';
        }
      });
    },
  });
}

// Load the open view as soon as Studio connects.
let views21Connected = false;
bridge.onStatus((s) => {
  if (s.connected && !views21Connected) {
    setTimeout(() => {
      if ($('#view-tags').classList.contains('active')) tagsShow(true);
      if ($('#view-remotes').classList.contains('active')) remotesShow(true);
    }, 1500);
  }
  views21Connected = !!s.connected;
});
