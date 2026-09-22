import crypto from "crypto";

export const SESSION_COOKIE = "vl_session";

export function signSession(value: string) {
  const secret = process.env.SESSION_SECRET || "dev-only-change-me";
  const sig = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${sig}`;
}

export function verifySession(signed: string | undefined): string | null {
  if (!signed) return null;
  const [value, sig] = signed.split(".");
  if (!value || !sig) return null;
  const expected = signSession(value).split(".")[1];
  if (!expected || sig.length !== expected.length) return null;
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? value : null;
}
