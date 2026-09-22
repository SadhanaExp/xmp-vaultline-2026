import "server-only";

import crypto from "crypto";
import { readFileSync } from "fs";

interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

export interface GoogleMeetEvent {
  configured: boolean;
  demo?: boolean;
  eventId?: string;
  eventUrl?: string;
  meetingUrl?: string;
  note?: string;
}

/**
 * Placeholder Meet booking for demos. The code follows Google's xxx-yyyy-zzz
 * shape so the desk looks real, but nothing is booked on a calendar and the
 * action is labelled demo everywhere it is shown.
 */
export function demoMeetEvent(reason: string): GoogleMeetEvent {
  const letters = "abcdefghijkmnopqrstuvwxyz";
  const block = (length: number) => Array.from(
    { length },
    () => letters[crypto.randomInt(letters.length)],
  ).join("");
  const code = `${block(3)}-${block(4)}-${block(3)}`;
  return {
    configured: false,
    demo: true,
    eventId: `demo-${code}`,
    meetingUrl: `https://meet.google.com/${code}`,
    note: `Demo Meet link — not booked on Google Calendar (${reason}).`,
  };
}

interface CreateGoogleMeetInput {
  summary: string;
  description: string;
  attendeeEmail?: string;
  startsAt: string;
  endsAt: string;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

function parseServiceAccount(raw: string, source: string): ServiceAccount {
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`${source} is missing client_email or private_key`);
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

function serviceAccountFromEnv(): ServiceAccount | null {
  const path = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  if (path) {
    try {
      return parseServiceAccount(readFileSync(path, "utf8"), "GOOGLE_SERVICE_ACCOUNT_JSON_PATH");
    } catch (error) {
      if (error instanceof Error && error.message.includes("GOOGLE_SERVICE_ACCOUNT_JSON_PATH")) throw error;
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_PATH could not be read as service-account JSON");
    }
  }

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const raw = json.startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8");
      return parseServiceAccount(raw, "GOOGLE_SERVICE_ACCOUNT_JSON");
    } catch (error) {
      if (error instanceof Error && error.message.includes("GOOGLE_SERVICE_ACCOUNT_JSON")) throw error;
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid service-account JSON");
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  return clientEmail && privateKey ? { clientEmail, privateKey } : null;
}

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: account.clientEmail,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const impersonate = process.env.GOOGLE_CALENDAR_IMPERSONATE?.trim();
  if (impersonate) claims.sub = impersonate;

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

function meetingUrl(data: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}) {
  return data.hangoutLink
    ?? data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
}

export async function createGoogleMeetEvent(input: CreateGoogleMeetInput): Promise<GoogleMeetEvent> {
  const account = serviceAccountFromEnv();
  if (!account) {
    return {
      configured: false,
      note: "Google Calendar is not configured; this meeting was saved internally only.",
    };
  }

  const token = await accessToken(account);
  const calendarIds = [
    process.env.READY_TO_CONTRACT_CALENDAR_ID?.trim(),
    process.env.GOOGLE_CALENDAR_IMPERSONATE?.trim(),
    process.env.SALES_BOOKING_CALENDAR?.trim(),
    "primary",
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  const requestId = crypto.randomUUID();
  const eventBody = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
    reminders: { useDefault: true },
  };
  const conference = {
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const baseUrl = (process.env.GOOGLE_CALENDAR_API_URL?.trim() || "https://www.googleapis.com").replace(/\/$/, "");
  const create = async (
    calendarId: string,
    options: { attendees?: boolean; meet?: boolean },
  ) => fetch(
    `${baseUrl}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1${options.attendees ? "&sendUpdates=all" : ""}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...eventBody,
        ...(options.meet ? conference : {}),
        ...(options.attendees && input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  let response: Response | undefined;
  let note: string | undefined;
  let usedCalendar = calendarIds[0]!;
  const attempts: Array<{ attendees: boolean; meet: boolean }> = [
    { attendees: Boolean(input.attendeeEmail), meet: true },
    { attendees: false, meet: true },
    { attendees: false, meet: false },
  ];

  for (const calendarId of calendarIds) {
    usedCalendar = calendarId;
    for (const attempt of attempts) {
      response = await create(calendarId, attempt);
      if (response.ok) {
        if (!attempt.attendees && input.attendeeEmail) {
          note = "Google would not invite the signer from this service account; the Meet is on the team calendar.";
        }
        if (!attempt.meet) {
          note = "Calendar event created, but this service account cannot mint a Google Meet link without Workspace domain-wide delegation (GOOGLE_CALENDAR_IMPERSONATE).";
        }
        break;
      }
      const detail = await response.text();
      const retryable = response.status === 403 || response.status === 404;
      if (!retryable) {
        throw new Error(`Google Calendar event creation failed (${response.status}): ${detail.slice(0, 220)}`);
      }
      note = `Google Calendar ${response.status}: ${detail.slice(0, 220)}`;
    }
    if (response?.ok) break;
  }

  if (!response || !response.ok) {
    throw new Error(note ?? "Google Calendar rejected the event");
  }

  const data = (await response.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  let meetUrl = meetingUrl(data);
  const eventPath = `/calendar/v3/calendars/${encodeURIComponent(usedCalendar)}/events`;

  for (let poll = 0; !meetUrl && poll < 3; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const eventResponse = await fetch(`${baseUrl}${eventPath}/${encodeURIComponent(data.id)}?conferenceDataVersion=1`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!eventResponse.ok) break;
    meetUrl = meetingUrl(await eventResponse.json() as typeof data);
  }

  return {
    configured: true,
    eventId: data.id,
    eventUrl: data.htmlLink,
    meetingUrl: meetUrl,
    note: note ?? (meetUrl ? "Google Calendar event and Meet link created." : "Calendar event created; Google Meet link is still being prepared."),
  };
}
