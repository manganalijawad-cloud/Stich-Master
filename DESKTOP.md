# Hello Darzi Desktop

Windows desktop app for tailor shops. Business data stays in local SQLite (source of truth). Supabase is used for Auth, optional cloud backup/sync, and Storage.

## Deliver to users

### One-time setup

1. Copy `.env.example` → `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional: `SUPABASE_JWT_SECRET` (only if your project still issues HS256 tokens — prefer JWKS/ES256 and omit this for production installers)
2. Install deps: `npm install`
3. For GitHub Releases auto-update, ensure Actions secrets match the Auth keys above:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_JWT_SECRET` (optional — omit for JWKS-only)

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

**Releases ship unsigned for now** (Unknown publisher). Tell users: Windows SmartScreen → More info → Run anyway. Code signing can be added later when ready.

### Smoke-check before handing out builds

1. Install from `Hello-Darzi-Setup-*.exe` (or run `out/desktop/win-unpacked/Hello Darzi.exe`).
2. Sign in with a real invite-only Supabase Auth user (internet required once).
3. Create a customer + order, quit, reopen — data should persist.
4. Disconnect network. Keep using customers/orders after the access JWT would normally expire (~1h). App must keep working via the local device session.
5. Unlock Owner mode with the account password (offline). Confirm Settings → Backup shows automatic daily backups and “Open auto-backups folder” works. Confirm a `auto_*.json` file appears under `%AppData%\Hello Darzi\data\backups\` after the first daily run.
6. Confirm Settings → version / update check does not show a fake “downloading” state on background check.
7. Confirm the website download button resolves to the latest GitHub Release asset.

### Offline sessions & backups

- **First sign-in needs internet.** After that, a local device session (`hddev_…`, ~90-day sliding) keeps the shop usable without network.
- **Owner unlock** still uses the local password verifier (not cloud).
- **Daily auto-backups** write restore-compatible JSON under `%AppData%\Hello Darzi\data\backups\` (last 7 kept). Manual download/restore remains in Owner → Backup.
- **Cloud backup** (Owner → Cloud backup) mirrors SQLite to Supabase when online. Writes always hit SQLite first; pending changes sync on reconnect (last-write-wins on `updated_at`). Apply `supabase/migrations/20260731000000_cloud_sync.sql` once per project.
- Accounts stay **invite-only**; password help stays **WhatsApp**; **one PC / one shop account**.

### Notes

- Do not ship from the `Stich-Master-v1.0.0` worktree snapshot — use this repo root.
- Do not set `SUPABASE_JWT_SECRET` in production packaging unless you still mint HS256 tokens; JWKS verify is preferred.

## Repo Hygiene

- Run all release and maintenance commands from `D:/stichmaster/Stich-Master`.
- Keep parent `D:/stichmaster` as a local container only; do not treat it as the canonical repo.
- Before packaging, clear stale outputs with `npm run clean` so installers are built from a reproducible state.
- If `out/` cannot be fully removed on Windows, close any running packaged app/process that may lock `out/desktop/win-unpacked/resources/app.asar`, then run `npm run clean` again.
