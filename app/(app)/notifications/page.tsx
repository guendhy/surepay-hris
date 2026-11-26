import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <Button variant="secondary" size="sm" type="submit">
                Mark all as read
              </Button>
            </form>
          ) : undefined
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-5 py-4", !n.read_at && "bg-brand-soft/40")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
