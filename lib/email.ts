import "server-only";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

type OutboxRow = { id: string; to_email: string; subject: string; body_text: string; link: string | null; attempts: number };

/** SMTP transport from env (Mailtrap or any SMTP provider). Null when not configured. */
function smtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS from the start; 587/2525 upgrade with STARTTLS
    requireTLS: port !== 465 && port !== 25,
    auth: { user, pass },
  });
}

/**
 * Sends queued emails from public.email_outbox over SMTP.
 * Without SMTP settings (e.g. local dev) emails are marked "skipped" and only
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

  const transport = smtpTransport();
  const from = process.env.EMAIL_FROM ?? "Surepay HRIS <hris@example.com>";
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of (data ?? []) as OutboxRow[]) {
    if (!transport) {
      await admin.from("email_outbox").update({ status: "skipped" }).eq("id", row.id);
      skipped++;
      continue;
    }
    const url = row.link ? `${publicEnv.appUrl()}${row.link}` : publicEnv.appUrl();
    const text = `${row.body_text}\n\nOpen the HRIS: ${url}\n\nThis is an automated message from Surepay HRIS.`;
    try {
      await transport.sendMail({ from, to: row.to_email, subject: row.subject, text });
      await admin
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id);
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
  transport?.close();
  return { sent, failed, skipped };
}
