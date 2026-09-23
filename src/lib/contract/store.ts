import "server-only";

import { persistLocked } from "./persist";
import type {
  AccountState, AgentRecommendation, AppState, ClockPreset, Contact, ContractMutation, ContractPackage,
  HandoffLead, NegotiationConcern, OutreachAction, OutreachChannel, QuoteHandoffPayload, RenewalAction,
  RenewalWatch, ScheduleNotice, StoredContractState,
} from "./types";

const CLOCK: Record<ClockPreset, string> = {
  start: "2026-09-18T09:00:00.000Z",
  signing_day_3: "2026-09-21T09:00:00.000Z",
  renewal_window: "2027-08-18T09:00:00.000Z",
  day_21: "2027-08-27T09:00:00.000Z",
  day_14: "2027-09-03T09:00:00.000Z",
  day_7: "2027-09-10T09:00:00.000Z",
};
const TERM_START = "2026-09-18";
const TERM_END = "2027-09-17";
const SIGN_STEPS = ["Draft", "Sent to Customer", "Customer Signed", "Experience.com Countersigned", "Fully Executed"] as const;
const AGREEMENTS: Record<string, string> = {
  Encompass: "Encompass Agreement", BytePro: "Experience.com Agreement", "Total Expert": "Experience.com Agreement",
  AgencyZoom: "Experience.com Agreement", "Experience.com": "Experience.com Agreement",
};
const CATALOG: Record<string, Array<[string, string, number, string[], string]>> = {
  "Total Expert": [
    ["te-essential", "Essential", 36000, ["Reputation management", "Surveys", "Standard support"], "Teams starting with core customer experience"],
    ["te-growth", "Growth", 48000, ["Reputation management", "Surveys", "Workflow automation", "Total Expert sync", "Priority support"], "Revenue teams needing CRM-connected workflows"],
    ["te-enterprise", "Enterprise", 66000, ["Everything in Growth", "Advanced analytics", "Multi-brand controls", "Dedicated success manager", "Custom workflows"], "Large organizations with governance needs"],
  ],
  Encompass: [
    ["enc-core", "Lending Core", 32000, ["Borrower surveys", "Review generation", "Encompass milestone sync"], "Mortgage teams beginning post-close automation"],
    ["enc-growth", "Lending Growth", 45000, ["Everything in Core", "Branch dashboards", "Loan officer workflows", "Priority support"], "Multi-branch lenders focused on growth"],
    ["enc-enterprise", "Lending Enterprise", 62000, ["Everything in Growth", "Enterprise analytics", "Custom Encompass events", "Dedicated success manager"], "Enterprise lenders with complex LOS operations"],
  ],
  BytePro: [
    ["bp-core", "Core", 24000, ["Customer surveys", "Review requests", "BytePro sync"], "Independent mortgage teams"],
    ["bp-growth", "Growth", 36000, ["Everything in Core", "Automated workflows", "Team analytics", "Priority support"], "Growing origination teams"],
    ["bp-enterprise", "Enterprise", 52000, ["Everything in Growth", "Custom reporting", "Multi-entity controls", "Dedicated success manager"], "Large lenders"],
  ],
  AgencyZoom: [
    ["az-core", "Agency Core", 18500, ["Policyholder surveys", "Review requests", "AgencyZoom sync"], "Independent agencies"],
    ["az-growth", "Agency Growth", 28000, ["Everything in Core", "Renewal workflows", "Producer analytics", "Priority support"], "Growing agencies"],
    ["az-enterprise", "Agency Enterprise", 42000, ["Everything in Growth", "Multi-office controls", "Custom workflows", "Dedicated success manager"], "Agency groups"],
  ],
};

