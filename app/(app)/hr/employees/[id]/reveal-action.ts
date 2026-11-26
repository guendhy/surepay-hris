"use server";

import { z } from "zod";
import { authorizeAction } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/crypto";

const FIELDS = ["tin", "sss", "philhealth", "pagibig"] as const;

/** Decrypts one government ID for display. Every reveal is written to the audit log. */
export async function revealGovernmentId(employeeId: string, field: (typeof FIELDS)[number]): Promise<{ value: string } | { error: string }> {
  const auth = await authorizeAction("employee.view_sensitive");
  if (!auth.ok) return { error: auth.message };
  if (!z.uuid().safeParse(employeeId).success || !FIELDS.includes(field)) return { error: "Invalid request." };

  const supabase = await createClient();
  const { data } = await supabase.from("employee_government_ids").select(`${field}_enc`).eq("employee_id", employeeId).maybeSingle();
  const encrypted = (data as Record<string, string | null> | null)?.[`${field}_enc`];
  if (!encrypted) return { error: "Not on file." };

  await supabase.rpc("log_event", { p_action: "view.government_id_revealed", p_context: { employee_id: employeeId, field } });
  try {
    return { value: decryptField(encrypted) };
  } catch {
    return { error: "This value could not be decrypted. Check FIELD_ENCRYPTION_KEY." };
  }
}
