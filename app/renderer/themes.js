/* global monaco, bridge */
// Themes: colors for the whole app (CSS variables) and for the code editor (Monaco).
'use strict';

const THEME_TOKENS = ['keyword', 'constant', 'builtin', 'global', 'type', 'function', 'identifier', 'string', 'escape', 'interp', 'number', 'comment', 'operator'];

// t: token colors. ui: app colors. base: Monaco base theme.
const THEMES = [
  {
    id: 'bloxcode-night', name: 'Bloxcode Night', type: 'dark', base: 'vs-dark',
    ui: { bg: '#0d0f1a', editor: '#11131f', side: '#0b0d17', border: '#1d2133', fg: '#c8cfe3', fgDim: '#8b93ad', fgFaint: '#5b627c', fgStrong: '#f2f4fb', accent: '#7c6cff', hover: '#181c2c', select: '#222740', widget: '#151827', widgetBorder: '#2a2f47', input: '#0f1220', inputBorder: '#262b42', statusOn: '#5b4be0', lineHighlight: '#ffffff08', lineNumber: '#454c66', code: '#9ece6a', link: '#7dcfff' },
    t: { keyword: 'C4A1FF', constant: 'FF9E64', builtin: '7DCFFF', global: '2AC3DE', type: '2AC3DE', function: '82AAFF', identifier: 'D6DEEB', string: '9ECE6A', escape: 'BB9AF7', interp: '89DDFF', number: 'FF9E64', comment: '5C6687', operator: '89DDFF' },
  },
  {
    id: 'bloxcode-day', name: 'Bloxcode Day', type: 'light', base: 'vs',
    ui: { bg: '#f4f5fb', editor: '#ffffff', side: '#eef0f8', border: '#dfe2ee', fg: '#2d3348', fgDim: '#5d6480', fgFaint: '#8f95ad', fgStrong: '#141826', accent: '#6550f0', hover: '#e4e7f3', select: '#d9ddf0', widget: '#ffffff', widgetBorder: '#d4d8e8', input: '#ffffff', inputBorder: '#d4d8e8', statusOn: '#5b4be0', lineHighlight: '#6550f00a', lineNumber: '#a3a9c0', code: '#3d8a1d', link: '#2563eb' },
    t: { keyword: '7C3AED', constant: 'C2410C', builtin: '0369A1', global: '0E7490', type: '0E7490', function: '2563EB', identifier: '1F2937', string: '15803D', escape: '9333EA', interp: '0284C7', number: 'C2410C', comment: '8C93AD', operator: '0369A1' },
  },
  {
    id: 'dark-plus', name: 'Dark+', type: 'dark', base: 'vs-dark',
    ui: { bg: '#1f1f1f', editor: '#1e1e1e', side: '#181818', border: '#2b2b2b', fg: '#cccccc', fgDim: '#9d9d9d', fgFaint: '#6e6e6e', fgStrong: '#ffffff', accent: '#0078d4', hover: '#2a2d2e', select: '#37373d', widget: '#252526', widgetBorder: '#454545', input: '#2a2a2a', inputBorder: '#3c3c3c', statusOn: '#16825d', lineHighlight: '#ffffff0a', lineNumber: '#6e7681', code: '#ce9178', link: '#9cdcfe' },
    t: { keyword: 'C586C0', constant: '569CD6', builtin: 'DCDCAA', global: '4EC9B0', type: '4EC9B0', function: 'DCDCAA', identifier: '9CDCFE', string: 'CE9178', escape: 'D7BA7D', interp: '569CD6', number: 'B5CEA8', comment: '6A9955', operator: 'D4D4D4' },
  },
  {
    id: 'light-plus', name: 'Light+', type: 'light', base: 'vs',
    ui: { bg: '#f8f8f8', editor: '#ffffff', side: '#f3f3f3', border: '#e0e0e0', fg: '#3b3b3b', fgDim: '#616161', fgFaint: '#8a8a8a', fgStrong: '#1f1f1f', accent: '#005fb8', hover: '#e8e8e8', select: '#dcdcdc', widget: '#ffffff', widgetBorder: '#cecece', input: '#ffffff', inputBorder: '#cecece', statusOn: '#007a5a', lineHighlight: '#0000000a', lineNumber: '#9e9e9e', code: '#a31515', link: '#005fb8' },
    t: { keyword: 'AF00DB', constant: '0000FF', builtin: '795E26', global: '267F99', type: '267F99', function: '795E26', identifier: '001080', string: 'A31515', escape: 'EE0000', interp: '0000FF', number: '098658', comment: '008000', operator: '000000' },
  },
  {
    id: 'studio-dark', name: 'Roblox Studio Dark', type: 'dark', base: 'vs-dark',
    ui: { bg: '#2e2e2e', editor: '#252525', side: '#2b2b2b', border: '#1f1f1f', fg: '#cccccc', fgDim: '#aaaaaa', fgFaint: '#7a7a7a', fgStrong: '#ffffff', accent: '#00a2ff', hover: '#3a3a3a', select: '#454545', widget: '#353535', widgetBorder: '#4a4a4a', input: '#252525', inputBorder: '#4a4a4a', statusOn: '#0b7a3e', lineHighlight: '#ffffff0d', lineNumber: '#6e6e6e', code: '#adf195', link: '#61a1f1' },
    t: { keyword: 'F86D7C', constant: 'FFC600', builtin: '84D6F7', global: '84D6F7', type: '84D6F7', function: 'FDFBAC', identifier: 'CCCCCC', string: 'ADF195', escape: 'ADF195', interp: 'F86D7C', number: 'FFC600', comment: '666666', operator: 'CCCCCC' },
  },
  {
    id: 'one-dark', name: 'One Dark', type: 'dark', base: 'vs-dark',
    ui: { bg: '#21252b', editor: '#282c34', side: '#21252b', border: '#181a1f', fg: '#abb2bf', fgDim: '#8b929e', fgFaint: '#5c6370', fgStrong: '#ffffff', accent: '#528bff', hover: '#2c313a', select: '#3a3f4b', widget: '#21252b', widgetBorder: '#3e4452', input: '#1d1f23', inputBorder: '#3e4452', statusOn: '#2e7d5b', lineHighlight: '#2c313c', lineNumber: '#495162', code: '#98c379', link: '#61afef' },
    t: { keyword: 'C678DD', constant: 'D19A66', builtin: '56B6C2', global: 'E5C07B', type: 'E5C07B', function: '61AFEF', identifier: 'E06C75', string: '98C379', escape: '56B6C2', interp: 'C678DD', number: 'D19A66', comment: '5C6370', operator: '56B6C2' },
  },
  {
    id: 'dracula', name: 'Dracula', type: 'dark', base: 'vs-dark',
    ui: { bg: '#21222c', editor: '#282a36', side: '#21222c', border: '#191a21', fg: '#f8f8f2', fgDim: '#bfbfbf', fgFaint: '#6272a4', fgStrong: '#ffffff', accent: '#bd93f9', hover: '#343746', select: '#44475a', widget: '#21222c', widgetBorder: '#44475a', input: '#282a36', inputBorder: '#44475a', statusOn: '#2f7d4e', lineHighlight: '#44475a75', lineNumber: '#6272a4', code: '#f1fa8c', link: '#8be9fd' },
    t: { keyword: 'FF79C6', constant: 'BD93F9', builtin: '8BE9FD', global: '8BE9FD', type: '8BE9FD', function: '50FA7B', identifier: 'F8F8F2', string: 'F1FA8C', escape: 'FF79C6', interp: 'FF79C6', number: 'BD93F9', comment: '6272A4', operator: 'FF79C6' },
  },
  {
    id: 'monokai', name: 'Monokai', type: 'dark', base: 'vs-dark',
    ui: { bg: '#1e1f1c', editor: '#272822', side: '#1e1f1c', border: '#141411', fg: '#f8f8f2', fgDim: '#c2c2bf', fgFaint: '#75715e', fgStrong: '#ffffff', accent: '#66d9ef', hover: '#31322c', select: '#414339', widget: '#1e1f1c', widgetBorder: '#414339', input: '#272822', inputBorder: '#414339', statusOn: '#4b7a1d', lineHighlight: '#3e3d32', lineNumber: '#90908a', code: '#e6db74', link: '#66d9ef' },
    t: { keyword: 'F92672', constant: 'AE81FF', builtin: '66D9EF', global: '66D9EF', type: '66D9EF', function: 'A6E22E', identifier: 'F8F8F2', string: 'E6DB74', escape: 'AE81FF', interp: 'F92672', number: 'AE81FF', comment: '75715E', operator: 'F92672' },
  },
  {
    id: 'github-dark', name: 'GitHub Dark', type: 'dark', base: 'vs-dark',
    ui: { bg: '#010409', editor: '#0d1117', side: '#010409', border: '#30363d', fg: '#e6edf3', fgDim: '#9198a1', fgFaint: '#6e7681', fgStrong: '#ffffff', accent: '#2f81f7', hover: '#15191f', select: '#21262d', widget: '#161b22', widgetBorder: '#30363d', input: '#0d1117', inputBorder: '#30363d', statusOn: '#238636', lineHighlight: '#6e76811a', lineNumber: '#6e7681', code: '#a5d6ff', link: '#79c0ff' },
    t: { keyword: 'FF7B72', constant: '79C0FF', builtin: 'D2A8FF', global: 'FFA657', type: 'FFA657', function: 'D2A8FF', identifier: 'E6EDF3', string: 'A5D6FF', escape: '79C0FF', interp: 'FF7B72', number: '79C0FF', comment: '8B949E', operator: 'FF7B72' },
  },
  {
    id: 'solarized-light', name: 'Solarized Light', type: 'light', base: 'vs',
    ui: { bg: '#eee8d5', editor: '#fdf6e3', side: '#eee8d5', border: '#ddd6c1', fg: '#586e75', fgDim: '#657b83', fgFaint: '#93a1a1', fgStrong: '#073642', accent: '#268bd2', hover: '#e6dfc7', select: '#dcd3b6', widget: '#fdf6e3', widgetBorder: '#d3cbb7', input: '#fdf6e3', inputBorder: '#d3cbb7', statusOn: '#2aa198', lineHighlight: '#eee8d5', lineNumber: '#93a1a1', code: '#2aa198', link: '#268bd2' },
    t: { keyword: '859900', constant: 'CB4B16', builtin: '268BD2', global: 'B58900', type: 'B58900', function: '268BD2', identifier: '657B83', string: '2AA198', escape: 'DC322F', interp: '859900', number: 'D33682', comment: '93A1A1', operator: '657B83' },
  },
  {
    id: 'high-contrast', name: 'High Contrast', type: 'hc', base: 'hc-black',
    ui: { bg: '#000000', editor: '#000000', side: '#000000', border: '#6fc3df', fg: '#ffffff', fgDim: '#ffffff', fgFaint: '#c0c0c0', fgStrong: '#ffffff', accent: '#f38518', hover: '#1a1a1a', select: '#0f4a85', widget: '#0c0c0c', widgetBorder: '#6fc3df', input: '#000000', inputBorder: '#6fc3df', statusOn: '#0b5e0b', lineHighlight: '#ffffff12', lineNumber: '#ffffff', code: '#ce9178', link: '#3794ff' },
    t: { keyword: 'C586C0', constant: '569CD6', builtin: 'DCDCAA', global: '4EC9B0', type: '4EC9B0', function: 'DCDCAA', identifier: '9CDCFE', string: 'CE9178', escape: 'D7BA7D', interp: '569CD6', number: 'B5CEA8', comment: '7CA668', operator: 'FFFFFF' },
  },
];

