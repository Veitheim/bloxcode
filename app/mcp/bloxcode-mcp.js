#!/usr/bin/env node
// Bloxcode MCP server. Claude starts this file (with Bloxcode.exe in Node mode) and talks to it
// over stdin/stdout, or Bloxcode's own chat starts it through Claude Code. Every tool call is
// forwarded to the running Bloxcode app, which forwards it to Roblox Studio.
// No dependencies, so it runs straight from the app's resources folder.
//
// Besides tools it offers resources (the Explorer, the Output, problems, every script) and
// prompts (ready-made tasks like "fix the errors from my play test").

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.BLOXCODE_PORT) || 34872;
const KEY_FILE = process.env.BLOXCODE_KEY_FILE || path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Bloxcode', 'agent-key.txt');
const VERSION = '2.0.0';

const INSTRUCTIONS = `You are a senior Roblox developer working inside the user's open Roblox Studio place through Bloxcode, an external code editor that is live-synced with Studio.

How changes work
- Everything you change lands in Studio right away. Each change is one Ctrl+Z step there, and the user watches your edits live in Bloxcode. The undo tool reverts your last steps.
- The user may have "Review Claude's changes" turned on. Then script changes wait for their approval; a rejection comes back as a tool error with their reason. Respect it.
- Address instances by dotted path (ServerScriptService.Main) or by id (#42) from get_explorer. Paths are case-sensitive.

Workflow
1. Orient: get_status, then get_explorer (scripts_only for a code overview). Read the scripts that matter (read_scripts reads several at once) before changing anything. Use search_scripts to find where things are defined or used.
2. Change: edit_script for focused changes (several edits in one call with "edits"), write_script for new or rewritten scripts, create_instance / create_tree for new objects (create_tree builds a whole GUI or model in one step), set_properties for parts and GUIs.
3. Check: get_diagnostics shows Luau type errors without running the game. Fix them before you hand over.
4. Test: start_playtest with seconds runs the game, stops it and returns the Output. While a test runs, run_code with where="server" or "client" inspects the live game. Read errors with get_output (errors_only) and fix them. If tools for play tests are unavailable, ask the user to press Play and tell you when they are done.
5. Finish with a short summary: what you changed (paths), what to test, anything left open.

Roblox rules
- Script = server (ServerScriptService), LocalScript = client (StarterPlayer.StarterPlayerScripts, StarterGui, StarterCharacterScripts), ModuleScript = shared code (ReplicatedStorage) or server-only code (ServerScriptService, ServerStorage).
- Client and server talk through RemoteEvent / RemoteFunction in ReplicatedStorage (a Remotes folder). Never trust the client: validate every argument on the server, rate-limit, and keep money, damage and inventory on the server.
- Modern Luau: game:GetService, task.wait / task.spawn / task.delay, no deprecated APIs (wait, spawn, delay, Instance.new with a parent argument). Use types where they help, early returns, and clean up connections.
- Use DataStoreService with pcall and retries for saving, and save on PlayerRemoving and BindToClose.
- Follow the style and structure already in the game. Keep scripts focused; put shared logic in ModuleScripts.
- Wally packages: search_packages and install_package (shared packages go to ReplicatedStorage.Packages, server packages to ServerScriptService.ServerPackages).
- Ask before deleting things you did not create or rewriting large parts of the game.
- If a tool says Studio is not connected or the plugin is old, tell the user exactly what to do instead of retrying.`;

const pathProp = { type: 'string', description: 'Dotted path like "ServerScriptService.Main" or an id like "#42".' };
const RO = { readOnlyHint: true };

const VALUE_FORMAT = 'Numbers, booleans and strings are passed as they are. Other types: {"type":"Vector3","value":[x,y,z]}, {"type":"Color3","value":[r,g,b]} (0-255) or {"type":"Color3","value":"#ff8800"}, {"type":"UDim2","value":[xScale,xOffset,yScale,yOffset]}, {"type":"UDim","value":[scale,offset]}, {"type":"Vector2","value":[x,y]}, {"type":"CFrame","value":[x,y,z]} or [x,y,z,rx,ry,rz] in degrees, {"type":"Enum","value":"Enum.Material.Neon"}, {"type":"BrickColor","value":"Bright red"}, {"type":"Instance","value":"Workspace.Part"}, {"type":"nil"}.';

