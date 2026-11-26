import { LinkButton } from "@/components/ui/primitives";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">You don&apos;t have access to this page</h1>
      <p className="max-w-md text-sm text-muted">
        If you need it for your work, ask HR or a system administrator to update your role.
      </p>
      <LinkButton href="/dashboard" variant="secondary">
        Back to dashboard
      </LinkButton>
    </main>
  );
}
