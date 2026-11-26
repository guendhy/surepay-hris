"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client (publishable key only). Everything it can reach is governed
 * by RLS; it is used for MFA enrolment and Realtime notifications.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