const TOOLS = [
  // ---------- overview ----------
  { name: 'get_status', title: 'Status', description: 'Check that Bloxcode is connected to Roblox Studio, which place is open, whether the type checker and a play test are running, and the linked GitHub repo.', inputSchema: { type: 'object', properties: {} }, annotations: RO },
  {
    name: 'get_explorer', title: 'Explorer',
    description: 'Show the Explorer tree (like Studio\'s Explorer) with class names and ids. Without a path it lists the services two levels deep. Use path and depth to look deeper, scripts_only for a code overview.',
    inputSchema: { type: 'object', properties: {
      path: { ...pathProp, description: 'Start here instead of the top. ' + pathProp.description },
      depth: { type: 'number', description: 'How many levels to show (default 2 at the top, 4 below a path).' },
      scripts_only: { type: 'boolean', description: 'Only show scripts and the folders that contain them.' },
      class_filter: { type: 'string', description: 'Only list these classes, comma separated (e.g. "RemoteEvent,RemoteFunction").' },
      max_lines: { type: 'number', description: 'Maximum lines (default 400).' },
    } },
    annotations: RO,
  },
  { name: 'get_selection', title: 'Studio selection', description: 'What the user has selected in Studio right now. Use it when they say "this script" or "the selected part".', inputSchema: { type: 'object', properties: {} }, annotations: RO },
  { name: 'get_editor_state', title: 'Bloxcode editor', description: 'The script open in Bloxcode right now, the cursor position, the selected text and all open tabs. Use it when the user says "this code" or "here".', inputSchema: { type: 'object', properties: {} }, annotations: RO },

  // ---------- scripts ----------
  { name: 'read_script', title: 'Read script', description: 'Read the source of a Script, LocalScript or ModuleScript with line numbers. Use start_line/end_line for long scripts.', inputSchema: { type: 'object', properties: { path: pathProp, start_line: { type: 'number' }, end_line: { type: 'number' }, line_numbers: { type: 'boolean', description: 'Default true.' } }, required: ['path'] }, annotations: RO },
  { name: 'read_scripts', title: 'Read scripts', description: 'Read up to 20 scripts in one call.', inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] }, annotations: RO },
  { name: 'write_script', title: 'Write script', description: 'Replace the whole source of an existing script. For new scripts use create_instance with source.', inputSchema: { type: 'object', properties: { path: pathProp, source: { type: 'string', description: 'The complete new source code.' } }, required: ['path', 'source'] } },
  {
    name: 'edit_script', title: 'Edit script',
    description: 'Replace exact pieces of text in a script. Each old_text must match exactly once (include a few surrounding lines) unless replace_all is set. Do not include line numbers. Pass several changes at once with "edits"; either all apply or none.',
    inputSchema: { type: 'object', properties: {
      path: pathProp, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' },
      edits: { type: 'array', description: 'Several edits: [{ "old_text": "…", "new_text": "…", "replace_all": false }]', items: { type: 'object', properties: { old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['old_text', 'new_text'] } },
    }, required: ['path'] },
  },
  {
    name: 'search_scripts', title: 'Search scripts',
    description: 'Search every script for text or a regular expression. Returns path:line matches.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, regex: { type: 'boolean' }, case_sensitive: { type: 'boolean' }, whole_word: { type: 'boolean' }, include: { type: 'string', description: 'Only scripts whose path contains this text.' }, limit: { type: 'number' } }, required: ['query'] },
    annotations: RO,
  },
  {
    name: 'replace_in_scripts', title: 'Replace in scripts',
    description: 'Search and replace across all scripts (or only paths containing include) in one undo step. In regex mode, $1 … $9 insert groups.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, replacement: { type: 'string' }, regex: { type: 'boolean' }, case_sensitive: { type: 'boolean' }, whole_word: { type: 'boolean' }, include: { type: 'string' } }, required: ['query', 'replacement'] },
  },
  { name: 'get_diagnostics', title: 'Type errors', description: 'Luau type errors (and with include_warnings also warnings) from the luau-lsp type checker, for all scripts or one path. Checks code without running the game.', inputSchema: { type: 'object', properties: { path: pathProp, include_warnings: { type: 'boolean' } } }, annotations: RO },
  { name: 'open_in_editor', title: 'Open in Bloxcode', description: 'Open a script in a Bloxcode tab so the user sees it.', inputSchema: { type: 'object', properties: { path: pathProp }, required: ['path'] } },
  { name: 'get_script_history', title: 'Script history', description: 'Earlier versions of a script saved by Bloxcode (who changed it and when).', inputSchema: { type: 'object', properties: { path: pathProp }, required: ['path'] }, annotations: RO },
  { name: 'restore_script_version', title: 'Restore version', description: 'Restore an earlier version of a script from get_script_history.', inputSchema: { type: 'object', properties: { path: pathProp, version: { type: 'number' } }, required: ['path', 'version'] } },

  // ---------- instances ----------
  {
    name: 'create_instance', title: 'Create instance',
    description: 'Create any instance (Script, LocalScript, ModuleScript, RemoteEvent, Folder, Part, ScreenGui, …) inside a parent. Scripts can get their source right away.',
    inputSchema: { type: 'object', properties: {
      parent: { ...pathProp, description: 'Where to create it. ' + pathProp.description },
      class_name: { type: 'string', description: 'Roblox class name, e.g. "ModuleScript".' },
      name: { type: 'string' },
      source: { type: 'string', description: 'Source code for scripts.' },
      properties: { type: 'object', description: 'Optional properties, same format as set_properties.' },
    }, required: ['parent', 'class_name', 'name'] },
  },
  {
    name: 'create_tree', title: 'Create tree',
    description: 'Create a whole tree of instances in one undo step: a GUI with frames, buttons and a LocalScript, a model with parts, a folder of RemoteEvents. Node format: { "class": "Frame", "name": "Shop", "properties": {…}, "attributes": {…}, "tags": ["…"], "source": "…", "children": [ …nodes ] }. ' + VALUE_FORMAT,
    inputSchema: { type: 'object', properties: { parent: pathProp, tree: { type: 'object' } }, required: ['parent', 'tree'] },
  },
  { name: 'duplicate_instance', title: 'Duplicate', description: 'Duplicate an instance (optionally into another parent).', inputSchema: { type: 'object', properties: { path: pathProp, new_parent: pathProp }, required: ['path'] } },
  { name: 'rename_instance', title: 'Rename', description: 'Rename an instance.', inputSchema: { type: 'object', properties: { path: pathProp, new_name: { type: 'string' } }, required: ['path', 'new_name'] } },
  { name: 'move_instance', title: 'Move', description: 'Move an instance to a new parent.', inputSchema: { type: 'object', properties: { path: pathProp, new_parent: pathProp }, required: ['path', 'new_parent'] } },
  { name: 'delete_instance', title: 'Delete', description: 'Delete an instance and everything inside it (the user can undo with Ctrl+Z). Ask the user before deleting things you did not create.', inputSchema: { type: 'object', properties: { path: pathProp }, required: ['path'] }, annotations: { destructiveHint: true } },
  { name: 'get_properties', title: 'Read properties', description: 'Read properties, attributes and tags of an instance. Without names it returns common properties (Size, Position, Color, Text, Value, …).', inputSchema: { type: 'object', properties: { path: pathProp, names: { type: 'array', items: { type: 'string' }, description: 'Specific property names to read.' } }, required: ['path'] }, annotations: RO },
  {
    name: 'set_properties', title: 'Set properties',
    description: 'Set properties, attributes and tags of one instance (path) or several (paths). ' + VALUE_FORMAT,
    inputSchema: { type: 'object', properties: {
      path: pathProp, paths: { type: 'array', items: { type: 'string' } },
      properties: { type: 'object' }, attributes: { type: 'object', description: 'Attributes to set (same value format). {"type":"nil"} removes one.' },
      add_tags: { type: 'array', items: { type: 'string' } }, remove_tags: { type: 'array', items: { type: 'string' } },
    } },
  },
  { name: 'set_selection', title: 'Select in Studio', description: 'Select instances in Studio (to show the user what you mean).', inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] } },
  { name: 'insert_asset', title: 'Insert asset', description: 'Insert a Roblox asset (model, mesh, …) by asset id, like the Toolbox does. Only assets the user may use work.', inputSchema: { type: 'object', properties: { asset_id: { type: 'number' }, parent: pathProp }, required: ['asset_id'] } },

  // ---------- undo ----------
  { name: 'undo', title: 'Undo', description: 'Undo the last steps in Studio (same as Ctrl+Z). Every Bloxcode change is one step.', inputSchema: { type: 'object', properties: { steps: { type: 'number', description: 'Default 1.' } } } },
  { name: 'redo', title: 'Redo', description: 'Redo steps that were undone.', inputSchema: { type: 'object', properties: { steps: { type: 'number' } } } },

  // ---------- running ----------
  { name: 'run_code', title: 'Run Luau', description: 'Run Luau code and get its prints and return value. where="edit" runs in the edit place (one undo step; good for bulk changes or checking things), where="server" or "client" runs inside a running play test.', inputSchema: { type: 'object', properties: { code: { type: 'string' }, where: { type: 'string', enum: ['edit', 'server', 'client'] } }, required: ['code'] } },
  { name: 'start_playtest', title: 'Start play test', description: 'Start a play test. mode "play" spawns a player, "run" runs the server only. With seconds (max 120) it runs that long, stops, and returns the Output of the test.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['play', 'run'] }, seconds: { type: 'number' } } } },
  { name: 'stop_playtest', title: 'Stop play test', description: 'Stop the running play test.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_playtest_state', title: 'Play test state', description: 'Whether a play test is running (server and client).', inputSchema: { type: 'object', properties: {} }, annotations: RO },
  {
    name: 'get_output', title: 'Output',
    description: 'Read the Studio Output: prints, warnings and errors, including from play tests (labeled server/client).',
    inputSchema: { type: 'object', properties: {
      since: { type: 'number', description: 'Only lines after this seq number.' },
      errors_only: { type: 'boolean', description: 'Only warnings and errors.' },
      context: { type: 'string', enum: ['edit', 'server', 'client'] },
      limit: { type: 'number', description: 'Maximum lines (default 200).' },
      clear: { type: 'boolean', description: 'Clear the stored output after reading.' },
    } },
    annotations: RO,
  },

  // ---------- packages and GitHub ----------
  { name: 'search_packages', title: 'Search Wally', description: 'Search the Wally package registry (e.g. "cmdr", "knit", "promise").', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, annotations: RO },
  { name: 'install_package', title: 'Install package', description: 'Install a Wally package with its dependencies into the place, e.g. "evaera/cmdr" or "sleitnick/knit@1.7".', inputSchema: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] } },
  { name: 'publish_to_github', title: 'Publish to GitHub', description: 'Publish all scripts to the GitHub repository linked in Bloxcode (only when the user asks for it).', inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Commit message.' } } } },
];

