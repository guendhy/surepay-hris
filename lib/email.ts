import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

type OutboxRow = { id: string; to_email: string; subject: string; body_text: string; link: string | null; attempts: number };

/**
 * Sends queued emails from public.email_outbox via Resend's REST API.
 * Without RESEND_API_KEY (e.g. local dev) emails are marked "skipped" and only
 * in-app notifications are delivered.
 */
export async function drainEmailOutbox(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!process.env.SUPABASE_SECRET_KEY) return { sent: 0, failed: 0, skipped: 0 };

  const admin = createAdminClient();
  const { data } = await admin
    .from("email_outbox")
    .select("id, to_email, subject, body_text, link, attempts")
    .eq("status", "queued")
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Surepay HRIS <hris@example.com>";
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of (data ?? []) as OutboxRow[]) {
    if (!apiKey) {
      await admin.from("email_outbox").update({ status: "skipped" }).eq("id", row.id);
      skipped++;
      continue;
    }
    const url = row.link ? `${publicEnv.appUrl()}${row.link}` : publicEnv.appUrl();
    const text = `${row.body_text}\n\nOpen the HRIS: ${url}\n\nThis is an automated message from Surepay HRIS.`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [row.to_email], subject: row.subject, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq("id", row.id);
      sent++;
    } catch (error) {
      await admin
        .from("email_outbox")
        .update({
          status: row.attempts + 1 >= 5 ? "failed" : "queued",
          attempts: row.attempts + 1,
          last_error: String(error).slice(0, 500),
        })
        .eq("id", row.id);
      failed++;
    }
  }
  return { sent, failed, skipped };
}
