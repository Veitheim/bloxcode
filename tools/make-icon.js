// Renders build/logo.svg into the app icons and the website logo (with transparency).
// Usage: npm run icon   (runs this file with Electron)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'build', 'logo.svg'), 'utf8');

const OUTPUTS = [
  [1024, ['build/icon-mac.png']],
  [512, ['studio-plugin/.moonwave/static/img/logo.png']],
  [256, ['build/icon.png', 'app/icon.png']],
  [64, ['studio-plugin/.moonwave/static/img/favicon.png']],
];

function render(size) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
    win.webContents.setFrameRate(1);
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
    let done = false;
    win.webContents.on('paint', (_e, _dirty, image) => {
      if (done || image.getSize().width < size) return;
      done = true;
      const png = image.resize({ width: size, height: size, quality: 'best' }).toPNG();
      win.destroy();
      resolve(png);
    });
    win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  });
}

app.on('window-all-closed', () => {}); // keep running between icons
app.whenReady().then(async () => {
  for (const [size, files] of OUTPUTS) {
    const png = await render(size);
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), png);
      console.log(`${size}px → ${f}`);
    }
  }
  fs.copyFileSync(path.join(root, 'build', 'logo.svg'), path.join(root, 'studio-plugin', '.moonwave', 'static', 'img', 'logo.svg'));
  app.quit();
});
