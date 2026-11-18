---
sidebar_position: 10
title: Keyboard Shortcuts
---

:::tip On Mac
Use <kbd>⌘</kbd> wherever this page says <kbd>Ctrl</kbd>. The one exception is <kbd>Ctrl</kbd> + <kbd>Tab</kbd> for the next tab, because <kbd>⌘</kbd> + <kbd>Tab</kbd> switches apps.
:::

## General

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | Find and open a script |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Send the current script to Studio now |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close tab |
| <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Next tab (with <kbd>Shift</kbd>: previous) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> | Focus the Explorer |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Command palette |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Search in all scripts |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | Replace in all scripts |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> | Settings |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Show / hide the Output panel |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> | Problems |
| <kbd>Ctrl</kbd> + <kbd>&#92;</kbd> | Split editor |
| <kbd>F5</kbd> / <kbd>F8</kbd> / <kbd>Shift</kbd> + <kbd>F5</kbd> | Play test / Run / Stop |
| Middle-click a tab | Close tab |

## Explorer

| Shortcut | Action |
| --- | --- |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move the selection |
| <kbd>→</kbd> / <kbd>←</kbd> | Expand / collapse |
| <kbd>Enter</kbd> | Open script |
| <kbd>F2</kbd> | Rename |
| <kbd>Del</kbd> | Delete |

## Editor

The editor is [Monaco](https://microsoft.github.io/monaco-editor/), the same one VS Code uses. The usual shortcuts work:

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> | Find / replace |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Add the next match to the selection |
| <kbd>Alt</kbd> + click | Add another cursor |
| <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Move line |
| <kbd>Ctrl</kbd> + <kbd>/</kbd> | Toggle comment |
| <kbd>Ctrl</kbd> + <kbd>Space</kbd> | Show suggestions |
| <kbd>F12</kbd> | Go to Definition |
| <kbd>Shift</kbd> + <kbd>F12</kbd> | Find All References |
| <kbd>F2</kbd> | Rename Symbol in all scripts |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd> | Go to symbol in this script |
| <kbd>F1</kbd> | Editor commands |
| <kbd>Ctrl</kbd> + mouse wheel | Zoom |

## Snippets

Type the prefix and press <kbd>Tab</kbd> or <kbd>Enter</kbd>:

| Snippet | Result |
| --- | --- |
| `service` | `local Players = game:GetService("Players")` |
| `module` | ModuleScript template |
| `playeradded` | `Players.PlayerAdded:Connect(function(player) … end)` |
| `remote` | Get a RemoteEvent from ReplicatedStorage |
| `onserver` / `onclient` | Connect `OnServerEvent` / `OnClientEvent` |
| `forpairs` / `foripairs` | Loop over a table |
| `tween` | Create and play a TweenService tween |
| `pcall` | Protected call with `ok, result` |