const ACCENTS = ['#7c6cff', '#0078d4', '#00a2ff', '#7c4dff', '#c2185b', '#e64a19', '#f9a825', '#2e7d32', '#00897b', '#5c6bc0', '#ec407a'];

function customThemes() {
  try { return JSON.parse(localStorage.getItem('bloxcode.customThemes') || '[]'); } catch (_) { return []; }
}
function allThemes() { return [...THEMES, ...customThemes()]; }
function findTheme(id) { return allThemes().find((t) => t.id === id) || THEMES[0]; }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex, other, amount) {
  const a = hexToRgb(hex), b = hexToRgb(other);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Applies a theme to the app; accent overrides the theme's accent color. */
function applyThemeColors(theme, accent) {
  const u = theme.ui;
  const acc = accent || u.accent;
  const light = theme.type === 'light';
  const accFg = luminance(acc) > 0.45 ? '#111111' : '#ffffff';
  const vars = {
    '--bg': u.bg, '--editor': u.editor, '--side': u.side, '--border': u.border,
    '--fg': u.fg, '--fg-dim': u.fgDim, '--fg-faint': u.fgFaint, '--fg-strong': u.fgStrong,
    '--accent': acc, '--accent-fg': accFg, '--accent-hover': mix(acc, light ? '#000000' : '#ffffff', 0.12),
    '--accent-soft': light ? mix(acc, '#ffffff', 0.82) : mix(acc, u.editor, 0.72),
    '--hover': u.hover, '--select': u.select, '--widget': u.widget, '--widget-border': u.widgetBorder,
    '--input': u.input, '--input-border': u.inputBorder,
    '--btn2': light ? mix(u.side, '#000000', 0.06) : mix(u.side, '#ffffff', 0.1),
    '--btn2-hover': light ? mix(u.side, '#000000', 0.11) : mix(u.side, '#ffffff', 0.15),
    '--soft': light ? '#00000010' : '#ffffff14', '--guide': light ? '#00000012' : '#ffffff10',
    '--code': u.code, '--link': u.link, '--status-on': u.statusOn,
    '--card': light ? mix(u.side, '#ffffff', 0.5) : mix(u.side, '#ffffff', 0.03),
    '--shadow': light ? '#00000026' : '#00000099',
    '--user-msg': mix(acc, u.editor, 0.55),
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.body.classList.toggle('theme-light', light);
  document.body.classList.toggle('theme-hc', theme.type === 'hc');
  bridge.post('window:titleColor', { color: u.bg, symbolColor: u.fg });
}

/** Registers a theme with Monaco (once Monaco has loaded). */
function defineMonacoTheme(theme, accent) {
  if (typeof monaco === 'undefined') return null;
  const t = theme.t;
  const u = theme.ui;
  const acc = accent || u.accent;
  const name = 'bx-' + theme.id;
  monaco.editor.defineTheme(name, {
    base: theme.base || (theme.type === 'light' ? 'vs' : 'vs-dark'),
    inherit: true,
    rules: [
      { token: '', foreground: t.identifier },
      { token: 'keyword', foreground: t.keyword },
      { token: 'constant', foreground: t.constant },
      { token: 'builtin', foreground: t.builtin },
      { token: 'global', foreground: t.global },
      { token: 'type', foreground: t.type, fontStyle: ['dracula', 'monokai'].includes(theme.id) ? 'italic' : '' },
      { token: 'function', foreground: t.function },
      { token: 'function.decl', foreground: t.function },
      { token: 'identifier', foreground: t.identifier },
      { token: 'string', foreground: t.string },
      { token: 'string.escape', foreground: t.escape },
      { token: 'delimiter.interp', foreground: t.interp },
      { token: 'number', foreground: t.number },
      { token: 'comment', foreground: t.comment, fontStyle: 'italic' },
      { token: 'operator', foreground: t.operator },
    ],
    colors: {
      'editor.background': u.editor,
      'editor.foreground': u.fg,
      'editor.lineHighlightBackground': u.lineHighlight,
      'editorLineNumber.foreground': u.lineNumber,
      'editorLineNumber.activeForeground': u.fgStrong,
      'editorCursor.foreground': acc,
      'editorWidget.background': u.widget,
      'editorWidget.border': u.widgetBorder,
      'editorSuggestWidget.background': u.widget,
      'editorSuggestWidget.border': u.widgetBorder,
      'editorSuggestWidget.selectedBackground': theme.type === 'light' ? mix(acc, '#ffffff', 0.8) : mix(acc, u.editor, 0.6),
      'editorHoverWidget.background': u.widget,
      'editorHoverWidget.border': u.widgetBorder,
      'minimap.background': u.editor,
      'scrollbarSlider.background': theme.type === 'light' ? '#64646440' : '#79797950',
      'diffEditor.insertedTextBackground': '#2ea04333',
      'diffEditor.removedTextBackground': '#f8514933',
    },
  });
  return name;
}

/** Turns a VS Code color theme JSON into a Bloxcode theme, so people can import their favorite. */
function themeFromVsCode(json, fallbackName) {
  const c = json.colors || {};
  const rules = json.tokenColors || [];
  const tok = (scopes, fallback) => {
    for (const r of rules) {
      const s = [].concat(r.scope || []).join(',');
      if (scopes.some((x) => s.includes(x)) && r.settings && r.settings.foreground) return r.settings.foreground.replace('#', '').slice(0, 6);
    }
    return fallback;
  };
  const type = json.type === 'light' ? 'light' : json.type === 'hc' || json.type === 'hcDark' ? 'hc' : 'dark';
  const base = THEMES.find((x) => x.id === (type === 'light' ? 'bloxcode-day' : 'bloxcode-night'));
  const editor = c['editor.background'] || base.ui.editor;
  return {
    id: 'custom-' + Date.now().toString(36),
    name: json.name || fallbackName || 'Imported theme',
    type, base: type === 'light' ? 'vs' : type === 'hc' ? 'hc-black' : 'vs-dark',
    ui: {
      ...base.ui,
      bg: c['titleBar.activeBackground'] || c['sideBar.background'] || base.ui.bg,
      editor,
      side: c['sideBar.background'] || c['activityBar.background'] || base.ui.side,
      border: c['panel.border'] || c['sideBar.border'] || c['editorGroup.border'] || base.ui.border,
      fg: c['editor.foreground'] || c.foreground || base.ui.fg,
      fgDim: c['descriptionForeground'] || base.ui.fgDim,
      accent: c['focusBorder'] || c['button.background'] || base.ui.accent,
      hover: c['list.hoverBackground'] || base.ui.hover,
      select: c['list.activeSelectionBackground'] || c['list.inactiveSelectionBackground'] || base.ui.select,
      widget: c['editorWidget.background'] || base.ui.widget,
      widgetBorder: c['editorWidget.border'] || c['widget.border'] || base.ui.widgetBorder,
      input: c['input.background'] || base.ui.input,
      inputBorder: c['input.border'] || base.ui.inputBorder,
      statusOn: c['statusBar.background'] || base.ui.statusOn,
      lineHighlight: c['editor.lineHighlightBackground'] || base.ui.lineHighlight,
      lineNumber: c['editorLineNumber.foreground'] || base.ui.lineNumber,
    },
    t: {
      keyword: tok(['keyword.control', 'keyword', 'storage'], base.t.keyword),
      constant: tok(['constant.language'], base.t.constant),
      builtin: tok(['support.function'], base.t.builtin),
      global: tok(['support.class', 'support.type'], base.t.global),
      type: tok(['entity.name.type', 'support.type'], base.t.type),
      function: tok(['entity.name.function'], base.t.function),
      identifier: tok(['variable'], base.t.identifier),
      string: tok(['string'], base.t.string),
      escape: tok(['constant.character.escape'], base.t.escape),
      interp: tok(['punctuation.definition.template-expression', 'keyword.operator'], base.t.interp),
      number: tok(['constant.numeric'], base.t.number),
      comment: tok(['comment'], base.t.comment),
      operator: tok(['keyword.operator'], base.t.operator),
    },
  };
}
