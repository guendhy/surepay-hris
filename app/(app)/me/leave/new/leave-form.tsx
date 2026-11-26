"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { initialActionState } from "@/lib/action";
import { formatDays } from "@/lib/format";
import type { LeavePreview, LeaveType } from "@/lib/types";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";
import { previewLeave, submitLeave } from "../actions";

export function LeaveForm({ types, today }: { types: LeaveType[]; today: string }) {
  const [state, action] = useActionState(submitLeave, initialActionState);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [portion, setPortion] = useState<"full" | "am" | "pm">("full");
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
        setPreview(
          await previewLeave({ leave_type_id: typeId, start_date: start, end_date: end, day_portion: halfDayAllowed ? portion : "full" }),
        );
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [inputsValid, typeId, start, end, portion, halfDayAllowed]);

  const shown = inputsValid ? preview : null;
  const result = shown && !("error" in shown) ? shown : null;
  const blocking = result ? result.errors.length > 0 : true;

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Leave type" htmlFor="leave_type_id" required error={state.fieldErrors?.leave_type_id}>
        <Select id="leave_type_id" name="leave_type_id" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_paid ? "" : " (unpaid)"}
            </option>
          ))}
        </Select>
      </Field>
      {type?.description && <p className="-mt-3 text-xs text-muted">{type.description}</p>}

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
          />
        </Field>
        <Field label="End date" htmlFor="end_date" required error={state.fieldErrors?.end_date}>
          <Input id="end_date" name="end_date" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
      </div>

      {halfDayAllowed ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Duration</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["full", "Whole day"],
                ["am", "Half day (AM)"],
                ["pm", "Half day (PM)"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="day_portion"
                  value={value}
                  checked={portion === value}
                  onChange={() => setPortion(value)}
                  className="accent-[var(--brand)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="day_portion" value="full" />
      )}

      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Optional for most leave types. Visible to your approvers and HR.">
        <Textarea id="reason" name="reason" maxLength={1000} />
      </Field>

      <Field
        label="Supporting document"
        htmlFor="attachment"
        required={result?.attachment_required}
        error={state.fieldErrors?.attachment}
        hint="PDF, JPG, PNG or DOCX, up to 10 MB."
      >
        <Input id="attachment" name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="py-2" />
      </Field>

      {/* Live check */}
      <div aria-live="polite" className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
        {checking && !result ? (
          <p className="text-muted">Checking…</p>
        ) : shown && "error" in shown ? (
          <p className="text-danger">{shown.error}</p>
        ) : result ? (
          <div className="flex flex-col gap-2">
            <p className="text-foreground">
              <span className="text-lg font-semibold">{formatDays(result.days)}</span> day(s) will be deducted
              {result.balance_tracked && (
                <>
                  {" "}
                  · available now <strong>{formatDays(result.available)}</strong> · after this{" "}
                  <strong className={result.remaining_after < 0 ? "text-danger" : ""}>{formatDays(result.remaining_after)}</strong>
                </>
              )}
            </p>
            {result.attachment_required && result.errors.length === 0 && (
              <p className="text-warning">A supporting document is required for this request.</p>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="text-warning">
                ⚠ {w}
              </p>
            ))}
            {result.errors.map((e) => (
              <p key={e} className="text-danger">
                {e}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted">Choose your dates to see how many days will be deducted.</p>
        )}
      </div>

      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}

      <div>
        {/* The server re-validates everything; the preview only guides the employee. */}
        <SubmitButton disabled={Boolean(result && blocking)}>Submit request</SubmitButton>
      </div>
    </form>
  );
}
