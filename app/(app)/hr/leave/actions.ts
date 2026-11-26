"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, success, type ActionState } from "@/lib/action";
import { drainEmailOutbox } from "@/lib/email";

export async function hrCancelLeave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("leave.manage");
  if (!auth.ok) return failure(auth.message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", {
    p_leave_id: String(formData.get("id") ?? ""),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return dbError(error, "The request could not be cancelled.");
  after(() => drainEmailOutbox());
  revalidatePath("/hr/leave");
  return success("Cancelled.");
}

export async function runAccrualsNow(_prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  void _prev;
  void _formData;
  const auth = await authorizeAction("leave.configure");
  if (!auth.ok) return failure(auth.message);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_leave_accruals", { p_as_of: null });
  if (error) return dbError(error);
  revalidatePath("/hr/leave/balances");
  return success(`Accruals are up to date (${data ?? 0} new ledger entries).`);
}
