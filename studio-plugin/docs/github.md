---
sidebar_position: 9
title: GitHub
---

Publish your game's scripts to GitHub with one click: a backup with full history, and an easy way to share code or work with others. You don't need Git or Rojo.

## 1. Sign in

Click the **GitHub** icon on the left.

- **Sign in with GitHub:** Bloxcode shows a code, your browser opens github.com, you paste the code and click **Authorize**.
- **Or sign in with a token:** [create a token](https://github.com/settings/tokens/new?scopes=repo&description=Bloxcode) with the **repo** scope and paste it into the panel.

Bloxcode stores the login encrypted on your computer. **Sign out** removes it.

## 2. Create a repository

With Studio connected, the panel suggests a repository named after your place. Choose **Private** or **Public**, add a description if you like and click **Create repository and publish**. Each place gets its own repository.

Already have one? Open **Use an existing repository** and enter `owner/name`.

## 3. Publish changes

The panel compares your scripts with GitHub and lists what is **new**, **changed** and **removed**. Type what you changed (optional) and click **Publish**. That's one commit on GitHub.

Claude can publish for you too, when you ask it to (`publish_to_github`).

## What ends up in the repository

Scripts are saved like a [Rojo](https://rojo.space) project, so you can also use the repository with Rojo:

```text
default.project.json
src/
  ServerScriptService/
    Main.server.luau        ← Script
  ReplicatedStorage/
    Shared/
      Util.luau             ← ModuleScript
  StarterGui/
    HUD/
      init.meta.json        ← { "className": "ScreenGui" }
      Controller.client.luau ← LocalScript
```

- Only scripts and the folders and objects that contain them are saved, not parts or meshes.
- A script with children becomes a folder with `init.server.luau`, `init.client.luau` or `init.luau`.
- Bloxcode only manages `default.project.json` and `src/`. Other files in the repository (like your README) are left alone.
