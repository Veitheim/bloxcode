const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  send: (cmd) => ipcRenderer.send('bridge:command', cmd),
  onEvents: (cb) => ipcRenderer.on('bridge:events', (_e, events) => cb(events)),
  onStatus: (cb) => ipcRenderer.on('bridge:status', (_e, status) => cb(status)),
  getStatus: () => ipcRenderer.invoke('bridge:getStatus'),
  installPlugin: () => ipcRenderer.invoke('plugin:install'),
  openPluginFolder: () => ipcRenderer.invoke('plugin:openFolder'),
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  restartToUpdate: () => ipcRenderer.send('app:restartToUpdate'),
  searchPackages: (query) => ipcRenderer.invoke('packages:search', query),
  installPackage: (spec) => ipcRenderer.invoke('packages:install', spec),
  onPackageProgress: (cb) => ipcRenderer.on('packages:progress', (_e, p) => cb(p)),
});
