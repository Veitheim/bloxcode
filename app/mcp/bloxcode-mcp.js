#!/usr/bin/env node
// Bloxcode MCP server. Claude starts this file (with Bloxcode.exe in Node mode) and talks to it
// over stdin/stdout. Every tool call is forwarded to the running Bloxcode app, which forwards it
// to Roblox Studio. No dependencies, so it runs straight from the app's resources folder.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.BLOXCODE_PORT) || 34872;
const KEY_FILE = process.env.BLOXCODE_KEY_FILE || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Bloxcode', 'agent-key.txt');
const VERSION = '1.2.0';

const INSTRUCTIONS = `You are connected to Bloxcode, an external code editor that is live-synced with the user's open Roblox Studio place.
- Everything you change lands in Studio right away and is one Ctrl+Z step there. The user watches your edits live in Bloxcode.
- Address instances by dotted path (ServerScriptService.Main) or by id (#42) from get_explorer. Paths are case-sensitive.
- Start with get_explorer to learn the game's structure, then read_script before changing code. Prefer edit_script for small changes and write_script for new or rewritten scripts.
- Script = server (ServerScriptService), LocalScript = client (StarterPlayer.StarterPlayerScripts, StarterGui, StarterCharacterScripts), ModuleScript = shared code (ReplicatedStorage) or server-only code (ServerScriptService/ServerStorage). Use RemoteEvent/RemoteFunction in ReplicatedStorage for client-server communication and never trust the client.
- Write modern Luau: game:GetService, task.wait/task.spawn instead of wait/spawn, typed code where it helps, no deprecated APIs.
- You cannot press Play. Ask the user to play-test, then call get_output (errors_only) to read errors and warnings from the test, and fix them.
- Wally packages: search_packages and install_package. Shared packages go to ReplicatedStorage.Packages, server packages to ServerScriptService.ServerPackages.
- If a tool says Studio is not connected or the plugin is old, tell the user exactly what to do instead of retrying.`;

const pathProp = { type: 'string', description: 'Dotted path like "ServerScriptService.Main" or an id like "#42".' };

