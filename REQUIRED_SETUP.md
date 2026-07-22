# Hello Darzi — Complete Authentication Setup Guide

This document walks you through **every step** required to configure "Continue with Google" authentication for both the website (hellodarzi.shop) and the desktop app (Hello Darzi for Windows).

---

## Table of Contents

1. [Supabase Dashboard Setup](#1-supabase-dashboard-setup)
2. [Google Cloud Console Setup](#2-google-cloud-console-setup)
3. [Environment Variables](#3-environment-variables)
4. [Desktop App Custom Protocol](#4-desktop-app-custom-protocol)
5. [Vercel Deployment (Website)](#5-vercel-deployment-website)
6. [Build & Test the Desktop App](#6-build--test-the-desktop-app)
7. [Testing Checklist](#7-testing-checklist)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Supabase Dashboard Setup

### Step 1.1 — Go to Supabase Project

1. Open your browser and go to: **https://supabase.com/dashboard**
2. Sign in with your account.
3. Click on your project: **vecwyofzniisruyxnzwe** (the one already configured in `.env`)

### Step 1.2 — Navigate to Auth Providers

1. In the left sidebar, click **Authentication**.
2. Click the **Providers** tab (or **Settings** → **Auth Providers** depending on your Supabase version).

### Step 1.3 — Enable Google Provider

1. Find **Google** in the list of providers.
2. Click the toggle switch to **Enable** it.
3. You will see three fields:
   - **Client ID** (required)
   - **Client Secret** (required)
   - **Redirect URL** (auto-generated, read-only)

### Step 1.4 — Copy the Redirect URL

Copy the **Redirect URL** that Supabase shows you. It looks like:

```
https://vecwyofzniisruyxnzwe.supabase.co/auth/v1/callback
```

Save this somewhere — you will need it in the Google Cloud Console setup.

### Step 1.5 — Leave Supabase Open

Do not close the Supabase dashboard yet. You will come back here to paste the Google Client ID and Secret after creating them in Google Cloud.

---

## 2. Google Cloud Console Setup

### Step 2.1 — Create or Select a Project

1. Open your browser and go to: **https://console.cloud.google.com/apis/credentials**
2. Sign in with the Google account that will own the OAuth configuration.
3. At the top of the page, click the project dropdown (it might say "Select a project" or show a current project name).
4. Click **New Project** (or select an existing project).
5. Enter a project name: **Hello Darzi**
6. Click **Create**.

### Step 2.2 — Configure OAuth Consent Screen

1. In the left sidebar, click **OAuth consent screen**.
2. Select **External** (required because your users are not in a Google Workspace organization).
3. Click **Create**.

#### Fill in the consent screen form:

| Field | Value |
|-------|-------|
| **App name** | `Hello Darzi` |
| **User support email** | Your email address (the same one you use for Google Cloud) |
| **Logo** | (optional) You can upload the favicon from `public/favicon.svg` |
| **Application home page** | `https://hellodarzi.shop` |
| **Application privacy policy link** | `https://hellodarzi.shop/privacy.html` |
| **Application terms of service link** | `https://hellodarzi.shop/terms.html` |
| **Authorized domains** | `hellodarzi.shop`, `supabase.co` |
| **Developer contact information** | Your email address |

4. Click **Save and Continue**.

### Step 2.3 — Configure Scopes

1. On the "Scopes" page, click **Add or Remove Scopes**.
2. Select the following scopes:
   - `.../auth/userinfo.email` — See your primary Google Account email address
   - `.../auth/userinfo.profile` — See your personal info, including any personal info you've made publicly available
   - `openid` — Associate you with your personal info on Google
3. Click **Update**.
4. Click **Save and Continue**.

### Step 2.4 — Add Test Users

1. On the "Test users" page, click **Add Users**.
2. Enter your own email address (the one you use for testing).
3. If other people need to test, add their emails too.
4. Click **Save and Continue**.
5. Review the summary page and click **Back to Dashboard**.

> **Note**: Until you publish the app (move to "In production" status), only test users can sign in. This is fine for development. You can publish later when ready.

### Step 2.5 — Create OAuth Client ID for the Website

1. In the left sidebar, click **Credentials**.
2. At the top, click **Create Credentials** → **OAuth client ID**.
3. For **Application type**, select **Web application**.
4. Enter a **Name**: `Hello Darzi Website`

#### Authorized JavaScript Origins

Click **Add URI** and enter each of these:

| Priority | URI | Purpose |
|----------|-----|---------|
| 1 | `http://localhost:3000` | Local development (website dev server) |
| 2 | `http://localhost:5173` | Local development (Vite dev server alternative) |
| 3 | `https://hellodarzi.shop` | Production website |
| 4 | `https://*.vercel.app` | Vercel preview deployments |

#### Authorized Redirect URIs

Click **Add URI** and enter each of these:

| Priority | URI | Purpose |
|----------|-----|---------|
| 1 | `http://localhost:3000/auth/callback` | Local dev callback |
| 2 | `http://localhost:5173/auth/callback` | Local dev callback (alt port) |
| 3 | `https://hellodarzi.shop/auth/callback` | Production callback |
| 4 | `https://*.vercel.app/auth/callback` | Vercel preview callback |
| 5 | `https://vecwyofzniisruyxnzwe.supabase.co/auth/v1/callback` | **Supabase's own callback URL** (the one you copied in Step 1.4) |

> **Why is #5 required?** When Supabase handles the Google OAuth flow, Google redirects to Supabase's callback URL first, then Supabase redirects to your app. Google must authorize this intermediate redirect.

5. Click **Create**.

6. **A dialog will appear showing your Client ID and Client Secret.**

```
╔══════════════════════════════════════════════════════╗
║  OAuth client created                               ║
║                                                     ║
║  Client ID: 920307547914-xxx.apps.googleusercontent.com ║
║  Client Secret: GOCSPX-xxxxx                       ║
║                                                     ║
║  [Download JSON]  [Copy Client ID]  [Done]          ║
╚══════════════════════════════════════════════════════╝
```

7. **Copy the Client ID** and **Client Secret** immediately. Store them temporarily (you will paste them into Supabase).

### Step 2.6 — No Desktop OAuth Client Needed

**You do NOT need a separate OAuth client for the desktop app.** Here's why:

```
┌──────────────┐     Google OAuth      ┌──────────────┐    redirect_to=     ┌──────────────┐
│   Browser    │ ◄──────────────────►  │   Supabase   │  hellodarzi://...  │ Desktop App  │
│  (User)      │                       │   Auth       │ ─────────────────► │ (Deep Link)  │
└──────────────┘                       └──────────────┘                    └──────────────┘
```

Google only ever talks to Supabase's callback URL (e.g., `https://{project}.supabase.co/auth/v1/callback`). That URL is already added as a redirect URI in the **Web client** (step 2.5, item #5). 

The `hellodarzi://auth/callback` value is just a **Supabase `redirect_to` parameter** — it tells Supabase where to send the browser after Supabase finishes processing the auth. Google never sees this URL. No Google Cloud Console configuration is needed for it.

> **If you already created a Desktop client**, you can delete it. It's not used anywhere in the code. The `.env` file's `DESKTOP_CLIENT` variable is informational only — the code never reads it.

---

## 3. Complete Supabase Google Provider Configuration

Now go back to your **Supabase Dashboard** (from Step 1).

1. Navigate to **Authentication** → **Providers** → **Google**.
2. Fill in the fields:

| Field | Value |
|-------|-------|
| **Client ID** | Paste the **Web** Client ID (from Step 2.5) |
| **Client Secret** | Paste the **Web** Client Secret (from Step 2.5) |

3. Click **Save**.

---

## 4. Update `.env` File

Open `.env` in the project root. It should already have the Supabase values. Verify they are correct:

```env
SUPABASE_URL="https://vecwyofzniisruyxnzwe.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://vecwyofzniisruyxnzwe.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
WEB_CLIENT="920307547914-ssurqh0app5o1sgo9os128d8shudotdl.apps.googleusercontent.com"
DESKTOP_CLIENT="920307547914-7qev5mcd1volbg34hug0q8m5q7vdm421.apps.googleusercontent.com"
```

> **Important**: The Google Client IDs are already in your `.env` because the previous developer set them up. If you created new ones in the steps above, update these values. Also, the Supabase keys shown above are your real keys — keep them secret and never commit them to git.

---

## 5. Desktop App — Custom Protocol (hellodarzi://)

### How It Works

The desktop app registers the `hellodarzi://` protocol with Windows during installation.

#### For Development

During development (`npm run dev:desktop`), the protocol registration works automatically because `main.cjs` calls `app.setAsDefaultProtocolClient()` at startup.

However, for development on Windows, you may need to:

1. **Run PowerShell as Administrator** once to ensure the protocol is registered:
   ```powershell
   # From the project root
   & "node_modules\.bin\electron.cmd" apps\desktop\electron\main.cjs
   ```
   Or just run `npm run dev:desktop` and the app will register itself.

2. **If the protocol still doesn't work in dev**, manually add the registry key:
   ```powershell
   # Run as Administrator
   New-Item -Path "HKLM:\SOFTWARE\Classes\hellodarzi" -Force
   New-ItemProperty -Path "HKLM:\SOFTWARE\Classes\hellodarzi" -Name "URL Protocol" -Value "" -PropertyType String -Force
   New-Item -Path "HKLM:\SOFTWARE\Classes\hellodarzi\shell\open\command" -Force
   Set-ItemProperty -Path "HKLM:\SOFTWARE\Classes\hellodarzi\shell\open\command" -Name "(Default)" -Value "`"C:\path\to\electron.exe`" `"%1`""
   ```

#### For Production (Installer)

The NSIS installer created by `npm run electron:build` will automatically register the protocol because the `protocols` field is configured in `apps/desktop/electron-builder.json`:

```json
"protocols": {
  "name": "Hello Darzi",
  "schemes": ["hellodarzi"]
}
```

After installing the app, Windows will recognize `hellodarzi://` links and open them in Hello Darzi.

#### How the OAuth Flow Uses the Protocol

1. User clicks "Continue with Google" in the desktop app.
2. App constructs a Supabase authorization URL with `redirect_to=hellodarzi://auth/callback`.
3. App opens the user's **default system browser** (Chrome, Edge, etc.).
4. User sees the Google sign-in page in their browser.
5. User authenticates with Google.
6. Google redirects to Supabase's callback URL.
7. Supabase processes the auth and redirects the browser to `hellodarzi://auth/callback#access_token=xxx`.
8. The browser sees the `hellodarzi://` protocol and asks the OS to handle it.
9. Windows launches (or brings to front) the Hello Darzi app and passes the URL.
10. Hello Darzi captures the URL, extracts the tokens, and sets the session.

---

## 6. Vercel Deployment (Website)

### Step 6.1 — Set Environment Variables in Vercel

1. Go to **https://vercel.com** and open your project (hellodarzi.shop).
2. Go to **Settings** → **Environment Variables**.
3. Add these variables:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://vecwyofzniisruyxnzwe.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | All |
| `SUPABASE_URL` | `https://vecwyofzniisruyxnzwe.supabase.co` | All |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | All |

### Step 6.2 — Deploy

The `vercel.json` build command is already configured:

```json
"buildCommand": "node build.mjs"
```

This script (at `apps/website/build.mjs`) reads the environment variables and injects them into `apps/website/env.js`.

1. Push your code to GitHub (or the connected Git repository).
2. Vercel will automatically deploy.
3. Verify the deployment by visiting: `https://hellodarzi.shop/auth.html`

### Step 6.3 — Verify Website Auth

1. Open `https://hellodarzi.shop/auth.html` (or your local dev server).
2. You should see the "Continue with Google" button.
3. Click it.
4. You will be redirected to Google's sign-in page (if not signed into Google already).
5. After signing in, you will be redirected back to `/auth/callback`, then to `/auth.html?success=true`.
6. The page should show "Signed in" with your email.

---

## 7. Build & Test the Desktop App

### Step 7.1 — Build the Desktop App

```bash
# From the project root
npm run electron:build
```

This will:
1. Build the React UI with Vite
2. Bundle the Express server with esbuild
3. Generate `config/production.json` from `.env`
4. Package everything into a Windows NSIS installer
5. Output the installer to `release/Hello-Darzi-Setup-{version}.exe`

### Step 7.2 — Install the Desktop App

1. Run the installer from `release/`.
2. Follow the installation wizard.
3. The protocol `hellodarzi://` is registered during installation.

### Step 7.3 — Test Google Sign-In

1. Open Hello Darzi from the Start Menu or desktop shortcut.
2. On the login screen, click **"Continue with Google"**.
3. Your default browser will open to the Google sign-in page.
4. Sign in with your Google account.
5. After successful authentication, the browser will try to open `hellodarzi://auth/callback#...`.
6. Windows will prompt "How do you want to open this?" — select **Hello Darzi** (you can check "Always use this app").
7. The Hello Darzi app should come to the foreground and show the main dashboard.

> **First time only**: If this is your first Google sign-in, you will be asked to complete your profile (shop name, etc.). Fill in the details and click "Complete Setup".

---

## 8. Testing Checklist

### Prerequisites
- [ ] Google Cloud Console project exists with OAuth consent screen configured
- [ ] Web OAuth client ID created with all redirect URIs
- [ ] Desktop OAuth client ID created with `hellodarzi://auth/callback`
- [ ] Supabase Google provider enabled with Web client ID/secret
- [ ] Supabase Redirect URL added to Google Cloud Web client's redirect URIs
- [ ] Environment variables set in `.env` and Vercel

### Website Tests (http://localhost:3000 and hellodarzi.shop)
- [ ] `/auth.html` loads correctly
- [ ] "Continue with Google" button is visible and styled
- [ ] Clicking "Continue with Google" redirects to accounts.google.com
- [ ] After Google sign-in, redirects back to `/auth/callback`
- [ ] Shows "Signed in" state with email
- [ ] "Sign out" button works
- [ ] Email/password sign in works
- [ ] Refreshing the page preserves the session
- [ ] "Forgot password" flow works
- [ ] Works on both localhost and Vercel deployment

### Desktop Tests
- [ ] `hellodarzi://` protocol registered (check Windows Settings → Apps → Default Apps → Choose defaults by protocol)
- [ ] Login screen shows "Continue with Google" button
- [ ] Clicking button opens system browser (not an embedded window)
- [ ] After sign-in, browser redirects to `hellodarzi://auth/callback#...`
- [ ] App receives the callback and sets the session
- [ ] Dashboard loads after successful auth
- [ ] Restarting app restores the session
- [ ] Sign out clears the session
- [ ] Email/password sign in still works

### Cross-Platform Tests
- [ ] Sign up on website → sign in on desktop (same Google account)
- [ ] Sign up on desktop → sign in on website (same Google account)
- [ ] All data is accessible from both platforms

---

## 9. Troubleshooting

### "redirect_uri_mismatch" Error

This is the most common error. It means the redirect URI in the auth request doesn't match any URI in your Google Cloud Console.

**Fix**: Compare these three things:
1. The `redirect_to` parameter in the auth URL (check browser address bar when redirected)
2. The URIs listed in Google Cloud Console → Credentials → Web Client → Authorized redirect URIs
3. The Supabase Redirect URL (in Supabase → Authentication → Providers → Google)

All three must match exactly. Remember that `localhost:3000` and `localhost:5173` are different.

### "Access blocked: Authorization Error"

Google is blocking the app because it's in "Testing" mode.

**Fix**: Add the test user's email in Google Cloud Console → OAuth consent screen → Test users. Or publish the app.

### Desktop: "Failed to open browser"

The app could not open the system browser.

**Fix**: Check your default browser settings in Windows. Make sure a default browser is set.

### Desktop: Deep link doesn't open the app

Windows doesn't recognize `hellodarzi://`.

**Fix**: 
1. Make sure the app was installed via the NSIS installer (not running from source for this test).
2. Check Windows Settings → Apps → Default Apps → Choose defaults by protocol → Search for "hellodarzi".
3. If not listed, re-run the installer, or manually associate:
   - Run `regedit`
   - Navigate to `HKEY_CLASSES_ROOT\hellodarzi`
   - Ensure the `URL Protocol` value exists and the `shell\open\command` default value points to your app

### Desktop: Session not restored after restart

The Supabase session is stored in the browser's localStorage (in Electron's renderer process). On app restart, the `AuthContext.restoreSession()` function checks for an existing session.

**Fix**: Make sure `supabase.auth.persistSession` is `true` (it is, in `lib/supabase.ts`). Also check that `localStorage` is not being cleared.

### Website: "Invalid configuration" error

`auth.js` can't find the Supabase URL or Anon Key.

**Fix**: 
1. For local dev: Make sure `apps/website/env.js` exists and contains the correct values. Or set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your shell environment.
2. For Vercel: Verify the environment variables are set in Vercel project settings. Re-deploy after setting them.

### 401 Unauthorized when calling Supabase

The session token is expired or invalid.

**Fix**: Sign out and sign in again. The `autoRefreshToken: true` setting in the Supabase client should handle token refresh automatically.

---

## Appendix A: File Reference

### Desktop App — OAuth Flow Files

| File | Purpose |
|------|---------|
| `apps/desktop/electron/main.cjs` | Protocol registration, deep link handling, IPC for OAuth |
| `apps/desktop/electron/preload.cjs` | Exposes `electronAPI.oauthStart()`, `oauthParseCallback()`, `onOAuthCallback()` to renderer |
| `apps/desktop/ui/src/lib/auth.ts` | `signInWithGoogleDesktop()` — orchestrates the OAuth flow |
| `apps/desktop/ui/src/contexts/AuthContext.tsx` | Session persistence, auth state listener with auto-profile fetch |
| `apps/desktop/ui/src/lib/supabase.ts` | Supabase client with Electron-friendly config |
| `apps/desktop/electron-builder.json` | NSIS protocol registration for installer |
| `apps/desktop/ui/src/components/auth/GoogleSignInButton.tsx` | Reusable "Continue with Google" button component |

### Website — OAuth Flow Files

| File | Purpose |
|------|---------|
| `apps/website/auth.html` | Sign-in page with Google button and email/password form |
| `apps/website/auth.js` | Supabase auth logic for the static site |
| `apps/website/auth/callback.html` | OAuth redirect callback handler |
| `apps/website/env.js` | Environment variables (generated at Vercel build time) |
| `scripts/env-to-website.mjs` | Vercel build script that injects env vars |
| `vercel.json` | Route config and build command |

---

## Appendix B: Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **System browser** instead of `BrowserWindow` for OAuth | Google blocks sign-ins from embedded browser views. System browser uses the user's existing Google session, is more secure (no keylogging), and works with password managers. |
| **`hellodarzi://` custom protocol** instead of localhost web server | No port conflicts, no localhost security warnings, no need to keep a server running just for OAuth callbacks. OS-native deep linking is more robust. |
| **Implicit flow (hash fragment)** instead of PKCE code flow via localhost | Simpler for the desktop case. The tokens arrive in the URL hash, which the app captures and sets via `setSession()`. Supabase handles PKCE automatically for the website flow. |
| **Static HTML for website auth** instead of a React app | The website is a marketing site. A full React app would be overkill. Supabase JS SDK via CDN is sufficient for basic auth. |
| **Separate Web and Desktop OAuth clients** | Google requires different redirect URIs for web (`https://`) and desktop (`hellodarzi://`). Two clients keep the configuration clean and secure. |

---

**End of setup guide.** Follow the steps in order from 1 to 7. Do not skip any step.
