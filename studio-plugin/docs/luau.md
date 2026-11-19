---
sidebar_position: 4
title: Luau Type Checking
---

Bloxcode runs [luau-lsp](https://github.com/JohnnyMorganz/luau-lsp), the language server that the Luau VS Code extension uses. It knows the whole Roblox API and your place's Explorer, and checks scripts against each other.

![A type error in Bloxcode](/img/problems.png)

## What you get

- **Errors while you type:** red and yellow underlines, like *TypeError: Expected this to be 'number', but got 'string'*.
- **Problems panel** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>): every error and warning in all scripts. Click one to jump to it.
- **Error counts** next to scripts in the Explorer, red tabs, and ⊗ / ⚠ counts in the status bar.
- **Hover:** types and the Roblox API documentation for functions, properties and events.
- **Autocomplete** that understands types, `require`, services and your instance tree (`game.ReplicatedStorage.Remotes.…`).
- **Signature help** while you type function arguments.
- **Go to Definition** (<kbd>F12</kbd>), also into other scripts.
- **Find All References** (<kbd>Shift</kbd> + <kbd>F12</kbd>).
- **Rename Symbol** (<kbd>F2</kbd>) across all scripts, as one undo step in Studio.
- **Go to Symbol** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>) inside a script.

## Selene linter

Next to the type errors, [Selene](https://kampfkarren.github.io/selene/) warns about common mistakes, like shadowed variables, comparisons that are always true, deprecated Roblox APIs and code that never runs. Its warnings appear in the Problems panel with *(selene: …)* at the end. Turn it off under **Settings → Luau → Selene linter**.

## Turning it on

It is on by default. The first time, Bloxcode downloads luau-lsp (about 10 MB) and the Roblox type definitions, and then works offline. The status bar shows **✓ Luau** when it runs. Turn it off or restart it under **Settings → Luau**.

## How it works

Bloxcode keeps a copy of every script in a small folder on your computer, together with a Rojo-style `sourcemap.json` that describes your Explorer. luau-lsp checks that copy, so it sees the same scripts and instances as Studio. Scripts use Luau's *nonstrict* mode unless they start with `--!strict`.

Claude uses the same checker: the `get_diagnostics` tool lets it find type errors without running the game.

## Troubleshooting

- **"⚠ Luau" in the status bar:** click it to restart the language server. If the download failed, check your internet connection once.
- **An instance is reported as missing:** the Explorer may still be loading. Wait for the progress bar above the Explorer to finish.
