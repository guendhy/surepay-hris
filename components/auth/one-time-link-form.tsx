"use client";

import { useActionState, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action";
import { Alert, Button, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";

/**
 * Button that runs an invite / password-reset action. When the action returns
 * a one-time link (no-SMTP mode) it is shown once, with a copy button and
 * handling instructions. Reloading the page hides it.
 */
export function OneTimeLinkForm({
  action,
  employeeId,
  label,
  variant = "secondary",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  employeeId: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      {!state.link && (
        <form action={formAction}>
          <input type="hidden" name="employee_id" value={employeeId} />
          <SubmitButton variant={variant}>{label}</SubmitButton>
        </form>
      )}
      {state.message && !state.link && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {state.link && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3">
          <p className="text-sm font-medium text-foreground">{state.message}</p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label="One-time sign-in link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={() => copy(state.link!)}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ul className="list-disc pl-5 text-xs text-muted">
            <li>Send it only to the employee, in a direct message on company chat — not in a group or by SMS.</li>
            <li>It works once and expires (24 hours if Supabase is set up as in docs/SETUP.md).</li>
            <li>Anyone with the link can set this account&apos;s password. It will not be shown again.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
