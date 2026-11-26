"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, type ActionState } from "@/lib/action";
import { publicEnv } from "@/lib/env";

/** Only same-site relative paths may be used as a post-login destination. */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

const signInSchema = z.object({
  email: z.email("Enter your work email."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return failure("Enter your email and password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error) {
    // Same message for every failure so accounts cannot be enumerated.
    return failure("Incorrect email or password, or the account is not active.");
  }
  await supabase.rpc("log_event", { p_action: "auth.sign_in", p_context: { method: "password" } });
  redirect(safeNext(parsed.data.next));
}

export async function signInWithSso(formData: FormData): Promise<void> {
  const provider = publicEnv.ssoProvider();
  if (provider === "none") redirect("/login?error=sso");
  const supabase = await createClient();
  const next = safeNext(String(formData.get("next") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${publicEnv.appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider === "azure" ? "email" : undefined,
    },
  });
  if (error || !data.url) redirect("/login?error=sso");
  redirect(data.url);
}

const resetSchema = z.object({ email: z.email("Enter your work email.") });

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return failure("Enter your work email.");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo: `${publicEnv.appUrl()}/auth/callback?next=/me/password`,
  });
  // Always the same answer, whether or not the account exists.
  return { ok: true, message: "If that email has an account, a reset link is on its way.", at: Date.now() };
}
