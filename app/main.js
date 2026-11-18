// Bloxcode – Electron main process.
// Runs a small HTTP server on localhost that the Roblox Studio plugin talks to,
// and forwards everything to the editor window over IPC.

const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, dialog, screen } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updater = require('./updater');
const packages = require('./packages');
const { createStudio } = require('./studio');
const { createSearch } = require('./search');
const { createHistory } = require('./history');
const { createLsp } = require('./lsp');
const { createGitHub } = require('./github');
const { createPlaytest } = require('./playtest');
const { createDiscord } = require('./discord');
const { createAgent, connectClaude, claudeConnectionState } = require('./agent');
const { isMac, robloxPluginsDir } = require('./platform');
const { createChat } = require('./chat');

// BLOXCODE_PORT lets a dev copy run next to an installed Bloxcode (the plugin always uses 34872).
const PORT = Number(process.env.BLOXCODE_PORT) || 34872;
// A dev copy on another port also gets its own profile, so it doesn't collide with the installed app.
if (process.env.BLOXCODE_PORT) app.setPath('userData', path.join(app.getPath('appData'), 'bloxcode-dev'));
const POLL_HOLD_MS = 10000;
const CONNECTED_TIMEOUT_MS = 15000;

let win = null;
let updateReady = null; // version string once an update was downloaded in the background
let agentActivity = null; // { text, time } of Claude's last action

// ---------- bridge state ----------
const bridge = {
  session: crypto.randomUUID(),
  activeClient: null,
  place: null,
  lastSeen: 0,
  queue: [],
  waiter: null, // { res, timer }
  serverError: null,
  pluginVersion: 0,
};

function isConnected() {
  return !!bridge.activeClient && Date.now() - bridge.lastSeen < CONNECTED_TIMEOUT_MS;
}
function placeKey() {
  const p = bridge.place || {};
  return p.id ? `place-${p.id}` : `local-${p.name || 'unknown'}`;
}

function statusPayload() {
  return {
    connected: isConnected(),
    place: bridge.place,
    port: PORT,
    serverError: bridge.serverError,
    plugin: pluginInstallInfo,
    pluginVersion: isConnected() ? bridge.pluginVersion : 0,
    version: app.getVersion(),
    updateReady,
    platform: process.platform,
    claude: claudeState,
    agentActivity,
    lsp: lsp ? lsp.getState() : { state: 'off' },
    discord: discord ? discord.status : 'off',
    snapshot: studio ? studio.snapshotProgress : null,
    playtest: playtest ? playtest.info() : null,
  };
}

