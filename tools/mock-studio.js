// Simulates the Roblox Studio plugin (protocol v3) for testing Bloxcode without Studio.
// Usage: node tools/mock-studio.js   (BLOXCODE_PORT=34999 for a dev copy)
const http = require('http');

const PORT = Number(process.env.BLOXCODE_PORT || 34872);
const client = 'mock-' + Math.random().toString(36).slice(2);
let nextId = 0;
const nodes = new Map();
const props = new Map(); // id -> { prop: value }
const history = []; // undo stack of { undo(), redo() }
const redoStack = [];

function add(name, cls, parent, source) {
  const id = String(++nextId);
  nodes.set(id, { id, name, cls, parent, source });
  return id;
}
const ws = add('Workspace', 'Workspace');
const base = add('Baseplate', 'Part', ws);
props.set(add('Lava', 'Part', ws) + ':tags', ['Damage']);
props.set(base + ':attr', { Spawn: true });
props.set(base, { Anchored: true, Size: { type: 'Vector3', value: [512, 20, 512] }, Color: { type: 'Color3', value: [91, 93, 105] }, Material: { type: 'Enum', value: 'Enum.Material.Plastic' }, Transparency: 0 });
add('SpawnLocation', 'SpawnLocation', ws);
const map = add('Map', 'Model', ws);
for (let i = 1; i <= 5; i++) add('Tree' + i, 'MeshPart', map);
add('Players', 'Players');
add('Lighting', 'Lighting');
const rf = add('ReplicatedFirst', 'ReplicatedFirst');
add('LoadingScreen', 'LocalScript', rf, 'local ReplicatedFirst = game:GetService("ReplicatedFirst")\nReplicatedFirst:RemoveDefaultLoadingScreen()\n');
const rs = add('ReplicatedStorage', 'ReplicatedStorage');
const remotes = add('Remotes', 'Folder', rs);
add('BuyItem', 'RemoteEvent', remotes);
add('GetCoins', 'RemoteFunction', remotes);
const shared = add('Shared', 'Folder', rs);
add('Util', 'ModuleScript', shared, 'local Util = {}\n\nfunction Util.round(n: number, step: number): number\n\treturn math.floor(n / step + 0.5) * step\nend\n\nreturn Util\n');
const sss = add('ServerScriptService', 'ServerScriptService');
add('Main', 'Script', sss, [
  '--!strict',
  'local Players = game:GetService("Players")',
  'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
  '',
  'local Remotes = ReplicatedStorage:WaitForChild("Remotes")',
  'local Util = require(ReplicatedStorage.Shared.Util)',
  '',
  '-- Give every player starting coins when they join',
  'Players.PlayerAdded:Connect(function(player: Player)',
  '\tlocal leaderstats = Instance.new("Folder")',
  '\tleaderstats.Name = "leaderstats"',
  '\tleaderstats.Parent = player',
  '',
  '\tlocal coins = Instance.new("IntValue")',
  '\tcoins.Name = "Coins"',
  '\tcoins.Value = Util.round(100.4, 1)',
  '\tcoins.Parent = leaderstats',
  '\tprint(`Welcome {player.Name}!`)',
  'end)',
  '',
  'Remotes.BuyItem.OnServerEvent:Connect(function(player, itemId)',
  '\twarn("Purchase:", player, itemId)',
  'end)',
  '',
].join('\n'));
add('DataService', 'ModuleScript', sss, 'local DataService = {}\n\nfunction DataService.load(player)\n\treturn { coins = 0 }\nend\n\nreturn DataService\n');
add('ServerStorage', 'ServerStorage');
const sg = add('StarterGui', 'StarterGui');
const hud = add('HUD', 'ScreenGui', sg);
add('CoinLabel', 'TextLabel', hud);
add('HUDController', 'LocalScript', hud, 'local Players = game:GetService("Players")\nlocal player = Players.LocalPlayer\n\nprint("HUD ready for", player.Name)\n');
add('StarterPack', 'StarterPack');
const sp = add('StarterPlayer', 'StarterPlayer');
const sps = add('StarterPlayerScripts', 'StarterPlayerScripts', sp);
add('CameraController', 'LocalScript', sps, 'local cam = workspace.CurrentCamera\n');
add('StarterCharacterScripts', 'StarterCharacterScripts', sp);
add('Teams', 'Teams');
add('SoundService', 'SoundService');

