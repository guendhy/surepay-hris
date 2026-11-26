import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { authEmailsEnabled, publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  inactive: "Your account is not active. Please contact HR.",
  sso: "Single sign-on did not complete. Please try again.",
  callback: "That sign-in link is invalid or has expired.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={48} height={48} />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Surepay HRIS</h1>
            <p className="text-sm text-muted">Sign in with your company account</p>
          </div>
        </div>
        <LoginForm next={next} error={error} sso={publicEnv.ssoProvider()} resetByEmail={authEmailsEnabled()} />
        <p className="mt-8 text-center text-xs text-muted">
          Authorised Surepay Technologies Inc. personnel only. Activity is logged.
        </p>
      </div>
    </main>
  );
}
