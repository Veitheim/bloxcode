// Discord Rich Presence: "Editing Main.server.luau in My Obby" on your Discord profile.
// Talks to the Discord app over its local IPC socket; nothing goes over the internet.

const net = require('net');
const path = require('path');
const os = require('os');

const CLIENT_ID = require('./ids').DISCORD_CLIENT_ID;
const WEBSITE = 'https://bloxcode-docs.seidl.workers.dev';

function socketPath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(dir.replace(/\/$/, ''), `discord-ipc-${i}`);
}

function encode(op, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function createDiscord({ onState }) {
  let enabled = false;
  let options = { showFile: true, showPlace: true };
  let sock = null;
  let ready = false;
  let retry = null;
  let activity = null;
  let started = Date.now();
  let status = 'off';

  function setStatus(s) { if (s !== status) { status = s; onState && onState(s); } }

  function connect(i = 0) {
    if (!enabled || sock || !CLIENT_ID) { if (!CLIENT_ID && enabled) setStatus('unavailable'); return; }
    if (i > 9) { setStatus('waiting'); scheduleRetry(); return; }
    const s = net.createConnection(socketPath(i));
    let opened = false;
    s.once('connect', () => {
      opened = true;
      sock = s;
      s.write(encode(0, { v: 1, client_id: CLIENT_ID }));
    });
    let buf = Buffer.alloc(0);
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = null;
        try { msg = JSON.parse(buf.slice(8, 8 + len).toString('utf8')); } catch (_) {}
        buf = buf.slice(8 + len);
        if (msg && msg.evt === 'READY') { ready = true; setStatus('connected'); push(); }
      }
    });
    s.on('error', () => { if (!opened) connect(i + 1); });
    s.on('close', () => {
      if (sock === s) { sock = null; ready = false; setStatus(enabled ? 'waiting' : 'off'); scheduleRetry(); }
    });
  }

  function scheduleRetry() {
    clearTimeout(retry);
    if (enabled) retry = setTimeout(() => connect(0), 15000);
  }

  function push() {
    if (!sock || !ready) return;
    const a = activity;
    const payload = a ? {
      details: a.file && options.showFile ? `Editing ${a.file}`.slice(0, 128) : 'Writing Roblox code',
      state: (a.place && options.showPlace ? `in ${a.place}` : a.connected ? 'Connected to Roblox Studio' : 'Waiting for Studio').slice(0, 128),
      timestamps: { start: Math.floor(started / 1000) },
      assets: { large_image: 'bloxcode', large_text: 'Bloxcode, the external code editor for Roblox Studio', ...(a.claude ? { small_image: 'claude', small_text: 'Coding with Claude' } : {}) },
      buttons: [{ label: 'Get Bloxcode', url: WEBSITE }],
    } : null;
    sock.write(encode(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: payload }, nonce: String(Date.now()) + Math.random() }));
  }

  return {
    setEnabled(on, opts) {
      if (opts) options = { ...options, ...opts };
      if (on === enabled) { push(); return; }
      enabled = on;
      if (on) { started = Date.now(); connect(0); }
      else {
        clearTimeout(retry);
        if (sock) { try { activity = null; push(); sock.end(); } catch (_) {} }
        sock = null; ready = false; setStatus('off');
      }
    },
    update(next) {
      activity = next;
      push();
    },
    get status() { return CLIENT_ID ? status : 'unavailable'; },
    available: !!CLIENT_ID,
  };
}

module.exports = { createDiscord };
