/* global monaco, bridge, toast, docs, activeId, openAt, openQuick, classIcon, tree, applyRemoteSource, setProblems, cleanErr, askText, renderStatus, status */
// Connects the code editor to the Luau language server (luau-lsp) running in the main process.
'use strict';

let lspState = 'off';
const lspTimers = new Map();
window.__lspReady = () => lspState === 'ready';

bridge.on('lsp:state', (s) => {
  lspState = s.state;
  if (s.state === 'ready') resendOpenDocs();
});
bridge.on('lsp:diagnostics', ({ id, items }) => {
  if (typeof setProblems === 'function') setProblems(id, items);
  const d = docs.get(id);
  if (d) setMarkers(d, items);
});

function idOfModel(model) {
  const m = String(model.uri.path || '').match(/^\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

function setMarkers(doc, items) {
  const sev = { 1: monaco.MarkerSeverity.Error, 2: monaco.MarkerSeverity.Warning, 3: monaco.MarkerSeverity.Info, 4: monaco.MarkerSeverity.Hint };
  monaco.editor.setModelMarkers(doc.model, 'luau', (items || []).map((i) => ({
    severity: sev[i.severity] || monaco.MarkerSeverity.Error,
    message: i.message,
    code: i.code ? String(i.code) : undefined,
    startLineNumber: i.line, startColumn: i.col, endLineNumber: i.endLine, endColumn: Math.max(i.endCol, i.col + (i.endLine === i.line ? 1 : 0)),
    source: 'Luau',
  })));
}

/** The editor's text may be ahead of Studio; keep the language server up to date. */
function lspNotify(doc) {
  if (lspState !== 'ready') return;
  clearTimeout(lspTimers.get(doc.id));
  lspTimers.set(doc.id, setTimeout(() => { lspTimers.delete(doc.id); bridge.post('lsp:text', doc.id, doc.model.getValue()); }, 250));
}
function lspFlush(id) {
  if (!lspTimers.has(id)) return;
  clearTimeout(lspTimers.get(id));
  lspTimers.delete(id);
  const d = docs.get(id);
  if (d) bridge.post('lsp:text', id, d.model.getValue());
}
function resendOpenDocs() { for (const d of docs.values()) if (d.dirty) bridge.post('lsp:text', d.id, d.model.getValue()); }

function onDocOpened(doc) {
  bridge.invoke('lsp:diagnostics').then((list) => {
    const f = list.find((x) => x.id === doc.id);
    if (f) setMarkers(doc, f.items);
  }).catch(() => {});
}

async function lspCall(kind, model, position, extra) {
  if (lspState !== 'ready') return null;
  const id = idOfModel(model);
  if (!id) return null;
  lspFlush(id);
  try { return await bridge.invoke('lsp:call', kind, id, position.lineNumber, position.column, extra); } catch (_) { return null; }
}

function toRange(r) { return new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1); }
function md(content) {
  if (!content) return undefined;
  if (typeof content === 'string') return { value: content };
  if (Array.isArray(content)) return { value: content.map((c) => (typeof c === 'string' ? c : '```' + (c.language || '') + '\n' + c.value + '\n```')).join('\n\n') };
  if (content.kind === 'markdown' || content.kind === 'plaintext') return { value: content.value };
  if (content.language) return { value: '```' + content.language + '\n' + content.value + '\n```' };
  return { value: String(content.value || '') };
}

const LSP_KIND = ['', 'Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'];

function initLspClient() {
  const K = monaco.languages.CompletionItemKind;

  monaco.languages.registerCompletionItemProvider('luau', {
    triggerCharacters: ['.', ':', '"', "'", '/'],
    async provideCompletionItems(model, position, context) {
      const r = await lspCall('completion', model, position, { trigger: context.triggerCharacter });
      if (!r) return { suggestions: [] };
      const list = Array.isArray(r) ? r : r.items || [];
      const word = model.getWordUntilPosition(position);
      const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      return {
        incomplete: !!r.isIncomplete,
        suggestions: list.map((it) => {
          const edit = it.textEdit;
          const range = edit ? (edit.range ? toRange(edit.range) : { insert: toRange(edit.insert), replace: toRange(edit.replace) }) : fallback;
          return {
            label: it.labelDetails ? { label: it.label, detail: it.labelDetails.detail, description: it.labelDetails.description } : it.label,
            kind: K[LSP_KIND[it.kind] || 'Text'] ?? K.Text,
            detail: it.detail,
            documentation: md(it.documentation),
            insertText: edit ? edit.newText : it.insertText || it.label,
            insertTextRules: it.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range,
            sortText: it.sortText,
            filterText: it.filterText,
            preselect: it.preselect,
            tags: it.deprecated || (it.tags || []).includes(1) ? [monaco.languages.CompletionItemTag.Deprecated] : undefined,
            additionalTextEdits: (it.additionalTextEdits || []).map((e) => ({ range: toRange(e.range), text: e.newText })),
            command: it.command && it.command.command === 'editor.action.triggerParameterHints' ? { id: 'editor.action.triggerParameterHints', title: '' } : undefined,
          };
        }),
      };
    },
  });

  monaco.languages.registerHoverProvider('luau', {
    async provideHover(model, position) {
      const r = await lspCall('hover', model, position);
      if (!r || !r.contents) return null;
      const c = md(r.contents);
      if (!c || !c.value) return null;
      return { contents: [c], range: r.range ? toRange(r.range) : undefined };
    },
  });

  monaco.languages.registerSignatureHelpProvider('luau', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    async provideSignatureHelp(model, position) {
      const r = await lspCall('signature', model, position);
      if (!r || !r.signatures || !r.signatures.length) return null;
      return {
        value: {
          signatures: r.signatures.map((s) => ({
            label: s.label,
            documentation: md(s.documentation),
            parameters: (s.parameters || []).map((p) => ({ label: p.label, documentation: md(p.documentation) })),
          })),
          activeSignature: r.activeSignature || 0,
          activeParameter: r.activeParameter || 0,
        },
        dispose() {},
      };
    },
  });

  // Same-script definitions (Ctrl+Click); F12 also jumps into other scripts.
  monaco.languages.registerDefinitionProvider('luau', {
    async provideDefinition(model, position) {
      const locs = await lspCall('definition', model, position);
      const id = idOfModel(model);
      return (locs || []).filter((l) => l.id === id).map((l) => ({ uri: model.uri, range: new monaco.Range(l.line, l.col, l.endLine, l.endCol) }));
    },
  });

  monaco.languages.registerDocumentSymbolProvider('luau', {
    async provideDocumentSymbols(model) {
      if (lspState !== 'ready') return [];
      const id = idOfModel(model);
      let r;
      try { r = await bridge.invoke('lsp:symbols', id); } catch (_) { return []; }
      const conv = (s) => ({
        name: s.name, detail: s.detail || '', kind: Math.max(0, (s.kind || 13) - 1), tags: [],
        range: toRange(s.range || s.location.range), selectionRange: toRange(s.selectionRange || s.range || s.location.range),
        children: (s.children || []).map(conv),
      });
      return (r || []).map(conv);
    },
  });
}