// ---------- resources ----------
const RESOURCES = [
  { uri: 'bloxcode://explorer', name: 'Explorer', description: 'The place\'s instance tree with scripts', mimeType: 'text/plain' },
  { uri: 'bloxcode://output', name: 'Output', description: 'Recent Studio output (prints, warnings, errors)', mimeType: 'text/plain' },
  { uri: 'bloxcode://problems', name: 'Problems', description: 'Luau type errors in all scripts', mimeType: 'text/plain' },
  { uri: 'bloxcode://editor', name: 'Open script', description: 'The script open in Bloxcode and the selected text', mimeType: 'text/plain' },
];
const RESOURCE_TEMPLATES = [
  { uriTemplate: 'bloxcode://script/{path}', name: 'Script', description: 'Source of a script by dotted path, e.g. bloxcode://script/ServerScriptService.Main', mimeType: 'text/x-luau' },
];

// ---------- prompts ----------
const PROMPTS = [
  { name: 'build_feature', title: 'Build a feature', description: 'Plan and build a game feature end to end.', arguments: [{ name: 'feature', description: 'What to build, e.g. "a coin shop"', required: true }] },
  { name: 'fix_errors', title: 'Fix errors', description: 'Run a play test, read the errors and fix them.', arguments: [] },
  { name: 'review_code', title: 'Review code', description: 'Review scripts for bugs, exploits and performance problems.', arguments: [{ name: 'path', description: 'Script or folder (default: the whole game)', required: false }] },
  { name: 'explain_game', title: 'Explain this game', description: 'Explain how the game\'s code is organized.', arguments: [] },
  { name: 'secure_remotes', title: 'Secure remotes', description: 'Check every RemoteEvent and RemoteFunction for missing server-side checks.', arguments: [] },
];

