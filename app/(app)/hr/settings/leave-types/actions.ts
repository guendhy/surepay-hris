"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { leaveTypeSchema } from "@/lib/validations";

const BOOLEANS = [
  "is_paid",
  "balance_tracked",
  "prorate_new_hires",
  "allow_negative",
  "convertible_to_cash",
  "counts_calendar_days",
  "allow_half_day",
  "requires_married",
  "requires_solo_parent",
  "is_active",
] as const;

export async function saveLeaveType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("leave.configure");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failure("Invalid leave type.");

  const raw: Record<string, unknown> = formToObject(formData);
  for (const key of BOOLEANS) raw[key] = formData.get(key) === "on";
  // "Unlimited carry-over" checkbox → null cap
  if (formData.get("carry_over_unlimited") === "on") raw.carry_over_cap = undefined;

  const parsed = leaveTypeSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_types")
    .update({
      ...v,
      carry_over_cap: formData.get("carry_over_unlimited") === "on" ? null : (v.carry_over_cap ?? 0),
      conversion_cap: v.conversion_cap ?? null,
      max_days_per_request: v.max_days_per_request ?? null,
      attachment_required_after_days: v.attachment_required_after_days ?? null,
      eligible_sex: v.eligible_sex ?? null,
      description: v.description ?? null,
      legal_basis: v.legal_basis ?? null,
    })
    .eq("id", id.data);
  if (error) return dbError(error);
  revalidatePath("/hr/settings/leave-types");
  return success("Leave type saved. New requests and the next accrual run use these rules.");
}
