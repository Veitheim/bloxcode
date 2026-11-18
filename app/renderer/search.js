/* global bridge, $, esc, toast, loadSetting, saveSetting, classIcon, openAt, docs, applyRemoteSource, requireConnection, cleanErr, MOD */
// Search & Replace across every script in the place (Ctrl+Shift+F).
'use strict';

const srch = {
  opts: loadSetting('searchOpts', { caseSensitive: false, wholeWord: false, regex: false }),
  result: null,
  collapsed: new Set(),
  timer: null,
  running: 0,
  replaceOpen: false,
};
const CHEV = '<svg viewBox="0 0 10 10"><path d="M3 1.5L6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function searchFocus() {
  const q = $('#search-query');
  // put the selected text of the editor into the box, like VS Code
  try {
    const sel = editor && editor.getSelection();
    const text = sel && !sel.isEmpty() ? editor.getModel().getValueInRange(sel) : '';
    if (text && !text.includes('\n') && text.length < 200) { q.value = text; searchRun(); }
  } catch (_) {}
  setTimeout(() => { q.focus(); q.select(); }, 0);
}
function searchShowReplace(on) {
  srch.replaceOpen = on;
  $('#search-replace-row').classList.toggle('hidden', !on);
  $('#search-toggle-replace').classList.toggle('open', on);
  if (on) setTimeout(() => $('#search-replace').focus(), 0);
  renderSearchResults();
}

function searchParams() {
  return { query: $('#search-query').value, include: $('#search-include').value.trim() || undefined, ...srch.opts };
}

async function searchRun() {
  clearTimeout(srch.timer);
  const p = searchParams();
  if (!p.query) { srch.result = null; $('#search-status').textContent = ''; renderSearchResults(); return; }
  if (!requireConnection()) return;
  const run = ++srch.running;
  $('#search-status').textContent = 'Searching…';
  try {
    const r = await bridge.invoke('search:run', p);
    if (run !== srch.running) return;
    srch.result = r;
    const files = r.results.length;
    $('#search-status').textContent = r.total
      ? `${r.total}${r.truncated ? '+' : ''} result${r.total === 1 ? '' : 's'} in ${files} script${files === 1 ? '' : 's'}`
      : 'No results.';
  } catch (err) {
    if (run !== srch.running) return;
    srch.result = null;
    $('#search-status').textContent = cleanErr(err);
  }
  renderSearchResults();
}
bridge.on('search:progress', ({ done, total }) => {
  if (srch.running && total > 20) $('#search-status').textContent = `Loading scripts from Studio… ${done}/${total}`;
});

function previewReplace(text, m) {
  const before = text.slice(0, m.col - 1);
  const hit = text.slice(m.col - 1, m.col - 1 + m.length);
  const after = text.slice(m.col - 1 + m.length);
  // keep the match visible on narrow sidebars
  const lead = before.length > 30 ? '…' + before.slice(-30) : before;
  const rep = $('#search-replace').value;
  if (srch.replaceOpen) {
    let replacement = rep;
    if (srch.opts.regex) {
      try {
        const re = new RegExp(searchParams().query, srch.opts.caseSensitive ? '' : 'i');
        replacement = hit.replace(re, rep);
      } catch (_) {}
    }
    return `${esc(lead.trimStart())}<del>${esc(hit)}</del><ins>${esc(replacement)}</ins>${esc(after)}`;
  }
  return `${esc(lead.trimStart())}<mark>${esc(hit)}</mark>${esc(after)}`;
}

function renderSearchResults() {
  const el = $('#search-results');
  const r = srch.result;
  if (!r) { el.innerHTML = ''; return; }
  el.innerHTML = r.results.map((f) => {
    const col = srch.collapsed.has(f.id);
    const dir = f.path.split('.').slice(0, -1).join('.');
    return `<div class="sr-file ${col ? 'collapsed' : ''}" data-file="${esc(f.id)}"><span class="twist">${CHEV}</span>${classIcon(f.cls || 'Script')}<span class="nm">${esc(f.name || f.path)}</span><span class="pth">${esc(dir)}</span><span class="cnt">${f.matches.length}</span></div>` +
      (col ? '' : f.matches.map((m, i) => `<div class="sr-match" data-id="${esc(f.id)}" data-i="${i}" title="${esc(f.path)}:${m.line}"><span class="ln">${m.line}</span><span class="tx">${previewReplace(m.text, m)}</span>${srch.replaceOpen ? `<button class="rep" data-rep-file="${esc(f.id)}" title="Replace in this script">Replace</button>` : ''}</div>`).join(''));
  }).join('');
}

