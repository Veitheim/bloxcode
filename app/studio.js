// Studio core: Bloxcode's copy of the place.
// Keeps the Explorer tree, the Output, and the source of every script, sends commands to the
// plugin and waits for their answers. Search, history, type checking, GitHub and Claude all
// build on this.

const { EventEmitter } = require('events');

const REQUIRED_PLUGIN_VERSION = 2; // Claude tools work from v2; v3 adds faster loading, play tests and run_code
const REPLY_TIMEOUT_MS = 20000;
const MAX_LOGS = 2000;
const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);

function createStudio({ pushCommand, isConnected, getPlace, getPluginVersion }) {
  const events = new EventEmitter();
  events.setMaxListeners(50);

  // ---------- tree mirror ----------
  const nodes = new Map(); // id -> { id, name, cls, parent }
  const children = new Map(); // id -> Set(childId); key null = services
  let snapshotDone = false;
  let snapshotProgress = null;

  function kids(id) {
    let s = children.get(id ?? null);
    if (!s) { s = new Set(); children.set(id ?? null, s); }
    return s;
  }
  function addNode(id, name, cls, parent) {
    const old = nodes.get(id);
    if (old) kids(old.parent).delete(id);
    nodes.set(id, { id, name, cls, parent: parent ?? null });
    kids(parent).add(id);
  }
  function removeSubtree(id) {
    const n = nodes.get(id);
    if (!n) return;
    for (const c of [...kids(id)]) removeSubtree(c);
    children.delete(id);
    kids(n.parent).delete(id);
    nodes.delete(id);
    if (sources.has(id)) { sources.delete(id); events.emit('scriptRemoved', id); }
  }
  function clearTree() {
    nodes.clear(); children.clear(); sources.clear();
    snapshotDone = false;
    snapshotProgress = null;
  }

  // ---------- output ----------
  let logs = [];
  let logSeq = 0;
  function addLog(entry) {
    const l = { seq: ++logSeq, time: Date.now(), kind: entry.kind || 'MessageOutput', context: entry.context || 'edit', message: String(entry.message ?? '') };
    logs.push(l);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    return l;
  }
  function onLogs(list) {
    const added = [];
    for (const l of Array.isArray(list) ? list : []) added.push(addLog(l));
    if (added.length) events.emit('logs', added);
  }
  function clearLogs() { logs = []; events.emit('logsCleared'); }

  // ---------- source cache ----------
  const sources = new Map(); // id -> source (only scripts)

  function noteSource(id, source, origin) {
    if (typeof source !== 'string') return;
    const before = sources.get(id);
    sources.set(id, source);
    if (before !== source) events.emit('sourceChanged', { id, source, before, origin, path: pathOf(id) });
  }

  // ---------- replies ----------
  const pending = new Map();
  let reqCounter = 0;

  /** Handles an event batch from Studio. Returns the events the editor window should get. */
  function onEvents(list) {
    const forward = [];
    let treeChanged = false;
    const logsAdded = [];
    for (const e of list) {
      switch (e.op) {
        case 'reset': clearTree(); treeChanged = true; break;
        case 'add': addNode(e.id, e.name, e.cls, e.parent); treeChanged = true; break;
        case 'snap':
          for (const row of e.nodes || []) addNode(row[0], row[1], row[2], row[3]);
          treeChanged = true;
          break;
        case 'snapProgress':
          snapshotProgress = { done: e.done, total: e.total };
          if (e.done >= e.total && !snapshotDone) { snapshotDone = true; events.emit('snapshotDone'); }
          break;
        case 'remove': removeSubtree(e.id); treeChanged = true; break;
        case 'rename': {
          const n = nodes.get(e.id);
          if (n) { const before = pathOf(e.id); n.name = e.name; events.emit('renamed', { id: e.id, before, after: pathOf(e.id) }); }
          treeChanged = true;
          break;
        }
        case 'move': {
          const n = nodes.get(e.id);
          if (n) { const before = pathOf(e.id); kids(n.parent).delete(e.id); n.parent = e.parent ?? null; kids(n.parent).add(e.id); events.emit('renamed', { id: e.id, before, after: pathOf(e.id) }); }
          treeChanged = true;
          break;
        }
        case 'open': noteSource(e.id, e.source, 'studio'); break;
        case 'source': noteSource(e.id, e.source, 'studio'); break;
        case 'log': logsAdded.push(addLog(e)); break;
        case 'playtest': events.emit('playtest', e); break;
        case 'reply': {
          const p = pending.get(e.reqId);
          if (p) {
            pending.delete(e.reqId);
            clearTimeout(p.timer);
            if (e.ok) p.resolve(e.result ?? null);
            else p.reject(new Error(e.error || 'Studio reported an error.'));
          }
          continue;
        }
        default: break;
      }
      forward.push(e);
    }
    if (logsAdded.length) events.emit('logs', logsAdded);
    if (treeChanged) events.emit('tree');
    return forward;
  }

  function onReset() {
    clearTree();
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Studio reconnected. Try again.')); }
    pending.clear();
    events.emit('reset');
  }

  function requireStudio(minVersion = REQUIRED_PLUGIN_VERSION) {
    if (!isConnected()) throw new Error('Bloxcode is not connected to Roblox Studio. Ask the user to open Studio, click Plugins > Bloxcode and turn on Code Mode.');
    if (getPluginVersion() < minVersion) throw new Error('Roblox Studio is still running an older Bloxcode plugin. Ask the user to restart Roblox Studio (Bloxcode already installed the new plugin).');
  }

  /** Sends a command to the plugin and waits for its answer. */
  function ask(cmd, { timeout = REPLY_TIMEOUT_MS, minVersion, agent = false } = {}) {
    requireStudio(minVersion);
    const reqId = 'r' + (++reqCounter);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error('Roblox Studio did not answer in time. Is Studio busy or paused?'));
      }, timeout);
      pending.set(reqId, { resolve, reject, timer });
      pushCommand({ ...cmd, reqId, agent });
    });
  }

  // ---------- paths ----------
  function pathOf(id) {
    const parts = [];
    let n = nodes.get(id);
    while (n) { parts.unshift(n.name); n = n.parent ? nodes.get(n.parent) : null; }
    return parts.join('.');
  }

  /** Accepts "#id", "ServerScriptService.Main", "game.ServerScriptService.Main" or with "/" separators. */
  function resolve(ref) {
    if (ref == null || ref === '') throw new Error('Missing path.');
    let s = String(ref).trim();
    if (s.startsWith('#')) {
      const id = s.slice(1);
      if (!nodes.has(id)) throw new Error(`No instance with id ${s}. Call get_explorer to see current ids.`);
      return id;
    }
    s = s.replace(/^game[./]/, '').replace(/^workspace(?=[./]|$)/, 'Workspace');
    const sep = s.includes('/') ? '/' : '.';
    const matches = [];
    // Names may contain dots, so try every way to split the path.
    (function walk(parentId, rest) {
      for (const cid of kids(parentId)) {
        const n = nodes.get(cid);
        if (!n) continue;
        if (rest === n.name) matches.push(cid);
        else if (rest.startsWith(n.name + sep)) walk(cid, rest.slice(n.name.length + 1));
      }
    })(null, s);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`"${ref}" matches ${matches.length} instances with the same name: ${matches.map((m) => '#' + m).join(', ')}. Use one of these ids.`);
    throw new Error(`Nothing found at "${ref}". Paths look like ServerScriptService.Main. Call get_explorer to see the tree.`);
  }

  function isScript(id) { const n = nodes.get(id); return !!n && SCRIPT_CLASSES.has(n.cls); }
  function requireScript(id) {
    const n = nodes.get(id);
    if (!n || !SCRIPT_CLASSES.has(n.cls)) throw new Error(`${pathOf(id)} is a ${n ? n.cls : 'missing instance'}, not a script.`);
    return n;
  }
  function scriptIds() {
    const out = [];
    for (const n of nodes.values()) if (SCRIPT_CLASSES.has(n.cls)) out.push(n.id);
    return out;
  }

  // ---------- reading and writing scripts ----------
  async function readSource(id, { fresh = false } = {}) {
    if (!fresh && sources.has(id)) return sources.get(id);
    const r = await ask({ type: 'read', id });
    noteSource(id, r.source, 'studio');
    return r.source;
  }

  let loadingAll = null;
  /** Makes sure every script's source is in the cache (fetches the missing ones in batches). */
  function loadAllSources(onProgress) {
    if (loadingAll) return loadingAll;
    loadingAll = (async () => {
      requireStudio();
      const missing = scriptIds().filter((id) => !sources.has(id));
      const useBatch = getPluginVersion() >= 3;
      let done = 0;
      for (let i = 0; i < missing.length; i += useBatch ? 80 : 1) {
        const ids = missing.slice(i, i + (useBatch ? 80 : 1));
        if (useBatch) {
          const map = await ask({ type: 'readMany', ids }, { timeout: 60000 });
          for (const [id, src] of Object.entries(map || {})) if (!sources.has(id)) noteSource(id, src, 'studio');
        } else {
          for (const id of ids) await readSource(id).catch(() => {});
        }
        done += ids.length;
        if (onProgress) onProgress(done, missing.length);
      }
      return sources;
    })().finally(() => { loadingAll = null; });
    return loadingAll;
  }

  async function writeSource(id, source, origin, { agent = false } = {}) {
    await ask({ type: 'setSource', id, source }, { agent });
    noteSource(id, source, origin);
  }

  /** Changes several scripts in one Studio undo step. sourcesById: { id: source } */
  async function writeSources(sourcesById, label, origin, { agent = false } = {}) {
    const ids = Object.keys(sourcesById);
    if (!ids.length) return 0;
    if (getPluginVersion() >= 3) {
      await ask({ type: 'setSources', sources: sourcesById, label }, { timeout: 60000, agent });
    } else {
      for (const id of ids) await ask({ type: 'setSource', id, source: sourcesById[id] }, { agent });
    }
    for (const id of ids) noteSource(id, sourcesById[id], origin);
    return ids.length;
  }

  return {
    events, nodes, kids, sources, SCRIPT_CLASSES,
    onEvents, onLogs, onReset, clearLogs, noteSource,
    get logs() { return logs; }, get logSeq() { return logSeq; },
    get snapshotDone() { return snapshotDone; }, get snapshotProgress() { return snapshotProgress; },
    ask, requireStudio, pathOf, resolve, isScript, requireScript, scriptIds,
    readSource, loadAllSources, writeSource, writeSources,
    isConnected, getPlace, getPluginVersion,
  };
}

module.exports = { createStudio, SCRIPT_CLASSES, REQUIRED_PLUGIN_VERSION };
