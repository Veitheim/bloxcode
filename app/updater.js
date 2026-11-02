// Discord-style updater: a splash window checks for updates on startup,
// downloads and installs them, then restarts Bloxcode. While the app runs,
// it checks again every few hours and offers a restart when an update is ready.

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const CHECK_TIMEOUT_MS = 10000;
const BACKGROUND_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MIN_SPLASH_MS = 1200;
// macOS builds are not code-signed, so they can't install updates themselves.
// They check the feed and point the user to the new download instead.
const IS_MAC = process.platform === 'darwin';
const MAC_DOWNLOAD_URL = 'https://bloxcode-docs.seidl.workers.dev/download/mac';

// BLOXCODE_UPDATE_TEST=<fakeVersion> runs the updater in dev against the live feed,
// pretending to be <fakeVersion>. It downloads but never installs.
const TEST_VERSION = process.env.BLOXCODE_UPDATE_TEST || null;

let autoUpdater = null;
function getUpdater() {
  if (!autoUpdater) {
    // electron-updater reads the app version when it loads, so fake it before that.
    if (TEST_VERSION) app.setVersion(TEST_VERSION);
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
    if (TEST_VERSION) {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.updateConfigPath = path.join(__dirname, '..', 'dev-app-update.yml');
    }
  }
  return autoUpdater;
}

function updatesEnabled() {
  return app.isPackaged || !!TEST_VERSION;
}

function createSplash() {
  const splash = new BrowserWindow({
    width: 300,
    height: 340,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    center: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: 'Bloxcode',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function setSplash(splash, text, percent) {
  if (TEST_VERSION) console.log(`[splash] ${text}${typeof percent === 'number' ? ` (${Math.round(percent)}%)` : ''}`);
  if (!splash || splash.isDestroyed()) return;
  const js = `window.setStatus && window.setStatus(${JSON.stringify(text)}, ${typeof percent === 'number' ? percent : 'undefined'})`;
  splash.webContents.executeJavaScript(js).catch(() => {});
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))]);
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * Shows the splash and handles a pending update.
 * Resolves with the splash window once the app should continue starting
 * (no update, offline, or error). Never resolves if an update is being installed.
 */
async function runStartupUpdate() {
  const splash = createSplash();
  const started = Date.now();
  await new Promise((r) => splash.webContents.once('did-finish-load', r));
  splash.webContents.executeJavaScript(`window.setVersion(${JSON.stringify(app.getVersion())})`).catch(() => {});

  if (updatesEnabled() && !IS_MAC) {
    const updater = getUpdater();
    setSplash(splash, 'Checking for updates…');
    try {
      const result = await withTimeout(updater.checkForUpdates(), CHECK_TIMEOUT_MS);
      const available = result && result !== 'timeout' && result.isUpdateAvailable;
      if (result === 'timeout') {
        setSplash(splash, 'Update server not responding. Starting…');
      } else if (available) {
        const version = result.updateInfo.version;
        setSplash(splash, `Downloading update v${version}…`, 0);
        updater.on('download-progress', (p) => {
          setSplash(splash, `Downloading update v${version} · ${formatMB(p.transferred)} / ${formatMB(p.total)} MB`, p.percent);
        });
        await updater.downloadUpdate();
        if (TEST_VERSION) {
          setSplash(splash, `Update v${version} downloaded (test mode, not installing)`, 100);
          await new Promise((r) => setTimeout(r, 2500));
        } else {
          setSplash(splash, 'Installing update…', 100);
          await new Promise((r) => setTimeout(r, 700));
          // Silent install, then relaunch Bloxcode.
          updater.quitAndInstall(true, true);
          return new Promise(() => {});
        }
      } else {
        setSplash(splash, 'You are up to date. Starting…');
      }
    } catch (err) {
      console.error('[updater]', err && err.message);
      setSplash(splash, 'Could not check for updates. Starting…');
    }
  } else {
    setSplash(splash, 'Starting…');
  }

  const elapsed = Date.now() - started;
  if (elapsed < MIN_SPLASH_MS) await new Promise((r) => setTimeout(r, MIN_SPLASH_MS - elapsed));
  return splash;
}

/** macOS: checks now and every few hours. onAvailable(version) fires when a newer version is out. */
function startMacChecks(onAvailable) {
  const updater = getUpdater();
  const check = async () => {
    try {
      const result = await updater.checkForUpdates();
      if (result && result.isUpdateAvailable) onAvailable(result.updateInfo.version);
    } catch (_) { /* offline – try again later */ }
  };
  check();
  setInterval(check, BACKGROUND_INTERVAL_MS);
}

/** Background checks while the app is open. onReady(version) fires when an update is downloaded (Windows)
 *  or found (macOS). */
function startBackgroundChecks(onReady) {
  if (!updatesEnabled()) return;
  if (IS_MAC) return startMacChecks(onReady);
  if (TEST_VERSION) return;
  const updater = getUpdater();
  updater.on('update-downloaded', (info) => onReady(info.version));
  const check = async () => {
    try {
      const result = await updater.checkForUpdates();
      if (result && result.isUpdateAvailable) await updater.downloadUpdate();
    } catch (_) { /* offline – try again later */ }
  };
  setInterval(check, BACKGROUND_INTERVAL_MS);
}

function restartToUpdate() {
  if (IS_MAC) { shell.openExternal(MAC_DOWNLOAD_URL); return; }
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall(true, true);
}

module.exports = { runStartupUpdate, startBackgroundChecks, restartToUpdate };