const fmt = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
const stamp = (value: string) => `${fmt(value)} ${new Date(value).toISOString().slice(11, 16)}`;
const moneyValue = (value: string) => Number(value.replace(/\D/g, "")) || 0;
const usd = (value: number) => `$${Math.round(value).toLocaleString("en-US")} / year`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "customer";
const signer = (account: AccountState) => account.customer.contacts.find((c) => c.is_signer) ?? account.customer.contacts[0]!;
const daysBetween = (end: string, now: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(now.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
const nudgeBand = (days: number) => days <= 0 ? undefined : days <= 7 ? "7" : days <= 14 ? "14" : days <= 21 ? "21" : days <= 30 ? "30" : undefined;
const bandLabel = (band?: string) => ({ "30": "30-day notice", "21": "21-day follow-up", "14": "14-day warning", "7": "7-day final notice" })[band ?? ""];
const CONCERN_LABEL: Record<NegotiationConcern, string> = {
  none: "Quoted terms", price: "Price pressure", term: "Term flexibility", legal: "Legal redlines",
};
const CLOCK_LABEL: Record<ClockPreset, string> = {
  start: "Term start", signing_day_3: "Signing +3 days", renewal_window: "30-day notice",
  day_21: "21-day follow-up", day_14: "14-day warning", day_7: "7-day final notice",
};
const OUTREACH_LABEL: Record<OutreachChannel, string> = { call: "Call", email: "Email", meet: "Meet" };

function localDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function collectSchedule(state: StoredContractState): { today: ScheduleNotice[]; upcoming: ScheduleNotice[] } {
  const wallDay = localDay(new Date());
  const clockDay = localDay(state.now);
  const horizon = Date.now() + 7 * 86_400_000;
  const today: ScheduleNotice[] = [];
  const upcoming: ScheduleNotice[] = [];
  for (const account of Object.values(state.accounts)) {
    for (const item of account.outreach_actions ?? []) {
      if (item.status !== "scheduled" || (item.channel !== "call" && item.channel !== "meet") || !item.starts_at) continue;
      const start = Date.parse(item.starts_at);
      if (Number.isNaN(start)) continue;
      const day = localDay(item.starts_at);
      const notice: ScheduleNotice = {
        id: item.id, customer_id: account.customer.id, company: account.customer.name, channel: item.channel,
        with_name: item.with_name, with_email: item.with_email, starts_at: item.starts_at, ends_at: item.ends_at,
        subject: item.subject, meeting_url: item.meeting_url, provider: item.provider,
        when: day === wallDay ? "today" : day === clockDay ? "clock" : "upcoming",
      };
      if (notice.when === "today" || notice.when === "clock") today.push(notice);
      else if (start >= Date.now() && start <= horizon) upcoming.push(notice);
    }
  }
  const byStart = (a: ScheduleNotice, b: ScheduleNotice) => Date.parse(a.starts_at) - Date.parse(b.starts_at);
  return { today: today.sort(byStart), upcoming: upcoming.sort(byStart) };
}

function outreachDraft(account: AccountState, channel: OutreachChannel) {
  const person = signer(account);
  const first = person.name.split(" ")[0];
  const terms = account.negotiation_suggestion || account.negotiation_summary;
  if (channel === "call") {
    return {
      subject: `Call ${person.name} · proposed terms`,
      body: `Talking points for ${person.name} (${person.role}):\n1. Recap accepted quote and the ${account.concern === "none" ? "quoted" : CONCERN_LABEL[account.concern as NegotiationConcern] ?? "open"} concern.\n2. Walk the proposed position: ${terms}.\n3. Ask for verbal go / no-go, then lock on Commercial desk.`,
    };
  }
  if (channel === "meet") {
    return {
      subject: `Working session with ${person.name}`,
      body: `Agenda — 25 minutes with ${person.name}:\n• Open: why these terms moved from the accepted quote.\n• Review: ${terms}.\n• Close: confirm lock, or capture a counter. Same account file — no duplicate.`,
    };
  }
  return {
    subject: `${account.customer.name} · proposed commercial terms`,
    body: `Hi ${first},\n\nFollowing your accepted quote, we have a proposed position ready for ${account.customer.name}.\n\n${terms}\n\nReply to this email or take a short call and we will lock terms on the same account file.\n\n— Vaultline`,
  };
}

function baseAccount(id: string, name: string, crm: string, amount: string, contacts: Contact[]): AccountState {
  return {
    customer: {
      id, name, source_crm: crm, contacts, deals: [{ id: "initial", name: "Initial Purchase", status: "Quoted" }],
      contract: { name: AGREEMENTS[crm]!, status: "Draft", generated: false, term_start: TERM_START, term_end: TERM_END, quote_amount: amount },
      documents: [], activity: [
        { at: "18 Sep 2026 09:12", text: `Qualified deal handed off from ${crm}.` },
        { at: "18 Sep 2026 09:18", text: `Quote v2 accepted by ${contacts.find((c) => c.is_signer)?.name ?? contacts[0]?.name}.` },
      ],
    },
    sign_index: 0, contract_generated: false, renewal_started: false, days_until_expiry: 0, renewal_due: false,
    quote_created: "12 Sep 2026", quote_accepted: "18 Sep 2026", quote_expiry: "12 Oct 2026", snoozed: false,
    quote_draft: "", email_subject: "", email_body: "", selected_package_id: "", negotiation_summary: "",
    concern: "none", concession_percent: 0, negotiation_status: "open", negotiation_suggestion: "",
    outreach_subject: "", outreach_body: "", outreach_actions: [], reminder_count: 0,
  };
}

function seedInbox(): HandoffLead[] {
  return [
    { id: "te-abc", source_crm: "Total Expert", company: "ABC Corp", quote_amount: "$48,000 / year", quote_version: "v2", status: "accepted", why_qualified: "Quote v2 accepted. Ops signer confirmed. Ready for Experience.com Agreement.", gaps: [], contacts: [{ name: "Priya Mehta", role: "VP Operations", is_signer: true, email: "priya@abccorp.example" }, { name: "Rajesh Iyer", role: "Finance", is_signer: false, email: "rajesh@abccorp.example" }], accepted_at: "18 Sep 2026 09:12", customer_id: "abc-corp" },
    { id: "enc-xyz", source_crm: "Encompass", company: "XYZ Corp", quote_amount: "$32,000 / year", quote_version: "v2", status: "accepted", why_qualified: "LOS file complete. Lending head is signer. Map to Encompass Agreement.", gaps: [], contacts: [{ name: "Sana Kapoor", role: "Head of Lending", is_signer: true, email: "sana@xyzcorp.example" }, { name: "Arjun Desai", role: "Compliance", is_signer: false, email: "arjun@xyzcorp.example" }], accepted_at: "18 Sep 2026 09:08", customer_id: "xyz-corp" },
    { id: "bp-cedar", source_crm: "BytePro", company: "Cedar Mortgage", quote_amount: "$36,000 / year", quote_version: "v2", status: "accepted", why_qualified: "Quote v2 accepted. Originator is signer. Open commercials — use this file to send a DocuSign demo envelope.", gaps: [], contacts: [{ name: "Anika Shah", role: "VP Origination", is_signer: true, email: "anika@cedarmortgage.example" }, { name: "Chris Lang", role: "Controller", is_signer: false, email: "chris@cedarmortgage.example" }], accepted_at: "18 Sep 2026 10:04", customer_id: "cedar-mortgage" },
    { id: "az-lakeside", source_crm: "AgencyZoom", company: "Lakeside Insurance", quote_amount: "$18,500 / year", quote_version: "v2", status: "queued", why_qualified: "Agency book of 1,200 policies. Principal signed the quote in AgencyZoom.", gaps: [], contacts: [{ name: "Omar Sheikh", role: "Principal", is_signer: true, email: "omar@lakeside.example" }, { name: "Leah Kim", role: "Office Manager", is_signer: false, email: "leah@lakeside.example" }] },
    { id: "enc-northstar", source_crm: "Encompass", company: "Northstar Credit Union", quote_amount: "$51,000 / year", quote_version: "v2", status: "queued", why_qualified: "Encompass LOS deal won. Credit committee approved. Use Encompass Agreement.", gaps: ["Order form not attached in CRM"], contacts: [{ name: "Dev Patel", role: "SVP Lending", is_signer: true, email: "dev@northstar.example" }, { name: "Maya Brooks", role: "General Counsel", is_signer: false, email: "maya@northstar.example" }] },
  ];
}

function lockQuoted(account: AccountState) {
  const selected = packages(account).find((p) => p.recommended)!;
  account.selected_package_id = selected.id;
  account.negotiation_status = "agreed";
  account.concern = "none";
  account.concession_percent = 0;
  account.negotiation_summary = `${selected.name} locked at ${account.customer.contract.quote_amount} (quoted terms).`;
}

export function initialContractState(): StoredContractState {
  const abc = baseAccount("abc-corp", "ABC Corp", "Total Expert", "$48,000 / year", [{ name: "Priya Mehta", role: "VP Operations", is_signer: true, email: "priya@abccorp.example" }, { name: "Rajesh Iyer", role: "Finance", is_signer: false, email: "rajesh@abccorp.example" }]);
  const xyz = baseAccount("xyz-corp", "XYZ Corp", "Encompass", "$32,000 / year", [{ name: "Sana Kapoor", role: "Head of Lending", is_signer: true, email: "sana@xyzcorp.example" }, { name: "Arjun Desai", role: "Compliance", is_signer: false, email: "arjun@xyzcorp.example" }]);
  const cedar = baseAccount("cedar-mortgage", "Cedar Mortgage", "BytePro", "$36,000 / year", [{ name: "Anika Shah", role: "VP Origination", is_signer: true, email: "anika@cedarmortgage.example" }, { name: "Chris Lang", role: "Controller", is_signer: false, email: "chris@cedarmortgage.example" }]);
  lockQuoted(abc); lockQuoted(xyz);
  return { now: CLOCK.start, active_id: "cedar-mortgage", accounts: { "abc-corp": abc, "xyz-corp": xyz, "cedar-mortgage": cedar }, inbox: seedInbox() };
}

/** Persisted demo state keeps ABC/XYZ; new seed accounts are merged in without wiping signed files. */
function hydrateSeedAccounts(state: StoredContractState) {
  const seeded = initialContractState();
  for (const [id, account] of Object.entries(seeded.accounts)) {
    if (!state.accounts[id]) {
      state.accounts[id] = account;
      if (id === "cedar-mortgage") state.active_id = id;
    }
  }
  const cedar = state.accounts["cedar-mortgage"];
  if (cedar && cedar.sign_index > 0 && cedar.sign_index < 4) {
    cedar.sign_index = 4;
    cedar.docusign_provider = "demo";
    cedar.docusign_note = "Demo profile: the DocuSign signing page was skipped. In live, Vaultline navigates the signer to DocuSign and returns here once both parties have signed.";
    state.active_id = "cedar-mortgage";
  }
  for (const lead of seeded.inbox) {
    if (!state.inbox.some((item) => item.id === lead.id)) state.inbox.push(lead);
  }
}

export function leadFromPayload(payload: QuoteHandoffPayload): HandoffLead {
  const dm = (payload.qualification.decision_maker ?? "").toLowerCase();
  const contacts = payload.contacts.filter((c) => c.name.trim()).map((c) => ({
    name: c.name, role: c.title ?? (c.is_primary ? "Primary contact" : "Contact"),
    is_signer: Boolean(dm) && (c.name.toLowerCase().includes(dm) || dm.includes(c.name.toLowerCase())), email: c.email ?? "",
  }));
  const detail = [payload.need.summary ?? payload.need.primary_need ?? "Requirement captured in the Lead & Deal Workspace."];
  if (payload.sizing.users) detail.push(`${payload.sizing.users} users`);
  if (payload.need.integrations.length) detail.push(`Integrations: ${payload.need.integrations.join(", ")}`);
  if (payload.insights[0]) detail.push(payload.insights[0]);
  if (payload.qualification.budget) detail.push(`Budget context: ${payload.qualification.budget}`);
  return {
    id: `se-${payload.opportunity.id}`, source_crm: "Experience.com", company: payload.customer.name,
    quote_amount: "To be quoted", quote_version: "v2", status: "queued",
    why_qualified: detail.map((s) => s.replace(/\.*$/, ".")).join(" "), gaps: payload.qualification.missing,
    contacts, customer_id: payload.customer.key || undefined, budget_context: payload.qualification.budget ?? undefined,
  };
}

function packages(account: AccountState): ContractPackage[] {
  const rows = CATALOG[account.customer.source_crm] ?? CATALOG["Total Expert"]!;
  const current = moneyValue(account.customer.contract.quote_amount);
  const recommendedId = rows.reduce((best, row) => Math.abs(row[2] - current) < Math.abs(best[2] - current) ? row : best)[0];
  return rows.map(([id, name, annual_price, features, best_for]) => ({ id, name, annual_price, display_price: usd(annual_price), features, best_for, recommended: id === recommendedId }));
}

function refresh(account: AccountState, now: string) {
  account.days_until_expiry = daysBetween(account.customer.contract.term_end, now);
  account.renewal_due = account.days_until_expiry > 0 && account.days_until_expiry <= 30 && !account.renewal_started && !account.snoozed;
  account.customer.contract.generated = account.contract_generated;
  account.customer.contract.status = SIGN_STEPS[account.sign_index]!;
  if (account.sign_index === 1 && account.sent_at && !account.reminder_sent_at && Date.parse(now) >= Date.parse(account.sent_at) + 259_200_000) {
    account.reminder_sent_at = now; account.reminder_count += 1;
    account.customer.activity.unshift({ at: stamp(now), text: `Automatic signature reminder #${account.reminder_count} sent to ${signer(account).name}.` });
  }
  if (account.sign_index >= 4) account.customer.deals.find((d) => d.id === "initial")!.status = "Won";
  account.customer.documents = documents(account, now);
}

function documents(account: AccountState, now: string) {
  const signed = account.sign_index >= 4;
  const c = account.customer.contract;
  return [
    { name: "Quote v1", type: "Quote", version: "v1", created: "04 Sep 2026", status: "Superseded", signed: "—", expiry: "—" },
    { name: "Quote v2", type: "Quote", version: "v2", created: account.quote_created, status: "Accepted", signed: account.quote_accepted, expiry: account.quote_expiry },
    { name: "Order Form", type: "Order Form", version: "v1", created: fmt(TERM_START), status: signed ? "Executed" : "Attached", signed: signed ? fmt(TERM_START) : "—", expiry: fmt(TERM_END) },
    { name: c.name, type: "Agreement", version: "v1", created: account.contract_generated ? fmt(CLOCK.start) : "—", status: account.sign_index ? SIGN_STEPS[account.sign_index]! : account.contract_generated ? "Draft" : "Pending", signed: account.sign_index >= 2 ? fmt(now) : "—", expiry: fmt(TERM_END) },
    { name: "Signed Contract", type: "Executed Agreement", version: "v1", created: signed ? fmt(now) : "—", status: signed ? "Fully Executed" : "Not created", signed: signed ? fmt(now) : "—", expiry: fmt(TERM_END), ...(signed ? { filename: `${account.customer.id}-executed-agreement.pdf`, download_url: `/api/contract/documents/${account.customer.id}/executed.pdf` } : {}) },
  ];
}

function watch(account: AccountState): RenewalWatch {
  const s = signer(account); const band = nudgeBand(account.days_until_expiry);
  const status = account.renewal_started ? "open" : account.days_until_expiry <= 0 ? "expired" : account.days_until_expiry > 30 ? "watching" : account.snoozed ? "snoozed" : "due";
  return { customer_id: account.customer.id, name: account.customer.name, source_crm: account.customer.source_crm, contract_name: account.customer.contract.name, quote_amount: account.customer.contract.quote_amount, signer: s.name, signer_email: s.email, term_end: account.customer.contract.term_end, days_until_expiry: account.days_until_expiry, status, nudge_band: band, last_nudge_band: account.last_nudge_band, next_nudge: account.renewal_started ? undefined : bandLabel(band), last_activity: account.customer.activity[0]?.text ?? "", executed: account.sign_index >= 4 };
}

function clockPreset(now: string): ClockPreset {
  return (Object.entries(CLOCK).find(([, value]) => value === now)?.[0] as ClockPreset | undefined) ?? "start";
}

function negotiatedPrice(account: AccountState, pkg: ContractPackage, concern: NegotiationConcern, concessionPercent: number) {
  const quoted = moneyValue(account.customer.contract.quote_amount);
  const base = concern === "none" ? (quoted || pkg.annual_price) : pkg.annual_price;
  return Math.round(base * (1 - concessionPercent / 100));
}

function agentRecommendations(state: StoredContractState, account: AccountState): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];
  const gapped = state.inbox.find((lead) => lead.status === "queued" && lead.gaps.length > 0);
  const clean = state.inbox.find((lead) => lead.status === "queued" && lead.gaps.length === 0);
  const due = Object.values(state.accounts).map(watch).find((item) => item.status === "due");

  if (gapped) recommendations.push({
    id: `gap-${gapped.id}`, title: `Resolve ${gapped.company} intake gap`,
    intent: "Keep incomplete commercial data out of autonomous execution.",
    priority: "high", confidence: 98, risk: "medium", requires_approval: true,
    evidence: [...gapped.gaps, `Signer: ${gapped.contacts.find((contact) => contact.is_signer)?.name ?? "not found"}`],
    action_label: "Review packet", action: "accept-packet", target_id: gapped.id,
  });
  if (account.negotiation_status === "open") recommendations.push({
    id: `commercial-${account.customer.id}`, title: `Draft ${account.customer.name} commercial position`,
    intent: "Use the catalog package nearest the accepted quote and preserve approval before lock.",
    priority: "high", confidence: 94, risk: "low", requires_approval: false,
    evidence: [`Accepted quote: ${account.customer.contract.quote_amount}`, `Source: ${account.customer.source_crm}`],
    action_label: "Draft proposal", action: "propose-commercials", target_id: account.customer.id,
  });
  if (account.negotiation_status === "proposed") recommendations.push({
    id: `lock-${account.customer.id}`, title: "Approve and lock proposed terms",
    intent: "Human approval is required before the agent changes binding commercials.",
    priority: "high", confidence: 91, risk: "medium", requires_approval: true,
    evidence: [account.negotiation_summary],
    action_label: "Open commercial desk", action: "lock-commercials", target_id: account.customer.id,
  });
  if (account.negotiation_status === "agreed" && !account.contract_generated) recommendations.push({
    id: `paper-${account.customer.id}`, title: "Generate agreement and order form",
    intent: "Create paper only from locked catalog terms.",
    priority: "medium", confidence: 99, risk: "low", requires_approval: false,
    evidence: [account.negotiation_summary, `${account.customer.contract.name} selected`],
    action_label: "Generate paper", action: "generate-paper", target_id: account.customer.id,
  });
  if (account.contract_generated && account.sign_index === 0) recommendations.push({
    id: `send-${account.customer.id}`, title: `Send envelope to ${signer(account).name}`,
    intent: "External communication stays behind a human approval gate.",
    priority: "medium", confidence: 97, risk: "medium", requires_approval: true,
    evidence: [`Signer: ${signer(account).email}`, "Agreement and order form generated"],
    action_label: "Review envelope", action: "send-envelope", target_id: account.customer.id,
  });
  if (account.sign_index === 1) recommendations.push({
    id: `wait-${account.customer.id}`, title: `Watch ${signer(account).name}'s envelope`,
    intent: account.reminder_sent_at ? "Reminder sent; avoid duplicate contact." : "Wait until the three-day reminder threshold.",
    priority: "medium", confidence: 99, risk: "low", requires_approval: false,
    evidence: [`Waiting ${Math.max(0, Math.floor((Date.parse(state.now) - Date.parse(account.sent_at!)) / 86_400_000))} days`, account.reminder_sent_at ? "Reminder already sent" : "Reminder not yet due"],
    action_label: "Monitor clock", action: "wait", target_id: account.customer.id,
  });
  if (due) recommendations.push({
    id: `renew-${due.customer_id}`, title: `Open ${due.name} renewal draft`,
    intent: "Protect the notice window while retaining the same account record.",
    priority: "high", confidence: 96, risk: "low", requires_approval: false,
    evidence: [`${due.days_until_expiry} days to expiry`, `Signer: ${due.signer}`],
    action_label: "Draft renewal", action: "run-renewal", target_id: due.customer_id,
  });
  if (clean) recommendations.push({
    id: `clean-${clean.id}`, title: `Autonomously intake ${clean.company}`,
    intent: "The packet has a signer and no missing fields, so the agent can safely map it.",
    priority: "low", confidence: 97, risk: "low", requires_approval: false,
    evidence: [`No gaps detected`, `Source: ${clean.source_crm}`],
    action_label: "Accept clean packet", action: "accept-packet", target_id: clean.id,
  });
  return recommendations.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority]).slice(0, 5);
}

