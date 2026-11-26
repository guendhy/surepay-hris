import { LinkButton } from "@/components/ui/primitives";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-7">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </span>
      <h1 className="text-[22px] font-bold text-foreground">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-sm text-muted">If you need it for your work, ask your HR Manager or IT to update your role.</p>
      <LinkButton href="/dashboard" className="mt-2">
        Go to dashboard
      </LinkButton>
    </main>
  );
}
