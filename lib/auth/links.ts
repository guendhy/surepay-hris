import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

/**
 * Creates a one-time sign-in link WITHOUT sending email (for projects without
 * SMTP). The link opens /auth/confirm, which verifies the token server-side and
 * sends the person to /set-password to choose their password.
 *
 *   invite   — creates the login (the database links it to the 201 record)
 *   recovery — lets an existing login set a new password
 *
 * The link is a credential: show it once, share it only with the employee.
 * It works once and expires after Supabase's "Email OTP Expiration".
 */
export async function createOneTimeLink(
  kind: "invite" | "recovery",
  email: string,
  fullName?: string,
): Promise<{ link: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } =
    kind === "invite"
      ? await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: fullName } } })
      : await admin.auth.admin.generateLink({ type: "recovery", email });

  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "The link could not be created." };
  }
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: kind,
    next: "/set-password",
  });
  return { link: `${publicEnv.appUrl()}/auth/confirm?${params.toString()}` };
}
