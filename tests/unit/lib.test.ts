import { describe, expect, it, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptField, encryptField, lastFour } from "@/lib/crypto";
import { formatDate, formatDays, formatPeso, masked } from "@/lib/format";
import { compensationSchema, employeeSchema, governmentIdsSchema, leaveRequestSchema, safeFileName, validateUpload } from "@/lib/validations";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("field encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encryptField("123456789012");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("123456789012");
    expect(decryptField(enc)).toBe("123456789012");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("detects tampering", () => {
    const [v, iv, tag, ct] = encryptField("secret").split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => decryptField([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("keeps only the last four characters for display", () => {
    expect(lastFour("12-3456789-0")).toBe("7890");
    expect(masked("7890")).toBe("•••• 7890");
    expect(masked(null)).toBe("Not on file");
  });
});

describe("formatting", () => {
  it("formats dates as DD MMM YYYY", () => {
    expect(formatDate("2026-11-26")).toBe("26 Nov 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("formats pesos from numeric strings without float maths", () => {
    expect(formatPeso("1234567.5")).toBe("₱1,234,567.50");
    expect(formatPeso("0.1")).toBe("₱0.10");
    expect(formatPeso("35000")).toBe("₱35,000.00");
  });

  it("formats leave days", () => {
    expect(formatDays("5.000")).toBe("5");
    expect(formatDays(0.5)).toBe("0.5");
    expect(formatDays("1.250")).toBe("1.25");
  });
});

describe("validation", () => {
  it("rejects end dates before start dates and multi-day half days", () => {
    expect(leaveRequestSchema.safeParse({ leave_type_id: crypto.randomUUID(), start_date: "2026-12-10", end_date: "2026-12-09" }).success).toBe(false);
    expect(
      leaveRequestSchema.safeParse({ leave_type_id: crypto.randomUUID(), start_date: "2026-12-10", end_date: "2026-12-11", day_portion: "am" }).success,
    ).toBe(false);
  });

  it("checks Philippine government ID formats", () => {
    expect(governmentIdsSchema.safeParse({ tin: "123456789" }).success).toBe(true);
    expect(governmentIdsSchema.safeParse({ tin: "123456789000" }).success).toBe(true);
    expect(governmentIdsSchema.safeParse({ sss: "123" }).success).toBe(false);
    expect(governmentIdsSchema.safeParse({ philhealth: "123456789012" }).success).toBe(true);
  });

  it("accepts PH mobile numbers and lowercases work email", () => {
    const parsed = employeeSchema.parse({
      first_name: "Ana",
      last_name: "Cruz",
      work_email: "Ana.Cruz@Example.COM",
      mobile_number: "09171234567",
      employment_type: "regular",
      date_hired: "2026-01-05",
    });
    expect(parsed.work_email).toBe("ana.cruz@example.com");
    expect(employeeSchema.safeParse({ ...parsed, mobile_number: "12345" }).success).toBe(false);
  });

  it("requires a reason and a decimal amount for compensation", () => {
    expect(compensationSchema.safeParse({ pay_type: "monthly", basic_salary: "35000.50", effective_date: "2026-01-01", reason: "Merit" }).success).toBe(true);
    expect(compensationSchema.safeParse({ pay_type: "monthly", basic_salary: "35,000", effective_date: "2026-01-01", reason: "Merit" }).success).toBe(false);
  });

  it("restricts uploads and sanitises file names", () => {
    const pdf = new File([new Uint8Array(10)], "med cert.pdf", { type: "application/pdf" });
    const exe = new File([new Uint8Array(10)], "x.exe", { type: "application/x-msdownload" });
    expect(validateUpload(pdf)).toBeNull();
    expect(validateUpload(exe)).toMatch(/PDF, JPG/);
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("Médical cert (1).pdf")).toBe("Medical_cert_1_.pdf");
  });
});
