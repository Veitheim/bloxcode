// Local history: earlier versions of every script, saved on this computer.
// Versions are stored per place and per script path, so they survive restarts.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_VERSIONS = 80;
const MERGE_TYPING_MS = 30000; // your own typing within 30 s becomes one version
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function createHistory({ userData, studio, placeKey }) {
  const root = path.join(userData, 'history');
  const cache = new Map(); // file -> { path, versions }
  const dirty = new Set();
  let flushTimer = null;

  function fileFor(scriptPath) {
    const hash = crypto.createHash('sha1').update(scriptPath).digest('hex').slice(0, 20);
    return path.join(root, safe(placeKey()), hash + '.json');
  }
  function safe(s) { return String(s || 'unknown').replace(/[^\w.-]+/g, '_').slice(0, 80); }

  function load(scriptPath) {
    const file = fileFor(scriptPath);
    if (cache.has(file)) return cache.get(file);
    let data = { path: scriptPath, versions: [] };
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    cache.set(file, data);
    return data;
  }

  function scheduleFlush(file) {
    dirty.add(file);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 1500);
  }
  function flush() {
    for (const file of dirty) {
      const data = cache.get(file);
      if (!data) continue;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      } catch (_) {}
    }
    dirty.clear();
  }

  function record(scriptPath, source, origin, before) {
    if (!scriptPath || typeof source !== 'string') return;
    const data = load(scriptPath);
    const v = data.versions;
    const now = Date.now();
    // The first time we see a script, keep what it looked like before this change too.
    if (!v.length && typeof before === 'string' && before !== source) v.push({ time: now - 1, origin: 'earlier', source: before });
    const last = v[v.length - 1];
    if (last && last.source === source) return;
    if (last && origin === 'you' && last.origin === 'you' && now - last.time < MERGE_TYPING_MS) {
      last.source = source;
      last.time = now;
    } else {
      v.push({ time: now, origin, source });
    }
    const cutoff = now - MAX_AGE_MS;
    while (v.length > MAX_VERSIONS || (v.length > 5 && v[0].time < cutoff)) v.shift();
    scheduleFlush(fileFor(scriptPath));
  }

  studio.events.on('sourceChanged', ({ path: p, source, origin, before }) => {
    // The first load of a script is not a change.
    if (origin === 'studio' && before === undefined) {
      const data = load(p);
      if (!data.versions.length) { data.versions.push({ time: Date.now(), origin: 'opened', source }); scheduleFlush(fileFor(p)); }
      else if (data.versions[data.versions.length - 1].source !== source) record(p, source, 'studio');
      return;
    }
    record(p, source, origin, before);
  });

  // Keep history when a script is renamed or moved.
  studio.events.on('renamed', ({ before, after }) => {
    if (!studio.sources.size) return;
    const oldFile = fileFor(before);
    const newFile = fileFor(after);
    try {
      if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        const data = load(before);
        data.path = after;
        cache.delete(oldFile);
        cache.set(newFile, data);
        fs.mkdirSync(path.dirname(newFile), { recursive: true });
        fs.renameSync(oldFile, newFile);
      }
    } catch (_) {}
  });

  function list(scriptPath) {
    const data = load(scriptPath);
    return data.versions.map((v, i) => ({ index: i, time: v.time, origin: v.origin, lines: v.source.split('\n').length, size: v.source.length })).reverse();
  }
  function get(scriptPath, index) {
    const v = load(scriptPath).versions[index];
    if (!v) throw new Error('That version no longer exists.');
    return v.source;
  }

  return { list, get, flush, record };
}

module.exports = { createHistory };
