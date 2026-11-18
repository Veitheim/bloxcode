/* global monaco, bridge, $, esc, toast, loadSetting, saveSetting, status, CHANGELOG, THEMES, ACCENTS, findTheme, swatch, S, setS, syncDoc, applyRemoteSource, currentMonacoTheme, editorOptions, showView, MOD, scheduleRender */
// Dialogs: conflicts, reviewing Claude's changes, "What's new" and the setup assistant.
'use strict';

const X_SVG = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const modalQueue = [];
let modalCurrent = null;

/** Shows a dialog. Dialogs wait in line when one is already open. */
function openModal(spec) {
  if (modalCurrent) { modalQueue.push(spec); return; }
  modalCurrent = spec;
  const card = $('#modal-card');
  card.className = 'modal-card' + (spec.wide ? ' wide' : '');
  card.innerHTML = spec.html;
  $('#modal').classList.remove('hidden');
  if (spec.mount) spec.mount(card);
}
function closeModal(fromQueue) {
  if (!modalCurrent) return;
  const spec = modalCurrent;
  modalCurrent = null;
  if (spec.unmount) spec.unmount();
  if (spec.onClose && !fromQueue) spec.onClose();
  $('#modal').classList.add('hidden');
  $('#modal-card').innerHTML = '';
  const next = modalQueue.shift();
  if (next) setTimeout(() => openModal(next), 50);
}
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal' && modalCurrent && modalCurrent.dismissable !== false) closeModal(); });

function diffEditor(host, before, after) {
  const opts = editorOptions();
  const diff = monaco.editor.createDiffEditor(host, {
    readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: host.clientWidth > 760,
    theme: currentMonacoTheme(), minimap: { enabled: false }, fontSize: opts.fontSize, fontFamily: opts.fontFamily,
    scrollBeyondLastLine: false, renderOverviewRuler: true,
  });
  const a = monaco.editor.createModel(before, 'luau');
  const b = monaco.editor.createModel(after, 'luau');
  diff.setModel({ original: a, modified: b });
  return { diff, dispose() { diff.dispose(); a.dispose(); b.dispose(); } };
}

// ---------- F4: the same script changed in Studio and in Bloxcode ----------
const conflictOpen = new Set();
function showConflict(doc, studioSource) {
  if (conflictOpen.has(doc.id)) return;
  conflictOpen.add(doc.id);
  let view = null;
  openModal({
    wide: true,
    dismissable: false,
    html: `<div class="modal-head"><h2>"${esc(doc.name)}" changed in Studio and here</h2></div>
      <div class="modal-body" style="flex:none;padding-bottom:8px">Left: the version in Studio. Right: your version in Bloxcode (not sent yet). Which one should Studio keep?</div>
      <div class="diff-host" id="conflict-host"></div>
      <div class="modal-foot"><span class="fine" style="color:var(--fg-faint)">Both versions are kept in the script's history.</span><span class="spacer"></span>
        <button data-c="studio">Use Studio's version</button><button class="primary" data-c="mine">Keep my version</button></div>`,
    mount(card) {
      view = diffEditor(card.querySelector('#conflict-host'), studioSource, doc.model.getValue());
      card.querySelector('.modal-foot').addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        if (b.dataset.c === 'mine') { syncDoc(doc); toast(`Sent your version of "${doc.name}" to Studio.`); }
        else { bridge.post('history:record', doc.id, doc.model.getValue()); applyRemoteSource(doc, studioSource); scheduleRender(); toast(`Using Studio's version of "${doc.name}". Yours is in the history.`); }
        closeModal();
      });
    },
    unmount() { if (view) view.dispose(); conflictOpen.delete(doc.id); },
  });
}

