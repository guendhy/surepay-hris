"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { holidaySchema } from "@/lib/validations";

export async function addHoliday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("settings.manage");
  if (!auth.ok) return failure(auth.message);
  const parsed = holidaySchema.safeParse({ ...formToObject(formData), is_verified: formData.get("is_verified") === "on" });
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").insert({
    ...parsed.data,
    location_id: parsed.data.location_id ?? null,
    remarks: parsed.data.remarks ?? null,
  });
  if (error) return dbError(error);
  revalidatePath("/hr/settings/holidays");
  return success("Holiday added. Leave day counts use it immediately for new requests.");
}

export async function setHolidayVerified(formData: FormData): Promise<void> {
  const auth = await authorizeAction("settings.manage");
  if (!auth.ok) return;
  const supabase = await createClient();
  await supabase.from("holidays").update({ is_verified: formData.get("verified") === "true" }).eq("id", String(formData.get("id")));
  revalidatePath("/hr/settings/holidays");
}

export async function deleteHoliday(formData: FormData): Promise<void> {
  const auth = await authorizeAction("settings.manage");
  if (!auth.ok) return;
  const supabase = await createClient();
  await supabase.from("holidays").delete().eq("id", String(formData.get("id")));
  revalidatePath("/hr/settings/holidays");
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const scheduleSchema = z.object({
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().min(2).max(100),
  start_time: time,
  end_time: time,
  break_minutes: z.coerce.number().int().min(0).max(240),
});

export async function addSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("settings.manage");
  if (!auth.ok) return failure(auth.message);
  const parsed = scheduleSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const workDays = formData.getAll("work_days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (workDays.length === 0) return failure("Choose at least one work day.", { work_days: ["Required"] });

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").insert({
    ...parsed.data,
    work_days: workDays,
    is_night_shift: formData.get("is_night_shift") === "on",
    is_flexible: formData.get("is_flexible") === "on",
  });
  if (error) return dbError(error);
  revalidatePath("/hr/settings/holidays");
  return success("Schedule added. Assign it to employees from their 201 record.");
}

export async function assignSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("employee.manage");
  if (!auth.ok) return failure(auth.message);
  const parsed = z
    .object({ employee_id: z.uuid("Choose an employee."), schedule_id: z.uuid("Choose a schedule."), effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("employee_schedules").insert({ ...parsed.data, created_by: auth.session.userId });
  if (error) return dbError(error);
  revalidatePath("/hr/settings/holidays");
  return success("Schedule assigned.");
}
