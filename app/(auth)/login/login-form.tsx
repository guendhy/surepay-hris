"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signInWithSso } from "../actions";
import { initialActionState } from "@/lib/action";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/action-form";

export function LoginForm({ next, error, sso }: { next?: string; error?: string; sso: "google" | "azure" | "none" }) {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [state, action] = useActionState(signIn, initialActionState);
  const [resetState, resetAction] = useActionState(requestPasswordReset, initialActionState);

  if (mode === "reset") {
    return (
      <Card className="p-6">
        <form action={resetAction} className="flex flex-col gap-4">
          <p className="text-sm text-muted">Enter your work email and we&apos;ll send you a link to set a new password.</p>
          <Field label="Work email" htmlFor="reset-email">
            <Input id="reset-email" name="email" type="email" autoComplete="email" required />
          </Field>
          {resetState.message && <Alert tone={resetState.ok ? "success" : "danger"}>{resetState.message}</Alert>}
          <SubmitButton>Send reset link</SubmitButton>
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
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {state.message && <Alert tone="danger">{state.message}</Alert>}
          <SubmitButton>Sign in</SubmitButton>
        </form>
        <button type="button" className="text-sm text-brand hover:underline" onClick={() => setMode("reset")}>
          Forgot password?
        </button>
      </div>
    </Card>
  );
}