// ---------- reviewing Claude's changes ----------
bridge.on('review:request', ({ reqId, title, changes }) => {
  let view = null;
  let current = 0;
  let answered = false;
  const answer = (accepted, note) => { if (answered) return; answered = true; bridge.post('review:answer', { reqId, accepted, note }); };
  openModal({
    wide: true,
    dismissable: false,
    reqId,
    html: `<div class="modal-head"><h2>✦ Claude wants to ${changes.length === 1 ? (changes[0].isNew ? 'create' : 'change') : `change ${changes.length} scripts`}</h2><span class="fine" style="color:var(--fg-faint)">${esc(title || '')}</span></div>
      ${changes.length > 1 ? `<div class="diff-files">${changes.map((c, i) => `<button data-f="${i}" class="${i ? '' : 'active'}">${esc(c.path)}</button>`).join('')}</div>` : `<div class="diff-files"><button class="active">${esc(changes[0].path)}</button></div>`}
      <div class="diff-host" id="review-host"></div>
      <div class="modal-foot"><input type="text" id="review-note" placeholder="Optional: tell Claude why or what to do instead" spellcheck="false">
        <button class="danger" data-r="reject">Reject</button><button class="primary" data-r="accept">Accept</button></div>`,
    mount(card) {
      const host = card.querySelector('#review-host');
      const show = (i) => {
        current = i;
        if (view) view.dispose();
        view = diffEditor(host, changes[i].before || '', changes[i].after || '');
        card.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', Number(b.dataset.f) === i));
      };
      show(0);
      card.addEventListener('click', (e) => {
        const f = e.target.closest('[data-f]');
        if (f) { show(Number(f.dataset.f)); return; }
        const r = e.target.closest('[data-r]');
        if (!r) return;
        answer(r.dataset.r === 'accept', card.querySelector('#review-note').value.trim());
        closeModal();
      });
      card.querySelector('#review-note').addEventListener('keydown', (e) => { if (e.key === 'Enter') { answer(false, e.target.value.trim()); closeModal(); } });
    },
    unmount() { if (view) view.dispose(); answer(false, 'The window was closed.'); },
  });
});
bridge.on('review:cancel', ({ reqId }) => {
  if (modalCurrent && modalCurrent.reqId === reqId) closeModal();
  const i = modalQueue.findIndex((m) => m.reqId === reqId);
  if (i >= 0) modalQueue.splice(i, 1);
});

// ---------- What's new ----------
function releaseHtml(r, big) {
  return `<div class="release">${big ? '' : `<h3>${esc(r.version)} · ${esc(r.title)}</h3>`}<div class="release-date">${esc(new Date(r.date + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
    ${r.intro ? `<p>${r.intro}</p>` : ''}${r.sections.map(([h, items]) => `<h3>${esc(h)}</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`).join('')}</div>`;
}
function showWhatsNew() {
  const latest = CHANGELOG[0];
  openModal({
    html: `<div class="modal-head"><div class="whatsnew-hero"><img src="../icon.png" alt=""><div><div class="v">What's new · ${esc(latest.version)}</div><div class="t">${esc(latest.title)}</div></div></div><span style="flex:1"></span><button class="x" data-close>${X_SVG}</button></div>
      <div class="modal-body">${releaseHtml(latest, true)}<details style="margin-top:14px"><summary style="cursor:pointer;color:var(--fg)">Earlier versions</summary>${CHANGELOG.slice(1).map((r) => releaseHtml(r)).join('')}</details></div>
      <div class="modal-foot"><button data-wn="docs">Read the docs</button><span class="spacer"></span><button class="primary" data-close>Let's go</button></div>`,
    mount(card) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) closeModal();
        if (e.target.closest('[data-wn="docs"]')) window.open('https://bloxcode-docs.seidl.workers.dev/docs/intro');
      });
    },
    onClose() { saveSetting('lastSeenVersion', status.version || latest.version); },
  });
}

// ---------- setup assistant ----------
const WIZ_STEPS = ['welcome', 'theme', 'studio', 'claude', 'extras', 'done'];
let wizStep = 0;
let wizTimer = null;

