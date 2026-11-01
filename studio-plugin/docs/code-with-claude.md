---
sidebar_position: 4
title: Code with Claude
slug: /claude
---

Bloxcode can connect [Claude](https://claude.ai) to your open Roblox Studio place. You describe what you want in a chat, and Claude builds it right inside your game. It reads your Explorer and scripts, writes code, creates RemoteEvents, GUIs and parts, installs Wally packages and reads the Output after you play-test.

You watch every change live in Bloxcode. Each change is one undo step in Studio, so **Ctrl+Z** takes it back.

:::info What you need
- Bloxcode **1.2.0** or newer
- Roblox Studio with the Bloxcode plugin and **Code Mode** on
- [Claude Desktop](https://claude.ai/download) or [Claude Code](https://claude.com/claude-code)
:::

## 1. Connect Claude

1. In Bloxcode, click the **sparkle icon** in the bar on the left to open the **Claude** panel.
2. Click **Connect Claude**.
3. **Restart Claude** (quit it fully, also from the system tray, then open it again).

Bloxcode adds itself as an MCP server called `bloxcode` to Claude Desktop and Claude Code on this PC. MCP is the standard way Claude uses tools in other apps. The panel shows a green dot once it is set up.

In Claude Desktop you can check it under **Settings → Developer**: `bloxcode` should be listed as running. In Claude Code, run `/mcp`.

## 2. Start a chat

Keep Roblox Studio (with Code Mode on) and Bloxcode open. Start a **new chat** with Claude and paste the starter prompt. Bloxcode has a **Copy prompt** button for it in the Claude panel, and here it is:

```text
You are my Roblox developer. You are connected to my open Roblox Studio place through Bloxcode (the "bloxcode" MCP tools).

How to work:
1. Call get_status. If Studio is not connected, tell me what to do.
2. Call get_explorer to learn how my game is organized, and read the scripts that matter before you change anything.
3. Make changes directly with the Bloxcode tools (create_instance, write_script, edit_script, set_properties, install_package). Don't paste code into the chat for me to copy.
4. Server code goes in ServerScriptService, client code in StarterPlayerScripts or StarterGui, shared modules and RemoteEvents in ReplicatedStorage. Never trust the client.
5. Write clean, modern Luau (task library, GetService, types where useful) and follow the style already in my game.
6. When something needs testing, tell me to press Play, then read the errors with get_output and fix them.
7. Ask before deleting or rewriting big parts of the game. At the end, give me a short summary of what you changed.

My first task: 
```

Add your task at the end, for example:

- *Add a coin system: coins spawn on the map, players collect them, and the count shows in the leaderboard and in a GUI.*
- *Make a shop GUI with three items that costs coins. Check purchases on the server.*
- *Install Cmdr and add an admin command that gives coins.*
- *I get an error when I press Play. Find it and fix it.*

## 3. Test together

Claude can't press Play. When it asks you to test:

1. Press **Play** in Studio and try the feature.
2. Stop the test and tell Claude *"tested"* (or what went wrong).
3. Claude reads the errors and warnings from the play test with `get_output` and fixes them.

## What Claude can do

| Tool | What it does |
| --- | --- |
| `get_status` | Checks that Studio is connected |
| `get_explorer` | Shows the Explorer tree with class names |
| `read_script` | Reads a script with line numbers |
| `write_script` | Replaces a whole script |
| `edit_script` | Changes one exact piece of a script |
| `create_instance` | Creates Scripts, ModuleScripts, RemoteEvents, Folders, Parts, GUIs, … (scripts with code right away) |
| `rename_instance` · `move_instance` · `delete_instance` | Renames, moves or deletes objects |
| `get_properties` · `set_properties` | Reads and changes properties, attributes and tags (Size, Color, Text, …) |
| `search_scripts` | Searches all scripts for some text |
| `get_output` | Reads the Studio Output, including play tests |
| `get_selection` | Sees what you selected in Studio ("fix *this* script") |
| `open_in_editor` | Opens a script in Bloxcode for you |
| `search_packages` · `install_package` | Finds and installs Wally packages |

The Bloxcode status bar shows what Claude is doing right now, and the Claude panel lists its recent actions.

## Safety

- Only programs on your own PC can use the connection. Bloxcode listens on `localhost`, and every request needs a secret key that only Bloxcode and Claude's config know. Websites can't use it.
- Claude only works while Bloxcode is open and Code Mode is on in Studio.
- Every change is an undo step in Studio. Save or publish your place regularly, like you always do.

## Troubleshooting

**Claude doesn't have the Bloxcode tools.** Restart Claude fully after clicking Connect Claude. Then check Settings → Developer (Claude Desktop) or `/mcp` (Claude Code).

**"Bloxcode is not running"** Open the Bloxcode app.

**"Not connected to Roblox Studio"** Open Studio, click **Plugins → Bloxcode** and turn on **Code Mode**.

**"Roblox Studio is still running an older Bloxcode plugin"** Restart Roblox Studio. Bloxcode already installed the new plugin.

**You moved or reinstalled Bloxcode.** Click **Connect Claude** again so Claude knows the new location.
