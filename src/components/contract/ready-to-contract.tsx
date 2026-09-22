"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  BrainCircuit,
  BookOpen,
  Building2,
  ChevronDown,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileCheck2,
  FileStack,
  Home,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  PenLine,
  Phone,
  RefreshCw,
  Scale,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Video,
  Zap,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import type { AgentRun, ClockPreset, ContractState, ContractView, HandoffLead, NegotiationConcern, RenewalWatch } from "./types";

const API = "/api/contract";
const nav: Array<{ id: ContractView; label: string; icon: typeof Home }> = [
  { id: "home", label: "Triage desk", icon: Home },
  { id: "inbound", label: "Inbound desk", icon: Inbox },
  { id: "commercial", label: "Commercial desk", icon: Scale },
  { id: "paper", label: "Paper room", icon: FileStack },
  { id: "signing", label: "Ready to Contract", icon: PenLine },
  { id: "vault", label: "Vault", icon: FileCheck2 },
  { id: "renewal", label: "Renewal book", icon: BookOpen },
];
const signSteps = ["Draft", "Sent to Customer", "Customer Signed", "Experience.com Countersigned", "Fully Executed"];
const clockOptions: Array<{ id: ClockPreset; label: string }> = [
  { id: "start", label: "Term start" },
  { id: "signing_day_3", label: "Signing +3d" },
  { id: "renewal_window", label: "30-day notice" },
  { id: "day_21", label: "21 days" },
  { id: "day_14", label: "14 days" },
  { id: "day_7", label: "7 days" },
];
const concerns: Array<{ id: NegotiationConcern; label: string }> = [
  { id: "none", label: "Quoted terms" },
  { id: "price", label: "Price" },
  { id: "term", label: "Term" },
  { id: "legal", label: "Legal" },
];
const playbook = [
  "Signer required on the inbound packet.",
  "Same company maps to the same account — never duplicate.",
  "Commercial terms lock before paper can generate.",
  "Unsigned envelopes remind after three days.",
  "Renewal notice starts 30 days before term end.",
];

