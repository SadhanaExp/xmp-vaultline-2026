// Adds one open account to the shared workspace state so it appears on Triage.
//
// The submitted deployment is a frozen build, but every deployment reads the
// same contract_workspace_state row, so editing the row is the only way to
// change what that URL shows.
//
// Usage:
//   node db/add-triage-account.mjs            # apply
//   node db/add-triage-account.mjs --dry-run  # show the plan only
//
// Connection string is read from PROD_DATABASE_URL, or from DATABASE_URL in
// .env.production.local. It is never printed.

import { readFileSync } from "node:fs";
import dns from "node:dns";
import pg from "pg";

dns.setDefaultResultOrder("ipv4first");

const NEW_ACCOUNT = {
  id: "meridian-financial",
  name: "Meridian Financial",
  quote_amount: "$39,000 / year",
  // Cloned from this account so the agreement mapping and shape stay correct.
  clone_from_crm: "Encompass",
  contacts: [
    { name: "Elena Vargas", role: "VP Client Experience", is_signer: true, email: "elena@meridianfinancial.example" },
    { name: "Sam Okafor", role: "Finance", is_signer: false, email: "sam@meridianfinancial.example" },
  ],
  lead_id: "enc-meridian",
};

// Queued packets give Triage its "intake gap" and "autonomous intake" cards.
// New companies, so accepting one cannot collide with an existing account.
const QUEUED_PACKETS = [
  {
    id: "enc-summit", source_crm: "Encompass", company: "Summit Savings Bank",
    quote_amount: "$44,000 / year", quote_version: "v2", status: "queued",
    why_qualified: "Encompass deal won. Lending committee approved the Experience.com rollout.",
    gaps: ["Billing / AP contact missing", "Order form not attached in CRM"],
    contacts: [
      { name: "Grace Whitfield", role: "SVP Retail Lending", is_signer: true, email: "grace@summitsavings.example" },
      { name: "Peter Osei", role: "Risk", is_signer: false, email: "peter@summitsavings.example" },
    ],
  },
  {
    id: "az-harbor", source_crm: "AgencyZoom", company: "Harbor Point Realty",
    quote_amount: "$21,000 / year", quote_version: "v2", status: "queued",
    why_qualified: "Brokerage of 340 agents. Managing broker accepted the quote in AgencyZoom.",
    gaps: [],
    contacts: [
      { name: "Tara Nolan", role: "Managing Broker", is_signer: true, email: "tara@harborpoint.example" },
      { name: "Diego Ruiz", role: "Operations", is_signer: false, email: "diego@harborpoint.example" },
    ],
  },
];