export function snapshot(state: StoredContractState): AppState {
  Object.values(state.accounts).forEach((a) => refresh(a, state.now));
  const account = state.accounts[state.active_id] ?? Object.values(state.accounts)[0]!;
  const catalog = packages(account);
  const recommended = catalog.find((p) => p.recommended)!;
  if (!account.selected_package_id) account.selected_package_id = recommended.id;
  account.concern ??= "none";
  account.concession_percent ??= 0;
  account.negotiation_status ??= "open";
  account.negotiation_suggestion ??= "";
  const selected = catalog.find((p) => p.id === account.selected_package_id) ?? recommended;
  const concern = (["none", "price", "term", "legal"].includes(account.concern) ? account.concern : "none") as NegotiationConcern;
  const preview = usd(negotiatedPrice(account, selected, concern, account.concession_percent));
  if (!account.negotiation_summary) account.negotiation_summary = `${selected.name} · quoted ${account.customer.contract.quote_amount}`;
  const sent = account.sent_at ? new Date(account.sent_at) : undefined;
  const reminderAt = sent ? new Date(sent.getTime() + 259_200_000).toISOString() : undefined;
  const preset = clockPreset(state.now);
  const recommendations = agentRecommendations(state, account);
  const waiting = Object.values(state.accounts).filter((item) => item.sign_index === 1).map((item) => ({
    customer_id: item.customer.id, name: item.customer.name, signer: signer(item).name,
  }));
  const schedule = collectSchedule(state);
  return {
    now: state.now, sign_index: account.sign_index, contract_generated: account.contract_generated,
    renewal_started: account.renewal_started, customer: account.customer,
    customers: Object.values(state.accounts).map((a) => ({ id: a.customer.id, name: a.customer.name, source_crm: a.customer.source_crm, contract_name: a.customer.contract.name })),
    days_until_expiry: account.days_until_expiry, renewal_due: account.renewal_due, inbox: state.inbox,
    last_handoff: state.last_handoff, watchlist: Object.values(state.accounts).map(watch), last_renewal: state.last_renewal,
    contract_packages: catalog,
    negotiation: {
      status: account.negotiation_status, selected_package_id: selected.id, selected_package_name: selected.name,
      concern, concern_label: CONCERN_LABEL[concern], concession_percent: account.concession_percent,
      list_price: selected.display_price, final_price: account.negotiation_status === "agreed" ? account.customer.contract.quote_amount : preview,
      suggestion: account.negotiation_suggestion, summary: account.negotiation_summary,
      outreach_channel: account.outreach_channel, outreach_label: account.outreach_channel ? OUTREACH_LABEL[account.outreach_channel] : "",
      outreach_subject: account.outreach_subject ?? "", outreach_body: account.outreach_body ?? "",
      outreach_actions: account.outreach_actions ?? [],
    },
    signing_watch: {
      status: ["not_sent", "waiting_customer", "customer_signed", "countersigned", "fully_executed"][account.sign_index] as AppState["signing_watch"]["status"],
      signer: signer(account).name, signer_email: signer(account).email, sent_at: account.sent_at,
      days_waiting: account.sign_index === 1 && sent ? Math.max(0, Math.floor((Date.parse(state.now) - sent.getTime()) / 86_400_000)) : 0,
      reminder_due_at: reminderAt,
      reminder_due: account.sign_index === 1 && Boolean(reminderAt && Date.parse(state.now) >= Date.parse(reminderAt) && !account.reminder_sent_at),
      reminder_sent_at: account.reminder_sent_at, reminder_count: account.reminder_count,
      envelope_id: account.docusign_envelope_id, envelope_url: account.docusign_envelope_url,
      provider: account.docusign_provider, note: account.docusign_note,
    },
    demo_clock: { now: state.now, preset, label: CLOCK_LABEL[preset] },
    exceptions: {
      gaps: state.inbox.filter((lead) => lead.status === "queued" && lead.gaps.length > 0),
      waiting_signatures: waiting,
      due_renewals: Object.values(state.accounts).map(watch).filter((item) => ["due", "snoozed"].includes(item.status)),
      today_schedule: schedule.today,
      upcoming_schedule: schedule.upcoming,
    },
    ai_agent: {
      objective: "Move safe contract work forward while holding binding or external actions for approval.",
      status: recommendations.length ? "ready" : "watching",
      scanned_at: stamp(state.now),
      recommendations,
      last_run: state.last_agent_run,
    },
  };
}

