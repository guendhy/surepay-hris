import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainEmailOutbox } from "@/lib/email";
import { todayManila } from "@/lib/format";

export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Scheduled jobs, called by Vercel Cron (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. All jobs are idempotent.
 *   /api/cron/daily     accruals + escalations + email queue
 *   /api/cron/year-end  closes the previous leave year (run on 1 Jan)
 *   /api/cron/emails    email queue only
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { job } = await params;
  const admin = createAdminClient();
  const result: Record<string, unknown> = { job, date: todayManila() };

  try {
    if (job === "daily") {
      const accruals = await admin.rpc("run_leave_accruals", { p_as_of: null });
      if (accruals.error) throw accruals.error;
      const escalations = await admin.rpc("escalate_overdue_approvals");
      if (escalations.error) throw escalations.error;
      result.accrual_entries = accruals.data;
      result.escalated = escalations.data;
      result.emails = await drainEmailOutbox(100);
    } else if (job === "year-end") {
      const year = Number(todayManila().slice(0, 4)) - 1;
      const close = await admin.rpc("run_leave_year_end", { p_year: year });
      if (close.error) throw close.error;
      result.year = year;
      result.entries = close.data;
    } else if (job === "emails") {
      result.emails = await drainEmailOutbox(100);
    } else {
      return NextResponse.json({ error: "Unknown job" }, { status: 404 });
    }
    await admin.rpc("log_event", { p_action: "admin.cron_run", p_context: result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(`[cron:${job}]`, error);
    return NextResponse.json({ ok: false, job, error: (error as { message?: string }).message ?? "failed" }, { status: 500 });
  }
}