async function gotoDefinition(ed) {
  if (lspState !== 'ready') { toast('Turn on the Luau language server in Settings for Go to Definition.', 'warn'); return; }
  const locs = await lspCall('definition', ed.getModel(), ed.getPosition());
  if (!locs || !locs.length) { toast('No definition found.'); return; }
  const l = locs[0];
  if (!l.id) { toast(`Defined in Roblox's built-in types (${l.path ? String(l.path).split(/[\\/]/).pop() : 'Luau'}).`); return; }
  openAt(l.id, l.line, l.col, l.endLine, l.endCol);
}

async function findReferences(ed) {
  if (lspState !== 'ready') { toast('Turn on the Luau language server in Settings to find references.', 'warn'); return; }
  const locs = await lspCall('references', ed.getModel(), ed.getPosition());
  if (!locs || !locs.length) { toast('No references found.'); return; }
  const items = [];
  for (const l of locs.filter((x) => x.id)) {
    const n = tree.nodes.get(l.id);
    const d = docs.get(l.id);
    let text = '';
    if (d) text = d.model.getLineContent(l.line).trim();
    items.push({ label: `${n ? n.name : l.path}:${l.line}`, detail: text || l.path, icon: n ? classIcon(n.cls) : '', loc: l });
  }
  openQuick({ placeholder: `${items.length} reference${items.length === 1 ? '' : 's'}`, items, onPick: (it) => openAt(it.loc.id, it.loc.line, it.loc.col, it.loc.endLine, it.loc.endCol) });
}