async function api(path: string, body?: unknown): Promise<ContractState> {
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(problem?.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<ContractState>;
}

function formatDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00`).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWindow(start?: string, end?: string) {
  if (!start) return "";
  if (!end) return formatDateTime(start);
  return `${formatDateTime(start)} – ${new Date(end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{children}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "open" || status === "accepted" || status === "agreed" || status === "Fully Executed" || status === "Executed" || status === "sent"
      ? "success"
      : status === "due" || status === "queued" || status === "waiting" || status === "proposed" || status === "scheduled"
        ? "warning"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

type Act = (path: string, body?: unknown, view?: ContractView) => void;
interface ViewProps {
  state: ContractState;
  act: Act;
  go?: (view: ContractView) => void;
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card className="overflow-hidden border-l-4 border-l-primary">
      <CardContent className="p-5">
        <Eyebrow>{label}</Eyebrow>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Spine({ next, onClick, disabled }: { next: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-primary/15 bg-accent px-4 py-3">
      <p className="text-sm text-navy">Continue to the next desk</p>
      <Button size="sm" disabled={disabled} onClick={onClick}>{next}</Button>
    </div>
  );
}

function PlaybookCard() {
  return (
    <Card className="h-fit">
      <CardHeader>
        <Eyebrow>Playbook</Eyebrow>
        <CardTitle>Why the agent acts</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm text-muted-foreground">
          {playbook.map((rule, index) => (
            <li key={rule} className="flex gap-3"><span className="font-mono text-xs text-primary">{index + 1}</span>{rule}</li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ExceptionStrip({
  state,
  go,
  onSchedule,
}: {
  state: ContractState;
  go: (view: ContractView) => void;
  onSchedule: () => void;
}) {
  const { gaps, waiting_signatures: waiting, due_renewals: due, today_schedule: today } = state.exceptions;
  const items = [
    { key: "today", count: today.length, label: "Calls today", detail: today.map((item) => `${item.channel === "meet" ? "Meet" : "Call"} · ${item.company}`).join(" · ") || "None scheduled", view: "schedule" as const },
    { key: "gaps", count: gaps.length, label: "Inbound gaps", detail: gaps.map((g) => g.company).join(" · ") || "None", view: "inbound" as const },
    { key: "sign", count: waiting.length, label: "Waiting signatures", detail: waiting.map((w) => w.name).join(" · ") || "None", view: "signing" as const },
    { key: "renew", count: due.length, label: "Due renewals", detail: due.map((r) => r.name).join(" · ") || "None", view: "renewal" as const },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          onClick={() => (item.view === "schedule" ? onSchedule() : go(item.view))}
          className={cn(
            "rounded-2xl border p-4 text-left transition hover:border-primary/40",
            item.count ? "border-amber-200 bg-amber-50" : "border-border bg-white",
          )}
        >
          <Eyebrow>{item.label}</Eyebrow>
          <p className="text-2xl font-bold">{item.count}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
        </button>
      ))}
    </div>
  );
}

function ScheduleRow({
  item,
  onOpen,
}: {
  item: ContractState["exceptions"]["today_schedule"][number];
  onOpen: (customerId: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold capitalize">{item.channel} · {item.company}</p>
            {item.when === "today" && <Badge variant="warning">today</Badge>}
            {item.when === "clock" && <Badge variant="navy">on demo clock</Badge>}
            {item.when === "upcoming" && <Badge variant="secondary">upcoming</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.with_name}{item.with_email ? ` · ${item.with_email}` : ""}</p>
          <p className="mt-1 text-sm">{formatWindow(item.starts_at, item.ends_at)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.subject}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.meeting_url && (
            <a href={item.meeting_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              <Video className="h-4 w-4" />Join Meet
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={() => onOpen(item.customer_id)}>Open file</Button>
        </div>
      </div>
    </div>
  );
}

function AIOperationsAgent({ state, act, go }: ViewProps) {
  const agent = state.ai_agent;
  const run = agent.last_run;
  const pending = agent.recommendations.length;
  const destination = (action: string): ContractView => {
    if (action === "accept-packet") return "inbound";
    if (action === "propose-commercials" || action === "lock-commercials") return "commercial";
    if (action === "generate-paper") return "paper";
    if (action === "send-envelope" || action === "wait") return "signing";
    return "renewal";
  };
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-primary">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Needs attention</span>
                <Badge variant={pending ? "warning" : "secondary"}>{pending ? `${pending} open` : agent.status}</Badge>
              </div>
              <CardTitle>Exceptions the agent can clear</CardTitle>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{agent.objective}</p>
            </div>
          </div>
          <Button onClick={() => act("/agent/run", {})}>
            <AlertTriangle className="h-4 w-4" />
            {pending ? `Needs attention · ${pending}` : "Needs attention"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 xl:grid-cols-2">
          {agent.recommendations.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.priority === "high" ? "warning" : "secondary"}>{item.priority}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{item.confidence}% confidence</span>
                  </div>
                  <h3 className="mt-2 font-semibold">{item.title}</h3>
                </div>
                {item.requires_approval ? <LockKeyhole className="h-4 w-4 shrink-0 text-warning" /> : <Zap className="h-4 w-4 shrink-0 text-primary" />}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.intent}</p>
              <ul className="mt-3 space-y-1 text-xs text-foreground/80">
                {item.evidence.slice(0, 2).map((evidence) => <li key={evidence}>• {evidence}</li>)}
              </ul>
              <button type="button" onClick={() => go!(destination(item.action))} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                {item.requires_approval ? <LockKeyhole className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{item.action_label}
              </button>
            </div>
          ))}
        </div>
        {run && (
          <div className="rounded-2xl border border-border bg-muted/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Last run · {run.at}</p>
                <h3 className="mt-1 font-semibold">{run.objective}</h3>
              </div>
              <Badge variant={run.status === "guarded" ? "warning" : "success"}>{run.status}</Badge>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[
                { label: "Observed", icon: Eye, items: run.observations },
                { label: "Decided", icon: BrainCircuit, items: run.decisions },
                { label: "Acted", icon: CircleCheck, items: [...run.actions, ...run.guardrails.map((item) => `Guardrail · ${item}`)] },
              ].map(({ label, icon: Icon, items }) => (
                <div key={label}>
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                    {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No action required.</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" />Autonomous: reversible internal work</span>
          <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-warning" />Approval: binding terms and external sends</span>
          <span className="ml-auto">Scanned {agent.scanned_at}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminHome({ state, act, go, onSchedule }: ViewProps & { onSchedule: () => void }) {
  const queued = state.inbox.filter((lead) => lead.status === "queued");
  const today = state.exceptions.today_schedule ?? [];
  const upcoming = state.exceptions.upcoming_schedule ?? [];
  return (
    <div className="space-y-5">
      <AIOperationsAgent state={state} act={act} go={go} />
      <ExceptionStrip state={state} go={go!} onSchedule={onSchedule} />
      {(today.length > 0 || upcoming.length > 0) && (
        <Card className="border-amber-200">
          <CardHeader>
            <Eyebrow>Today’s schedule</Eyebrow>
            <CardTitle>{today.length ? `${today.length} call${today.length === 1 ? "" : "s"} and Meet${today.length === 1 ? "" : "s"} on the book` : "Upcoming calls and Meets"}</CardTitle>
            <p className="text-sm text-muted-foreground">Saved outreach from Commercial desk — notify here instead of hunting the account file.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {today.map((item) => (
              <ScheduleRow key={item.id} item={item} onOpen={(customerId) => act("/account/select", { customer_id: customerId }, "commercial")} />
            ))}
            {today.length === 0 && upcoming.slice(0, 3).map((item) => (
              <ScheduleRow key={item.id} item={item} onOpen={(customerId) => act("/account/select", { customer_id: customerId }, "commercial")} />
            ))}
            <Button size="sm" variant="secondary" onClick={onSchedule}><BellRing className="h-4 w-4" />Open schedule</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label="Accounts" value={state.customers.length} note="Agreement workspaces" />
        <MetricCard label="Inbound packets" value={queued.length} note="Waiting intake from CRM" />
        <MetricCard label="Calls today" value={today.length} note={upcoming.length ? `${upcoming.length} upcoming` : "From Commercial desk"} />
        <MetricCard label="Open file" value={state.customer.name} note={`${state.customer.contract.name} · ${state.negotiation.status}`} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/80">
          <Eyebrow>Portfolio</Eyebrow>
          <CardTitle>Accounts and agreements</CardTitle>
          <p className="text-sm text-muted-foreground">Clock, signer, and paper — not opportunity stage.</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
              <tr>{["Account", "Source", "Agreement", "Quote / clock", "Renewal"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {state.customers.map((account) => {
                const renewal = state.watchlist.find((item) => item.customer_id === account.id);
                const active = account.id === state.customer.id;
                return (
                  <tr key={account.id} className="border-t transition-colors hover:bg-muted/60">
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => act("/account/select", { customer_id: account.id }, "commercial")} className="font-semibold text-primary hover:underline">
                        {account.name}
                      </button>
                      {active && <Badge className="ml-2" variant="secondary">open</Badge>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{account.source_crm}</td>
                    <td className="px-5 py-4">{account.contract_name}</td>
                    <td className="px-5 py-4">{renewal?.quote_amount ?? "—"}{renewal && <span className="text-muted-foreground"> · {Math.max(renewal.days_until_expiry, 0)}d</span>}</td>
                    <td className="px-5 py-4">{renewal ? <StatusBadge status={`${renewal.status} · ${Math.max(renewal.days_until_expiry, 0)}d`} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AgentPanel({ run, title }: { run?: AgentRun; title: string }) {
  return (
    <Card className="h-fit">
      <CardHeader><Eyebrow>{title}</Eyebrow><CardTitle>{run?.company ?? "Waiting to run"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {run ? (
          <>
            <ol className="space-y-3 pl-5 text-sm text-muted-foreground">
              {run.steps.map((step) => <li key={step} className="list-decimal">{step}</li>)}
            </ol>
            {run.quote_draft && <div className="rounded-xl border bg-muted p-4"><Eyebrow>Draft quote</Eyebrow><strong>{run.quote_draft}</strong></div>}
            {run.email_body && (
              <div className="rounded-xl border bg-muted p-4">
                <Eyebrow>Draft email</Eyebrow>
                <strong className="block text-sm">{run.email_subject}</strong>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">{run.email_body}</pre>
              </div>
            )}
          </>
        ) : <p className="text-sm leading-6 text-muted-foreground">Select an action and the desk log appears here.</p>}
      </CardContent>
    </Card>
  );
}

function PacketCard({ lead, act }: { lead: HandoffLead; act: Act }) {
  const signer = lead.contacts.find((item) => item.is_signer) ?? lead.contacts[0];
  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{lead.source_crm ?? "CRM"} packet</p>
            <h3 className="font-bold">{lead.company}</h3>
            <p className="text-xs text-muted-foreground">{lead.quote_amount}</p>
          </div>
          <StatusBadge status={lead.status} />
        </div>
        <p className="my-3 text-sm leading-6 text-muted-foreground">{lead.why_qualified}</p>
        <p className="text-xs text-muted-foreground">Signer: {signer?.name ?? "Missing"} · {signer?.email || "no email"}</p>
        {lead.gaps.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{lead.gaps.map((gap) => <Badge key={gap} variant="warning">{gap}</Badge>)}</div>}
        <div className="mt-4">
          {lead.status === "queued" ? (
            <Button size="sm" onClick={() => act("/handoff/accept", { lead_id: lead.id }, "commercial")}>Accept packet</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => act("/account/select", { customer_id: lead.customer_id }, "commercial")}>Open commercial desk</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InboundView({ state, act, go }: ViewProps) {
  const queued = state.inbox.filter((lead) => lead.status === "queued");
  const accepted = state.inbox.filter((lead) => lead.status === "accepted");
  return (
    <div className="space-y-4">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Eyebrow>Intake from another system</Eyebrow>
              <CardTitle>{queued.length === 1 ? "1 CRM packet in the tray" : `${queued.length} CRM packets in the tray`}</CardTitle>
              <p className="text-sm text-muted-foreground">Gaps, signer, and agreement type — not a sales pipeline.</p>
            </CardHeader>
          </Card>
          {queued.map((lead) => <PacketCard key={lead.id} lead={lead} act={act} />)}
          <Card>
            <CardHeader><Eyebrow>Already on file</Eyebrow></CardHeader>
            <CardContent className="space-y-3">{accepted.map((lead) => <PacketCard key={lead.id} lead={lead} act={act} />)}</CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <AgentPanel run={state.last_handoff} title="Intake agent" />
          <PlaybookCard />
        </div>
      </div>
      <Spine next="Commercial desk" onClick={() => go!("commercial")} />
    </div>
  );
}

function PartiesRail({ state }: { state: ContractState }) {
  const c = state.customer;
  return (
    <Card className="h-fit">
      <CardHeader>
        <Eyebrow>Account file</Eyebrow>
        <CardTitle>{c.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{c.source_crm} · {c.contract.name}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <Eyebrow>Parties</Eyebrow>
          {c.contacts.map((person) => (
            <div key={`${person.name}-${person.email}`} className="mb-2">
              {person.name} — {person.role}
              {person.is_signer && <Badge className="ml-2">signer</Badge>}
            </div>
          ))}
        </section>
        <section>
          <Eyebrow>Matters</Eyebrow>
          {c.deals.map((deal) => <div key={deal.id} className="mb-1 flex justify-between gap-2">{deal.name}<StatusBadge status={deal.status} /></div>)}
        </section>
        <section>
          <Eyebrow>Actions</Eyebrow>
          {(state.negotiation.outreach_actions ?? []).length === 0 && <p className="text-xs text-muted-foreground">No call, email, or meeting captured yet.</p>}
          {(state.negotiation.outreach_actions ?? []).slice(0, 4).map((item) => (
            <div key={item.id} className="mb-3 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold capitalize">{item.channel}</span>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.with_name}{item.with_email ? ` · ${item.with_email}` : ""}</p>
              {item.channel === "email" ? (
                <p className="mt-1 text-xs">Sent {item.at}</p>
              ) : (
                <p className="mt-1 text-xs">{formatWindow(item.starts_at, item.ends_at)}</p>
              )}
              {item.meeting_url && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={item.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                    <Video className="h-3 w-3" />Join Google Meet
                  </a>
                  {item.provider === "demo" && <Badge variant="secondary">demo</Badge>}
                </div>
              )}
            </div>
          ))}
        </section>
        <section>
          <Eyebrow>Activity</Eyebrow>
          <div className="space-y-2">
            {c.activity.slice(0, 4).map((item, index) => (
              <p key={`${item.at}-${index}`} className="text-xs leading-5 text-muted-foreground"><span className="font-mono">{item.at}</span> · {item.text}</p>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function CommercialView({ state, act, go }: ViewProps) {
  const [packageId, setPackageId] = useState(state.negotiation.selected_package_id);
  const [concern, setConcern] = useState<NegotiationConcern>((concerns.some((c) => c.id === state.negotiation.concern) ? state.negotiation.concern : "none") as NegotiationConcern);
  const [concession, setConcession] = useState(state.negotiation.concession_percent);
  const [channel, setChannel] = useState<"call" | "email" | "meet">();
  const defaultStart = useMemo(() => {
    const start = new Date(state.now);
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 2);
    return toLocalInput(start.toISOString());
  }, [state.now, state.customer.id]);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => {
    const end = new Date(defaultStart);
    end.setMinutes(end.getMinutes() + 30);
    return toLocalInput(end.toISOString());
  });
  useEffect(() => {
    setPackageId(state.negotiation.selected_package_id);
    setConcern((concerns.some((c) => c.id === state.negotiation.concern) ? state.negotiation.concern : "none") as NegotiationConcern);
    setConcession(state.negotiation.concession_percent);
  }, [state.negotiation.selected_package_id, state.negotiation.concern, state.negotiation.concession_percent, state.customer.id]);
  useEffect(() => {
    setStartsAt(defaultStart);
    const end = new Date(defaultStart);
    end.setMinutes(end.getMinutes() + (channel === "meet" ? 25 : 30));
    setEndsAt(toLocalInput(end.toISOString()));
  }, [defaultStart, channel]);
  const locked = state.negotiation.status === "agreed";
  const payload = { package_id: packageId, concern, concession_percent: concession };
  const signer = state.customer.contacts.find((person) => person.is_signer) ?? state.customer.contacts[0];
  const actions = state.negotiation.outreach_actions ?? [];
  const saveOutreach = () => {
    if (!channel) return;
    if (channel === "email") {
      act("/contract/outreach", { channel });
      return;
    }
    act("/contract/outreach", { channel, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Eyebrow>Approval desk</Eyebrow>
              <CardTitle>Lock commercials before paper</CardTitle>
              <p className="text-sm text-muted-foreground">{state.negotiation.summary || "Pick a package, raise a concern, propose a concession, then lock."}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <StatusBadge status={state.negotiation.status} />
              <span className="text-sm text-muted-foreground">Working price {state.negotiation.final_price}</span>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-3">
            {state.contract_packages.map((pkg) => {
              const selected = pkg.id === packageId;
              return (
                <button
                  type="button"
                  key={pkg.id}
                  disabled={locked}
                  onClick={() => setPackageId(pkg.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    selected ? "border-primary bg-accent text-foreground shadow-sm" : "border-border bg-white hover:border-primary/40",
                    locked && "opacity-80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{pkg.name}</h3>
                    {pkg.recommended && <Badge variant={selected ? "secondary" : "success"}>quoted</Badge>}
                  </div>
                  <p className={cn("mt-2 text-lg font-bold", selected ? "text-primary" : "text-navy")}>{pkg.display_price}</p>
                  <p className={cn("mt-2 text-xs leading-5", selected ? "text-foreground/70" : "text-muted-foreground")}>{pkg.best_for}</p>
                  <ul className={cn("mt-3 space-y-1 text-xs", selected ? "text-foreground/80" : "text-muted-foreground")}>
                    {pkg.features.map((feature) => <li key={feature}>· {feature}</li>)}
                  </ul>
                </button>
              );
            })}
          </div>
          <Card>
            <CardHeader><Eyebrow>Concern and concession</Eyebrow><CardTitle>What is blocking lock?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {concerns.map((item) => (
                  <Button key={item.id} size="sm" variant={concern === item.id ? "default" : "secondary"} disabled={locked} onClick={() => setConcern(item.id)}>{item.label}</Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Concession</span>
                {[0, 5, 10, 15].map((pct) => (
                  <Button key={pct} size="sm" variant={concession === pct ? "default" : "secondary"} disabled={locked} onClick={() => setConcession(pct)}>{pct}%</Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={locked} onClick={() => act("/contract/negotiate", { ...payload, action: "propose" })}>Propose terms</Button>
                <Button disabled={locked} variant="secondary" onClick={() => act("/contract/negotiate", { ...payload, action: "finalize" })}>Lock agreed terms</Button>
              </div>
            </CardContent>
          </Card>
          {state.negotiation.status === "proposed" && (
            <Card className="border-amber-200">
              <CardHeader>
                <Eyebrow>Proposed — take it to the signer</Eyebrow>
                <CardTitle>Call, email, or meet</CardTitle>
                <p className="text-sm text-muted-foreground">Schedule a call range, send the email, or book a meeting with {signer?.name ?? "the signer"}. Every action is saved on this account.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    { id: "call" as const, label: "Call", icon: Phone, note: "Time range" },
                    { id: "email" as const, label: "Email", icon: Mail, note: "Send and capture" },
                    { id: "meet" as const, label: "Google Meet", icon: Video, note: "Calendar invite + link" },
                  ]).map((item) => {
                    const selected = channel === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setChannel(item.id)}
                        className={cn(
                          "rounded-2xl border p-4 text-left transition",
                          selected ? "border-primary bg-accent text-foreground" : "border-border bg-white hover:border-primary/40",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <p className="mt-2 font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.note}</p>
                      </button>
                    );
                  })}
                </div>
                {channel === "email" && (
                  <div className="space-y-3 rounded-xl border bg-muted p-4">
                    <Eyebrow>Send email</Eyebrow>
                    <p className="text-xs text-muted-foreground">To {signer?.name} · {signer?.email || "no email on file"}</p>
                    <strong className="block text-sm">{state.customer.name} · proposed commercial terms</strong>
                    <p className="text-xs leading-5 text-muted-foreground">The sent copy is stored on this account file with the timestamp.</p>
                    <Button size="sm" onClick={saveOutreach}><Mail className="h-4 w-4" />Send email</Button>
                  </div>
                )}
                {channel === "call" && (
                  <div className="space-y-3 rounded-xl border bg-muted p-4">
                    <Eyebrow>Schedule call</Eyebrow>
                    <p className="text-xs text-muted-foreground">With {signer?.name}. Pick a start and end so the range is saved as an action.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold">End<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal" /></label>
                    </div>
                    <Button size="sm" onClick={saveOutreach} disabled={!startsAt || !endsAt}><Phone className="h-4 w-4" />Save call</Button>
                  </div>
                )}
                {channel === "meet" && (
                  <div className="space-y-3 rounded-xl border bg-muted p-4">
                    <Eyebrow>Create Google Meet</Eyebrow>
                    <p className="text-xs text-muted-foreground">Creates a Google Calendar event with a Meet link and invites {signer?.name}. If Google is not configured, the action is clearly saved as internal-only.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">Starts<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold">Ends<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal" /></label>
                    </div>
                    <Button size="sm" onClick={saveOutreach} disabled={!startsAt || !endsAt}><Video className="h-4 w-4" />Create Google Meet</Button>
                  </div>
                )}
                {actions.length > 0 && (
                  <div className="space-y-3">
                    <Eyebrow>Saved on this account</Eyebrow>
                    {actions.map((item) => (
                      <div key={item.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold capitalize">{item.channel} · {item.with_name}</p>
                            <p className="text-xs text-muted-foreground">{item.channel === "email" ? `Sent ${item.at} to ${item.with_email}` : formatWindow(item.starts_at, item.ends_at)}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        {item.meeting_url && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <a href={item.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
                              <Video className="h-4 w-4" />Join Google Meet <ExternalLink className="h-3 w-3" />
                            </a>
                            <code className="rounded bg-white px-2 py-1 text-xs text-muted-foreground">{item.meeting_url.replace("https://", "")}</code>
                            {item.provider === "demo" && <Badge variant="secondary">demo link</Badge>}
                          </div>
                        )}
                        {item.calendar_event_url && (
                          <a href={item.calendar_event_url} target="_blank" rel="noreferrer" className="ml-4 mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
                            Open Calendar <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {item.integration_note && <p className="mt-2 text-xs text-muted-foreground">{item.integration_note}</p>}
                        <strong className="mt-2 block text-sm">{item.subject}</strong>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">{item.body}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <PartiesRail state={state} />
      </div>
      <Spine next="Paper room" disabled={!locked} onClick={() => go!("paper")} />
    </div>
  );
}

function PaperView({ state, act, go }: ViewProps) {
  const c = state.customer;
  const agreed = state.negotiation.status === "agreed";
  const clause = `This Agreement is entered into by Experience.com and ${c.name}. Commercial terms: ${state.negotiation.selected_package_name} at ${c.contract.quote_amount}. Initial term twelve months, commencing ${formatDate(c.contract.term_start)} and ending ${formatDate(c.contract.term_end)}. Either party may give written notice thirty days before expiry. Order form attached.`;
  return (
    <div className="space-y-4">
      {!agreed && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Terms are not locked. Return to the commercial desk before generating paper.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Account", c.name], ["Locked price", c.contract.quote_amount], ["Agreement", c.contract.name], ["Paper", state.contract_generated ? "Generated" : "Cannot send"]].map(([label, value]) => (
          <Card key={label}><CardContent className="p-5"><Eyebrow>{label}</Eyebrow><p className="text-xl font-bold">{value}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Eyebrow>Clause preview</Eyebrow>
          <CardTitle>{c.contract.name} + order form</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-muted p-6 text-sm leading-7 text-foreground">
            {state.contract_generated ? clause : agreed ? `Ready to generate. Locked ${state.negotiation.selected_package_name} at ${c.contract.quote_amount}.` : "Generate is gated until commercials are agreed."}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!agreed || state.contract_generated} onClick={() => act("/contract/generate", {})}>Generate agreement + order form</Button>
            <Button variant="secondary" disabled={!state.contract_generated || state.sign_index > 0} onClick={() => act("/contract/send", {}, "signing")}>Send for signature</Button>
          </div>
        </CardContent>
      </Card>
      <Spine next="Ready to Contract" disabled={!state.contract_generated} onClick={() => go!("signing")} />
    </div>
  );
}

function PdfDownload({ href, label = "Download PDF" }: { href: string; label?: string }) {
  const nativeHref = href.startsWith("/api/") && !href.startsWith(API) ? `${API}${href.slice(4)}` : href;
  return <a className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-navy px-3 text-xs font-semibold text-white hover:bg-navy/90" href={nativeHref} target="_blank" rel="noreferrer"><Download className="h-4 w-4" />{label}</a>;
}

function SigningView({ state, act, go }: ViewProps) {
  const watch = state.signing_watch;
  const waiting = watch.status === "waiting_customer";
  const parties = [
    { label: "Customer signer", name: watch.signer, email: watch.signer_email, done: state.sign_index >= 2 },
    { label: "Experience.com", name: "Countersign desk", email: "legal@experience.com", done: state.sign_index >= 3 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <Eyebrow>Envelope</Eyebrow>
            <CardTitle>{state.customer.contract.name} · {state.customer.name}</CardTitle>
            <p className="text-sm text-muted-foreground">Party timeline — no calendar product.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">{signSteps.map((step, index) => <div key={step} className="flex items-center gap-3 py-3"><span className={cn("h-4 w-4 rounded-full border-2", index < state.sign_index ? "border-primary bg-primary" : index === state.sign_index ? "border-amber-500 bg-amber-500 ring-4 ring-amber-100" : "border-border")} /><span className={cn("font-medium", index > state.sign_index && "text-muted-foreground")}>{step}</span></div>)}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {parties.map((party) => (
                <div key={party.label} className="rounded-xl border p-3 text-sm">
                  <Eyebrow>{party.label}</Eyebrow>
                  <p className="font-semibold">{party.name}</p>
                  <p className="text-xs text-muted-foreground">{party.email}</p>
                  <StatusBadge status={party.done ? "signed" : waiting && party.label.startsWith("Customer") ? "waiting" : "pending"} />
                </div>
              ))}
            </div>
            <Button className="mt-4" disabled={!state.contract_generated || state.sign_index >= 4} onClick={() => act("/signing/advance", {})}>{state.sign_index >= 4 ? "Fully executed" : state.sign_index === 1 ? "Record customer signature" : "Advance envelope"}</Button>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <Eyebrow>3-day reminder</Eyebrow>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{waiting ? "Waiting for customer" : watch.status === "not_sent" ? "Not sent yet" : watch.status.replaceAll("_", " ")}</CardTitle>
              <StatusBadge status={waiting ? "waiting" : watch.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {watch.sent_at && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Sent</dt><dd>{formatDate(watch.sent_at)}</dd><dt className="text-muted-foreground">Waiting</dt><dd>{watch.days_waiting} day{watch.days_waiting === 1 ? "" : "s"}</dd><dt className="text-muted-foreground">Reminder due</dt><dd>{watch.reminder_due_at ? formatDate(watch.reminder_due_at) : "—"}</dd></dl>}
            {waiting && !watch.reminder_sent_at && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Follow-up scheduled</strong><p className="mt-1">If still unsigned, {watch.signer} is emailed after three days. Jump the header clock to “Signing +3d”.</p></div>}
            {watch.reminder_sent_at && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><strong className="flex items-center gap-2"><Mail className="h-4 w-4" />Reminder sent</strong><p className="mt-1">Reminder #{watch.reminder_count} sent on {formatDate(watch.reminder_sent_at)}.</p></div>}
            {waiting && <Button variant="secondary" size="sm" onClick={() => act("/clock", { preset: "signing_day_3" }, "signing")}>Demo: 3 days later</Button>}
          </CardContent>
        </Card>
      </div>
      {state.sign_index >= 4 && <Spine next="Open vault" onClick={() => go!("vault")} />}
    </div>
  );
}

function VaultView({ state, go }: ViewProps) {
  const executed = state.customer.documents.find((doc) => doc.download_url);
  const pdfHref = executed?.download_url?.startsWith("/api/") && !executed.download_url.startsWith(API)
    ? `${API}${executed.download_url.slice(4)}`
    : executed?.download_url;
  return (
    <div className="space-y-5">
      {pdfHref ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Eyebrow>Executed original</Eyebrow>
                <CardTitle>{executed?.filename}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">Signed by both parties on {executed?.signed}.</p>
              </div>
              <PdfDownload href={pdfHref} />
            </div>
          </CardHeader>
          <CardContent>
            <iframe title="Executed agreement" src={pdfHref} className="h-[420px] w-full rounded-xl border bg-white" />
          </CardContent>
        </Card>
      ) : <Card><CardContent className="p-5 text-sm text-muted-foreground">The executed PDF lands in the vault after both parties sign.</CardContent></Card>}
      <Card className="overflow-hidden">
        <CardHeader><Eyebrow>Versioned paper</Eyebrow><CardTitle>Vault · {state.customer.name}</CardTitle></CardHeader>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {state.customer.documents.map((doc) => (
            <div key={`${doc.name}-${doc.version}`} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{doc.type}</p>
                  <h3 className="font-bold">{doc.name}</h3>
                </div>
                <StatusBadge status={doc.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{doc.version} · signed {doc.signed} · expires {doc.expiry}</p>
              {doc.download_url && <div className="mt-3"><PdfDownload href={doc.download_url} /></div>}
            </div>
          ))}
        </div>
      </Card>
      <Spine next="Renewal book" onClick={() => go!("renewal")} />
    </div>
  );
}

function RenewalCard({ item, act }: { item: RenewalWatch; act: Act }) {
  const actionable = ["due", "snoozed", "open"].includes(item.status);
  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{item.source_crm}</p>
            <h3 className="font-bold">{item.name}</h3>
            <p className="text-xs text-muted-foreground">{item.quote_amount} · {item.contract_name}</p>
          </div>
          <StatusBadge status={`${item.status}${item.days_until_expiry > 0 ? ` · ${item.days_until_expiry}d` : ""}`} />
        </div>
        <p className="my-3 text-sm">Signer: {item.signer}{item.signer_email && ` · ${item.signer_email}`}</p>
        <p className="text-xs text-muted-foreground">{item.next_nudge && `Cadence: ${item.next_nudge}. `}{item.last_activity}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" disabled={!actionable} onClick={() => act("/renewal/copilot", { customer_id: item.customer_id, action: "run" }, "renewal")}>Run copilot</Button>
          <Button size="sm" variant="secondary" disabled={item.status !== "due"} onClick={() => act("/renewal/copilot", { customer_id: item.customer_id, action: "snooze" }, "renewal")}>Snooze</Button>
          <Button size="sm" variant="secondary" disabled={item.status !== "snoozed"} onClick={() => act("/renewal/copilot", { customer_id: item.customer_id, action: "nudge" }, "renewal")}>Send nudge</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RenewalView({ state, act }: ViewProps) {
  const due = state.watchlist.filter((item) => ["due", "snoozed"].includes(item.status)).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Eyebrow>Portfolio ops</Eyebrow>
            <CardTitle>{due ? `${due} account${due === 1 ? "" : "s"} in the notice window` : "No accounts in the 30-day window"}</CardTitle>
            <p className="text-sm text-muted-foreground">Same customer, new matter — the clock is the cadence, not a task list.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              {clockOptions.filter((item) => item.id !== "start" && item.id !== "signing_day_3").map((item) => (
                <Button key={item.id} size="sm" variant={state.demo_clock.preset === item.id ? "default" : "secondary"} onClick={() => act("/clock", { preset: item.id }, "renewal")}>{item.label}</Button>
              ))}
            </div>
          </CardContent>
        </Card>
        {state.watchlist.map((item) => <RenewalCard key={item.customer_id} item={item} act={act} />)}
      </div>
      <AgentPanel run={state.last_renewal} title="Renewal copilot" />
    </div>
  );
}

export function ReadyToContract({
  leadId,
  customerId,
  user,
}: {
  leadId: string | null;
  customerId: string | null;
  user: { name: string; email: string };
}) {
  const [state, setState] = useState<ContractState>();
  const [view, setView] = useState<ContractView>("home");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const due = useMemo(() => state?.exceptions.due_renewals.filter((item) => item.status === "due") ?? [], [state]);
  const todaySchedule = state?.exceptions.today_schedule ?? [];
  const upcomingSchedule = state?.exceptions.upcoming_schedule ?? [];

  useEffect(() => {
    let active = true;
    api("/state")
      .then(async (initial) => {
        const lead = leadId ? initial.inbox.find((item) => item.id === leadId || item.id === `se-${leadId}`) : undefined;
        if (lead?.status === "queued") return { state: initial, view: "inbound" as const };
        const selectedCustomer = lead?.customer_id ?? customerId;
        if (selectedCustomer && initial.customers.some((item) => item.id === selectedCustomer)) {
          return { state: await api("/account/select", { customer_id: selectedCustomer }), view: "commercial" as const };
        }
        return { state: initial, view: lead ? "inbound" as const : "home" as const };
      })
      .then((result) => { if (active) { setState(result.state); setView(result.view); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [leadId, customerId]);

  const act = useCallback<Act>(async (path, body, nextView) => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await api(path, body);
      setState(next);
      if (path === "/reset") setView("home");
      if (path === "/clock" && next.exceptions.due_renewals.some((item) => item.status === "due")) setReminderOpen(true);
      if ((path === "/clock" || path === "/contract/outreach" || path === "/outreach") && (next.exceptions.today_schedule?.length ?? 0) > 0) setScheduleOpen(true);
      if (nextView) setView(nextView);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!state) return <div className="grid min-h-[28rem] place-items-center">{error ?? <LoaderCircle className="animate-spin text-primary" />}</div>;
  const queued = state.inbox.filter((lead) => lead.status === "queued").length;
  const viewNode = {
    home: <AdminHome state={state} act={act} go={setView} onSchedule={() => setScheduleOpen(true)} />,
    inbound: <InboundView state={state} act={act} go={setView} />,
    commercial: <CommercialView state={state} act={act} go={setView} />,
    paper: <PaperView state={state} act={act} go={setView} />,
    signing: <SigningView state={state} act={act} go={setView} />,
    vault: <VaultView state={state} act={act} go={setView} />,
    renewal: <RenewalView state={state} act={act} />,
  }[view];
  const activeNav = nav.find((item) => item.id === view);
  const go = (next: ContractView) => {
    setView(next);
    setMobileNavOpen(false);
  };

  return (
    <div className="relative flex min-h-screen bg-background">
      {mobileNavOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-navy/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card px-3 py-4 shadow-sm transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none",
        mobileNavOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="mb-5 flex items-center justify-between border-b border-border px-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-bold text-primary">E</div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Experience.com</p>
              <p className="text-sm font-semibold text-foreground">Vaultline</p>
            </div>
          </div>
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => setMobileNavOpen(false)}><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-5 px-2">
          <p className="section-label mb-2">Account · {state.customers.length}</p>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Select account"
              value={state.customer.id}
              onChange={(event) => act("/account/select", { customer_id: event.target.value }, view === "home" ? "home" : "commercial")}
              className="h-10 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-xs font-semibold text-foreground outline-none transition hover:bg-muted/60 focus:ring-2 focus:ring-ring"
            >
              {state.customers.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <nav className="space-y-0.5 px-0">
          <p className="section-label px-3 pb-2">Desks</p>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.id} onClick={() => go(item.id)} className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                view === item.id ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
              )}>
                <Icon className="h-4 w-4 text-muted-foreground" />{item.label}
                {item.id === "inbound" && queued > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{queued}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <p className="text-xs font-semibold text-foreground">{user.name}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{user.email}</p>
            <form action={logout} className="mt-2">
              <button type="submit" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" />Sign out
              </button>
            </form>
          </div>
          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Legal / commercial ops</div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Receive a qualified deal, lock terms, execute paper, run renewal.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex h-16 items-center justify-between border-b border-border/80 bg-white px-4 sm:px-6 lg:hidden">
          <button type="button" className="rounded-lg border border-border p-2" onClick={() => setMobileNavOpen(true)}><Menu className="h-5 w-5" /></button>
          <p className="text-sm font-semibold">Vaultline</p>
          <button type="button" aria-label="Today's schedule" className="relative rounded-lg border border-border p-2" onClick={() => setScheduleOpen(true)}>
            <BellRing className="h-5 w-5" />
            {todaySchedule.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950">{todaySchedule.length}</span>}
          </button>
        </div>
        <main className="mx-auto w-full max-w-[1540px] p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" />Account · agreement · clock</div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{activeNav?.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{view === "home" ? "Exceptions, today’s calls, inbound packets, waiting signatures, and the renewal window." : `${state.customer.name} · ${state.customer.contract.name} · ${state.negotiation.status}`}</p>
            </div>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm">
                <Clock3 className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-navy">{state.demo_clock.label}</span>
                <span className="text-xs text-muted-foreground">{formatDate(state.demo_clock.now)}</span>
                <select
                  aria-label="Demo clock"
                  value={state.demo_clock.preset}
                  onChange={(event) => act("/clock", { preset: event.target.value })}
                  className="h-8 rounded-lg border border-border bg-muted px-2 text-xs font-semibold"
                >
                  {clockOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                    todaySchedule.length ? "border-amber-300 bg-amber-50 text-amber-950" : "border-border bg-white text-foreground",
                  )}
                >
                  <BellRing className="h-4 w-4" />
                  {todaySchedule.length ? `${todaySchedule.length} today` : "Schedule"}
                  {todaySchedule.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold">{todaySchedule.length}</span>}
                </button>
                <Badge variant="navy">{state.customers.length} accounts</Badge>
              </div>
            </div>
          </header>
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className={cn("transition-opacity", busy && "pointer-events-none opacity-55")}>{viewNode}</div>
        </main>
      </div>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <Eyebrow>Schedule</Eyebrow>
            <DialogTitle>
              {todaySchedule.length
                ? `${todaySchedule.length} call${todaySchedule.length === 1 ? "" : "s"} / Meet${todaySchedule.length === 1 ? "" : "s"} today`
                : "No calls scheduled today"}
            </DialogTitle>
            <DialogDescription>
              {todaySchedule.length
                ? "These were saved on Commercial desk and are due on today’s date or the demo clock day."
                : upcomingSchedule.length
                  ? "Nothing on today’s date. Upcoming saved calls and Meets are listed below."
                  : "Schedule a call or Google Meet from Commercial desk after proposing terms."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {todaySchedule.map((item) => (
              <ScheduleRow
                key={item.id}
                item={item}
                onOpen={(customerId) => {
                  setScheduleOpen(false);
                  act("/account/select", { customer_id: customerId }, "commercial");
                }}
              />
            ))}
            {upcomingSchedule.length > 0 && (
              <div className="space-y-3">
                <Eyebrow>Upcoming</Eyebrow>
                {upcomingSchedule.map((item) => (
                  <ScheduleRow
                    key={item.id}
                    item={item}
                    onOpen={(customerId) => {
                      setScheduleOpen(false);
                      act("/account/select", { customer_id: customerId }, "commercial");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reminderOpen && due.length > 0} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <Eyebrow>Renewal book</Eyebrow>
            <DialogTitle>{due.length} agreement{due.length === 1 ? "" : "s"} in the 30-day window</DialogTitle>
            <DialogDescription>{due.map((item) => `${item.name} (${item.days_until_expiry}d)`).join(" · ")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button onClick={() => { go("renewal"); setReminderOpen(false); }}><BellRing className="h-4 w-4" />Open renewal book</Button>
            <Button variant="secondary" onClick={() => setReminderOpen(false)}>Later</Button>
          </div>
        </DialogContent>
      </Dialog>
      {busy && <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-lg"><RefreshCw className="h-4 w-4 animate-spin" />Working</div>}
    </div>
  );
}
