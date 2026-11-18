---
sidebar_position: 12
title: Changelog
---

## 2.0.0 · November 18, 2026

The biggest update yet: themes, real Luau type checking, search across all scripts, play tests from Bloxcode, GitHub publishing and a much more capable Claude. 2.0 is out for Windows first; the Mac version follows.

### New

- **Themes:** the new Bloxcode Night and Bloxcode Day, Dark+, Light+, Roblox Studio Dark, One Dark, Dracula, Monokai, GitHub Dark, Solarized Light and High Contrast, any accent color, and import of VS Code themes. [More](./editor)
- **Settings page** (<kbd>Ctrl</kbd> + <kbd>,</kbd>) for fonts, font size, line height, ligatures, minimap, word wrap, cursor and more.
- **Luau language server:** type errors while you type, hover docs, smarter autocomplete, Go to Definition, Find References and Rename Symbol across scripts. [More](./luau)
- **Output panel** with prints, warnings and errors from Studio and play tests; click an error to jump to it. [More](./testing)
- **Problems panel** and error counts in the Explorer and on tabs.
- **Search & Replace in all scripts** with match case, whole word, regex and a path filter. [More](./search-history)
- **Command palette** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>).
- **Play tests from Bloxcode:** Play, Run and Stop in the title bar.
- **Test mode:** Studio comes to the front and a floating window shows Stop, errors and the Output. [More](./testing#test-mode)
- **Script history** with diff and restore.
- **Properties panel** for properties, attributes and tags.
- **Split editor.**
- **GitHub:** create a repository and publish with one click. [More](./github)
- **Discord Rich Presence** (switched on with a small update right after 2.0).
- **Setup assistant** and **What's new** after updates.

### Claude

- 34 tools instead of 17: play tests with output, running Luau in Studio or inside a running test, undo and redo, type errors, whole GUIs in one step, search and replace across scripts, reading several scripts at once, your selection in the editor, inserting assets, restoring versions and publishing to GitHub. [More](./claude)
- **Review changes:** see Claude's script changes as a diff and accept or reject them.
- MCP resources and prompts for Claude Desktop and Claude Code.
- Better instructions and a new starter prompt.

### Fixed

- Websites can no longer send commands to the local Bloxcode server.
- Claude's answers no longer get lost when Studio reloads the Explorer.
- When a script changes in Studio and in Bloxcode at the same time, you choose the version in a side-by-side view.
- Big places load much faster, with a progress bar, and Studio stays responsive.

## 1.3.0 · November 3, 2026

- Chat with Claude right in the Claude panel, with your Claude plan (Claude Code) or an API key.
- Bloxcode for Mac.

## 1.2.0 · November 1, 2026

- Bloxcode is an MCP server: Claude Desktop and Claude Code can read and change your place.
- Studio output (also from play tests) is forwarded to Bloxcode.

## 1.1.0 · November 1, 2026

- Bloxcode updates itself on startup, like Discord.
- Install Wally packages with one click.
- Everything in English.

## 1.0.0 · November 1, 2026

- Code Mode: scripts you open in Studio open in Bloxcode.
- Live Explorer with two-way sync.
- Luau editor based on Monaco.
