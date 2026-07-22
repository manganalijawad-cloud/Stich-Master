import pg from "pg";

const MIGRATIONS_SQL = `
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS shops_created_by_idx ON public.shops (created_by);

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  EXECUTE query;
END;
$$;
`;

async function runViaPg(databaseUrl: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(MIGRATIONS_SQL);
    console.log("  All migrations applied successfully via direct DB connection.");
    return true;
  } catch (err: any) {
    console.warn("  Direct DB migration failed:", err.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function runViaSupabaseRpc(supabaseAdmin: any): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc("exec_sql", { query: MIGRATIONS_SQL });
  if (error) {
    console.warn("  exec_sql RPC failed:", error.message);
    return false;
  }
  console.log("  All migrations applied successfully via exec_sql RPC.");
  return true;
}

const COLUMN_CHECKS = [
  ["shops", "address"],
  ["shops", "shop_name"],
  ["shops", "owner_name"],
  ["shops", "mobile_number"],
  ["profiles", "owner_name"],
  ["profiles", "updated_at"],
] as const;

async function checkViaSupabase(supabaseAdmin: any): Promise<string[]> {
  const missing: string[] = [];

  for (const [table, column] of COLUMN_CHECKS) {
    const { error } = await supabaseAdmin.from(table).select(column).limit(1);
    if (error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("does not exist"))) {
      missing.push(`${table}.${column}`);
    }
  }

  return missing;
}

export async function runMigrations(supabaseAdmin: any): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || "";
  const missing = await checkViaSupabase(supabaseAdmin);

  if (missing.length === 0) {
    console.log("Schema is up to date.");
    return;
  }

  console.warn(`Missing columns detected: ${missing.join(", ")}`);
  console.log("Attempting to apply migrations...");

  if (databaseUrl) {
    const ok = await runViaPg(databaseUrl);
    if (ok) return;
  }

  const ok = await runViaSupabaseRpc(supabaseAdmin);
  if (ok) return;

  console.error(
    "MIGRATION FAILED. To fix manually, run schema.sql in Supabase SQL Editor, " +
    "or set DATABASE_URL in your environment (get it from Supabase Dashboard → Project Settings → Database)."
  );
}