function openRenewal(account: AccountState, now: string) {
  const opened = !account.renewal_started; account.renewal_started = true; account.snoozed = false;
  if (!account.customer.deals.some((d) => d.id === "renewal-2027")) account.customer.deals.push({ id: "renewal-2027", name: "Renewal 2027", status: "Open" });
  if (opened) account.customer.activity.unshift({ at: stamp(now), text: `Renewal 2027 deal opened on ${account.customer.name}. No new customer created.` });
  return opened;
}

function accept(state: StoredContractState, leadId: string) {
  const lead = state.inbox.find((item) => item.id === leadId || item.id === `se-${leadId}`);
  if (!lead) return;
  if (lead.status === "accepted" && lead.customer_id && state.accounts[lead.customer_id]) { state.active_id = lead.customer_id; return; }
  if (!lead.contacts.length) return;
  if (!lead.contacts.some((c) => c.is_signer)) lead.contacts[0]!.is_signer = true;
  const customerId = lead.customer_id || slug(lead.company); const merged = Boolean(state.accounts[customerId]);
  if (merged) {
    const account = state.accounts[customerId]!;
    account.customer.contract.quote_amount = lead.quote_amount; account.customer.source_crm = lead.source_crm;
    account.customer.contract.name = AGREEMENTS[lead.source_crm]!;
    account.customer.activity.unshift({ at: stamp(state.now), text: `Handoff agent refreshed ${lead.company} from ${lead.source_crm}. Same customer — no duplicate account.` });
  } else {
    state.accounts[customerId] = baseAccount(customerId, lead.company, lead.source_crm, lead.quote_amount, lead.contacts);
    state.accounts[customerId]!.quote_created = fmt(state.now); state.accounts[customerId]!.quote_accepted = fmt(state.now);
  }
  lead.status = "accepted"; lead.accepted_at = stamp(state.now); lead.customer_id = customerId; state.active_id = customerId;
  const account = state.accounts[customerId]!;
  if (!merged || !account.contract_generated) {
    account.negotiation_status = "open"; account.concern = "none"; account.concession_percent = 0;
    account.selected_package_id = ""; account.negotiation_suggestion = "";
    account.negotiation_summary = ""; account.outreach_channel = undefined;
    account.outreach_subject = ""; account.outreach_body = ""; account.outreach_actions = [];
  }
  if (lead.gaps.length) {
    account.customer.activity.unshift({ at: stamp(state.now), text: `Exceptions from inbound: ${lead.gaps.join("; ")}.` });
  }
  state.last_handoff = {
    lead_id: lead.id, customer_id: customerId, company: lead.company, source_crm: lead.source_crm,
    contract_name: AGREEMENTS[lead.source_crm]!, merged,
    steps: [
      `Read ${lead.source_crm} packet for ${lead.company}.`,
      `Detected signer ${signer(account).name}.`,
      `Mapped ${lead.source_crm} → ${AGREEMENTS[lead.source_crm]}.`,
      merged ? `${lead.company} already exists. Refreshed quote on the same account — no duplicate.` : `Opened an account file for ${lead.company}. Quote ${lead.quote_amount} attached.`,
      lead.gaps.length ? `Flagged exceptions: ${lead.gaps.join("; ")}.` : "No blocking exceptions. Commercial desk can lock terms.",
    ],
    gaps: lead.gaps,
  };
}

