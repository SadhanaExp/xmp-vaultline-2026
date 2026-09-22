import "server-only";

let pool: import("pg").Pool | undefined;

/** Dashboard paste often carries surrounding quotes, which pg cannot parse. */
function databaseUrl() {
  return (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");
}

export function postgresConfigured() {
  return Boolean(databaseUrl());
}

export async function getPool() {
  if (!pool) {
    const { Pool } = await import("pg");
    const connectionString = databaseUrl();
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: process.env.VERCEL ? 1 : 5,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", () => undefined);
  }
  return pool;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await getPool().then((p) => p.connect());
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * `create table if not exists` is not race-safe: two concurrent calls can fail
 * on a unique violation in the catalog. Both errors mean the table now exists.
 */
export function isDuplicateObjectError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505" || code === "42P07";
}

export async function createTableIfNeeded(client: import("pg").ClientBase, sql: string) {
  try {
    await client.query(sql);
  } catch (error) {
    if (!isDuplicateObjectError(error)) throw error;
  }
}
