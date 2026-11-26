"use client";

import { useState, useTransition } from "react";
import { revealGovernmentId } from "./reveal-action";

/** Shows "•••• 1234"; clicking Reveal fetches the full number (logged) for 30 s. */
export function RevealId({ employeeId, field, masked }: { employeeId: string; field: "tin" | "sss" | "philhealth" | "pagibig"; masked: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reveal() {
    start(async () => {
      const res = await revealGovernmentId(employeeId, field);
      if ("error" in res) return setError(res.error);
      setValue(res.value);
      setTimeout(() => setValue(null), 30_000);
    });
  }

  return (
    <>
      <span>{value ?? masked}</span>
      {value ? (
        <button type="button" className="text-xs text-brand hover:underline" onClick={() => setValue(null)}>
          Hide
        </button>
      ) : (
        <button type="button" className="text-xs text-brand hover:underline disabled:opacity-50" onClick={reveal} disabled={pending}>
          {pending ? "…" : "Reveal"}
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
