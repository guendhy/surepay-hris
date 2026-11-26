"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, success, type ActionState } from "@/lib/action";

const stepSchema = z.object({
  approver_kind: z.enum(["supervisor", "department_head", "role"]),
  role_code: z.string().optional(),
  escalate_after_days: z.coerce.number().int().min(0).max(30),
});

export async function createFlow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("approvals.configure");
  if (!auth.ok) return failure(auth.message);

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3) return failure("Give the flow a name.", { name: ["Required"] });
  const leaveTypeId = String(formData.get("leave_type_id") ?? "") || null;
  const departmentId = String(formData.get("department_id") ?? "") || null;

  const steps: z.infer<typeof stepSchema>[] = [];
  for (let i = 1; i <= 3; i++) {
    const kind = String(formData.get(`step${i}_kind`) ?? "");
    if (!kind) continue;
    const parsed = stepSchema.safeParse({
      approver_kind: kind,
      role_code: String(formData.get(`step${i}_role`) ?? "") || undefined,
      escalate_after_days: formData.get(`step${i}_escalate`) ?? 2,
    });
    if (!parsed.success) return failure(`Step ${i}: ${parsed.error.issues[0]?.message}`);
    if (parsed.data.approver_kind === "role" && !parsed.data.role_code) return failure(`Step ${i}: choose a role.`);
    steps.push(parsed.data);
  }
  if (steps.length === 0) return failure("Add at least one approval step.");

  const supabase = await createClient();
  const { data: flow, error } = await supabase
    .from("approval_flows")
    .insert({ name, request_type: "leave", leave_type_id: leaveTypeId, department_id: departmentId })
    .select("id")
    .single();
  if (error) return dbError(error);

  const { error: stepError } = await supabase.from("approval_flow_steps").insert(
    steps.map((s, i) => ({
      flow_id: flow.id,
      step_order: i + 1,
      approver_kind: s.approver_kind,
      role_code: s.approver_kind === "role" ? s.role_code : null,
      escalate_after_days: s.escalate_after_days,
    })),
  );
  if (stepError) {
    await supabase.from("approval_flows").delete().eq("id", flow.id);
    return dbError(stepError);
  }
  revalidatePath("/hr/settings/approval-flows");
  return success("Approval flow created. It applies to new requests.");
}

export async function toggleFlow(formData: FormData): Promise<void> {
  const auth = await authorizeAction("approvals.configure");
  if (!auth.ok) return;
  const supabase = await createClient();
  await supabase.from("approval_flows").update({ is_active: formData.get("is_active") === "true" }).eq("id", String(formData.get("id")));
  revalidatePath("/hr/settings/approval-flows");
}
