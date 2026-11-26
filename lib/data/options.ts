import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DirectoryEntry } from "@/lib/types";

export type OrgOptions = {
  departments: { id: string; name: string; code: string; head_employee_id: string | null; is_active: boolean }[];
  positions: { id: string; title: string; department_id: string | null; is_active: boolean }[];
  locations: { id: string; name: string; is_active: boolean }[];
  jobLevels: { id: string; code: string; name: string; rank: number }[];
  people: DirectoryEntry[];
};

/** Reference lists for employee forms and filters (all RLS-readable). */
export async function getOrgOptions(): Promise<OrgOptions> {
  const supabase = await createClient();
  const [departments, positions, locations, jobLevels, people] = await Promise.all([
    supabase.from("departments").select("id, name, code, head_employee_id, is_active").order("name"),
    supabase.from("positions").select("id, title, department_id, is_active").order("title"),
    supabase.from("locations").select("id, name, is_active").order("name"),
    supabase.from("job_levels").select("id, code, name, rank").order("rank"),
    supabase.rpc("get_employee_directory"),
  ]);
  return {
    departments: departments.data ?? [],
    positions: positions.data ?? [],
    locations: locations.data ?? [],
    jobLevels: jobLevels.data ?? [],
    people: (people.data ?? []) as DirectoryEntry[],
  };
}
