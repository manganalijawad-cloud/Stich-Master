# Hello Darzi Desktop

Windows desktop app for tailor shops. Business data stays in local SQLite. Supabase is used for Auth only.

## Deliver to users

### One-time setup

1. Copy `.env.example` → `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional: `SUPABASE_JWT_SECRET` (only if your project still issues HS256 tokens)
2. Install deps: `npm install`
3. For GitHub Releases auto-update, ensure Actions secrets match the Auth keys above:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_JWT_SECRET` (optional)
   - Azure Trusted Signing secrets (see below) — without them, releases stay unsigned

### Build a local Windows installer

```bash
npm run clean
npm run electron:build
```

Output:

- Installer: `out/desktop/Hello-Darzi-Setup-<version>.exe` (creates a desktop shortcut)
- Unpacked smoke path: `out/desktop/win-unpacked/Hello Darzi.exe`
- Update metadata (when publishing): `out/desktop/latest.yml`

### Publish a release (users get updates via GitHub Releases)

1. Confirm **every** `package.json` version matches (root + `apps/desktop` are required by CI).
2. Commit packaging changes on `main`.
3. Tag and push the **same** version only (never retag an older `v*` while packages say a newer version):

```bash
git tag v1.0.3
git push origin v1.0.3
```

The `Build and Release` workflow builds the NSIS installer and publishes it to GitHub Releases. Installed apps check that channel via `electron-updater`.

**v1 ships unsigned** (Unknown publisher). Tell users: Windows SmartScreen → More info → Run anyway. Azure Trusted Signing can be enabled later when secrets + `electron-builder.azure.json` are ready.

### Smoke-check before handing out builds

1. Install from `Hello-Darzi-Setup-*.exe` (or run `release/win-unpacked/Hello Darzi.exe`).
2. Sign in with a real Supabase Auth user.
3. Create a customer + order, quit, reopen — data should persist.
4. Confirm Settings → version / update check does not error online.

### Windows code signing — Azure Trusted Signing (fixes “Unknown publisher”)

Hello Darzi uses **Microsoft Azure Trusted Signing** (also called Artifact Signing), ~$9.99/month. No `.pfx` file to manage; CI signs via cloud.

**Eligibility (Public Trust):** organizations in US/Canada/EU/UK and several other countries; **individuals only in US or Canada**. See [Microsoft’s quickstart](https://learn.microsoft.com/en-us/azure/trusted-signing/quickstart).

#### One-time Azure setup

1. Create an [Azure subscription](https://azure.microsoft.com/free/) if you don’t have one.
2. In the Azure portal → your subscription → **Resource providers** → register **`Microsoft.CodeSigning`**.
3. Create an **Artifact Signing / Trusted Signing** account in a supported region (e.g. East US → endpoint `https://eus.codesigning.azure.net/`).
4. Complete **Identity validation** (individual or organization). The approved legal name becomes the Windows publisher name.
5. Create a **Public Trust** certificate profile under that account.
6. Create an **App registration** (Entra ID):
   - Certificates & secrets → new **client secret**
   - Note **Application (client) ID**, **Directory (tenant) ID**, and the secret **Value**
7. Grant that app the role **Trusted Signing Certificate Profile Signer** on the Trusted Signing account (Access control / IAM).

#### GitHub Actions secrets

Add these on the repo (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_CLIENT_SECRET` | Client secret value |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | Region endpoint, e.g. `https://eus.codesigning.azure.net/` |
| `AZURE_CODE_SIGNING_ACCOUNT_NAME` | Trusted Signing **account** name (not the app registration name) |
| `AZURE_CERTIFICATE_PROFILE_NAME` | Certificate profile name |
| `AZURE_PUBLISHER_NAME` | Exact subject / CN from identity validation (what users will see as publisher) |

Tagged releases use `electron-builder.azure.json` when all of the above are set; otherwise they build unsigned.

#### Verify after a signed release

```powershell
Get-AuthenticodeSignature .\out\desktop\Hello-Darzi-Setup-*.exe
```

Status should be `Valid`. SignerCertificate should show your validated name — not blank / `NotSigned`.

Local `npm run electron:build` stays unsigned on purpose. For a local signed build, set the same env vars and run:

```bash
cd apps/desktop && npx electron-builder --win --x64 --config electron-builder.azure.json
```

### Notes

- First downloads may still get a SmartScreen warning until reputation builds; Azure Trusted Signing is OV-class, not instant EV trust.
- First sign-in needs internet; afterward Owner unlock can work offline with cached JWT verification.
- Do not ship from the `Stich-Master-v1.0.0` worktree snapshot — use this repo root.
