/* global monaco, bridge, toast, tree, docs, activeId, sortedRoots, sortedChildren, select, showView, openFromTree, SCRIPT_CLASSES, pathOf */
// Editor extras: color swatches for Color3 values, and Ctrl+click on instance paths.
'use strict';

// ---------- Color3 previews ----------
const COLOR_RE = /Color3\s*\.\s*(fromRGB|new|fromHex|fromHSV)\s*\(\s*([^()]*?)\s*\)/g;

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, max ? d / max : 0, max];
}
const round3 = (n) => Math.round(n * 1000) / 1000;

function parseColor(kind, args) {
  if (kind === 'fromHex') {
    const m = args.match(/^["']#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})["']$/);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const nums = args.split(',').map((s) => Number(s.trim()));
  if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n))) return null;
  if (kind === 'fromRGB') return nums.map((n) => Math.max(0, Math.min(255, n)) / 255);
  if (kind === 'new') return nums.map((n) => Math.max(0, Math.min(1, n)));
  return hsvToRgb(...nums.map((n) => Math.max(0, Math.min(1, n))));
}

function initEditorExtras() {
  monaco.languages.registerColorProvider('luau', {
    provideDocumentColors(model) {
      const out = [];
      const text = model.getValue();
      COLOR_RE.lastIndex = 0;
      let m;
      while ((m = COLOR_RE.exec(text))) {
        const rgb = parseColor(m[1], m[2]);
        if (!rgb) continue;
        const start = model.getPositionAt(m.index), end = model.getPositionAt(m.index + m[0].length);
        out.push({ color: { red: rgb[0], green: rgb[1], blue: rgb[2], alpha: 1 }, range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column) });
      }
      return out;
    },
    provideColorPresentations(model, info) {
      const original = model.getValueInRange(info.range);
      const { red: r, green: g, blue: b } = info.color;
      const to255 = (v) => Math.round(v * 255);
      const hex = '#' + [r, g, b].map((v) => to255(v).toString(16).padStart(2, '0')).join('');
      const options = {
        fromRGB: `Color3.fromRGB(${to255(r)}, ${to255(g)}, ${to255(b)})`,
        new: `Color3.new(${round3(r)}, ${round3(g)}, ${round3(b)})`,
        fromHex: `Color3.fromHex("${hex}")`,
        fromHSV: `Color3.fromHSV(${rgbToHsv(r, g, b).map(round3).join(', ')})`,
      };
      const kind = (original.match(/Color3\s*\.\s*(\w+)/) || [])[1] || 'fromRGB';
      const order = [kind, ...Object.keys(options).filter((k) => k !== kind)];
      return order.filter((k) => options[k]).map((k) => ({ label: options[k], textEdit: { range: info.range, text: options[k] } }));
    },
  });
}

// ---------- Ctrl+click on instance paths ----------
const SEG = String.raw`(?:\s*\.\s*[A-Za-z_]\w*|\s*:\s*(?:GetService|WaitForChild|FindFirstChild|FindFirstChildOfClass|FindFirstAncestor)\s*\(\s*["'][^"']*["']\s*(?:,[^)]*)?\)|\s*\[\s*["'][^"']*["']\s*\])`;
const CHAIN_END_RE = new RegExp(String.raw`([A-Za-z_]\w*(?:${SEG})*)$`);

function splitChain(expr) {
  const parts = [];
  const root = expr.match(/^[A-Za-z_]\w*/)[0];
  let rest = expr.slice(root.length);
  const re = /^\s*(?:\.\s*([A-Za-z_]\w*)|:\s*(GetService|WaitForChild|FindFirstChild|FindFirstChildOfClass|FindFirstAncestor)\s*\(\s*["']([^"']*)["']\s*(?:,[^)]*)?\)|\[\s*["']([^"']*)["']\s*\])/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) break;
    if (m[1]) parts.push({ name: m[1] });
    else if (m[2]) parts.push({ name: m[3], method: m[2] });
    else parts.push({ name: m[4] });
    rest = rest.slice(m[0].length);
  }
  return { root, parts };
}

function childNamed(node, name) {
  if (!node) return null;
  return sortedChildren(node).find((c) => c.name === name) || null;
}

