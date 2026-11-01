---
sidebar_position: 2
title: Explorer & Sync
---

The Explorer in Bloxcode is a live mirror of your place. What you change here happens in Studio, and the other way around.

![Context menu in the Explorer](/img/explorer.png)

## What you see

| Service | Typical contents |
| --- | --- |
| `Workspace` | Parts, models, the map |
| `ReplicatedFirst` | Loading screen scripts |
| `ReplicatedStorage` | ModuleScripts and RemoteEvents shared by server and client |
| `ServerScriptService` | Server scripts |
| `ServerStorage` | Objects only the server can see |
| `StarterGui` | ScreenGuis and their LocalScripts |
| `StarterPlayer` | `StarterPlayerScripts`, `StarterCharacterScripts` |
| `Players`, `Lighting`, `Teams`, `SoundService`, … | Everything else |

## Creating objects

Right-click a folder or service:

- **New Script / LocalScript / ModuleScript.** It's created and opened in a tab right away.
- **New Folder / RemoteEvent / RemoteFunction**
- **Insert Object…** opens a search with the most common classes. You can also type **any** Roblox class name, like `UnreliableRemoteEvent` or `ProximityPrompt`.

## Editing

| Action | How |
| --- | --- |
| Rename | <kbd>F2</kbd> or right-click → Rename |
| Move | Drag & drop onto the new parent |
| Duplicate | Right-click → Duplicate |
| Delete | <kbd>Del</kbd> or right-click → Delete |
| Select in Studio | Right-click → Select in Studio |
| Copy a path for your code | Right-click → Copy Lua Path, for example `game:GetService("ReplicatedStorage").Remotes.BuyItem` |

:::tip Everything can be undone
Every action from Bloxcode is its own undo step in Studio. Deleted a script by accident? Press <kbd>Ctrl</kbd> + <kbd>Z</kbd> **in Studio**.
:::

## How sync works

| Direction | What is sent |
| --- | --- |
| Studio → Bloxcode | The whole Explorer when connecting, then every change (added, renamed, moved, deleted) |
| Studio → Bloxcode | Script source when it's opened and when it changes in Studio |
| Bloxcode → Studio | Script source while you type (Auto Sync) or with Ctrl+S |
| Bloxcode → Studio | Commands: create, rename, move, duplicate, delete, install packages |

- **Auto Sync** (default): changes go to Studio about 0.3 seconds after you stop typing. Turn it off in the bottom-right of the status bar. Then <kbd>Ctrl</kbd> + <kbd>S</kbd> sends.
- A **dot on a tab** means the changes haven't been sent to Studio yet.
- If an open script changes in Studio (for example by another plugin), the tab updates automatically.
- If the connection drops for a moment, Bloxcode sends everything once Studio is back.
