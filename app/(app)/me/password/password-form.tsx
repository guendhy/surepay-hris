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
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    await supabase.rpc("log_event", { p_action: "auth.password_changed", p_context: {} });
    setMessage({ ok: true, text: "Password updated." });
    setPassword("");
    setConfirm("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password">
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
