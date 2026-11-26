import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { authorizeAction, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { dbError, failure, formToObject, fromZod, success, type ActionState } from "@/lib/action";
import { announcementSchema } from "@/lib/validations";
import { formatDate, formatDateTime } from "@/lib/format";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Announcements" };

async function publish(_prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const auth = await authorizeAction("announcements.manage");
  if (!auth.ok) return failure(auth.message);
  const parsed = announcementSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    title: v.title,
    body: v.body,
    audience: v.audience,
    department_id: v.audience === "department" ? v.department_id ?? null : null,
    location_id: v.audience === "location" ? v.location_id ?? null : null,
    expires_at: v.expires_at ? `${v.expires_at}T23:59:59+08:00` : null,
    created_by: auth.session.userId,
  });
  if (error) return dbError(error, "Choose a department or location for a targeted announcement.");
  revalidatePath("/hr/announcements");
  revalidatePath("/dashboard");
  return success("Published.");
}

async function remove(formData: FormData) {
  "use server";
  const auth = await authorizeAction("announcements.manage");
  if (!auth.ok) return;
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", String(formData.get("id")));
  revalidatePath("/hr/announcements");
}

export default async function AnnouncementsPage() {
  await requirePermission("announcements.manage");
  const supabase = await createClient();
  const [{ data }, options] = await Promise.all([
    supabase.from("announcements").select("id, title, body, audience, published_at, expires_at").order("published_at", { ascending: false }).limit(50),
    getOrgOptions(),
  ]);

  return (
    <>
      <PageHeader title="Announcements" description="Shown on employees' dashboards." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {(data ?? []).length === 0 ? <Card><EmptyState title="No announcements yet" /></Card> : (data ?? []).map((a) => (
            <Card key={a.id}>
              <CardHeader
                title={a.title}
                description={`${formatDateTime(a.published_at)}${a.expires_at ? ` · until ${formatDate(a.expires_at)}` : ""}`}
                action={
                  <div className="flex items-center gap-2">
                    <Badge>{a.audience}</Badge>
                    <form action={remove}><input type="hidden" name="id" value={a.id} /><Button size="sm" variant="ghost" type="submit">Delete</Button></form>
                  </div>
                }
              />
              <CardBody><p className="whitespace-pre-line text-sm text-foreground">{a.body}</p></CardBody>
            </Card>
          ))}
        </div>
        <Card className="self-start">
          <CardHeader title="New announcement" />
          <CardBody>
            <ActionForm action={publish} submitLabel="Publish" resetOnSuccess>
              <Field label="Title" htmlFor="title" name="title" required><Input id="title" name="title" required /></Field>
              <Field label="Message" htmlFor="body" name="body" required><Textarea id="body" name="body" required className="min-h-32" /></Field>
              <Field label="Audience" htmlFor="audience" name="audience">
                <Select id="audience" name="audience" defaultValue="all">
                  <option value="all">Everyone</option>
                  <option value="department">One department</option>
                  <option value="location">One location</option>
                </Select>
              </Field>
              <Field label="Department" htmlFor="department_id" name="department_id">
                <Select id="department_id" name="department_id" defaultValue="">
                  <option value="">—</option>
                  {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Location" htmlFor="location_id" name="location_id">
                <Select id="location_id" name="location_id" defaultValue="">
                  <option value="">—</option>
                  {options.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Show until" htmlFor="expires_at" name="expires_at" hint="Optional"><Input id="expires_at" name="expires_at" type="date" /></Field>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
