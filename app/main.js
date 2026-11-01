// Bloxcode – Electron main process.
// Runs a small HTTP server on localhost that the Roblox Studio plugin talks to,
// and forwards everything to the editor window over IPC.

const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updater = require('./updater');
const packages = require('./packages');

// BLOXCODE_PORT lets a dev copy run next to an installed Bloxcode (the plugin always uses 34872).
const PORT = Number(process.env.BLOXCODE_PORT) || 34872;
// A dev copy on another port also gets its own profile, so it doesn't collide with the installed app.
if (process.env.BLOXCODE_PORT) app.setPath('userData', path.join(app.getPath('appData'), 'bloxcode-dev'));
const POLL_HOLD_MS = 10000;
const CONNECTED_TIMEOUT_MS = 15000;

let win = null;
let updateReady = null; // version string once an update was downloaded in the background

// ---------- bridge state ----------
const bridge = {
  session: crypto.randomUUID(),
  activeClient: null,
  place: null,
  lastSeen: 0,
  queue: [],
  waiter: null, // { res, timer }
  serverError: null,
};

function isConnected() {
  return !!bridge.activeClient && Date.now() - bridge.lastSeen < CONNECTED_TIMEOUT_MS;
}

function statusPayload() {
  return {
    connected: isConnected(),
    place: bridge.place,
    port: PORT,
    serverError: bridge.serverError,
    plugin: pluginInstallInfo,
    version: app.getVersion(),
    updateReady,
  };
}

let lastStatusJson = '';
function sendStatus(force) {
  const json = JSON.stringify(statusPayload());
  if (!force && json === lastStatusJson) return;
  lastStatusJson = json;
  if (win && !win.isDestroyed()) win.webContents.send('bridge:status', JSON.parse(json));
}

function sendEvents(events) {
  if (win && !win.isDestroyed() && events.length) win.webContents.send('bridge:events', events);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const client = url.searchParams.get('client');
  try {
    if (req.method === 'GET' && url.pathname === '/ping') {
      return json(res, 200, { app: 'bloxcode', session: bridge.session });
    }

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
      sendEvents([{ op: 'reset' }]);
      sendStatus(true);
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
      const events = Array.isArray(body.events) ? body.events : [];
      sendEvents(events);
      if (events.some((e) => e.op === 'open' && e.focus)) focusWindow();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/bye') {
      if (client === bridge.activeClient) {
        bridge.activeClient = null;
        bridge.place = null;
        sendStatus(true);
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

setInterval(() => sendStatus(), 2000);

// ---------- Studio plugin install ----------
let pluginInstallInfo = { installed: false, path: null, error: null, updated: false };

function pluginSourcePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'studio-plugin', 'CodeBridge.lua')
    : path.join(__dirname, '..', 'studio-plugin', 'src', 'CodeBridge.lua');
}

function installPlugin() {
  try {
    const dir = path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'Plugins');
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
    titleBarOverlay: { color: '#1f1f1f', symbolColor: '#cccccc', height: 34 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
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
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'r' && input.shift) win.reload();
  });
  win.on('closed', () => { win = null; });

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

ipcMain.on('bridge:command', (_e, cmd) => {
  if (cmd && typeof cmd === 'object') pushCommand(cmd);
});
ipcMain.handle('bridge:getStatus', () => statusPayload());
ipcMain.handle('plugin:install', () => { const r = installPlugin(); sendStatus(true); return r; });
ipcMain.handle('plugin:openFolder', () => {
  const dir = path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'Plugins');
  return shell.openPath(dir);
});
ipcMain.on('app:restartToUpdate', () => updater.restartToUpdate());
ipcMain.handle('packages:search', (_e, query) => packages.search(String(query || '')));
ipcMain.handle('packages:install', async (_e, spec) => {
  if (!isConnected()) throw new Error('Not connected to Roblox Studio.');
  const progress = (text) => win && !win.isDestroyed() && win.webContents.send('packages:progress', { spec, text });
  const { command, summary } = await packages.buildInstall(String(spec), progress);
  progress(`Adding ${summary.name} to Studio…`);
  pushCommand(command);
  return summary;
});
ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('window:titleColor', (_e, colors) => {
  try { win && win.setTitleBarOverlay(colors); } catch (_) {}
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusWindow());
  app.whenReady().then(async () => {
    const splash = await updater.runStartupUpdate();
    installPlugin();
    server.listen(PORT, '127.0.0.1');
    createWindow(splash);
    updater.startBackgroundChecks((version) => {
      updateReady = version;
      sendStatus(true);
    });
  });
  app.on('window-all-closed', () => app.quit());
}
