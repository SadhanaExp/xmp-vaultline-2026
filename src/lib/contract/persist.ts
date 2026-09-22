import "server-only";

import type { StoredContractState } from "./types";

let memory: StoredContractState | undefined;
let chain: Promise<unknown> = Promise.resolve();
let pool: import("pg").Pool | undefined;

/**
 * A demo must not show an error page because a database is unreachable. The
 * first failed connection switches this process to the in-memory store and
 * stays there, so one unreachable host does not cost every later request a
 * connection timeout.
 */
let postgresUnavailable = false;

function postgresEnabled() {
  return !postgresUnavailable && Boolean(process.env.DATABASE_URL?.trim());
}

async function getPool() {
  if (!pool) {
    const { Pool } = await import("pg");
    const connectionString = process.env.DATABASE_URL!;
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

async function withPostgres<T>(
  work: (state: StoredContractState) => T,
  seed: () => StoredContractState,
): Promise<T> {
  const client = await getPool().then((p) => p.connect());
  try {
    await client.query("begin");
    await client.query(
      `create table if not exists contract_workspace_state (
         id text primary key,
         state jsonb not null,
         version bigint not null default 1,
         updated_at timestamptz not null default now(),
         constraint contract_workspace_singleton check (id = 'default')
       )`,
    );
    await client.query(
      `insert into contract_workspace_state (id, state) values ('default', $1::jsonb)
       on conflict (id) do nothing`,
      [JSON.stringify(seed())],
    );
    const { rows } = await client.query<{ state: StoredContractState }>(
      "select state from contract_workspace_state where id = 'default' for update",
    );
    const state = rows[0]!.state;
    const result = work(state);
    await client.query(
      `update contract_workspace_state set state = $1::jsonb, version = version + 1, updated_at = now()
       where id = 'default'`,
      [JSON.stringify(state)],
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistLocked<T>(
  work: (state: StoredContractState) => T,
  seed: () => StoredContractState,
): Promise<T> {
  if (postgresEnabled()) {
    try {
      return await withPostgres(work, seed);
    } catch (error) {
      postgresUnavailable = true;
      pool?.end().catch(() => undefined);
      pool = undefined;
      console.warn(
        `[ready-to-contract] Postgres unavailable (${error instanceof Error ? error.message : "error"}). Continuing with in-memory demo state.`,
      );
    }
  }

  const run = chain.then(() => {
    if (!memory) memory = seed();
    return work(memory);
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
