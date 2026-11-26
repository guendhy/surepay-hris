import type { LeaveBalance, LeaveType } from "@/lib/types";
import { formatDays } from "@/lib/format";
import { Card, Meter, Tag } from "@/components/ui/primitives";

/** One card per tracked leave type: available now, a meter, and earned/used/pending. */
export function BalanceCards({ types, balances }: { types: LeaveType[]; balances: LeaveBalance[] }) {
  const tracked = types.filter((t) => t.balance_tracked);
  if (tracked.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {tracked.map((t) => {
        const b = balances.find((x) => x.leave_type_id === t.id);
        const available = Number(b?.available ?? 0);
        const max = Math.max(Number(t.annual_credit ?? 0), Number(b?.earned ?? 0), available, 1);
        return (
          <Card key={t.id} className="flex flex-col gap-2.5 px-4 py-4 md:px-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] text-muted">{t.name}</span>
              <Tag>{t.code}</Tag>
            </div>
            <p>
              <span className={`font-[family-name:var(--font-display)] text-[26px] font-bold leading-8 ${available < 0 ? "text-danger" : "text-foreground"}`}>
                {formatDays(available)}
              </span>{" "}
              <span className="text-[13px] text-muted">available</span>
            </p>
            <Meter value={available} max={max} label={`${formatDays(available)} of ${formatDays(max)} days available`} />
            <p className="text-xs text-muted">
              Earned {formatDays(b?.earned)} · Used {formatDays(b?.used)}
              {Number(b?.pending ?? 0) > 0 && ` · Pending ${formatDays(b?.pending)}`}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
