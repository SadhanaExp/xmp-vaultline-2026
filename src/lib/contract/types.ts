/** Optional inbound payload from a lead workspace. Demo data does not require it. */
export interface QuoteHandoffPayload {
  opportunity: { id: string };
  customer: { key: string; name: string };
  need: { summary: string | null; primary_need: string | null; integrations: string[] };
  sizing: { users: number | null };
  qualification: { budget: string | null; decision_maker: string | null; missing: string[] };
  contacts: Array<{ name: string; email: string | null; title: string | null; is_primary: boolean }>;
  insights: string[];
}

export type SignStep =
  | "Draft"
  | "Sent to Customer"
  | "Customer Signed"
  | "Experience.com Countersigned"
  | "Fully Executed";
export type CrmSource = "Encompass" | "BytePro" | "Total Expert" | "AgencyZoom" | "Experience.com";

export interface Contact { name: string; role: string; is_signer: boolean; email: string }
export interface Deal { id: string; name: string; status: string }
export interface Contract {
  name: string; status: SignStep; generated: boolean; term_start: string; term_end: string; quote_amount: string;
}
export interface Document {
  name: string; type: string; version: string; created: string; status: string; signed: string; expiry: string;
  filename?: string; download_url?: string;
}
export interface Activity { at: string; text: string }
export interface Customer {
  id: string; name: string; source_crm: string; contacts: Contact[]; deals: Deal[];
  contract: Contract; documents: Document[]; activity: Activity[];
}
export interface AccountSummary { id: string; name: string; source_crm: string; contract_name: string }
export interface HandoffLead {
  id: string; source_crm: CrmSource; company: string; quote_amount: string; quote_version: string;
  status: "queued" | "accepted"; why_qualified: string; gaps: string[]; contacts: Contact[];
  accepted_at?: string; customer_id?: string; budget_context?: string;
}
export interface HandoffRun {
  lead_id: string; customer_id: string; company: string; source_crm: string; contract_name: string;
  merged: boolean; steps: string[]; gaps: string[];
}
export interface RenewalWatch {
  customer_id: string; name: string; source_crm: string; contract_name: string; quote_amount: string;
  signer: string; signer_email: string; term_end: string; days_until_expiry: number;
  status: "watching" | "due" | "snoozed" | "open" | "expired"; nudge_band?: string;
  last_nudge_band?: string; next_nudge?: string; last_activity: string; executed: boolean;
}
export interface RenewalRun {
  customer_id: string; company: string; action: string; nudge_band?: string; opened_deal: boolean;
  quote_draft: string; email_subject: string; email_body: string; steps: string[];
}
export interface ContractPackage {
  id: string; name: string; annual_price: number; display_price: string; features: string[];
  best_for: string; recommended: boolean;
}
export type OutreachChannel = "call" | "email" | "meet";
export interface OutreachAction {
  id: string; channel: OutreachChannel; status: "scheduled" | "sent";
  at: string; starts_at?: string; ends_at?: string; with_name: string; with_email: string;
  subject: string; body: string;
  provider?: "internal" | "google_calendar" | "demo"; meeting_url?: string; calendar_event_url?: string;
  calendar_event_id?: string; integration_note?: string;
}
export interface ContractNegotiation {
  status: "open" | "proposed" | "agreed"; selected_package_id: string; selected_package_name: string;
  concern: string; concern_label: string; concession_percent: number; list_price: string;
  final_price: string; suggestion: string; summary: string;
  outreach_channel?: OutreachChannel; outreach_label: string; outreach_subject: string; outreach_body: string;
  outreach_actions: OutreachAction[];
}
export type ClockPreset = "start" | "signing_day_3" | "renewal_window" | "day_21" | "day_14" | "day_7";
export type RenewalAction = "run" | "snooze" | "nudge";
export type NegotiationConcern = "none" | "price" | "term" | "legal";