function promptText(name, args) {
  switch (name) {
    case 'build_feature': return `Build this feature in my game: ${args.feature || '(describe it)'}\n\nFirst look at how my game is organized and which scripts are related. Then tell me your plan in a few bullet points, build it with the Bloxcode tools, check get_diagnostics, run a short play test if you can, and finish with a summary of what changed and what I should test.`;
    case 'fix_errors': return 'Run a short play test (start_playtest with seconds: 15), read the errors from the Output, find their cause in the scripts and fix them. Repeat until the test runs without errors, then summarize what was wrong.';
    case 'review_code': return `Review ${args.path ? args.path : 'all scripts in my game'} for bugs, exploits (unchecked remotes, client-trusted values), memory leaks (connections that are never cleaned up), deprecated APIs and performance problems. List the findings by severity with path:line, then ask me which ones to fix.`;
    case 'explain_game': return 'Explain how my game is organized: the main systems, which scripts run on the server and on the client, how they talk through remotes, and where data is saved. Keep it short and use paths.';
    case 'secure_remotes': return 'Find every RemoteEvent and RemoteFunction and the server code that listens to them. For each one, check that the server validates types and ranges of all arguments, checks ownership and cooldowns, and never trusts values like prices or damage from the client. List the problems, then fix them.';
    default: return '';
  }
}

