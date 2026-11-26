"use client";

import { useActionState, useState } from "react";
import { initialActionState } from "@/lib/action";
import { Alert, Avatar, Badge, Card, EmptyState, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";
import { cn } from "@/lib/utils";
import { decide } from "./actions";

export type InboxItem = {
  taskId: string;
  requester: string;
  role: string;
  summary: string;
  type: string;
  requestNo: string;
  dates: string;
  days: string;
  reason: string | null;
  attachmentUrl: string | null;
  overdue: boolean;
  escalated: boolean;
  delegated: boolean;
  receivedAt: string;
  due: string | null;
  filed: string;
  balanceAfter: string | null;
  overlap: string[];
  stepLabel: string;
};

/** List + detail. Select one to review it; tick several to approve or return in bulk. */
export function ApprovalInbox({ items }: { items: InboxItem[] }) {
  const [state, action] = useActionState(decide, initialActionState);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.taskId ?? null);
  const [checkedIds, setChecked] = useState<string[]>([]);

  // After a decision the page re-renders with fewer items; drop stale selections.
  const live = items;
  const checked = checkedIds.filter((id) => live.some((i) => i.taskId === id));
  const selected = live.find((i) => i.taskId === selectedId) ?? live[0];

  if (live.length === 0) {
    return (
      <Card>
        <EmptyState title="You’re all caught up">New requests from your team will appear here.</EmptyState>
        {state.message && state.ok && (
          <div className="px-5 pb-5">
            <Alert tone="success">{state.message}</Alert>
          </div>
        )}
      </Card>
    );
  }

  const allChecked = checked.length === live.length;

  return (
    <div className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card aria-label="Pending requests">
          {checked.length > 0 ? (
            <form action={action} className="flex flex-wrap items-center gap-2 border-b border-[#d3edd3] bg-brand-soft px-4 py-2.5 dark:border-brand/30">
              {checked.map((id) => (
                <input key={id} type="hidden" name="task_id" value={id} />
              ))}
              <b className="text-[13px]">{checked.length} selected</b>
              <SubmitButton size="sm" name="decision" value="approved">
                Approve
              </SubmitButton>
              <button type="button" onClick={() => setChecked([])} className="ml-auto text-[13px] font-semibold text-muted hover:text-foreground">
                Clear
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <label className="flex min-h-8 items-center gap-2.5 text-sm">
                <input type="checkbox" className="size-[18px] accent-[var(--brand)]" checked={allChecked} onChange={() => setChecked(allChecked ? [] : live.map((i) => i.taskId))} />
                Select all
              </label>
              <span className="text-[13px] text-muted">Oldest first</span>
            </div>
          )}
          <ul>
            {live.map((item) => {
              const isSelected = item.taskId === selected?.taskId;
              const isChecked = checked.includes(item.taskId);
              return (
                <li
                  key={item.taskId}
                  className={cn("flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0", isSelected && "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]")}
                >
                  <input
                    type="checkbox"
                    className="mt-2.5 size-[18px] accent-[var(--brand)]"
                    aria-label={`Select ${item.requester}’s request`}
                    checked={isChecked}
                    onChange={() => setChecked((c) => (isChecked ? c.filter((x) => x !== item.taskId) : [...c, item.taskId]))}
                  />
                  <button type="button" onClick={() => setSelectedId(item.taskId)} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-current={isSelected ? "true" : undefined}>
                    <Avatar name={item.requester} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <b className="truncate">{item.requester}</b>
                        {item.overdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : item.delegated ? (
                          <Badge tone="info">Delegated</Badge>
                        ) : item.escalated ? (
                          <Badge tone="info">Escalated</Badge>
                        ) : item.due ? (
                          <Badge tone="warning">Due {item.due}</Badge>
                        ) : null}
                      </span>
                      <span className="block text-[13px]">
                        {item.type} · {item.dates} · {item.days} day(s)
                      </span>
                      <span className="block text-xs text-muted">
                        Received {item.receivedAt}
                        {item.attachmentUrl ? " · 1 attachment" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {selected && (
          <Card aria-labelledby="detail-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={selected.requester} size="lg" />
                <div>
                  <h2 id="detail-title" className="text-[17px] font-bold">
                    {selected.requester} · {selected.type}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {[selected.requestNo, selected.role].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              {selected.overdue && <Badge tone="danger">Overdue</Badge>}
            </div>
            <form action={action} key={selected.taskId}>
              <input type="hidden" name="task_id" value={selected.taskId} />
              <div className="flex flex-col gap-4 px-5 py-5">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold text-muted">Dates</dt>
                    <dd className="mt-1 text-sm">{selected.dates}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Days deducted</dt>
                    <dd className="mt-1 text-sm">{selected.days} working day(s)</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Balance after</dt>
                    <dd className="mt-1 text-sm">{selected.balanceAfter ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Filed</dt>
                    <dd className="mt-1 text-sm">{selected.filed}</dd>
                  </div>
                </dl>
                {selected.reason && (
                  <div>
                    <p className="text-[13px] font-semibold">Reason</p>
                    <p className="text-sm">“{selected.reason}”</p>
                  </div>
                )}
                {selected.attachmentUrl && (
                  <a href={selected.attachmentUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold">
                    View supporting document
                  </a>
                )}
                {selected.overlap.length > 0 && (
                  <Alert tone="warning" title="Team coverage">
                    <ul className="mt-0.5">
                      {selected.overlap.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <p className="text-[13px] text-muted">
                  {selected.stepLabel}
                  {selected.delegated ? " · delegated to you" : ""}
                  {selected.escalated ? " · escalated to HR" : ""}
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="comment" className="text-[13px] font-semibold">
                    Comment
                  </label>
                  <Textarea id="comment" name="comment" rows={3} className="min-h-18" placeholder="Required to reject or return" />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
                <SubmitButton name="decision" value="rejected" variant="ghost">
                  Reject
                </SubmitButton>
                <SubmitButton name="decision" value="returned" variant="secondary">
                  Return for changes
                </SubmitButton>
                <SubmitButton name="decision" value="approved">
                  Approve
                </SubmitButton>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
