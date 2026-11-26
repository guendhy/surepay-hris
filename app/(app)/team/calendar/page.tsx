import type { Metadata } from "next";
import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, format, getISODay, parseISO, startOfMonth } from "date-fns";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayManila } from "@/lib/format";
import { Card, PageHeader, buttonClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave calendar" };

type CalendarRow = {
  leave_request_id: string;
  employee_name: string;
  leave_type_name: string;
  color: string;
  start_date: string;
  end_date: string;
  day_portion: string;
  status: string;
};

export default async function TeamCalendarPage({ searchParams }: PageProps<"/team/calendar">) {
  await requireUser();
  const params = await searchParams;
  const today = todayManila();
  const monthParam = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  const monthStart = startOfMonth(parseISO(`${monthParam}-01`));
  const monthEnd = endOfMonth(monthStart);
  const from = format(monthStart, "yyyy-MM-dd");
  const to = format(monthEnd, "yyyy-MM-dd");

  const supabase = await createClient();
  const [{ data }, { data: holidays }] = await Promise.all([
    supabase.rpc("get_team_leave_calendar", { p_from: from, p_to: to }),
    supabase.from("holidays").select("holiday_date, name, holiday_type").gte("holiday_date", from).lte("holiday_date", to),
  ]);
  const rows = (data ?? []) as CalendarRow[];
  const holidayByDate = new Map((holidays ?? []).map((h) => [h.holiday_date as string, h.name as string]));

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getISODay(monthStart) - 1;
  const prev = format(addMonths(monthStart, -1), "yyyy-MM");
  const next = format(addMonths(monthStart, 1), "yyyy-MM");

  return (
    <>
      <PageHeader
        title="Leave calendar"
        description="Approved and pending leave of your team. Pending leave is shown with a dashed border."
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/team/calendar?month=${prev}`} className={buttonClass("secondary", "sm")}>
              ← Prev
            </Link>
            <span className="min-w-32 text-center text-sm font-medium text-foreground">{format(monthStart, "MMMM yyyy")}</span>
            <Link href={`/team/calendar?month=${next}`} className={buttonClass("secondary", "sm")}>
              Next →
            </Link>
          </div>
        }
      />
      <Card className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="border-b border-border px-2 py-2 text-xs font-semibold uppercase text-muted">
              {d}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-28 border-b border-r border-border bg-surface-muted/50" />
          ))}
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const onLeave = rows.filter((r) => r.start_date <= iso && r.end_date >= iso);
            const weekend = getISODay(day) > 5;
            const holiday = holidayByDate.get(iso);
            return (
              <div
                key={iso}
                className={cn("min-h-28 border-b border-r border-border p-1.5", (weekend || holiday) && "bg-surface-muted/60")}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      iso === today ? "bg-brand font-semibold text-brand-foreground" : "text-muted",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
                {holiday && <p className="mb-1 truncate text-[11px] font-medium text-warning" title={holiday}>{holiday}</p>}
                <ul className="flex flex-col gap-0.5">
                  {onLeave.slice(0, 4).map((r) => (
                    <li
                      key={r.leave_request_id}
                      title={`${r.employee_name} — ${r.leave_type_name} (${r.status})`}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-[11px] text-foreground",
                        r.status === "pending" ? "border border-dashed" : "",
                      )}
                      style={{ background: `${r.color}22`, borderColor: r.color }}
                    >
                      {r.employee_name}
                      {r.day_portion !== "full" && ` (${r.day_portion.toUpperCase()})`}
                    </li>
                  ))}
                  {onLeave.length > 4 && <li className="text-[11px] text-muted">+{onLeave.length - 4} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
