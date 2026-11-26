"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) return setMessage({ ok: false, text: "Use at least 12 characters." });
    if (password !== confirm) return setMessage({ ok: false, text: "The passwords do not match." });
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      // Accounts that already have an authenticator must verify it before changing the password.
      if (/aal2|assurance/i.test(error.message) || error.code === "insufficient_aal") {
        router.push("/mfa?next=/set-password");
        return;
      }
      return setMessage({ ok: false, text: error.message });
    }
    await supabase.rpc("log_event", { p_action: "auth.password_changed", p_context: {} });
    setMessage({ ok: true, text: "Password saved. Taking you to the HRIS…" });
    // The app layout will ask for an authenticator app next if the role requires it.
    router.replace("/dashboard");
    router.refresh();
  }

  const checks = [
    { ok: /[a-z]/i.test(password) && /\d/.test(password), label: "Letters and numbers" },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: "Upper and lower case" },
    { ok: password.length >= 12, label: password.length >= 12 ? "At least 12 characters" : `At least 12 characters (${password.length} so far)` },
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password">
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" aria-describedby="pw-rules" />
      </Field>
      <ul id="pw-rules" className="flex flex-col gap-1 text-[13px]" aria-label="Password requirements">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "text-success" : "text-muted"}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="h-11" />
      </Field>
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}
      {/* Only the length rule is enforced (as before); the other checks are guidance. */}
      <Button type="submit" size="lg" disabled={busy || password.length < 12}>
        {busy ? "Saving…" : "Save password"}
      </Button>
      <p className="text-xs text-muted">Next: HR, payroll and admin roles are asked to set up an authenticator app.</p>
    </form>
  );
}
