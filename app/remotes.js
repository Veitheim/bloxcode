// Remote map: which scripts fire and listen to every RemoteEvent / RemoteFunction, plus warnings
// for common mistakes (no checks on what the client sends, never fired, wrong side, …).
// A static analysis of the source, so it is a helpful overview, not a proof.

const REMOTE_CLASSES = new Set(['RemoteEvent', 'UnreliableRemoteEvent', 'RemoteFunction', 'BindableEvent', 'BindableFunction']);

const MEMBERS = {
  FireServer: { role: 'send', to: 'server', side: 'client' },
  FireClient: { role: 'send', to: 'client', side: 'server' },
  FireAllClients: { role: 'send', to: 'client', side: 'server' },
  InvokeServer: { role: 'send', to: 'server', side: 'client' },
  InvokeClient: { role: 'send', to: 'client', side: 'server' },
  OnServerEvent: { role: 'listen', side: 'server' },
  OnClientEvent: { role: 'listen', side: 'client' },
  OnServerInvoke: { role: 'listen', side: 'server' },
  OnClientInvoke: { role: 'listen', side: 'client' },
  Fire: { role: 'send' },
  Invoke: { role: 'send' },
  Event: { role: 'listen' },
  OnInvoke: { role: 'listen' },
};
const MEMBER_RE = Object.keys(MEMBERS).join('|');
const CHECK_RE = /\btypeof\s*\(|\btype\s*\(|\btonumber\s*\(|\btostring\s*\(|\bassert\s*\(|\bif\s+not\b|[~=]=\s*nil\b|\bmath\.clamp\b|\bt\.\w+\s*\(|:IsA\s*\(|\bvalidate|\bcheck|\bsanitize|\.Is\w+\s*\(/i;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function createRemoteMap(studio) {
  function sideOf(id) {
    const n = studio.nodes.get(id);
    if (!n) return 'unknown';
    if (n.cls === 'Script') return 'server';
    if (n.cls === 'LocalScript') return 'client';
    const service = studio.pathOf(id).split('.')[0];
    if (['ServerScriptService', 'ServerStorage'].includes(service)) return 'server';
    if (['StarterPlayer', 'StarterGui', 'ReplicatedFirst', 'StarterPack'].includes(service)) return 'client';
    return 'shared';
  }

  /** Finds how far a handler's body goes: until the "end" that closes "function(" (roughly). */
  function handlerBody(lines, start) {
    let depth = 0;
    const body = [];
    for (let i = start; i < Math.min(lines.length, start + 80); i++) {
      const l = lines[i].replace(/--.*$/, '').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
      depth += (l.match(/\b(function|do|then|repeat)\b/g) || []).length;
      depth -= (l.match(/\b(end|until)\b/g) || []).length;
      body.push(lines[i]);
      if (i > start && depth <= 0) break;
      if (i === start && depth <= 0 && /\bend\b/.test(l)) break;
    }
    return body;
  }

  async function scan() {
    studio.requireStudio();
    await studio.loadAllSources();
    const remotes = new Map(); // id -> entry
    const byName = new Map(); // name -> [ids]
    for (const n of studio.nodes.values()) {
      if (!REMOTE_CLASSES.has(n.cls)) continue;
      remotes.set(n.id, { id: n.id, name: n.name, cls: n.cls, path: studio.pathOf(n.id), usages: [], warnings: [] });
      if (!byName.has(n.name)) byName.set(n.name, []);
      byName.get(n.name).push(n.id);
    }
    if (!remotes.size) return [];
    const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    const nameRef = `(?:\\.\\s*(${names.join('|')})\\b|:\\s*(?:WaitForChild|FindFirstChild)\\s*\\(\\s*["'](${names.join('|')})["']|\\[\\s*["'](${names.join('|')})["']\\s*\\])`;
    const aliasRe = new RegExp(`^\\s*local\\s+([A-Za-z_]\\w*)\\s*(?::[^=]+)?=\\s*[^\\n]*?${nameRef}\\s*\\)?\\s*(?:::\\s*[\\w.<>?]+\\s*)?(?:--.*)?$`);

    for (const scriptId of studio.scriptIds()) {
      const src = studio.sources.get(scriptId);
      if (typeof src !== 'string') continue;
      const lines = src.split('\n');
      const aliases = new Map(); // variable -> remote name
      lines.forEach((line) => {
        const m = line.match(aliasRe);
        if (m) aliases.set(m[1], m[2] || m[3] || m[4]);
      });
      const aliasNames = [...aliases.keys()].map(escapeRe);
      const useRe = new RegExp(`(?:${aliasNames.length ? `\\b(${aliasNames.join('|')})\\b|` : '((?!))|'}${nameRef})\\s*\\)?\\s*[.:]\\s*(${MEMBER_RE})\\b`, 'g');
      const side = sideOf(scriptId);
      lines.forEach((line, i) => {
        if (/^\s*--/.test(line)) return;
        useRe.lastIndex = 0;
        let m;
        while ((m = useRe.exec(line))) {
          const name = m[1] ? aliases.get(m[1]) : m[2] || m[3] || m[4];
          const member = m[5];
          const info = MEMBERS[member];
          for (const rid of byName.get(name) || []) {
            const r = remotes.get(rid);
            const isBindable = r.cls.startsWith('Bindable');
            if (isBindable !== ['Fire', 'Invoke', 'Event', 'OnInvoke'].includes(member)) continue;
            const usage = { scriptId, path: studio.pathOf(scriptId), line: i + 1, member, role: info.role, side, text: line.trim().slice(0, 200), ambiguous: (byName.get(name) || []).length > 1 };
            r.usages.push(usage);
            // wrong side
            if (info.side && side !== 'shared' && side !== info.side) {
              r.warnings.push({ level: 'error', message: `${member} only works on the ${info.side}, but ${usage.path} runs on the ${side}.`, scriptId, line: i + 1 });
            }
            // server handlers without checks
            if (member === 'OnServerEvent' || member === 'OnServerInvoke') {
              const body = handlerBody(lines, i);
              const sig = body.join('\n').match(/function\s*\w*\s*\(([^)]*)\)/);
              const params = sig ? sig[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
              if (params.length > 1 && !CHECK_RE.test(body.slice(1).join('\n'))) {
                r.warnings.push({ level: 'warning', message: `The server uses what the client sends (${params.slice(1).join(', ')}) without checking it. Exploiters can send anything: check types and ranges.`, scriptId, line: i + 1 });
              }
            }
            if (member === 'InvokeClient') {
              r.warnings.push({ level: 'warning', message: 'InvokeClient makes the server wait for a client, which can hang forever or error if the player leaves. Prefer a RemoteEvent.', scriptId, line: i + 1 });
            }
          }
        }
      });
    }

    for (const r of remotes.values()) {
      const sends = r.usages.filter((u) => u.role === 'send');
      const listens = r.usages.filter((u) => u.role === 'listen');
      if (!r.usages.length) r.warnings.push({ level: 'info', message: 'Not used by any script.' });
      else if (!sends.length) r.warnings.push({ level: 'info', message: 'Scripts listen to it, but no script fires it.' });
      else if (!listens.length) r.warnings.push({ level: 'warning', message: 'Scripts fire it, but nothing listens.' });
      if (r.cls === 'RemoteFunction' && sends.some((u) => u.member === 'InvokeServer') && !listens.some((u) => u.member === 'OnServerInvoke')) {
        r.warnings.push({ level: 'error', message: 'InvokeServer is called, but no OnServerInvoke is set: the client waits forever.' });
      }
    }
    const order = { error: 0, warning: 1, info: 2 };
    return [...remotes.values()].sort((a, b) => {
      const wa = Math.min(3, ...a.warnings.map((w) => order[w.level]));
      const wb = Math.min(3, ...b.warnings.map((w) => order[w.level]));
      return wa - wb || a.path.localeCompare(b.path);
    });
  }

  function summary(list) {
    if (!list.length) return 'This place has no RemoteEvents, RemoteFunctions or BindableEvents.';
    return list.map((r) => {
      const lines = [`${r.path} [${r.cls}]`];
      for (const u of r.usages) lines.push(`  ${u.role === 'send' ? '→' : '←'} ${u.member} in ${u.path}:${u.line} (${u.side})`);
      for (const w of r.warnings) lines.push(`  ${w.level.toUpperCase()}: ${w.message}${w.line ? ` (${studio.pathOf(w.scriptId)}:${w.line})` : ''}`);
      return lines.join('\n');
    }).join('\n\n');
  }

  return { scan, summary };
}

module.exports = { createRemoteMap, REMOTE_CLASSES };
