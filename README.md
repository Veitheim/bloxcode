<p align="center">
  <img src="build/icon.png" width="96" alt="Bloxcode logo">
</p>

<h1 align="center">Bloxcode</h1>

<p align="center">
  <b>Write Roblox code like in VS Code.</b><br>
  An external code editor for Roblox Studio with a live Explorer, two-way sync and built-in Wally packages.
</p>

<p align="center">
  <a href="https://bloxcode-docs.seidl.workers.dev/download"><b>Download for Windows</b></a> ·
  <a href="https://bloxcode-docs.seidl.workers.dev/docs/intro">Getting started</a> ·
  <a href="https://bloxcode-docs.seidl.workers.dev">Website</a>
</p>

![Bloxcode](studio-plugin/.moonwave/static/img/editor.png)

## Features

- **Code Mode:** turn it on in the Studio plugin and every script you open in Studio opens in Bloxcode instead.
- **Live Explorer:** Workspace, ServerScriptService, ReplicatedStorage, StarterGui and more, mirrored in real time. Create, rename, move (drag & drop), duplicate and delete objects.
- **Two-way sync:** what you type goes to Studio right away, and changes in Studio show up in Bloxcode. Every change is a Ctrl+Z step in Studio.
- **Wally packages:** search and install Cmdr, Knit, Promise, Fusion and more with one click, dependencies included.
- **Luau editor:** Monaco (the editor behind VS Code) with Luau highlighting, snippets and autocomplete that knows your Explorer.
- **Code with Claude:** connect Claude with one click and it builds features right inside your place: reads the Explorer and scripts, writes code, creates instances, installs packages and reads the Output after you play-test. See [Code with Claude](https://bloxcode-docs.seidl.workers.dev/docs/claude).
- **Auto updates:** Bloxcode updates itself on startup, like Discord.

## How it works

```
Roblox Studio                          Bloxcode (Electron)
┌───────────────────────┐   HTTP     ┌──────────────────────────┐
│ BloxcodeBridge plugin │ ─────────▶ │ local server :34872      │
│  · mirrors Explorer   │  events    │  · Explorer tree         │
│  · intercepts opens   │ ◀───────── │  · Monaco editor tabs    │
│  · runs commands      │  commands  │  · Wally package manager │
└───────────────────────┘ (long poll)└──────────────────────────┘
```

The Studio plugin is the client: it posts Explorer changes to Bloxcode and long-polls for commands (set source, create, rename, install package, …). See the [Protocol reference](https://bloxcode-docs.seidl.workers.dev/api/Protocol).

## Project layout

| Path | What it is |
| --- | --- |
| `app/main.js` | Electron main process and the local HTTP bridge |
| `app/updater.js` | Splash window and auto-updater |
| `app/packages.js` | Wally registry client, dependency resolution, Rojo-style file conversion |
| `app/agent.js` | Tools for Claude: Explorer mirror, output log, requests to the plugin, Claude config setup |
| `app/mcp/bloxcode-mcp.js` | MCP server Claude starts (runs with `Bloxcode.exe` in Node mode, no dependencies) |
| `app/renderer/` | The editor UI (Monaco, Explorer, tabs, package view) |
| `studio-plugin/src/CodeBridge.lua` | The Roblox Studio plugin |
| `studio-plugin/docs`, `pages`, `.moonwave` | Website and docs (Moonwave) |
| `studio-plugin/worker.js` | Cloudflare Worker: website, update feed, download link |
| `tools/` | Mock Studio for testing, release script, icon generator |

## Development

Requires Node.js 20+ on Windows.

```bash
npm install
npm start
```

Test without Roblox Studio by running a fake Studio that connects to the app:

```bash
node tools/mock-studio.js
```

The fake Studio also answers Claude's tool calls. To try the MCP server by hand, point it at the dev copy: `BLOXCODE_PORT=34999 BLOXCODE_KEY_FILE=%APPDATA%/bloxcode-dev/agent-key.txt node app/mcp/bloxcode-mcp.js`.

To run a dev copy next to an installed Bloxcode, give it its own port: `BLOXCODE_PORT=34999 npm start` (and the same for the mock).

## Releasing

1. Bump `version` in `package.json`.
2. Run `npm run release`. This builds the installer and uploads it to the update server.

Installed copies update themselves on their next start.

## Website

```bash
npm run docs:build
npm run docs:deploy
```

The website is built with [Moonwave](https://eryn.io/moonwave/) and hosted on Cloudflare Workers. Installers live in the R2 bucket `bloxcode-releases` and are served at `/updates/` and `/download`.

## License

[MIT](LICENSE)
