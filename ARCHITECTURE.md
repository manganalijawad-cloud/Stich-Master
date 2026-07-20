# Hello Darzi — Architecture

## Monorepo Structure

```
hello-darzi/
├── packages/                    # Shared libraries (reusable across platforms)
│   ├── shared/                  # @hello-darzi/shared
│   │   └── src/
│   │       ├── types.ts         # TypeScript interfaces (Customer, Order, etc.)
│   │       └── index.ts         # Re-exports
│   └── server/                  # @hello-darzi/server — Express API + DB + Sync
│       ├── src/
│       │   ├── index.ts         # Express app, all API routes, startServer
│       │   ├── db.ts            # SQLite database layer (Electron offline mode)
│       │   ├── sync.ts          # Bidirectional sync engine (SQLite ↔ Supabase)
│       │   └── api-entry.ts     # Vercel serverless function entry
│       └── scripts/
│           ├── build.mjs        # esbuild configuration for server bundle
│           └── bundle-config.cjs# Generates config/production.json for Electron
├── apps/                        # Platform-specific applications
│   ├── web/                     # @hello-darzi/web — React SPA (Vite)
│   │   ├── src/
│   │   │   ├── components/      # React UI components
│   │   │   │   ├── admin/       # Admin panel components
│   │   │   │   ├── CustomersSection.tsx
│   │   │   │   ├── OrdersSection.tsx
│   │   │   │   ├── OwnerDashboard.tsx
│   │   │   │   ├── FinancialReports.tsx
│   │   │   │   ├── GarmentConfiguration.tsx
│   │   │   │   ├── DataImport.tsx
│   │   │   │   ├── LoginScreen.tsx
│   │   │   │   └── SyncIndicator.tsx
│   │   │   ├── App.tsx          # Root React component
│   │   │   ├── main.tsx         # React entry point
│   │   │   ├── index.css        # Tailwind v4 + design system
│   │   │   ├── types.ts         # Re-exports from @hello-darzi/shared
│   │   │   └── lib/
│   │   │       └── supabase.ts  # Web platform Supabase client (VITE_* env vars)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── public/              # Static assets (favicons, icons, manifest)
│   ├── desktop/                 # @hello-darzi/desktop — Electron wrapper
│   │   ├── electron/
│   │   │   ├── main.cjs         # Electron main process
│   │   │   └── preload.cjs      # Context bridge (exposes safe APIs)
│   │   └── package.json         # Electron-builder config
│   └── mobile/                  # @hello-darzi/mobile — Future mobile app
├── scripts/                     # Root-level build and deploy scripts
│   ├── build-api.mjs            # Vercel serverless API build
│   ├── bundle-config.cjs        # Electron production config generator
│   ├── deploy-vercel.ps1        # Vercel deployment automation
│   └── env-to-vercel.ps1        # Env var sync for Vercel
├── .github/workflows/           # CI/CD
│   └── release.yml              # GitHub Actions — Electron build + release
├── server.ts                    # Shim — re-exports from @hello-darzi/server
├── package.json                 # Workspace root
├── tsconfig.base.json           # Shared TypeScript config
├── vercel.json                  # Vercel deployment configuration
├── schema.sql                   # Supabase database schema reference
└── .env.example                 # Environment variable documentation
```

## Development Workflow

### Quick Start

```bash
# Install all dependencies (workspace-aware)
npm install

# Run the full stack (server + web app concurrently)
npm run dev
```

### Individual Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express server (Vite middleware) + web app |
| `npm run dev:server` | Start Express server only (serves API + Vite frontend) |
| `npm run dev:web` | Start web app Vite dev server (standalone, proxies API) |
| `npm run dev:desktop` | Start Express server + Electron (loads localhost) |
| `npm run build` | Build web app for production (outputs to root `dist/`) |
| `npm run build:server` | Build server bundle for Electron (`dist/server.cjs`) |
| `npm run build:all` | Build both web app and server |
| `npm run electron:build` | Full Electron build (build all + bundle config + package) |
| `npm run start` | Start production server (requires `dist/`) |
| `npm run lint` | Run TypeScript type checking |

