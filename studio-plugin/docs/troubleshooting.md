---
sidebar_position: 11
title: Troubleshooting
---

## "Windows protected your PC" when installing

Bloxcode isn't code-signed yet, so SmartScreen warns about new downloads. Click **More info → Run anyway**. The warning only appears for the installer, not when Bloxcode updates itself. Bloxcode is open source, so you can check [the code on GitHub](https://github.com/Veitheim/bloxcode).

## Play buttons are grey

Play tests need the 2.0 plugin. Restart Roblox Studio once after updating Bloxcode.

## "⚠ Luau" in the status bar

The Luau language server stopped or couldn't be downloaded. Click it to restart. The first start needs the internet once to download luau-lsp.

## "Can't reach Bloxcode" in the plugin

- Is Bloxcode running? The plugin can only connect while the app is open.
- Does the Bloxcode status bar say **"Port 34872 is already in use"**? Then Bloxcode is already running in another window, or another program uses the port.
- Did you deny the **HTTP permission**? You can allow it again under **Plugins → Manage Plugins → Bloxcode**.

## The Bloxcode plugin doesn't show up in Studio

1. In Bloxcode, click the **plug icon** on the left → **Reinstall plugin**.
2. Close Studio **completely** and open it again.
3. Use **Open plugins folder** to check that `BloxcodeBridge.lua` is there.

## Scripts still open in Studio

- Is **Code Mode** on (green button)?
- Does the plugin window say **"Connected"**? Without a connection, Studio opens scripts normally on purpose, so you never lose access to your scripts.

## Creating or editing fails

Errors like *"lacking capability"* or *"Script injection"* mean the **Script Injection** permission is missing. Allow it under **Plugins → Manage Plugins → Bloxcode**.

## A package won't install

- Check that Studio is connected. Packages are added through the plugin.
- Some package names exist in many forks. Make sure you picked the right publisher (the grey text under the name).
- If the Wally registry is down, try again in a few minutes.

## "Another Studio window is now connected"

Bloxcode connects to **one** Studio window at a time. When you turn on Code Mode in a second place, it takes over, and Code Mode turns off in the first one.

## Mac: "Bloxcode can't be opened" or "Apple could not verify"

Bloxcode for Mac isn't signed by Apple yet. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to Bloxcode. You only need to do this once.

If macOS says the app **is damaged**, it was blocked while downloading. Open Terminal and run:

```bash
xattr -dr com.apple.quarantine /Applications/Bloxcode.app
```

## The update doesn't install

On Windows, Bloxcode checks for updates on startup. If it can't reach the update server within a few seconds, it starts anyway and tries again later. On Mac, Bloxcode shows a **Download** link in the status bar when a new version is out. You can always download the latest version for [Windows](https://bloxcode-docs.seidl.workers.dev/download/windows) or [Mac](https://bloxcode-docs.seidl.workers.dev/download/mac) and install it over the old one.

## I deleted something by accident

Switch to Studio and press <kbd>Ctrl</kbd> + <kbd>Z</kbd> (<kbd>⌘</kbd> + <kbd>Z</kbd> on Mac). Every action from Bloxcode is its own undo step there.
