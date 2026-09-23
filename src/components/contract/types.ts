export type ContractView = "home" | "inbound" | "commercial" | "paper" | "signing" | "vault" | "renewal";
export type ClockPreset = "start" | "signing_day_3" | "renewal_window" | "day_21" | "day_14" | "day_7";
export type NegotiationConcern = "none" | "price" | "term" | "legal";
export type AgentAction = "accept-packet" | "propose-commercials" | "lock-commercials" | "generate-paper" | "send-envelope" | "run-renewal" | "wait";

export interface Contact {
  name: string;
  role: string;
  is_signer: boolean;
  email: string;
}

export interface HandoffLead {
  id: string;
  source_crm?: string;
  company: string;
  quote_amount: string;
  status: "queued" | "accepted";
  why_qualified: string;
  gaps: string[];
  contacts: Contact[];
  customer_id?: string;
}

export interface AgentRun {
  company: string;
  steps: string[];
  quote_draft?: string;
  email_subject?: string;
  email_body?: string;
  gaps?: string[];
  merged?: boolean;
}

export interface AIOperationsRun {
  id: string;
  at: string;
  objective: string;
  status: "completed" | "guarded";
  observations: string[];
  decisions: string[];
  actions: string[];
  guardrails: string[];
}

export interface RenewalWatch {
  customer_id: string;
  name: string;
  source_crm: string;
  contract_name: string;
  quote_amount: string;
  signer: string;
  signer_email: string;
  days_until_expiry: number;
  status: "watching" | "due" | "snoozed" | "open" | "expired";
  next_nudge?: string;
  last_activity: string;
}

export interface Customer {
  id: string;
  name: string;
  source_crm?: string;
  contacts: Contact[];
  deals: Array<{ id: string; name: string; status: string }>;
  contract: {
    name: string;
    status: string;
    term_start: string;
    term_end: string;
    quote_amount: string;
  };
  documents: Array<{
    name: string;
    type: string;
    version: string;
    status: string;
    signed: string;
    expiry: string;
    filename?: string;
    download_url?: string;
  }>;
  activity: Array<{ at: string; text: string }>;
}

export interface ContractState {
  now: string;
  sign_index: number;
  contract_generated: boolean;
  customer: Customer;
  customers: Array<{ id: string; name: string; source_crm: string; contract_name: string }>;
  inbox: HandoffLead[];
  last_handoff?: AgentRun;
  watchlist: RenewalWatch[];
  last_renewal?: AgentRun;
  contract_packages: Array<{
    id: string;
    name: string;
    features: string[];
    best_for: string;
    recommended: boolean;
    display_price: string;
  }>;
  negotiation: {
    status: "open" | "proposed" | "agreed";
    selected_package_id: string;
    selected_package_name: string;
    concern: string;
    concern_label: string;
    concession_percent: number;
    list_price: string;
    final_price: string;
    suggestion: string;
    summary: string;
    outreach_channel?: "call" | "email" | "meet";
    outreach_label?: string;
    outreach_subject?: string;
    outreach_body?: string;
    outreach_actions?: Array<{
      id: string;
      channel: "call" | "email" | "meet";
      status: "scheduled" | "sent";
      at: string;
      starts_at?: string;
      ends_at?: string;
      with_name: string;
      with_email: string;
      subject: string;
      body: string;
      provider?: "internal" | "google_calendar" | "demo";
      meeting_url?: string;
      calendar_event_url?: string;
      calendar_event_id?: string;
      integration_note?: string;
    }>;
  };
  signing_watch: {
    status: "not_sent" | "waiting_customer" | "customer_signed" | "countersigned" | "fully_executed";
    signer: string;
    signer_email: string;
    sent_at?: string;
    days_waiting: number;
    reminder_due_at?: string;
    reminder_due?: boolean;
    reminder_sent_at?: string;
    reminder_count: number;
    envelope_id?: string;
    envelope_url?: string;
    provider?: "docusign" | "demo";
    note?: string;
  };
  demo_clock: { now: string; preset: ClockPreset; label: string };
  exceptions: {
    gaps: HandoffLead[];
    waiting_signatures: Array<{ customer_id: string; name: string; signer: string }>;
    due_renewals: RenewalWatch[];
    today_schedule: Array<{
      id: string;
      customer_id: string;
      company: string;
      channel: "call" | "meet";
      with_name: string;
      with_email: string;
      starts_at: string;
      ends_at?: string;
      subject: string;
      meeting_url?: string;
      provider?: "internal" | "google_calendar" | "demo";
      when: "today" | "clock" | "upcoming";
    }>;
    upcoming_schedule: Array<{
      id: string;
      customer_id: string;
      company: string;
      channel: "call" | "meet";
      with_name: string;
      with_email: string;
      starts_at: string;
      ends_at?: string;
      subject: string;
      meeting_url?: string;
      provider?: "internal" | "google_calendar" | "demo";
      when: "today" | "clock" | "upcoming";
    }>;
  };
  ai_agent: {
    objective: string;
    status: "ready" | "watching";
    scanned_at: string;
    recommendations: Array<{
      id: string;
      title: string;
      intent: string;
      priority: "high" | "medium" | "low";
      confidence: number;
      risk: "low" | "medium";
      requires_approval: boolean;
      evidence: string[];
      action_label: string;
      action: AgentAction;
      target_id?: string;
    }>;
    last_run?: AIOperationsRun;
  };
}