$('#search-results').addEventListener('click', async (e) => {
  const repFile = e.target.closest('[data-rep-file]');
  if (repFile) { e.stopPropagation(); await searchReplace([repFile.dataset.repFile]); return; }
  const file = e.target.closest('[data-file]');
  if (file) {
    const id = file.dataset.file;
    if (srch.collapsed.has(id)) srch.collapsed.delete(id); else srch.collapsed.add(id);
    renderSearchResults();
    return;
  }
  const m = e.target.closest('.sr-match');
  if (!m) return;
  document.querySelectorAll('.sr-match.sel').forEach((x) => x.classList.remove('sel'));
  m.classList.add('sel');
  const f = srch.result.results.find((x) => x.id === m.dataset.id);
  const hit = f && f.matches[Number(m.dataset.i)];
  if (hit) openAt(f.id, hit.line, hit.col, hit.line, hit.col + hit.length);
});

async function searchReplace(ids) {
  const p = searchParams();
  if (!p.query || !srch.result) return;
  const replacement = $('#search-replace').value;
  const scope = ids ? srch.result.results.filter((r) => ids.includes(r.id)) : srch.result.results;
  const count = scope.reduce((n, r) => n + r.matches.length, 0);
  if (!ids && !confirm(`Replace ${count} match${count === 1 ? '' : 'es'} in ${scope.length} script${scope.length === 1 ? '' : 's'} with "${replacement}"?\n\nThis is one undo step in Studio (${MOD}+Z).`)) return;
  try {
    // send pending typing first so nothing gets lost
    for (const d of docs.values()) if (d.dirty) syncDoc(d);
    const r = await bridge.invoke('search:replace', { ...p, replacement, ids: scope.map((x) => x.id) });
    toast(`Replaced ${r.matches} match${r.matches === 1 ? '' : 'es'} in ${r.scripts} script${r.scripts === 1 ? '' : 's'}.`);
    for (const id of r.ids) {
      const d = docs.get(id);
      if (d) bridge.invoke('sources:get', id).then((src) => applyRemoteSource(d, src)).catch(() => {});
    }
    searchRun();
  } catch (err) { toast(cleanErr(err), 'error'); }
}

$('#search-query').addEventListener('input', () => { clearTimeout(srch.timer); srch.timer = setTimeout(searchRun, 300); });
$('#search-include').addEventListener('input', () => { clearTimeout(srch.timer); srch.timer = setTimeout(searchRun, 400); });
$('#search-replace').addEventListener('input', () => renderSearchResults());
$('#search-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchRun(); } });
$('#search-replace').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); searchReplace(); } });
$('#search-replace-all').addEventListener('click', () => searchReplace());
$('#search-toggle-replace').addEventListener('click', () => searchShowReplace(!srch.replaceOpen));
$('#search-refresh').addEventListener('click', searchRun);
$('#search-clear').addEventListener('click', () => { $('#search-query').value = ''; $('#search-replace').value = ''; srch.result = null; $('#search-status').textContent = ''; renderSearchResults(); });
$('#search-collapse').addEventListener('click', () => {
  if (!srch.result) return;
  const all = srch.result.results.every((r) => srch.collapsed.has(r.id));
  srch.collapsed = all ? new Set() : new Set(srch.result.results.map((r) => r.id));
  renderSearchResults();
});
document.querySelectorAll('#view-search .opt[data-opt]').forEach((b) => {
  b.classList.toggle('on', !!srch.opts[b.dataset.opt]);
  b.addEventListener('click', () => {
    srch.opts[b.dataset.opt] = !srch.opts[b.dataset.opt];
    b.classList.toggle('on', srch.opts[b.dataset.opt]);
    saveSetting('searchOpts', srch.opts);
    searchRun();
  });
});
