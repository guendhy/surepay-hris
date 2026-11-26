import { format, parseISO } from "date-fns";
import { TZDate } from "@date-fns/tz";

export const TIMEZONE = "Asia/Manila";

/** Today's date in the Philippines as YYYY-MM-DD. */
export function todayManila(): string {
  return format(new TZDate(Date.now(), TIMEZONE), "yyyy-MM-dd");
}

/** "26 Nov 2026" — accepts YYYY-MM-DD strings or Date/ISO timestamps. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return format(parseISO(value), "dd MMM yyyy");
  }
  return format(new TZDate(new Date(value).getTime(), TIMEZONE), "dd MMM yyyy");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new TZDate(new Date(value).getTime(), TIMEZONE), "dd MMM yyyy, h:mm a");
}

export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/** Days as "1", "0.5", "2.5" — never floating-point noise. */
export function formatDays(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n * 2) % 1 === 0 ? 1 : 2);
}

/** ₱ amounts from Postgres numeric strings, without float arithmetic. */
export function formatPeso(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const [whole, frac = ""] = String(value).split(".");
  const negative = whole.startsWith("-");
  const digits = whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${digits}.${(frac + "00").slice(0, 2)}`;
}

export function fullName(p: { first_name: string; last_name: string; middle_name?: string | null; suffix?: string | null }) {
  return [p.first_name, p.middle_name ? `${p.middle_name[0]}.` : null, p.last_name, p.suffix]
    .filter(Boolean)
    .join(" ");
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function masked(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "Not on file";
}
