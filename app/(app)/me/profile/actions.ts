"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { contactInfoSchema } from "@/lib/validations";

export async function updateContactInfo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction();
  if (!auth.ok) return failure(auth.message);

  const parsed = contactInfoSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;

  const contacts = v.emergency_name
    ? [{ name: v.emergency_name, relationship: v.emergency_relationship ?? "", phone: v.emergency_phone ?? "" }]
    : [];

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_contact_info", {
    p_mobile_number: v.mobile_number ?? "",
    p_personal_email: v.personal_email ?? "",
    p_present_address: v.present_address ?? "",
    p_emergency_contacts: contacts,
  });
  if (error) return dbError(error);
  revalidatePath("/me/profile");
  return success("Contact details saved.");
}
