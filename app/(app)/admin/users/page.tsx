import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { authorizeAction, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbError, failure, success, type ActionState } from "@/lib/action";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Users & roles" };

async function grantRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const auth = await authorizeAction("admin.users");
  if (!auth.ok) return failure(auth.message);
  const userId = String(formData.get("user_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  if (!userId || !roleId) return failure("Choose a user and a role.");
  if (userId === auth.session.userId) return failure("You cannot change your own roles.");
  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId, granted_by: auth.session.userId });
  if (error) return dbError(error, "The role could not be granted.");
  revalidatePath("/admin/users");
  return success("Role granted. It takes effect on the user's next page load.");
}

async function revokeRole(formData: FormData) {
  "use server";
  const auth = await authorizeAction("admin.users");
  if (!auth.ok) return;
  const supabase = await createClient();
  await supabase.from("user_roles").delete().eq("user_id", String(formData.get("user_id"))).eq("role_id", String(formData.get("role_id")));
  revalidatePath("/admin/users");
}

async function setActive(formData: FormData) {
  "use server";
  const auth = await authorizeAction("admin.users");
  if (!auth.ok) return;
  const id = String(formData.get("user_id"));
  if (id === auth.session.userId) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: formData.get("is_active") === "true" }).eq("id", id);
  revalidatePath("/admin/users");
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const session = await requirePermission("admin.users");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }, { data: userRoles }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, is_active, created_at").order("email"),
    supabase.from("roles").select("id, code, name, requires_mfa").order("name"),
    supabase.from("user_roles").select("user_id, role_id"),
  ]);
  const roleById = new Map((roles ?? []).map((r) => [r.id, r]));
  const users = (profiles ?? []).filter((p) => !q || p.email.includes(q) || (p.full_name ?? "").toLowerCase().includes(q));

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Roles marked MFA require an authenticator app. Every account automatically has the Employee role. Changes are audit-logged."
      />
      <Alert tone="neutral" className="mb-4">
        New employees get a login when HR sends an invitation from their 201 record. Separating an employee deactivates their login automatically.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <form><Input name="q" defaultValue={q} placeholder="Search email or name" aria-label="Search users" /></form>
          </div>
          <Table>
            <thead><tr><Th>User</Th><Th>Roles</Th><Th>Status</Th></tr></thead>
            <tbody>
              {users.map((u) => {
                const mine = (userRoles ?? []).filter((ur) => ur.user_id === u.id);
                return (
                  <tr key={u.id}>
                    <Td>
                      <p className="font-medium text-foreground">{u.full_name ?? u.email}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {mine.map((ur) => {
                          const r = roleById.get(ur.role_id);
                          if (!r) return null;
                          return (
                            <form key={ur.role_id} action={revokeRole} className="inline-flex">
                              <input type="hidden" name="user_id" value={u.id} />
                              <input type="hidden" name="role_id" value={ur.role_id} />
                              <Badge tone={r.requires_mfa ? "brand" : "neutral"} className="gap-1">
                                {r.name}
                                {u.id !== session.userId && r.code !== "employee" && (
                                  <button type="submit" className="ml-0.5 hover:text-danger" aria-label={`Remove ${r.name}`}>×</button>
                                )}
                              </Badge>
                            </form>
                          );
                        })}
                      </div>
                    </Td>
                    <Td>
                      {u.id === session.userId ? (
                        <Badge tone="success">You</Badge>
                      ) : (
                        <form action={setActive}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="is_active" value={String(!u.is_active)} />
                          <Button size="sm" variant="ghost" type="submit">
                            {u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>}
                          </Button>
                        </form>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader title="Grant a role" />
          <CardBody>
            <ActionForm action={grantRole} submitLabel="Grant role" resetOnSuccess>
              <Field label="User" htmlFor="user_id" name="user_id" required>
                <Select id="user_id" name="user_id" required defaultValue="">
                  <option value="" disabled>Choose a user</option>
                  {(profiles ?? []).filter((p) => p.id !== session.userId).map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}
                </Select>
              </Field>
              <Field label="Role" htmlFor="role_id" name="role_id" required>
                <Select id="role_id" name="role_id" required>
                  {(roles ?? []).filter((r) => r.code !== "employee").map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.requires_mfa ? " (MFA)" : ""}</option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
