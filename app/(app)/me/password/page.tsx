import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Set password" };

export default async function PasswordPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Set your password" description="Use at least 12 characters. A passphrase of several words works well." />
      <Card className="max-w-md">
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
    </>
  );
}