/** Turns a tool result from Bloxcode into the text Claude sees. */
function resultText(res) {
  return res && typeof res.text === 'string' ? res.text : JSON.stringify(res, null, 2);
}

function readKey() {
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch (_) { return null; }
}

function callBloxcode(tool, args) {
  return new Promise((resolve) => {
    const key = readKey();
    if (!key) return resolve({ error: 'Bloxcode is not set up on this PC yet. Ask the user to install and open Bloxcode (https://bloxcode-docs.seidl.workers.dev/download), then click "Connect Claude" in the Claude panel.' });
    const body = JSON.stringify({ tool, args });
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/agent', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + key },
      timeout: 20 * 60 * 1000, // reviews and play tests can take a while
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { resolve({ error: `Bloxcode answered with HTTP ${res.statusCode}.` }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Bloxcode did not answer in time.' }); });
    req.on('error', (e) => resolve({ error: e.code === 'ECONNREFUSED' ? 'Bloxcode is not running. Ask the user to open the Bloxcode app (and turn on Code Mode in Roblox Studio).' : 'Could not reach Bloxcode: ' + e.message }));
    req.end(body);
  });
}

async function readResource(uri) {
  const call = async (tool, args) => {
    const r = await callBloxcode(tool, args);
    if (r.error) throw new Error(r.error);
    return resultText(r.result);
  };
  if (uri === 'bloxcode://explorer') return call('get_explorer', { scripts_only: false, depth: 3 });
  if (uri === 'bloxcode://output') return call('get_output', { limit: 300 });
  if (uri === 'bloxcode://problems') return call('get_diagnostics', { include_warnings: true });
  if (uri === 'bloxcode://editor') return call('get_editor_state', {});
  const m = uri.match(/^bloxcode:\/\/script\/(.+)$/);
  if (m) return call('read_script', { path: decodeURIComponent(m[1]), line_numbers: false });
  throw new Error(`Unknown resource ${uri}`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[1],
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'bloxcode', title: 'Bloxcode (Roblox Studio)', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      const r = await callBloxcode(name, (params && params.arguments) || {});
      if (r.error) return reply({ content: [{ type: 'text', text: r.error }], isError: true });
      return reply({ content: [{ type: 'text', text: resultText(r.result) }] });
    }
    case 'resources/list': return reply({ resources: RESOURCES });
    case 'resources/templates/list': return reply({ resourceTemplates: RESOURCE_TEMPLATES });
    case 'resources/read': {
      try {
        const text = await readResource(params.uri);
        return reply({ contents: [{ uri: params.uri, mimeType: 'text/plain', text }] });
      } catch (e) { return fail(-32002, e.message); }
    }
    case 'prompts/list': return reply({ prompts: PROMPTS });
    case 'prompts/get': {
      const p = PROMPTS.find((x) => x.name === (params && params.name));
      if (!p) return fail(-32602, 'Unknown prompt');
      return reply({ description: p.description, messages: [{ role: 'user', content: { type: 'text', text: promptText(p.name, (params && params.arguments) || {}) } }] });
    }
    default:
      if (id !== undefined && method) return fail(-32601, `Method not found: ${method}`);
  }
  // notifications (initialized, cancelled, …) need no answer
}

// The in-app chat (app/chat.js) reuses the tool list; only start the stdio server when run directly.
if (require.main === module) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      handle(msg).catch((e) => msg.id !== undefined && send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e && e.message || e) } }));
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

module.exports = { TOOLS, INSTRUCTIONS, PROMPTS, promptText, resultText };
