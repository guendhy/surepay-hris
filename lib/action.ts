import type { z } from "zod";

/** Result every Server Action returns to <ActionForm>. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Changes on every submit so forms can reset after success. */
  at?: number;
};

export const initialActionState: ActionState = { ok: false };

export function success(message: string): ActionState {
  return { ok: true, message, at: Date.now() };
}

export function failure(message: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { ok: false, message, fieldErrors, at: Date.now() };
}

export function fromZod(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return failure("Please check the highlighted fields.", fieldErrors);
}

/**
 * Turns a Postgres/Supabase error into a message safe to show users.
 * Business-rule errors raised by our functions (RAISE EXCEPTION) are shown as-is;
 * anything else becomes a generic message (details go to the server log).
 */
export function dbError(error: { message: string; code?: string } | null, fallback = "Something went wrong. Please try again."): ActionState {
  if (!error) return failure(fallback);
  if (error.code === "P0001") return failure(error.message); // raise exception
  if (error.code === "42501") return failure("You do not have permission to do this.");
  if (error.code === "23505") return failure("That record already exists.");
  console.error("[db]", error);
  return failure(fallback);
}

/** FormData → plain object; empty strings become undefined. */
export function formToObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) {
      out[key] = value.trim() === "" ? undefined : value.trim();
    }
  }
  return out;
}
