import React from "react"
import Layout from "@theme/Layout"
import Link from "@docusaurus/Link"
import useBaseUrl from "@docusaurus/useBaseUrl"
import styles from "./index.module.css"

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" className={styles.featureIcon} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const FEATURES = [
  {
    title: "One click: Code Mode",
    text: "Press one button in the Studio plugin and every script you open in Studio opens in Bloxcode instead.",
    icon: "M13 2L4 14h7l-1 8 9-12h-7z",
  },
  {
    title: "Full Explorer",
    text: "Workspace, ServerScriptService, ReplicatedStorage, StarterGui and more, mirrored live with every folder and object.",
    icon: "M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 6V5a1 1 0 0 1 1-1h4l2 2",
  },
  {
    title: "Wally packages built in",
    text: "Search Cmdr, Knit, Promise, Fusion and thousands more, then install with one click. Dependencies included.",
    icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  },
  {
    title: "Two-way sync",
    text: "What you type is in Studio right away. What happens in Studio shows up here. Everything can be undone with Ctrl+Z.",
    icon: "M4 9h13l-3-3M20 15H7l3 3",
  },
  {
    title: "Luau done right",
    text: "Syntax highlighting, string interpolation, types, snippets and autocomplete that knows your Explorer.",
    icon: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  },
  {
    title: "Always up to date",
    text: "Bloxcode updates itself on startup, just like Discord. No reinstalling, ever.",
    icon: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  },
]

const STEPS = [
  {
    title: "Install",
    text: "Run the Bloxcode installer. The Studio plugin is set up automatically on first launch.",
  },
  {
    title: "Turn on Code Mode",
    text: "In Studio, open Plugins → Bloxcode, turn on Code Mode and allow the permissions.",
  },
  {
    title: "Start coding",
    text: "Double-click a script and it opens in Bloxcode. Type, and Studio is updated instantly.",
  },
]

const SHORTCUTS = [
  [["Ctrl", "P"], "Find & open a script"],
  [["Ctrl", "S"], "Send to Studio now"],
  [["Ctrl", "W"], "Close tab"],
  [["Ctrl", "Tab"], "Next tab"],
  [["F2"], "Rename"],
  [["Del"], "Delete"],
]

function Window({ src, alt, className }) {
  return (
    <div className={`${styles.window} ${className || ""}`}>
      <div className={styles.windowBar}>
        <span />
        <span />
        <span />
      </div>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  )
}

export default function Home() {
  return (
    <Layout title="The external code editor for Roblox Studio" description="Bloxcode opens your Roblox Studio scripts in a VS Code-style editor, with live sync, a full Explorer and Wally packages.">
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.grid} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.brand}>
              <img src={useBaseUrl("img/logo.png")} alt="" className={styles.heroLogo} />
              <span className={styles.brandName}>Bloxcode</span>
            </div>
            <a className={styles.badge} href="/docs/claude">New in 1.2: code your game together with Claude →</a>
            <h1 className={styles.title}>
              Write Roblox code
              <br />
              <span className={styles.gradient}>like in VS Code.</span>
            </h1>
            <p className={styles.subtitle}>
              Bloxcode replaces the Roblox Studio script editor with a modern editor: full Explorer, autocomplete, Wally packages and live sync.
            </p>
            <div className={styles.ctas}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href="/download">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Download for Windows
              </a>
              <Link className={`${styles.btn} ${styles.btnGhost}`} to="/docs/intro">
                Get started
              </Link>
              <a className={`${styles.btn} ${styles.btnGhost}`} href="https://github.com/Veitheim/bloxcode">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                GitHub
              </a>
            </div>
          </div>
          <div className={styles.heroShot}>
            <Window src={useBaseUrl("img/editor.png")} alt="Bloxcode with an open script and the Explorer" />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Features</span>
            <h2>Everything the Studio editor can't do</h2>
          </div>
          <div className={styles.features}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.feature}>
                <Icon d={f.icon} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.split}`}>
          <div className={styles.splitText}>
            <span className={styles.eyebrow}>Explorer</span>
            <h2>Your whole game. One right-click.</h2>
            <p>
              The Explorer shows the same structure as Studio. Create Scripts, RemoteEvents or folders right here and they appear in Studio instantly.
            </p>
            <ul className={styles.checks}>
              <li>Drag & drop to move</li>
              <li>Copy the Lua path in one click</li>
              <li>"Select in Studio" jumps to the object</li>
              <li>Every change is one Ctrl+Z step in Studio</li>
            </ul>
          </div>
          <Window src={useBaseUrl("img/explorer.png")} alt="Context menu in the Bloxcode Explorer" className={styles.splitShot} />
        </section>

        <section className={`${styles.section} ${styles.split} ${styles.splitReverse}`}>
          <div className={styles.chat} aria-label="Example chat with Claude">
            <div className={styles.chatUser}>Add a coin system: coins spawn on the map and the count shows in the leaderboard.</div>
            <div className={styles.chatTools}>
              <span>get_explorer</span>
              <span>read_script · ServerScriptService.Main</span>
              <span>create_instance · ReplicatedStorage.Remotes.CoinCollected</span>
              <span>create_instance · ServerScriptService.CoinSpawner</span>
              <span>edit_script · ServerScriptService.Main</span>
            </div>
            <div className={styles.chatClaude}>Done. Coins now spawn every 5 seconds and add 1 to <code>leaderstats.Coins</code>. Press Play to try it, then tell me how it went.</div>
          </div>
          <div className={styles.splitText}>
            <span className={styles.eyebrow}>New · Claude</span>
            <h2>Build your game with Claude.</h2>
            <p>
              Connect Claude with one click. Tell it what you want, and it writes the scripts, creates RemoteEvents and GUIs, and installs packages right inside your place, while you watch in Bloxcode.
            </p>
            <ul className={styles.checks}>
              <li>Reads your Explorer and existing code</li>
              <li>Reads the Output after you play-test and fixes errors</li>
              <li>Every change is one Ctrl+Z step in Studio</li>
              <li>Works with Claude Desktop and Claude Code</li>
            </ul>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="/docs/claude" style={{ marginTop: 22 }}>
              How it works
            </a>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Setup</span>
            <h2>Ready in three steps</h2>
          </div>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s.title} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Shortcuts</span>
            <h2>Keep your hands on the keyboard</h2>
          </div>
          <div className={styles.shortcuts}>
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className={styles.shortcut}>
                <span className={styles.keys}>
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <h2>Ready for better Roblox code?</h2>
          <p>Install, turn on Code Mode, done. Free, open source and it keeps itself up to date.</p>
          <div className={styles.ctas}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="/download">
              Download Bloxcode
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="https://github.com/Veitheim/bloxcode">
              View source on GitHub
            </a>
          </div>
        </section>
      </main>
    </Layout>
  )
}