function connectionString() {
  const direct = (process.env.PROD_DATABASE_URL ?? "").trim();
  if (direct) return direct.replace(/^['"]|['"]$/g, "");

  let file;
  try {
    file = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
  } catch {
    throw new Error(
      "No connection string. Set PROD_DATABASE_URL, or create .env.production.local containing DATABASE_URL=...",
    );
  }
  const match = file.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error(".env.production.local has no DATABASE_URL line.");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function clientConfig(url) {
  const local = /@(localhost|127\.0\.0\.1)/.test(url);
  // Hosted Postgres (Neon/Vercel) needs TLS without verify-full. Query flags
  // on the URL otherwise override the ssl object in current pg.
  const cleaned = url
    .replace(/([?&])sslmode=[^&]*/gi, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
  return {
    connectionString: cleaned,
    ssl: local ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  };
}

function errorText(error) {
  const parts = [error?.message, error?.code, error?.cause?.message].filter(Boolean);
  return parts.join(" / ") || error?.name || "unknown error";
}

function openAccount(template, now) {
  const account = structuredClone(template);
  account.customer.id = NEW_ACCOUNT.id;
  account.customer.name = NEW_ACCOUNT.name;
  account.customer.contacts = structuredClone(NEW_ACCOUNT.contacts);
  account.customer.contract.quote_amount = NEW_ACCOUNT.quote_amount;
  account.customer.contract.status = "Draft";
  account.customer.contract.generated = false;
  account.customer.documents = [];
  account.customer.deals = [{ id: "initial", name: "Initial Purchase", status: "Quoted" }];
  account.customer.activity = [
    { at: "18 Sep 2026 09:30", text: `Qualified deal handed off from ${account.customer.source_crm}.` },
    { at: "18 Sep 2026 09:36", text: "Quote v2 accepted by Elena Vargas." },
  ];

  account.negotiation_status = "open";
  account.contract_generated = false;
  account.sign_index = 0;
  account.renewal_started = false;
  account.renewal_due = false;
  account.snoozed = false;
  account.selected_package_id = "";
  account.negotiation_summary = "";
  account.negotiation_suggestion = "";
  account.concern = "none";
  account.concession_percent = 0;
  account.quote_draft = "";
  account.email_subject = "";
  account.email_body = "";
  account.outreach_subject = "";
  account.outreach_body = "";
  account.outreach_actions = [];
  account.outreach_channel = undefined;
  account.reminder_count = 0;
  account.sent_at = undefined;
  account.reminder_sent_at = undefined;
  account.last_nudge_band = undefined;
  account.docusign_envelope_id = undefined;
  account.docusign_envelope_url = undefined;
  account.docusign_note = undefined;
  account.docusign_provider = undefined;
  void now;
  return account;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = new pg.Client(clientConfig(connectionString()));
  await client.connect();

  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select state from contract_workspace_state where id = 'default' for update",
    );
    if (!rows.length) throw new Error("No 'default' row in contract_workspace_state. Load the app once first.");

    const state = rows[0].state;
    const before = Object.keys(state.accounts);
    console.log(`Accounts before (${before.length}): ${before.join(", ")}`);
    console.log(`Active before: ${state.active_id}`);

    const template =
      Object.values(state.accounts).find((a) => a.customer.source_crm === NEW_ACCOUNT.clone_from_crm) ??
      Object.values(state.accounts)[0];
    if (!template) throw new Error("No existing account to use as a shape template.");

    state.accounts[NEW_ACCOUNT.id] = openAccount(template, state.now);
    state.active_id = NEW_ACCOUNT.id;

    if (!state.inbox.some((lead) => lead.id === NEW_ACCOUNT.lead_id)) {
      state.inbox.push({
        id: NEW_ACCOUNT.lead_id,
        source_crm: template.customer.source_crm,
        company: NEW_ACCOUNT.name,
        quote_amount: NEW_ACCOUNT.quote_amount,
        quote_version: "v2",
        status: "accepted",
        why_qualified: "Quote v2 accepted. Client experience lead is signer. Commercials still open.",
        gaps: [],
        contacts: structuredClone(NEW_ACCOUNT.contacts),
        accepted_at: "18 Sep 2026 09:30",
        customer_id: NEW_ACCOUNT.id,
      });
    }

    for (const packet of QUEUED_PACKETS) {
      const existing = state.inbox.find((lead) => lead.id === packet.id);
      if (existing) {
        console.log(`Packet ${packet.id} already present (${existing.status}) — left alone.`);
        continue;
      }
      state.inbox.push(structuredClone(packet));
      console.log(`Queued packet added: ${packet.company}`);
    }

    const queued = state.inbox.filter((lead) => lead.status === "queued");
    console.log(`Queued packets now: ${queued.map((lead) => lead.company).join(", ") || "none"}`);

    const after = Object.keys(state.accounts);
    console.log(`Accounts after  (${after.length}): ${after.join(", ")}`);
    console.log(`Active after: ${state.active_id}`);

    if (dryRun) {
      await client.query("rollback");
      console.log("\nDry run — nothing written.");
      return;
    }

    await client.query(
      `update contract_workspace_state
         set state = $1::jsonb, version = version + 1, updated_at = now()
       where id = 'default'`,
      [JSON.stringify(state)],
    );
    await client.query("commit");
    console.log(`\nDone. ${NEW_ACCOUNT.name} is open and selected on Triage.`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Failed: ${errorText(error)}`);
  process.exit(1);
});
