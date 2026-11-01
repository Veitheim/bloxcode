// Moonwave builds GitHub "edit" and "source" links relative to the docs folder,
// but in this repo the docs live in studio-plugin/. Patch the built site so the links work.
const fs = require('fs');
const path = require('path');

const repo = 'github.com/Veitheim/bloxcode';
const buildDir = path.join(__dirname, '..', 'studio-plugin', 'build');
const fixes = [
  [`${repo}/blob/main/src/`, `${repo}/blob/main/studio-plugin/src/`],
  [`${repo}/edit/main/docs/`, `${repo}/edit/main/studio-plugin/docs/`],
];

let changed = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(html|js|json)$/.test(entry.name)) continue;
    let text = fs.readFileSync(full, 'utf8');
    let next = text;
    for (const [from, to] of fixes) next = next.split(from).join(to);
    if (next !== text) { fs.writeFileSync(full, next); changed++; }
  }
})(buildDir);
console.log(`Fixed GitHub links in ${changed} files.`);