let lastStatusJson = '';
function sendStatus(force) {
  const json = JSON.stringify(statusPayload());
  if (!force && json === lastStatusJson) return;
  lastStatusJson = json;
  send('bridge:status', JSON.parse(json));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function sendEvents(events) {
  if (events.length) send('bridge:events', events);
}

function flushWaiter() {
  if (!bridge.waiter) return;
  const { res, timer } = bridge.waiter;
  clearTimeout(timer);
  bridge.waiter = null;
  const commands = bridge.queue;
  bridge.queue = [];
  json(res, 200, { session: bridge.session, active: true, commands });
}

function pushCommand(cmd) {
  bridge.queue.push(cmd);
  flushWaiter();
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  // Windows blocks focus stealing; briefly going always-on-top brings the window forward.
  win.setAlwaysOnTop(true);
  win.focus();
  win.moveTop();
  setTimeout(() => win && !win.isDestroyed() && win.setAlwaysOnTop(false), 150);
}

/**
 * Only Roblox Studio and Bloxcode's own MCP server may talk to the bridge, never a website.
 * Browsers always send Origin or Sec-Fetch headers, can't fake the Host header (DNS rebinding)
 * and need a CORS preflight for JSON posts, which we never allow.
 */
function trustedRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const okHost = host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}` || host === `[::1]:${PORT}`;
  if (!okHost) return false;
  if (req.headers.origin || req.headers['sec-fetch-mode'] || req.headers['sec-fetch-site']) return false;
  if (req.method === 'POST' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const client = url.searchParams.get('client');
  try {
    if (req.method === 'GET' && url.pathname === '/ping') {
      return json(res, 200, { app: 'bloxcode', session: bridge.session });
    }
    if (!trustedRequest(req)) return json(res, 403, { error: 'Forbidden' });

    if (req.method === 'POST' && url.pathname === '/hello') {
      const body = await readBody(req);
      // A new Studio window takes over. Tell the old one it is no longer active.
      if (bridge.waiter) {
        clearTimeout(bridge.waiter.timer);
        json(bridge.waiter.res, 200, { session: bridge.session, active: false, commands: [] });
        bridge.waiter = null;
      }
      bridge.activeClient = body.clientId;
      bridge.place = { name: body.placeName || 'Place', id: body.placeId || 0 };
      bridge.lastSeen = Date.now();
      bridge.queue = [];
      bridge.pluginVersion = Number(body.pluginVersion) || 1;
      studio.onReset();
      sendEvents([{ op: 'reset' }]);
      sendStatus(true);
      updateDiscord();
      return json(res, 200, { session: bridge.session });
    }

    if (req.method === 'GET' && url.pathname === '/poll') {
      if (client !== bridge.activeClient) {
        return json(res, 200, { session: bridge.session, active: false, commands: [] });
      }
      bridge.lastSeen = Date.now();
      sendStatus();
      if (bridge.queue.length) {
        const commands = bridge.queue;
        bridge.queue = [];
        return json(res, 200, { session: bridge.session, active: true, commands });
      }
      if (bridge.waiter) {
        // Only one open poll per client – answer the old one empty.
        clearTimeout(bridge.waiter.timer);
        json(bridge.waiter.res, 200, { session: bridge.session, active: true, commands: [] });
      }
      const timer = setTimeout(() => {
        if (bridge.waiter && bridge.waiter.res === res) flushWaiter();
      }, POLL_HOLD_MS);
      bridge.waiter = { res, timer };
      req.on('close', () => {
        if (bridge.waiter && bridge.waiter.res === res) { clearTimeout(timer); bridge.waiter = null; }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/events') {
      if (client !== bridge.activeClient) return json(res, 409, { error: 'inactive' });
      const body = await readBody(req);
      bridge.lastSeen = Date.now();
      const events = studio.onEvents(Array.isArray(body.events) ? body.events : []);
      sendEvents(events.filter((e) => e.op !== 'log')); // logs go out through studio.events
      if (events.some((e) => e.op === 'open' && e.focus)) focusWindow();
      if (events.some((e) => e.op === 'snapProgress')) sendStatus(true);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/log') {
      // output from play-test sessions of the 2.0 plugin's predecessor
      const body = await readBody(req);
      studio.onLogs(body.logs);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/playtest/poll') {
      const body = await readBody(req);
      return json(res, 200, playtest.poll(body));
    }
    if (req.method === 'POST' && url.pathname === '/playtest/result') {
      playtest.result(await readBody(req));
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/agent') {
      // Claude, through the MCP server, with the secret key.
      if (!agent.checkToken(req.headers.authorization)) return json(res, 403, { error: 'Forbidden' });
      const body = await readBody(req);
      try {
        const result = await agent.call(String(body.tool || ''), body.args);
        return json(res, 200, { result });
      } catch (err) {
        return json(res, 200, { error: String(err && err.message || err) });
      }
    }

    if (req.method === 'POST' && url.pathname === '/bye') {
      if (client === bridge.activeClient) {
        bridge.activeClient = null;
        bridge.place = null;
        sendStatus(true);
        updateDiscord();
      }
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    json(res, 400, { error: String(err && err.message || err) });
  }
});

server.on('error', (err) => {
  bridge.serverError = err.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use (is Bloxcode already running?)`
    : String(err.message);
  sendStatus(true);
});

