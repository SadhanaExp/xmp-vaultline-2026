import "server-only";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/session-cookie";
import { findUserByEmail, findUserById, type AppUser } from "@/lib/users";

export type SessionUser = AppUser;

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function createSession(userId: string, remember = true) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 7 } : {}),
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return findUserById(userId);
}

export async function sessionUserIdFromRequest(request: Request): Promise<string | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return verifySession(decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)));
}

export async function requireApiUser(request: Request): Promise<SessionUser | Response> {
  const userId = await sessionUserIdFromRequest(request);
  if (!userId) return Response.json({ detail: "Sign in required" }, { status: 401 });
  let user: SessionUser | null;
  try {
    user = await findUserById(userId);
  } catch (error) {
    // The session is valid but the account cannot be read. Say so rather than
    // letting an unreachable database look like a signed-out browser.
    const detail = error instanceof Error ? error.message : "Sign-in database unavailable";
    return Response.json({ detail }, { status: 503 });
  }
  if (!user) return Response.json({ detail: "Sign in required" }, { status: 401 });
  return user;
}