function emailFor(account: AccountState, band: string, quoteDraft: string) {
  const end = fmt(account.customer.contract.term_end);
  const first = signer(account).name.split(" ")[0];
  const subjects: Record<string, string> = {
    "30": `${account.customer.name} · ${account.customer.contract.name} renews in ${account.days_until_expiry} days`,
    "21": `Following up: ${account.customer.name} renewal — ${account.days_until_expiry} days left`,
    "14": `Two weeks left: ${account.customer.name} ${account.customer.contract.name}`,
    "7": `Final notice: ${account.customer.name} term ends ${end}`,
  };
  const intros: Record<string, string> = {
    "30": `Your ${account.customer.contract.name} term ends on ${end}. Thirty-day notice is due now.`,
    "21": `Checking in — we snoozed this last week. The ${account.customer.contract.name} still ends on ${end}.`,
    "14": `Two weeks remain on the current term (${end}). We should lock Renewal 2027 this week.`,
    "7": `This is the final notice. ${account.customer.name}'s term ends ${end}. After that we are in lapse.`,
  };
  const body = `Hi ${first},\n\n${intros[band] ?? intros["30"]}\n\nDraft Renewal 2027 quote: ${quoteDraft} (5% uplift on ${account.customer.contract.quote_amount}).\nThis stays on the ${account.customer.name} record — we will not open a duplicate account.\nSource CRM: ${account.customer.source_crm}. Signer on file: ${signer(account).name}.\n\nReply to confirm and we will generate the renewal paperwork.\n\n— Vaultline`;
  return { subject: subjects[band] ?? subjects["30"]!, body };
}

