"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signInWithSso } from "../actions";
import { initialActionState } from "@/lib/action";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";

function LockIcon() {
  return (
    <span className="inline-flex size-12 items-center justify-center rounded-full bg-info-soft text-info" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-6">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
  );
}

export function LoginForm({
  next,
  error,
  sso,
  resetByEmail,
}: {
  next?: string;
  error?: string;
  sso: "google" | "azure" | "none";
  resetByEmail: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [state, action] = useActionState(signIn, initialActionState);
  const [resetState, resetAction] = useActionState(requestPasswordReset, initialActionState);

  if (mode === "reset" && !resetByEmail) {
    return (
      <Card className="flex flex-col gap-4 p-6">
        <LockIcon />
        <h2 className="text-[17px] font-bold">Reset your password</h2>
        <p className="text-sm text-muted">
          Password reset emails aren’t set up yet. Ask HR — or IT if you’ve signed in before — for a one-time reset link. They’ll send it to you in a direct chat
          message.
        </p>
        <Button type="button" variant="secondary" onClick={() => setMode("signin")}>
          Back to sign in
        </Button>
      </Card>
    );
  }

  if (mode === "reset") {
    return (
      <Card className="p-6">
        <form action={resetAction} className="flex flex-col gap-4">
          <LockIcon />
          <h2 className="text-[17px] font-bold">Reset your password</h2>
          <p className="text-sm text-muted">Enter your work email and we’ll send you a link to set a new password.</p>
          <Field label="Work email" htmlFor="reset-email">
            <Input id="reset-email" name="email" type="email" autoComplete="email" required className="h-11" />
          </Field>
          {resetState.message && <Alert tone={resetState.ok ? "success" : "danger"}>{resetState.message}</Alert>}
          <SubmitButton size="lg">Send reset link</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setMode("signin")}>
            Back to sign in
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {sso !== "none" && (
          <>
            <form action={signInWithSso}>
              <input type="hidden" name="next" value={next ?? ""} />
              <Button type="submit" variant="secondary" className="w-full">
                Continue with {sso === "google" ? "Google Workspace" : "Microsoft 365"}
              </Button>
            </form>
            <div className="flex items-center gap-2.5 text-xs text-muted">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required className="h-11" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-[13px] font-semibold">
                Password
              </label>
              <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => setMode("reset")}>
                Forgot password?
              </button>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
          </div>
          {state.message && <Alert tone="danger">{state.message}</Alert>}
          <SubmitButton size="lg">Sign in</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