const TOOLS = [
  { name: 'get_status', description: 'Check whether Bloxcode is connected to Roblox Studio and which place is open.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  {
    name: 'get_explorer',
    description: 'Show the Explorer tree (like Studio\'s Explorer) with class names and ids. Without a path it lists the services two levels deep. Use path and depth to look deeper.',
    inputSchema: { type: 'object', properties: {
      path: { ...pathProp, description: 'Start here instead of the top. ' + pathProp.description },
      depth: { type: 'number', description: 'How many levels to show (default 2 at the top, 4 below a path).' },
      scripts_only: { type: 'boolean', description: 'Only show scripts and the folders that contain them.' },
      max_lines: { type: 'number', description: 'Maximum lines (default 400).' },
    } },
    annotations: { readOnlyHint: true },
  },
  { name: 'read_script', description: 'Read the source code of a Script, LocalScript or ModuleScript, with line numbers.', inputSchema: { type: 'object', properties: { path: pathProp, line_numbers: { type: 'boolean', description: 'Default true.' } }, required: ['path'] }, annotations: { readOnlyHint: true } },
  { name: 'write_script', description: 'Replace the whole source of an existing script.', inputSchema: { type: 'object', properties: { path: pathProp, source: { type: 'string', description: 'The complete new source code.' } }, required: ['path', 'source'] } },
  {
    name: 'edit_script',
    description: 'Replace an exact piece of text in a script. old_text must match exactly once (include a few surrounding lines) unless replace_all is set. Do not include line numbers.',
    inputSchema: { type: 'object', properties: { path: pathProp, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_text', 'new_text'] },
  },
  {
    name: 'create_instance',
    description: 'Create any instance (Script, LocalScript, ModuleScript, RemoteEvent, RemoteFunction, Folder, Part, ScreenGui, TextLabel, …) inside a parent. Scripts can get their source right away.',
    inputSchema: { type: 'object', properties: {
      parent: { ...pathProp, description: 'Where to create it. ' + pathProp.description },
      class_name: { type: 'string', description: 'Roblox class name, e.g. "ModuleScript".' },
      name: { type: 'string' },
      source: { type: 'string', description: 'Source code for scripts.' },
      properties: { type: 'object', description: 'Optional properties, same format as set_properties.' },
    }, required: ['parent', 'class_name', 'name'] },
  },
  { name: 'rename_instance', description: 'Rename an instance.', inputSchema: { type: 'object', properties: { path: pathProp, new_name: { type: 'string' } }, required: ['path', 'new_name'] } },
  { name: 'move_instance', description: 'Move an instance to a new parent.', inputSchema: { type: 'object', properties: { path: pathProp, new_parent: pathProp }, required: ['path', 'new_parent'] } },
  { name: 'delete_instance', description: 'Delete an instance and everything inside it (the user can undo with Ctrl+Z in Studio). Ask the user before deleting things you did not create.', inputSchema: { type: 'object', properties: { path: pathProp }, required: ['path'] }, annotations: { destructiveHint: true } },
  {
    name: 'get_properties',
    description: 'Read properties, attributes and tags of an instance. Without names it returns common properties (Size, Position, Color, Text, Value, …).',
    inputSchema: { type: 'object', properties: { path: pathProp, names: { type: 'array', items: { type: 'string' }, description: 'Specific property names to read.' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'set_properties',
    description: 'Set properties, attributes and tags. Numbers, booleans and strings are passed as they are. Other types: {"type":"Vector3","value":[x,y,z]}, {"type":"Color3","value":[r,g,b]} (0-255) or {"type":"Color3","value":"#ff8800"}, {"type":"UDim2","value":[xScale,xOffset,yScale,yOffset]}, {"type":"UDim","value":[scale,offset]}, {"type":"Vector2","value":[x,y]}, {"type":"CFrame","value":[x,y,z]} or [x,y,z,rx,ry,rz] in degrees, {"type":"Enum","value":"Enum.Material.Neon"}, {"type":"BrickColor","value":"Bright red"}, {"type":"Instance","value":"Workspace.Part"}, {"type":"nil"}.',
    inputSchema: { type: 'object', properties: {
      path: pathProp,
      properties: { type: 'object' },
      attributes: { type: 'object', description: 'Attributes to set (same value format). Use {"type":"nil"} to remove one.' },
      add_tags: { type: 'array', items: { type: 'string' } },
      remove_tags: { type: 'array', items: { type: 'string' } },
    }, required: ['path'] },
  },
  { name: 'search_scripts', description: 'Search the source of every script for some text (not case-sensitive). Returns path:line matches.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
  {
    name: 'get_output',
    description: 'Read the Studio Output window: prints, warnings and errors, including from play tests (labeled server/client). Use after the user play-tested.',
    inputSchema: { type: 'object', properties: {
      since: { type: 'number', description: 'Only lines after this seq number.' },
      errors_only: { type: 'boolean', description: 'Only warnings and errors.' },
      limit: { type: 'number', description: 'Maximum lines (default 200).' },
      clear: { type: 'boolean', description: 'Clear the stored output after reading.' },
    } },
    annotations: { readOnlyHint: true },
  },
  { name: 'get_selection', description: 'What the user has selected in Studio right now. Useful when they say "this script" or "the selected part".', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'open_in_editor', description: 'Open a script in a Bloxcode tab so the user sees it.', inputSchema: { type: 'object', properties: { path: pathProp }, required: ['path'] } },
  { name: 'search_packages', description: 'Search the Wally package registry (e.g. "cmdr", "knit", "promise").', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
  { name: 'install_package', description: 'Install a Wally package with its dependencies into the place, e.g. "evaera/cmdr" or "sleitnick/knit@1.7".', inputSchema: { type: 'object', properties: { package: { type: 'string' } }, required: ['package'] } },
];

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
      timeout: 120000,
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

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'bloxcode', title: 'Bloxcode (Roblox Studio)', version: VERSION },
      instructions: INSTRUCTIONS,
    } });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const name = params && params.name;
    const r = await callBloxcode(name, (params && params.arguments) || {});
    if (r.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.error }], isError: true } });
    const res = r.result;
    const text = res && typeof res.text === 'string' ? res.text : JSON.stringify(res, null, 2);
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
  }
  if (id !== undefined && method) return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  // notifications (initialized, cancelled, …) need no answer
}

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
