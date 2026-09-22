import "server-only";

import bcrypt from "bcryptjs";
import { createTableIfNeeded, getPool, postgresConfigured, queryOne } from "@/lib/db";

export const DEMO_PASSWORD = "demo1234";

export const SEEDED_USERS = [
  { name: "Sadhana", email: "sadhana@experience.com", role: "admin" },
  { name: "Demo", email: "demo@experience.com", role: "sales" },
] as const;

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type UserRow = AppUser & { password_hash: string };

let seedPromise: Promise<void> | null = null;

const TABLE = `create table if not exists app_users (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   email text not null unique,
   password_hash text not null,
   role text not null default 'sales',
   created_at timestamptz not null default now()
 )`;

/**
 * Sign-in needs the users table, so the app creates and seeds it on first use
 * rather than depending on `npm run db:seed` having been run. Cached for the
 * process; a failure clears the cache so the next request retries.
 */
export async function ensureSeededUsers() {
  if (!postgresConfigured()) {
    // A deployment only sees the variables that existed when it was built, so
    // the hosted case is nearly always "set it, then redeploy".
    throw new Error(
      process.env.VERCEL
        ? "DATABASE_URL is not set for this deployment. Add it to the Vercel project for this environment, then redeploy."
        : "DATABASE_URL is not set. Add a local Postgres URL in .env.local.",
    );
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      const client = await getPool().then((p) => p.connect());
      try {
        await createTableIfNeeded(client, TABLE);
        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
        for (const user of SEEDED_USERS) {
          await client.query(
            `insert into app_users (name, email, password_hash, role)
             values ($1, $2, $3, $4)
             on conflict (email) do nothing`,
            [user.name, user.email, passwordHash, user.role],
          );
        }
      } finally {
        client.release();
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensureSeededUsers();
  return queryOne<UserRow>(
    "select id, name, email, role, password_hash from app_users where email = $1",
    [email.toLowerCase().trim()],
  );
}

export async function findUserById(id: string): Promise<AppUser | null> {
  await ensureSeededUsers();
  return queryOne<AppUser>("select id, name, email, role from app_users where id = $1", [id]);
}
