/* global monaco, bridge, $, esc, toast, loadSetting, saveSetting, THEMES, ACCENTS, allThemes, findTheme, applyThemeColors, defineMonacoTheme, themeFromVsCode, customThemes, allEditors, autoSync:writable, renderStatus, MOD, IS_MAC, showWhatsNew, showWizard, showView, status */
// Settings: the settings page (Ctrl+,) and everything that reads settings.
'use strict';

const SETTING_DEFAULTS = {
  theme: 'bloxcode-night',
  accent: null,
  uiFontSize: 13,
  fontFamily: 'Cascadia Code',
  fontSize: 14,
  lineHeight: 1.5,
  ligatures: true,
  minimap: true,
  wordWrap: false,
  stickyScroll: true,
  tabSize: 4,
  renderWhitespace: 'selection',
  cursorStyle: 'line',
  smoothCaret: true,
  bracketColors: true,
  lineNumbers: true,
  autoSyncDelay: 350,
  lsp: true,
  reviewClaude: false,
  testMode: true,
  discord: false,
  discordShowFile: true,
  discordShowPlace: true,
  reduceMotion: false,
};

function S(key) { return loadSetting('s.' + key, SETTING_DEFAULTS[key]); }
function setS(key, value) {
  saveSetting('s.' + key, value);
  onSettingChanged(key);
}

const FONTS = ['Cascadia Code', 'Consolas', 'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Menlo', 'SF Mono', 'Courier New'];

function editorOptions() {
  const size = Number(S('fontSize'));
  return {
    fontFamily: `"${S('fontFamily')}", "Cascadia Code", "Cascadia Mono", Consolas, Menlo, monospace`,
    fontSize: size,
    lineHeight: Math.round(size * Number(S('lineHeight'))),
    fontLigatures: !!S('ligatures'),
    minimap: { enabled: !!S('minimap'), renderCharacters: false },
    wordWrap: S('wordWrap') ? 'on' : 'off',
    stickyScroll: { enabled: !!S('stickyScroll') },
    tabSize: Number(S('tabSize')),
    renderWhitespace: S('renderWhitespace'),
    cursorStyle: S('cursorStyle'),
    cursorSmoothCaretAnimation: S('smoothCaret') ? 'on' : 'off',
    bracketPairColorization: { enabled: !!S('bracketColors') },
    lineNumbers: S('lineNumbers') ? 'on' : 'off',
  };
}

function currentMonacoTheme() {
  return defineMonacoTheme(findTheme(S('theme')), S('accent')) || 'vs-dark';
}

/** Applies theme, accent and sizes to the app and every editor. */
function applyAppearance() {
  const theme = findTheme(S('theme'));
  applyThemeColors(theme, S('accent'));
  document.documentElement.style.setProperty('--ui-size', S('uiFontSize') + 'px');
  document.body.classList.toggle('reduce-motion', !!S('reduceMotion'));
  if (typeof monaco !== 'undefined') {
    const name = defineMonacoTheme(theme, S('accent'));
    monaco.editor.setTheme(name);
  }
}

function applyEditorOptions() {
  if (typeof allEditors !== 'function') return;
  for (const ed of allEditors()) ed.updateOptions(editorOptions());
  for (const d of (typeof docs !== 'undefined' ? docs.values() : [])) d.model.updateOptions({ tabSize: Number(S('tabSize')) });
  const ind = document.getElementById('sb-indent');
  if (ind) ind.textContent = `Tabs: ${S('tabSize')}`;
}

function pushMainSettings() {
  bridge.post('settings:apply', {
    lsp: !!S('lsp'),
    reviewClaude: !!S('reviewClaude'),
    testMode: !!S('testMode'),
    discord: !!S('discord'),
    discordOptions: { showFile: !!S('discordShowFile'), showPlace: !!S('discordShowPlace') },
  });
  const review = document.getElementById('chat-review');
  if (review) review.checked = !!S('reviewClaude');
}

function onSettingChanged(key) {
  if (['theme', 'accent', 'uiFontSize', 'reduceMotion'].includes(key)) applyAppearance();
  else if (['lsp', 'reviewClaude', 'testMode', 'discord', 'discordShowFile', 'discordShowPlace'].includes(key)) pushMainSettings();
  else applyEditorOptions();
  if (!document.getElementById('settings-page').classList.contains('hidden')) renderSettings();
}

