/* global bridge, $, esc, toast, status, cleanErr, showView */
// GitHub panel: sign in, create or link a repository, and publish the place's scripts.
'use strict';

const gh = { state: null, changes: null, checking: false, publishing: false, device: null, error: null, view: null };

async function githubShow() {
  try { gh.state = await bridge.invoke('github:state'); } catch (_) {}
  renderGithub();
  if (gh.state && gh.state.signedIn && gh.state.link && status.connected) githubCheck();
}

async function githubCheck() {
  if (gh.checking) return;
  gh.checking = true;
  gh.error = null;
  renderGithub();
  try { gh.changes = await bridge.invoke('github:status'); }
  catch (err) { gh.changes = null; gh.error = cleanErr(err); }
  gh.checking = false;
  renderGithub();
}

function placeName() { return status.place ? status.place.name : 'my-game'; }
function repoSlug(name) { return String(name).trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'my-game'; }

function renderGithub() {
  const el = $('#github-panel');
  const st = gh.state || {};
  if (!st.signedIn) {
    el.innerHTML = `
      <p>Publish your game's scripts to GitHub with one click: a backup with full history, and an easy way to share code or work together.</p>
      ${gh.device ? `
        <h3>Enter this code on GitHub</h3>
        <div class="gh-code">${esc(gh.device.userCode)}</div>
        <p class="fine">A browser window opened at <a href="${esc(gh.device.url)}" target="_blank">${esc(gh.device.url)}</a>. Paste the code there and click Authorize. This panel updates by itself.</p>
        <button class="secondary" data-gh="device-cancel">Cancel</button>` : `
        ${st.deviceFlow ? '<button class="primary" data-gh="device">Sign in with GitHub</button><p class="fine" style="margin-top:12px">Or use a token:</p>' : '<h3>Sign in</h3>'}
        <p class="fine">Create a token on GitHub (<a href="https://github.com/settings/tokens/new?scopes=repo&description=Bloxcode" target="_blank">open the page</a>, keep the <b>repo</b> box checked, click Generate token) and paste it here. Bloxcode stores it encrypted on this computer.</p>
        <input type="password" id="gh-token" placeholder="ghp_… or github_pat_…" autocomplete="off" spellcheck="false">
        <button class="${st.deviceFlow ? 'secondary' : 'primary'}" data-gh="token">Sign in with token</button>`}`;
    return;
  }
  const user = st.user || {};
  const userHtml = `<div class="gh-user">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : ''}<div><div class="nm">${esc(user.name || user.login || '')}</div><div class="fine">@${esc(user.login || '')} · <a href="#" data-gh="signout">Sign out</a></div></div></div>`;
  if (!status.connected) {
    el.innerHTML = userHtml + '<p>Connect Roblox Studio to publish a place. Each place gets its own repository.</p>';
    return;
  }
  if (!st.link) {
    const name = repoSlug(placeName());
    el.innerHTML = userHtml + `
      <h3>Create a repository for "${esc(placeName())}"</h3>
      <input type="text" id="gh-name" value="${esc(name)}" spellcheck="false" placeholder="Repository name">
      <input type="text" id="gh-desc" placeholder="Description (optional)" spellcheck="false">
      <div class="radio-row"><label><input type="radio" name="gh-vis" value="private" checked> Private</label><label><input type="radio" name="gh-vis" value="public"> Public</label></div>
      <button class="primary" data-gh="create">Create repository and publish</button>
      <details><summary>Use an existing repository</summary>
        <input type="text" id="gh-existing" placeholder="owner/name" spellcheck="false" list="gh-repos">
        <datalist id="gh-repos"></datalist>
        <button class="secondary" data-gh="link">Link repository</button>
      </details>`;
    bridge.invoke('github:repos').then((list) => {
      const dl = document.getElementById('gh-repos');
      if (dl) dl.innerHTML = list.map((r) => `<option value="${esc(r.full)}">`).join('');
    }).catch(() => {});
    return;
  }
  const link = st.link;
  const c = gh.changes;
  const count = c ? c.added.length + c.modified.length + c.deleted.length : 0;
  const last = link.lastPublish;
  let changesHtml;
  if (gh.checking) changesHtml = '<p class="fine">Comparing with GitHub…</p>';
  else if (gh.error) changesHtml = `<p style="color:var(--red)">${esc(gh.error)}</p>`;
  else if (!c) changesHtml = '';
  else if (!count) changesHtml = '<p><span class="pill ok"><span class="dot"></span>Everything is on GitHub</span></p>';
  else changesHtml = `<div class="gh-changes">${c.added.length ? `<span class="a">+${c.added.length} new</span>` : ''}${c.modified.length ? `<span class="m">~${c.modified.length} changed</span>` : ''}${c.deleted.length ? `<span class="d">−${c.deleted.length} removed</span>` : ''}</div>
      <div class="gh-files">${[...c.added.map((p) => `<div style="color:var(--green)">+ ${esc(p)}</div>`), ...c.modified.map((p) => `<div style="color:var(--orange)">~ ${esc(p)}</div>`), ...c.deleted.map((p) => `<div style="color:var(--red)">− ${esc(p)}</div>`)].join('')}</div>`;
  el.innerHTML = userHtml + `
    <div class="gh-repo"><a href="${esc(link.url)}" target="_blank">${esc(link.owner)}/${esc(link.repo)}</a> <span class="fine">${link.private ? 'private' : 'public'}</span>
      ${last ? `<div class="fine">Last published ${esc(new Date(last.time).toLocaleString())}: “${esc(last.message)}”</div>` : '<div class="fine">Not published yet</div>'}</div>
    ${changesHtml}
    <input type="text" id="gh-message" placeholder="What did you change? (optional)" spellcheck="false">
    <button class="primary" data-gh="publish" ${gh.publishing || (c && !count) ? 'disabled' : ''}>${gh.publishing ? 'Publishing…' : count ? `Publish ${count} change${count === 1 ? '' : 's'}` : 'Publish'}</button>
    <button class="secondary" data-gh="open">Open on GitHub</button>
    <details><summary>More</summary>
      <p class="fine">Scripts are saved like a Rojo project: <code>src/&lt;Service&gt;/…</code> with <code>.server.luau</code>, <code>.client.luau</code> and <code>.luau</code> files, plus <code>default.project.json</code>. Other files in the repository are left alone.</p>
      <button class="secondary" data-gh="unlink">Unlink this repository</button>
    </details>`;
}

