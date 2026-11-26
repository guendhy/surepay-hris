"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialActionState, type ActionState } from "@/lib/action";
import { Alert, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { FormStateContext } from "@/components/ui/form-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form wrapper around a Server Action: shows the result message and pending
 * state; <Field name="..."> children show field errors from the action.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  submitVariant = "primary",
  resetOnSuccess = false,
  className,
  confirm,
  hideSubmit = false,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  submitVariant?: "primary" | "secondary" | "danger";
  resetOnSuccess?: boolean;
  className?: string;
  confirm?: string;
  hideSubmit?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <FormStateContext value={state}>{children}</FormStateContext>
      {state.message && (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      )}
      {!hideSubmit && (
        <div>
          <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} name={name} value={value}>
      {pending ? "Working…" : children}
    </Button>
  );
}
