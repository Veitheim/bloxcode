// Search and replace across every script in the place.

const MAX_MATCHES = 5000;

function buildRegex({ query, regex, caseSensitive, wholeWord }) {
  if (!query) throw new Error('Type something to search for.');
  let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, caseSensitive ? 'g' : 'gi');
  } catch (e) {
    throw new Error('Invalid regular expression: ' + e.message);
  }
}

function createSearch(studio) {
  async function search(opts, onProgress) {
    const re = buildRegex(opts);
    await studio.loadAllSources(onProgress);
    const results = [];
    let total = 0;
    let truncated = false;
    const ids = studio.scriptIds().sort((a, b) => studio.pathOf(a).localeCompare(studio.pathOf(b)));
    for (const id of ids) {
      const source = studio.sources.get(id);
      if (typeof source !== 'string') continue;
      if (opts.include && !studio.pathOf(id).toLowerCase().includes(String(opts.include).toLowerCase())) continue;
      const lines = source.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length && !truncated; i++) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(lines[i]))) {
          if (m[0] === '') { re.lastIndex++; continue; }
          matches.push({ line: i + 1, col: m.index + 1, length: m[0].length, text: lines[i].slice(0, 400) });
          if (++total >= MAX_MATCHES) { truncated = true; break; }
        }
      }
      if (matches.length) {
        const n = studio.nodes.get(id);
        results.push({ id, path: studio.pathOf(id), name: n && n.name, cls: n && n.cls, matches });
      }
      if (truncated) break;
    }
    return { results, total, truncated };
  }

  /** Replaces in all scripts (or only `ids`). Returns how many scripts and matches changed. */
  async function replace(opts, origin = 'replace') {
    const re = buildRegex(opts);
    await studio.loadAllSources();
    const replacement = String(opts.replacement ?? '');
    const changed = {};
    let count = 0;
    for (const id of opts.ids || studio.scriptIds()) {
      const source = studio.sources.get(id);
      if (typeof source !== 'string') continue;
      let n = 0;
      const next = source.replace(re, (...args) => {
        n++;
        if (!opts.regex) return replacement;
        // support $1 … $9 and $& in regex mode
        const groups = args.slice(1, -2);
        return replacement.replace(/\$(\d|&)/g, (_, g) => (g === '&' ? args[0] : groups[Number(g) - 1] ?? ''));
      });
      if (n && next !== source) { changed[id] = next; count += n; }
    }
    const scripts = await studio.writeSources(changed, `Replace "${opts.query}"`, origin, { agent: origin === 'claude' });
    return { scripts, matches: count, ids: Object.keys(changed) };
  }

  return { search, replace };
}

module.exports = { createSearch, buildRegex };
