"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyCredentials } from "@/lib/auth";

export interface LoginFormState {
  error?: string;
}

export async function login(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const user = await verifyCredentials(email, password);
    if (!user) return { error: "Invalid email or password." };
    await createSession(user.id, formData.get("remember") === "on");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not sign in." };
  }
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
