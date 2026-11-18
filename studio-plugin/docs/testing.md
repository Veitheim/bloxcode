---
sidebar_position: 5
title: Play Tests & Output
---

Start play tests from Bloxcode and see everything they print, right next to your code.

## Play, Run and Stop

The buttons at the top right of Bloxcode work like Studio's:

| Button | Shortcut | What it does |
| --- | --- | --- |
| **Play** | <kbd>F5</kbd> | Starts a test with your character, like Studio's Play |
| **Run** | <kbd>F8</kbd> | Runs the server only, like Studio's Run |
| **Stop** | <kbd>Shift</kbd> + <kbd>F5</kbd> | Ends the test |

While a test runs, the status bar shows **● Play test running · Stop**. Play tests started in Studio show up the same way.

## Test mode

Roblox only draws the game inside Studio, so the game itself can't run in a Bloxcode window. Test mode gets you there in one step instead:

1. Press **Play** (or <kbd>F5</kbd>) in Bloxcode.
2. Roblox Studio comes to the front with the running game.
3. A small floating Bloxcode window stays on top and shows the time, the number of errors, warnings and prints, and the Output live, with a **Stop test** button.
4. When the test ends, you are back in Bloxcode.

![The floating test window](/img/testmode.png)

Turn it off under **Settings → Studio sync → Test mode** if you prefer to switch windows yourself.

:::info After updating from 1.x
Play tests from Bloxcode need the 2.0 plugin. Restart Roblox Studio once after updating, then the buttons are enabled.
:::

## Output panel

<kbd>Ctrl</kbd> + <kbd>J</kbd> (or the panel icon at the bottom right) opens the **Output**. It shows prints, warnings and errors from Studio and from play tests:

- **SERVER** and **CLIENT** labels show where a line came from during a test.
- **Click an error** like `ServerScriptService.Main:21` to open the script at that line. Stack traces work too.
- **Filter** by text, by kind (errors, warnings, prints) and by where it ran.
- **Clear** empties the Output (also for Claude).

When an error happens while the panel is closed, the **OUTPUT** tab shows a red counter.

## Problems

The **PROBLEMS** tab lists type errors and warnings from the [Luau type checker](./luau). It doesn't need a play test.

## With Claude

Claude can start a play test itself (`start_playtest`), read its Output, look inside the running game with `run_code`, stop the test and fix what went wrong. See [Code with Claude](./claude).
