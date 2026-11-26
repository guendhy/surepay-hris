"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { compensationSchema, employeeSchema, governmentIdsSchema, safeFileName, validateUpload } from "@/lib/validations";
import { encryptField, lastFour } from "@/lib/crypto";
import { publicEnv } from "@/lib/env";

function employeePayload(formData: FormData) {
  const raw = formToObject(formData);
  return employeeSchema.safeParse({ ...raw, is_solo_parent: formData.get("is_solo_parent") === "on" });
}

function nullify<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v]));
}

export async function createEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage");
  if (!auth.ok) return failure(auth.message);
  const parsed = employeePayload(formData);
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({ ...nullify(parsed.data), created_by: auth.session.userId })
    .select("id")
    .single();
  if (error) return dbError(error, "The employee could not be created.");
  revalidatePath("/hr/employees");
  redirect(`/hr/employees/${data.id}?created=1`);
}

export async function updateEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failure("Invalid employee.");
  const parsed = employeePayload(formData);
  if (!parsed.success) return fromZod(parsed.error);
  if (parsed.data.employment_status === "separated" && !parsed.data.separation_date) {
    return failure("Enter the separation date.", { separation_date: ["Required when separated."] });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(nullify(parsed.data)).eq("id", id.data);
  if (error) return dbError(error, "Changes could not be saved.");
  revalidatePath(`/hr/employees/${id.data}`);
  return success("Employee record saved.");
}

export async function saveGovernmentIds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage_sensitive");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("employee_id"));
  if (!id.success) return failure("Invalid employee.");

  const digits = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(/\D/g, "");
    return v === "" ? undefined : v;
  };
  const parsed = governmentIdsSchema.safeParse({
    tin: digits("tin"),
    sss: digits("sss"),
    philhealth: digits("philhealth"),
    pagibig: digits("pagibig"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  // Only fields that were filled in are replaced; blanks keep the stored value.
  const update: Record<string, string> = {};
  for (const key of ["tin", "sss", "philhealth", "pagibig"] as const) {
    const value = parsed.data[key];
    if (value) {
      update[`${key}_enc`] = encryptField(value);
      update[`${key}_last4`] = lastFour(value);
    }
  }
  if (Object.keys(update).length === 0) return failure("Enter at least one ID to update.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_government_ids")
    .upsert({ employee_id: id.data, ...update, updated_by: auth.session.userId }, { onConflict: "employee_id" });
  if (error) return dbError(error, "Government IDs could not be saved.");
  revalidatePath(`/hr/employees/${id.data}`);
  return success("Government IDs saved (encrypted).");
}

export async function saveCompensation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage_compensation");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("employee_id"));
  if (!id.success) return failure("Invalid employee.");
  const parsed = compensationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const account = parsed.data.bank_account?.replace(/\D/g, "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_compensation", {
    p_employee_id: id.data,
    p_pay_type: parsed.data.pay_type,
    p_basic_salary: parsed.data.basic_salary,
    p_effective_date: parsed.data.effective_date,
    p_reason: parsed.data.reason,
    p_bank_name: parsed.data.bank_name ?? null,
    p_bank_account_enc: account ? encryptField(account) : null,
    p_bank_account_last4: account ? lastFour(account) : null,
    p_allowances: [],
  });
  if (error) return dbError(error, "Compensation could not be saved.");
  revalidatePath(`/hr/employees/${id.data}`);
  return success("Compensation saved and added to salary history.");
}

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("employee_id"));
  if (!id.success) return failure("Invalid employee.");
  const meta = z
    .object({
      document_type: z.string().min(2).max(60),
      title: z.string().min(2).max(150),
      expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .safeParse(formToObject(formData));
  if (!meta.success) return fromZod(meta.error);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return failure("Choose a file.", { file: ["Required"] });
  const uploadError = validateUpload(file);
  if (uploadError) return failure(uploadError, { file: [uploadError] });

  const supabase = await createClient();
  const path = `${id.data}/documents/${randomUUID()}-${safeFileName(file.name)}`;
  const { error: upErr } = await supabase.storage.from("employee-files").upload(path, file, { contentType: file.type });
  if (upErr) return failure("Upload failed. Please try again.");

  const { error } = await supabase.from("employee_documents").insert({
    employee_id: id.data,
    document_type: meta.data.document_type,
    title: meta.data.title,
    expires_on: meta.data.expires_on ?? null,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: auth.session.userId,
  });
  if (error) {
    await supabase.storage.from("employee-files").remove([path]);
    return dbError(error, "The document could not be saved.");
  }
  revalidatePath(`/hr/employees/${id.data}`);
  return success("Document uploaded.");
}

export async function archiveDocument(formData: FormData): Promise<void> {
  const auth = await authorizeAction("employee.manage");
  if (!auth.ok) return;
  const supabase = await createClient();
  const docId = String(formData.get("id"));
  const employeeId = String(formData.get("employee_id"));
  await supabase.from("employee_documents").update({ archived_at: new Date().toISOString() }).eq("id", docId);
  revalidatePath(`/hr/employees/${employeeId}`);
}

/**
 * Sends a Supabase Auth invite to the employee's work email. When they accept,
 * the database links the login to this 201 record (matching work email).
 */
export async function inviteEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.invite");
  if (!auth.ok) return failure(auth.message);
  const id = z.uuid().safeParse(formData.get("employee_id"));
  if (!id.success) return failure("Invalid employee.");

  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("work_email, user_id, first_name, last_name").eq("id", id.data).single();
  if (!emp) return failure("Employee not found.");
  if (emp.user_id) return failure("This employee already has a login.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(emp.work_email, {
    data: { full_name: `${emp.first_name} ${emp.last_name}` },
    redirectTo: `${publicEnv.appUrl()}/auth/callback?next=/me/password`,
  });
  if (error) return failure(`The invitation could not be sent: ${error.message}`);
  await supabase.rpc("log_event", { p_action: "admin.user_invited", p_context: { employee_id: id.data } });
  revalidatePath(`/hr/employees/${id.data}`);
  return success(`Invitation sent to ${emp.work_email}.`);
}

export async function adjustBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("leave.adjust");
  if (!auth.ok) return failure(auth.message);
  const parsed = z
    .object({
      employee_id: z.uuid(),
      leave_type_id: z.uuid("Choose a leave type."),
      days: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 365, "Enter non-zero days (negative to deduct)."),
      entry_type: z.enum(["adjustment", "opening_balance"]),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().min(3, "Give a reason.").max(300),
    })
    .safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_leave_balance", {
    p_employee_id: parsed.data.employee_id,
    p_leave_type_id: parsed.data.leave_type_id,
    p_days: parsed.data.days,
    p_reason: parsed.data.reason,
    p_entry_type: parsed.data.entry_type,
    p_effective_date: parsed.data.effective_date,
  });
  if (error) return dbError(error, "The adjustment could not be posted.");
  revalidatePath(`/hr/employees/${parsed.data.employee_id}`);
  return success("Balance adjusted.");
}