async function githubPublish() {
  if (gh.publishing) return;
  gh.publishing = true;
  renderGithub();
  try {
    const msg = ($('#gh-message') || {}).value || '';
    const r = await bridge.invoke('github:publish', msg);
    if (r.published) toast(`Published ${r.files} file${r.files === 1 ? '' : 's'} to GitHub.`);
    else toast(r.message);
    gh.state = await bridge.invoke('github:state');
  } catch (err) { toast(cleanErr(err), 'error'); }
  gh.publishing = false;
  githubCheck();
}
function githubPublishQuick() { showView('github'); setTimeout(githubPublish, 300); }

$('#github-panel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-gh]');
  if (!b) return;
  e.preventDefault();
  try {
    switch (b.dataset.gh) {
      case 'token': gh.state = await bridge.invoke('github:token', $('#gh-token').value); toast(`Signed in as ${gh.state.user.login}.`); githubShow(); break;
      case 'device': gh.device = await bridge.invoke('github:device'); renderGithub(); break;
      case 'device-cancel': gh.device = null; await bridge.invoke('github:signOut'); renderGithub(); break;
      case 'signout': if (confirm('Sign out of GitHub in Bloxcode?')) { gh.state = await bridge.invoke('github:signOut'); gh.changes = null; renderGithub(); } break;
      case 'create': {
        b.disabled = true; b.textContent = 'Creating…';
        const isPrivate = (document.querySelector('input[name="gh-vis"]:checked') || {}).value !== 'public';
        gh.state = await bridge.invoke('github:create', { name: $('#gh-name').value, description: $('#gh-desc').value, isPrivate });
        toast('Repository created. Publishing your scripts…');
        renderGithub();
        await githubPublish();
        break;
      }
      case 'link': gh.state = await bridge.invoke('github:link', $('#gh-existing').value); renderGithub(); githubCheck(); break;
      case 'unlink': if (confirm('Unlink this place from the repository? Nothing is deleted on GitHub.')) { gh.state = await bridge.invoke('github:unlink'); gh.changes = null; renderGithub(); } break;
      case 'publish': await githubPublish(); break;
      case 'open': window.open(gh.state.link.url); break;
      default: break;
    }
  } catch (err) {
    toast(cleanErr(err), 'error');
    renderGithub();
  }
});
$('#github-refresh').addEventListener('click', () => githubShow());
bridge.on('github:state', (st) => { gh.state = st; gh.device = null; toast(`Signed in to GitHub as ${st.user ? st.user.login : ''}.`); githubShow(); });
bridge.on('github:error', (msg) => { gh.device = null; toast('GitHub sign-in failed: ' + msg, 'error'); renderGithub(); });
