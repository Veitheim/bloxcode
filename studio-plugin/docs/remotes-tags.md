---
sidebar_position: 6.5
title: Remote Map, Tags & Templates
---

## Remote map

The **lightning icon** on the left shows every RemoteEvent, RemoteFunction, UnreliableRemoteEvent and BindableEvent in your place, and which scripts use them:

- **Fired by:** the scripts that call `FireServer`, `FireClient`, `FireAllClients`, `InvokeServer` or `InvokeClient`.
- **Listened to by:** the scripts that connect `OnServerEvent`, `OnClientEvent` or set `OnServerInvoke` / `OnClientInvoke`.
- Each line shows whether the script runs on the **server** or the **client**. Click it to open the script at that line.

It also warns about common mistakes:

| Warning | What it means |
| --- | --- |
| The server uses what the client sends without checking it | An `OnServerEvent` / `OnServerInvoke` handler takes arguments from the client but never checks their type or range. Exploiters can send anything, like a price of `-1000`. |
| Scripts fire it, but nothing listens | Probably a typo in the name or a missing handler. |
| InvokeServer is called, but no OnServerInvoke is set | The client waits forever. |
| … only works on the server / client | For example `FireServer` in a server Script. |
| InvokeClient | The server waits for a client, which can hang if the player leaves. |

**Only show problems** hides the remotes without warnings. The map reads your code, so it finds remotes used as `Remotes.Buy`, `Remotes:WaitForChild("Buy")` and through local variables like `local buy = Remotes.Buy`. Code that builds names at runtime can't be followed.

Claude uses the same map (`get_remote_map`), so you can ask *"Check my remotes for security problems and fix them."*

## Tags & attributes

The **tag icon** lists every [CollectionService](https://create.roblox.com/docs/reference/engine/classes/CollectionService) tag and every attribute name in your place, with the objects that use them. Click an object to select it, or **Select all** to select every object with that tag in Studio, for example to move or recolor them together. Attribute values are shown next to each object.

Add and remove tags and attributes in the [Properties panel](./search-history#properties-panel).

:::info After updating from 2.0
This view needs the 2.1 plugin. Restart Roblox Studio once after updating.
:::

## Templates

The **grid icon** in the Explorer header (or *Insert: Template…* in the command palette) opens ready-made building blocks:

| Template | What you get |
| --- | --- |
| Leaderstats & saving | Coins and Level in the leaderboard, saved with DataStoreService (retries, autosave, saving on shutdown) |
| Collectible coins | Spinning coins tagged `Coin` that give coins and come back |
| Shop GUI | A shop window; the server checks every purchase |
| Obby checkpoints | Checkpoints tagged `Checkpoint` with a Stage attribute and respawning |
| Kill bricks & damage parts | Parts tagged `Damage` that hurt players |
| Round system | Intermission, timed rounds, teleporting and a status GUI |
| Day & night cycle | A moving sun with adjustable day length |
| Sprint with Shift | Sprinting with stamina and a field-of-view effect, also on mobile |
| Door with prompt | A sliding door with a ProximityPrompt |
| Admin commands (Cmdr) | Installs Cmdr and sets it up (F2 in game) |

Each template is one undo step in Studio and never replaces anything: if a name is taken, Bloxcode adds a number. All scripts pass the Luau type checker and Selene. Claude can insert them too (`insert_template`) and adapt them to your game.
