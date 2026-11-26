import { describe, expect, it, beforeAll } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

describe("migrations", () => {
  it("apply cleanly and seed reference data", async () => {
    const roles = await db.query<{ n: number }>("select count(*)::int as n from public.roles");
    const types = await db.query<{ n: number }>("select count(*)::int as n from public.leave_types");
    const steps = await db.query<{ n: number }>("select count(*)::int as n from public.approval_flow_steps");
    expect(roles.rows[0].n).toBe(9);
    expect(types.rows[0].n).toBe(12);
    expect(steps.rows[0].n).toBe(2);
  });

  it("enables RLS on every public table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("generates employee numbers and the regularisation due date", async () => {
    const { rows } = await db.query<{ employee_no: string; regularization_due_date: Date }>(
      `insert into public.employees (first_name, last_name, work_email, date_hired, employment_type)
       values ('Ana', 'Cruz', 'ana@x.test', '2026-03-10', 'probationary')
       returning employee_no, regularization_due_date`,
    );
    expect(rows[0].employee_no).toBe("SPT-2026-0001");
    expect(new Date(rows[0].regularization_due_date).toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("links a new login to the employee with the same work email and gives the employee role", async () => {
    await db.query(
      `insert into public.employees (first_name, last_name, work_email, date_hired)
       values ('Ben', 'Reyes', 'ben@x.test', '2025-01-01')`,
    );
    await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'BEN@x.test')`);
    const { rows } = await db.query<{ linked: boolean; roles: string[] }>(
      `select e.user_id is not null as linked,
              array(select r.code from public.user_roles ur join public.roles r on r.id = ur.role_id
                    where ur.user_id = e.user_id) as roles
       from public.employees e where e.work_email = 'ben@x.test'`,
    );
    expect(rows[0].linked).toBe(true);
    expect(rows[0].roles).toEqual(["employee"]);
  });

  it("blocks sign-ups outside the allowed email domains once configured", async () => {
    await db.query(`update public.app_settings set value = '["surepay.test"]' where key = 'allowed_email_domains'`);
    await expect(
      db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'someone@gmail.com')`),
    ).rejects.toThrow(/company email/);
    await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'ok@surepay.test')`);
    await db.query(`update public.app_settings set value = '[]' where key = 'allowed_email_domains'`);
  });
});
