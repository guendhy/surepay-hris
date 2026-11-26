import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LeaveBalance, LeaveType } from "@/lib/types";

export type BalanceReport = {
  types: LeaveType[];
  rows: {
    employeeId: string;
    employeeNo: string;
    name: string;
    department: string;
    balances: Record<string, { available: number; balance: number; used: number; pending: number }>;
  }[];
};

/** Balance per employee per tracked leave type (RLS: leave.view_all). */
export async function getBalanceReport(departmentId?: string): Promise<BalanceReport> {
  const supabase = await createClient();
  let employees = supabase
    .from("employees")
    .select("id, employee_no, first_name, last_name, departments(name)")
    .is("archived_at", null)
    .neq("employment_status", "separated")
    .order("last_name");
  if (departmentId) employees = employees.eq("department_id", departmentId);

  const [{ data: types }, { data: emps }, { data: balances }] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).eq("balance_tracked", true).order("sort_order"),
    employees,
    supabase.from("leave_balances").select("*"),
  ]);

  const byEmployee = new Map<string, LeaveBalance[]>();
  for (const b of (balances ?? []) as LeaveBalance[]) {
    const list = byEmployee.get(b.employee_id) ?? [];
    list.push(b);
    byEmployee.set(b.employee_id, list);
  }

  type Emp = { id: string; employee_no: string; first_name: string; last_name: string; departments: { name: string } | null };
  return {
    types: (types ?? []) as LeaveType[],
    rows: ((emps ?? []) as unknown as Emp[]).map((e) => ({
      employeeId: e.id,
      employeeNo: e.employee_no,
      name: `${e.last_name}, ${e.first_name}`,
      department: e.departments?.name ?? "",
      balances: Object.fromEntries(
        (byEmployee.get(e.id) ?? []).map((b) => [
          b.leave_type_id,
          { available: Number(b.available), balance: Number(b.balance), used: Number(b.used), pending: Number(b.pending) },
        ]),
      ),
    })),
  };
}
