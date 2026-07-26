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

### Build a local Windows installer

```bash
npm run clean
npm run electron:build
```

Output:

- Installer: `out/desktop/Hello-Darzi-Setup-1.0.3.exe`
- Unpacked smoke path: `out/desktop/win-unpacked/Hello Darzi.exe`
- Update metadata (when publishing): `out/desktop/latest.yml`

### Publish a release (users get auto-updates)

1. Confirm `apps/desktop/package.json` version (source of truth for the installer).
2. Commit packaging changes.
3. Tag and push:

```bash
git tag v1.0.3
git push origin v1.0.3
```

The `Build and Release` workflow builds the NSIS installer and publishes it to GitHub Releases. Installed apps check that channel via `electron-updater`.

### Smoke-check before handing out builds

1. Install from `Hello-Darzi-Setup-*.exe` (or run `release/win-unpacked/Hello Darzi.exe`).
2. Sign in with a real Supabase Auth user.
3. Create a customer + order, quit, reopen — data should persist.
4. Confirm Settings → version / update check does not error online.

### Notes

- Unsigned builds will show Windows SmartScreen warnings until Authenticode signing is configured.
- First sign-in needs internet; afterward Owner unlock can work offline with cached JWT verification.
- Do not ship from the `Stich-Master-v1.0.0` worktree snapshot — use this repo root.
