"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

/**
 * TOTP enrolment / verification with Supabase Auth MFA. On success the session
 * is upgraded to aal2, which RLS requires for salaries, government IDs, audit.
 */
export function MfaClient({ email }: { email: string }) {
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
      if (verified) return setStep({ kind: "verify", factorId: verified.id });

      // Clean up abandoned enrolments, then start a new one.
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const enroll = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `HRIS ${email}` });
      if (enroll.error) return setStep({ kind: "error", message: enroll.error.message });
      setStep({ kind: "enroll", factorId: enroll.data.id, qr: enroll.data.totp.qr_code, secret: enroll.data.totp.secret });
    })();
  }, [email]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    if (error) {
      setBusy(false);
      setError("That code did not work. Check your authenticator app and try again.");
      return;
    }
    await supabase.rpc("log_event", {
      p_action: step.kind === "enroll" ? "mfa.enrolled" : "mfa.verified",
      p_context: {},
    });
    router.replace("/dashboard");
    router.refresh();
  }

  if (step.kind === "loading") return <Card className="p-6 text-sm text-muted">Loading…</Card>;
  if (step.kind === "error") return <Alert tone="danger">{step.message}</Alert>;

  return (
    <Card className="p-6">
      <form onSubmit={verify} className="flex flex-col gap-4">
        {step.kind === "enroll" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-foreground">
              1. Scan this QR code with Google Authenticator, Microsoft Authenticator or 1Password.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded bg-white p-2" />
            <details className="w-full text-xs text-muted">
              <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
              <code className="mt-2 block break-all rounded bg-surface-muted p-2 font-mono text-foreground">{step.secret}</code>
            </details>
            <p className="self-start text-sm text-foreground">2. Enter the 6-digit code it shows.</p>
          </div>
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
      </form>
      <form action="/auth/signout" method="post" className="mt-3">
        <Button type="submit" variant="ghost" className="w-full">
          Sign out
        </Button>
      </form>
    </Card>
  );
}
