// Release notes, shown in "What's new" and on the website's changelog page.
'use strict';

const CHANGELOG = [
  {
    version: '2.0.0',
    date: '2026-11-18',
    title: 'Bloxcode 2.0',
    intro: 'The biggest update yet: themes, real Luau type checking, search across all scripts, play tests from Bloxcode, GitHub publishing and a much more capable Claude.',
    sections: [
      ['New', [
        '<b>Themes:</b> the new Bloxcode Night and Bloxcode Day, Dark+, Light+, Roblox Studio Dark, One Dark, Dracula, Monokai, GitHub Dark, Solarized Light and High Contrast, any accent color, and import of VS Code themes.',
        '<b>Settings page</b> (Ctrl+,) for fonts, font size, line height, ligatures, minimap, word wrap, cursor and more.',
        '<b>Luau language server</b> (luau-lsp): type errors while you type, hover info with Roblox API docs, smarter autocomplete, Go to Definition (F12), Find References (Shift+F12) and Rename Symbol (F2) across scripts.',
        '<b>Output panel</b> (Ctrl+J) with prints, warnings and errors from Studio and play tests. Click an error to jump to the line.',
        '<b>Problems panel</b> with every type error, and error counts in the Explorer and on tabs.',
        '<b>Search & Replace</b> in all scripts (Ctrl+Shift+F) with match case, whole word, regex and a path filter. Replace All is one undo step in Studio.',
        '<b>Command palette</b> (Ctrl+Shift+P) with every action.',
        '<b>Play tests from Bloxcode:</b> Play (F5), Run (F8) and Stop (Shift+F5) right in the title bar.',
        '<b>Test mode:</b> Play brings Studio to the front, and a small floating window shows Stop, errors and the Output while you play.',
        '<b>Script history:</b> earlier versions of every script, who changed them (you, Claude or Studio), a side-by-side diff and one-click restore.',
        '<b>Properties panel:</b> edit properties, attributes and tags of the selected object.',
        '<b>Split editor</b> (Ctrl+\\) to see two scripts side by side.',
        '<b>GitHub:</b> sign in, create a repository and publish your scripts with one click. The layout works with Rojo too.',
        '<b>Discord Rich Presence</b> (optional) is switched on with a small update right after 2.0.',
        '<b>Setup assistant</b> on first start, and this window after every update.',
      ]],
      ['Claude', [
        '34 tools instead of 17: Claude can now run play tests and read their output, run Luau in Studio or inside a running test, undo and redo, check type errors, build whole GUIs in one step, search and replace across scripts, read several scripts at once, see the code you selected, insert assets, restore earlier versions and publish to GitHub.',
        '<b>Review changes:</b> see every script change from Claude as a diff and accept or reject it.',
        'MCP resources and ready-made prompts (build a feature, fix errors, review code, secure remotes) for Claude Desktop and Claude Code.',
        'Better instructions, so Claude follows Roblox best practices and checks its own work.',
        '"Ask Claude about this code" in the editor\'s right-click menu.',
      ]],
      ['Fixed', [
        'Websites can no longer send commands to the local Bloxcode server.',
        'Claude\'s answers no longer get lost when Studio reloads the Explorer.',
        'If a script changes in Studio and Bloxcode at the same time, you now choose which version to keep in a side-by-side view.',
        'Big places load much faster and Studio stays responsive while they load, with a progress bar.',
      ]],
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-03',
    title: 'Chat with Claude in Bloxcode',
    sections: [['New', ['Chat with Claude right in the Claude panel, with your Claude plan (Claude Code) or an API key.', 'Bloxcode for Mac.']]],
  },
  {
    version: '1.2.0',
    date: '2026-11-01',
    title: 'Code with Claude',
    sections: [['New', ['Bloxcode is an MCP server: Claude Desktop and Claude Code can read and change your place.', 'Studio output (also from play tests) is forwarded to Bloxcode.']]],
  },
  {
    version: '1.1.0',
    date: '2026-11-01',
    title: 'Auto updates and Wally',
    sections: [['New', ['Bloxcode updates itself on startup, like Discord.', 'Install Wally packages (Cmdr, Knit, Promise, …) with one click.', 'Everything in English.']]],
  },
  {
    version: '1.0.0',
    date: '2026-11-01',
    title: 'First release',
    sections: [['New', ['Code Mode: scripts you open in Studio open in Bloxcode.', 'Live Explorer with two-way sync.', 'Luau editor based on Monaco.']]],
  },
];