function renewalCopilot(state: StoredContractState, customerId: string, action: RenewalAction) {
  const account = state.accounts[customerId]; if (!account) return; state.active_id = customerId; refresh(account, state.now);
  const band = nudgeBand(account.days_until_expiry) ?? "30"; const quote = usd(moneyValue(account.customer.contract.quote_amount) * 1.05);
  const steps = [`Scanned portfolio. Focused ${account.customer.name} (${account.customer.source_crm}).`, `${account.days_until_expiry} days left. Cadence: ${bandLabel(band) ?? "outside notice window"}.`];
  if (account.days_until_expiry > 30 && action !== "snooze") steps.push("Outside the 30-day window. Jump the demo clock to the 30-day notice, then run again.");
  else if (action === "snooze") {
    account.snoozed = true; account.last_nudge_band = band;
    account.customer.activity.unshift({ at: stamp(state.now), text: `Renewal copilot snoozed ${account.customer.name} at ${bandLabel(band)}. Next cadence holds.` });
    steps.push("Snoozed. Will re-nudge at the next cadence.");
  } else {
    const mail = emailFor(account, band, quote);
    account.quote_draft = quote; account.last_nudge_band = band; account.email_subject = mail.subject; account.email_body = mail.body;
    if (action === "run") {
      const opened = openRenewal(account, state.now);
      steps.push(`Drafted ${bandLabel(band)} email to ${signer(account).name}.`, `Drafted Renewal 2027 quote ${quote} (5% on current).`, opened ? "Opened Renewal 2027 on this account. No duplicate account." : "Renewal 2027 was already open on this account.");
    } else {
      account.snoozed = true;
      account.customer.activity.unshift({ at: stamp(state.now), text: `Renewal copilot sent ${bandLabel(band)} to ${signer(account).name}. Quote ${quote}.` });
      steps.push(`Re-nudged at ${bandLabel(band)}. New email drafted to ${signer(account).name}.`);
    }
  }
  state.last_renewal = { customer_id: customerId, company: account.customer.name, action, nudge_band: band, opened_deal: account.renewal_started, quote_draft: account.quote_draft, email_subject: account.email_subject, email_body: account.email_body, steps };
}

