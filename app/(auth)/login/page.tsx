import type { Metadata } from "next";
import Image from "next/image";
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <Image src="/surepay-logo.png" alt="SurePay" width={72} height={63} priority className="h-auto w-[72px]" />
          <div>
            <h1 className="text-[22px] font-bold leading-7 text-foreground">Sign in to SurePay HRIS</h1>
            <p className="mt-1 text-sm text-muted">Use your company account</p>
          </div>
        </div>
        <LoginForm next={next} error={error} sso={publicEnv.ssoProvider()} resetByEmail={authEmailsEnabled()} />
        <p className="mt-6 text-center text-xs text-muted">Authorised SurePay Technologies Inc. personnel only. Activity is logged.</p>
      </div>
    </main>
  );
}
