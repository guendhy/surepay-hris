"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Badge, Button, Card, Field, Input, Tag } from "@/components/ui/primitives";

type Step =
  | { kind: "loading" }
  | { kind: "start" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

const ISSUER = "Surepay HRIS";

/** Turns Supabase MFA errors into guidance; unknown errors are shown as-is. */
function explain(error: { message: string; code?: string }): string {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (text.includes("invalid") || text.includes("mfa_verification_failed")) {
    return "That code was not accepted. Use the newest “Surepay HRIS” entry in your app (delete older ones), make sure your phone's date and time are set automatically, and type the code before it changes.";
  }
  if (text.includes("expired")) return "The code expired. Enter the current code from your app.";
  if (text.includes("disabled")) return `Authenticator apps are not enabled for this project (${error.message}). Ask IT to enable TOTP in Supabase → Authentication → Multi-Factor.`;
  return `Verification failed: ${error.message}`;
}

/**
 * TOTP enrolment / verification with Supabase Auth MFA. On success the session
 * is upgraded to aal2, which RLS requires for salaries, government IDs, audit.
 *
 * Enrolment starts only when the user clicks, and only then is a new secret
 * created — reloading the page must not silently replace the secret the user
 * already scanned.
 */
export function MfaClient({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setStep({ kind: "error", message: error.message });
      const verified = data.totp.find((f) => f.status === "verified");
      setStep(verified ? { kind: "verify", factorId: verified.id } : { kind: "start" });
    })();
  }, []);

  async function startEnrolment() {
    setBusy(true);
    setError(null);
    setCode("");
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    // Remove earlier, never-verified attempts so only one secret is live.
    for (const f of data?.all.filter((f) => f.status === "unverified") ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const enroll = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: ISSUER,
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}`,
    });
    setBusy(false);
    if (enroll.error) return setStep({ kind: "error", message: explain(enroll.error) });
    setStep({ kind: "enroll", factorId: enroll.data.id, qr: enroll.data.totp.qr_code, secret: enroll.data.totp.secret });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    if (error) {
      setBusy(false);
      setError(explain(error));
      return;
    }
    await supabase.rpc("log_event", {
      p_action: step.kind === "enroll" ? "mfa.enrolled" : "mfa.verified",
      p_context: {},
    });
    router.replace(next);
    router.refresh();
  }

  const signOut = (
    <form action="/auth/signout" method="post" className="mt-3">
      <Button type="submit" variant="ghost" className="w-full">
        Sign out
      </Button>
    </form>
  );

  if (step.kind === "loading") return <Card className="p-6 text-sm text-muted">Loading…</Card>;
  if (step.kind === "error") {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <Alert tone="danger">{step.message}</Alert>
        <Button variant="secondary" onClick={() => setStep({ kind: "start" })}>
          Try again
        </Button>
        {signOut}
      </Card>
    );
  }

  const progress = (current: 1 | 2) => (
    <ol className="mb-1 flex flex-wrap gap-2" aria-label="Progress">
      {["Get the app", "Scan", "Verify"].map((label, i) => {
        const n = i + 1;
        const tone = n < current ? "success" : n === current || (current === 2 && n === 3) ? "brand" : "neutral";
        return (
          <li key={label}>
            <Badge tone={tone} aria-current={n === current ? "step" : undefined}>
              {n < current ? `${n} · Done` : `${n} · ${label}`}
            </Badge>
          </li>
        );
      })}
    </ol>
  );

  if (step.kind === "start") {
    return (
      <Card className="flex flex-col gap-4 p-6">
        {progress(1)}
        <p className="text-sm text-foreground">Install one of these on your phone:</p>
        <div className="flex flex-wrap gap-1.5">
          <Tag>Google Authenticator</Tag>
          <Tag>Microsoft Authenticator</Tag>
          <Tag>1Password</Tag>
        </div>
        <p className="text-sm text-muted">
          If you already scanned a “Surepay HRIS” code for <strong className="text-foreground">{email}</strong> before, delete that entry from
          your app first — a new code will replace it.
        </p>
        <Button onClick={startEnrolment} disabled={busy} size="lg">
          {busy ? "Preparing…" : "Set up authenticator app"}
        </Button>
        {signOut}
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={verify} className="flex flex-col gap-4">
        {step.kind === "enroll" && progress(2)}
        {step.kind === "enroll" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-foreground">1. In your authenticator app, add an account and scan this QR code.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded bg-white p-2" />
            <details className="w-full text-xs text-muted">
              <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
              <code className="mt-2 block break-all rounded bg-surface-muted p-2 font-mono text-foreground">{step.secret}</code>
            </details>
            <p className="self-start text-sm text-foreground">
              2. Enter the 6-digit code shown under <strong>{ISSUER}</strong>.
            </p>
          </div>
        )}
        {step.kind === "verify" && (
          <p className="text-sm text-foreground">Enter the 6-digit code from the “{ISSUER}” entry in your authenticator app.</p>
        )}
        <Field label="Authentication code" htmlFor="code">
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            autoFocus
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
        {step.kind === "enroll" && (
          <button type="button" onClick={startEnrolment} className="text-xs text-brand hover:underline" disabled={busy}>
            Start over with a new QR code
          </button>
        )}
      </form>
      {step.kind === "verify" && (
        <p className="mt-3 text-xs text-muted">Lost your phone? Ask IT (Super Admin) to reset your authenticator.</p>
      )}
      {signOut}
    </Card>
  );
}