function runAgent(state: StoredContractState) {
  Object.values(state.accounts).forEach((item) => refresh(item, state.now));
  const startingAccount = state.accounts[state.active_id] ?? Object.values(state.accounts)[0]!;
  const gaps = state.inbox.filter((lead) => lead.status === "queued" && lead.gaps.length > 0);
  const clean = state.inbox.find((lead) => lead.status === "queued" && lead.gaps.length === 0);
  const waiting = Object.values(state.accounts).filter((item) => item.sign_index === 1);
  const due = Object.values(state.accounts).map(watch).find((item) => item.status === "due");
  const observations = [
    `Scanned ${Object.keys(state.accounts).length} accounts and ${state.inbox.filter((lead) => lead.status === "queued").length} inbound packets.`,
    `${gaps.length} packet${gaps.length === 1 ? "" : "s"} ${gaps.length === 1 ? "has" : "have"} missing data; ${waiting.length} envelope${waiting.length === 1 ? "" : "s"} ${waiting.length === 1 ? "awaits" : "await"} signature.`,
    due ? `${due.name} is inside the ${due.days_until_expiry}-day renewal window.` : "No agreement is currently inside the renewal notice window.",
  ];
  const decisions: string[] = [];
  const actions: string[] = [];
  const guardrails: string[] = [];

  if (startingAccount.negotiation_status === "agreed" && !startingAccount.contract_generated) {
    const selected = packages(startingAccount).find((pkg) => pkg.id === startingAccount.selected_package_id) ?? packages(startingAccount).find((pkg) => pkg.recommended)!;
    startingAccount.contract_generated = true;
    startingAccount.customer.activity.unshift({ at: stamp(state.now), text: `AI agent generated ${startingAccount.customer.contract.name} and order form from locked ${selected.name} terms.` });
    decisions.push(`Locked terms make ${startingAccount.customer.name} paper generation a low-risk action.`);
    actions.push(`Generated ${startingAccount.customer.contract.name} + order form for ${startingAccount.customer.name}.`);
  }

  if (due) {
    renewalCopilot(state, due.customer_id, "run");
    decisions.push(`${due.days_until_expiry}-day notice requires action now; renewal drafting is reversible.`);
    actions.push(`Drafted ${due.name} Renewal 2027 quote and email on the existing account.`);
  }

  if (clean) {
    accept(state, clean.id);
    const accepted = state.accounts[state.active_id]!;
    const recommended = packages(accepted).find((pkg) => pkg.recommended)!;
    accepted.selected_package_id = recommended.id;
    accepted.concern = "none";
    accepted.concession_percent = 0;
    accepted.negotiation_status = "proposed";
    accepted.negotiation_suggestion = `${recommended.name} · quoted terms → ${accepted.customer.contract.quote_amount}`;
    accepted.negotiation_summary = accepted.negotiation_suggestion;
    accepted.customer.activity.unshift({ at: stamp(state.now), text: `AI agent drafted ${recommended.name} commercial position at quoted terms; approval required to lock.` });
    decisions.push(`${clean.company} has a signer and no gaps, so intake is safe to automate.`);
    actions.push(`Mapped ${clean.company} to ${accepted.customer.contract.name} without creating a duplicate.`);
    actions.push(`Drafted ${recommended.name} commercial position; stopped before binding terms.`);
  }

  for (const lead of gaps) {
    guardrails.push(`Held ${lead.company}: ${lead.gaps.join("; ")}.`);
  }
  for (const item of waiting) {
    guardrails.push(`Did not duplicate-contact ${signer(item).name}; signature cadence remains clock-controlled.`);
  }
  const current = state.accounts[state.active_id]!;
  if (current.contract_generated && current.sign_index === 0) {
    guardrails.push(`Did not send ${current.customer.name}'s envelope; external communication needs approval.`);
  }
  if (!actions.length) decisions.push("No reversible action is due; the agent remains on watch.");
  state.last_agent_run = {
    id: `agent-${Date.parse(state.now)}-${(state.last_agent_run?.actions.length ?? 0) + 1}`,
    at: stamp(state.now),
    objective: "Clear exceptions and advance reversible contract work",
    status: guardrails.length ? "guarded" : "completed",
    observations, decisions, actions, guardrails,
  };
}

