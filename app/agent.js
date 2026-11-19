// Agent API: the tools Claude uses (through the Bloxcode MCP server or the in-app chat).
// The MCP server (app/mcp/bloxcode-mcp.js) calls POST /agent on the local bridge with a
// secret key; every tool here works on the shared Studio core (app/studio.js).

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { isMac, appDataDir } = require('./platform');

const MAX_LOG_LINES = 2000;

function createAgent({ studio, search, history, lsp, github, playtest, packages, userData, onActivity, review, editorState, remoteMap, templates }) {
  const { resolve, pathOf, requireScript, requireStudio, ask } = studio;
  const agentAsk = (cmd, opts = {}) => ask(cmd, { ...opts, agent: true });

  function activity(text) { if (onActivity) onActivity(text); }

  // ---------- explorer text ----------
  function hasScriptBelow(id, memo) {
    if (memo.has(id)) return memo.get(id);
    const n = studio.nodes.get(id);
    let r = !!n && studio.SCRIPT_CLASSES.has(n.cls);
    if (!r) for (const c of studio.kids(id)) if (hasScriptBelow(c, memo)) { r = true; break; }
    memo.set(id, r);
    return r;
  }

  function explorer({ path: ref, depth, scripts_only: scriptsOnly, max_lines: maxLines, class_filter: classFilter }) {
    requireStudio();
    const limit = Math.min(Number(maxLines) || 400, 3000);
    const maxDepth = depth == null ? (ref ? 4 : 2) : Math.max(0, Number(depth));
    const memo = new Map();
    const lines = [];
    let hidden = 0;
    const sortKids = (id) => [...studio.kids(id)].map((c) => studio.nodes.get(c)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const want = classFilter ? new Set(String(classFilter).split(',').map((s) => s.trim())) : null;
    function walk(n, d) {
      if (scriptsOnly && !hasScriptBelow(n.id, memo)) return;
      if (lines.length >= limit) { hidden++; return; }
      const count = studio.kids(n.id).size;
      const more = d >= maxDepth && count ? `  (+${count} children)` : '';
      if (!want || want.has(n.cls) || d === 0) lines.push(`${'  '.repeat(d)}${n.name} [${n.cls}] #${n.id}${more}`);
      if (d >= maxDepth) return;
      for (const c of sortKids(n.id)) walk(c, d + 1);
    }
    if (ref) {
      const id = resolve(ref);
      lines.push(`${pathOf(id)}:`);
      walk(studio.nodes.get(id), 0);
    } else {
      for (const n of sortKids(null)) walk(n, 0);
    }
    if (hidden) lines.push(`… ${hidden} more not shown. Ask for a smaller path or use max_lines.`);
    const place = studio.getPlace();
    const loading = studio.snapshotProgress && studio.snapshotProgress.done < studio.snapshotProgress.total ? ` (still loading: ${studio.snapshotProgress.done}/${studio.snapshotProgress.total})` : '';
    return `Place: ${place ? place.name : '?'} · ${studio.nodes.size} instances${loading}\nFormat: Name [ClassName] #id. Use a dotted path like ServerScriptService.Main or #id in other tools.\n\n${lines.join('\n')}`;
  }

  // ---------- writing with optional review ----------
  /** Writes scripts, after the user approved them if "Review Claude's changes" is on. */
  async function applyChanges(changes, title) {
    // changes: [{ id, path, before, after }]
    const decision = await review(changes, title);
    if (!decision.accepted) {
      throw new Error(`The user rejected this change in Bloxcode${decision.note ? `: "${decision.note}"` : '.'} Do not apply it again; ask what they want instead.`);
    }
    const map = {};
    for (const c of changes) map[c.id] = c.after;
    if (changes.length === 1) await studio.writeSource(changes[0].id, changes[0].after, 'claude', { agent: true });
    else await studio.writeSources(map, title, 'claude', { agent: true });
    for (const c of changes.slice(0, 3)) await agentAsk({ type: 'open', id: c.id }).catch(() => {});
    return decision;
  }

  async function readScript(ref) {
    const id = resolve(ref);
    requireScript(id);
    const source = await studio.readSource(id, { fresh: !studio.sources.has(id) });
    return { id, path: pathOf(id), className: studio.nodes.get(id).cls, source };
  }

  function numbered(source, from = 1, to = Infinity) {
    const lines = source.split('\n');
    const end = Math.min(lines.length, to);
    const out = [];
    for (let i = Math.max(1, from); i <= end; i++) out.push(`${String(i).padStart(4)}  ${lines[i - 1]}`);
    return out.join('\n');
  }

  function formatLogs(list) {
    const label = { MessageOutput: 'print', MessageInfo: 'info', MessageWarning: 'WARN', MessageError: 'ERROR' };
    return list.map((l) => `[${l.seq}] ${new Date(l.time).toTimeString().slice(0, 8)} ${l.context} ${label[l.kind] || l.kind}: ${l.message}`).join('\n');
  }

  function diagText(list) {
    if (!list.length) return 'No problems found.';
    const sev = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };
    return list.map((d) => d.items.map((i) => `${d.path}:${i.line}:${i.col} ${sev[i.severity] || 'error'}: ${i.message}`).join('\n')).join('\n');
  }

  const tools = {
    async get_status() {
      const place = studio.getPlace();
      return {
        connected: studio.isConnected(),
        place: place ? place.name : null,
        pluginVersion: studio.getPluginVersion() || null,
        pluginUpToDate: studio.getPluginVersion() >= 3,
        instances: studio.nodes.size,
        scripts: studio.scriptIds().length,
        typeChecker: lsp.getState().state,
        playtest: playtest.info(),
        github: (github.state().link || {}).url || null,
        hint: studio.isConnected() ? 'Ready.' : 'Not connected: ask the user to turn on Code Mode in the Bloxcode plugin in Roblox Studio.',
      };
    },

    async get_explorer(a) { return { text: explorer(a || {}) }; },

    async read_script(a) {
      const r = await readScript(a.path);
      const from = Number(a.start_line) || 1;
      const to = Number(a.end_line) || Infinity;
      activity(`Reading ${r.path}`);
      const total = r.source.split('\n').length;
      const body = a.line_numbers === false ? r.source : numbered(r.source, from, to);
      return { text: `${r.path} [${r.className}] #${r.id} · ${total} lines\n\n${body}` };
    },

    async read_scripts(a) {
      const paths = Array.isArray(a.paths) ? a.paths.slice(0, 20) : [];
      if (!paths.length) throw new Error('Pass up to 20 paths.');
      const parts = [];
      for (const p of paths) {
        try {
          const r = await readScript(p);
          parts.push(`===== ${r.path} [${r.className}] #${r.id}\n${numbered(r.source)}`);
        } catch (e) { parts.push(`===== ${p}\n(${e.message})`); }
      }
      activity(`Reading ${paths.length} scripts`);
      return { text: parts.join('\n\n') };
    },

    async write_script(a) {
      const id = resolve(a.path);
      requireScript(id);
      if (typeof a.source !== 'string') throw new Error('source must be a string.');
      const before = await studio.readSource(id).catch(() => '');
      await applyChanges([{ id, path: pathOf(id), before, after: a.source }], `Write ${pathOf(id)}`);
      activity(`Wrote ${pathOf(id)}`);
      return { text: `Saved ${pathOf(id)} (${a.source.split('\n').length} lines).` };
    },

    async edit_script(a) {
      const r = await readScript(a.path);
      const edits = Array.isArray(a.edits) && a.edits.length ? a.edits : [{ old_text: a.old_text, new_text: a.new_text, replace_all: a.replace_all }];
      let next = r.source;
      let changes = 0;
      for (const e of edits) {
        const oldText = String(e.old_text ?? '');
        const newText = String(e.new_text ?? '');
        if (!oldText) throw new Error('old_text must not be empty.');
        const count = next.split(oldText).length - 1;
        if (count === 0) throw new Error(`old_text was not found in ${r.path}${edits.length > 1 ? ` (edit ${edits.indexOf(e) + 1})` : ''}. Read the script again; it may have changed. No edits were applied.`);
        if (count > 1 && !e.replace_all) throw new Error(`old_text appears ${count} times in ${r.path}. Add more surrounding lines so it is unique, or set replace_all. No edits were applied.`);
        next = e.replace_all ? next.split(oldText).join(newText) : next.replace(oldText, () => newText);
        changes += e.replace_all ? count : 1;
      }
      await applyChanges([{ id: r.id, path: r.path, before: r.source, after: next }], `Edit ${r.path}`);
      activity(`Edited ${r.path}`);
      return { text: `Edited ${r.path} (${changes} change${changes === 1 ? '' : 's'}).` };
    },

    async create_instance(a) {
      const parentId = resolve(a.parent);
      if (!a.class_name) throw new Error('class_name is required.');
      if (typeof a.source === 'string' && a.source.length) {
        const decision = await review([{ id: null, path: `${pathOf(parentId)}.${a.name || a.class_name}`, before: '', after: a.source, isNew: true }], `Create ${a.name}`);
        if (!decision.accepted) throw new Error(`The user rejected this new script${decision.note ? `: "${decision.note}"` : '.'}`);
      }
      const r = await agentAsk({ type: 'create', parentId, className: a.class_name, name: a.name || a.class_name, source: a.source, properties: a.properties });
      if (!r) throw new Error('Studio could not create the instance.');
      if (typeof a.source === 'string') studio.noteSource(r.id, a.source, 'claude');
      activity(`Created ${r.path}`);
      return { text: `Created ${r.path} [${a.class_name}] #${r.id}` };
    },

    async create_tree(a) {
      const parentId = resolve(a.parent);
      if (!a.tree || !a.tree.class) throw new Error('tree needs at least { "class": "…" }.');
      const r = await agentAsk({ type: 'createTree', parentId, tree: a.tree }, { minVersion: 3, timeout: 60000 });
      if (!r) throw new Error('Studio could not create the tree.');
      activity(`Created ${r.path}`);
      return { text: `Created ${r.path} with ${r.count} instance${r.count === 1 ? '' : 's'} (#${r.id}).` };
    },

    async duplicate_instance(a) {
      const id = resolve(a.path);
      const before = new Set(studio.kids(studio.nodes.get(id).parent));
      await agentAsk({ type: 'duplicate', id });
      if (a.new_parent) {
        await new Promise((r) => setTimeout(r, 400));
        const copy = [...studio.kids(studio.nodes.get(id).parent)].find((c) => !before.has(c) && studio.nodes.get(c).name === studio.nodes.get(id).name);
        if (copy) await agentAsk({ type: 'move', id: copy, parentId: resolve(a.new_parent) });
      }
      activity(`Duplicated ${pathOf(id)}`);
      return { text: `Duplicated ${pathOf(id)}${a.new_parent ? ` into ${a.new_parent}` : ''}.` };
    },

    async rename_instance(a) {
      const id = resolve(a.path);
      if (!a.new_name) throw new Error('new_name is required.');
      const before = pathOf(id);
      await agentAsk({ type: 'rename', id, name: String(a.new_name) });
      activity(`Renamed ${before}`);
      return { text: `Renamed ${before} to ${a.new_name}.` };
    },

    async move_instance(a) {
      const id = resolve(a.path);
      const parentId = resolve(a.new_parent);
      const before = pathOf(id);
      await agentAsk({ type: 'move', id, parentId });
      activity(`Moved ${before}`);
      return { text: `Moved ${before} into ${pathOf(parentId)}.` };
    },

    async delete_instance(a) {
      const id = resolve(a.path);
      const before = pathOf(id);
      if (!studio.nodes.get(id).parent) throw new Error('Services can not be deleted.');
      await agentAsk({ type: 'delete', id });
      activity(`Deleted ${before}`);
      return { text: `Deleted ${before}. The user can undo this in Studio with Ctrl+Z.` };
    },

    async get_properties(a) {
      const id = resolve(a.path);
      return await agentAsk({ type: 'getProperties', id, names: Array.isArray(a.names) && a.names.length ? a.names : undefined });
    },

    async set_properties(a) {
      const targets = Array.isArray(a.paths) && a.paths.length ? a.paths : [a.path];
      for (const p of targets) {
        const id = resolve(p);
        await agentAsk({ type: 'setProperties', id, properties: a.properties, attributes: a.attributes, addTags: a.add_tags, removeTags: a.remove_tags });
      }
      activity(`Changed ${targets.length === 1 ? targets[0] : targets.length + ' instances'}`);
      return { text: `Updated ${targets.join(', ')}.` };
    },

    async search_scripts(a) {
      const r = await search.search({ query: String(a.query || ''), regex: !!a.regex, caseSensitive: !!a.case_sensitive, wholeWord: !!a.whole_word, include: a.include });
      activity(`Searching for "${a.query}"`);
      if (!r.results.length) return { text: `No script contains "${a.query}".` };
      const limit = Math.min(Number(a.limit) || 150, 1000);
      const lines = [];
      for (const f of r.results) for (const m of f.matches) { if (lines.length < limit) lines.push(`${f.path}:${m.line}  ${m.text.trim()}`); }
      return { text: lines.join('\n') + (r.total > lines.length ? `\n… ${r.total - lines.length} more matches (raise limit or narrow with include).` : '') };
    },

    async replace_in_scripts(a) {
      await studio.loadAllSources();
      const opts = { query: String(a.query || ''), replacement: String(a.replacement ?? ''), regex: !!a.regex, caseSensitive: !!a.case_sensitive, wholeWord: !!a.whole_word };
      if (a.include) opts.ids = studio.scriptIds().filter((id) => pathOf(id).toLowerCase().includes(String(a.include).toLowerCase()));
      // preview what would change, then let the user review it
      const { buildRegex } = require('./search');
      const re = buildRegex(opts);
      const changes = [];
      for (const id of opts.ids || studio.scriptIds()) {
        const before = studio.sources.get(id);
        if (typeof before !== 'string') continue;
        re.lastIndex = 0;
        if (!re.test(before)) continue;
        re.lastIndex = 0;
        const after = before.replace(re, (...m) => (opts.regex ? opts.replacement.replace(/\$(\d|&)/g, (_, g) => (g === '&' ? m[0] : m[Number(g)] ?? '')) : opts.replacement));
        if (after !== before) changes.push({ id, path: pathOf(id), before, after });
      }
      if (!changes.length) return { text: `Nothing matched "${opts.query}".` };
      await applyChanges(changes, `Replace "${opts.query}"`);
      activity(`Replaced "${opts.query}" in ${changes.length} scripts`);
      return { text: `Replaced in ${changes.length} script${changes.length === 1 ? '' : 's'}: ${changes.map((c) => c.path).join(', ')}` };
    },

    async get_output(a) {
      const since = Number(a.since) || 0;
      const limit = Math.min(Number(a.limit) || 200, MAX_LOG_LINES);
      let list = studio.logs.filter((l) => l.seq > since);
      if (a.errors_only) list = list.filter((l) => l.kind === 'MessageError' || l.kind === 'MessageWarning');
      if (a.context) list = list.filter((l) => l.context === a.context);
      list = list.slice(-limit);
      if (a.clear) studio.clearLogs();
      return { text: (formatLogs(list) || 'No output yet.') + `\n\n(latest seq: ${studio.logSeq}. Pass since=${studio.logSeq} next time to get only new lines. Play-test output is labeled server/client.)` };
    },

    async get_diagnostics(a) {
      const st = lsp.getState();
      if (st.state !== 'ready') return { text: `The type checker is ${st.state === 'off' ? 'turned off (Settings > Editor > Luau language server)' : st.state}${st.detail ? ': ' + st.detail : ''}.` };
      let list = lsp.allDiagnostics();
      if (a.path) { const id = resolve(a.path); list = list.filter((d) => d.id === id); }
      if (!a.include_warnings) list = list.map((d) => ({ ...d, items: d.items.filter((i) => i.severity === 1) })).filter((d) => d.items.length);
      return { text: diagText(list) };
    },

    async get_selection() {
      const r = await agentAsk({ type: 'selection' });
      if (!r || !r.length) return { text: 'Nothing is selected in Studio.' };
      return { text: r.map((s) => `${s.path} [${s.className}] #${s.id}`).join('\n') };
    },

    async set_selection(a) {
      const ids = (Array.isArray(a.paths) ? a.paths : []).map(resolve);
      await agentAsk({ type: 'setSelection', ids }, { minVersion: 3 });
      return { text: `Selected ${ids.length} instance${ids.length === 1 ? '' : 's'} in Studio.` };
    },

    async get_editor_state() {
      const s = await editorState();
      if (!s || !s.active) return { text: 'No script is open in Bloxcode right now.' + (s && s.tabs && s.tabs.length ? `\nOpen tabs: ${s.tabs.join(', ')}` : '') };
      return { text: `Active script: ${s.active.path} (line ${s.active.line}, column ${s.active.col})${s.active.selection ? `\nSelected text:\n${s.active.selection}` : ''}\nOpen tabs: ${s.tabs.join(', ')}` };
    },

    async open_in_editor(a) {
      const id = resolve(a.path);
      requireScript(id);
      await agentAsk({ type: 'open', id });
      return { text: `Opened ${pathOf(id)} in Bloxcode.` };
    },

    async undo(a) {
      const steps = Math.max(1, Math.min(20, Number(a.steps) || 1));
      for (let i = 0; i < steps; i++) await agentAsk({ type: 'undo' }, { minVersion: 3 });
      activity(`Undid ${steps} step${steps === 1 ? '' : 's'}`);
      return { text: `Undid ${steps} step${steps === 1 ? '' : 's'} in Studio (same as Ctrl+Z).` };
    },

    async redo(a) {
      const steps = Math.max(1, Math.min(20, Number(a.steps) || 1));
      for (let i = 0; i < steps; i++) await agentAsk({ type: 'redo' }, { minVersion: 3 });
      return { text: `Redid ${steps} step${steps === 1 ? '' : 's'} in Studio.` };
    },

    async run_code(a) {
      const where = a.where || 'edit';
      if (!a.code) throw new Error('code is required.');
      activity(`Running code (${where})`);
      let r;
      if (where === 'edit') r = await agentAsk({ type: 'runCode', code: String(a.code) }, { minVersion: 3, timeout: 30000 });
      else r = await playtest.runInTest(a.code, where === 'client' ? 'client' : 'server');
      const out = (r.output || []).join('\n');
      return { text: `${r.ok ? 'OK' : 'ERROR'}${r.result ? `: ${r.result}` : ''}${out ? `\nOutput:\n${out}` : ''}` };
    },

    async start_playtest(a) {
      const mode = a.mode === 'run' ? 'run' : 'play';
      activity(`Starting a play test (${mode})`);
      const r = await playtest.start(mode);
      const seconds = Math.max(0, Math.min(120, Number(a.seconds) || 0));
      if (!seconds) return { text: `Play test started (${mode} mode). Use run_code with where="server" or "client" to inspect it, get_output to read the Output, and stop_playtest when done.` };
      await new Promise((res) => setTimeout(res, seconds * 1000));
      await playtest.stop();
      const logs = studio.logs.filter((l) => l.seq > r.logSeq && l.context !== 'edit');
      return { text: `Ran a ${mode} test for ${seconds} s and stopped it.\nOutput during the test:\n${formatLogs(logs) || '(nothing printed)'}` };
    },

    async stop_playtest() {
      const r = await playtest.stop();
      activity('Stopped the play test');
      return { text: r.stopped ? 'Play test stopped.' : 'No play test was running.' };
    },

    async get_playtest_state() { return playtest.info(); },

    async insert_asset(a) {
      const parentId = a.parent ? resolve(a.parent) : undefined;
      const r = await agentAsk({ type: 'insertAsset', assetId: Number(a.asset_id), parentId }, { minVersion: 3, timeout: 60000 });
      activity(`Inserted asset ${a.asset_id}`);
      return { text: r && r.length ? `Inserted:\n${r.map((i) => `${i.path} [${i.className}] #${i.id}`).join('\n')}` : 'The asset was empty.' };
    },

    async get_script_history(a) {
      const id = resolve(a.path);
      const list = history.list(pathOf(id));
      if (!list.length) return { text: 'No saved versions yet.' };
      return { text: list.slice(0, 40).map((v) => `version ${v.index}: ${new Date(v.time).toLocaleString()} · ${v.origin} · ${v.lines} lines`).join('\n') };
    },

    async restore_script_version(a) {
      const id = resolve(a.path);
      const source = history.get(pathOf(id), Number(a.version));
      const before = await studio.readSource(id);
      await applyChanges([{ id, path: pathOf(id), before, after: source }], `Restore ${pathOf(id)}`);
      activity(`Restored ${pathOf(id)}`);
      return { text: `Restored version ${a.version} of ${pathOf(id)}.` };
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
      await agentAsk(command, { timeout: 60000 });
      const service = summary.realm === 'server' ? 'ServerScriptService' : 'ReplicatedStorage';
      const folder = summary.realm === 'server' ? 'ServerPackages' : 'Packages';
      const deps = summary.dependencies ? `\nAlso installed ${summary.dependencies} dependenc${summary.dependencies === 1 ? 'y' : 'ies'} in ${folder}._Index.` : '';
      const warn = summary.warnings && summary.warnings.length ? `\nWarnings: ${summary.warnings.join('; ')}` : '';
      return { text: `Installed ${summary.name}@${summary.version} as ${service}.${folder}.${summary.alias}\nUse it with: local ${summary.alias} = require(game:GetService("${service}").${folder}.${summary.alias})${deps}${warn}` };
    },

    async get_remote_map() {
      activity('Mapping remotes');
      const list = await remoteMap.scan();
      return { text: remoteMap.summary(list) };
    },

    async get_tags_and_attributes(a) {
      const r = await agentAsk({ type: 'scanTags', limit: Math.min(Number(a.limit) || 50, 500) }, { timeout: 60000, minVersion: 4 });
      const tags = Object.entries(r.tags || {});
      const attrs = Object.entries(r.attributes || {});
      const val = (v) => (v && typeof v === 'object' ? `${v.type}(${JSON.stringify(v.value)})` : JSON.stringify(v));
      const out = [];
      out.push(tags.length ? 'Tags (CollectionService):' : 'No tags in this place.');
      for (const [tag, list] of tags) out.push(`  ${tag} (${list.length}): ${list.slice(0, 12).map((x) => x.path).join(', ')}${list.length > 12 ? ', …' : ''}`);
      out.push(attrs.length ? '\nAttributes:' : '\nNo attributes in this place.');
      for (const [name, list] of attrs) out.push(`  ${name} (${list.length}): ${list.slice(0, 8).map((x) => `${x.path} = ${val(x.value)}`).join(', ')}${list.length > 8 ? ', …' : ''}`);
      return { text: out.join('\n') };
    },

    async list_templates() {
      return { text: templates.list().map((t) => `${t.id}: ${t.name} (${t.category}). ${t.description}
  creates: ${t.creates.join(', ')}${t.packages.length ? `
  installs: ${t.packages.join(', ')}` : ''}`).join('\n\n') };
    },

    async insert_template(a) {
      activity(`Inserting template ${a.id}`);
      const r = await templates.insert(String(a.id || ''), { agent: true });
      return { text: `Inserted "${r.template}": ${r.created.map((c) => c.path).join(', ')}. Read the scripts before changing them.` };
    },

    async publish_to_github(a) {
      const st = github.state();
      if (!st.signedIn) throw new Error('The user is not signed in to GitHub. Ask them to open the GitHub panel in Bloxcode and sign in.');
      if (!st.link) throw new Error('This place is not linked to a GitHub repository. Ask the user to create or link one in the GitHub panel.');
      activity('Publishing to GitHub');
      const r = await github.publish(a.message);
      return { text: r.published ? `Published ${r.files} file${r.files === 1 ? '' : 's'} to GitHub: ${r.url}` : r.message };
    },
  };

  async function call(tool, args) {
    const fn = tools[tool];
    if (!fn) throw new Error(`Unknown tool ${tool}.`);
    return fn(args || {});
  }

  // ---------- key ----------
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

  return { call, checkToken, tokenFile, tools };
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
  if (!isMac) {
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
  }
  files.push(path.join(appDataDir(), 'Claude', 'claude_desktop_config.json'));
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

module.exports = { createAgent, connectClaude, claudeConnectionState };