function wizBody(step) {
  const st = status || {};
  switch (step) {
    case 'welcome':
      return `<div class="wiz-center"><img src="../icon.png" alt=""><h3>Welcome to Bloxcode ${esc(st.version || '')}</h3>
        <p>Bloxcode is a VS Code-style editor for Roblox Studio. Scripts you open in Studio open here, everything syncs live, and Claude can build features with you.</p>
        <p>This takes about a minute. You can change everything later in Settings (${MOD}+,).</p></div>`;
    case 'theme': {
      const cur = S('theme');
      return `<h3>Pick a look</h3><div class="option-cards">${THEMES.map((t) => `<button class="option-card ${t.id === cur ? 'sel' : ''}" data-wtheme="${t.id}">${swatch(t)}<div class="ttl">${esc(t.name)}</div></button>`).join('')}</div>
        <h3>Accent color</h3><div class="accent-row"><span class="accent-dot ${!S('accent') ? 'sel' : ''}" data-waccent="" style="background:${findTheme(cur).ui.accent};outline:1px dashed var(--fg-faint);outline-offset:2px" title="Theme default"></span>${ACCENTS.map((a) => `<span class="accent-dot ${S('accent') === a ? 'sel' : ''}" data-waccent="${a}" style="background:${a}"></span>`).join('')}</div>`;
    }
    case 'studio': {
      const p = st.plugin || {};
      return `<h3>Connect Roblox Studio</h3>
        <div class="check-line">1. Studio plugin <span class="state">${p.installed ? '<span class="pill ok"><span class="dot"></span>Installed</span>' : '<span class="pill err"><span class="dot"></span>Not installed</span>'}</span></div>
        <div class="check-line">2. Restart Roblox Studio (or open a place) so the plugin loads</div>
        <div class="check-line">3. Click <b>Plugins → Bloxcode</b> and turn on <b>Code Mode</b>. Allow HTTP requests and Script Injection when Studio asks.</div>
        <div class="check-line">Connection <span class="state">${st.connected ? `<span class="pill ok"><span class="dot"></span>Connected to ${esc(st.place ? st.place.name : 'Studio')}</span>` : '<span class="pill warn"><span class="dot"></span>Waiting for Studio…</span>'}</span></div>
        ${st.connected && (st.pluginVersion || 0) < 3 ? '<p style="color:var(--orange)">Studio still runs the old plugin. Restart Studio once to get play tests and faster loading.</p>' : ''}
        <p class="fine" style="color:var(--fg-faint)">You can skip this and connect later.</p>`;
    }
    case 'claude':
      return `<h3>Code with Claude (optional)</h3>
        <p>Claude can read your game, write scripts, build GUIs, run play tests and fix errors while you watch. Use your Claude plan or an API key.</p>
        <div class="check-line"><label class="switch"><input type="checkbox" data-wset="reviewClaude" ${S('reviewClaude') ? 'checked' : ''}><span></span></label> Review every change from Claude before it is applied</div>
        <button class="small-btn primary" data-wgo="claude" style="margin-top:8px;padding:6px 14px">Set up Claude now</button>`;
    case 'extras':
      return `<h3>Extras</h3>
        <div class="check-line"><label class="switch"><input type="checkbox" data-wset="lsp" ${S('lsp') ? 'checked' : ''}><span></span></label><div><b>Luau type checking</b><br><span class="fine" style="color:var(--fg-dim)">Errors while you type, hover docs, Go to Definition. Downloads luau-lsp (about 10 MB) once.</span></div></div>
        <div class="check-line"><label class="switch"><input type="checkbox" data-wset="testMode" ${S('testMode') ? 'checked' : ''}><span></span></label><div><b>Test mode</b><br><span class="fine" style="color:var(--fg-dim)">Play in Bloxcode brings Studio to the front, with a small window for Stop, errors and the Output.</span></div></div>
        ${(status.discord || '') === 'unavailable' ? '' : `<div class="check-line"><label class="switch"><input type="checkbox" data-wset="discord" ${S('discord') ? 'checked' : ''}><span></span></label><div><b>Discord Rich Presence</b><br><span class="fine" style="color:var(--fg-dim)">Show "Editing Main.server.luau" on your Discord profile.</span></div></div>`}
        <div class="check-line"><span style="width:36px"></span><div><b>GitHub</b><br><span class="fine" style="color:var(--fg-dim)">Publish your scripts with one click. Set it up any time in the GitHub panel.</span></div></div>`;
    case 'done':
      return `<div class="wiz-center"><h3>You're ready 🎉</h3><p>A few shortcuts to start with:</p></div>
        <div class="shortcuts" style="max-width:380px;margin:0 auto">
          <div><span>Open a script</span><kbd>${MOD}</kbd><kbd>P</kbd></div>
          <div><span>All commands</span><kbd>${MOD}</kbd><kbd>Shift</kbd><kbd>P</kbd></div>
          <div><span>Search all scripts</span><kbd>${MOD}</kbd><kbd>Shift</kbd><kbd>F</kbd></div>
          <div><span>Play test</span><kbd>F5</kbd></div>
          <div><span>Output panel</span><kbd>${MOD}</kbd><kbd>J</kbd></div>
        </div>`;
    default: return '';
  }
}

