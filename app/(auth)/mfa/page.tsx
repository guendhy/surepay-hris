import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { MfaClient } from "./mfa-client";

export const metadata: Metadata = { title: "Two-factor verification" };

// Only these in-app destinations may follow verification.
const ALLOWED_NEXT = ["/dashboard", "/set-password"];

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const next = typeof sp.next === "string" && ALLOWED_NEXT.includes(sp.next) ? sp.next : "/dashboard";
  if (session.aal === "aal2") redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Two-factor verification</h1>
        <p className="mb-6 text-sm text-muted">
          {session.requiresMfa
            ? "Your role gives access to sensitive employee data, so an authenticator app code is required."
            : "Add an authenticator app to protect your account."}
        </p>
        <MfaClient email={session.email} next={next} />
      </div>
    </main>
  );
}
