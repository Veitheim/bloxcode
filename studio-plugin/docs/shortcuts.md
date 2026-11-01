---
sidebar_position: 4
title: Keyboard Shortcuts
---

## General

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | Find and open a script |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Send the current script to Studio now |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close tab |
| <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Next tab (with <kbd>Shift</kbd>: previous) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> | Focus the Explorer |
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
| <kbd>F1</kbd> | Command palette |
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