async function renameSymbol(ed) {
  if (lspState !== 'ready') { toast('Turn on the Luau language server in Settings to rename symbols.', 'warn'); return; }
  const model = ed.getModel();
  const pos = ed.getPosition();
  const word = model.getWordAtPosition(pos);
  if (!word) return;
  const newName = await askText(`Rename "${word.word}" in all scripts`, word.word, 'Press Enter to rename everywhere it is used');
  if (!newName || newName === word.word) return;
  if (!/^[A-Za-z_]\w*$/.test(newName)) { toast('That is not a valid Luau name.', 'error'); return; }
  const sources = await lspCall('rename', model, pos, { newName });
  const ids = Object.keys(sources || {});
  if (!ids.length) { toast('Nothing to rename here.'); return; }
  try {
    for (const id of ids) { const d = docs.get(id); if (d) applyRemoteSource(d, sources[id]); }
    await bridge.invoke('lsp:applyRename', sources);
    toast(`Renamed in ${ids.length} script${ids.length === 1 ? '' : 's'}.`);
  } catch (err) { toast(cleanErr(err), 'error'); }
}

/** Called for every editor (also the split one). */
function setupEditorFeatures(ed) {
  if (typeof setupInstanceLinks === 'function') setupInstanceLinks(ed);
  ed.addAction({ id: 'bx.definition', label: 'Go to Definition', keybindings: [monaco.KeyCode.F12], contextMenuGroupId: 'navigation', contextMenuOrder: 1, run: () => gotoDefinition(ed) });
  ed.addAction({ id: 'bx.references', label: 'Find All References', keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12], contextMenuGroupId: 'navigation', contextMenuOrder: 2, run: () => findReferences(ed) });
  ed.addAction({ id: 'bx.rename', label: 'Rename Symbol', keybindings: [monaco.KeyCode.F2], contextMenuGroupId: '1_modification', contextMenuOrder: 1, run: () => renameSymbol(ed) });
  ed.addAction({ id: 'bx.history', label: 'Show History of This Script', contextMenuGroupId: 'z_bloxcode', run: () => activeId && showHistoryFor(activeId) });
  ed.addAction({ id: 'bx.askClaude', label: 'Ask Claude About This Code', contextMenuGroupId: 'z_bloxcode', run: () => askClaudeAboutSelection(ed) });
}

function askClaudeAboutSelection(ed) {
  const sel = ed.getSelection();
  const text = sel && !sel.isEmpty() ? ed.getModel().getValueInRange(sel) : '';
  const n = activeId && tree.nodes.get(activeId);
  const where = n ? `${n.name} (line ${sel.startLineNumber}${sel.endLineNumber !== sel.startLineNumber ? `–${sel.endLineNumber}` : ''})` : 'this script';
  showView('claude');
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text ? `About this code in ${where}:\n\`\`\`lua\n${text.slice(0, 4000)}\n\`\`\`\n` : `About ${where}: `;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
