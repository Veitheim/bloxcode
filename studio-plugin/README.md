# Bloxcode

Bloxcode is an external code editor for Roblox Studio, built on Monaco (the editor behind VS Code).

## Install

1. [Download the installer](https://bloxcode-docs.seidl.workers.dev/download) and run it.
2. Start Bloxcode. The Studio plugin is copied to `%LOCALAPPDATA%\Roblox\Plugins\BloxcodeBridge.lua` (Windows) or `~/Documents/Roblox/Plugins/BloxcodeBridge.lua` (Mac) automatically.
3. Restart Roblox Studio.
4. **Plugins** tab → **Bloxcode** → turn on **Code Mode**.
5. The first time, allow **HTTP requests to localhost** and **Script Injection**.

## Use

- Double-click a script in Studio and it opens in Bloxcode.
- Right-click in the Bloxcode Explorer to add Scripts, LocalScripts, ModuleScripts, RemoteEvents and more.
- Install Wally packages like Cmdr or Knit from the package view.
- `Ctrl+P` finds scripts, `Ctrl+S` sends to Studio right away (Auto Sync does it for you).
