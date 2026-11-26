import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/primitives";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Set password" };

/**
 * Where invite and reset links land. Deliberately outside the MFA-gated app
 * layout: a newly invited HR user must be able to choose a password before
 * enrolling an authenticator app.
 */
export default async function SetPasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=callback");
  if (!session.isActive) redirect("/login?error=inactive");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Set your password</h1>
        <p className="mb-6 text-sm text-muted">
          {session.email} · Use at least 12 characters. A passphrase of several words works well.
        </p>
        <Card className="p-6">
          <PasswordForm />
        </Card>
      </div>
    </main>
  );
}
