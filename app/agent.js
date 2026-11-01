// Agent API: lets Claude (through the Bloxcode MCP server) read and change the place.
// The MCP server (app/mcp/bloxcode-mcp.js) calls POST /agent on the local bridge with a
// secret key. This module keeps a copy of the Explorer tree, the Studio output, and
// turns tool calls into plugin commands.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REQUIRED_PLUGIN_VERSION = 2;
const REPLY_TIMEOUT_MS = 20000;
const MAX_LOGS = 1000;

function createAgent({ pushCommand, sendEvents, isConnected, getPlace, getPluginVersion, packages, userData, onActivity }) {
  // ---------- tree mirror ----------
  const nodes = new Map(); // id -> { id, name, cls, parent }
  const children = new Map(); // id -> Set(childId); key null = roots

  function kids(id) {
    let s = children.get(id ?? null);
    if (!s) { s = new Set(); children.set(id ?? null, s); }
    return s;
  }
  function removeSubtree(id) {
    const n = nodes.get(id);
    if (!n) return;
    for (const c of [...kids(id)]) removeSubtree(c);
    children.delete(id);
    kids(n.parent).delete(id);
    nodes.delete(id);
  }

  // ---------- output log ----------
  let logs = [];
  let logSeq = 0;
  function addLog(entry) {
    logs.push({ seq: ++logSeq, time: Date.now(), kind: entry.kind || 'MessageOutput', context: entry.context || 'edit', message: String(entry.message ?? '') });
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  }

  // ---------- requests to the plugin ----------
  const pending = new Map();
  let reqCounter = 0;

  /** Called for every event batch from Studio. Returns the events the editor window should get. */
  function onEvents(events) {
    const forward = [];
    for (const e of events) {
      switch (e.op) {
        case 'reset': nodes.clear(); children.clear(); break;
        case 'add': {
          const old = nodes.get(e.id);
          if (old) kids(old.parent).delete(e.id);
          nodes.set(e.id, { id: e.id, name: e.name, cls: e.cls, parent: e.parent ?? null });
          kids(e.parent).add(e.id);
          break;
        }
        case 'remove': removeSubtree(e.id); break;
        case 'rename': { const n = nodes.get(e.id); if (n) n.name = e.name; break; }
        case 'move': {
          const n = nodes.get(e.id);
          if (n) { kids(n.parent).delete(e.id); n.parent = e.parent ?? null; kids(n.parent).add(e.id); }
          break;
        }
        case 'log': addLog(e); continue; // not for the editor
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
    return forward;
  }

  function onLogs(list) {
    for (const l of Array.isArray(list) ? list : []) addLog(l);
  }

  function onReset() {
    nodes.clear(); children.clear();
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Studio reconnected. Try again.')); }
    pending.clear();
  }

  function requireStudio() {
    if (!isConnected()) throw new Error('Bloxcode is not connected to Roblox Studio. Ask the user to open Studio, click Plugins > Bloxcode and turn on Code Mode.');
    const v = getPluginVersion();
    if (v < REQUIRED_PLUGIN_VERSION) throw new Error('Roblox Studio is still running an older Bloxcode plugin. Ask the user to restart Roblox Studio (Bloxcode already installed the new plugin).');
  }

  function ask(cmd, timeout = REPLY_TIMEOUT_MS) {
    requireStudio();
    const reqId = 'r' + (++reqCounter);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error('Roblox Studio did not answer in time. Is Studio busy or paused?'));
      }, timeout);
      pending.set(reqId, { resolve, reject, timer });
      pushCommand({ ...cmd, reqId, agent: true });
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

  const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);
  function requireScript(id) {
    const n = nodes.get(id);
    if (!n || !SCRIPT_CLASSES.has(n.cls)) throw new Error(`${pathOf(id)} is a ${n ? n.cls : 'missing instance'}, not a script.`);
    return n;
  }

  function activity(text) {
    if (onActivity) onActivity(text);
  }

  // ---------- explorer text ----------
  function hasScriptBelow(id, memo) {
    if (memo.has(id)) return memo.get(id);
    const n = nodes.get(id);
    let r = !!n && SCRIPT_CLASSES.has(n.cls);
    if (!r) for (const c of kids(id)) if (hasScriptBelow(c, memo)) { r = true; break; }
    memo.set(id, r);
    return r;
  }

  function explorer({ path: ref, depth, scripts_only: scriptsOnly, max_lines: maxLines }) {
    requireStudio();
    const limit = Math.min(Number(maxLines) || 400, 3000);
    const maxDepth = depth == null ? (ref ? 4 : 2) : Math.max(0, Number(depth));
    const memo = new Map();
    const lines = [];
    let hidden = 0;
    const sortKids = (id) => [...kids(id)].map((c) => nodes.get(c)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    function line(n, d) {
      const count = kids(n.id).size;
      const more = d >= maxDepth && count ? `  (+${count} children)` : '';
      lines.push(`${'  '.repeat(d)}${n.name} [${n.cls}] #${n.id}${more}`);
    }
    function walk(n, d) {
      if (scriptsOnly && !hasScriptBelow(n.id, memo)) return;
      if (lines.length >= limit) { hidden++; return; }
      line(n, d);
      if (d >= maxDepth) return;
      for (const c of sortKids(n.id)) walk(c, d + 1);
    }
    if (ref) {
      const id = resolve(ref);
      lines.push(`${pathOf(id)}:`);
      walk(nodes.get(id), 0);
    } else {
      for (const n of sortKids(null)) walk(n, 0);
    }
    if (hidden) lines.push(`… ${hidden} more not shown. Ask for a smaller path or use max_lines.`);
    const place = getPlace();
    return `Place: ${place ? place.name : '?'} · ${nodes.size} instances\nFormat: Name [ClassName] #id. Use a dotted path like ServerScriptService.Main or #id in other tools.\n\n${lines.join('\n')}`;
  }

  // ---------- tools ----------
  async function readScript(ref) {
    const id = resolve(ref);
    requireScript(id);
    const r = await ask({ type: 'read', id });
    return { id, path: r.path || pathOf(id), className: r.className, source: r.source };
  }

  async function writeSource(id, source, label) {
    await ask({ type: 'setSource', id, source });
    // keep an open tab in sync and show the user what changed
    await ask({ type: 'open', id }).catch(() => {});
    activity(`${label} ${pathOf(id)}`);
  }

  const tools = {
    async get_status() {
      const place = getPlace();
      return {
        connected: isConnected(),
        place: place ? place.name : null,
        pluginVersion: getPluginVersion() || null,
        pluginUpToDate: getPluginVersion() >= REQUIRED_PLUGIN_VERSION,
        instances: nodes.size,
        hint: isConnected() ? 'Ready.' : 'Not connected: ask the user to turn on Code Mode in the Bloxcode plugin in Roblox Studio.',
      };
    },

    async get_explorer(a) { return { text: explorer(a || {}) }; },

    async read_script(a) {
      const r = await readScript(a.path);
      const numbered = a.line_numbers === false ? r.source : r.source.split('\n').map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n');
      activity(`Reading ${r.path}`);
      return { text: `${r.path} [${r.className}] #${r.id}\n\n${numbered}` };
    },

    async write_script(a) {
      const id = resolve(a.path);
      requireScript(id);
      if (typeof a.source !== 'string') throw new Error('source must be a string.');
      await writeSource(id, a.source, 'Wrote');
      return { text: `Saved ${pathOf(id)} (${a.source.split('\n').length} lines).` };
    },

    async edit_script(a) {
      const r = await readScript(a.path);
      const oldText = String(a.old_text ?? '');
      const newText = String(a.new_text ?? '');
      if (!oldText) throw new Error('old_text must not be empty.');
      const count = r.source.split(oldText).length - 1;
      if (count === 0) throw new Error(`old_text was not found in ${r.path}. Read the script again; it may have changed.`);
      if (count > 1 && !a.replace_all) throw new Error(`old_text appears ${count} times in ${r.path}. Add more surrounding lines so it is unique, or set replace_all.`);
      const next = a.replace_all ? r.source.split(oldText).join(newText) : r.source.replace(oldText, () => newText);
      await writeSource(r.id, next, 'Edited');
      return { text: `Edited ${r.path} (${a.replace_all ? count : 1} change${count > 1 && a.replace_all ? 's' : ''}).` };
    },

    async create_instance(a) {
      const parentId = resolve(a.parent);
      if (!a.class_name) throw new Error('class_name is required.');
      const r = await ask({ type: 'create', parentId, className: a.class_name, name: a.name || a.class_name, source: a.source, properties: a.properties });
      if (!r) throw new Error('Studio could not create the instance.');
      activity(`Created ${r.path}`);
      return { text: `Created ${r.path} [${a.class_name}] #${r.id}` };
    },

    async rename_instance(a) {
      const id = resolve(a.path);
      if (!a.new_name) throw new Error('new_name is required.');
      const before = pathOf(id);
      await ask({ type: 'rename', id, name: String(a.new_name) });
      activity(`Renamed ${before}`);
      return { text: `Renamed ${before} to ${a.new_name}.` };
    },

    async move_instance(a) {
      const id = resolve(a.path);
      const parentId = resolve(a.new_parent);
      const before = pathOf(id);
      await ask({ type: 'move', id, parentId });
      activity(`Moved ${before}`);
      return { text: `Moved ${before} into ${pathOf(parentId)}.` };
    },

    async delete_instance(a) {
      const id = resolve(a.path);
      const before = pathOf(id);
      if (!nodes.get(id).parent) throw new Error('Services can not be deleted.');
      await ask({ type: 'delete', id });
      activity(`Deleted ${before}`);
      return { text: `Deleted ${before}. The user can undo this in Studio with Ctrl+Z.` };
    },

    async get_properties(a) {
      const id = resolve(a.path);
      return await ask({ type: 'getProperties', id, names: Array.isArray(a.names) && a.names.length ? a.names : undefined });
    },

    async set_properties(a) {
      const id = resolve(a.path);
      await ask({ type: 'setProperties', id, properties: a.properties, attributes: a.attributes, addTags: a.add_tags, removeTags: a.remove_tags });
      activity(`Changed ${pathOf(id)}`);
      return { text: `Updated ${pathOf(id)}.` };
    },

    async search_scripts(a) {
      const r = await ask({ type: 'search', query: String(a.query || ''), limit: Math.min(Number(a.limit) || 100, 500) }, 30000);
      activity(`Searching for "${a.query}"`);
      if (!r.matches.length) return { text: `No script contains "${a.query}".` };
      return { text: r.matches.map((m) => `${m.path}:${m.line}  ${m.text.trim()}`).join('\n') + (r.truncated ? '\n… more matches not shown (raise limit).' : '') };
    },

    async get_output(a) {
      const since = Number(a.since) || 0;
      const limit = Math.min(Number(a.limit) || 200, MAX_LOGS);
      let list = logs.filter((l) => l.seq > since);
      if (a.errors_only) list = list.filter((l) => l.kind === 'MessageError' || l.kind === 'MessageWarning');
      list = list.slice(-limit);
      if (a.clear) logs = [];
      const label = { MessageOutput: 'print', MessageInfo: 'info', MessageWarning: 'WARN', MessageError: 'ERROR' };
      const body = list.map((l) => `[${l.seq}] ${new Date(l.time).toTimeString().slice(0, 8)} ${l.context} ${label[l.kind] || l.kind}: ${l.message}`).join('\n');
      return { text: (body || 'No output yet.') + `\n\n(latest seq: ${logSeq}. Pass since=${logSeq} next time to get only new lines. Output from play tests is labeled server/client.)` };
    },

    async get_selection() {
      const r = await ask({ type: 'selection' });
      if (!r || !r.length) return { text: 'Nothing is selected in Studio.' };
      return { text: r.map((s) => `${s.path} [${s.className}] #${s.id}`).join('\n') };
    },

    async open_in_editor(a) {
      const id = resolve(a.path);
      requireScript(id);
      await ask({ type: 'open', id });
      return { text: `Opened ${pathOf(id)} in Bloxcode.` };
    },

    async search_packages(a) {
      const list = await packages.search(String(a.query || ''));
      if (!list.length) return { text: 'No packages found.' };
      return { text: list.slice(0, 20).map((p) => `${p.scope}/${p.name}@${p.version}  ${p.description || ''}`.trim()).join('\n') };
    },

    async install_package(a) {
      requireStudio();
      const spec = String(a.package || '');
      if (!spec) throw new Error('package is required, for example "evaera/cmdr" or "sleitnick/knit@1.7".');
      activity(`Installing ${spec}`);
      const { command, summary } = await packages.buildInstall(spec, () => {});
      await ask(command, 60000);
      const service = summary.realm === 'server' ? 'ServerScriptService' : 'ReplicatedStorage';
      const folder = summary.realm === 'server' ? 'ServerPackages' : 'Packages';
      const deps = summary.dependencies ? `\nAlso installed ${summary.dependencies} dependenc${summary.dependencies === 1 ? 'y' : 'ies'} in ${folder}._Index.` : '';
      const warn = summary.warnings && summary.warnings.length ? `\nWarnings: ${summary.warnings.join('; ')}` : '';
      return { text: `Installed ${summary.name}@${summary.version} as ${service}.${folder}.${summary.alias}\nUse it with: local ${summary.alias} = require(game:GetService("${service}").${folder}.${summary.alias})${deps}${warn}` };
    },
  };

  async function call(tool, args) {
    const fn = tools[tool];
    if (!fn) throw new Error(`Unknown tool ${tool}.`);
    return fn(args || {});
  }

  // ---------- key + Claude setup ----------
  const tokenFile = path.join(userData, 'agent-key.txt');
  function getToken() {
    try {
      const t = fs.readFileSync(tokenFile, 'utf8').trim();
      if (t.length >= 32) return t;
    } catch (_) {}
    const t = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, t, 'utf8');
    return t;
  }
  const token = getToken();
  function checkToken(header) {
    const given = String(header || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return { onEvents, onLogs, onReset, call, checkToken, tokenFile, tools };
}

// ---------- writing Claude's config ----------
function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return {}; }
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch (e) { throw new Error(`${file} is not valid JSON, so Bloxcode did not change it.`); }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.copyFileSync(file, file + '.bloxcode-backup'); } catch (_) {}
  const tmp = file + '.bloxcode-tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function claudeDesktopConfigFiles() {
  const files = [];
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  // Microsoft Store version keeps its data in a package folder
  try {
    for (const d of fs.readdirSync(path.join(local, 'Packages'))) {
      if (/^Claude_/i.test(d)) {
        const dir = path.join(local, 'Packages', d, 'LocalCache', 'Roaming', 'Claude');
        if (fs.existsSync(dir)) files.push(path.join(dir, 'claude_desktop_config.json'));
      }
    }
  } catch (_) {}
  files.push(path.join(appData, 'Claude', 'claude_desktop_config.json'));
  return files;
}

