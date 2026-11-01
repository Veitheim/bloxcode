// Publishes a new Bloxcode version:
//   1. builds the installer (electron-builder)
//   2. uploads the installer + latest.yml to the R2 bucket that the website serves at /updates
//
// Bump "version" in package.json first, then run: npm run release
// Installed copies pick up the new version on their next start.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUCKET = 'bloxcode-releases';
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function upload(file, contentType) {
  const full = path.join(dist, file);
  if (!fs.existsSync(full)) throw new Error(`Missing build output: ${file}`);
  run(`npx --yes wrangler@4 r2 object put "${BUCKET}/${file}" --file "${full}" --content-type "${contentType}" --remote`);
}

if (!process.argv.includes('--skip-build')) run('npx electron-builder --win nsis');

const installer = `Bloxcode-Setup-${pkg.version}.exe`;
upload(installer, 'application/octet-stream');
upload(`${installer}.blockmap`, 'application/octet-stream');
// latest.yml goes last: once it's there, clients start updating.
upload('latest.yml', 'text/yaml');

console.log(`\nPublished Bloxcode v${pkg.version}.`);
console.log('Download: https://bloxcode-docs.seidl.workers.dev/download');
