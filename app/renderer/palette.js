/* global bridge, $, toast, openQuick, quickOpen, quickInput, quickState, newScriptFlow, closeDoc, docs, activeId, tabOrder, syncDoc, splitEditor, closeSplit, groups, tree, luaPath, showView, select, togglePanel, showPanel, S, setS, allThemes, openSettings, startPlaytest, stopPlaytest, requireConnection, showWhatsNew, showWizard, showHistoryFor, STARTER_PROMPT, MOD, IS_MAC, githubPublishQuick */
// Command palette (Ctrl+Shift+P): every action in one searchable list.
'use strict';

function kbd(k) { return IS_MAC ? k.replace(/Ctrl\+Shift\+/g, '⇧⌘').replace(/Ctrl\+/g, '⌘') : k; }

function paletteCommands() {
  const hasDoc = !!activeId;
  const cmds = [
    ['File', 'Go to Script…', 'Ctrl+P', () => quickOpen()],
    ['File', 'New Script…', '', () => newScriptFlow()],
    ['File', 'Send to Studio', 'Ctrl+S', () => hasDoc && syncDoc(docs.get(activeId))],
    ['File', 'Close Tab', 'Ctrl+W', () => hasDoc && closeDoc(activeId)],
    ['File', 'Close All Tabs', '', () => [...tabOrder].forEach((id) => closeDoc(id))],
    ['File', 'Split Editor', 'Ctrl+\\', () => splitEditor()],
    ['File', 'Close Split', '', () => closeSplit()],
    ['File', 'Copy Lua Path of This Script', '', () => { const n = tree.nodes.get(activeId); if (n) { bridge.copy(luaPath(n)); toast('Copied ' + luaPath(n)); } }],
    ['File', 'Reveal This Script in Explorer', '', () => { if (hasDoc) { showView('explorer'); select(activeId, true); } }],
    ['File', 'Select This Script in Studio', '', () => hasDoc && bridge.send({ type: 'select', id: activeId })],
    ['File', 'Show History of This Script', '', () => hasDoc && showHistoryFor(activeId)],
    ['View', 'Explorer', 'Ctrl+Shift+E', () => showView('explorer')],
    ['View', 'Search & Replace in All Scripts', 'Ctrl+Shift+F', () => showView('search')],
    ['View', 'Properties', '', () => showView('properties')],
    ['View', 'Wally Packages', '', () => showView('packages')],
    ['View', 'GitHub', '', () => showView('github')],
    ['View', 'Claude', '', () => showView('claude')],
    ['View', 'Studio Plugin', '', () => showView('plugin')],
    ['View', 'Toggle Output Panel', 'Ctrl+J', () => togglePanel()],
    ['View', 'Problems', 'Ctrl+Shift+M', () => showPanel('problems')],
    ['View', 'Output', 'Ctrl+Shift+U', () => showPanel('output')],
    ['View', 'Toggle Minimap', '', () => setS('minimap', !S('minimap'))],
    ['View', 'Toggle Word Wrap', '', () => setS('wordWrap', !S('wordWrap'))],
    ['View', 'Bigger Font', '', () => setS('fontSize', Math.min(32, Number(S('fontSize')) + 1))],
    ['View', 'Smaller Font', '', () => setS('fontSize', Math.max(9, Number(S('fontSize')) - 1))],
    ['Preferences', 'Open Settings', 'Ctrl+,', () => openSettings()],
    ['Preferences', 'Color Theme…', '', () => pickTheme()],
    ['Preferences', 'Keyboard Shortcuts', '', () => openSettings('shortcuts')],
    ['Studio', 'Start Play Test', 'F5', () => startPlaytest('play')],
    ['Studio', 'Run Server Only', 'F8', () => startPlaytest('run')],
    ['Studio', 'Stop Play Test', 'Shift+F5', () => stopPlaytest()],
    ['Studio', 'Refresh Explorer from Studio', '', () => { if (requireConnection()) bridge.send({ type: 'snapshot' }); }],
    ['Studio', 'Toggle Auto Sync', '', () => $('#sb-autosync').click()],
    ['Studio', 'Reinstall Studio Plugin', '', async () => { const r = await bridge.installPlugin(); toast(r.installed ? 'Plugin installed. Restart Studio if it changed.' : 'Error: ' + r.error, r.installed ? 'info' : 'error'); }],
    ['Studio', 'Clear Output', '', () => outputClear(true)],
    ['Luau', 'Restart Language Server', '', () => { bridge.invoke('lsp:restart'); toast('Restarting the Luau language server…'); }],
    ['Luau', S('lsp') ? 'Turn Off Language Server' : 'Turn On Language Server', '', () => setS('lsp', !S('lsp'))],
    ['Claude', 'New Chat', '', () => { showView('claude'); document.getElementById('chat-new').click(); }],
    ['Claude', S('reviewClaude') ? "Stop Reviewing Claude's Changes" : "Review Claude's Changes Before They Apply", '', () => setS('reviewClaude', !S('reviewClaude'))],
    ['Claude', 'Connect Claude Desktop', '', async () => { const r = await bridge.connectClaude(); toast(r.done.length ? 'Connected. Restart Claude to load Bloxcode.' : r.errors.join(' '), r.done.length ? 'info' : 'error'); }],
    ['Claude', 'Copy Starter Prompt', '', () => { bridge.copy(STARTER_PROMPT); toast('Prompt copied.'); }],
    ['GitHub', 'Publish to GitHub', '', () => githubPublishQuick()],
    ['Help', "What's New", '', () => showWhatsNew()],
    ['Help', 'Setup Assistant', '', () => showWizard()],
    ['Help', 'Open Website', '', () => window.open('https://bloxcode-docs.seidl.workers.dev')],
    ['Help', 'Report a Bug', '', () => window.open('https://github.com/Veitheim/bloxcode/issues/new')],
  ];
  return cmds.map(([group, label, key, run]) => ({ label: `${group}: ${label}`, detail: key ? kbd(key) : '', group, run }));
}

function openPalette(value = '') {
  const recent = loadSetting('recentCommands', []);
  const items = paletteCommands().sort((a, b) => {
    const ra = recent.indexOf(a.label), rb = recent.indexOf(b.label);
    return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
  });
  openQuick({
    placeholder: 'Type a command',
    value,
    selectAll: false,
    items,
    onPick: (it) => {
      saveSetting('recentCommands', [it.label, ...recent.filter((r) => r !== it.label)].slice(0, 8));
      setTimeout(() => it.run(), 0);
    },
  });
}

function pickTheme() {
  const before = S('theme');
  openQuick({
    placeholder: 'Choose a color theme',
    items: allThemes().map((t) => ({ label: t.name, detail: t.id === before ? 'current' : t.type === 'light' ? 'light' : t.type === 'hc' ? 'high contrast' : 'dark', group: t.type === 'light' ? 'Light' : 'Dark', id: t.id })),
    onPick: (it) => setS('theme', it.id),
  });
}

// Typing ">" in Go to File switches to commands, like in VS Code.
quickInput.addEventListener('input', () => {
  if (quickState && quickState.placeholder && quickState.placeholder.startsWith('Search scripts') && quickInput.value.startsWith('>')) {
    openPalette(quickInput.value.slice(1));
  }
});
