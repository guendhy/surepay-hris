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
