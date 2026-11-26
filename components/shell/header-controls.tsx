"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Unread notification count, kept live with Supabase Realtime. */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => setUnread((n) => n + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] text-foreground/80 hover:bg-surface-muted"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] text-foreground/80 hover:bg-surface-muted"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] text-foreground/80 hover:bg-surface-muted" aria-label="Sign out">
        <LogOut className="h-5 w-5" />
      </button>
    </form>
  );
}

/** Signs the user out after a period without keyboard/mouse activity (ISMS control). */
export function IdleSignOut({ minutes }: { minutes: number }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => formRef.current?.requestSubmit(), minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);

  return <form ref={formRef} action="/auth/signout" method="post" hidden />;
}
