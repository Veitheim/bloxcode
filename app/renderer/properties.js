/* global bridge, $, esc, toast, tree, selectedId, activeId, classIcon, cleanErr, status */
// Properties panel: edit properties, attributes and tags of the selected instance.
'use strict';

const props = { id: null, data: null, filter: '', loading: false, busy: false };
const PROP_GROUPS = [
  ['Appearance', ['Color', 'BrickColor', 'Material', 'Transparency', 'Reflectance', 'CastShadow', 'Shape', 'BackgroundColor3', 'BackgroundTransparency', 'TextColor3', 'Image', 'ImageColor3', 'Texture', 'TextureID', 'MeshId']],
  ['Data', ['Name', 'Value', 'MaxValue', 'MinValue', 'Text', 'PlaceholderText', 'RichText', 'TextScaled', 'TextSize', 'Font', 'Enabled', 'Disabled', 'RunContext', 'Archivable', 'DisplayName']],
  ['Transform', ['Size', 'Position', 'Orientation', 'CFrame', 'AnchorPoint', 'WorldPivot', 'PrimaryPart']],
  ['Behavior', ['Anchored', 'CanCollide', 'CanTouch', 'CanQuery', 'Massless', 'Locked', 'Visible', 'ZIndex', 'LayoutOrder', 'ResetOnSpawn', 'ZIndexBehavior', 'DisplayOrder']],
];

function propsShow() {
  const id = selectedId || activeId;
  if (id !== props.id || !props.data) propsLoad(id);
}

async function propsLoad(id) {
  props.id = id;
  const body = $('#props-body');
  if (!id || !tree.nodes.get(id)) { props.data = null; body.innerHTML = '<div class="props-empty">Select an object in the Explorer to see and change its properties.</div>'; return; }
  if (!status.connected) { body.innerHTML = '<div class="props-empty">Connect Roblox Studio to edit properties.</div>'; return; }
  props.loading = true;
  try {
    const data = await bridge.invoke('props:get', id);
    if (props.id !== id) return;
    props.data = data;
    renderProps();
  } catch (err) {
    body.innerHTML = `<div class="props-empty">${esc(cleanErr(err))}</div>`;
  } finally { props.loading = false; }
}

function fmt(n) { return Math.round(Number(n) * 1000) / 1000; }
function hex(rgb) { return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }

function editorFor(name, v, scope) {
  const attr = `data-scope="${scope}" data-name="${esc(name)}"`;
  if (typeof v === 'boolean') return `<input type="checkbox" ${attr} data-kind="bool" ${v ? 'checked' : ''}>`;
  if (typeof v === 'number') return `<input type="number" step="any" ${attr} data-kind="number" value="${fmt(v)}">`;
  if (typeof v === 'string') return `<input type="text" ${attr} data-kind="string" value="${esc(v)}" spellcheck="false">`;
  if (!v || typeof v !== 'object') return '<span class="ro">—</span>';
  const a = v.value;
  switch (v.type) {
    case 'Color3': return `<input type="color" ${attr} data-kind="Color3" value="${hex(a)}"><input type="text" ${attr} data-kind="Color3text" value="${a.join(', ')}">`;
    case 'Vector3': return ['X', 'Y', 'Z'].map((ax, i) => `<input type="number" step="any" ${attr} data-kind="Vector3" data-i="${i}" title="${ax}" value="${fmt(a[i])}">`).join('');
    case 'Vector2': return ['X', 'Y'].map((ax, i) => `<input type="number" step="any" ${attr} data-kind="Vector2" data-i="${i}" title="${ax}" value="${fmt(a[i])}">`).join('');
    case 'UDim2': return ['X Scale', 'X Offset', 'Y Scale', 'Y Offset'].map((ax, i) => `<input type="number" step="any" ${attr} data-kind="UDim2" data-i="${i}" title="${ax}" value="${fmt(a[i])}">`).join('');
    case 'UDim': return ['Scale', 'Offset'].map((ax, i) => `<input type="number" step="any" ${attr} data-kind="UDim" data-i="${i}" title="${ax}" value="${fmt(a[i])}">`).join('');
    case 'Enum': return `<input type="text" ${attr} data-kind="Enum" value="${esc(String(a).replace(/^Enum\.[^.]+\./, ''))}" title="${esc(a)}" spellcheck="false">`;
    case 'BrickColor': return `<input type="text" ${attr} data-kind="BrickColor" value="${esc(a)}" spellcheck="false">`;
    case 'CFrame': return `<span class="ro" title="Position ${a.slice(0, 3).map(fmt).join(', ')}">${a.slice(0, 3).map(fmt).join(', ')}</span>`;
    case 'Instance': return `<span class="ro" title="${esc(a)}">${esc(a || 'nil')}</span>`;
    case 'nil': return '<span class="ro">nil</span>';
    default: return `<span class="ro" title="${esc(v.type)}">${esc(String(a))}</span>`;
  }
}

