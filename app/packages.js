// Wally package support: search the registry, resolve dependencies, download packages
// and turn their files into a Roblox instance tree (same rules as Rojo).
// The result is sent to the Studio plugin, which builds the Wally layout:
//
//   ReplicatedStorage.Packages            (ServerScriptService.ServerPackages for server packages)
//     _Index/
//       evaera_cmdr@1.12.0/
//         cmdr/ …                         the package itself
//         Promise                         link module to a dependency
//     Cmdr                                link module: require(script.Parent._Index[...][...])

const { unzipSync, strFromU8 } = require('fflate');

const API = 'https://api.wally.run/v1';
const HEADERS = { 'Wally-Version': '0.3.2', 'User-Agent': 'Bloxcode' };

// ---------- registry ----------

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Registry error ${res.status} for ${url}`);
  return res.json();
}

async function search(query) {
  const results = await getJson(`${API}/package-search?query=${encodeURIComponent(query)}`);
  return results.map((r) => ({
    scope: r.scope,
    name: r.name,
    description: r.description || '',
    version: latest(r.versions || []) || (r.versions || [])[0],
  }));
}

const metadataCache = new Map();
async function metadata(scope, name) {
  const key = `${scope}/${name}`;
  if (!metadataCache.has(key)) {
    metadataCache.set(key, getJson(`${API}/package-metadata/${scope}/${name}`).catch((e) => {
      metadataCache.delete(key);
      throw e;
    }));
  }
  return metadataCache.get(key);
}

async function download(scope, name, version) {
  const res = await fetch(`${API}/package-contents/${scope}/${name}/${version}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Download failed for ${scope}/${name}@${version} (${res.status})`);
  return unzipSync(new Uint8Array(await res.arrayBuffer()));
}

// ---------- semver ----------

function parseVersion(v) {
  const m = String(v).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([\w.-]+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +(m[2] || 0), patch: +(m[3] || 0), pre: m[4] || null, raw: v };
}

function compare(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}

function latest(versions) {
  const parsed = versions.map(parseVersion).filter(Boolean);
  const stable = parsed.filter((v) => !v.pre);
  const pool = stable.length ? stable : parsed;
  pool.sort(compare);
  return pool.length ? pool[pool.length - 1].raw : null;
}

// Turns "^1.2.3", ">=1.0.0, <2.0.0", "1.2" … into a list of [op, version] checks.
function parseRange(range) {
  const checks = [];
  for (const part of String(range).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/);
    const op = m[1] || '^'; // Wally treats a bare version as a caret range
    const v = parseVersion(m[2]);
    if (!v) throw new Error(`Cannot read version range "${range}"`);
    if (op === '^') {
      checks.push(['>=', v]);
      if (v.major > 0) checks.push(['<', { major: v.major + 1, minor: 0, patch: 0 }]);
      else if (v.minor > 0) checks.push(['<', { major: 0, minor: v.minor + 1, patch: 0 }]);
      else checks.push(['<', { major: 0, minor: 0, patch: v.patch + 1 }]);
    } else if (op === '~') {
      checks.push(['>=', v], ['<', { major: v.major, minor: v.minor + 1, patch: 0 }]);
    } else {
      checks.push([op, v]);
    }
  }
  return checks;
}

function satisfies(version, checks) {
  return checks.every(([op, target]) => {
    const c = compare(version, { pre: null, ...target });
    return op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : c === 0;
  });
}

function parseSpec(spec) {
  // "evaera/promise@>=4.0.0, <5.0.0"
  const m = String(spec).match(/^([\w-]+)\/([\w-]+)(?:@(.+))?$/);
  if (!m) throw new Error(`Cannot read dependency "${spec}"`);
  return { scope: m[1], name: m[2], range: m[3] || '*' };
}

async function pickVersion(scope, name, range) {
  const meta = await metadata(scope, name);
  const entries = meta.versions || [];
  let candidates = entries.map((e) => ({ e, v: parseVersion(e.package.version) })).filter((x) => x.v);
  if (range && range !== '*' && range !== 'latest') {
    const checks = parseRange(range);
    const anyPre = /-/.test(range);
    candidates = candidates.filter((x) => satisfies(x.v, checks) && (anyPre || !x.v.pre));
  } else {
    const stable = candidates.filter((x) => !x.v.pre);
    if (stable.length) candidates = stable;
  }
  if (!candidates.length) throw new Error(`No version of ${scope}/${name} matches "${range}"`);
  candidates.sort((a, b) => compare(a.v, b.v));
  return candidates[candidates.length - 1].e;
}

// ---------- files -> instances (Rojo rules) ----------

const SCRIPT_EXT = /\.(lua|luau)$/i;

function luaString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}
function jsonToLua(value, indent = '') {
  if (value === null) return 'nil';
  if (Array.isArray(value)) {
    if (!value.length) return '{}';
    const inner = indent + '\t';
    return '{\n' + value.map((v) => inner + jsonToLua(v, inner)).join(',\n') + '\n' + indent + '}';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    const inner = indent + '\t';
    return '{\n' + keys.map((k) => {
      const key = /^[A-Za-z_]\w*$/.test(k) ? k : `[${luaString(k)}]`;
      return `${inner}${key} = ${jsonToLua(value[k], inner)}`;
    }).join(',\n') + '\n' + indent + '}';
  }
  if (typeof value === 'string') return luaString(value);
  return String(value);
}

function scriptClass(fileName) {
  const base = fileName.replace(SCRIPT_EXT, '');
  if (/\.server$/i.test(base)) return ['Script', base.replace(/\.server$/i, '')];
  if (/\.client$/i.test(base)) return ['LocalScript', base.replace(/\.client$/i, '')];
  return ['ModuleScript', base];
}

// Builds a virtual directory tree from the flat zip entries.
function toDirTree(files) {
  const root = { dirs: new Map(), files: new Map() };
  for (const [fullPath, data] of Object.entries(files)) {
    const parts = fullPath.split('/').filter(Boolean);
    if (!parts.length) continue;
    const isDir = fullPath.endsWith('/');
    let cur = root;
    const dirParts = isDir ? parts : parts.slice(0, -1);
    for (const p of dirParts) {
      if (!cur.dirs.has(p)) cur.dirs.set(p, { dirs: new Map(), files: new Map() });
      cur = cur.dirs.get(p);
    }
    if (!isDir) cur.files.set(parts[parts.length - 1], data);
  }
  return root;
}

function findDir(root, relPath) {
  let cur = root;
  for (const p of String(relPath).split('/').filter((x) => x && x !== '.')) {
    cur = cur.dirs.get(p);
    if (!cur) return null;
  }
  return cur;
}

function modelJsonToNode(name, json) {
  const node = { n: json.Name || name, c: json.ClassName || 'Folder', ch: [] };
  for (const child of json.Children || []) node.ch.push(modelJsonToNode(child.Name || child.ClassName, child));
  return node;
}

function fileToNode(fileName, data, warnings) {
  const text = () => strFromU8(data);
  if (SCRIPT_EXT.test(fileName)) {
    const [cls, name] = scriptClass(fileName);
    return { n: name, c: cls, s: text(), ch: [] };
  }
  if (/\.model\.json$/i.test(fileName)) {
    try { return modelJsonToNode(fileName.replace(/\.model\.json$/i, ''), JSON.parse(text())); } catch (_) { return null; }
  }
  if (/\.(meta|project)\.json$/i.test(fileName)) return null;
  if (/\.json$/i.test(fileName)) {
    try { return { n: fileName.replace(/\.json$/i, ''), c: 'ModuleScript', s: 'return ' + jsonToLua(JSON.parse(text())) + '\n', ch: [] }; } catch (_) { return null; }
  }
  if (/\.txt$/i.test(fileName)) return { n: fileName.replace(/\.txt$/i, ''), c: 'StringValue', v: text(), ch: [] };
  if (/\.rbxmx?$/i.test(fileName)) { warnings.push(`Skipped model file ${fileName} (not supported yet)`); return null; }
  return null;
}

function dirToNode(name, dir, warnings) {
  const initName = [...dir.files.keys()].find((f) => /^init(\.server|\.client)?\.(lua|luau)$/i.test(f));
  let node;
  if (initName) {
    const [cls] = scriptClass(initName);
    node = { n: name, c: cls, s: strFromU8(dir.files.get(initName)), ch: [] };
  } else {
    node = { n: name, c: 'Folder', ch: [] };
  }
  const meta = dir.files.get('init.meta.json');
  if (meta) {
    try { const m = JSON.parse(strFromU8(meta)); if (m.className && !initName) node.c = m.className; } catch (_) {}
  }
  for (const [fname, data] of dir.files) {
    if (fname === initName || fname.startsWith('.')) continue;
    const child = fileToNode(fname, data, warnings);
    if (child) node.ch.push(child);
  }
  for (const [dname, sub] of dir.dirs) {
    if (dname.startsWith('.')) continue;
    node.ch.push(dirToNode(dname, sub, warnings));
  }
  return node;
}

function packageToNode(files, pkgName, warnings) {
  const root = toDirTree(files);
  let target = root;
  const projectFile = root.files.get('default.project.json');
  if (projectFile) {
    try {
      const project = JSON.parse(strFromU8(projectFile));
      const p = project.tree && project.tree.$path;
      if (typeof p === 'string') {
        const asDir = findDir(root, p);
        if (asDir) target = asDir;
        else if (root.files.has(p)) { const f = fileToNode(p, root.files.get(p), warnings); if (f) return { ...f, n: pkgName }; }
      }
    } catch (_) { warnings.push(`Could not read default.project.json of ${pkgName}`); }
  } else if (root.dirs.has('src')) {
    target = root.dirs.get('src');
  }
  const node = dirToNode(pkgName, target, warnings);
  return node;
}

// ---------- install plan ----------

function aliasFor(name) {
  return name.split(/[-_]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}
function indexKey(scope, name, version) {
  return `${scope}_${name}@${version}`;
}
function linkSource(pathExpr) {
  return `return require(${pathExpr})\n`;
}

/**
 * Resolves a package and all its dependencies, downloads them and returns
 * the command the Studio plugin needs to build the Wally layout.
 */
async function buildInstall(spec, onProgress) {
  const { scope, name, range } = parseSpec(spec);
  const rootEntry = await pickVersion(scope, name, range);
  const realm = rootEntry.package.realm === 'server' ? 'server' : 'shared';
  const index = new Map(); // key -> { scope, name, version, deps }
  const warnings = [];

  const queue = [{ scope, name, entry: rootEntry }];
  while (queue.length) {
    const item = queue.shift();
    const version = item.entry.package.version;
    const key = indexKey(item.scope, item.name, version);
    if (index.has(key)) continue;
    const deps = [];
    const depMap = { ...(item.entry.dependencies || {}), ...(realm === 'server' ? item.entry['server-dependencies'] || {} : {}) };
    for (const [alias, depSpec] of Object.entries(depMap)) {
      const d = parseSpec(depSpec);
      onProgress && onProgress(`Resolving ${d.scope}/${d.name}…`);
      const depEntry = await pickVersion(d.scope, d.name, d.range);
      deps.push({ alias, scope: d.scope, name: d.name, version: depEntry.package.version });
      queue.push({ scope: d.scope, name: d.name, entry: depEntry });
    }
    index.set(key, { scope: item.scope, name: item.name, version, deps });
  }

  const entries = [];
  let n = 0;
  for (const [key, pkg] of index) {
    n++;
    onProgress && onProgress(`Downloading ${pkg.scope}/${pkg.name}@${pkg.version} (${n}/${index.size})…`);
    const files = await download(pkg.scope, pkg.name, pkg.version);
    const tree = packageToNode(files, pkg.name, warnings);
    const links = pkg.deps.map((d) => ({
      n: d.alias,
      c: 'ModuleScript',
      s: linkSource(`script.Parent.Parent[${luaString(indexKey(d.scope, d.name, d.version))}][${luaString(d.name)}]`),
      ch: [],
    }));
    entries.push({ key, node: { n: key, c: 'Folder', ch: [tree, ...links] } });
  }

  const rootKey = indexKey(scope, name, rootEntry.package.version);
  const alias = aliasFor(name);
  return {
    command: {
      type: 'wallyInstall',
      realm,
      entries,
      link: { n: alias, c: 'ModuleScript', s: linkSource(`script.Parent._Index[${luaString(rootKey)}][${luaString(name)}]`), ch: [] },
      label: `${scope}/${name}@${rootEntry.package.version}`,
    },
    summary: {
      name: `${scope}/${name}`,
      version: rootEntry.package.version,
      alias,
      realm,
      dependencies: index.size - 1,
      warnings,
    },
  };
}

module.exports = { search, buildInstall, metadata, latest, _test: { parseRange, satisfies, parseVersion, packageToNode, pickVersion } };