let wasConnected = false;
setInterval(() => {
  const now = isConnected();
  if (now !== wasConnected) { wasConnected = now; updateDiscord(); if (!now) lsp.stop(); }
  sendStatus();
}, 2000);

// ---------- core services ----------
const userData = app.getPath('userData');
const studio = createStudio({
  pushCommand: (cmd) => pushCommand(cmd),
  isConnected: () => isConnected(),
  getPlace: () => bridge.place,
  getPluginVersion: () => (isConnected() ? bridge.pluginVersion : 0),
});
studio.events.on('logs', (list) => sendEvents(list.map((l) => ({ op: 'log', ...l }))));
studio.events.on('logsCleared', () => sendEvents([{ op: 'logsCleared' }]));
studio.events.on('sourceChanged', ({ id, origin }) => { if (origin !== 'studio') send('history:changed', { id }); });

const search = createSearch(studio);
const history = createHistory({ userData, studio, placeKey });
const lsp = createLsp({ userData, studio, placeKey, emit: (channel, payload) => { send(channel, payload); if (channel === 'lsp:state') sendStatus(true); } });
const github = createGitHub({ userData, studio, placeKey, emit: (channel, payload) => send(channel, payload) });
const playtest = createPlaytest({ studio, emit: (e) => { send('playtest:state', e); sendStatus(true); } });

// ---------- test mode: Studio in front, a small floating window with Stop and the Output ----------
let testMode = true;
let hud = null;
let hudMode = 'play';
let focusStudioOnStart = false;
let testWasRunning = false;
let testStartSeq = 0;

function focusStudio() {
  try {
    if (isMac) {
      spawn('osascript', ['-e', 'tell application "RobloxStudio" to activate'], { stdio: 'ignore' });
    } else {
      const ps = "$p = Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }";
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
    }
  } catch (_) {}
}

function hudSend(channel, payload) { if (hud && !hud.isDestroyed()) hud.webContents.send(channel, payload); }

