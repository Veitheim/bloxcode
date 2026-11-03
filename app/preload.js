const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  platform: process.platform,
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
  connectClaude: () => ipcRenderer.invoke('claude:connect'),
  chat: {
    state: () => ipcRenderer.invoke('chat:state'),
    detect: () => ipcRenderer.invoke('chat:detect'),
    setMode: (mode) => ipcRenderer.invoke('chat:setMode', mode),
    saveKey: (key) => ipcRenderer.invoke('chat:saveKey', key),
    clearKey: () => ipcRenderer.invoke('chat:clearKey'),
    send: (text) => ipcRenderer.invoke('chat:send', text),
    stop: () => ipcRenderer.send('chat:stop'),
    reset: () => ipcRenderer.send('chat:reset'),
    install: () => ipcRenderer.send('chat:install'),
    onEvent: (cb) => ipcRenderer.on('chat:event', (_e, ev) => cb(ev)),
  },
});
