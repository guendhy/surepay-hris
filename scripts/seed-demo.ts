/**
 * Demo data for local development and UAT — FAKE people only.
 *
 *   npm run seed:demo
 *
 * Creates departments, positions, ~14 employees with logins (password from
 * DEMO_PASSWORD), assigns roles, opening leave balances and a few requests.
 * Refuses to run against a non-local project unless ALLOW_REMOTE_DEMO_SEED=yes
 * (use that for STAGING only — never production).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
const password = process.env.DEMO_PASSWORD ?? "";

if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
if (password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) in .env.local");
const isLocal = /localhost|127\.0\.0\.1/.test(url);
if (!isLocal && process.env.ALLOW_REMOTE_DEMO_SEED !== "yes") {
  throw new Error(`Refusing to seed ${url}. Set ALLOW_REMOTE_DEMO_SEED=yes for a staging project.`);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const DOMAIN = "demo.surepay.test";

type Person = {
  key: string;
  first: string;
  last: string;
  dept: string;
  position: string;
  sex: "male" | "female";
  civil: string;
  hired: string;
  type: string;
  supervisor?: string;
  roles?: string[];
};

const PEOPLE: Person[] = [
  { key: "ceo", first: "Ramon", last: "Villanueva", dept: "EXEC", position: "Chief Executive Officer", sex: "male", civil: "married", hired: "2019-03-01", type: "regular", roles: ["department_head"] },
  { key: "hrm", first: "Liza", last: "Santos", dept: "HR", position: "HR Manager", sex: "female", civil: "married", hired: "2020-06-15", type: "regular", supervisor: "ceo", roles: ["hr_manager", "department_head"] },
  { key: "hrs", first: "Mika", last: "Dela Cruz", dept: "HR", position: "HR Associate", sex: "female", civil: "single", hired: "2023-02-01", type: "regular", supervisor: "hrm", roles: ["hr_staff"] },
  { key: "pay", first: "Jun", last: "Ramos", dept: "FIN", position: "Payroll Officer", sex: "male", civil: "married", hired: "2021-09-01", type: "regular", supervisor: "fin", roles: ["payroll_officer"] },
  { key: "fin", first: "Grace", last: "Lim", dept: "FIN", position: "Finance Manager", sex: "female", civil: "married", hired: "2020-01-06", type: "regular", supervisor: "ceo", roles: ["finance_approver", "department_head"] },
  { key: "cto", first: "Paolo", last: "Reyes", dept: "ENG", position: "Head of Engineering", sex: "male", civil: "married", hired: "2019-08-01", type: "regular", supervisor: "ceo", roles: ["department_head"] },
  { key: "eng1", first: "Andrea", last: "Garcia", dept: "ENG", position: "Engineering Lead", sex: "female", civil: "single", hired: "2021-04-12", type: "regular", supervisor: "cto", roles: ["supervisor"] },
  { key: "eng2", first: "Carlo", last: "Mendoza", dept: "ENG", position: "Software Engineer", sex: "male", civil: "married", hired: "2022-07-18", type: "regular", supervisor: "eng1" },
  { key: "eng3", first: "Bea", last: "Navarro", dept: "ENG", position: "Software Engineer", sex: "female", civil: "single", hired: "2026-08-03", type: "probationary", supervisor: "eng1" },
  { key: "eng4", first: "Nico", last: "Bautista", dept: "ENG", position: "QA Engineer", sex: "male", civil: "single", hired: "2024-01-08", type: "regular", supervisor: "eng1" },
  { key: "ops1", first: "Joy", last: "Aquino", dept: "OPS", position: "Operations Supervisor", sex: "female", civil: "separated", hired: "2020-11-02", type: "regular", supervisor: "ceo", roles: ["supervisor", "department_head"] },
  { key: "ops2", first: "Mark", last: "Torres", dept: "OPS", position: "Merchant Support Specialist", sex: "male", civil: "single", hired: "2025-03-17", type: "regular", supervisor: "ops1" },
  { key: "ops3", first: "Kim", last: "Castillo", dept: "OPS", position: "Merchant Support Specialist", sex: "female", civil: "single", hired: "2026-10-01", type: "probationary", supervisor: "ops1" },
  { key: "aud", first: "Tess", last: "Fernandez", dept: "EXEC", position: "Internal Auditor", sex: "female", civil: "married", hired: "2022-05-02", type: "regular", supervisor: "ceo", roles: ["auditor"] },
  { key: "adm", first: "Leo", last: "Pascual", dept: "ENG", position: "IT Administrator", sex: "male", civil: "single", hired: "2021-01-11", type: "regular", supervisor: "cto", roles: ["super_admin"] },
];

const DEPARTMENTS = [
  { code: "EXEC", name: "Executive Office" },
  { code: "HR", name: "Human Resources" },
  { code: "FIN", name: "Finance" },
  { code: "ENG", name: "Engineering" },
  { code: "OPS", name: "Operations" },
];

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${what}: no data returned`);
  return data as NonNullable<T>;
}

async function main() {
  console.log(`Seeding demo data into ${url}`);

  const { data: location } = await db.from("locations").upsert({ name: "Head Office (demo)" }, { onConflict: "name" }).select("id").single();
  const depts = await must(db.from("departments").upsert(DEPARTMENTS, { onConflict: "code" }).select("id, code"), "departments");
  const deptId = (code: string) => depts.find((d) => d.code === code)!.id;

  const employeeIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/\s+/g, "") + `@${DOMAIN}`;
    const { data: pos } = await db.from("positions").upsert({ title: p.position, department_id: deptId(p.dept) }, { onConflict: "title,department_id" }).select("id").single();
    const existing = await db.from("employees").select("id").eq("work_email", email).maybeSingle();
    let id = existing.data?.id as string | undefined;
    if (!id) {
      const row = await must(
        db.from("employees").insert({
          first_name: p.first, last_name: p.last, work_email: email, sex: p.sex, civil_status: p.civil,
          date_hired: p.hired, employment_type: p.type, department_id: deptId(p.dept), position_id: pos?.id,
          location_id: location?.id, birth_date: `199${PEOPLE.indexOf(p) % 10}-0${(PEOPLE.indexOf(p) % 9) + 1}-15`,
          mobile_number: `0917${String(1000000 + PEOPLE.indexOf(p)).slice(-7)}`,
        }).select("id").single(),
        `employee ${email}`,
      );
      id = row.id;
    }
    employeeIds[p.key] = id!;

    // Login (the database links it to the employee by work email).
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${p.first} ${p.last}` } });
    if (created.error && !/already/i.test(created.error.message)) throw new Error(`user ${email}: ${created.error.message}`);
  }

  // Supervisors and department heads
  for (const p of PEOPLE) {
    if (p.supervisor) await db.from("employees").update({ supervisor_id: employeeIds[p.supervisor] }).eq("id", employeeIds[p.key]);
  }
  const heads: Record<string, string> = { EXEC: "ceo", HR: "hrm", FIN: "fin", ENG: "cto", OPS: "ops1" };
  for (const [code, key] of Object.entries(heads)) await db.from("departments").update({ head_employee_id: employeeIds[key] }).eq("code", code);

  // Roles
  const roles = await must(db.from("roles").select("id, code"), "roles");
  const { data: emps } = await db.from("employees").select("id, user_id").in("id", Object.values(employeeIds));
  for (const p of PEOPLE) {
    const userId = emps?.find((e) => e.id === employeeIds[p.key])?.user_id;
    for (const code of p.roles ?? []) {
      const role = roles.find((r) => r.code === code);
      if (userId && role) await db.from("user_roles").upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id" });
    }
  }

  // Leave credits for the current year
  const accrued = await must(db.rpc("run_leave_accruals", { p_as_of: null }), "accruals");
  console.log(`Accrual entries: ${accrued}`);

  console.log("\nDemo logins (password = DEMO_PASSWORD):");
  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/\s+/g, "") + `@${DOMAIN}`;
    console.log(`  ${email.padEnd(40)} ${(p.roles ?? ["employee"]).join(", ")}`);
  }
  console.log("\nRoles marked MFA (HR, payroll, finance, auditor, super admin) will be asked to enrol an authenticator app.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
