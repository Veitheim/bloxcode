// Luau language server (luau-lsp) for real type checking, hover, go to definition and rename.
//
// Bloxcode mirrors every script of the place into a small workspace folder with a Rojo-style
// sourcemap.json, so luau-lsp knows the instance tree (game.Workspace.Part, require(...)) and
// can check scripts against each other. The server binary and the Roblox type definitions are
// downloaded on first use.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const { unzipSync } = require('fflate');

const LSP_VERSION = '1.70.1';
const DEFS_URL = 'https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/main/scripts/globalTypes.PluginSecurity.d.luau';
const DOCS_URL = 'https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/api-docs/en-us.json';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SOURCEMAP_NODES = 25000;
const EXT = { Script: '.server.luau', LocalScript: '.client.luau', ModuleScript: '.luau' };

function createLsp({ userData, studio, placeKey, emit }) {
  const base = path.join(userData, 'luau-lsp');
  let state = 'off'; // off | downloading | starting | ready | error
  let stateDetail = '';
  let proc = null;
  let enabled = false;
  let workspace = null;
  const fileOf = new Map(); // id -> absolute file path
  const idOf = new Map(); // uri -> id
  const versions = new Map(); // uri -> version
  const diagnostics = new Map(); // id -> [diagnostic]
  const liveText = new Map(); // id -> text from the editor (may be ahead of Studio)

  function setState(s, detail = '') {
    state = s; stateDetail = detail;
    emit('lsp:state', { state, detail });
  }

  // ---------- downloads ----------
  async function download(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Bloxcode' } });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async function ensureBinary() {
    if (process.env.BLOXCODE_LUAU_LSP && fs.existsSync(process.env.BLOXCODE_LUAU_LSP)) return process.env.BLOXCODE_LUAU_LSP;
    const isWin = process.platform === 'win32';
    const exe = path.join(base, LSP_VERSION, isWin ? 'luau-lsp.exe' : 'luau-lsp');
    if (fs.existsSync(exe)) return exe;
    const asset = isWin ? 'luau-lsp-win64.zip' : process.platform === 'darwin' ? 'luau-lsp-macos.zip' : 'luau-lsp-linux-x86_64.zip';
    setState('downloading', 'Downloading the Luau language server…');
    const zip = unzipSync(new Uint8Array(await download(`https://github.com/JohnnyMorganz/luau-lsp/releases/download/${LSP_VERSION}/${asset}`)));
    const entry = Object.keys(zip).find((k) => /(^|\/)luau-lsp(\.exe)?$/.test(k));
    if (!entry) throw new Error('The language server download did not contain luau-lsp.');
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, Buffer.from(zip[entry]));
    if (!isWin) fs.chmodSync(exe, 0o755);
    return exe;
  }

  async function ensureFile(name, url) {
    const file = path.join(base, name);
    let fresh = false;
    try { fresh = Date.now() - fs.statSync(file).mtimeMs < REFRESH_MS; } catch (_) {}
    if (fresh) return file;
    try {
      setState('downloading', 'Downloading Roblox type definitions…');
      const data = await download(url);
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(file, data);
    } catch (err) {
      if (!fs.existsSync(file)) throw err; // offline: keep using the old copy
    }
    return file;
  }

  // ---------- workspace mirror ----------
  function safeName(s) { return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || '_'; }

  function writeScript(id) {
    const n = studio.nodes.get(id);
    const src = liveText.has(id) ? liveText.get(id) : studio.sources.get(id);
    if (!n || typeof src !== 'string' || !workspace) return null;
    let file = fileOf.get(id);
    if (!file) {
      file = path.join(workspace, 'src', `${id}_${safeName(n.name)}${EXT[n.cls] || '.luau'}`);
      fileOf.set(id, file);
      idOf.set(normUri(uriOf(file)), id);
    }
    fs.writeFileSync(file, src);
    return file;
  }

  function uriOf(file) { return pathToFileURL(file).href; }
  // luau-lsp writes file:///c%3A/… while Node writes file:///C:/… – compare a normalized form.
  function normUri(uri) {
    let u = String(uri);
    try { u = decodeURIComponent(u); } catch (_) {}
    return u.replace(/^file:\/\/\/([A-Za-z]):/, (_, d) => 'file:///' + d.toLowerCase() + ':').replace(/\\/g, '/');
  }

  function sourcemap() {
    // Rojo sourcemap: lets luau-lsp type game.ServerScriptService.Main and resolve require(script.Parent.X).
    let count = 0;
    const keep = new Set();
    const small = studio.nodes.size <= MAX_SOURCEMAP_NODES;
    if (!small) {
      for (const n of studio.nodes.values()) {
        if (!studio.SCRIPT_CLASSES.has(n.cls)) continue;
        for (let cur = n; cur && !keep.has(cur.id); cur = cur.parent ? studio.nodes.get(cur.parent) : null) keep.add(cur.id);
      }
    }
    function node(id) {
      const n = studio.nodes.get(id);
      count++;
      const out = { name: n.name, className: n.cls };
      const f = fileOf.get(id);
      if (f) out.filePaths = [path.relative(workspace, f).replace(/\\/g, '/')];
      const kids = [...studio.kids(id)].filter((c) => small || keep.has(c));
      if (kids.length) out.children = kids.map(node);
      return out;
    }
    return { name: (studio.getPlace() || {}).name || 'Game', className: 'DataModel', children: [...studio.kids(null)].filter((c) => small || keep.has(c)).map(node) };
  }

  let sourcemapTimer = null;
  function scheduleSourcemap() {
    clearTimeout(sourcemapTimer);
    sourcemapTimer = setTimeout(() => {
      if (!workspace) return;
      try { fs.writeFileSync(path.join(workspace, 'sourcemap.json'), JSON.stringify(sourcemap())); } catch (_) {}
      if (proc) notify('workspace/didChangeWatchedFiles', { changes: [{ uri: uriOf(path.join(workspace, 'sourcemap.json')), type: 2 }] });
    }, 800);
  }

  // ---------- JSON-RPC over stdio ----------
  let nextId = 1;
  const waiting = new Map();
  let buffer = Buffer.alloc(0);

  function write(msg) {
    if (!proc) return;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
    proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    proc.stdin.write(body);
  }
  function notify(method, params) { write({ method, params }); }
  function request(method, params, timeout = 15000) {
    if (!proc || state !== 'ready' && method !== 'initialize') return Promise.reject(new Error('The Luau language server is not running.'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`luau-lsp did not answer ${method}.`)); }, timeout);
      waiting.set(id, { resolve, reject, timer });
      write({ id, method, params });
    });
  }

  function onData(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd).toString('ascii');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { buffer = buffer.slice(headerEnd + 4); continue; }
      const len = Number(m[1]);
      if (buffer.length < headerEnd + 4 + len) return;
      const body = buffer.slice(headerEnd + 4, headerEnd + 4 + len).toString('utf8');
      buffer = buffer.slice(headerEnd + 4 + len);
      let msg;
      try { msg = JSON.parse(body); } catch (_) { continue; }
      handleMessage(msg);
    }
  }

  const SETTINGS = {
    platform: { type: 'roblox' },
    sourcemap: { enabled: true, autogenerate: false, rojoProjectFile: 'default.project.json', includeNonScripts: true },
    diagnostics: { includeDependents: true, workspace: false, strictDatamodelTypes: false },
    completion: { enabled: true, autocompleteEnd: true, addParentheses: true, imports: { enabled: true, suggestServices: true, suggestRequires: true } },
    hover: { enabled: true, showTableKinds: false, strictDatamodelTypes: true },
    signatureHelp: { enabled: true },
    inlayHints: { parameterNames: 'none', variableTypes: false, functionReturnTypes: false },
    types: { roblox: true },
    require: { mode: 'relativeToFile' },
  };

  function handleMessage(msg) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const w = waiting.get(msg.id);
      if (!w) return;
      waiting.delete(msg.id);
      clearTimeout(w.timer);
      if (msg.error) w.reject(new Error(msg.error.message || 'luau-lsp error'));
      else w.resolve(msg.result);
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // requests from the server
      let result = null;
      if (msg.method === 'workspace/configuration') {
        result = (msg.params.items || []).map((it) => (it.section === 'luau-lsp' ? SETTINGS : it.section && it.section.startsWith('luau-lsp.') ? SETTINGS[it.section.slice(9)] ?? null : null));
      }
      write({ id: msg.id, result });
      return;
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      const id = idOf.get(normUri(msg.params.uri));
      if (!id) return;
      const items = (msg.params.diagnostics || []).map((d) => ({
        line: d.range.start.line + 1, col: d.range.start.character + 1,
        endLine: d.range.end.line + 1, endCol: d.range.end.character + 1,
        severity: d.severity || 1, message: d.message, code: d.code,
      }));
      diagnostics.set(id, items);
      emit('lsp:diagnostics', { id, path: studio.pathOf(id), items });
    }
  }

  // ---------- documents ----------
  function openDoc(id) {
    const file = writeScript(id);
    if (!file || !proc) return;
    const uri = uriOf(file);
    if (versions.has(uri)) return;
    versions.set(uri, 1);
    notify('textDocument/didOpen', { textDocument: { uri, languageId: 'luau', version: 1, text: fs.readFileSync(file, 'utf8') } });
  }
  function changeDoc(id) {
    const file = writeScript(id);
    if (!file || !proc) return;
    const uri = uriOf(file);
    if (!versions.has(uri)) return openDoc(id);
    const v = versions.get(uri) + 1;
    versions.set(uri, v);
    notify('textDocument/didChange', { textDocument: { uri, version: v }, contentChanges: [{ text: fs.readFileSync(file, 'utf8') }] });
  }
  function closeDoc(id) {
    const file = fileOf.get(id);
    if (!file) return;
    const uri = uriOf(file);
    if (proc && versions.has(uri)) notify('textDocument/didClose', { textDocument: { uri } });
    versions.delete(uri);
    idOf.delete(normUri(uri));
    fileOf.delete(id);
    diagnostics.delete(id);
    liveText.delete(id);
    try { fs.unlinkSync(file); } catch (_) {}
    emit('lsp:diagnostics', { id, path: '', items: [] });
  }

  // ---------- start / stop ----------
  async function start() {
    if (proc || state === 'starting' || state === 'downloading') return;
    try {
      setState('starting', 'Preparing the Luau language server…');
      const exe = await ensureBinary();
      const defs = await ensureFile('globalTypes.d.luau', DEFS_URL);
      const docs = await ensureFile('en-us.json', DOCS_URL);
      workspace = path.join(userData, 'lsp-workspace', String(placeKey()).replace(/[^\w.-]+/g, '_'));
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
      fs.writeFileSync(path.join(workspace, '.luaurc'), JSON.stringify({ languageMode: 'nonstrict' }));
      fs.writeFileSync(path.join(workspace, 'default.project.json'), JSON.stringify({ name: 'Game', tree: { $className: 'DataModel' } }));
      fileOf.clear(); idOf.clear(); versions.clear(); diagnostics.clear();

      setState('starting', 'Starting the Luau language server…');
      const child = spawn(exe, ['lsp', `--definitions:@roblox=${defs}`, `--docs=${docs}`], { cwd: workspace, windowsHide: true });
      proc = child;
      buffer = Buffer.alloc(0);
      // An old server that was stopped may report its exit after a new one started: ignore it.
      child.stdout.on('data', (d) => { if (proc === child) onData(d); });
      child.stderr.on('data', () => {});
      child.on('exit', (code) => {
        if (proc !== child) return;
        proc = null;
        for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('luau-lsp stopped.')); }
        waiting.clear();
        if (enabled && state === 'ready') setState('error', `The language server stopped (code ${code}). Click here to restart it.`);
      });
      child.on('error', (err) => { if (proc === child) setState('error', err.message); });

      const rootUri = uriOf(workspace);
      await request('initialize', {
        processId: process.pid,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: 'place' }],
        capabilities: {
          workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true }, workspaceFolders: true },
          textDocument: {
            synchronization: { didSave: false },
            publishDiagnostics: { relatedInformation: false },
            completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], insertReplaceSupport: false, labelDetailsSupport: true } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
            definition: {}, references: {}, documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            rename: { prepareSupport: true },
          },
        },
        initializationOptions: {},
      }, 60000);
      state = 'ready';
      notify('initialized', {});
      notify('workspace/didChangeConfiguration', { settings: { 'luau-lsp': SETTINGS } });
      setState('ready', 'Luau language server running');
      await syncAll();
    } catch (err) {
      try { if (proc) proc.kill(); } catch (_) {}
      proc = null;
      setState('error', String(err.message || err));
    }
  }

  async function syncAll() {
    if (!proc || !studio.isConnected()) return;
    try { await studio.loadAllSources(); } catch (_) { return; }
    for (const id of studio.scriptIds()) writeScript(id);
    fs.writeFileSync(path.join(workspace, 'sourcemap.json'), JSON.stringify(sourcemap()));
    for (const id of studio.scriptIds()) openDoc(id);
  }

  function stop() {
    if (proc) { try { notify('exit'); proc.kill(); } catch (_) {} }
    proc = null;
    for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('luau-lsp stopped.')); }
    waiting.clear();
    diagnostics.clear();
    setState('off');
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled && studio.isConnected()) start();
    if (!enabled) stop();
  }

  // keep the mirror in sync
  studio.events.on('sourceChanged', ({ id }) => { liveText.delete(id); if (proc && state === 'ready') changeDoc(id); });
  studio.events.on('scriptRemoved', (id) => { if (proc) { closeDoc(id); scheduleSourcemap(); } });
  studio.events.on('tree', () => { if (proc && state === 'ready') scheduleSourcemap(); });
  studio.events.on('snapshotDone', () => {
    if (!enabled) return;
    if (!proc) start(); else syncAll();
  });
  studio.events.on('reset', () => { if (proc) { stop(); } });

  // ---------- requests from the editor ----------
  function docParams(id, line, col) {
    const file = fileOf.get(id);
    if (!file) throw new Error('This script is not known to the language server yet.');
    return { textDocument: { uri: uriOf(file) }, position: { line: line - 1, character: col - 1 } };
  }

  function updateText(id, text) {
    if (!proc || state !== 'ready' || !studio.isScript(id)) return;
    liveText.set(id, text);
    changeDoc(id);
  }

  function toLocation(loc) {
    const uri = loc.uri || loc.targetUri;
    const range = loc.range || loc.targetSelectionRange || loc.targetRange;
    let id = idOf.get(normUri(uri)) || null;
    let file = null;
    try { file = fileURLToPath(uri); } catch (_) {}
    return { id, path: id ? studio.pathOf(id) : file, line: range.start.line + 1, col: range.start.character + 1, endLine: range.end.line + 1, endCol: range.end.character + 1 };
  }

  async function call(kind, id, line, col, extra) {
    if (state !== 'ready') return null;
    const p = docParams(id, line, col);
    switch (kind) {
      case 'completion': return request('textDocument/completion', { ...p, context: { triggerKind: extra && extra.trigger ? 2 : 1, triggerCharacter: extra && extra.trigger } });
      case 'resolve': return request('completionItem/resolve', extra.item);
      case 'hover': return request('textDocument/hover', p);
      case 'signature': return request('textDocument/signatureHelp', p);
      case 'definition': {
        const r = await request('textDocument/definition', p);
        return (Array.isArray(r) ? r : r ? [r] : []).map(toLocation);
      }
      case 'references': {
        const r = await request('textDocument/references', { ...p, context: { includeDeclaration: true } });
        return (r || []).map(toLocation);
      }
      case 'rename': {
        const r = await request('textDocument/rename', { ...p, newName: extra.newName });
        return renameEdits(r);
      }
      default: return null;
    }
  }

  async function symbols(id) {
    if (state !== 'ready') return [];
    const file = fileOf.get(id);
    if (!file) return [];
    return request('textDocument/documentSymbol', { textDocument: { uri: uriOf(file) } });
  }

  // Turns a WorkspaceEdit into new full sources per script id.
  function renameEdits(edit) {
    const out = {};
    const changes = (edit && edit.changes) || {};
    for (const dc of (edit && edit.documentChanges) || []) changes[dc.textDocument.uri] = dc.edits;
    for (const [uri, edits] of Object.entries(changes)) {
      const id = idOf.get(normUri(uri));
      if (!id) continue;
      const text = liveText.has(id) ? liveText.get(id) : studio.sources.get(id);
      if (typeof text !== 'string') continue;
      out[id] = applyEdits(text, edits);
    }
    return out;
  }

  function applyEdits(text, edits) {
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
    const offset = (pos) => Math.min(text.length, (lineStarts[pos.line] ?? text.length) + pos.character);
    const sorted = [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start));
    for (const e of sorted) text = text.slice(0, offset(e.range.start)) + e.newText + text.slice(offset(e.range.end));
    return text;
  }

  function allDiagnostics() {
    const out = [];
    for (const [id, items] of diagnostics) if (items.length) out.push({ id, path: studio.pathOf(id), items });
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  return {
    setEnabled, start, stop, call, symbols, updateText, allDiagnostics,
    get state() { return state; }, get stateDetail() { return stateDetail; },
    getState: () => ({ state, detail: stateDetail }),
  };
}

module.exports = { createLsp };