function openHud() {
  if (hud && !hud.isDestroyed()) { hud.showInactive(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  hud = new BrowserWindow({
    width: 400, height: 260, minWidth: 300, minHeight: 180,
    x: wa.x + wa.width - 420, y: wa.y + wa.height - 280,
    frame: false, alwaysOnTop: true, resizable: true, show: false, skipTaskbar: false,
    backgroundColor: '#11131f', title: 'Bloxcode · Play test', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  hud.setAlwaysOnTop(true, 'floating');
  hud.loadFile(path.join(__dirname, 'renderer', 'testhud.html'));
  hud.webContents.once('did-finish-load', () => {
    hudSend('hud:state', { running: true, mode: hudMode, since: Date.now(), reset: true });
    // the output of the test so far
    for (const l of studio.logs.filter((x) => x.seq > testStartSeq && x.context !== 'edit')) hudSend('hud:log', l);
    hud.showInactive();
    // Dev helper: BLOXCODE_HUD_SHOT=file.png saves a picture of this window.
    if (process.env.BLOXCODE_HUD_SHOT) setTimeout(async () => { try { fs.writeFileSync(process.env.BLOXCODE_HUD_SHOT, (await hud.webContents.capturePage()).toPNG()); } catch (_) {} }, 4500);
  });
  hud.on('closed', () => { hud = null; });
}

setInterval(() => {
  const running = playtest.isRunning();
  if (running === testWasRunning) return;
  testWasRunning = running;
  if (running) {
    testStartSeq = studio.logSeq - 20; // include what was printed while the test started
    if (testMode) {
      if (focusStudioOnStart) focusStudio();
      openHud();
    }
  } else {
    hudSend('hud:state', { running: false });
    if (testMode && focusStudioOnStart) focusWindow();
    focusStudioOnStart = false;
    setTimeout(() => { if (hud && !hud.isDestroyed() && !playtest.isRunning()) hud.close(); }, 4000);
  }
}, 400);

studio.events.on('logs', (list) => { if (hud) for (const l of list) if (l.context !== 'edit') hudSend('hud:log', l); });
ipcMain.on('hud:stop', () => playtest.stop());
ipcMain.on('hud:back', () => focusWindow());
ipcMain.on('hud:close', () => { if (hud && !hud.isDestroyed()) hud.close(); });
const discord = createDiscord({ onState: () => sendStatus(true) });

// ---------- review of Claude's changes ----------
let reviewClaude = false;
const reviews = new Map();
let reviewCounter = 0;
function review(changes, title) {
  if (!reviewClaude || !win || win.isDestroyed()) return Promise.resolve({ accepted: true });
  const reqId = 'v' + (++reviewCounter);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { reviews.delete(reqId); send('review:cancel', { reqId }); resolve({ accepted: false, note: 'The user did not answer within 15 minutes.' }); }, 15 * 60 * 1000);
    reviews.set(reqId, { resolve, timer });
    send('review:request', { reqId, title, changes });
    focusWindow();
  });
}
ipcMain.on('review:answer', (_e, { reqId, accepted, note }) => {
  const r = reviews.get(reqId);
  if (!r) return;
  reviews.delete(reqId);
  clearTimeout(r.timer);
  r.resolve({ accepted: !!accepted, note: note || '' });
});

async function editorState() {
  if (!win || win.isDestroyed()) return null;
  try { return await win.webContents.executeJavaScript('window.__editorState ? window.__editorState() : null'); } catch (_) { return null; }
}

// ---------- Claude (MCP) ----------
const agent = createAgent({
  studio, search, history, lsp, github, playtest, packages, userData, review, editorState,
  onActivity: (text) => {
    agentActivity = { text, time: Date.now() };
    sendEvents([{ op: 'agent', text }]);
    sendStatus(true);
    updateDiscord();
  },
});

let claudeState = { desktop: false, code: false };
function refreshClaudeState() {
  try { claudeState = claudeConnectionState(); } catch (_) {}
}

function mcpServerConfig() {
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'bloxcode-mcp.js')
    : path.join(__dirname, 'mcp', 'bloxcode-mcp.js');
  return {
    command: process.execPath,
    args: [script],
    env: { ELECTRON_RUN_AS_NODE: '1', BLOXCODE_PORT: String(PORT), BLOXCODE_KEY_FILE: agent.tokenFile },
  };
}

// ---------- in-app chat ----------
const chat = createChat({
  agent,
  mcpServerConfig,
  userData,
  emit: (event) => send('chat:event', event),
});

// ---------- Discord ----------
let discordFile = null;
function updateDiscord() {
  const recentClaude = agentActivity && Date.now() - agentActivity.time < 120000;
  discord.update({ file: discordFile, place: bridge.place && isConnected() ? bridge.place.name : null, connected: isConnected(), claude: recentClaude });
}

// ---------- Studio plugin install ----------
let pluginInstallInfo = { installed: false, path: null, error: null, updated: false };

function pluginSourcePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'studio-plugin', 'CodeBridge.lua')
    : path.join(__dirname, '..', 'studio-plugin', 'src', 'CodeBridge.lua');
}

function installPlugin() {
  try {
    const dir = robloxPluginsDir();
    const target = path.join(dir, 'BloxcodeBridge.lua');
    const src = fs.readFileSync(pluginSourcePath(), 'utf8');
    fs.mkdirSync(dir, { recursive: true });
    let current = null;
    try { current = fs.readFileSync(target, 'utf8'); } catch (_) {}
    const updated = current !== src;
    if (updated) fs.writeFileSync(target, src, 'utf8');
    pluginInstallInfo = { installed: true, path: target, error: null, updated };
  } catch (err) {
    pluginInstallInfo = { installed: false, path: null, error: String(err.message), updated: false };
  }
  return pluginInstallInfo;
}

// ---------- window ----------
// macOS needs an app menu for Cmd+C/V/Z/Q to work. Cmd+W, Cmd+P etc. stay free for the editor.
function setMacMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ]));
}

