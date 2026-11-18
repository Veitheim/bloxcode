const { contextBridge, ipcRenderer } = require('electron');

// Channels the editor may use. Everything else is refused.
const INVOKE = new Set([
  'search:run', 'search:replace', 'history:list', 'history:get', 'history:restore', 'sources:get',
  'props:get', 'props:set', 'props:tags',
  'lsp:call', 'lsp:symbols', 'lsp:diagnostics', 'lsp:applyRename', 'lsp:restart',
  'output:all', 'playtest:start', 'playtest:stop',
  'github:state', 'github:token', 'github:device', 'github:signOut', 'github:create', 'github:link', 'github:unlink', 'github:repos', 'github:status', 'github:publish',
  'theme:export', 'theme:import',
]);
const SEND = new Set(['hud:stop', 'hud:back', 'hud:close', 'history:record', 'settings:apply', 'discord:file', 'lsp:text', 'output:clear', 'review:answer', 'window:titleColor']);
const ON = new Set(['hud:state', 'hud:log', 'lsp:state', 'lsp:diagnostics', 'search:progress', 'history:changed', 'playtest:state', 'github:state', 'github:error', 'review:request', 'review:cancel']);

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
  invoke: (channel, ...args) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error('Not allowed: ' + channel));
    return ipcRenderer.invoke(channel, ...args);
  },
  post: (channel, ...args) => { if (SEND.has(channel)) ipcRenderer.send(channel, ...args); },
  on: (channel, cb) => { if (ON.has(channel)) ipcRenderer.on(channel, (_e, payload) => cb(payload)); },
});