export interface SigningWatch {
  status: "not_sent" | "waiting_customer" | "customer_signed" | "countersigned" | "fully_executed";
  signer: string; signer_email: string; sent_at?: string; days_waiting: number; reminder_due_at?: string;
  reminder_due: boolean; reminder_sent_at?: string; reminder_count: number;
  envelope_id?: string; envelope_url?: string; provider?: "docusign" | "demo"; note?: string;
}
export interface DemoClock { now: string; preset: ClockPreset; label: string }
export interface WaitingSignature { customer_id: string; name: string; signer: string }
export interface ScheduleNotice {
  id: string; customer_id: string; company: string; channel: "call" | "meet";
  with_name: string; with_email: string; starts_at: string; ends_at?: string;
  subject: string; meeting_url?: string; provider?: OutreachAction["provider"];
  when: "today" | "clock" | "upcoming";
}
export interface ContractExceptions {
  gaps: HandoffLead[]; waiting_signatures: WaitingSignature[]; due_renewals: RenewalWatch[];
  today_schedule: ScheduleNotice[]; upcoming_schedule: ScheduleNotice[];
}
export type AgentAction =
  | "accept-packet"
  | "propose-commercials"
  | "lock-commercials"
  | "generate-paper"
  | "send-envelope"
  | "run-renewal"
  | "wait";
export interface AgentRecommendation {
  id: string; title: string; intent: string; priority: "high" | "medium" | "low";
  confidence: number; risk: "low" | "medium"; requires_approval: boolean;
  evidence: string[]; action_label: string; action: AgentAction; target_id?: string;
}
export interface AgentRun {
  id: string; at: string; objective: string; status: "completed" | "guarded";
  observations: string[]; decisions: string[]; actions: string[]; guardrails: string[];
}
export interface AIAgentState {
  objective: string; status: "ready" | "watching"; scanned_at: string;
  recommendations: AgentRecommendation[]; last_run?: AgentRun;
}
export interface AppState {
  now: string; sign_index: number; contract_generated: boolean; renewal_started: boolean; customer: Customer;
  customers: AccountSummary[]; days_until_expiry: number; renewal_due: boolean; inbox: HandoffLead[];
  last_handoff?: HandoffRun; watchlist: RenewalWatch[]; last_renewal?: RenewalRun;
  contract_packages: ContractPackage[]; negotiation: ContractNegotiation; signing_watch: SigningWatch;
  demo_clock: DemoClock; exceptions: ContractExceptions; ai_agent: AIAgentState;
}

export interface AccountState {
  customer: Customer; sign_index: number; contract_generated: boolean; renewal_started: boolean;
  days_until_expiry: number; renewal_due: boolean; quote_created: string; quote_accepted: string;
  quote_expiry: string; snoozed: boolean; last_nudge_band?: string; quote_draft: string;
  email_subject: string; email_body: string; selected_package_id: string; negotiation_summary: string;
  concern: string; concession_percent: number; negotiation_status: "open" | "proposed" | "agreed";
  negotiation_suggestion: string; outreach_channel?: OutreachChannel; outreach_subject: string; outreach_body: string;
  outreach_actions: OutreachAction[];
  sent_at?: string; reminder_sent_at?: string; reminder_count: number;
  docusign_envelope_id?: string; docusign_envelope_url?: string; docusign_note?: string;
  docusign_provider?: "docusign" | "demo";
}
export interface StoredContractState {
  now: string; active_id: string; accounts: Record<string, AccountState>; inbox: HandoffLead[];
  last_handoff?: HandoffRun; last_renewal?: RenewalRun; last_agent_run?: AgentRun;
}

export type ContractMutation =
  | { type: "reset" }
  | { type: "clock"; preset: ClockPreset }
  | { type: "select"; customerId: string }
  | { type: "accept"; leadId: string }
  | { type: "generate" }
  | { type: "negotiate"; packageId: string; concern: NegotiationConcern; concessionPercent: number; action: "propose" | "finalize" }
  | {
      type: "outreach"; channel: OutreachChannel; startsAt?: string; endsAt?: string;
      provider?: "internal" | "google_calendar" | "demo"; meetingUrl?: string; calendarEventUrl?: string;
      calendarEventId?: string; integrationNote?: string;
    }
  | { type: "send"; envelopeId?: string; envelopeUrl?: string; note?: string; provider?: "docusign" | "demo" }
  | { type: "advance" }
  | { type: "signing-sync"; signIndex: number; note?: string }
  | { type: "renewal-start" }
  | { type: "renewal-copilot"; customerId: string; action: RenewalAction }
  | { type: "agent-run" };
