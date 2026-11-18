---
sidebar_position: 6
title: Search, History & Properties
---

## Search & Replace in all scripts

<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> opens the search on the left. It searches the source of **every** script in the place, not only the open ones.

![Search in all scripts](/img/search.png)

- **Aa** match case, **ab** whole word, **.\*** regular expression.
- **Only in paths containing** narrows the search, for example to `ServerScriptService`.
- Click a result to open the script at that line.
- Click the arrow on the left (or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>) to **replace**. Results show a preview of the change. **Replace All** changes every script as one undo step in Studio; **Replace** on a result changes only that script.
- In regex mode, `$1` … `$9` insert the groups of the match.

## Script history

Bloxcode saves earlier versions of every script on your computer: your edits, Claude's edits and changes made in Studio, for 60 days.

![Script history with a diff](/img/history.png)

Open it with right-click on a tab (or in the editor) → **Show History**, or in the **HISTORY** tab of the bottom panel. Each version shows who changed it (**You**, **Claude**, **Studio**) and when. Click a version to compare it with the current one, then **Restore this version** if you want it back. Restoring is one undo step in Studio, and the current version stays in the history.

## Properties panel

The **Properties** icon on the left shows the properties of the object you selected in the Explorer:

- Checkboxes for true/false, number fields, text, colors with a color picker, and X/Y/Z fields for sizes and positions.
- **Attributes:** change, add (**+ Add**) or remove them.
- **Tags:** add and remove CollectionService tags.

Every change is applied in Studio right away and is one undo step there.