/** Resolves an expression like game:GetService("ReplicatedStorage").Remotes.Buy to an Explorer node. */
function resolveExpr(model, expr, depth = 0) {
  if (depth > 6) return null;
  const { root, parts } = splitChain(expr);
  let node;
  const services = sortedRoots();
  if (root === 'game') node = { virtualGame: true };
  else if (root === 'workspace') node = services.find((s) => s.cls === 'Workspace');
  else if (root === 'script') node = activeId && tree.nodes.get(activeId);
  else {
    // a local variable: local Remotes = ReplicatedStorage:WaitForChild("Remotes")
    const m = model.getValue().match(new RegExp(String.raw`local\s+${root}\s*(?::\s*[\w.<>]+\s*)?=\s*([^\n;]+)`));
    if (!m) return null;
    const value = m[1].trim().match(new RegExp(String.raw`^[A-Za-z_]\w*(?:${SEG})*`));
    if (!value) return null;
    node = resolveExpr(model, value[0], depth + 1);
  }
  for (const p of parts) {
    if (!node) return null;
    if (node.virtualGame) {
      node = services.find((s) => s.name === p.name || s.cls === p.name) || null;
      continue;
    }
    if (p.name === 'Parent' && !p.method) { node = node.parent ? tree.nodes.get(node.parent) : { virtualGame: true }; continue; }
    if (p.method === 'FindFirstAncestor') {
      let cur = node.parent && tree.nodes.get(node.parent);
      while (cur && cur.name !== p.name) cur = cur.parent && tree.nodes.get(cur.parent);
      node = cur || null;
      continue;
    }
    if (p.method === 'FindFirstChildOfClass') { node = sortedChildren(node).find((c) => c.cls === p.name) || null; continue; }
    const child = childNamed(node, p.name);
    if (!child) return p.method ? null : node; // a property like .Anchored: stop at the instance
    node = child;
  }
  return node && !node.virtualGame ? node : null;
}

function exprAt(model, position) {
  const word = model.getWordAtPosition(position);
  if (!word) return null;
  const line = model.getLineContent(position.lineNumber);
  let end = word.endColumn - 1;
  // include a closing ("…") or ["…"] right after the word, so clicking on WaitForChild("X") works
  const after = line.slice(end).match(/^\s*\(\s*["'][^"']*["']\s*(?:,[^)]*)?\)|^\s*\[\s*["'][^"']*["']\s*\]/);
  if (after) end += after[0].length;
  const m = line.slice(0, end).match(CHAIN_END_RE);
  return m ? m[1] : null;
}

function setupInstanceLinks(ed) {
  let deco = ed.createDecorationsCollection();
  let lastKey = '';
  const target = (e) => {
    if (!e.target || !e.target.position || !(e.event.ctrlKey || e.event.metaKey)) return null;
    const model = ed.getModel();
    if (!model || !tree.nodes.size) return null;
    const expr = exprAt(model, e.target.position);
    if (!expr || !/[.:[]/.test(expr) && !/^(workspace|script)$/.test(expr)) return null;
    const node = resolveExpr(model, expr);
    if (!node) return null;
    const word = model.getWordAtPosition(e.target.position);
    return { node, range: new monaco.Range(e.target.position.lineNumber, word.startColumn, e.target.position.lineNumber, word.endColumn) };
  };
  ed.onMouseMove((e) => {
    const t = target(e);
    const key = t ? `${t.node.id}:${t.range}` : '';
    if (key === lastKey) return;
    lastKey = key;
    deco.set(t ? [{ range: t.range, options: { inlineClassName: 'instance-link', hoverMessage: { value: `**${pathOf(t.node).map((p) => p.name).join('.')}** · ${t.node.cls}  \nCtrl+click: ${SCRIPT_CLASSES.has(t.node.cls) ? 'open the script' : 'select in the Explorer and in Studio'}` } } }] : []);
  });
  ed.onKeyUp((e) => { if (!e.ctrlKey && !e.metaKey && lastKey) { lastKey = ''; deco.set([]); } });
  ed.onMouseUp((e) => {
    const t = target(e);
    if (!t) return;
    const n = t.node;
    if (SCRIPT_CLASSES.has(n.cls) && n.id !== activeId) { openFromTree(n.id, false); return; }
    showView('explorer');
    select(n.id, true);
    bridge.send({ type: 'select', id: n.id });
    toast(`Selected ${pathOf(n).map((p) => p.name).join('.')} in Studio`);
  });
}
