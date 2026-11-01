// Simulates the Roblox Studio plugin for testing Bloxcode without Studio.
// Usage: node tools/mock-studio.js
const BASE = 'http://127.0.0.1:' + (process.env.BLOXCODE_PORT || 34872);
const client = 'mock-' + Math.random().toString(36).slice(2);
let session = null;
let nextId = 0;
const nodes = new Map();

function add(name, cls, parent, source) {
  const id = String(++nextId);
  nodes.set(id, { id, name, cls, parent, source });
  return id;
}
const ws = add('Workspace', 'Workspace');
add('Baseplate', 'Part', ws);
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
add('DataService', 'ModuleScript', sss, 'local DataService = {}\n\nreturn DataService\n');
add('ServerStorage', 'ServerStorage');
const sg = add('StarterGui', 'StarterGui');
const hud = add('HUD', 'ScreenGui', sg);
add('CoinLabel', 'TextLabel', hud);
add('HUDController', 'LocalScript', hud, 'print("HUD")\n');
add('StarterPack', 'StarterPack');
const sp = add('StarterPlayer', 'StarterPlayer');
const sps = add('StarterPlayerScripts', 'StarterPlayerScripts', sp);
add('CameraController', 'LocalScript', sps, 'local cam = workspace.CurrentCamera\n');
add('StarterCharacterScripts', 'StarterCharacterScripts', sp);
add('Teams', 'Teams');
add('SoundService', 'SoundService');

async function req(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const ev = (n) => ({ op: 'add', id: n.id, name: n.name, cls: n.cls, parent: n.parent });
const send = (events) => req('POST', '/events?client=' + client, { events });

async function snapshot() {
  await send([{ op: 'reset' }, ...[...nodes.values()].map(ev)]);
}

const pathOf = (id) => { const p = []; let n = nodes.get(id); while (n) { p.unshift(n.name); n = nodes.get(n.parent); } return p.join('.'); };
const props = new Map(); // id -> { prop: value }

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
    case 'read': return { source: n.source || '', path: pathOf(n.id), className: n.cls };
    case 'search': {
      const q = cmd.query.toLowerCase(); const matches = [];
      for (const x of nodes.values()) if (x.source) x.source.split('\n').forEach((l, i) => { if (l.toLowerCase().includes(q)) matches.push({ id: x.id, path: pathOf(x.id), line: i + 1, text: l }); });
      return { matches, truncated: false };
    }
    case 'selection': { const m = [...nodes.values()].find((x) => x.name === 'Main'); return [{ id: m.id, path: pathOf(m.id), className: m.cls }]; }
    case 'getProperties': return { path: pathOf(n.id), className: n.cls, properties: { Name: n.name, ...(props.get(n.id) || {}) }, attributes: {}, tags: [] };
    case 'setProperties': props.set(n.id, { ...(props.get(n.id) || {}), ...(cmd.properties || {}) }); return null;
    case 'snapshot': return snapshot();
    case 'open': await send([{ op: 'open', id: n.id, name: n.name, cls: n.cls, source: n.source || '', agent: cmd.agent }]); return null;
    case 'setSource': n.source = cmd.source; await send([{ op: 'log', message: `[mock] ${pathOf(n.id)} saved`, kind: 'MessageOutput', context: 'edit' }]); return null;
    case 'create': {
      const src = { Script: 'print("Hello world!")\n', LocalScript: 'print("Hello world!")\n', ModuleScript: 'local module = {}\n\nreturn module\n' }[cmd.className];
      if (!nodes.has(cmd.parentId)) throw new Error('Target not found.');
      const source = cmd.source ?? src;
      const id = add(cmd.name, cmd.className, cmd.parentId, source);
      const c = nodes.get(id);
      const out = [ev(c), { op: 'created', id, parent: cmd.parentId, agent: cmd.agent }];
      if (source != null) out.push({ op: 'open', id, name: c.name, cls: c.cls, source, agent: cmd.agent });
      await send(out);
      return { id, path: pathOf(id) };
    }
    case 'rename': n.name = cmd.name; return send([{ op: 'rename', id: n.id, name: n.name }]);
    case 'move': n.parent = cmd.parentId; return send([{ op: 'move', id: n.id, parent: n.parent }]);
    case 'delete': nodes.delete(n.id); await send([{ op: 'remove', id: n.id }]); return null;
    case 'select': return;
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
    default: return;
  }
}

(async () => {
  const hello = await req('POST', '/hello', { clientId: client, placeName: 'My Obby', placeId: 0, pluginVersion: 2 });
  // a play-test error, like the play-test copy of the plugin would send
  setTimeout(() => req('POST', '/log', { logs: [{ message: 'ServerScriptService.Main:21: attempt to index nil with "OnServerEvent"', kind: 'MessageError', context: 'server' }] }), 1000);
  session = hello.session;
  await snapshot();
  console.log('connected, session', session);
  // simulate a double click in Studio on "Main" after a moment
  setTimeout(() => {
    const main = [...nodes.values()].find((n) => n.name === 'Main');
    send([{ op: 'open', id: main.id, name: main.name, cls: main.cls, source: main.source, focus: true }]);
  }, 1500);
  for (;;) {
    const r = await req('GET', '/poll?client=' + client);
    if (!r.active) { console.log('inactive'); break; }
    for (const c of r.commands) await handle(c);
  }
})().catch((e) => { console.error(e); process.exit(1); });