function renderProps() {
  const d = props.data;
  const body = $('#props-body');
  if (!d) return;
  const q = props.filter.toLowerCase();
  const names = Object.keys(d.properties || {});
  const used = new Set();
  let html = `<div class="props-head">${classIcon(d.className)}<span class="nm" title="${esc(d.path)}">${esc(d.path.split('.').pop())}</span><span class="cls">${esc(d.className)}</span></div>`;
  const section = (title, list) => {
    const rows = list.filter((n) => names.includes(n) && (!q || n.toLowerCase().includes(q)));
    rows.forEach((n) => used.add(n));
    if (!rows.length) return '';
    return `<div class="props-section">${title}</div>` + rows.map((n) => `<div class="prop"><label title="${esc(n)}">${esc(n)}</label><div class="val">${editorFor(n, d.properties[n], 'prop')}</div></div>`).join('');
  };
  for (const [title, list] of PROP_GROUPS) html += section(title, list);
  html += section('Other', names.filter((n) => !PROP_GROUPS.some(([, l]) => l.includes(n))).sort());
  const attrs = Object.entries(d.attributes || {}).filter(([n]) => !q || n.toLowerCase().includes(q));
  html += `<div class="props-section">Attributes <button data-pa="add-attr">+ Add</button></div>`;
  html += attrs.length ? attrs.map(([n, v]) => `<div class="prop"><label title="${esc(n)}">${esc(n)}</label><div class="val">${editorFor(n, v, 'attr')}<button class="small-btn" data-pa="del-attr" data-name="${esc(n)}" title="Remove attribute">✕</button></div></div>`).join('')
    : '<div class="prop"><label class="ro">No attributes</label></div>';
  html += `<div class="props-section">Tags <button data-pa="add-tag">+ Add</button></div><div class="tags-wrap">${(d.tags || []).map((t) => `<span class="tagchip">${esc(t)}<button data-pa="del-tag" data-name="${esc(t)}">✕</button></span>`).join('') || '<span class="ro" style="color:var(--fg-faint);font-size:12px">No tags</span>'}</div>`;
  body.innerHTML = html;
}

function readEditor(input) {
  const kind = input.dataset.kind;
  const name = input.dataset.name;
  const scope = input.dataset.scope;
  const siblings = [...input.parentElement.querySelectorAll(`[data-name="${CSS.escape(name)}"][data-kind="${kind}"]`)];
  switch (kind) {
    case 'bool': return input.checked;
    case 'number': return Number(input.value);
    case 'string': return input.value;
    case 'Color3': { const h = input.value.slice(1); return { type: 'Color3', value: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }; }
    case 'Color3text': return { type: 'Color3', value: input.value.split(/[,\s]+/).filter(Boolean).map(Number).slice(0, 3) };
    case 'Vector3': case 'Vector2': case 'UDim2': case 'UDim': return { type: kind, value: siblings.map((s) => Number(s.value)) };
    case 'Enum': {
      const cur = props.data && (scope === 'prop' ? props.data.properties[name] : props.data.attributes[name]);
      const enumType = cur && String(cur.value).split('.')[1];
      return { type: 'Enum', value: enumType ? `Enum.${enumType}.${input.value}` : input.value };
    }
    case 'BrickColor': return { type: 'BrickColor', value: input.value };
    default: return null;
  }
}

async function propsApply(input) {
  const id = props.id;
  const value = readEditor(input);
  if (value === null) return;
  const name = input.dataset.name;
  try {
    if (input.dataset.scope === 'attr') await bridge.invoke('props:set', id, undefined, { [name]: value });
    else await bridge.invoke('props:set', id, { [name]: value });
    if (props.id === id) propsLoad(id);
  } catch (err) {
    toast(cleanErr(err), 'error');
    propsLoad(id);
  }
}

const propsBody = $('#props-body');
propsBody.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.kind) propsApply(e.target); });
propsBody.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.kind) { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') { e.preventDefault(); renderProps(); }
});
propsBody.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pa]');
  if (!b) return;
  const id = props.id;
  try {
    if (b.dataset.pa === 'add-attr') {
      const name = await askText('New attribute name', '', 'Attribute names: letters, numbers and _');
      if (!name) return;
      const raw = await askText(`Value for "${name}"`, '0', 'A number, true/false, or text');
      if (raw === null) return;
      const value = raw === 'true' ? true : raw === 'false' ? false : raw.trim() !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
      await bridge.invoke('props:set', id, undefined, { [name]: value });
    } else if (b.dataset.pa === 'del-attr') {
      await bridge.invoke('props:set', id, undefined, { [b.dataset.name]: { type: 'nil' } });
    } else if (b.dataset.pa === 'add-tag') {
      const tag = await askText('New tag', '', 'Tags work with CollectionService');
      if (!tag) return;
      await bridge.invoke('props:tags', id, [tag], []);
    } else if (b.dataset.pa === 'del-tag') {
      await bridge.invoke('props:tags', id, [], [b.dataset.name]);
    }
    propsLoad(id);
  } catch (err) { toast(cleanErr(err), 'error'); }
});
$('#props-filter').addEventListener('input', (e) => { props.filter = e.target.value; renderProps(); });
$('#props-refresh').addEventListener('click', () => propsLoad(selectedId || activeId));

/** Asks for a line of text in the quick input. Resolves null when cancelled. */
function askText(placeholder, value, message) {
  return new Promise((resolve) => {
    let done = false;
    openQuick({ placeholder, value, message, onSubmit: (v) => { done = true; resolve(v); } });
    const check = setInterval(() => { if (!quickState) { clearInterval(check); if (!done) resolve(null); } }, 200);
  });
}

// Follow the Explorer selection while the panel is open.
setInterval(() => {
  if (!$('#view-properties').classList.contains('active')) return;
  const id = selectedId || activeId;
  if (id && id !== props.id && !props.loading) propsLoad(id);
}, 300);
