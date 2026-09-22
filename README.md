# Vaultline

Experience.com’s post-quote ops console. Chrome: **Experience.com** above **Vaultline**.

Flow: **inbound packet → commercial lock → paper → signature → vault → renewal**.

This is not the Sales Engine CRM. There is no Talk to Sales, pipeline, AI briefs, or discovery calendar.

## Run locally

```bash
npm install
npm run dev
```

Open **http://localhost:3001**.

Demo accounts load on start (ABC Corp, XYZ Corp, plus queued CRM packets). The header **clock** drives signing reminders and the 30-day renewal window.

Copy `.env.example` to `.env.local` only if you need Postgres or Google Calendar. Do not commit `.env.local`.

## Desks

| Desk | What it does |
|---|---|
| **Triage desk** | Exceptions, today’s schedule, **Needs attention** queue |
| **Inbound desk** | Accept a CRM packet, map agreement type, flag gaps, never duplicate an account |
| **Commercial desk** | Package, concern, concession, lock terms; call / email / Google Meet outreach |
| **Paper room** | Generate agreement + order form after lock, then send |
| **Ready to Contract** | Signature timeline; jump the clock to **Signing +3d** for the reminder |
| **Vault** | Versioned quote / order / agreement / executed PDF |
| **Renewal book** | Same customer, new matter; 30 / 21 / 14 / 7 cadence |

## Needs attention

The Triage card **Needs attention** is the agent queue, not a demo control.

- Ranked recommendations with confidence, evidence, and risk
- Autonomous on reversible internal work (accept a complete packet, map the agreement, draft commercials, generate paper from locked terms, prepare a renewal draft)
- Stops at guardrails: incomplete packets, binding commercial locks, and external signature sends
- Each run shows **Observed → Decided → Acted**

Open Triage desk and select **Needs attention**. The agent generates safe paper for ABC Corp, accepts the clean Lakeside packet, maps its agreement, drafts quoted commercials, and holds gapped packets for review.

## Outreach and schedule

On **Commercial desk**, after **Propose terms**:

- **Call** — save a start/end range on the account
- **Email** — send and capture the copy
- **Google Meet** — create a Calendar event with a Meet link when Google is configured; otherwise save a labelled demo link so the desk still has something to show

**Schedule** in the header (and **Calls today** on Triage) lists calls and Meets due on today’s date or the demo-clock day. Upcoming bookings for the next 7 days sit in the same panel.

## Google Calendar / Meet (optional)

1. Enable the Google Calendar API in Google Cloud.
2. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (raw or base64) **or** `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` to a key file on your machine.
3. Share the target calendar with the service account (**Make changes to events**) and set `READY_TO_CONTRACT_CALENDAR_ID`.
4. For Workspace invitations, enable domain-wide delegation and set `GOOGLE_CALENDAR_IMPERSONATE`.

Until Calendar API and Workspace delegation are available, Vaultline stores the meeting as **demo** and never pretends a placeholder is a live booking.

## Environment

See `.env.example`. Only placeholders belong in git:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Optional Postgres; otherwise in-memory demo state |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account key (JSON or base64) |
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | Local path to a key file (keep off git) |
| `GOOGLE_CALENDAR_IMPERSONATE` | Workspace user for Meet + invites |
| `READY_TO_CONTRACT_CALENDAR_ID` | Calendar the event is created on |

No login. Do not commit `.env.local`, credential JSON, or production database URLs.

## Deploy on Vercel

1. Import this GitHub repo ([xmp-vaultline-2026](https://github.com/SadhanaExp/xmp-vaultline-2026))
2. Leave the root directory as the repo root
3. Optional: `DATABASE_URL` and the Google variables above in the Vercel project (not in the repo)

Framework: Next.js. Port **3001** locally. No Python, no second service.