function createWindow(splash) {
  win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 880,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1e1e1e',
    title: 'Bloxcode',
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: 'hidden',
    // Windows draws its own min/max/close buttons; macOS keeps the traffic lights on the left.
    ...(isMac
      ? { trafficLightPosition: { x: 12, y: 10 } }
      : { titleBarOverlay: { color: '#1f1f1f', symbolColor: '#cccccc', height: 34 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (isMac) setMacMenu();
  else win.removeMenu();
  win.once('ready-to-show', () => {
    win.show();
    if (splash && !splash.isDestroyed()) splash.close();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    sendStatus(true);
    // Renderer starts with an empty tree – ask Studio for a fresh copy.
    if (isConnected()) pushCommand({ type: 'snapshot' });
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'r' && input.shift) win.reload();
  });
  win.on('closed', () => { win = null; });

  // Dev helper: print renderer errors to the terminal.
  if (process.env.BLOXCODE_SHOT || process.env.BLOXCODE_LOG_RENDERER) {
    win.webContents.on('console-message', (e) => {
      const level = e.level ?? e.params?.level;
      if (level === 'error' || level === 'warning' || level >= 2) console.log(`[renderer ${level}] ${e.message ?? e.params?.message} (${e.sourceId ?? ''}:${e.lineNumber ?? ''})`);
    });
  }

  // Dev helper: BLOXCODE_SHOT=path.png[|delayMs[|js]] saves a screenshot, then quits.
  if (process.env.BLOXCODE_SHOT) {
    const [file, delay, js] = process.env.BLOXCODE_SHOT.split('|');
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (js) { try { await win.webContents.executeJavaScript(js); } catch (e) { console.error(e); } await new Promise((r) => setTimeout(r, Number(process.env.BLOXCODE_SHOT_WAIT) || 700)); }
      const img = await win.webContents.capturePage();
      fs.writeFileSync(file, img.toPNG());
      app.quit();
    }, Number(delay) || 4000));
  }
}

// ---------- IPC ----------
const handle = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

ipcMain.on('bridge:command', (_e, cmd) => {
  if (!cmd || typeof cmd !== 'object') return;
  // Your own typing: keep the cache and history up to date.
  if (cmd.type === 'setSource') studio.noteSource(cmd.id, cmd.source, 'you');
  pushCommand(cmd);
});
handle('bridge:getStatus', () => statusPayload());
handle('plugin:install', () => { const r = installPlugin(); sendStatus(true); return r; });
handle('plugin:openFolder', () => shell.openPath(robloxPluginsDir()));
ipcMain.on('app:restartToUpdate', () => updater.restartToUpdate());
handle('packages:search', (query) => packages.search(String(query || '')));
handle('packages:install', async (spec) => {
  if (!isConnected()) throw new Error('Not connected to Roblox Studio.');
  const progress = (text) => send('packages:progress', { spec, text });
  const { command, summary } = await packages.buildInstall(String(spec), progress);
  progress(`Adding ${summary.name} to Studio…`);
  pushCommand(command);
  return summary;
});
handle('claude:connect', () => {
  const r = connectClaude(mcpServerConfig());
  refreshClaudeState();
  sendStatus(true);
  return r;
});
handle('chat:state', () => chat.state());
handle('chat:detect', () => chat.detectClaudeCode());
handle('chat:setMode', (mode) => chat.setMode(mode));
handle('chat:saveKey', (key) => chat.setApiKey(key));
handle('chat:clearKey', () => chat.clearApiKey());
handle('chat:send', (text) => chat.send(text));
ipcMain.on('chat:stop', () => chat.stop());
ipcMain.on('chat:reset', () => chat.reset());
ipcMain.on('chat:install', () => chat.openInstallTerminal());
ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('window:titleColor', (_e, colors) => {
  if (isMac) return;
  try { win && win.setTitleBarOverlay(colors); } catch (_) {}
});