/** Called once after Monaco is ready. */
function initFeatures() {
  applyEditorOptions();
  pushMainSettings();
  if (typeof initLspClient === 'function') initLspClient();
  if (typeof initPanel === 'function') initPanel();
}

// ---------- settings page ----------
let settingsSection = 'appearance';
let settingsQuery = '';

function openSettings(section) {
  if (section) settingsSection = section;
  document.getElementById('settings-page').classList.remove('hidden');
  renderSettings();
  const el = document.getElementById('set-' + settingsSection);
  if (el) el.scrollIntoView({ block: 'start' });
}
function closeSettings() {
  document.getElementById('settings-page').classList.add('hidden');
}

function swatch(theme) {
  const u = theme.ui, t = theme.t;
  return `<div class="theme-swatch" style="background:${u.editor}"><div class="sb" style="background:${u.side}"></div><div class="ed">
    <i style="width:55%;background:#${t.keyword}"></i><i style="width:80%;background:#${t.function}"></i><i style="width:40%;background:#${t.string}"></i><i style="width:65%;background:#${t.comment}"></i></div></div>`;
}

function toggleCtl(key) {
  return `<label class="switch"><input type="checkbox" data-set="${key}" ${S(key) ? 'checked' : ''}><span></span></label>`;
}
function selectCtl(key, options) {
  return `<select data-set="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(S(key)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function numCtl(key, min, max, step = 1) {
  return `<input type="number" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${esc(S(key))}">`;
}
function setRow(label, help, control) {
  return `<div class="set-row" data-search="${esc((label + ' ' + help).toLowerCase())}"><div class="lbl"><b>${esc(label)}</b><span>${help}</span></div><div class="ctl">${control}</div></div>`;
}

const SHORTCUTS = [
  ['Go to a script', 'Ctrl+P'], ['All commands', 'Ctrl+Shift+P'], ['Search & replace in all scripts', 'Ctrl+Shift+F / Ctrl+Shift+H'],
  ['Send to Studio', 'Ctrl+S'], ['Close tab', 'Ctrl+W'], ['Next / previous tab', 'Ctrl+Tab / Ctrl+Shift+Tab'],
  ['Split editor', 'Ctrl+\\'], ['Output panel', 'Ctrl+J'], ['Problems', 'Ctrl+Shift+M'], ['Explorer', 'Ctrl+Shift+E'],
  ['Settings', 'Ctrl+,'], ['Go to definition', 'F12'], ['Find all references', 'Shift+F12'], ['Rename symbol', 'F2'],
  ['Play test / Run / Stop', 'F5 / F8 / Shift+F5'], ['Find in script', 'Ctrl+F'], ['Replace in script', 'Ctrl+H'],
  ['Go to line', 'Ctrl+G'], ['Comment line', 'Ctrl+/'], ['Move line', 'Alt+↑ / Alt+↓'], ['Zoom editor', 'Ctrl+Mouse wheel'],
];

