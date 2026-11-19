// Copies the release notes from the app (app/renderer/changelog.js) to the website, so both show the same.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app', 'renderer', 'changelog.js'), 'utf8');
const ctx = {};
vm.runInNewContext(src + '\nthis.CHANGELOG = CHANGELOG;', ctx);
fs.writeFileSync(path.join(root, 'studio-plugin', 'pages', '_changelog.json'), JSON.stringify(ctx.CHANGELOG, null, 2) + '\n');
console.log(`Changelog: ${ctx.CHANGELOG.length} releases synced to the website.`);
