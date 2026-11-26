import type { LeaveBalance, LeaveType } from "@/lib/types";
import { formatDays } from "@/lib/format";
import { Card } from "@/components/ui/primitives";

/** One card per tracked leave type: available now, with earned/used/pending. */
export function BalanceCards({ types, balances }: { types: LeaveType[]; balances: LeaveBalance[] }) {
  const tracked = types.filter((t) => t.balance_tracked);
  if (tracked.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {tracked.map((t) => {
        const b = balances.find((x) => x.leave_type_id === t.id);
        return (
          <Card key={t.id} className="relative overflow-hidden px-4 py-3">
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} aria-hidden />
            <p className="text-sm text-muted">{t.name}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {formatDays(b?.available)}
              <span className="ml-1 text-sm font-normal text-muted">days</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Earned {formatDays(b?.earned)} · Used {formatDays(b?.used)}
              {Number(b?.pending ?? 0) > 0 && ` · Pending ${formatDays(b?.pending)}`}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
