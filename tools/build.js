// Builds the Windows installer and signs it when a code signing certificate is configured.
//
// Settings come from environment variables or from signing.json next to package.json
// (signing.json is git-ignored; never commit passwords). See SIGNING.md.
//
//   mode "none"   unsigned build (default)
//   mode "pfx"    certificate file (.pfx/.p12) + password
//   mode "store"  certificate in the Windows certificate store (Certum SimplySign, USB tokens)
//   mode "azure"  Microsoft Artifact Signing (formerly Trusted Signing)
//
// SignPath (free for open source) signs in GitHub Actions instead, see .github/workflows/release.yml.
//
// Usage: npm run dist

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const builder = require('electron-builder');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const settingsFile = path.join(root, 'signing.json');
const file = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
const setting = (key, env) => process.env[env] || file[key] || '';

const mode = (setting('mode', 'BLOXCODE_SIGN_MODE') || 'none').toLowerCase();
const timestamp = setting('timestampServer', 'BLOXCODE_SIGN_TIMESTAMP') || 'http://timestamp.digicert.com';

const config = JSON.parse(JSON.stringify(pkg.build));
config.win = { ...config.win };

function fail(msg) {
  console.error(`\n✖ Signing setup incomplete: ${msg}\n  See SIGNING.md.\n`);
  process.exit(1);
}

switch (mode) {
  case 'none':
    console.log('ℹ Signing: off. The installer is unsigned, so Windows SmartScreen shows a warning the first time.');
    break;
  case 'pfx': {
    const certificateFile = setting('certificateFile', 'BLOXCODE_SIGN_PFX');
    const certificatePassword = setting('certificatePassword', 'BLOXCODE_SIGN_PASSWORD');
    if (!certificateFile || !fs.existsSync(certificateFile)) fail('certificateFile (BLOXCODE_SIGN_PFX) is missing or does not exist.');
    config.win.signtoolOptions = { certificateFile: path.resolve(certificateFile), certificatePassword, signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: timestamp };
    console.log(`🔏 Signing with certificate file ${path.basename(certificateFile)}`);
    break;
  }
  case 'store': {
    const certificateSha1 = setting('certificateSha1', 'BLOXCODE_SIGN_SHA1').replace(/\s/g, '');
    const certificateSubjectName = setting('certificateSubjectName', 'BLOXCODE_SIGN_SUBJECT');
    if (!certificateSha1 && !certificateSubjectName) fail('set certificateSha1 (thumbprint) or certificateSubjectName.');
    config.win.signtoolOptions = { ...(certificateSha1 ? { certificateSha1 } : { certificateSubjectName }), signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: timestamp };
    console.log(`🔏 Signing with a certificate from the Windows store (${certificateSha1 || certificateSubjectName})`);
    break;
  }
  case 'azure': {
    const endpoint = setting('endpoint', 'BLOXCODE_SIGN_ENDPOINT');
    const codeSigningAccountName = setting('accountName', 'BLOXCODE_SIGN_ACCOUNT');
    const certificateProfileName = setting('certificateProfile', 'BLOXCODE_SIGN_PROFILE');
    if (!endpoint || !codeSigningAccountName || !certificateProfileName) fail('endpoint, accountName and certificateProfile are required.');
    for (const v of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) if (!process.env[v]) fail(`environment variable ${v} is not set.`);
    config.win.azureSignOptions = { endpoint, codeSigningAccountName, certificateProfileName };
    console.log(`🔏 Signing with Microsoft Artifact Signing (${codeSigningAccountName}/${certificateProfileName})`);
    break;
  }
  default:
    fail(`unknown mode "${mode}". Use none, pfx, store or azure.`);
}

builder.build({ targets: builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64), config, publish: 'never' })
  .then((files) => {
    for (const f of files.filter((x) => x.endsWith('.exe'))) {
      console.log(`\n📦 ${f}`);
      if (mode === 'none') continue;
      try {
        const out = execFileSync('powershell', ['-NoProfile', '-Command', `$s = Get-AuthenticodeSignature '${f.replace(/'/g, "''")}'; "Signature: " + $s.Status; "Signed by: " + $s.SignerCertificate.Subject`], { encoding: 'utf8' });
        console.log(out.trim().split('\n').map((l) => '   ' + l.trim()).join('\n'));
      } catch (_) { /* not on Windows */ }
    }
  })
  .catch((err) => { console.error(err); process.exit(1); });
