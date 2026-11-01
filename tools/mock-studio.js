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

async function handle(cmd) {
  console.log('[cmd]', cmd.type, cmd.id || '', cmd.className || '', cmd.name || '');
  const n = nodes.get(cmd.id);
  switch (cmd.type) {
    case 'snapshot': return snapshot();
    case 'open': return send([{ op: 'open', id: n.id, name: n.name, cls: n.cls, source: n.source || '' }]);
    case 'setSource': n.source = cmd.source; return;
    case 'create': {
      const src = { Script: 'print("Hello world!")\n', LocalScript: 'print("Hello world!")\n', ModuleScript: 'local module = {}\n\nreturn module\n' }[cmd.className];
      const id = add(cmd.name, cmd.className, cmd.parentId, src);
      const c = nodes.get(id);
      const out = [ev(c), { op: 'created', id, parent: cmd.parentId }];
      if (src) out.push({ op: 'open', id, name: c.name, cls: c.cls, source: src });
      return send(out);
    }
    case 'rename': n.name = cmd.name; return send([{ op: 'rename', id: n.id, name: n.name }]);
    case 'move': n.parent = cmd.parentId; return send([{ op: 'move', id: n.id, parent: n.parent }]);
    case 'delete': nodes.delete(n.id); return send([{ op: 'remove', id: n.id }]);
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
      return send(out);
    }
    default: return;
  }
}

(async () => {
  const hello = await req('POST', '/hello', { clientId: client, placeName: 'My Obby', placeId: 0 });
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
