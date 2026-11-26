"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { delegationSchema } from "@/lib/validations";

export async function createDelegation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction();
  if (!auth.ok) return failure(auth.message);
  const parsed = delegationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  if (parsed.data.delegate_user_id === auth.session.userId) return failure("You cannot delegate to yourself.");

  const supabase = await createClient();
  const { error } = await supabase.from("approval_delegations").insert({
    delegator_user_id: auth.session.userId,
    delegate_user_id: parsed.data.delegate_user_id,
    starts_on: parsed.data.starts_on,
    ends_on: parsed.data.ends_on,
    reason: parsed.data.reason ?? null,
  });
  if (error) return dbError(error);
  revalidatePath("/me/delegation");
  return success("Delegation saved. New approval requests will go to your delegate during this period.");
}
