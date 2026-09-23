import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * JWT consent lands here after Allow. The grant is stored on the DocuSign
 * user; Vaultline only needs a 200 so the browser is not an error page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const granted = !error && Boolean(url.searchParams.get("code"));
  const title = error ? "DocuSign consent was not granted" : granted ? "DocuSign connected" : "DocuSign callback";
  const detail = error
    ? decodeURIComponent(error)
    : granted
      ? "You can close this tab and send an envelope from Ready to Contract."
      : "No authorization code was returned.";
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:40rem">
      <p style="letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#64708a">Experience.com · Vaultline</p>
      <h1 style="font-size:1.5rem">${title}</h1>
      <p>${detail}</p>
      <p><a href="/">Back to Vaultline</a></p>
    </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
