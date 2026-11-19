---
sidebar_position: 3
title: Editor, Themes & Settings
---

The editor is [Monaco](https://microsoft.github.io/monaco-editor/), the same one VS Code uses, with Luau highlighting, snippets and autocomplete that knows your Explorer.

![Bloxcode 2.0 with the Output panel](/img/editor.png)

## Themes

Open **Settings** (<kbd>Ctrl</kbd> + <kbd>,</kbd> or the gear at the bottom left) → **Appearance**.

| Theme | Type |
| --- | --- |
| Bloxcode Night | dark (default) |
| Bloxcode Day | light |
| Dark+ | dark, like VS Code |
| Light+ | light |
| Roblox Studio Dark | the colors of Studio's script editor |
| One Dark, Dracula, Monokai, GitHub Dark | dark |
| Solarized Light | light |
| High Contrast | for low vision |

![All Bloxcode themes](/img/themes.png)

- **Accent color:** pick one of the colors or any color with the color picker. It is used for buttons, the active tab, the cursor and selections.
- **Import theme:** use a Bloxcode theme file or any **VS Code color theme** (`.json`). Bloxcode reads its colors and token colors.
- **Export current theme:** saves the theme with your accent color, so you can share it.

You can also switch themes from the command palette: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> → *Color Theme*.

## Settings

| Section | What you can change |
| --- | --- |
| Appearance | Theme, accent color, interface size, reduce motion |
| Editor | Font, font size, line height, ligatures, minimap, word wrap, sticky scroll, line numbers, bracket colors, tab size, whitespace, cursor |
| Studio sync | Auto Sync, plugin status |
| Luau | [Luau language server](./luau) on/off and restart |
| Claude | Review Claude's changes before they apply |
| Discord | Rich Presence and what it shows |

Settings are saved on your computer. **About → Reset settings** brings back the defaults.

## Color previews

Next to `Color3.fromRGB(…)`, `Color3.new(…)`, `Color3.fromHex(…)` and `Color3.fromHSV(…)` you see a small swatch with the color. Click it to pick a new color; Bloxcode keeps the format you used.

## Ctrl+click on instances

Hold <kbd>Ctrl</kbd> and point at a path like `workspace.Map.Door`, `game:GetService("ReplicatedStorage").Remotes.Buy` or `script.Parent`: it is underlined and shows what it is. A click selects the object in the Explorer and in Studio, or opens it when it is a script. It also follows local variables, like `local Remotes = ReplicatedStorage:WaitForChild("Remotes")`.

## Command palette

<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> lists every action: open views, start a play test, switch the theme, publish to GitHub, restart the language server and more. Type a few letters and press <kbd>Enter</kbd>. Your last commands are at the top.

In **Go to File** (<kbd>Ctrl</kbd> + <kbd>P</kbd>), typing `>` switches to the command palette, like in VS Code.

## Split editor

<kbd>Ctrl</kbd> + <kbd>&#92;</kbd> or the split icon at the right of the tabs opens a second editor next to the first. Right-click a tab → **Open to the Side** moves a script there. Both sides can show the same script; edits appear in both.

## Discord Rich Presence

**Settings → Discord** shows *"Editing Main.server.luau in My Obby"* on your Discord profile while you work. It only works while the Discord app runs on the same computer, and you choose whether the script name and the place name are shown. Nothing is sent over the internet by Bloxcode; it talks to the Discord app directly.

## Setup assistant and What's new

On the first start, the setup assistant helps you pick a theme, connect Studio, set up Claude and turn on extras. After every update, **What's new** shows what changed. Both are on the welcome screen and in **Settings → About**.
