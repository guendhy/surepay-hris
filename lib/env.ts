/**
 * Environment access. Values are read lazily so `next build` works without
 * secrets; a missing value fails loudly the first time it is needed.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ssoProvider: () => (process.env.NEXT_PUBLIC_SSO_PROVIDER ?? "none") as "google" | "azure" | "none",
};

/**
 * Whether Supabase Auth can send email (custom SMTP configured in Supabase).
 * Without SMTP the built-in sender only reaches members of your Supabase
 * organisation, so invitations and password resets use one-time links that
 * HR shares instead. Set AUTH_EMAILS_ENABLED=true once SMTP is set up.
 */
export function authEmailsEnabled(): boolean {
  return process.env.AUTH_EMAILS_ENABLED === "true";
}
