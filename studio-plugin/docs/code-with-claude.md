---
sidebar_position: 8
title: Code with Claude
slug: /claude
---

Chat with [Claude](https://claude.ai) right inside Bloxcode. You describe what you want, and Claude builds it in your open Roblox Studio place. It reads your Explorer and scripts, writes code, creates RemoteEvents, GUIs and parts, installs Wally packages and reads the Output after you play-test.

You watch every change live in Bloxcode. Each change is one undo step in Studio, so **Ctrl+Z** (**⌘+Z** on Mac) takes it back.

:::info What you need
- Bloxcode **2.0** or newer
- Roblox Studio with the Bloxcode plugin and **Code Mode** on
- A Claude plan (Pro or Max) **or** an Anthropic API key
:::

## 1. Connect Claude (once)

Click the **sparkle icon** in the bar on the left to open the **Claude** panel. Pick one of the two ways:

### Your Claude plan (recommended)

Bloxcode uses [Claude Code](https://claude.com/claude-code) on your computer, so the chat runs on your Claude plan at no extra cost.

1. Click **Install & sign in**. A terminal window opens, installs Claude Code if it's missing and starts the sign-in.
2. Sign in with your Claude account in the browser.
3. Back in Bloxcode, click **I'm done, check again**.

Bloxcode never sees your Claude password or login. If Claude Code is already installed and signed in, you only click **Use my Claude plan**.

### Your own API key

1. Create a key in the [Claude Console](https://console.anthropic.com/settings/keys).
2. Paste it into the Claude panel and click **Save key**.

The key is stored encrypted on your computer. Usage is billed by Anthropic per request, separately from a Claude plan.

:::note On Mac
The first time you save a key (and after an update), macOS asks whether Bloxcode may use its keychain. Enter your Mac password and click **Always Allow**.
:::

You can switch between the two any time with the **gear icon** at the top of the Claude panel.

## 2. Chat

Keep Roblox Studio (with Code Mode on) and Bloxcode open, type what you want and press **Enter**. For example:

- *Add a coin system: coins spawn on the map, players collect them, and the count shows in the leaderboard and in a GUI.*
- *Make a shop GUI with three items that costs coins. Check purchases on the server.*
- *Install Cmdr and add an admin command that gives coins.*
- *I get an error when I press Play. Find it and fix it.*

The chat shows each step Claude takes (✓ done, ✕ failed). **Stop** ends the current answer, and **+** starts a new chat.

Select code in the editor, right-click → **Ask Claude About This Code** to start a message with that code.

## 3. Review changes (optional)

Turn on **Review changes** under the chat box (or **Settings → Claude**). Then every script change from Claude first appears as a side-by-side diff. **Accept** applies it in Studio, **Reject** tells Claude no, optionally with a note like *"use a ModuleScript instead"*.

![Reviewing a change from Claude](/img/review.png)

## 4. Testing

Claude tests its own work: it checks type errors with `get_diagnostics`, starts a short play test with `start_playtest`, reads the Output and fixes errors, and can look inside the running game with `run_code`. You can always press **Play** yourself and tell Claude what happened.

:::info After updating from 1.x
Play tests and `run_code` need the 2.0 plugin. Restart Roblox Studio once after updating.
:::

## What Claude can do

| Area | Tools |
| --- | --- |
| Overview | `get_status`, `get_explorer`, `get_selection` (Studio selection), `get_editor_state` (open script and selected text) |
| Scripts | `read_script`, `read_scripts` (up to 20 at once), `write_script`, `edit_script` (several exact edits at once), `search_scripts` (text or regex), `replace_in_scripts`, `open_in_editor` |
| Checking | `get_diagnostics` (Luau type errors), `get_output` (Studio and play-test output) |
| Instances | `create_instance`, `create_tree` (a whole GUI or model in one step), `duplicate_instance`, `rename_instance`, `move_instance`, `delete_instance`, `get_properties`, `set_properties` (also attributes and tags, several objects at once), `set_selection`, `insert_asset` |
| Running | `start_playtest` (Play or Run, optionally for a few seconds with the Output), `stop_playtest`, `get_playtest_state`, `run_code` (Luau in Studio or inside a running test) |
| Undo | `undo`, `redo`, `get_script_history`, `restore_script_version` |
| Packages & GitHub | `search_packages`, `install_package`, `publish_to_github` |

The Bloxcode status bar shows what Claude is doing right now.

### For Claude Desktop and Claude Code

Besides tools, Bloxcode offers **resources** (the Explorer, the Output, the problems, the open script and every script as `bloxcode://script/<path>`) and ready-made **prompts**: *build a feature*, *fix errors*, *review code*, *explain this game* and *secure remotes*. In Claude Desktop they are in the **+** menu of the chat box.

## Safety

- With **Review changes** on, nothing changes in Studio until you click Accept.
- In the chat, Claude can only use Bloxcode's tools. It can't run programs or read other files on your computer.
- Only programs on your own PC can use the connection. Bloxcode listens on `localhost`, and every request needs a secret key that only Bloxcode and the Claude setup it creates know. Websites can't use it.
- Claude only works while Bloxcode is open and Code Mode is on in Studio.
- Every change is an undo step in Studio. Save or publish your place regularly, like you always do.

## Use Claude Desktop instead

You can still use Bloxcode's tools from Claude Desktop. In the Claude panel, open the gear icon → **Use Claude Desktop instead**, click **Connect Claude Desktop** and restart Claude. Then start a new chat in Claude Desktop and paste the starter prompt (**Copy starter prompt**).

## Troubleshooting

**"Claude Code is not signed in"** Click **Sign in** in the Claude panel and finish the sign-in in the browser.

**"The API key was rejected"** Check the key in the Claude Console and save it again (gear icon → Remove key).

**Claude Desktop doesn't have the Bloxcode tools.** Restart Claude fully after clicking Connect Claude Desktop. Then check Settings → Developer.

**"Bloxcode is not running"** Open the Bloxcode app.

**"Not connected to Roblox Studio"** Open Studio, click **Plugins → Bloxcode** and turn on **Code Mode**.

**"Roblox Studio is still running an older Bloxcode plugin"** Restart Roblox Studio. Bloxcode already installed the new plugin.

**You moved or reinstalled Bloxcode.** Click **Connect Claude** again so Claude knows the new location.