### Web Development

```bash
# Terminal 1: Start the Express API server
npm run dev:server

# Terminal 2: Start the web app dev server (proxies /api/ -> localhost:3000)
npm run dev:web
```

### Desktop Development

```bash
# Starts Express server, waits for it, then launches Electron
npm run dev:desktop
```

### Environment Variables

Each platform uses different environment variable conventions:

- **Web app** (`apps/web/`): Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Vite convention — prefixed with `VITE_`)
- **Desktop** (`apps/desktop/`): Uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (injected by `config/production.json` at build time)
- **Server** (`packages/server/`): Uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `process.env`

## Production Build

### Web (Vercel)

The web app is deployed to Vercel as a serverless function. The workflow:
1. `npm run build` — Vite builds the React app to `dist/`
2. `npm run build:api` — esbuild bundles `packages/server/src/api-entry.ts` to `api/index.cjs`
3. Vercel serves static files from `dist/` and routes `/api/*` to `api/index.cjs`

### Desktop (Electron)

The Electron app packages everything into a standalone executable:
1. `npm run build` — Vite builds the React app to `dist/`
2. `npm run build:server` — esbuild bundles the Express server to `dist/server.cjs`
3. `node scripts/bundle-config.cjs` — Generates `config/production.json` from environment variables
4. `electron-builder --win --x64` — Packages everything into a Windows NSIS installer

The packaged Electron app:
- Starts the bundled Express server internally
- Loads the built frontend from `localhost:PORT`
- Connects only to Supabase over the internet
- Does **not** require Node.js or a browser installed on the user's machine

## Adding New Shared Code

### Guidelines

1. **Business logic** that is shared between platforms goes in `packages/shared/src/`
2. **Types and interfaces** that represent your domain model go in `packages/shared/src/types.ts`
3. **Platform-specific code** stays inside the respective `apps/*` folder
4. **Server-only code** stays in `packages/server/src/`

### Example: Adding a new shared utility

```typescript
// packages/shared/src/formatting.ts
export function formatCurrency(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}

// packages/shared/src/index.ts
export { formatCurrency } from './formatting';
```

### Importing from the shared package

```typescript
// In apps/web/src/components/Foo.tsx or packages/server/src/bar.ts
import type { Customer, Order } from '@hello-darzi/shared';
import { formatCurrency } from '@hello-darzi/shared';
```

## Platform Separation

| Concern | Web (`apps/web`) | Desktop (`apps/desktop`) | Mobile (`apps/mobile`) |
|---------|------------------|------------------------|----------------------|
| UI Framework | React 19 + Tailwind v4 | React 19 + Tailwind v4 (via built web app) | TBD |
| Runtime | Browser | Electron + embedded Node.js | TBD |
| API | Supabase (online) | SQLite + Supabase sync | TBD |
| State Management | React useState | React useState | TBD |
| Build | Vite | Vite + esbuild + electron-builder | TBD |
| Environment | `VITE_*` env vars | `SUPABASE_*` env vars (bundled) | TBD |

## Key Architectural Decisions

1. **Server as shared infrastructure**: The Express server (`packages/server`) serves both the web app (deployed on Vercel) and the desktop app (bundled into the executable). It provides the REST API and, in Electron mode, manages the local SQLite database and sync engine.

2. **Dual database mode**: In web mode, the app connects directly to Supabase. In Electron/offline mode, `better-sqlite3` provides local storage with a bidirectional sync engine that reconciles with Supabase.

3. **Schema compatibility proxy**: The server uses a JavaScript `Proxy` to gracefully handle missing columns or tables in the Supabase schema, allowing the app to work with incomplete migrations.

4. **Prefix-based multi-tenancy**: Shop settings are stored with `userId:key` prefixes to isolate tenant data without full multi-tenant schema support.

5. **Single build output**: Both web and desktop builds output to the root `dist/` directory, which contains the Vite-built frontend and the esbuild-bundled server. The Electron builder references this directory and the `config/` directory for packaging.
