---
sidebar_position: 6
title: Troubleshooting
---

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

## The update doesn't install

Bloxcode checks for updates on startup. If it can't reach the update server within a few seconds, it starts anyway and tries again later. You can always [download the latest version](https://bloxcode-docs.seidl.workers.dev/download) and install it over the old one.

## I deleted something by accident

Switch to Studio and press <kbd>Ctrl</kbd> + <kbd>Z</kbd>. Every action from Bloxcode is its own undo step there.
