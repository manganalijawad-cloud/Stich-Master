# Hello Darzi

Offline-first desktop app for tailor shops (Windows).

- **Desktop delivery:** see [DESKTOP.md](./DESKTOP.md)
- **Dev:** `npm install` → configure `.env` from `.env.example` → `npm run dev:desktop`

## Maintenance Guardrails

- Use `D:/stichmaster/Stich-Master` as the only canonical Git repository root.
- Treat `D:/stichmaster` as a local container folder; run `git`, `npm`, and build commands from this repo root.
- Generated artifacts (`dist/`, `out/`, `release/`, `node_modules/`) are local build outputs and should not be committed.
- Keep secrets in local env/config only (`.env`, `config/desktop.env`) and never commit runtime credentials.
