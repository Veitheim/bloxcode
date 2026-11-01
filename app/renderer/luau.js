// Luau language support for Monaco: tokenizer, editor config, theme and completions.
/* global monaco */

window.setupLuau = function setupLuau(getTreeContext) {
  const KEYWORDS = ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
    'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while', 'continue', 'export', 'type', 'typeof'];
  const GLOBALS = ['game', 'workspace', 'script', 'plugin', 'shared', '_G', 'Enum', 'Instance', 'Vector3', 'Vector2',
    'CFrame', 'Color3', 'UDim', 'UDim2', 'BrickColor', 'TweenInfo', 'Ray', 'Region3', 'NumberRange', 'NumberSequence',
    'NumberSequenceKeypoint', 'ColorSequence', 'ColorSequenceKeypoint', 'Rect', 'RaycastParams', 'OverlapParams',
    'PhysicalProperties', 'Random', 'DateTime', 'Font', 'Axes', 'Faces', 'Path2DControlPoint', 'SharedTable',
    'task', 'math', 'string', 'table', 'coroutine', 'os', 'debug', 'utf8', 'bit32', 'buffer', 'vector'];
  const BUILTINS = ['print', 'warn', 'error', 'assert', 'require', 'pairs', 'ipairs', 'next', 'select', 'tostring',
    'tonumber', 'type', 'typeof', 'pcall', 'xpcall', 'rawget', 'rawset', 'rawequal', 'rawlen', 'setmetatable',
    'getmetatable', 'unpack', 'tick', 'time', 'wait', 'delay', 'spawn', 'elapsedTime', 'gcinfo', 'newproxy'];
  const TYPES = ['number', 'string', 'boolean', 'any', 'never', 'unknown', 'thread', 'userdata', 'buffer'];

  const SERVICES = ['Players', 'Workspace', 'ReplicatedStorage', 'ReplicatedFirst', 'ServerScriptService',
    'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Lighting', 'SoundService', 'Teams',
    'TextChatService', 'RunService', 'UserInputService', 'ContextActionService', 'TweenService', 'HttpService',
    'DataStoreService', 'MemoryStoreService', 'MessagingService', 'MarketplaceService', 'BadgeService',
    'CollectionService', 'Debris', 'PathfindingService', 'PhysicsService', 'TeleportService', 'GuiService',
    'HapticService', 'LocalizationService', 'GroupService', 'PolicyService', 'ProximityPromptService',
    'SocialService', 'AvatarEditorService', 'ContentProvider', 'Chat', 'TextService', 'InsertService',
    'AssetService', 'MaterialService', 'VRService', 'StarterPlayerScripts', 'ScriptEditorService', 'Selection',
    'ChangeHistoryService', 'AnalyticsService', 'ExperienceNotificationService'];
  const CLASSES = ['Part', 'MeshPart', 'WedgePart', 'TrussPart', 'UnionOperation', 'Model', 'Folder', 'Script',
    'LocalScript', 'ModuleScript', 'RemoteEvent', 'RemoteFunction', 'UnreliableRemoteEvent', 'BindableEvent',
    'BindableFunction', 'StringValue', 'NumberValue', 'IntValue', 'BoolValue', 'ObjectValue', 'CFrameValue',
    'Vector3Value', 'Color3Value', 'Configuration', 'Attachment', 'WeldConstraint', 'Weld', 'Motor6D',
    'HingeConstraint', 'RopeConstraint', 'SpringConstraint', 'AlignPosition', 'AlignOrientation',
    'LinearVelocity', 'AngularVelocity', 'VectorForce', 'Humanoid', 'Animation', 'Animator', 'Sound',
    'ParticleEmitter', 'Beam', 'Trail', 'PointLight', 'SpotLight', 'SurfaceLight', 'Fire', 'Smoke', 'Sparkles',
    'Highlight', 'SelectionBox', 'ClickDetector', 'ProximityPrompt', 'Decal', 'Texture', 'SpecialMesh',
    'ScreenGui', 'SurfaceGui', 'BillboardGui', 'Frame', 'ScrollingFrame', 'TextLabel', 'TextButton', 'TextBox',
    'ImageLabel', 'ImageButton', 'ViewportFrame', 'CanvasGroup', 'UICorner', 'UIStroke', 'UIGradient',
    'UIListLayout', 'UIGridLayout', 'UIPadding', 'UIScale', 'UIAspectRatioConstraint', 'UISizeConstraint',
    'Tool', 'Camera', 'Team', 'SpawnLocation', 'Seat', 'VehicleSeat'];

  const LIBS = {
    task: ['wait', 'spawn', 'defer', 'delay', 'cancel', 'synchronize', 'desynchronize'],
    math: ['abs', 'ceil', 'floor', 'round', 'clamp', 'max', 'min', 'sqrt', 'pow', 'random', 'randomseed', 'sin',
      'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'rad', 'deg', 'log', 'log10', 'exp', 'fmod', 'modf', 'sign',
      'noise', 'lerp', 'map', 'huge', 'pi'],
    string: ['format', 'sub', 'gsub', 'find', 'match', 'gmatch', 'len', 'lower', 'upper', 'rep', 'reverse',
      'split', 'byte', 'char', 'pack', 'unpack'],
    table: ['insert', 'remove', 'find', 'sort', 'concat', 'clear', 'clone', 'freeze', 'isfrozen', 'create',
      'unpack', 'pack', 'move', 'maxn'],
    coroutine: ['create', 'resume', 'yield', 'wrap', 'status', 'running', 'isyieldable', 'close'],
    os: ['time', 'clock', 'date', 'difftime'],
    debug: ['traceback', 'info', 'profilebegin', 'profileend', 'setmemorycategory', 'resetmemorycategory'],
    utf8: ['char', 'charpattern', 'codes', 'codepoint', 'len', 'offset'],
    bit32: ['band', 'bor', 'bxor', 'bnot', 'lshift', 'rshift', 'arshift', 'extract', 'replace', 'btest'],
    buffer: ['create', 'fromstring', 'tostring', 'len', 'readu8', 'writeu8', 'readi32', 'writei32', 'readf32',
      'writef32', 'readf64', 'writef64', 'readstring', 'writestring', 'copy', 'fill'],
    Instance: ['new', 'fromExisting'],
    Vector3: ['new', 'zero', 'one', 'xAxis', 'yAxis', 'zAxis', 'FromNormalId', 'FromAxis'],
    Vector2: ['new', 'zero', 'one', 'xAxis', 'yAxis'],
    CFrame: ['new', 'lookAt', 'Angles', 'fromEulerAnglesXYZ', 'fromEulerAnglesYXZ', 'fromOrientation',
      'fromAxisAngle', 'fromMatrix', 'identity'],
    Color3: ['new', 'fromRGB', 'fromHSV', 'fromHex', 'toHSV'],
    UDim2: ['new', 'fromScale', 'fromOffset'],
    UDim: ['new'],
    TweenInfo: ['new'],
    BrickColor: ['new', 'random', 'Red', 'White', 'Black', 'Gray'],
    Random: ['new'],
    DateTime: ['now', 'fromUnixTimestamp', 'fromUnixTimestampMillis', 'fromIsoDate', 'fromLocalTime', 'fromUniversalTime'],
    RaycastParams: ['new'],
    OverlapParams: ['new'],
  };
  const INSTANCE_METHODS = ['FindFirstChild', 'WaitForChild', 'GetChildren', 'GetDescendants', 'FindFirstChildOfClass',
    'FindFirstChildWhichIsA', 'FindFirstAncestor', 'FindFirstAncestorOfClass', 'FindFirstAncestorWhichIsA',
    'FindFirstDescendant', 'IsA', 'IsDescendantOf', 'IsAncestorOf', 'Clone', 'Destroy', 'ClearAllChildren',
    'GetAttribute', 'SetAttribute', 'GetAttributes', 'GetAttributeChangedSignal', 'GetPropertyChangedSignal',
    'GetFullName', 'GetService', 'Connect', 'Once', 'Wait', 'Disconnect', 'Fire', 'Invoke', 'FireServer',
    'FireClient', 'FireAllClients', 'InvokeServer', 'InvokeClient', 'Play', 'Stop', 'Pause', 'Create',
    'MoveTo', 'PivotTo', 'GetPivot', 'Raycast', 'GetPlayers', 'GetPlayerFromCharacter', 'Kick', 'LoadAnimation',
    'TakeDamage', 'GetAsync', 'SetAsync', 'UpdateAsync', 'RemoveAsync', 'GetDataStore', 'JSONEncode',
    'JSONDecode', 'GenerateGUID', 'AddTag', 'RemoveTag', 'HasTag', 'GetTagged', 'GetInstanceAddedSignal',
    'IsServer', 'IsClient', 'IsStudio', 'BindToRenderStep', 'UnbindFromRenderStep'];
  const EVENTS = ['Touched', 'TouchEnded', 'Changed', 'ChildAdded', 'ChildRemoved', 'DescendantAdded',
    'DescendantRemoving', 'AncestryChanged', 'Destroying', 'OnServerEvent', 'OnClientEvent', 'OnServerInvoke',
    'OnClientInvoke', 'Event', 'OnInvoke', 'PlayerAdded', 'PlayerRemoving', 'CharacterAdded', 'CharacterRemoving',
    'Heartbeat', 'RenderStepped', 'Stepped', 'PreSimulation', 'PostSimulation', 'InputBegan', 'InputEnded',
    'InputChanged', 'MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up', 'Activated', 'MouseEnter',
    'MouseLeave', 'FocusLost', 'Triggered', 'MouseClick', 'Died', 'HealthChanged', 'Completed', 'Ended'];

  monaco.languages.register({ id: 'luau', extensions: ['.luau', '.lua'], aliases: ['Luau', 'luau'] });

  monaco.languages.setLanguageConfiguration('luau', {
    comments: { lineComment: '--', blockComment: ['--[[', ']]'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] }, { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
      { open: '"', close: '"' }, { open: "'", close: "'" }, { open: '`', close: '`' },
    ],
    indentationRules: {
      increaseIndentPattern: /^((?!(\-\-)).)*((\b(else|function|then|do|repeat)\b((?!\b(end|until)\b).)*)|(\{\s*))$/,
      decreaseIndentPattern: /^\s*((\b(elseif|else|end|until)\b)|(\})|(\)))/,
    },
    folding: { markers: { start: /^\s*--\s*#?region\b/, end: /^\s*--\s*#?endregion\b/ } },
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
  });

  monaco.languages.setMonarchTokensProvider('luau', {
    defaultToken: '',
    keywords: KEYWORDS.filter((k) => !['true', 'false', 'nil'].includes(k)),
    constants: ['true', 'false', 'nil'],
    globals: GLOBALS,
    builtins: BUILTINS,
    types: TYPES,
    brackets: [
      { token: 'delimiter.bracket', open: '{', close: '}' },
      { token: 'delimiter.array', open: '[', close: ']' },
      { token: 'delimiter.parenthesis', open: '(', close: ')' },
    ],
    operators: ['+', '-', '*', '/', '//', '%', '^', '#', '==', '~=', '<=', '>=', '<', '>', '=', '+=', '-=', '*=',
      '/=', '//=', '%=', '^=', '..=', '..', '...', '->', '::'],
    symbols: /[=><!~?:&|+\-*\/\^%\.#]+/,
    escapes: /\\(?:[abfnrtvz\\"'`{}\n]|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]+\}|\d{1,3})/,
    tokenizer: {
      root: [
        [/(function)(\s+)([a-zA-Z_][\w.:]*)/, ['keyword', '', 'function.decl']],
        [/[a-zA-Z_]\w*(?=\s*[\(\{"'`])/, {
          cases: { '@keywords': 'keyword', '@builtins': 'builtin', '@globals': 'global', '@default': 'function' },
        }],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword', '@constants': 'constant', '@builtins': 'builtin',
            '@globals': 'global', '@types': 'type', '@default': 'identifier',
          },
        }],
        { include: '@whitespace' },
        [/[{}()\[\]]/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
        [/0[bB][01_]+/, 'number.binary'],
        [/\d[\d_]*([eE][\-+]?\d+)?/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/\[(=*)\[/, { token: 'string', next: '@longstring.$1' }],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string."'],
        [/'/, 'string', "@string.'"],
        [/`/, 'string', '@interp'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/--\[(=*)\[/, { token: 'comment', next: '@longcomment.$1' }],
        [/--.*$/, 'comment'],
      ],
      longcomment: [
        [/[^\]]+/, 'comment'],
        [/\](=*)\]/, { cases: { '$1==$S2': { token: 'comment', next: '@pop' }, '@default': 'comment' } }],
        [/./, 'comment'],
      ],
      longstring: [
        [/[^\]]+/, 'string'],
        [/\](=*)\]/, { cases: { '$1==$S2': { token: 'string', next: '@pop' }, '@default': 'string' } }],
        [/./, 'string'],
      ],
      string: [
        [/[^\\"']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/["']/, { cases: { '$#==$S2': { token: 'string', next: '@pop' }, '@default': 'string' } }],
      ],
      interp: [
        [/[^\\`{]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\{/, { token: 'delimiter.interp', next: '@interpexpr' }],
        [/`/, 'string', '@pop'],
      ],
      interpexpr: [
        [/\}/, { token: 'delimiter.interp', next: '@pop' }],
        { include: 'root' },
      ],
    },
  });

  monaco.editor.defineTheme('bloxcode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'constant', foreground: '569CD6' },
      { token: 'builtin', foreground: 'DCDCAA' },
      { token: 'global', foreground: '4EC9B0' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'function.decl', foreground: 'DCDCAA' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' },
      { token: 'delimiter.interp', foreground: '569CD6' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'operator', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#cccccc',
      'editorIndentGuide.background1': '#404040',
      'editorWidget.background': '#202020',
      'editorSuggestWidget.background': '#202020',
      'editorSuggestWidget.selectedBackground': '#04395e',
    },
  });

  // ---------- completions ----------
  const K = monaco.languages.CompletionItemKind;
  const S = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  const SNIPPETS = [
    ['local function', 'local function ${1:name}(${2})\n\t$0\nend', 'Local function'],
    ['function', 'function ${1:name}(${2})\n\t$0\nend', 'Function'],
    ['if', 'if ${1:condition} then\n\t$0\nend', 'if … then … end'],
    ['ifelse', 'if ${1:condition} then\n\t$2\nelse\n\t$0\nend', 'if … else … end'],
    ['for', 'for ${1:i} = ${2:1}, ${3:10} do\n\t$0\nend', 'Numeric for loop'],
    ['forin', 'for ${1:_}, ${2:value} in ${3:list} do\n\t$0\nend', 'for … in'],
    ['forpairs', 'for ${1:key}, ${2:value} in pairs(${3:t}) do\n\t$0\nend', 'for … in pairs'],
    ['foripairs', 'for ${1:i}, ${2:value} in ipairs(${3:t}) do\n\t$0\nend', 'for … in ipairs'],
    ['while', 'while ${1:true} do\n\t$0\nend', 'while loop'],
    ['repeat', 'repeat\n\t$0\nuntil ${1:condition}', 'repeat … until'],
    ['service', 'local ${1:Players} = game:GetService("${1:Players}")', 'game:GetService'],
    ['module', 'local ${1:Module} = {}\n\n$0\n\nreturn ${1:Module}', 'ModuleScript template'],
    ['connect', '${1:event}:Connect(function(${2})\n\t$0\nend)', ':Connect(function … end)'],
    ['playeradded', 'game:GetService("Players").PlayerAdded:Connect(function(player)\n\t$0\nend)', 'PlayerAdded'],
    ['remote', 'local ${1:remote} = game:GetService("ReplicatedStorage"):WaitForChild("${2:RemoteEvent}")', 'Get a RemoteEvent'],
    ['onserver', '${1:remote}.OnServerEvent:Connect(function(player, ${2:...})\n\t$0\nend)', 'OnServerEvent'],
    ['onclient', '${1:remote}.OnClientEvent:Connect(function(${2:...})\n\t$0\nend)', 'OnClientEvent'],
    ['pcall', 'local ${1:ok}, ${2:result} = pcall(function()\n\t$0\nend)', 'pcall'],
    ['spawn', 'task.spawn(function()\n\t$0\nend)', 'task.spawn'],
    ['tween', 'local ${1:tween} = game:GetService("TweenService"):Create(${2:instance}, TweenInfo.new(${3:1}), { ${4:Transparency = 1} })\n${1:tween}:Play()', 'Tween'],
  ];

  function item(label, kind, range, extra) {
    return Object.assign({ label, kind, insertText: label, range }, extra || {});
  }

  // Resolve `game.ReplicatedStorage.Folder` style chains against the explorer tree.
  function resolveChain(chain) {
    const ctx = getTreeContext();
    if (!ctx) return null;
    const parts = chain.split('.');
    let node = null;
    const first = parts.shift();
    if (first === 'game') node = { children: ctx.roots() };
    else if (first === 'workspace') node = ctx.serviceByName('Workspace');
    else if (first === 'script') node = ctx.currentNode();
    else return null;
    for (const p of parts) {
      if (!node) return null;
      if (p === 'Parent' && node.parent !== undefined) { node = ctx.get(node.parent); continue; }
      node = ctx.childByName(node, p);
    }
    return node;
  }

  monaco.languages.registerCompletionItemProvider('luau', {
    triggerCharacters: ['.', ':', '"', "'"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn));
      const suggestions = [];

      // GetService("…")
      if (/GetService\(\s*["']$/.test(before)) {
        SERVICES.forEach((s) => suggestions.push(item(s, K.Module, range)));
        return { suggestions };
      }
      // Instance.new("…")
      if (/Instance\.new\(\s*["']$/.test(before)) {
        CLASSES.forEach((c) => suggestions.push(item(c, K.Class, range)));
        return { suggestions };
      }
      // WaitForChild("…") / FindFirstChild("…") – suggest children from the tree
      const childCall = before.match(/([\w.]+)(?::(?:WaitForChild|FindFirstChild)\(\s*["'])$/);
      if (childCall) {
        const n = resolveChain(childCall[1].replace(/:GetService\(["'](\w+)["']\)/g, '.$1'));
        if (n && n.children) getTreeContext().childrenOf(n).forEach((c) => suggestions.push(item(c.name, K.Field, range, { detail: c.cls })));
        return { suggestions };
      }

      const dot = before.match(/([\w.]+)\.$/);
      if (dot) {
        const chain = dot[1];
        if (LIBS[chain]) {
          LIBS[chain].forEach((m) => suggestions.push(item(m, K.Function, range, { detail: `${chain}.${m}` })));
          return { suggestions };
        }
        const n = resolveChain(chain);
        if (n) {
          getTreeContext().childrenOf(n).forEach((c) => suggestions.push(item(c.name, K.Field, range, {
            detail: c.cls,
            insertText: /^[A-Za-z_]\w*$/.test(c.name) ? c.name : c.name,
          })));
          ['Parent', 'Name', 'ClassName'].forEach((p) => suggestions.push(item(p, K.Property, range)));
        }
        EVENTS.forEach((e) => suggestions.push(item(e, K.Event, range, { sortText: 'z' + e })));
        return { suggestions };
      }
      if (/:$/.test(before)) {
        INSTANCE_METHODS.forEach((m) => suggestions.push(item(m, K.Method, range)));
        return { suggestions };
      }

      KEYWORDS.forEach((k) => suggestions.push(item(k, K.Keyword, range)));
      GLOBALS.forEach((g) => suggestions.push(item(g, K.Module, range)));
      BUILTINS.forEach((b) => suggestions.push(item(b, K.Function, range)));
      SNIPPETS.forEach(([label, body, doc]) => suggestions.push(item(label, K.Snippet, range, {
        insertText: body, insertTextRules: S, documentation: doc, detail: 'Snippet',
      })));
      // local identifiers from the document
      const seen = new Set();
      for (const m of model.getValue().matchAll(/\blocal\s+(?:function\s+)?([A-Za-z_]\w*)/g)) {
        if (!seen.has(m[1])) { seen.add(m[1]); suggestions.push(item(m[1], K.Variable, range)); }
      }
      return { suggestions };
    },
  });
};
