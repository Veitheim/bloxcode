// GitHub: sign in, create a repository and publish the place's scripts with one click.
// Uses the GitHub REST API only, so Git doesn't need to be installed. Files are laid out
// like a Rojo project (default.project.json + src/), so the repo also works with Rojo.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage, shell } = require('electron');

// OAuth app for "Sign in with GitHub" (device flow, no secret needed). Without it, people sign in with a token.
const CLIENT_ID = require('./ids').GITHUB_CLIENT_ID;
const API = process.env.BLOXCODE_GITHUB_API || 'https://api.github.com';
const EXT = { Script: '.server.luau', LocalScript: '.client.luau', ModuleScript: '.luau' };
const INIT = { Script: 'init.server.luau', LocalScript: 'init.client.luau', ModuleScript: 'init.luau' };

function createGitHub({ userData, studio, placeKey, emit }) {
  const file = path.join(userData, 'github.json');
  let data = { token: null, user: null, links: {} };
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (_) {}
  const save = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));

  async function token() {
    if (!data.token) return null;
    try { return (await safeStorage.decryptStringAsync(Buffer.from(data.token, 'base64'))).result; } catch (_) { return null; }
  }
  async function storeToken(t) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('This computer cannot store the GitHub login safely.');
    data.token = (await safeStorage.encryptStringAsync(t)).toString('base64');
  }

  async function api(method, url, body, tk) {
    tk = tk || await token();
    if (!tk) throw new Error('Sign in to GitHub first.');
    const res = await fetch(url.startsWith('http') ? url : API + url, {
      method,
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Bloxcode', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
      const msg = json && (json.message + (json.errors ? ': ' + json.errors.map((e) => e.message || e.code).join(', ') : '')) || `HTTP ${res.status}`;
      const err = new Error(res.status === 401 ? 'GitHub rejected the login. Sign in again.' : msg);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  // ---------- sign in ----------
  function state() {
    const link = data.links[placeKey()] || null;
    return { signedIn: !!data.token, user: data.user, deviceFlow: !!CLIENT_ID, link };
  }

  async function signInWithToken(t) {
    t = String(t || '').trim();
    if (!t) throw new Error('Paste a token first.');
    const user = await api('GET', '/user', null, t);
    await storeToken(t);
    data.user = { login: user.login, avatar: user.avatar_url, name: user.name };
    save();
    return state();
  }

  let deviceAbort = null;
  async function startDeviceFlow() {
    if (!CLIENT_ID) throw new Error('Sign in with a token instead.');
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: 'repo' }),
    });
    const d = await res.json();
    if (!d.device_code) throw new Error(d.error_description || 'GitHub did not start the sign-in.');
    shell.openExternal(d.verification_uri);
    let stopped = false;
    deviceAbort = () => { stopped = true; };
    (async () => {
      let interval = (d.interval || 5) * 1000;
      const until = Date.now() + (d.expires_in || 900) * 1000;
      while (!stopped && Date.now() < until) {
        await new Promise((r) => setTimeout(r, interval));
        const r = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: CLIENT_ID, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        }).then((x) => x.json()).catch(() => ({}));
        if (r.access_token) {
          try { await signInWithToken(r.access_token); emit('github:state', state()); } catch (e) { emit('github:error', e.message); }
          return;
        }
        if (r.error === 'slow_down') interval += 5000;
        else if (r.error && r.error !== 'authorization_pending') { emit('github:error', r.error_description || r.error); return; }
      }
    })();
    return { userCode: d.user_code, url: d.verification_uri };
  }

  function signOut() {
    if (deviceAbort) deviceAbort();
    data.token = null; data.user = null;
    save();
    return state();
  }

  // ---------- files ----------
  function safeFile(name) {
    return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '_').slice(0, 100) || '_';
  }

  /** Builds { path: content } for every script, in a Rojo-compatible layout. */
  function buildFiles() {
    const files = {};
    const place = studio.getPlace() || {};
    const hasScript = new Map();
    function scriptBelow(id) {
      if (hasScript.has(id)) return hasScript.get(id);
      const n = studio.nodes.get(id);
      let r = !!n && studio.SCRIPT_CLASSES.has(n.cls);
      for (const c of studio.kids(id)) if (scriptBelow(c)) r = true;
      hasScript.set(id, r);
      return r;
    }
    function uniqueNames(ids) {
      const used = new Map();
      return ids.map((id) => {
        const n = studio.nodes.get(id);
        let name = safeFile(n.name);
        const key = name.toLowerCase();
        const count = used.get(key) || 0;
        used.set(key, count + 1);
        if (count) name = `${name} (${count + 1})`;
        return [id, name];
      });
    }
    function walk(id, dir) {
      const n = studio.nodes.get(id);
      const kids = [...studio.kids(id)].filter(scriptBelow).sort((a, b) => studio.nodes.get(a).name.localeCompare(studio.nodes.get(b).name));
      if (studio.SCRIPT_CLASSES.has(n.cls)) {
        const src = studio.sources.get(id) ?? '';
        if (!kids.length) { files[dir + EXT[n.cls]] = src; return; }
        files[`${dir}/${INIT[n.cls]}`] = src;
      } else if (n.cls !== 'Folder') {
        files[`${dir}/init.meta.json`] = JSON.stringify({ className: n.cls }, null, 2) + '\n';
      }
      for (const [cid, name] of uniqueNames(kids)) walk(cid, `${dir}/${name}`);
    }
    const tree = { $className: 'DataModel' };
    const services = [...studio.kids(null)].filter(scriptBelow).sort((a, b) => studio.nodes.get(a).name.localeCompare(studio.nodes.get(b).name));
    for (const sid of services) {
      const s = studio.nodes.get(sid);
      const dir = `src/${safeFile(s.name)}`;
      tree[s.name] = { $className: s.cls, $path: dir };
      for (const [cid, name] of uniqueNames([...studio.kids(sid)].filter(scriptBelow))) walk(cid, `${dir}/${name}`);
    }
    files['default.project.json'] = JSON.stringify({ name: place.name || 'Game', tree }, null, 2) + '\n';
    return files;
  }

  function blobSha(content) {
    const buf = Buffer.from(content, 'utf8');
    return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
  }

  function isManaged(p) { return p === 'default.project.json' || p.startsWith('src/'); }

  async function remoteState(link) {
    const repo = await api('GET', `/repos/${link.owner}/${link.repo}`);
    const branch = repo.default_branch;
    const ref = await api('GET', `/repos/${link.owner}/${link.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await api('GET', `/repos/${link.owner}/${link.repo}/git/commits/${ref.object.sha}`);
    const tree = await api('GET', `/repos/${link.owner}/${link.repo}/git/trees/${commit.tree.sha}?recursive=1`);
    const remote = new Map();
    for (const e of tree.tree || []) if (e.type === 'blob') remote.set(e.path, e.sha);
    return { repo, branch, head: ref.object.sha, baseTree: commit.tree.sha, remote, truncated: tree.truncated };
  }

  async function changes() {
    const link = data.links[placeKey()];
    if (!link) throw new Error('This place is not linked to a GitHub repository yet.');
    studio.requireStudio();
    await studio.loadAllSources();
    const local = buildFiles();
    const r = await remoteState(link);
    const added = [], modified = [], deleted = [];
    for (const [p, content] of Object.entries(local)) {
      const sha = r.remote.get(p);
      if (!sha) added.push(p);
      else if (sha !== blobSha(content)) modified.push(p);
    }
    for (const p of r.remote.keys()) if (isManaged(p) && !(p in local)) deleted.push(p);
    return { local, remote: r, added, modified, deleted };
  }

  async function status() {
    const c = await changes();
    return { added: c.added, modified: c.modified, deleted: c.deleted, url: c.remote.repo.html_url, branch: c.remote.branch };
  }

  async function publish(message) {
    const link = data.links[placeKey()];
    const c = await changes();
    const count = c.added.length + c.modified.length + c.deleted.length;
    if (!count) return { published: false, message: 'Everything is already on GitHub.', url: c.remote.repo.html_url };
    const tree = [
      ...[...c.added, ...c.modified].map((p) => ({ path: p, mode: '100644', type: 'blob', content: c.local[p] })),
      ...c.deleted.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
    ];
    const { owner, repo } = link;
    const newTree = await api('POST', `/repos/${owner}/${repo}/git/trees`, { base_tree: c.remote.baseTree, tree });
    const place = studio.getPlace() || {};
    const msg = String(message || '').trim() || `Update ${place.name || 'place'} from Bloxcode`;
    const commit = await api('POST', `/repos/${owner}/${repo}/git/commits`, { message: msg, tree: newTree.sha, parents: [c.remote.head] });
    await api('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(c.remote.branch)}`, { sha: commit.sha });
    link.lastPublish = { time: Date.now(), sha: commit.sha, message: msg, files: count };
    save();
    return { published: true, files: count, added: c.added.length, modified: c.modified.length, deleted: c.deleted.length, url: `${c.remote.repo.html_url}/commit/${commit.sha}`, repoUrl: c.remote.repo.html_url };
  }

  function readme(name, description) {
    return `# ${name}\n\n${description ? description + '\n\n' : ''}A Roblox game. The scripts in this repository are published with [Bloxcode](https://bloxcode-docs.seidl.workers.dev), the external code editor for Roblox Studio.\n\n## Layout\n\nThe \`src\` folder mirrors the game's services. \`.server.luau\` files are Scripts, \`.client.luau\` files are LocalScripts and \`.luau\` files are ModuleScripts. The layout works with [Rojo](https://rojo.space) too (\`default.project.json\`).\n`;
  }

  async function createRepo({ name, description, isPrivate }) {
    name = String(name || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!name) throw new Error('Choose a name for the repository.');
    const repo = await api('POST', '/user/repos', { name, description: description || undefined, private: !!isPrivate, auto_init: false });
    // An empty repo has no branch yet: the first file is created with the contents API.
    await api('PUT', `/repos/${repo.owner.login}/${repo.name}/contents/README.md`, {
      message: 'Create repository with Bloxcode',
      content: Buffer.from(readme(name, description), 'utf8').toString('base64'),
    });
    data.links[placeKey()] = { owner: repo.owner.login, repo: repo.name, url: repo.html_url, private: repo.private };
    save();
    return state();
  }

  async function linkRepo(full) {
    const m = String(full || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw new Error('Use owner/name, for example Veitheim/my-game.');
    const repo = await api('GET', `/repos/${m[1]}/${m[2]}`);
    if (!repo.permissions || !repo.permissions.push) throw new Error('You can not push to that repository.');
    data.links[placeKey()] = { owner: repo.owner.login, repo: repo.name, url: repo.html_url, private: repo.private };
    save();
    return state();
  }

  function unlink() {
    delete data.links[placeKey()];
    save();
    return state();
  }

  async function repos() {
    const list = await api('GET', '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator');
    return list.filter((r) => r.permissions && r.permissions.push).map((r) => ({ full: r.full_name, private: r.private, pushed: r.pushed_at }));
  }

  return { state, signInWithToken, startDeviceFlow, signOut, createRepo, linkRepo, unlink, repos, status, publish, buildFiles };
}

module.exports = { createGitHub };
