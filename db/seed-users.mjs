import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnv() {
  try {
    const text = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local is optional if DATABASE_URL is already in the environment.
  }
}

const USERS = [
  { name: "Sadhana", email: "sadhana@experience.com", role: "admin" },
  { name: "Demo", email: "demo@experience.com", role: "sales" },
];

const PASSWORD = "demo1234";

async function main() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Set it in .env.local.");
  }

  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  const client = new pg.Client({
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(`
      create table if not exists app_users (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        email text not null unique,
        password_hash text not null,
        role text not null default 'sales',
        created_at timestamptz not null default now()
      )
    `);
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    for (const user of USERS) {
      const { rows } = await client.query(
        `insert into app_users (name, email, password_hash, role)
         values ($1, $2, $3, $4)
         on conflict (email) do update
           set name = excluded.name,
               password_hash = excluded.password_hash
         returning email, role`,
        [user.name, user.email, passwordHash, user.role],
      );
      console.log(`upserted ${rows[0].email} (${rows[0].role})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
