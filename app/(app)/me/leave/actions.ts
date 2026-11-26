"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, fromZod, success, type ActionState } from "@/lib/action";
import { leaveRequestSchema, safeFileName, validateUpload } from "@/lib/validations";
import { drainEmailOutbox } from "@/lib/email";
import type { LeavePreview } from "@/lib/types";

/** Live preview while filling the form: days, balance, errors, warnings. */
export async function previewLeave(input: {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  day_portion: "full" | "am" | "pm";
}): Promise<LeavePreview | { error: string }> {
  const auth = await authorizeAction();
  if (!auth.ok) return { error: auth.message };
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the dates." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_leave_request", {
    p_leave_type_id: parsed.data.leave_type_id,
    p_start: parsed.data.start_date,
    p_end: parsed.data.end_date,
    p_portion: parsed.data.day_portion,
  });
  if (error) return { error: "Could not check this request right now." };
  return data as LeavePreview;
}

export async function submitLeave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction();
  if (!auth.ok) return failure(auth.message);
  const employeeId = auth.session.employee?.id;
  if (!employeeId) return failure("Your login is not linked to an employee record.");

  const parsed = leaveRequestSchema.safeParse({
    leave_type_id: formData.get("leave_type_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    day_portion: formData.get("day_portion") || "full",
    reason: (formData.get("reason") as string) || undefined,
  });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const file = formData.get("attachment") as File | null;
  const uploadError = validateUpload(file);
  if (uploadError) return failure(uploadError, { attachment: [uploadError] });

  let attachmentPath: string | null = null;
  if (file && file.size > 0) {
    attachmentPath = `${employeeId}/leave/${randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("employee-files").upload(attachmentPath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return failure("The attachment could not be uploaded. Please try again.");
  }

  const { error } = await supabase.rpc("submit_leave_request", {
    p_leave_type_id: parsed.data.leave_type_id,
    p_start: parsed.data.start_date,
    p_end: parsed.data.end_date,
    p_portion: parsed.data.day_portion,
    p_reason: parsed.data.reason ?? null,
    p_attachment_path: attachmentPath,
  });

  if (error) {
    if (attachmentPath) await supabase.storage.from("employee-files").remove([attachmentPath]);
    return dbError(error, "Your request could not be submitted.");
  }

  after(() => drainEmailOutbox());
  revalidatePath("/me/leave");
  redirect("/me/leave?submitted=1");
}

export async function cancelLeave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction();
  if (!auth.ok) return failure(auth.message);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", { p_leave_id: id, p_reason: reason });
  if (error) return dbError(error, "The request could not be cancelled.");
  after(() => drainEmailOutbox());
  revalidatePath("/me/leave");
  revalidatePath("/hr/leave");
  return success("Request cancelled.");
}
