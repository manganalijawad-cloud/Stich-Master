import pg from "pg";

const MIGRATIONS_SQL = `
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS shops_created_by_idx ON public.shops (created_by);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value REAL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_total REAL;

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

/** Always-safe: pipeline stages are configurable (PROJECT.md §10). */
const DROP_ORDERS_STATUS_CHECK_SQL = `
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
`;

async function runViaPg(databaseUrl: string, sql: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(sql);
    return true;
  } catch (err: any) {
    console.warn("  Direct DB migration failed:", err.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function runViaSupabaseRpc(supabaseAdmin: any, sql: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
  if (error) {
    console.warn("  exec_sql RPC failed:", error.message);
    return false;
  }
  return true;
}

const COLUMN_CHECKS = [
  ["shops", "address"],
  ["shops", "shop_name"],
  ["shops", "owner_name"],
  ["shops", "mobile_number"],
  ["profiles", "owner_name"],
  ["profiles", "updated_at"],
  ["profiles", "created_by"],
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

async function applySql(supabaseAdmin: any, databaseUrl: string, sql: string, label: string): Promise<boolean> {
  if (databaseUrl) {
    const ok = await runViaPg(databaseUrl, sql);
    if (ok) {
      console.log(`  ${label} applied via direct DB connection.`);
      return true;
    }
  }
  const ok = await runViaSupabaseRpc(supabaseAdmin, sql);
  if (ok) {
    console.log(`  ${label} applied via exec_sql RPC.`);
    return true;
  }
  return false;
}

export async function runMigrations(supabaseAdmin: any): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || "";
  const missing = await checkViaSupabase(supabaseAdmin);

  if (missing.length === 0) {
    console.log("Schema columns are up to date.");
  } else {
    console.warn(`Missing columns detected: ${missing.join(", ")}`);
    console.log("Attempting to apply column migrations...");

    const ok = await applySql(supabaseAdmin, databaseUrl, MIGRATIONS_SQL, "Column migrations");
    if (!ok) {
      console.error(
        "MIGRATION FAILED. To fix manually, run schema.sql in Supabase SQL Editor, " +
        "or set DATABASE_URL in your environment (get it from Supabase Dashboard → Project Settings → Database)."
      );
      return;
    }
  }

  // Always drop hard-coded status check so custom pipeline stage ids can sync.
  const dropped = await applySql(
    supabaseAdmin,
    databaseUrl,
    DROP_ORDERS_STATUS_CHECK_SQL,
    "orders_status_check drop"
  );
  if (!dropped) {
    console.warn(
      "Could not drop orders_status_check automatically. If custom pipeline stages fail on Supabase, run:\n" +
      "ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;"
    );
  }
}
