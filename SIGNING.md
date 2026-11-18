# Signing Bloxcode (against the SmartScreen warning)

Windows shows "Windows protected your PC" for installers that are not signed with a code signing
certificate. Bloxcode is ready for signing: once a certificate is set up, every build is signed
automatically. Until then the installer works the same, people just click **More info → Run anyway** once.

Even with a certificate, Windows can still warn for a brand-new app until enough people have
downloaded the signed file (reputation). The reputation belongs to the certificate, not the version.

## Option 1: SignPath Foundation (free for open source)

Bloxcode is open source (MIT, public on GitHub), so it can apply for a free certificate from the
[SignPath Foundation](https://signpath.org). The installer is then built and signed by GitHub Actions,
which proves the file was built from this repository.

1. Apply at [signpath.org](https://signpath.org) with the repository `Veitheim/bloxcode`.
2. In SignPath, create the project `bloxcode` with the signing policy `release-signing` and the
   artifact configuration `installer` (a single `.exe`, Authenticode).
3. In the GitHub repository settings:
   - **Variables → Actions:** `SIGNPATH_ORGANIZATION_ID` = your SignPath organization id
   - **Secrets → Actions:** `SIGNPATH_API_TOKEN` = an API token of a SignPath CI user
4. Push a version tag (`git tag v2.0.1 && git push --tags`). The workflow in
   `.github/workflows/release.yml` builds, signs and publishes the GitHub Release.

SignPath requires a code signing policy on the website and the line
"Free code signing provided by SignPath.io, certificate by SignPath Foundation" in the docs.

## Option 2: Your own certificate

| Way | For | Cost (approx.) |
| --- | --- | --- |
| Certum Open Source Code Signing (cloud, "SimplySign") | individuals with an open source project | about €70 per year |
| Certum Standard, Sectigo, SSL.com | individuals and companies | about €150–300 per year |
| Microsoft Artifact Signing | companies in the EU; individuals only in the US/Canada | about $10 per month |

Copy `signing.example.json` to `signing.json` (it is git-ignored) and fill in one mode:

- `store` for Certum SimplySign or a USB token. Find the thumbprint with
  `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Format-List Subject, Thumbprint`.
- `pfx` for a certificate file.
- `azure` for Microsoft Artifact Signing (plus `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).

Environment variables work too: `BLOXCODE_SIGN_MODE`, `BLOXCODE_SIGN_PFX`, `BLOXCODE_SIGN_PASSWORD`,
`BLOXCODE_SIGN_SHA1`, `BLOXCODE_SIGN_SUBJECT`, `BLOXCODE_SIGN_ENDPOINT`, `BLOXCODE_SIGN_ACCOUNT`,
`BLOXCODE_SIGN_PROFILE`, `BLOXCODE_SIGN_TIMESTAMP`.

Then `npm run dist` (or `npm run release`) signs the installer and prints whether the signature is valid.
