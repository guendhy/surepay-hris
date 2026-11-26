import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getOrgOptions } from "@/lib/data/options";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { EmployeeFields } from "../employee-fields";
import { createEmployee } from "../actions";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requirePermission("employee.manage");
  const options = await getOrgOptions();
  return (
    <>
      <PageHeader
        title="Add employee"
        description="The employee number is generated automatically. Government IDs, compensation and documents are added on the next screen."
      />
      <Card>
        <CardBody>
          <ActionForm action={createEmployee} submitLabel="Create employee">
            <EmployeeFields options={options} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
