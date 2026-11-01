---
sidebar_position: 3
title: Wally Packages
---

Bloxcode has a built-in package manager for [Wally](https://wally.run), the package registry for Roblox. Install libraries like **Cmdr**, **Knit**, **Promise** or **Fusion** with one click. You don't need Wally, Rojo or a terminal.

## Installing a package

1. Click the **package icon** (the cube) in the bar on the left.
2. Pick one of the popular packages, or search for any package by name.
3. Click **Install**.

Bloxcode downloads the package and everything it depends on, and adds it to your place in Studio.

:::tip Check the scope
Many packages have forks with the same name. The grey text under each package shows who published it, for example `evaera` for the original Cmdr or `sleitnick` for Knit.
:::

## Using it in your code

Packages land in the same place Wally would put them:

| Package type | Location |
| --- | --- |
| Shared (most packages) | `ReplicatedStorage.Packages` |
| Server-only | `ServerScriptService.ServerPackages` |

Require them like this:

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Cmdr = require(ReplicatedStorage.Packages.Cmdr)
local Knit = require(ReplicatedStorage.Packages.Knit)
```

The code of each package lives in `Packages._Index`. You don't need to touch it.

## Updating and removing

- **Update:** when a newer version exists, the search result shows **Update to x.y.z**. Click it and the old version is replaced.
- **Remove:** open the package view. Under **Installed**, click **Remove** next to the package.

Installing, updating and removing are all undo steps in Studio, so <kbd>Ctrl</kbd> + <kbd>Z</kbd> brings things back.

## How packages are converted

Wally packages are Rojo projects. Bloxcode turns their files into Studio objects with the same rules as Rojo:

| File | Becomes |
| --- | --- |
| `name.lua` / `name.luau` | ModuleScript |
| `name.server.lua` | Script |
| `name.client.lua` | LocalScript |
| Folder with `init.lua` | ModuleScript with children |
| Folder without `init.lua` | Folder |
| `name.json` | ModuleScript that returns the data as a table |
| `name.txt` | StringValue |
| `name.model.json` | The described instances |

:::caution Binary model files
A few packages ship `.rbxm` or `.rbxmx` model files. Bloxcode can't convert those yet and shows a warning when it skips one.
:::