/** Adds the Bloxcode MCP server to Claude Desktop and Claude Code. Returns what was changed. */
function connectClaude(server) {
  const done = [];
  const errors = [];
  for (const file of claudeDesktopConfigFiles()) {
    try {
      const cfg = readJson(file);
      cfg.mcpServers = { ...(cfg.mcpServers || {}), bloxcode: server };
      writeJson(file, cfg);
      done.push({ app: 'Claude Desktop', file });
    } catch (e) { errors.push(e.message); }
  }
  const codeFile = path.join(os.homedir(), '.claude.json');
  try {
    const cfg = readJson(codeFile);
    cfg.mcpServers = { ...(cfg.mcpServers || {}), bloxcode: { type: 'stdio', ...server } };
    writeJson(codeFile, cfg);
    done.push({ app: 'Claude Code', file: codeFile });
  } catch (e) { errors.push(e.message); }
  return { done, errors };
}

function claudeConnectionState() {
  const has = (file) => { try { return !!readJson(file).mcpServers?.bloxcode; } catch (_) { return false; } };
  return {
    desktop: claudeDesktopConfigFiles().some(has),
    code: has(path.join(os.homedir(), '.claude.json')),
  };
}

module.exports = { createAgent, connectClaude, claudeConnectionState, REQUIRED_PLUGIN_VERSION };
