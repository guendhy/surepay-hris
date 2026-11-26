"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";

const optionalUuid = z.uuid().optional();
const money = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount.").optional();

const schemas = {
  departments: z.object({
    code: z.string().min(2).max(20).transform((v) => v.toUpperCase()),
    name: z.string().min(2).max(100),
    head_employee_id: optionalUuid,
    parent_id: optionalUuid,
    cost_center: z.string().max(50).optional(),
  }),
  positions: z.object({
    title: z.string().min(2).max(100),
    department_id: optionalUuid,
    job_level_id: optionalUuid,
  }),
  locations: z.object({
    name: z.string().min(2).max(100),
    address: z.string().max(300).optional(),
  }),
  job_levels: z.object({
    code: z.string().min(1).max(20).transform((v) => v.toUpperCase()),
    name: z.string().min(2).max(100),
    rank: z.coerce.number().int().min(0).max(100),
    salary_min: money,
    salary_max: money,
  }),
} as const;

type Table = keyof typeof schemas;

export async function saveOrgItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("org.manage");
  if (!auth.ok) return failure(auth.message);
  const table = String(formData.get("_table")) as Table;
  if (!(table in schemas)) return failure("Unknown item.");
  const parsed = schemas[table].safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const values = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v ?? null]));
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(table).update(values).eq("id", id)
    : await supabase.from(table).insert(values);
  if (error) return dbError(error);
  revalidatePath("/hr/settings/org");
  return success("Saved.");
}

export async function toggleOrgItem(formData: FormData): Promise<void> {
  const auth = await authorizeAction("org.manage");
  if (!auth.ok) return;
  const table = String(formData.get("_table"));
  if (!["departments", "positions", "locations"].includes(table)) return;
  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ is_active: formData.get("is_active") === "true" })
    .eq("id", String(formData.get("id")));
  revalidatePath("/hr/settings/org");
}
