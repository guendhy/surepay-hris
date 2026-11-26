import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayManila } from "@/lib/format";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { createDelegation } from "./actions";

export const metadata: Metadata = { title: "Delegation" };

export default async function DelegationPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const today = todayManila();

  // Delegates are active colleagues who have a login.
  const [{ data: delegations }, { data: linked }] = await Promise.all([
    supabase
      .from("approval_delegations")
      .select("id, delegate_user_id, starts_on, ends_on, reason, is_active")
      .eq("delegator_user_id", session.userId)
      .order("starts_on", { ascending: false }),
    supabase.rpc("get_delegate_candidates"),
  ]);
  const candidates = (linked ?? []) as { user_id: string; full_name: string }[];
  const nameByUser = new Map(candidates.map((c) => [c.user_id, c.full_name]));

  async function endDelegation(formData: FormData) {
    "use server";
    const supabase = await createClient();
    await supabase.from("approval_delegations").update({ is_active: false }).eq("id", String(formData.get("id")));
    revalidatePath("/me/delegation");
  }

  return (
    <>
      <PageHeader
        title="Delegation"
        description="Going on leave? Send new approval requests to a colleague for a date range. Requests already in your inbox stay with you."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="self-start">
          <CardHeader title="New delegation" />
          <CardBody>
            <ActionForm action={createDelegation} submitLabel="Delegate" resetOnSuccess>
                                <Field label="Delegate to" htmlFor="delegate_user_id" required name="delegate_user_id">
                    <Select id="delegate_user_id" name="delegate_user_id" required defaultValue="">
                      <option value="" disabled>
                        Choose a colleague
                      </option>
                      {candidates
                        .filter((c) => c.user_id !== session.userId)
                        .map((c) => (
                          <option key={c.user_id} value={c.user_id}>
                            {c.full_name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From" htmlFor="starts_on" required name="starts_on">
                      <Input id="starts_on" name="starts_on" type="date" defaultValue={today} required />
                    </Field>
                    <Field label="Until" htmlFor="ends_on" required name="ends_on">
                      <Input id="ends_on" name="ends_on" type="date" required />
                    </Field>
                  </div>
                  <Field label="Reason" htmlFor="reason">
                    <Input id="reason" name="reason" placeholder="e.g. On vacation leave" />
                  </Field>
            </ActionForm>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="My delegations" />
          {(delegations ?? []).length === 0 ? (
            <EmptyState title="No delegations" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Delegate</Th>
                  <Th>Period</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {(delegations ?? []).map((d) => {
                  const live = d.is_active && d.ends_on >= today;
                  return (
                    <tr key={d.id}>
                      <Td>{nameByUser.get(d.delegate_user_id) ?? "—"}</Td>
                      <Td>
                        {formatDate(d.starts_on)} – {formatDate(d.ends_on)}
                      </Td>
                      <Td className="text-muted">{d.reason ?? ""}</Td>
                      <Td>{live ? <Badge tone="success">Active</Badge> : <Badge>Ended</Badge>}</Td>
                      <Td className="text-right">
                        {live && (
                          <form action={endDelegation}>
                            <input type="hidden" name="id" value={d.id} />
                            <Button size="sm" variant="ghost" type="submit">
                              End now
                            </Button>
                          </form>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
