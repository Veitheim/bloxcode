---
sidebar_position: 1
sidebar_label: Getting Started
title: Getting Started
---

From installing to your first script in Bloxcode in five minutes.

![Bloxcode with an open script](/img/editor.png)

## 1. Install Bloxcode

### Install on Windows

[**Download the installer**](https://bloxcode-docs.seidl.workers.dev/download/windows), run it and follow the steps. Bloxcode starts automatically when it's done.

:::caution Windows SmartScreen
The installer is not code-signed. If Windows says "Unknown publisher", click
**More info → Run anyway**.
:::

:::tip Automatic updates
On Windows, Bloxcode checks for updates every time it starts, just like Discord. New versions are downloaded and installed automatically.
:::

### Install on Mac

[**Download Bloxcode for Mac**](https://bloxcode-docs.seidl.workers.dev/download/mac) (works on Apple Silicon and Intel, macOS 12 or newer). Open the `.dmg` and drag **Bloxcode** into **Applications**.

:::caution The first start on Mac
Bloxcode for Mac is not signed by Apple yet, so macOS blocks it the first time:

1. Open Bloxcode from Applications. macOS says it can't verify the developer. Click **Done** (or **OK**).
2. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to Bloxcode.
3. Confirm with **Open**. From now on Bloxcode starts normally.
:::

:::tip Updates on Mac
When a new version is out, the status bar shows **Bloxcode x.y is out · Download**. Click it, then drag the new version into Applications and replace the old one.
:::

:::info The plugin installs itself
On first launch, Bloxcode copies the Studio plugin into Studio's plugins folder. You don't need to copy anything by hand.

- Windows: `%LOCALAPPDATA%\Roblox\Plugins\BloxcodeBridge.lua`
- Mac: `~/Documents/Roblox/Plugins/BloxcodeBridge.lua`
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
- **In Bloxcode**, click a script in the Explorer or search with <kbd>Ctrl</kbd> + <kbd>P</kbd> (<kbd>⌘</kbd> + <kbd>P</kbd> on Mac).
- **New script:** right-click `ServerScriptService` → **New Script**.

Everything you type goes to Studio automatically. Learn more in [Explorer & Sync](./explorer) and [Wally Packages](./packages).
