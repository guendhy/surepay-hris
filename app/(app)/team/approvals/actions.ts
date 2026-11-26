"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, success, type ActionState } from "@/lib/action";
import { drainEmailOutbox } from "@/lib/email";

const decisionSchema = z.object({
  task_ids: z.array(z.uuid()).min(1, "Select at least one request."),
  decision: z.enum(["approved", "rejected", "returned"]),
  comment: z.string().max(1000).optional(),
});

export async function decide(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction();
  if (!auth.ok) return failure(auth.message);

  const parsed = decisionSchema.safeParse({
    task_ids: formData.getAll("task_id").map(String),
    decision: formData.get("decision"),
    comment: (formData.get("comment") as string) || undefined,
  });
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Invalid request.");

  const supabase = await createClient();
  const { task_ids, decision, comment } = parsed.data;
  const { error } =
    task_ids.length === 1
      ? await supabase.rpc("act_on_approval_task", { p_task_id: task_ids[0], p_decision: decision, p_comment: comment ?? null })
      : await supabase.rpc("bulk_act_on_approval_tasks", { p_task_ids: task_ids, p_decision: decision, p_comment: comment ?? null });

  if (error) return dbError(error, "The decision could not be saved.");

  after(() => drainEmailOutbox());
  revalidatePath("/team/approvals");
  revalidatePath("/dashboard");
  const verb = decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Returned";
  return success(`${verb} ${task_ids.length} request${task_ids.length === 1 ? "" : "s"}.`);
}