// settings that the main process needs
ipcMain.on('settings:apply', (_e, s) => {
  if (!s || typeof s !== 'object') return;
  if ('lsp' in s) lsp.setEnabled(!!s.lsp);
  if ('reviewClaude' in s) reviewClaude = !!s.reviewClaude;
  if ('testMode' in s) testMode = !!s.testMode;
  if ('discord' in s) discord.setEnabled(!!s.discord, s.discordOptions);
  updateDiscord();
});
ipcMain.on('discord:file', (_e, file) => { discordFile = file ? String(file).slice(0, 100) : null; updateDiscord(); });

// search, replace, history
handle('search:run', (opts) => search.search(opts || {}, (done, total) => send('search:progress', { done, total })));
handle('search:replace', (opts) => search.replace(opts || {}, 'replace'));
handle('history:list', (scriptPath) => history.list(String(scriptPath)));
handle('history:get', (scriptPath, index) => history.get(String(scriptPath), Number(index)));
handle('history:restore', async (id, index) => {
  const p = studio.pathOf(id);
  const source = history.get(p, Number(index));
  await studio.writeSource(id, source, 'restore');
  return source;
});
handle('sources:get', (id) => studio.readSource(String(id)));
ipcMain.on('history:record', (_e, id, source) => { if (studio.isScript(id)) history.record(studio.pathOf(id), String(source), 'you'); });

// properties
handle('props:get', (id) => studio.ask({ type: 'getProperties', id }));
handle('props:set', (id, properties, attributes) => studio.ask({ type: 'setProperties', id, properties, attributes }));
handle('props:tags', (id, addTags, removeTags) => studio.ask({ type: 'setProperties', id, addTags, removeTags }));

// language server
handle('lsp:call', (kind, id, line, col, extra) => lsp.call(kind, id, line, col, extra));
handle('lsp:symbols', (id) => lsp.symbols(id));
handle('lsp:diagnostics', () => lsp.allDiagnostics());
handle('lsp:applyRename', async (sources) => studio.writeSources(sources, 'Rename symbol', 'you'));
ipcMain.on('lsp:text', (_e, id, text) => lsp.updateText(id, String(text)));
handle('lsp:restart', async () => { lsp.stop(); await lsp.start(); return lsp.getState(); });

// output
ipcMain.on('output:clear', () => studio.clearLogs());
handle('output:all', () => studio.logs);

// play tests
handle('playtest:start', (mode, fromButton) => { hudMode = mode === 'run' ? 'run' : 'play'; focusStudioOnStart = !!fromButton; return playtest.start(mode); });
handle('playtest:stop', () => playtest.stop());

// GitHub
handle('github:state', () => github.state());
handle('github:token', (t) => github.signInWithToken(t));
handle('github:device', () => github.startDeviceFlow());
handle('github:signOut', () => github.signOut());
handle('github:create', (opts) => github.createRepo(opts || {}));
handle('github:link', (full) => github.linkRepo(full));
handle('github:unlink', () => github.unlink());
handle('github:repos', () => github.repos());
handle('github:status', () => github.status());
handle('github:publish', (message) => github.publish(message));

// themes
handle('theme:export', async (theme) => {
  const r = await dialog.showSaveDialog(win, { title: 'Export theme', defaultPath: `${String(theme.name || 'theme').replace(/[^\w-]+/g, '-')}.bloxcode-theme.json`, filters: [{ name: 'Bloxcode theme', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(theme, null, 2));
  return true;
});
handle('theme:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import theme', properties: ['openFile'], filters: [{ name: 'Bloxcode theme', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusWindow());
  app.whenReady().then(async () => {
    const splash = await updater.runStartupUpdate();
    installPlugin();
    refreshClaudeState();
    server.listen(PORT, '127.0.0.1');
    createWindow(splash);
    updater.startBackgroundChecks((version) => {
      updateReady = version;
      sendStatus(true);
    });
  });
  app.on('window-all-closed', () => { history.flush(); lsp.stop(); app.quit(); });
}