function renderWizard(card) {
  const step = WIZ_STEPS[wizStep];
  card.innerHTML = `<div class="modal-head"><h2>Setup</h2><button class="x" data-wiz="skip" title="Skip setup">${X_SVG}</button></div>
    <div class="wiz-steps">${WIZ_STEPS.map((_, i) => `<span class="${i <= wizStep ? 'done' : ''}"></span>`).join('')}</div>
    <div class="modal-body">${wizBody(step)}</div>
    <div class="modal-foot">${wizStep ? '<button data-wiz="back">Back</button>' : ''}<span class="spacer"></span>
      ${step === 'done' ? '<button class="primary" data-wiz="finish">Start coding</button>' : `<button class="primary" data-wiz="next">${step === 'welcome' ? "Let's go" : step === 'studio' && !status.connected ? 'Skip for now' : 'Next'}</button>`}</div>`;
}

function showWizard() {
  wizStep = 0;
  openModal({
    dismissable: false,
    html: '',
    mount(card) {
      renderWizard(card);
      // keep the Studio step live
      wizTimer = setInterval(() => { if (WIZ_STEPS[wizStep] === 'studio') renderWizard(card); }, 1500);
      card.addEventListener('click', (e) => {
        const th = e.target.closest('[data-wtheme]');
        if (th) { setS('theme', th.dataset.wtheme); renderWizard(card); return; }
        const ac = e.target.closest('[data-waccent]');
        if (ac) { setS('accent', ac.dataset.waccent || null); renderWizard(card); return; }
        const go = e.target.closest('[data-wgo]');
        if (go) { finishWizard(); showView(go.dataset.wgo); return; }
        const b = e.target.closest('[data-wiz]');
        if (!b) return;
        if (b.dataset.wiz === 'next') { wizStep = Math.min(WIZ_STEPS.length - 1, wizStep + 1); renderWizard(card); }
        else if (b.dataset.wiz === 'back') { wizStep = Math.max(0, wizStep - 1); renderWizard(card); }
        else finishWizard();
      });
      card.addEventListener('change', (e) => { if (e.target.dataset.wset) setS(e.target.dataset.wset, e.target.checked); });
    },
    unmount() { clearInterval(wizTimer); },
  });
}
function finishWizard() {
  saveSetting('setupDone', true);
  saveSetting('lastSeenVersion', status.version || CHANGELOG[0].version);
  closeModal();
}

/** First start: setup assistant. After an update: What's new. */
function startOnboarding() {
  setTimeout(() => {
    const version = status.version || CHANGELOG[0].version;
    const seen = loadSetting('lastSeenVersion', null);
    if (!loadSetting('setupDone', false)) {
      // People coming from 1.x already know Bloxcode: show What's new instead of the full setup.
      const knownUser = localStorage.getItem('bloxcode.autoSync') !== null || localStorage.getItem('bloxcode.sidebarWidth') !== null;
      if (knownUser) { saveSetting('setupDone', true); showWhatsNew(); }
      else showWizard();
    } else if (seen !== version && CHANGELOG.some((r) => r.version === version)) {
      showWhatsNew();
    }
  }, 900);
}
