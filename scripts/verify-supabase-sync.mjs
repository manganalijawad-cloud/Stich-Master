/**
 * Smoke-check cloud sync prerequisites against the configured Supabase project.
 * Reads .env for VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.VITE_SUPABASE_ANON_KEY || "";
if (!url || !key) {
  console.error("FAIL: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
};

const tables = [
  "shops",
  "profiles",
  "customers",
  "measurements",
  "orders",
  "payments",
  "expenses",
  "shop_settings",
  "garment_types",
  "styling_categories",
];

const results = { ok: [], fail: [] };

async function check(name, fn) {
  try {
    const r = await fn();
    if (r.ok) results.ok.push(name + (r.detail ? ` — ${r.detail}` : ""));
    else results.fail.push(name + " — " + (r.detail || "failed"));
  } catch (e) {
    results.fail.push(name + " — " + (e.message || String(e)));
  }
}

await check("Auth health", async () => {
  const res = await fetch(`${url}/auth/v1/health`, { headers });
  return { ok: res.ok, detail: `HTTP ${res.status}` };
});

for (const t of tables) {
  await check(`Table ${t}`, async () => {
    const res = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers });
    const body = await res.text();
    if (res.status === 404 || /Could not find the table/i.test(body)) {
      return { ok: false, detail: "missing" };
    }
    if ([200, 206, 401, 403].includes(res.status) || res.ok) {
      return { ok: true, detail: `HTTP ${res.status}` };
    }
    if (res.status === 400 && /column/i.test(body)) {
      return { ok: true, detail: "exists (column warning)" };
    }
    return { ok: false, detail: `HTTP ${res.status} ${body.slice(0, 120)}` };
  });
}

await check("Storage bucket shop-assets", async () => {
  const res = await fetch(`${url}/storage/v1/bucket/shop-assets`, { headers });
  if (res.ok) return { ok: true, detail: "present" };
  const list = await fetch(`${url}/storage/v1/bucket`, { headers });
  const listBody = await list.text();
  if (list.ok && listBody.includes("shop-assets")) {
    return { ok: true, detail: "in list" };
  }
  const body = await res.text();
  return { ok: false, detail: `HTTP ${res.status} ${body.slice(0, 100)}` };
});

await check("REST OpenAPI exposes sync tables", async () => {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { ...headers, Accept: "application/openapi+json" },
  });
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  const spec = await res.json();
  const paths = Object.keys(spec.paths || {});
  const missing = tables.filter((t) => !paths.some((p) => p === `/${t}`));
  if (missing.length) return { ok: false, detail: `missing: ${missing.join(", ")}` };
  return { ok: true, detail: `${tables.length} tables in API` };
});

const host = url.replace(/^https?:\/\//, "");
console.log(`Supabase project: ${host}`);
console.log(`PASS (${results.ok.length}):`);
for (const x of results.ok) console.log("  ✓", x);
if (results.fail.length) {
  console.log(`FAIL (${results.fail.length}):`);
  for (const x of results.fail) console.log("  ✗", x);
  process.exit(1);
}
console.log("All remote checks passed.");