function renderSettings() {
  const st = typeof status !== 'undefined' ? status : {};
  const themes = allThemes();
  const current = S('theme');
  const accent = S('accent');
  const lsp = (st.lsp || {});
  const discordState = st.discord || 'off';
  const sections = [
    ['appearance', 'Appearance'], ['editor', 'Editor'], ['studio', 'Studio sync'], ['luau', 'Luau'], ['claude', 'Claude'],
    ['integrations', 'Discord'], ['shortcuts', 'Keyboard shortcuts'], ['about', 'About'],
  ];
  const kb = (k) => (IS_MAC ? k.replace(/Ctrl\+Shift\+/g, '⇧⌘').replace(/Ctrl\+/g, '⌘') : k);
  const preview = `local Players = game:GetService("Players")\n\n-- ${S('fontFamily')}, ${S('fontSize')} px\nlocal function greet(player: Player): string\n\treturn \`Welcome {player.Name}!\` -- => != ~=\nend`;
  document.getElementById('settings-page').innerHTML = `
  <div class="settings-wrap">
    <nav class="settings-nav">${sections.map(([id, l]) => `<button data-sec="${id}" class="${id === settingsSection ? 'active' : ''}">${l}</button>`).join('')}</nav>
    <div class="settings-main">
      <h1>Settings <button class="x" data-close title="Close (Esc)"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button></h1>
      <input class="field settings-search" id="settings-search" placeholder="Search settings" value="${esc(settingsQuery)}" spellcheck="false">

      <div class="set-section" id="set-appearance"><h2>Appearance</h2>
        <div class="set-row" data-search="theme color dark light dracula monokai one github solarized studio contrast"><div class="lbl"><b>Color theme</b><span>Colors for the whole app and the code editor.</span>
          <div class="theme-grid">${themes.map((t) => `<button class="option-card ${t.id === current ? 'sel' : ''}" data-theme="${esc(t.id)}">${swatch(t)}<div class="ttl">${esc(t.name)}</div><div class="sub">${t.type === 'light' ? 'Light' : t.type === 'hc' ? 'High contrast' : 'Dark'}${t.id.startsWith('custom-') ? ' · imported' : ''}</div></button>`).join('')}</div>
          <div style="display:flex;gap:8px;margin-top:6px"><button class="small-btn" data-act="import-theme">Import theme…</button><button class="small-btn" data-act="export-theme">Export current theme…</button>${current.startsWith('custom-') ? '<button class="small-btn danger" data-act="delete-theme">Delete this theme</button>' : ''}</div>
          <span style="font-size:12px">Import a Bloxcode theme or any VS Code color theme (.json).</span>
        </div></div>
        ${setRow('Accent color', 'Buttons, the active tab, selections and the cursor.', `<div class="accent-row"><span class="accent-dot ${!accent ? 'sel' : ''}" data-accent="" title="Theme default" style="background:${findTheme(current).ui.accent};outline:1px dashed var(--fg-faint);outline-offset:2px"></span>${ACCENTS.map((a) => `<span class="accent-dot ${accent === a ? 'sel' : ''}" data-accent="${a}" style="background:${a}"></span>`).join('')}<input type="color" id="accent-custom" value="${esc(accent || findTheme(current).ui.accent)}" title="Custom color"></div>`)}
        ${setRow('Interface size', 'Text size of menus, panels and the Explorer.', selectCtl('uiFontSize', [[12, 'Small (12)'], [13, 'Default (13)'], [14, 'Large (14)'], [15, 'Larger (15)']]))}
        ${setRow('Reduce motion', 'Turns off animations.', toggleCtl('reduceMotion'))}
      </div>

      <div class="set-section" id="set-editor"><h2>Editor</h2>
        ${setRow('Font', 'Fonts that are not installed fall back to Cascadia Code or Consolas.', selectCtl('fontFamily', FONTS.map((f) => [f, f])))}
        ${setRow('Font size', 'You can also zoom with Ctrl + mouse wheel.', numCtl('fontSize', 9, 32))}
        ${setRow('Line height', 'Space between lines, relative to the font size.', selectCtl('lineHeight', [[1.3, 'Compact'], [1.5, 'Default'], [1.7, 'Relaxed'], [1.9, 'Spacious']]))}
        ${setRow('Font ligatures', 'Draw => != ~= as one symbol (with fonts that support it).', toggleCtl('ligatures'))}
        <div class="set-preview" style="--preview-size:${S('fontSize')}px;font-family:'${esc(S('fontFamily'))}', var(--mono);font-variant-ligatures:${S('ligatures') ? 'normal' : 'none'}">${esc(preview)}</div>
        ${setRow('Minimap', 'The code overview on the right.', toggleCtl('minimap'))}
        ${setRow('Word wrap', 'Wrap long lines instead of scrolling sideways.', toggleCtl('wordWrap'))}
        ${setRow('Sticky scroll', 'Keep the current function header visible while scrolling.', toggleCtl('stickyScroll'))}
        ${setRow('Line numbers', '', toggleCtl('lineNumbers'))}
        ${setRow('Bracket colors', 'Color matching brackets.', toggleCtl('bracketColors'))}
        ${setRow('Tab size', 'Roblox Studio uses 4.', selectCtl('tabSize', [[2, '2'], [4, '4'], [8, '8']]))}
        ${setRow('Show whitespace', '', selectCtl('renderWhitespace', [['none', 'Never'], ['selection', 'In selection'], ['boundary', 'Between words'], ['all', 'Always']]))}
        ${setRow('Cursor', '', selectCtl('cursorStyle', [['line', 'Line'], ['block', 'Block'], ['underline', 'Underline'], ['line-thin', 'Thin line']]))}
        ${setRow('Smooth cursor', 'Animate the cursor when it moves.', toggleCtl('smoothCaret'))}
      </div>

      <div class="set-section" id="set-studio"><h2>Studio sync</h2>
        ${setRow('Auto Sync', `Send changes to Studio while you type. When off, press ${kb('Ctrl+S')}.`, `<label class="switch"><input type="checkbox" data-act="autosync" ${autoSync ? 'checked' : ''}><span></span></label>`)}
        ${setRow('Test mode', 'When you press Play in Bloxcode, Studio comes to the front and a small floating window shows Stop, errors and the Output. When the test ends, you are back in Bloxcode.', toggleCtl('testMode'))}
        ${setRow('Studio plugin', st.connected ? `Connected to ${esc(st.place ? st.place.name : 'Studio')} · plugin v${st.pluginVersion || '?'}` : 'Not connected. Open Studio and turn on Code Mode.', '<button class="small-btn" data-act="plugin">Plugin help</button>')}
      </div>

      <div class="set-section" id="set-luau"><h2>Luau</h2>
        ${setRow('Luau language server', 'Real type checking, errors while you type, hover info, go to definition, find references and rename. Uses <a href="https://github.com/JohnnyMorganz/luau-lsp" target="_blank">luau-lsp</a>, downloaded on first use (about 10 MB).', toggleCtl('lsp'))}
        ${setRow('Status', esc(lsp.detail || (lsp.state === 'off' ? 'Off' : lsp.state || 'Off')), '<button class="small-btn" data-act="lsp-restart">Restart</button>')}
      </div>

      <div class="set-section" id="set-claude"><h2>Claude</h2>
        ${setRow("Review Claude's changes", 'Show every script change from Claude as a diff first. Nothing changes in Studio until you click Accept.', toggleCtl('reviewClaude'))}
        ${setRow('Chat and connection', 'Use your Claude plan or an API key, or connect Claude Desktop.', '<button class="small-btn" data-act="claude">Open Claude panel</button>')}
      </div>

      <div class="set-section" id="set-integrations"><h2>Discord</h2>
        ${setRow('Discord Rich Presence', `Show "Editing Main.server.luau" on your Discord profile. Works while the Discord app runs. ${discordState === 'connected' ? '<b style="color:var(--green)">Connected</b>' : discordState === 'unavailable' ? '<b>Coming in a small update.</b>' : discordState === 'waiting' ? 'Waiting for Discord…' : ''}`, toggleCtl('discord'))}
        ${setRow('Show the script name', '', toggleCtl('discordShowFile'))}
        ${setRow('Show the place name', '', toggleCtl('discordShowPlace'))}
      </div>

      <div class="set-section" id="set-shortcuts"><h2>Keyboard shortcuts</h2>
        <table class="kb-table">${SHORTCUTS.map(([l, k]) => `<tr data-search="${esc(l.toLowerCase())}"><td>${esc(l)}</td><td>${k.split(' / ').map((x) => x.split('+').map((p) => `<kbd>${esc(kb(p))}</kbd>`).join('+')).join(' / ')}</td></tr>`).join('')}</table>
      </div>

      <div class="set-section" id="set-about"><h2>About</h2>
        ${setRow('Bloxcode', `Version ${esc(st.version || '')} · <a href="https://bloxcode-docs.seidl.workers.dev" target="_blank">Website</a> · <a href="https://github.com/Veitheim/bloxcode" target="_blank">GitHub</a> · <a href="https://github.com/Veitheim/bloxcode/issues" target="_blank">Report a bug</a>`, '<button class="small-btn" data-act="whatsnew">What\'s new</button>')}
        ${setRow('Setup assistant', 'Go through the first-start setup again.', '<button class="small-btn" data-act="wizard">Start</button>')}
        ${setRow('Reset settings', 'Back to the default theme and editor settings.', '<button class="small-btn danger" data-act="reset">Reset</button>')}
      </div>
    </div>
  </div>`;
  applySettingsFilter();
}

