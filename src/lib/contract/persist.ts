import "server-only";

import type { StoredContractState } from "./types";
import { createTableIfNeeded, getPool, postgresConfigured } from "@/lib/db";

let memory: StoredContractState | undefined;
let chain: Promise<unknown> = Promise.resolve();

/**
 * A demo must not show an error page because a database is unreachable. The
 * first failed connection switches the workspace state to the in-memory store
 * and stays there, so one unreachable host does not cost every later request a
 * connection timeout. Sign-in is deliberately not affected by this flag.
 */
let postgresUnavailable = false;
let tableReady: Promise<void> | null = null;

const TABLE = `create table if not exists contract_workspace_state (
   id text primary key,
   state jsonb not null,
   version bigint not null default 1,
   updated_at timestamptz not null default now(),
   constraint contract_workspace_singleton check (id = 'default')
 )`;

/**
 * The DDL runs once per process and outside the transaction below: a duplicate
 * catalog error from two concurrent creates would otherwise abort the
 * transaction that needs the table.
 */
async function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      const client = await getPool().then((p) => p.connect());
      try {
        await createTableIfNeeded(client, TABLE);
      } finally {
        client.release();
      }
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

async function withPostgres<T>(
  work: (state: StoredContractState) => T,
  seed: () => StoredContractState,
): Promise<T> {
  await ensureTable();
  const client = await getPool().then((p) => p.connect());
  try {
    await client.query("begin");
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
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function persistLocked<T>(
  work: (state: StoredContractState) => T,
  seed: () => StoredContractState,
): Promise<T> {
  if (!postgresUnavailable && postgresConfigured()) {
    try {
      return await withPostgres(work, seed);
    } catch (error) {
      postgresUnavailable = true;
      console.warn(
        `[vaultline] Postgres unavailable for workspace state (${error instanceof Error ? error.message : "error"}). Continuing with in-memory demo state.`,
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
