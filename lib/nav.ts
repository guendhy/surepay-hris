import type { Permission } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in the client sidebar
  permission?: Permission;
  managerOnly?: boolean;
};

export type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    title: "Me",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
      { href: "/me/leave", label: "My leave", icon: "calendar-days" },
      { href: "/me/profile", label: "My profile", icon: "user" },
      { href: "/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/team/approvals", label: "Approvals", icon: "check-circle" },
      { href: "/team/calendar", label: "Leave calendar", icon: "calendar-range" },
      { href: "/me/delegation", label: "Delegation", icon: "user-check", managerOnly: true },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/hr/employees", label: "Employees", icon: "users", permission: "employee.view" },
      { href: "/hr/leave", label: "Leave requests", icon: "clipboard-list", permission: "leave.view_all" },
      { href: "/hr/leave/balances", label: "Leave balances", icon: "scale", permission: "leave.view_all" },
      { href: "/hr/announcements", label: "Announcements", icon: "megaphone", permission: "announcements.manage" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/hr/settings/org", label: "Organisation", icon: "building-2", permission: "org.manage" },
      { href: "/hr/settings/leave-types", label: "Leave types", icon: "list-checks", permission: "leave.configure" },
      { href: "/hr/settings/holidays", label: "Holidays & schedules", icon: "sun", permission: "settings.manage" },
      { href: "/hr/settings/approval-flows", label: "Approval flows", icon: "git-branch", permission: "approvals.configure" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: "shield", permission: "admin.users" },
      { href: "/admin/audit-log", label: "Audit log", icon: "scroll-text", permission: "audit.view" },
    ],
  },
];

export function navForSession(session: Session): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.permission || session.permissions.includes(item.permission)) &&
        (!item.managerOnly || session.isManager || session.permissions.includes("team.view")),
    ),
  })).filter((section) => section.items.length > 0);
}
