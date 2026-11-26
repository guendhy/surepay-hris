import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS — use only for:
 *   - scheduled jobs (/api/cron/*), after verifying CRON_SECRET
 *   - Auth admin calls (inviting users), after checking the caller's permission
 * Never import this from a Client Component; `server-only` enforces that.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See .env.example.");
  }
  return createClient(publicEnv.supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
