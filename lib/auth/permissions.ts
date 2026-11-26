/** Permission codes — must match public.permissions in the database. */
export const PERMISSIONS = [
  "employee.view",
  "employee.manage",
  "employee.invite",
  "employee.view_sensitive",
  "employee.manage_sensitive",
  "employee.view_compensation",
  "employee.manage_compensation",
  "org.manage",
  "settings.manage",
  "leave.view_all",
  "leave.manage",
  "leave.adjust",
  "leave.configure",
  "approvals.view_all",
  "approvals.override",
  "approvals.configure",
  "team.view",
  "reports.view",
  "reports.export",
  "announcements.manage",
  "admin.users",
  "admin.roles",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
