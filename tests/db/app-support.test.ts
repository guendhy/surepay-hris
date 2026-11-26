import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createDb, createPerson, type Db } from "./harness";

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

describe("app support functions", () => {
  it("TypeScript permission list matches the database", async () => {
    const { rows } = await db.query<{ code: string }>("select code from public.permissions order by code");
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort());
  });

  it("my_access returns roles, permissions, MFA requirement and employee", async () => {
    const hr = await createPerson(db, { firstName: "Hana", email: "hana@x.test", roles: ["hr_manager"] });
    const access = await db.as(hr.userId, async () => {
      const { rows } = await db.query<{ a: Record<string, unknown> }>("select public.my_access() as a");
      return rows[0].a as { roles: string[]; permissions: string[]; requires_mfa: boolean; employee: { id: string } };
    });
    expect(access.roles).toEqual(["employee", "hr_manager"]);
    expect(access.permissions).toContain("employee.manage");
    expect(access.requires_mfa).toBe(true);
    expect(access.employee.id).toBe(hr.employeeId);
  });

  it("hr_dashboard_stats requires reports.view", async () => {
    const emp = await createPerson(db, { firstName: "Emma", email: "emma@x.test" });
    await expect(db.as(emp.userId, () => db.query("select public.hr_dashboard_stats()"))).rejects.toThrow(/Not allowed/);
    const hr = await createPerson(db, { firstName: "Hal", email: "hal@x.test", roles: ["hr_staff"] });
    const stats = await db.as(hr.userId, async () => {
      const { rows } = await db.query<{ s: { headcount: number } }>("select public.hr_dashboard_stats() as s");
      return rows[0].s;
    });
    expect(stats.headcount).toBe(3);
  });

  it("hr_dashboard_stats reports the HR work queue (expiring documents, no login)", async () => {
    const hr = await createPerson(db, { firstName: "Hope", email: "hope@x.test", roles: ["hr_manager"] });
    const { rows: emp } = await db.query<{ id: string }>(
      `insert into public.employees (first_name, last_name, work_email, date_hired) values ('No', 'Login', 'nologin@x.test', '2025-01-01') returning id`,
    );
    await db.query(
      `insert into public.employee_documents (employee_id, document_type, title, storage_path, file_name, expires_on)
       values ($1::uuid, 'NBI', 'NBI clearance', $2, 'nbi.pdf', current_date + 10)`,
      [emp[0].id, `${emp[0].id}/documents/nbi.pdf`],
    );
    const stats = await db.as(hr.userId, async () => {
      const { rows } = await db.query<{ s: { expiring_documents: number; no_login: number; escalated_approvals: number } }>(
        "select public.hr_dashboard_stats() as s",
      );
      return rows[0].s;
    });
    expect(stats.expiring_documents).toBe(1);
    expect(stats.no_login).toBe(1);
    expect(stats.escalated_approvals).toBe(0);
  });

  it("the directory exposes no personal or sensitive columns", async () => {
    const { rows } = await db.query<{ name: string }>(
      `select unnest(proargnames) as name from pg_proc where proname = 'get_employee_directory'`,
    );
    const columns = rows.map((r) => r.name);
    for (const forbidden of ["birth_date", "present_address", "mobile_number", "basic_salary", "tin_enc"]) {
      expect(columns).not.toContain(forbidden);
    }
  });
});
