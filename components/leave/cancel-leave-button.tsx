"use client";

import { useActionState, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action";
import { Button, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";

export function CancelLeaveButton({
  id,
  action,
  askReason,
}: {
  id: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  askReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialActionState);

  if (state.ok) return <span className="text-xs text-muted">Cancelled</span>;

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Cancel
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      {askReason && <Input name="reason" placeholder="Reason" className="h-8 w-48" required />}
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Keep
        </Button>
        <SubmitButton size="sm" variant="danger">
          Cancel request
        </SubmitButton>
      </div>
      {state.message && !state.ok && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
