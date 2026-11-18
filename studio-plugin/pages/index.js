import React, { useEffect, useState } from "react"
import Layout from "@theme/Layout"
import Link from "@docusaurus/Link"
import useBaseUrl from "@docusaurus/useBaseUrl"
import styles from "./index.module.css"

const Icon = ({ d, className }) => (
  <svg viewBox="0 0 24 24" className={className || styles.featureIcon} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ICONS = {
  check: "M20 6L9 17l-5-5",
  play: "M7 4v16l13-8z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  split: "M3 5h18v14H3zM12 5v14",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  sync: "M4 9h13l-3-3M20 15H7l3 3",
  update: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  discord: "M8 12h.01M16 12h.01M7.5 7.5c3-1.3 6-1.3 9 0M7.5 16.5c3 1.3 6 1.3 9 0M5 17c-1.5-3-2-6.5-.5-10 1.5-.8 3-1.3 4.5-1.5l.8 1.6M19 17c1.5-3 2-6.5.5-10-1.5-.8-3-1.3-4.5-1.5l-.8 1.6M5 17c1.3 1 2.8 1.7 4.3 2l.9-1.7M19 17c-1.3 1-2.8 1.7-4.3 2l-.9-1.7",
  explorer: "M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 6V5a1 1 0 0 1 1-1h4l2 2",
  sparkle: "M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z",
}

const SMALL_FEATURES = [
  ["explorer", "Live Explorer", "Your whole place, mirrored live. Create, move and rename anything."],
  ["box", "Wally packages", "Cmdr, Knit, Promise, Fusion and thousands more with one click."],
  ["split", "Split editor", "Two scripts side by side."],
  ["command", "Command palette", "Every action, one shortcut away."],
  ["discord", "Discord presence", "Show what you're building."],
  ["update", "Updates itself", "New versions install on startup, like Discord."],
]

const THEMES = [
  ["Bloxcode Night", "#11131f", "#0b0d17", ["#c4a1ff", "#82aaff", "#9ece6a", "#5c6687"]],
  ["Bloxcode Day", "#ffffff", "#eef0f8", ["#7c3aed", "#2563eb", "#15803d", "#8c93ad"]],
  ["Roblox Studio", "#252525", "#2b2b2b", ["#f86d7c", "#fdfbac", "#adf195", "#666666"]],
  ["Dracula", "#282a36", "#21222c", ["#ff79c6", "#50fa7b", "#f1fa8c", "#6272a4"]],
  ["One Dark", "#282c34", "#21252b", ["#c678dd", "#61afef", "#98c379", "#5c6370"]],
  ["GitHub Dark", "#0d1117", "#010409", ["#ff7b72", "#d2a8ff", "#a5d6ff", "#8b949e"]],
  ["Monokai", "#272822", "#1e1f1c", ["#f92672", "#a6e22e", "#e6db74", "#75715e"]],
  ["Solarized", "#fdf6e3", "#eee8d5", ["#859900", "#268bd2", "#2aa198", "#93a1a1"]],
]

const STEPS = [
  { title: "Install", text: "Run the installer. The Studio plugin is set up automatically, and a short setup assistant picks your theme." },
  { title: "Turn on Code Mode", text: "In Studio, open Plugins → Bloxcode, turn on Code Mode and allow the permissions." },
  { title: "Start coding", text: "Double-click a script and it opens in Bloxcode. Type, and Studio is updated instantly." },
]

const SHORTCUTS = [
  [["Mod", "P"], "Open a script"],
  [["Mod", "Shift", "P"], "Command palette"],
  [["Mod", "Shift", "F"], "Search all scripts"],
  [["F5"], "Play test"],
  [["F12"], "Go to definition"],
  [["Mod", "J"], "Output panel"],
]

const PLATFORMS = {
  windows: { label: "Windows", href: "/download/windows" },
  mac: { label: "macOS", href: "/download/mac" },
}

// Picks the right download for the visitor. Server render shows Windows, the browser corrects it.
function usePlatform() {
  const [platform, setPlatform] = useState("windows")
  useEffect(() => {
    const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent
    if (/mac/i.test(ua)) setPlatform("mac")
  }, [])
  return platform
}

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const GITHUB_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
)

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
  const platform = usePlatform()
  const main = PLATFORMS[platform]
  const mod = platform === "mac" ? "⌘" : "Ctrl"
  return (
    <Layout title="The modern code editor for Roblox Studio" description="Bloxcode is a modern editor for Roblox Studio: live sync, real Luau type checking, play tests, search across all scripts, GitHub and Claude built in.">
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.aurora} aria-hidden="true"><span /><span /><span /></div>
          <div className={styles.dots} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.brand}>
              <img src={useBaseUrl("img/logo.png")} alt="" className={styles.heroLogo} />
              <span className={styles.brandName}>Bloxcode</span>
            </div>
            <Link className={styles.badge} to="/docs/changelog">
              <span className={styles.badgeNew}>New</span> Bloxcode 2.0 is here · See what's new <span aria-hidden="true">→</span>
            </Link>
            <h1 className={styles.title}>
              Write Roblox code
              <br />
              <span className={styles.gradient}>like in VS Code.</span>
            </h1>
            <p className={styles.subtitle}>
              A modern editor for Roblox Studio with live sync, real Luau type checking, play tests, search across every script, GitHub and Claude built in.
            </p>
            <div className={styles.ctas}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={main.href}>
                {DOWNLOAD_ICON}
                Download for {main.label}
              </a>
              <Link className={`${styles.btn} ${styles.btnGhost}`} to="/docs/intro">
                Get started
              </Link>
              <a className={`${styles.btn} ${styles.btnGhost}`} href="https://github.com/Veitheim/bloxcode">
                {GITHUB_ICON}
                GitHub
              </a>
            </div>
            <p className={styles.meta}>Free and open source · Updates itself · {platform === "mac" ? <a href="/download/windows">Also for Windows</a> : <a href="/download/mac">Also for Mac</a>}</p>
          </div>
          <div className={styles.heroShot}>
            <Window src={useBaseUrl("img/editor.png")} alt="Bloxcode 2.0 with a script, the Explorer and the Output panel" />
          </div>
        </section>

        <section className={styles.stats}>
          <div><b>34</b><span>tools for Claude</span></div>
          <div><b>11</b><span>color themes</span></div>
          <div><b>1 click</b><span>play tests & GitHub</span></div>
          <div><b>100%</b><span>free & open source</span></div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>What's inside</span>
            <h2>Everything the Studio editor can't do</h2>
            <p>Built for Roblox from the ground up, with the tools you know from VS Code.</p>
          </div>
          <div className={styles.bento}>
            <div className={`${styles.card} ${styles.cardWide}`}>
              <div className={styles.cardText}>
                <Icon d={ICONS.check} />
                <h3>Real Luau type checking</h3>
                <p>Errors while you type, hover docs for the whole Roblox API, autocomplete that knows your Explorer, Go to Definition, Find References and Rename across scripts.</p>
                <Link to="/docs/luau" className={styles.more}>How it works →</Link>
              </div>
              <img src={useBaseUrl("img/problems.png")} alt="A type error and the Problems panel" className={styles.cardShot} loading="lazy" />
            </div>
            <div className={styles.card}>
              <Icon d={ICONS.play} />
              <h3>Play tests in one click</h3>
              <p>Press Play and Studio comes to the front, with a floating Bloxcode window for Stop, errors and the Output. Click an error to open the line.</p>
              <div className={styles.playMock}><span className={styles.pPlay}>▶ Play</span><span>▷ Run</span><span className={styles.pErr}>ServerScriptService.Main:21</span></div>
            </div>
            <div className={styles.card}>
              <Icon d={ICONS.search} />
              <h3>Search & replace everything</h3>
              <p>Every script in the place at once, with regex, match case and a path filter. Replace All is one undo step.</p>
            </div>
            <div className={styles.card}>
              <Icon d={ICONS.history} />
              <h3>Script history</h3>
              <p>Every version of every script, who changed it, a side-by-side diff and one-click restore.</p>
            </div>
            <div className={styles.card}>
              <Icon d={ICONS.sliders} />
              <h3>Properties panel</h3>
              <p>Edit colors, sizes, text, attributes and tags of any object without leaving the editor.</p>
            </div>
            <div className={`${styles.card} ${styles.cardHalf}`}>
              <Icon d={ICONS.sparkle} />
              <h3>Themes you'll love</h3>
              <p>Eleven themes, any accent color, your favorite fonts. Or import a VS Code theme.</p>
              <div className={styles.swatches}>
                {THEMES.map(([name, editor, side, colors]) => (
                  <div key={name} className={styles.swatch} title={name}>
                    <div className={styles.swSide} style={{ background: side }} />
                    <div className={styles.swEd} style={{ background: editor }}>
                      {colors.map((c, i) => <i key={i} style={{ background: c, width: `${[55, 80, 42, 66][i]}%` }} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${styles.card} ${styles.cardHalf}`}>
              <Icon d={ICONS.github} />
              <h3>GitHub in one click</h3>
              <p>Create a repository and publish your scripts. Bloxcode shows what changed; the layout works with Rojo too.</p>
              <pre className={styles.tree}>{`src/
  ServerScriptService/
    Main.server.luau
  ReplicatedStorage/
    Shared/Util.luau
default.project.json`}</pre>
            </div>
          </div>
          <div className={styles.smallFeatures}>
            {SMALL_FEATURES.map(([icon, title, text]) => (
              <div key={title} className={styles.small}>
                <Icon d={ICONS[icon]} className={styles.smallIcon} />
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.split} ${styles.splitReverse}`}>
          <div className={styles.chat} aria-label="Example chat with Claude">
            <div className={styles.chatUser}>Add a coin system: coins spawn on the map and the count shows in the leaderboard.</div>
            <div className={styles.chatTools}>
              <span>get_explorer · scripts</span>
              <span>read_scripts · Main, DataService</span>
              <span>create_tree · Workspace.Coins</span>
              <span>create_instance · ServerScriptService.CoinSpawner</span>
              <span>get_diagnostics · no problems</span>
              <span>start_playtest · 15 s · 0 errors</span>
            </div>
            <div className={styles.chatClaude}>Done. Coins spawn every 5 seconds and add 1 to <code>leaderstats.Coins</code>. I ran a play test: no errors. Want a sound when a coin is collected?</div>
          </div>
          <div className={styles.splitText}>
            <span className={styles.eyebrow}>Claude</span>
            <h2>Build your game with Claude.</h2>
            <p>
              Chat with Claude right inside Bloxcode. It reads your game, writes the scripts, builds GUIs, runs play tests and fixes its own errors, while you watch every change.
            </p>
            <ul className={styles.checks}>
              <li>34 tools: play tests, run code, undo, type checks</li>
              <li>Review every change as a diff before it applies</li>
              <li>Every change is one undo step in Studio</li>
              <li>Your Claude plan, an API key, or Claude Desktop</li>
            </ul>
            <Link className={`${styles.btn} ${styles.btnGhost}`} to="/docs/claude" style={{ marginTop: 22 }}>
              How it works
            </Link>
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
              <li>Error counts next to every script</li>
              <li>"Select in Studio" jumps to the object</li>
              <li>Every change is one undo step in Studio</li>
            </ul>
          </div>
          <Window src={useBaseUrl("img/explorer.png")} alt="Context menu in the Bloxcode Explorer" className={styles.splitShot} />
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
          <div className={styles.shortcuts}>
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className={styles.shortcut}>
                <span className={styles.keys}>
                  {keys.map((k) => (
                    <kbd key={k}>{k === "Mod" ? mod : k}</kbd>
                  ))}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.ctaGlow} aria-hidden="true" />
          <img src={useBaseUrl("img/logo.png")} alt="" className={styles.ctaLogo} />
          <h2>Ready for better Roblox code?</h2>
          <p>Install, turn on Code Mode, done. Free, open source, and it keeps itself up to date.</p>
          <div className={styles.ctas}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href={main.href}>
              {DOWNLOAD_ICON}
              Download for {main.label}
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="https://github.com/Veitheim/bloxcode">
              {GITHUB_ICON}
              View source on GitHub
            </a>
          </div>
        </section>
      </main>
    </Layout>
  )
}
