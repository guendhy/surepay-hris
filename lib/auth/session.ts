import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/auth/permissions";

export type SessionEmployee = {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department_name: string | null;
  position_title: string | null;
};

export type Session = {
  userId: string;
  email: string;
  isActive: boolean;
  roles: string[];
  permissions: Permission[];
  requiresMfa: boolean;
  aal: "aal1" | "aal2";
  isManager: boolean;
  employee: SessionEmployee | null;
};

/**
 * Data Access Layer: the single place that reads the session.
 * Memoised per request with React `cache`, so layouts, pages and actions can
 * all call it without extra round trips.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("my_access");
  if (error || !data) return null;

  return {
    userId: data.user_id,
    email: data.email,
    isActive: data.is_active,
    roles: data.roles ?? [],
    permissions: data.permissions ?? [],
    requiresMfa: data.requires_mfa,
    aal: data.aal === "aal2" ? "aal2" : "aal1",
    isManager: Boolean(data.is_manager),
    employee: data.employee ?? null,
  };
});

/** Signed-in, active, and MFA-verified when any role requires it. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isActive) redirect("/login?error=inactive");
  if (session.requiresMfa && session.aal !== "aal2") redirect("/mfa");
  return session;
}

export function can(session: Session, permission: Permission): boolean {
  return session.permissions.includes(permission);
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireUser();
  if (!can(session, permission)) redirect("/forbidden");
  return session;
}

/** For Server Actions: returns an error message instead of redirecting. */
export async function authorizeAction(permission?: Permission): Promise<
  { ok: true; session: Session } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !session.isActive) return { ok: false, message: "Your session has ended. Please sign in again." };
  if (session.requiresMfa && session.aal !== "aal2") {
    return { ok: false, message: "Please complete two-factor verification first." };
  }
  if (permission && !can(session, permission)) {
    return { ok: false, message: "You do not have permission to do this." };
  }
  return { ok: true, session };
}
