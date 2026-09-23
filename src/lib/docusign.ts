import "server-only";

import crypto from "crypto";
import { readFileSync } from "fs";

export interface DocuSignEnvelope {
  configured: boolean;
  demo?: boolean;
  envelopeId?: string;
  envelopeUrl?: string;
  status?: string;
  signIndex?: number;
  note?: string;
}

const OAUTH_HOST = (process.env.DOCUSIGN_OAUTH_BASE ?? "account-d.docusign.com").replace(/^https?:\/\//, "");
const API_BASE = (process.env.DOCUSIGN_BASE_PATH ?? "https://demo.docusign.net/restapi").replace(/\/$/, "");

let cachedToken: { value: string; expiresAt: number } | undefined;

function configured() {
  try {
    return Boolean(
      process.env.DOCUSIGN_INTEGRATION_KEY?.trim()
      && process.env.DOCUSIGN_USER_ID?.trim()
      && process.env.DOCUSIGN_ACCOUNT_ID?.trim()
      && rsaPrivateKey(),
    );
  } catch {
    return false;
  }
}

function rsaPrivateKey(): string | undefined {
  const path = process.env.DOCUSIGN_RSA_KEY_PATH?.trim();
  if (path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      throw new Error("DOCUSIGN_RSA_KEY_PATH could not be read");
    }
  }
  const raw = process.env.DOCUSIGN_RSA_PRIVATE_KEY?.trim();
  return raw ? raw.replace(/\\n/g, "\n") : undefined;
}

function jwtAssertion() {
  const key = rsaPrivateKey();
  const iss = process.env.DOCUSIGN_INTEGRATION_KEY!.trim();
  const sub = process.env.DOCUSIGN_USER_ID!.trim();
  if (!key) throw new Error("DocuSign RSA private key is not set");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss,
    sub,
    aud: OAUTH_HOST,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch(`https://${OAUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 400 && /consent_required/i.test(body)) {
      throw new Error("DocuSign consent is required. Open the JWT consent URL once, then retry.");
    }
    throw new Error(`DocuSign token exchange failed (${response.status})`);
  }
  const data = (await response.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function docusign<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!.trim();
  const response = await fetch(`${API_BASE}/v2.1/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DocuSign ${path} failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function agreementPdf(customerName: string, agreementName: string): Buffer {
  const safe = (value: string) => value.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
  const stream = [
    "BT /F1 18 Tf 72 740 Td (Experience.com) Tj",
    `0 -28 Td /F1 14 Tf (${safe(agreementName)}) Tj`,
    `0 -24 Td /F1 11 Tf (Agreement for ${safe(customerName)}) Tj`,
    "0 -22 Td (Customer signs first. Experience.com countersigns second.) Tj",
    "0 -36 Td /F1 10 Tf (Customer signature) Tj",
    "0 -64 Td (Experience.com countersignature) Tj",
    "ET",
  ].join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function signIndexFromRecipients(status: string, signers: Array<{ routingOrder?: string; status?: string }>): number {
  if (status === "completed" || status === "signed") return 4;
  const first = signers.find((signer) => signer.routingOrder === "1");
  const second = signers.find((signer) => signer.routingOrder === "2");
  const done = (value?: string) => value === "completed" || value === "signed";
  if (done(second?.status)) return 3;
  if (done(first?.status)) return 2;
  return 1;
}

export function docusignConfigured() {
  return configured();
}

export function demoEnvelope(reason: string): DocuSignEnvelope {
  return {
    configured: false,
    demo: true,
    note: `Demo envelope — not sent through DocuSign (${reason}).`,
  };
}

export async function createSignatureEnvelope(input: {
  customerName: string;
  agreementName: string;
  signerName: string;
  signerEmail: string;
}): Promise<DocuSignEnvelope> {
  if (!configured()) {
    return demoEnvelope("RSA private key or account IDs are missing");
  }

  const testEmail = process.env.DOCUSIGN_TEST_SIGNER_EMAIL?.trim();
  const customerEmail = testEmail || input.signerEmail;
  const countersignEmail = process.env.DOCUSIGN_COUNTERSIGN_EMAIL?.trim() || testEmail || customerEmail;
  const countersignName = process.env.DOCUSIGN_COUNTERSIGN_NAME?.trim() || "Experience.com Countersign";

  const pdf = agreementPdf(input.customerName, input.agreementName);
  const created = await docusign<{ envelopeId: string; uri?: string; status?: string }>("/envelopes", {
    method: "POST",
    body: JSON.stringify({
      emailSubject: `${input.agreementName} for ${input.customerName}`,
      emailBlurb: "Sent from Vaultline Ready to Contract. Customer signs first; Experience.com countersigns second. Demo envelopes are not legally binding.",
      status: "sent",
      documents: [{
        documentId: "1",
        name: `${input.agreementName}.pdf`,
        fileExtension: "pdf",
        documentBase64: pdf.toString("base64"),
      }],
      recipients: {
        signers: [
          {
            recipientId: "1",
            routingOrder: "1",
            name: input.signerName,
            email: customerEmail,
            tabs: { signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "72", yPosition: "620" }] },
          },
          {
            recipientId: "2",
            routingOrder: "2",
            name: countersignName,
            email: countersignEmail,
            tabs: { signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "72", yPosition: "540" }] },
          },
        ],
      },
    }),
  });

  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!.trim();
  return {
    configured: true,
    envelopeId: created.envelopeId,
    envelopeUrl: `https://appdemo.docusign.com/documents/details/${created.envelopeId}`,
    status: created.status ?? "sent",
    signIndex: 1,
    note: testEmail
      ? `DocuSign demo envelope sent to ${customerEmail} (test signer override), then ${countersignEmail}.`
      : `DocuSign demo envelope sent to ${customerEmail}, then ${countersignEmail}.`,
  };
}

export async function refreshSignatureEnvelope(envelopeId: string): Promise<DocuSignEnvelope> {
  if (!configured()) return demoEnvelope("DocuSign is not configured");
  const envelope = await docusign<{ status: string; envelopeId: string }>(`/envelopes/${encodeURIComponent(envelopeId)}`);
  const recipients = await docusign<{ signers?: Array<{ routingOrder?: string; status?: string }> }>(
    `/envelopes/${encodeURIComponent(envelopeId)}/recipients`,
  );
  const signIndex = signIndexFromRecipients(envelope.status, recipients.signers ?? []);
  return {
    configured: true,
    envelopeId: envelope.envelopeId,
    envelopeUrl: `https://appdemo.docusign.com/documents/details/${envelope.envelopeId}`,
    status: envelope.status,
    signIndex,
    note: `DocuSign status: ${envelope.status}.`,
  };
}
