// In-app chat with Claude. Two ways to reach Claude, both using the same Bloxcode tools:
//   "code": the user's own Claude Code install (their Claude plan). Bloxcode starts
//           `claude -p` with the Bloxcode MCP server and never handles the login itself.
//   "api":  the user's own Anthropic API key, with the agent loop running right here.

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, safeStorage, shell } = require('electron');
// In the packaged app the MCP server lives outside app.asar (resources/mcp), so Claude can start it.
const { TOOLS, INSTRUCTIONS, resultText } = require(app.isPackaged
  ? path.join(process.resourcesPath, 'mcp', 'bloxcode-mcp.js')
  : './mcp/bloxcode-mcp');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const API_MODEL = 'claude-opus-5-5';
const API_BETAS = ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18'];

const CHAT_PROMPT = `${INSTRUCTIONS}
- You are chatting with the user inside Bloxcode's Claude panel, a narrow sidebar. Keep replies short and use the user's language.
- Do the work with the tools instead of pasting code into the chat. End with a short summary of what you changed and what to test.`;

function createChat({ agent, mcpServerConfig, userData, emit }) {
  const dir = path.join(userData, 'chat');
  fs.mkdirSync(dir, { recursive: true });
  const settingsFile = path.join(dir, 'settings.json');

  // ---------- settings ----------
  let settings = { mode: null, apiKey: null };
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch (_) {}
  function saveSettings() { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); }

  async function getApiKey() {
    if (!settings.apiKey) return null;
    try { return (await safeStorage.decryptStringAsync(Buffer.from(settings.apiKey, 'base64'))).result; } catch (_) { return null; }
  }
  async function setApiKey(key) {
    key = String(key || '').trim();
    if (!key) throw new Error('Paste your API key first.');
    if (!/^sk-ant-/.test(key)) throw new Error('That does not look like an Anthropic API key (it starts with sk-ant-).');
    if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('This computer cannot store the key safely.');
    settings.apiKey = (await safeStorage.encryptStringAsync(key)).toString('base64');
    settings.mode = 'api';
    saveSettings();
    reset();
    return state();
  }
  function clearApiKey() {
    settings.apiKey = null;
    if (settings.mode === 'api') settings.mode = null;
    saveSettings();
    reset();
    return state();
  }
  function setMode(mode) {
    settings.mode = mode === 'api' || mode === 'code' ? mode : null;
    saveSettings();
    reset();
    return state();
  }

  // ---------- Claude Code detection ----------
  let claudeCode = { checked: false, path: null, loggedIn: false, authMethod: null, error: null };

  function candidatePaths() {
    const home = os.homedir();
    if (isWin) {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return [path.join(home, '.local', 'bin', 'claude.exe'), path.join(appData, 'npm', 'claude.cmd')];
    }
    return [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude', '/usr/local/bin/claude', path.join(home, '.npm-global', 'bin', 'claude')];
  }

  function run(file, args, opts = {}) {
    return new Promise((resolve) => {
      execFile(file, args, { timeout: 15000, windowsHide: true, shell: /\.(cmd|bat)$/i.test(file), env: childEnv(file), ...opts },
        (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    });
  }

  async function findClaude() {
    // BLOXCODE_CLAUDE_PATH points at a Claude Code binary in an unusual place (also used for testing).
    if (process.env.BLOXCODE_CLAUDE_PATH && fs.existsSync(process.env.BLOXCODE_CLAUDE_PATH)) return process.env.BLOXCODE_CLAUDE_PATH;
    for (const p of candidatePaths()) if (fs.existsSync(p)) return p;
    // Apps started from the Dock/Start menu don't see the shell PATH, so ask a login shell.
    const r = isWin
      ? await run('where.exe', ['claude'])
      : await run(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude']);
    const found = r.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l && fs.existsSync(l));
    return found || null;
  }

  async function detectClaudeCode() {
    const p = await findClaude();
    claudeCode = { checked: true, path: p, loggedIn: false, authMethod: null, error: null };
    if (p) {
      const r = await run(p, ['auth', 'status']);
      try {
        const info = JSON.parse(r.stdout);
        claudeCode.authMethod = info.authMethod || null;
        claudeCode.loggedIn = typeof info.loggedIn === 'boolean' ? info.loggedIn : r.code === 0 && info.authMethod !== 'none';
      } catch (_) {
        claudeCode.loggedIn = r.code === 0;
        if (r.code !== 0) claudeCode.error = (r.stderr || r.stdout).trim().slice(0, 300) || null;
      }
    }
    emitState();
    return state();
  }

  /** Opens a terminal that installs Claude Code (if needed) and starts the sign-in. */
  function openInstallTerminal() {
    const p = claudeCode.path;
    if (isMac) {
      const cmd = p
        ? `'${p.replace(/'/g, "'\\''")}' auth login`
        : 'curl -fsSL https://claude.ai/install.sh | bash && ~/.local/bin/claude auth login';
      const script = `${cmd}; echo; echo 'Done. You can close this window and go back to Bloxcode.'`;
      spawn('osascript', ['-e', 'tell application "Terminal" to activate', '-e', `tell application "Terminal" to do script ${JSON.stringify(script)}`], { detached: true, stdio: 'ignore' }).unref();
    } else if (isWin) {
      const cmd = p
        ? `& '${p.replace(/'/g, "''")}' auth login`
        : `irm https://claude.ai/install.ps1 | iex; & "$env:USERPROFILE\\.local\\bin\\claude.exe" auth login`;
      spawn('cmd.exe', ['/c', 'start', '"Claude sign-in"', 'powershell', '-NoExit', '-Command', `${cmd}; Write-Host ''; Write-Host 'Done. You can close this window and go back to Bloxcode.'`], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    } else {
      shell.openExternal('https://code.claude.com/docs/en/setup');
    }
  }

  // ---------- conversation state ----------
  let busy = false;
  let abort = null; // () => void for the running turn
  let apiMessages = []; // API mode history
  let codeSessionId = null; // Claude Code mode: session to resume

  function state() {
    return {
      mode: settings.mode,
      hasKey: !!settings.apiKey,
      claudeCode,
      busy,
      model: settings.mode === 'api' ? API_MODEL : null,
    };
  }
  function emitState() { emit({ type: 'state', state: state() }); }
  function setBusy(b) { busy = b; emitState(); }

  function reset() {
    if (abort) abort();
    apiMessages = [];
    codeSessionId = null;
    emit({ type: 'reset' });
    emitState();
  }

  function stop() { if (abort) abort(); }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!settings.mode) throw new Error('Choose how to connect Claude first.');
    setBusy(true);
    emit({ type: 'user', text });
    try {
      if (settings.mode === 'api') await sendApi(text);
      else await sendCode(text);
    } catch (err) {
      emit({ type: 'error', message: friendlyError(err) });
    } finally {
      abort = null;
      emit({ type: 'done' });
      setBusy(false);
    }
  }

  // ---------- tools ----------
  function validate(tool, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Tool input must be an object.';
    const schema = tool.inputSchema || {};
    for (const key of schema.required || []) if (input[key] === undefined) return `Missing "${key}".`;
    for (const [key, value] of Object.entries(input)) {
      const want = schema.properties && schema.properties[key] && schema.properties[key].type;
      if (!want || value === undefined) continue;
      const got = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      if (want !== got) return `"${key}" must be ${want}, got ${got}.`;
    }
    return null;
  }

  async function runTool(name, input) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { text: `Unknown tool ${name}.`, isError: true };
    const invalid = validate(tool, input);
    if (invalid) return { text: `Invalid input for ${name}: ${invalid} Send the call again with complete JSON.`, isError: true };
    try {
      return { text: resultText(await agent.call(name, input)), isError: false };
    } catch (err) {
      return { text: String(err && err.message || err), isError: true };
    }
  }

  // ---------- API mode ----------
  async function sendApi(text) {
    const key = await getApiKey();
    if (!key) throw new Error('No API key saved. Add one in the Claude panel.');
    const { Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true }));

    // A stopped turn can leave the history ending on a user message; add to it instead of starting a second one.
    const last = apiMessages[apiMessages.length - 1];
    if (last && last.role === 'user') last.content = [...toBlocks(last.content), { type: 'text', text }];
    else apiMessages.push({ role: 'user', content: text });

    const controller = new AbortController();
    let stopped = false;
    abort = () => { stopped = true; controller.abort(); };
    let jsonRetries = 0;

    while (!stopped) {
      const stream = client.beta.messages.stream({
        model: API_MODEL,
        max_tokens: 64000,
        system: CHAT_PROMPT,
        tools,
        messages: apiMessages,
        thinking: { type: 'adaptive', display: 'updates' },
        output_config: { effort: 'high' },
        cache_control: { type: 'ephemeral' },
        betas: API_BETAS,
        fallbacks: 'default',
      }, { signal: controller.signal });
      stream.on('text', (delta) => emit({ type: 'text', text: delta }));
      stream.on('thinking', (delta) => { if (delta) emit({ type: 'note', text: delta }); });

      let message;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (stopped || err instanceof Anthropic.APIUserAbortError) return;
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue; // a tool input was not valid JSON: ask again
      }

      if (message.stop_reason === 'refusal') {
        emit({ type: 'error', message: 'Claude declined this request. Try rephrasing it.' });
        return;
      }
      apiMessages.push({ role: 'assistant', content: message.content });
      if (message.stop_reason === 'pause_turn') continue;

      const calls = message.content.filter((b) => b.type === 'tool_use');
      if (!calls.length) return;
      if (message.stop_reason === 'max_tokens') {
        // The last tool input may be cut off: don't run it, tell Claude instead.
        apiMessages.push({ role: 'user', content: calls.map((c) => ({ type: 'tool_result', tool_use_id: c.id, is_error: true, content: 'Your reply was cut off before this call finished. Split the work into smaller steps.' })) });
        continue;
      }

      const results = [];
      for (const call of calls) {
        if (stopped) {
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'The user stopped this turn.' });
          continue;
        }
        emit({ type: 'tool', name: call.name, input: call.input });
        const r = await runTool(call.name, call.input);
        emit({ type: 'tool_result', name: call.name, isError: r.isError, text: r.isError ? r.text.slice(0, 300) : '' });
        results.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.isError ? { is_error: true } : {}) });
      }
      apiMessages.push({ role: 'user', content: results });
    }
  }

  function toBlocks(content) {
    return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  }

  // ---------- Claude Code mode ----------
  function childEnv(file) {
    // Make sure the CLI (and node, for npm installs) is on PATH even when Bloxcode was started from the Dock.
    const extra = [file ? path.dirname(file) : null, ...(isWin ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin')])].filter(Boolean);
    const env = { ...process.env, PATH: [...extra, process.env.PATH || ''].join(path.delimiter) };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  function quoteWin(arg) { return `"${String(arg).replace(/"/g, '""')}"`; }

  async function sendCode(text) {
    if (!claudeCode.path) await detectClaudeCode();
    if (!claudeCode.path) throw new Error('Claude Code is not installed yet. Click "Install & sign in" in the Claude panel.');

    const mcpFile = path.join(dir, 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { bloxcode: mcpServerConfig() } }, null, 2));
    const promptFile = path.join(dir, 'system-prompt.txt');
    fs.writeFileSync(promptFile, CHAT_PROMPT);

    const args = [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--mcp-config', mcpFile, '--strict-mcp-config',
      '--tools', '', // no file/shell tools, only Bloxcode
      '--allowedTools', 'mcp__bloxcode__*',
      '--permission-mode', 'dontAsk',
      '--append-system-prompt-file', promptFile,
      ...(codeSessionId ? ['--resume', codeSessionId] : []),
    ];
    const useShell = /\.(cmd|bat)$/i.test(claudeCode.path);
    const child = useShell
      ? spawn(quoteWin(claudeCode.path), args.map(quoteWin), { cwd: dir, env: childEnv(claudeCode.path), shell: true, windowsHide: true })
      : spawn(claudeCode.path, args, { cwd: dir, env: childEnv(claudeCode.path), windowsHide: true });

    let stopped = false;
    abort = () => { stopped = true; try { child.kill(); } catch (_) {} };
    child.stdin.end(text);

    let gotResult = false;
    let stderr = '';
    let buffer = '';
    const toolNames = new Map(); // tool_use_id -> name
    const streamed = new Set(); // message ids whose text came as stream events
    let streamingId = null;

    const handle = (msg) => {
      if (msg.session_id) codeSessionId = msg.session_id;
      if (msg.type === 'system' && msg.subtype === 'init') {
        const server = (msg.mcp_servers || []).find((s) => s.name === 'bloxcode');
        if (server && server.status !== 'connected') emit({ type: 'error', message: `Claude could not start the Bloxcode tools (${server.status}).` });
      } else if (msg.type === 'stream_event') {
        const e = msg.event || {};
        if (e.type === 'message_start' && e.message) streamingId = e.message.id;
        if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') {
          streamed.add(streamingId);
          emit({ type: 'text', text: e.delta.text });
        }
      } else if (msg.type === 'assistant') {
        const m = msg.message || {};
        for (const b of m.content || []) {
          // Text normally arrives as stream events; show it here only if it didn't (errors are reported by the result).
          if (b.type === 'text' && !streamed.has(m.id) && m.model !== '<synthetic>') emit({ type: 'text', text: b.text });
          if (b.type !== 'tool_use') continue;
          const name = String(b.name).replace(/^mcp__bloxcode__/, '');
          toolNames.set(b.id, name);
          emit({ type: 'tool', name, input: b.input });
        }
      } else if (msg.type === 'user') {
        const content = (msg.message && msg.message.content) || [];
        for (const b of Array.isArray(content) ? content : []) {
          if (b.type !== 'tool_result') continue;
          const out = Array.isArray(b.content) ? b.content.map((c) => c.text || '').join('\n') : String(b.content || '');
          emit({ type: 'tool_result', name: toolNames.get(b.tool_use_id) || '', isError: !!b.is_error, text: b.is_error ? out.slice(0, 300) : '' });
        }
      } else if (msg.type === 'result') {
        gotResult = true;
        if (msg.is_error || msg.subtype !== 'success') {
          emit({ type: 'error', message: codeErrorText(String(msg.result || msg.subtype || 'Claude stopped with an error.')) });
        }
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        try { handle(JSON.parse(line)); } catch (_) { /* not JSON */ }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-4000); });

    const code = await new Promise((resolve) => {
      child.on('error', (err) => { stderr += String(err.message); resolve(-1); });
      child.on('close', resolve);
    });
    if (stopped || gotResult) return;
    if (code !== 0) throw new Error(codeErrorText(stderr.trim() || `Claude Code exited with code ${code}.`));
  }

  function codeErrorText(text) {
    if (/log ?in|logged in|auth|api key|401/i.test(text)) {
      claudeCode.loggedIn = false;
      emitState();
      return 'Claude Code is not signed in. Click "Install & sign in" in the Claude panel, then try again.';
    }
    return text.slice(0, 500);
  }

  function friendlyError(err) {
    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in the Claude panel.';
      if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use this model.';
      if (err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a moment and try again.';
      if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your internet connection.';
      if (err instanceof Anthropic.APIError) return `Claude API error ${err.status || ''}: ${err.message}`.trim();
    } catch (_) {}
    return String(err && err.message || err);
  }

  return { state, detectClaudeCode, openInstallTerminal, setMode, setApiKey, clearApiKey, send, stop, reset };
}

module.exports = { createChat };
