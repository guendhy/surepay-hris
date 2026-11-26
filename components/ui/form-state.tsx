"use client";

import { createContext, useContext } from "react";
import { initialActionState, type ActionState } from "@/lib/action";

/** Result of the enclosing <ActionForm>'s last submit, for field-level messages. */
export const FormStateContext = createContext<ActionState>(initialActionState);

export function FieldMessage({ name, hint }: { name: string; hint?: string }) {
  const state = useContext(FormStateContext);
  const errors = state.fieldErrors?.[name];
  if (errors?.length) return <p className="text-xs text-danger">{errors.join(" ")}</p>;
  if (hint) return <p className="text-xs text-muted">{hint}</p>;
  return null;
}
