"use client";

import { useActionState, useState } from "react";
import { initialActionState } from "@/lib/action";
import { Alert, Badge, Card, EmptyState, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";
import { decide } from "./actions";

export type InboxItem = {
  taskId: string;
  summary: string;
  type: string;
  color: string;
  requestNo: string;
  dates: string;
  days: string;
  reason: string | null;
  attachmentUrl: string | null;
  overdue: boolean;
  escalated: boolean;
  delegated: boolean;
  receivedAt: string;
};

/** Pending approvals with per-item and bulk approve / reject / return. */
export function ApprovalInbox({ items }: { items: InboxItem[] }) {
  const [state, action] = useActionState(decide, initialActionState);
  const [selected, setSelected] = useState<string[]>([]);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState title="You're all caught up">New requests from your team will appear here.</EmptyState>
        {state.message && state.ok && <Alert tone="success" className="m-4">{state.message}</Alert>}
      </Card>
    );
  }

  const allSelected = selected.length === items.length;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

      <Card className="flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : items.map((i) => i.taskId))}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Select all ({selected.length}/{items.length})
        </label>
        <div className="min-w-60 flex-1">
          <Textarea name="comment" placeholder="Comment (required to reject or return)" className="min-h-10" rows={1} />
        </div>
        <div className="flex gap-2">
          <SubmitButton name="decision" value="approved" disabled={selected.length === 0}>
            Approve
          </SubmitButton>
          <SubmitButton name="decision" value="returned" variant="secondary" disabled={selected.length === 0}>
            Return
          </SubmitButton>
          <SubmitButton name="decision" value="rejected" variant="danger" disabled={selected.length === 0}>
            Reject
          </SubmitButton>
        </div>
      </Card>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const checked = selected.includes(item.taskId);
          return (
            <li key={item.taskId}>
              <Card className={checked ? "border-brand" : ""}>
                <label className="flex cursor-pointer gap-4 px-4 py-4">
                  <input
                    type="checkbox"
                    name="task_id"
                    value={item.taskId}
                    checked={checked}
                    onChange={() =>
                      setSelected((s) => (checked ? s.filter((x) => x !== item.taskId) : [...s, item.taskId]))
                    }
                    className="mt-1 h-4 w-4 accent-[var(--brand)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
                      <span className="font-medium text-foreground">{item.summary}</span>
                      {item.overdue && <Badge tone="danger">Overdue</Badge>}
                      {item.escalated && <Badge tone="warning">Escalated to HR</Badge>}
                      {item.delegated && <Badge tone="brand">Delegated to you</Badge>}
                    </div>
                    <p className="text-sm text-muted">
                      {item.requestNo && <span className="font-mono">{item.requestNo} · </span>}
                      {item.type} · {item.dates} · {item.days} day(s) · received {item.receivedAt}
                    </p>
                    {item.reason && <p className="text-sm text-foreground">“{item.reason}”</p>}
                    {item.attachmentUrl && (
                      <a href={item.attachmentUrl} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline">
                        View supporting document
                      </a>
                    )}
                  </div>
                </label>
              </Card>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
