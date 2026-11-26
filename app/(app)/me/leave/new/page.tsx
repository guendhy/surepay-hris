import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayManila } from "@/lib/format";
import type { LeaveType } from "@/lib/types";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "File leave" };

export default async function NewLeavePage() {
  const session = await requireUser();
  if (!session.employee) redirect("/me/leave");
  const supabase = await createClient();
  const { data } = await supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order");

  return (
    <>
      <PageHeader
        title="File leave"
        description="Days are counted from your work schedule; rest days and holidays are not deducted."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <LeaveForm types={(data ?? []) as LeaveType[]} today={todayManila()} />
        </CardBody>
      </Card>
    </>
  );
}
