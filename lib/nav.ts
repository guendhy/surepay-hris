import type { Permission } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // icon key, resolved in the client sidebar
  permission?: Permission;
  managerOnly?: boolean;
  count?: "approvals" | "notifications";
};

export type NavSection = { title: string; items: NavItem[] };

/** Same sections and labels for every role; each role sees only what it may use. */
export const NAV: NavSection[] = [
  { title: "", items: [{ href: "/dashboard", label: "Dashboard", icon: "home" }] },
  {
    title: "My work",
    items: [
      { href: "/me/leave", label: "My leave", icon: "calendar" },
      { href: "/me/profile", label: "My profile", icon: "user" },
      { href: "/notifications", label: "Notifications", icon: "bell", count: "notifications" },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/team/approvals", label: "Approvals", icon: "check", count: "approvals" },
      { href: "/team/calendar", label: "Leave calendar", icon: "calendar-range" },
      { href: "/me/delegation", label: "Delegation", icon: "user-check", managerOnly: true },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/hr/employees", label: "Employees", icon: "users", permission: "employee.view" },
      { href: "/hr/leave", label: "Leave requests", icon: "clipboard", permission: "leave.view_all" },
      { href: "/hr/leave/balances", label: "Leave balances", icon: "chart", permission: "leave.view_all" },
      { href: "/hr/announcements", label: "Announcements", icon: "megaphone", permission: "announcements.manage" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/hr/settings/org", label: "Organisation", icon: "building", permission: "org.manage" },
      { href: "/hr/settings/leave-types", label: "Leave types", icon: "list", permission: "leave.configure" },
      { href: "/hr/settings/holidays", label: "Holidays & schedules", icon: "sun", permission: "settings.manage" },
      { href: "/hr/settings/approval-flows", label: "Approval flows", icon: "flow", permission: "approvals.configure" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: "shield", permission: "admin.users" },
      { href: "/admin/audit-log", label: "Audit log", icon: "scroll", permission: "audit.view" },
    ],
  },
];

function allowed(session: Session, item: NavItem) {
  return (
    (!item.permission || session.permissions.includes(item.permission)) &&
    (!item.managerOnly || session.isManager || session.permissions.includes("team.view"))
  );
}

export function navForSession(session: Session): NavSection[] {
  return NAV.map((section) => ({ ...section, items: section.items.filter((item) => allowed(session, item)) })).filter(
    (section) => section.items.length > 0,
  );
}

/** Bottom tab bar on phones: four destinations + "More" (opens the full menu). */
export function mobileTabsForSession(session: Session): NavItem[] {
  const hr = session.permissions.includes("employee.view");
  const tabs: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: "home" },
    hr
      ? { href: "/team/approvals", label: "Approvals", icon: "check", count: "approvals" }
      : { href: "/me/leave", label: "My leave", icon: "calendar" },
    hr
      ? { href: "/hr/employees", label: "People", icon: "users" }
      : { href: "/team/approvals", label: "Approvals", icon: "check", count: "approvals" },
    hr ? { href: "/hr/leave", label: "Leave", icon: "clipboard" } : { href: "/team/calendar", label: "Calendar", icon: "calendar-range" },
  ];
  return tabs;
}

const ROLE_PRIORITY: [string, string][] = [
  ["super_admin", "Super Admin"],
  ["hr_manager", "HR Manager"],
  ["hr_staff", "HR Staff"],
  ["payroll_officer", "Payroll Officer"],
  ["finance_approver", "Finance"],
  ["auditor", "Auditor"],
  ["department_head", "Department Head"],
  ["supervisor", "Supervisor"],
  ["employee", "Employee"],
];

export function primaryRoleLabel(session: Session): string {
  return ROLE_PRIORITY.find(([code]) => session.roles.includes(code))?.[1] ?? "Employee";
}
