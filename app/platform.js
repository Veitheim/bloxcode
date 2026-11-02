// Paths that differ between Windows and macOS.

const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';
const home = os.homedir();

/** Folder where Roblox Studio loads local plugins from. */
function robloxPluginsDir() {
  if (isMac) return path.join(home, 'Documents', 'Roblox', 'Plugins');
  return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins');
}

/** Folder where Claude Desktop (and other Electron apps) keep their settings. */
function appDataDir() {
  if (isMac) return path.join(home, 'Library', 'Application Support');
  return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
}

module.exports = { isMac, robloxPluginsDir, appDataDir };
