import React from "react"
import Layout from "@theme/Layout"
import Link from "@docusaurus/Link"
import styles from "./changelog.module.css"
import releases from "./_changelog.json"

// Release notes come from the app itself (app/renderer/changelog.js), copied by tools/sync-changelog.js.

const SECTION_ICON = { New: "✦", Claude: "◆", Fixed: "✓", Improved: "↑" }

function formatDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
}

export default function Changelog() {
  return (
    <Layout title="Changelog" description="Every Bloxcode release: new features, Claude updates and fixes.">
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.glow} aria-hidden="true" />
          <span className={styles.eyebrow}>Changelog</span>
          <h1>What's new in Bloxcode</h1>
          <p>Bloxcode updates itself on startup, so you always have the newest version. Here is everything that changed.</p>
          <div className={styles.heroLinks}>
            <a className={styles.btnPrimary} href="/download/windows">Download the latest version</a>
            <a className={styles.btnGhost} href="https://github.com/Veitheim/bloxcode/releases">Releases on GitHub</a>
          </div>
        </header>

        <ol className={styles.timeline}>
          {releases.map((r, i) => (
            <li key={r.version} className={styles.release} id={`v${r.version}`}>
              <div className={styles.dot} aria-hidden="true" />
              <div className={styles.meta}>
                <a href={`#v${r.version}`} className={styles.version}>v{r.version}</a>
                {i === 0 && <span className={styles.latest}>Latest</span>}
                <time className={styles.date} dateTime={r.date}>{formatDate(r.date)}</time>
              </div>
              <article className={styles.card}>
                <h2>{r.title}</h2>
                {r.intro && <p className={styles.intro}>{r.intro}</p>}
                {r.sections.map(([name, items]) => (
                  <section key={name} className={styles.section}>
                    <h3>
                      <span className={styles[`tag${name}`] || styles.tagNew}>{SECTION_ICON[name] || "•"} {name}</span>
                    </h3>
                    <ul>
                      {items.map((item, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                      ))}
                    </ul>
                  </section>
                ))}
                {/^[2-9]/.test(r.version) && <div className={styles.cardFoot}>
                  <a href={`https://github.com/Veitheim/bloxcode/releases/tag/v${r.version}`}>View on GitHub →</a>
                </div>}
              </article>
            </li>
          ))}
        </ol>

        <div className={styles.end}>
          <p>Missing something or found a bug?</p>
          <a href="https://github.com/Veitheim/bloxcode/issues/new">Tell us on GitHub</a> · <Link to="/docs/intro">Read the docs</Link>
        </div>
      </main>
    </Layout>
  )
}
