"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { initialActionState } from "@/lib/action";
import { formatDays } from "@/lib/format";
import type { LeavePreview, LeaveType } from "@/lib/types";
import { Alert, Card, Field, Input, Select, Textarea, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";
import { cn } from "@/lib/utils";
import { previewLeave, submitLeave } from "../actions";

export function LeaveForm({ types, today, approver }: { types: LeaveType[]; today: string; approver: string | null }) {
  const [state, action] = useActionState(submitLeave, initialActionState);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [portion, setPortion] = useState<"full" | "am" | "pm">("full");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<LeavePreview | { error: string } | null>(null);
  const [checking, startCheck] = useTransition();

  const type = types.find((t) => t.id === typeId);
  const singleDay = start === end;
  const halfDayAllowed = Boolean(type?.allow_half_day) && singleDay;
  const inputsValid = Boolean(typeId && start && end && end >= start);

  // Re-check whenever the inputs change (debounced).
  useEffect(() => {
    if (!inputsValid) return;
    const handle = setTimeout(() => {
      startCheck(async () => {
        setPreview(await previewLeave({ leave_type_id: typeId, start_date: start, end_date: end, day_portion: halfDayAllowed ? portion : "full" }));
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [inputsValid, typeId, start, end, portion, halfDayAllowed]);

  const shown = inputsValid ? preview : null;
  const result = shown && !("error" in shown) ? shown : null;
  const blocking = result ? result.errors.length > 0 : false;

  return (
    <form action={action} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 md:px-6">
          <Field label="Leave type" htmlFor="leave_type_id" required error={state.fieldErrors?.leave_type_id} hint={type?.description ?? undefined}>
            <Select id="leave_type_id" name="leave_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} required className="h-11 md:h-10">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_paid ? "" : " (unpaid)"}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="start_date" required error={state.fieldErrors?.start_date}>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > end) setEnd(e.target.value);
                }}
                required
                className="h-11 md:h-10"
              />
            </Field>
            <Field label="End date" htmlFor="end_date" required error={state.fieldErrors?.end_date}>
              <Input id="end_date" name="end_date" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required className="h-11 md:h-10" />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold">Duration</legend>
            <div className="inline-flex w-full gap-0.5 rounded-[var(--radius-control)] bg-surface-muted p-[3px] sm:w-auto" role="radiogroup" aria-label="Duration">
              {(
                [
                  ["full", "Whole day(s)"],
                  ["am", "Half day AM"],
                  ["pm", "Half day PM"],
                ] as const
              ).map(([value, label]) => {
                const disabled = value !== "full" && !halfDayAllowed;
                const on = (halfDayAllowed ? portion : "full") === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md px-3.5 text-sm font-medium focus-within:ring-2 focus-within:ring-ring sm:flex-none",
                      on ? "bg-surface font-semibold text-foreground shadow-[var(--shadow-card)]" : "text-foreground/80",
                      disabled && "cursor-not-allowed text-subtle",
                    )}
                  >
                    <input type="radio" name="day_portion" value={value} checked={on} disabled={disabled} onChange={() => setPortion(value)} className="sr-only" />
                    {label}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted">{halfDayAllowed ? "Half days deduct 0.5 day." : "Half days are for single-day requests."}</p>
          </fieldset>

          <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Optional for most leave types. Visible to your approvers and HR.">
            <Textarea id="reason" name="reason" maxLength={1000} />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">
              Supporting document{result?.attachment_required && <span className="text-danger"> *</span>}
            </span>
            <label
              htmlFor="attachment"
              className="flex cursor-pointer items-center gap-3.5 rounded-[10px] border border-dashed border-border-strong bg-surface-subtle p-4 focus-within:ring-2 focus-within:ring-ring"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5">
                  <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
                </svg>
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[13px]">{fileName ?? "Upload a file"}</b>
                <span className="block text-xs text-muted">
                  PDF, JPG, PNG or DOCX · up to 10 MB · {result?.attachment_required ? "required for this request" : "optional"}
                </span>
              </span>
              <input
                id="attachment"
                name="attachment"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            {state.fieldErrors?.attachment && <p className="text-xs font-medium text-danger">{state.fieldErrors.attachment.join(" ")}</p>}
          </div>

          {result?.warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
        </div>
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface/95 px-5 py-3.5 md:px-6">
          <Link href="/me/leave" className={buttonClass("ghost")}>
            Cancel
          </Link>
          {/* The server re-validates everything; the summary only guides the employee. */}
          <SubmitButton size="lg" disabled={blocking}>
            Submit request
          </SubmitButton>
        </div>
      </Card>

      <Card className="lg:sticky lg:top-20" aria-labelledby="summary-title">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="summary-title" className="text-[17px] font-bold">
            Summary
          </h2>
          {result &&
            (blocking ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 text-xs font-semibold text-danger">
                <span className="size-1.5 rounded-full bg-current" />
                Can’t submit yet
              </span>
            ) : (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-semibold text-success">
                <span className="size-1.5 rounded-full bg-current" />
                Ready to submit
              </span>
            ))}
        </div>
        <div className="flex flex-col gap-4 px-5 py-5" aria-live="polite">
          {checking && !result ? (
            <p className="text-sm text-muted">Checking…</p>
          ) : shown && "error" in shown ? (
            <p className="text-sm text-danger">{shown.error}</p>
          ) : result ? (
            <>
              <div>
                <p className="text-[13px] text-muted">Days deducted</p>
                <p className="font-[family-name:var(--font-display)] text-[28px] font-bold leading-9">
                  {formatDays(result.days)}{" "}
                  <span className="text-base font-medium text-muted">{type?.counts_calendar_days ? "calendar" : "working"} day(s)</span>
                </p>
              </div>
              {result.balance_tracked && (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-muted">Available now</dt>
                  <dd className="text-right font-semibold">{formatDays(result.available)}</dd>
                  <dt className="text-muted">This request</dt>
                  <dd className="text-right font-semibold">− {formatDays(result.days)}</dd>
                  <dt className="font-semibold">After approval</dt>
                  <dd className={cn("text-right font-bold", result.remaining_after < 0 && "text-danger")}>{formatDays(result.remaining_after)} days</dd>
                </dl>
              )}
              {result.errors.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {result.errors.map((e) => (
                    <li key={e} className="flex gap-1.5 text-[13px] font-medium text-danger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {result.attachment_required && result.errors.length === 0 && !fileName && (
                <p className="text-[13px] font-medium text-warning">Attach a supporting document before submitting.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Choose your dates to see how many days will be deducted.</p>
          )}
          <div className="h-px bg-border" />
          <div>
            <p className="mb-1 text-[13px] font-semibold">Approval</p>
            <p className="text-[13px] text-muted">
              {approver ? (
                <>
                  First goes to <b className="text-foreground">{approver}</b> (your supervisor), then your department head if that’s someone else.
                </>
              ) : (
                "Goes to your department head, or to HR if no approver is set on your 201 record."
              )}
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[13px] text-[#123e7a] dark:text-info">
            Rest days and holidays are not deducted. Days follow your work schedule.
          </div>
        </div>
      </Card>
    </form>
  );
}