function applySettingsFilter() {
  const q = settingsQuery.trim().toLowerCase();
  const page = document.getElementById('settings-page');
  page.querySelectorAll('[data-search]').forEach((el) => { el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none'; });
  page.querySelectorAll('.set-section').forEach((sec) => {
    const visible = !q || [...sec.querySelectorAll('[data-search]')].some((el) => el.style.display !== 'none');
    sec.style.display = visible ? '' : 'none';
  });
}

const settingsPage = document.getElementById('settings-page');
settingsPage.addEventListener('input', (e) => {
  if (e.target.id === 'settings-search') { settingsQuery = e.target.value; applySettingsFilter(); return; }
  if (e.target.id === 'accent-custom') { saveSetting('s.accent', e.target.value); applyAppearance(); }
});
settingsPage.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'accent-custom') { setS('accent', el.value); return; }
  if (el.dataset.act === 'autosync') { document.getElementById('sb-autosync').click(); return; }
  const key = el.dataset.set;
  if (!key) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (typeof SETTING_DEFAULTS[key] === 'number') v = Number(v);
  setS(key, v);
});
settingsPage.addEventListener('click', async (e) => {
  if (e.target.closest('[data-close]')) { closeSettings(); return; }
  const sec = e.target.closest('[data-sec]');
  if (sec) {
    settingsSection = sec.dataset.sec;
    settingsQuery = '';
    renderSettings();
    document.getElementById('set-' + settingsSection).scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const th = e.target.closest('[data-theme]');
  if (th) { setS('theme', th.dataset.theme); return; }
  const ac = e.target.closest('[data-accent]');
  if (ac) { setS('accent', ac.dataset.accent || null); return; }
  const act = e.target.closest('[data-act]');
  if (!act || act.tagName === 'INPUT') return;
  switch (act.dataset.act) {
    case 'import-theme': {
      try {
        const json = await bridge.invoke('theme:import');
        if (!json) return;
        const theme = json.ui && json.t ? { ...json, id: 'custom-' + Date.now().toString(36) } : themeFromVsCode(json);
        const list = customThemes();
        list.push(theme);
        localStorage.setItem('bloxcode.customThemes', JSON.stringify(list));
        setS('theme', theme.id);
        toast(`Imported "${theme.name}".`);
      } catch (err) { toast('That file is not a theme: ' + err.message, 'error'); }
      break;
    }
    case 'export-theme': {
      const t = findTheme(S('theme'));
      const accent = S('accent');
      const out = { name: t.name + (accent ? ' (custom accent)' : ''), type: t.type, base: t.base, ui: { ...t.ui, ...(accent ? { accent } : {}) }, t: t.t };
      if (await bridge.invoke('theme:export', out)) toast('Theme exported.');
      break;
    }
    case 'delete-theme': {
      const id = S('theme');
      localStorage.setItem('bloxcode.customThemes', JSON.stringify(customThemes().filter((t) => t.id !== id)));
      setS('theme', 'bloxcode-night');
      break;
    }
    case 'lsp-restart': bridge.invoke('lsp:restart'); toast('Restarting the Luau language server…'); break;
    case 'plugin': closeSettings(); showView('plugin'); break;
    case 'claude': closeSettings(); showView('claude'); break;
    case 'whatsnew': showWhatsNew(); break;
    case 'wizard': showWizard(); break;
    case 'reset':
      if (!confirm('Reset all settings to their defaults?')) return;
      for (const k of Object.keys(SETTING_DEFAULTS)) localStorage.removeItem('bloxcode.s.' + k);
      applyAppearance(); applyEditorOptions(); pushMainSettings(); renderSettings();
      break;
    default: break;
  }
});

document.getElementById('chat-review').addEventListener('change', (e) => setS('reviewClaude', e.target.checked));

// Apply the app colors right away so there is no flash of the default theme.
applyThemeColors(findTheme(S('theme')), S('accent'));
document.documentElement.style.setProperty('--ui-size', S('uiFontSize') + 'px');
