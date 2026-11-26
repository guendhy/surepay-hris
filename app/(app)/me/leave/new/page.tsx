import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayManila } from "@/lib/format";
import type { DirectoryEntry, LeaveType } from "@/lib/types";
import { PageHeader } from "@/components/ui/primitives";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "File leave" };

export default async function NewLeavePage() {
  const session = await requireUser();
  if (!session.employee) redirect("/me/leave");
  const supabase = await createClient();
  const [{ data }, { data: me }, { data: directory }] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("employees").select("supervisor_id").eq("id", session.employee.id).maybeSingle(),
    supabase.rpc("get_employee_directory"),
  ]);
  const approver = me?.supervisor_id ? ((directory ?? []) as DirectoryEntry[]).find((p) => p.id === me.supervisor_id)?.full_name ?? null : null;

  return (
    <>
      <PageHeader
        title="File leave"
        description="Days are counted from your work schedule. Rest days and holidays are not deducted."
        breadcrumb={[{ href: "/me/leave", label: "My leave" }]}
      />
      <LeaveForm types={(data ?? []) as LeaveType[]} today={todayManila()} approver={approver} />
    </>
  );
}