// Like Roblox's HttpService: plain JSON requests, no browser headers.
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers: { Host: `localhost:${PORT}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    });
    r.on('error', reject);
    r.end(data || undefined);
  });
}
const row = (n) => [n.id, n.name, n.cls, n.parent];
const ev = (n) => ({ op: 'add', id: n.id, name: n.name, cls: n.cls, parent: n.parent });
const send = (events) => req('POST', '/events?client=' + client, { events });
const pathOf = (id) => { const p = []; let n = nodes.get(id); while (n) { p.unshift(n.name); n = nodes.get(n.parent); } return p.join('.'); };
const log = (message, kind = 'MessageOutput', context = 'edit') => send([{ op: 'log', message, kind, context }]);

async function snapshot() {
  const all = [...nodes.values()];
  await send([{ op: 'reset' }, { op: 'snap', nodes: all.map(row) }, { op: 'snapProgress', done: all.length, total: all.length }]);
}

function remember(undo, redo) { history.push({ undo, redo }); redoStack.length = 0; }

async function setSource(id, source) {
  const n = nodes.get(id);
  const before = n.source;
  n.source = source;
  remember(() => { n.source = before; return send([{ op: 'source', id, source: before }]); }, () => { n.source = source; return send([{ op: 'source', id, source }]); });
}

function deleteSubtree(id) {
  for (const c of [...nodes.values()].filter((x) => x.parent === id)) deleteSubtree(c.id);
  nodes.delete(id);
}

// ---------- fake play test (what the play-test copies of the plugin do) ----------
let playtest = null;
async function runPlaytest(mode) {
  playtest = { mode, stop: false };
  const contexts = mode === 'run' ? ['server'] : ['server', 'client'];
  let t = 0;
  while (!playtest.stop && t < 600) {
    for (const context of contexts) {
      const logs = [];
      if (t === 2 && context === 'server') logs.push({ message: 'Welcome Player1!', kind: 'MessageOutput', context });
      if (t === 3 && context === 'server') logs.push({ message: 'ServerScriptService.Main:21: attempt to index nil with \'OnServerEvent\'', kind: 'MessageError', context }, { message: 'Stack Begin', kind: 'MessageInfo', context }, { message: "Script 'ServerScriptService.Main', Line 21", kind: 'MessageInfo', context });
      if (t === 3 && context === 'client') logs.push({ message: 'HUD ready for Player1', kind: 'MessageOutput', context });
      const r = await req('POST', '/playtest/poll', { context, logs }).catch(() => null);
      if (!r) continue;
      for (const job of r.run || []) {
        let ok = true, result = '', output = [];
        if (/error\(/.test(job.code)) { ok = false; result = 'run_code:1: boom'; }
        else { output = [`(${context}) ran ${job.code.length} chars`]; result = context === 'server' ? '1 player' : 'Player1'; }
        await req('POST', '/playtest/result', { reqId: job.reqId, ok, result, output, context });
      }
      if (r.stop && context === 'server') playtest.stop = true;
    }
    await new Promise((res) => setTimeout(res, 400));
    t++;
  }
  playtest = null;
  await send([{ op: 'playtest', state: 'ended', ok: true, result: 'Stopped by Bloxcode' }]);
}

async function handle(cmd) {
  let result = null, error = null;
  try { result = await run(cmd); } catch (e) { error = e.message; }
  if (cmd.reqId) await send([{ op: 'reply', reqId: cmd.reqId, ok: !error, error, result }]);
  else if (error) await send([{ op: 'error', message: error }]);
}

async function run(cmd) {
  console.log('[cmd]', cmd.type, cmd.id || '', cmd.className || '', cmd.name || '');
  const n = nodes.get(cmd.id);
  if (cmd.id && !n) throw new Error('Instance not found.');
  switch (cmd.type) {
    case 'snapshot': return snapshot();
    case 'read': return { source: n.source || '', path: pathOf(n.id), className: n.cls };
    case 'readMany': { const out = {}; for (const id of cmd.ids || []) { const x = nodes.get(id); if (x && x.source !== undefined) out[id] = x.source; } return out; }
    case 'setSource': await setSource(n.id, cmd.source); return null;
    case 'setSources': {
      let changed = 0;
      for (const [id, src] of Object.entries(cmd.sources || {})) { if (nodes.has(id)) { nodes.get(id).source = src; changed++; } }
      return { changed };
    }
    case 'search': {
      const q = cmd.query.toLowerCase(); const matches = [];
      for (const x of nodes.values()) if (x.source) x.source.split('\n').forEach((l, i) => { if (l.toLowerCase().includes(q)) matches.push({ id: x.id, path: pathOf(x.id), line: i + 1, text: l }); });
      return { matches, truncated: false };
    }
    case 'selection': { const m = [...nodes.values()].find((x) => x.name === 'Main'); return [{ id: m.id, path: pathOf(m.id), className: m.cls }]; }
    case 'setSelection': return { selected: (cmd.ids || []).length };
    case 'getProperties': return { path: pathOf(n.id), className: n.cls, properties: { Name: n.name, Archivable: true, ...(props.get(n.id) || {}) }, attributes: (props.get(n.id + ':attr') || {}), tags: props.get(n.id + ':tags') || [] };
    case 'setProperties': {
      const p = props.get(n.id) || {};
      for (const [k, v] of Object.entries(cmd.properties || {})) { if (k === 'Name') { n.name = v; await send([{ op: 'rename', id: n.id, name: v }]); } else p[k] = v; }
      props.set(n.id, p);
      const a = props.get(n.id + ':attr') || {};
      for (const [k, v] of Object.entries(cmd.attributes || {})) { if (v && v.type === 'nil') delete a[k]; else a[k] = v; }
      props.set(n.id + ':attr', a);
      const tags = new Set(props.get(n.id + ':tags') || []);
      (cmd.addTags || []).forEach((x) => tags.add(x)); (cmd.removeTags || []).forEach((x) => tags.delete(x));
      props.set(n.id + ':tags', [...tags]);
      return null;
    }
    case 'open': await send([{ op: 'open', id: n.id, name: n.name, cls: n.cls, source: n.source || '', agent: cmd.agent }]); return null;
    case 'closed': return null;
    case 'create': {
      const src = { Script: 'print("Hello world!")\n', LocalScript: 'print("Hello world!")\n', ModuleScript: 'local module = {}\n\nreturn module\n' }[cmd.className];
      if (!nodes.has(cmd.parentId)) throw new Error('Target not found.');
      const source = cmd.source ?? src;
      const id = add(cmd.name, cmd.className, cmd.parentId, source);
      if (cmd.properties) props.set(id, cmd.properties);
      const c = nodes.get(id);
      remember(() => { nodes.delete(id); return send([{ op: 'remove', id }]); }, () => { nodes.set(id, c); return send([ev(c)]); });
      const out = [ev(c), { op: 'created', id, parent: cmd.parentId, agent: cmd.agent }];
      if (source != null) out.push({ op: 'open', id, name: c.name, cls: c.cls, source, agent: cmd.agent });
      await send(out);
      return { id, path: pathOf(id) };
    }
    case 'createTree': {
      const out = [];
      let count = 0;
      const build = (spec, parent) => {
        const id = add(spec.name || spec.class, spec.class, parent, spec.source);
        if (spec.properties) props.set(id, spec.properties);
        if (spec.tags) props.set(id + ':tags', spec.tags);
        if (spec.attributes) props.set(id + ':attr', spec.attributes);
        out.push(ev(nodes.get(id)));
        count++;
        (spec.children || []).forEach((c) => build(c, id));
        return id;
      };
      const rootId = build(cmd.tree, cmd.parentId);
      await send(out);
      return { id: rootId, path: pathOf(rootId), count };
    }
    case 'scanTags': {
      const tags = {}, attributes = {};
      for (const x of nodes.values()) {
        for (const tag of props.get(x.id + ':tags') || []) (tags[tag] = tags[tag] || []).push({ id: x.id, path: pathOf(x.id), className: x.cls });
        for (const [k, v] of Object.entries(props.get(x.id + ':attr') || {})) (attributes[k] = attributes[k] || []).push({ id: x.id, path: pathOf(x.id), className: x.cls, value: v });
      }
      return { tags, attributes };
    }
    case 'insertAsset': {
      const id = add('Asset' + cmd.assetId, 'Model', cmd.parentId || ws);
      await send([ev(nodes.get(id))]);
      return [{ id, path: pathOf(id), className: 'Model' }];
    }
    case 'rename': n.name = cmd.name; await send([{ op: 'rename', id: n.id, name: n.name }]); return null;
    case 'move': n.parent = cmd.parentId; await send([{ op: 'move', id: n.id, parent: n.parent }]); return null;
    case 'duplicate': { const id = add(n.name, n.cls, n.parent, n.source); await send([ev(nodes.get(id))]); return null; }
    case 'delete': deleteSubtree(n.id); await send([{ op: 'remove', id: n.id }]); return null;
    case 'select': return null;
    case 'undo': { const h = history.pop(); if (h) { await h.undo(); redoStack.push(h); } return null; }
    case 'redo': { const h = redoStack.pop(); if (h) { await h.redo(); history.push(h); } return null; }
    case 'runCode': {
      if (/error\(/.test(cmd.code)) return { ok: false, result: 'run_code:1: boom', output: [] };
      return { ok: true, result: String(nodes.size), output: ['(edit) hello from run_code'] };
    }
    case 'startPlaytest': {
      if (playtest) throw new Error('A play test started by Bloxcode is already running.');
      setTimeout(() => runPlaytest(cmd.mode), 300);
      return { started: true };
    }
    case 'wallyInstall': {
      const out = [];
      const build = (node, parent) => {
        const id = add(node.n, node.c, parent, node.s);
        out.push(ev(nodes.get(id)));
        (node.ch || []).forEach((c) => build(c, id));
        return id;
      };
      const service = [...nodes.values()].find((x) => x.cls === (cmd.realm === 'server' ? 'ServerScriptService' : 'ReplicatedStorage'));
      const folderName = cmd.realm === 'server' ? 'ServerPackages' : 'Packages';
      let folder = [...nodes.values()].find((x) => x.parent === service.id && x.name === folderName);
      if (!folder) { folder = nodes.get(add(folderName, 'Folder', service.id)); out.push(ev(folder)); }
      let index = [...nodes.values()].find((x) => x.parent === folder.id && x.name === '_Index');
      if (!index) { index = nodes.get(add('_Index', 'Folder', folder.id)); out.push(ev(index)); }
      cmd.entries.forEach((e) => build(e.node, index.id));
      build(cmd.link, folder.id);
      console.log('[wally] installed', cmd.label, out.length, 'instances');
      await send(out);
      return null;
    }
    default: return null;
  }
}

(async () => {
  await req('POST', '/hello', { clientId: client, placeName: 'My Obby', placeId: 0, pluginVersion: 4 });
  await snapshot();
  console.log('connected');
  setTimeout(() => log('Bloxcode mock Studio ready'), 500);
  if (!process.env.MOCK_NO_OPEN) {
    setTimeout(() => {
      const main = [...nodes.values()].find((x) => x.name === 'Main');
      send([{ op: 'open', id: main.id, name: main.name, cls: main.cls, source: main.source, focus: true }]);
    }, 1500);
  }
  for (;;) {
    const r = await req('GET', '/poll?client=' + client);
    if (!r.active) { console.log('inactive'); break; }
    for (const c of r.commands) await handle(c);
  }
})().catch((e) => { console.error(e); process.exit(1); });
