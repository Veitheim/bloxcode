---
sidebar_position: 1
sidebar_label: Getting Started
title: Getting Started
---

From installing to your first script in Bloxcode in five minutes.

![Bloxcode with an open script](/img/editor.png)

## 1. Install Bloxcode

[**Download the installer**](https://bloxcode-docs.seidl.workers.dev/download), run it and follow the steps. Bloxcode starts automatically when it's done.

:::info The plugin installs itself
On first launch, Bloxcode copies the Studio plugin to
`%LOCALAPPDATA%\Roblox\Plugins\BloxcodeBridge.lua`. You don't need to copy anything by hand.
:::

:::caution Windows SmartScreen
The installer is not code-signed. If Windows says "Unknown publisher", click
**More info → Run anyway**.
:::

:::tip Automatic updates
Bloxcode checks for updates every time it starts, just like Discord. New versions are downloaded and installed automatically.
:::

## 2. Connect Studio

1. **Restart Roblox Studio** so the plugin loads.
2. Open the **Plugins** tab and click **Bloxcode**. A small window appears.
3. Click **Code Mode: OFF**. The button turns green.
4. The first time, Studio asks for two permissions. Allow both:
   - **HTTP requests** to `localhost`, so the plugin can talk to Bloxcode.
   - **Script Injection**, so the plugin can create and edit scripts.

:::tip Done when it's green
The status bar at the bottom of Bloxcode turns green and shows **Connected to Studio** with the name of your place.
:::

## 3. Your first script

- **In Studio**, double-click a script. It opens in Bloxcode instead of the Studio editor.
- **In Bloxcode**, click a script in the Explorer or search with <kbd>Ctrl</kbd> + <kbd>P</kbd>.
- **New script:** right-click `ServerScriptService` → **New Script**.

Everything you type goes to Studio automatically. Learn more in [Explorer & Sync](./explorer) and [Wally Packages](./packages).