function applyMutation(state: StoredContractState, mutation: ContractMutation): StoredContractState {
  if (mutation.type === "reset") {
    Object.assign(state, initialContractState());
    return state;
  }
  const account = state.accounts[state.active_id] ?? Object.values(state.accounts)[0]!;
  switch (mutation.type) {
    case "clock": state.now = CLOCK[mutation.preset]; break;
    case "select": if (state.accounts[mutation.customerId]) state.active_id = mutation.customerId; break;
    case "accept": accept(state, mutation.leadId); break;
    case "generate": {
      if (account.negotiation_status !== "agreed") break;
      const selected = packages(account).find((p) => p.id === account.selected_package_id) ?? packages(account).find((p) => p.recommended)!;
      if (!account.contract_generated) {
        account.contract_generated = true;
        account.customer.activity.unshift({ at: stamp(state.now), text: `${account.customer.contract.name} and order form generated from locked ${selected.name} at ${account.customer.contract.quote_amount}.` });
      }
      break;
    }
    case "negotiate": {
      const catalog = packages(account);
      const selected = catalog.find((p) => p.id === mutation.packageId) ?? catalog.find((p) => p.recommended)!;
      const concern = mutation.concern;
      const concession = mutation.concessionPercent;
      const final = negotiatedPrice(account, selected, concern, concession);
      account.selected_package_id = selected.id;
      account.concern = concern;
      account.concession_percent = concession;
      account.negotiation_suggestion = `${selected.name} · ${CONCERN_LABEL[concern]}${concession ? ` · ${concession}% concession` : ""} → ${usd(final)}`;
      if (mutation.action === "propose") {
        account.negotiation_status = "proposed";
        account.negotiation_summary = account.negotiation_suggestion;
        account.outreach_channel = undefined; account.outreach_subject = ""; account.outreach_body = "";
        account.customer.activity.unshift({ at: stamp(state.now), text: `Commercial desk proposed ${account.negotiation_suggestion}.` });
      } else {
        account.negotiation_status = "agreed";
        account.customer.contract.quote_amount = usd(final);
        account.negotiation_summary = `${selected.name} locked at ${usd(final)} (${CONCERN_LABEL[concern]}).`;
        account.customer.activity.unshift({ at: stamp(state.now), text: `Commercial terms locked: ${account.negotiation_summary}` });
      }
      break;
    }
    case "outreach": {
      if (account.negotiation_status !== "proposed") break;
      const channel = mutation.channel;
      const person = signer(account);
      const draft = outreachDraft(account, channel);
      if (channel !== "email") {
        if (!mutation.startsAt || !mutation.endsAt) break;
        if (Date.parse(mutation.endsAt) <= Date.parse(mutation.startsAt)) break;
      }
      const window = channel === "email" || !mutation.startsAt || !mutation.endsAt
        ? stamp(state.now)
        : `${fmt(mutation.startsAt)} ${new Date(mutation.startsAt).toISOString().slice(11, 16)}–${new Date(mutation.endsAt).toISOString().slice(11, 16)} UTC`;
      const item: OutreachAction = {
        id: `out-${Date.parse(state.now)}-${(account.outreach_actions?.length ?? 0) + 1}`,
        channel, status: channel === "email" ? "sent" : "scheduled", at: stamp(state.now),
        starts_at: mutation.startsAt, ends_at: mutation.endsAt, with_name: person.name, with_email: person.email,
        subject: draft.subject, body: draft.body,
        provider: mutation.provider,
        meeting_url: mutation.meetingUrl,
        calendar_event_url: mutation.calendarEventUrl,
        calendar_event_id: mutation.calendarEventId,
        integration_note: mutation.integrationNote,
      };
      account.outreach_actions = [item, ...(account.outreach_actions ?? [])];
      account.outreach_channel = channel;
      account.outreach_subject = draft.subject;
      account.outreach_body = draft.body;
      const note = channel === "email"
        ? `Email sent to ${person.name} <${person.email}> · ${draft.subject}. Captured on this account.`
        : channel === "call"
          ? `Call scheduled with ${person.name}: ${window}. Saved as an action on this account.`
          : mutation.provider === "google_calendar"
            ? `Google Meet scheduled with ${person.name}: ${window}. Calendar event and Meet details saved on this account.`
            : mutation.provider === "demo"
              ? `Demo Google Meet saved for ${person.name}: ${window}. Link is a placeholder — nothing booked on Google Calendar.`
              : `Meeting scheduled with ${person.name}: ${window}. Saved internally on this account file.`;
      account.customer.activity.unshift({ at: stamp(state.now), text: note });
      break;
    }
    case "send":
      if (account.contract_generated && account.sign_index === 0) {
        account.sent_at = state.now;
        account.reminder_sent_at = undefined;
        account.reminder_count = 0;
        account.docusign_envelope_id = mutation.envelopeId;
        account.docusign_envelope_url = mutation.envelopeUrl;
        account.docusign_provider = "demo";
        account.docusign_note = "Demo profile: the DocuSign signing page was skipped. In live, Vaultline navigates the signer to DocuSign and returns here once both parties have signed.";
        account.sign_index = 4;
        const who = signer(account).name;
        account.customer.activity.unshift(
          { at: stamp(state.now), text: `${account.customer.contract.name} fully executed. Signed Contract stored on ${account.customer.name}. Initial Purchase → Won.` },
          { at: stamp(state.now), text: "Experience.com countersigned (demo — DocuSign page skipped)." },
          { at: stamp(state.now), text: `${who} signed (demo — DocuSign page skipped).` },
          { at: stamp(state.now), text: `${account.customer.contract.name} sent for signature to ${who}. Demo skipped the DocuSign signing page; live would open DocuSign and return here after signing.` },
        );
      }
      break;
    case "signing-sync":
      if (account.contract_generated && mutation.signIndex > account.sign_index && mutation.signIndex <= 4) {
        account.sign_index = mutation.signIndex;
        if (mutation.note) account.docusign_note = mutation.note;
        const notes = ["", "", `Customer signed ${account.customer.contract.name}.`, "Experience.com countersigned.", `${account.customer.contract.name} fully executed. Signed Contract stored on ${account.customer.name}. Initial Purchase → Won.`];
        account.customer.activity.unshift({ at: stamp(state.now), text: notes[account.sign_index] ?? mutation.note ?? "Envelope updated from DocuSign." });
      }
      break;
    case "advance":
      if (account.contract_generated && account.sign_index < 4) { account.sign_index += 1; const notes = ["", "", `Customer signed ${account.customer.contract.name}.`, "Experience.com countersigned.", `${account.customer.contract.name} fully executed. Signed Contract stored on ${account.customer.name}. Initial Purchase → Won.`]; account.customer.activity.unshift({ at: stamp(state.now), text: notes[account.sign_index]! }); }
      break;
    case "renewal-start":
      if (account.days_until_expiry > 30) state.now = CLOCK.renewal_window; refresh(account, state.now); openRenewal(account, state.now); break;
    case "renewal-copilot": renewalCopilot(state, mutation.customerId, mutation.action); break;
    case "agent-run": runAgent(state); break;
  }
  return state;
}

async function locked<T>(work: (state: StoredContractState) => T): Promise<T> {
  return persistLocked((state) => {
    hydrateSeedAccounts(state);
    return work(state);
  }, initialContractState);
}

export async function getContractState(): Promise<AppState> {
  return locked((state) => snapshot(state));
}
export async function mutateContractState(mutation: ContractMutation): Promise<AppState> {
  return locked((state) => snapshot(applyMutation(state, mutation)));
}
export async function enqueueQuoteHandoff(payload: QuoteHandoffPayload): Promise<HandoffLead> {
  return locked((state) => {
    const lead = leadFromPayload(payload); const index = state.inbox.findIndex((item) => item.id === lead.id);
    if (index >= 0) { lead.customer_id = state.inbox[index]!.customer_id || lead.customer_id; state.inbox[index] = lead; }
    else state.inbox.unshift(lead);
    return lead;
  });
}
export async function getContractHandoff(leadId: string): Promise<HandoffLead | null> {
  return locked((state) => state.inbox.find((item) => item.id === leadId || item.id === `se-${leadId}`) ?? null);
}
export async function getExecutedCustomer(customerId: string) {
  return locked((state) => {
    const account = state.accounts[customerId];
    return account && account.sign_index >= 4 ? account.customer : null;
  });
}
