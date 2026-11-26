import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FieldMessage } from "@/components/ui/form-state";

/* SurePay HRIS primitives — styles follow the design system on the
   "SurePay HRIS Redesign" canvas (Components & states board). */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-transparent font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-subtle [&_svg]:size-[18px]";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-foreground hover:bg-brand-hover",
  secondary: "border-[#cdd3cb] bg-surface text-foreground hover:border-border-strong hover:bg-background dark:border-border",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
  "danger-outline": "border-[#e9b4af] bg-surface text-danger hover:bg-danger-soft dark:border-danger/40",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function IconButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] text-foreground/80 hover:bg-surface-muted [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/20 disabled:border-border disabled:bg-surface-muted disabled:text-subtle aria-[invalid=true]:border-danger aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-22 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-semibold leading-[18px] text-foreground", className)} {...props} />;
}

/** Label + control + hint/error, consistently spaced. */
export function Field({
  label,
  htmlFor,
  name,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Inside <ActionForm>: shows server-side errors for this field name. */
  name?: string;
  hint?: string;
  error?: string[];
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {name && !error ? (
        <FieldMessage name={name} hint={hint} />
      ) : error?.length ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <ErrorIcon />
          {error.join(" ")}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="mt-px size-3.5 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex min-h-8 items-center gap-2.5 text-sm text-foreground", className)}>
      <input type="checkbox" className="size-[18px] accent-[var(--brand)]" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("min-w-0 rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold leading-6 text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3 border-t border-border px-5 py-3", className)} {...props} />;
}

/* Badges: always dot + word, never colour alone. */
export type Tone = "neutral" | "brand" | "success" | "warning" | "returned" | "danger" | "info" | "yellow";
const tones: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral",
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  returned: "bg-returned-soft text-returned",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  yellow: "bg-yellow-soft text-[#5c4100] dark:text-logo-yellow",
};

export function Badge({ tone = "neutral", dot = true, className, children, ...props }: ComponentProps<"span"> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Tag({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex h-[22px] items-center rounded-md bg-surface-muted px-2 text-xs font-semibold text-foreground/80", className)} {...props} />;
}

const statusTones: Record<string, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  returned: "returned",
  cancelled: "neutral",
  skipped: "neutral",
  active: "success",
  separated: "neutral",
  suspended: "danger",
  on_leave: "info",
  overdue: "danger",
  escalated: "info",
  probationary: "warning",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replace(/_/g, " ");
  return <Badge tone={statusTones[status] ?? "neutral"}>{text.charAt(0).toUpperCase() + text.slice(1)}</Badge>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[13px] text-muted">
          {breadcrumb.map((b, i) => (
            <span key={b.href} className="flex gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              <Link href={b.href} className="text-muted no-underline hover:text-foreground">
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em] text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon, tone = "brand" }: { title: string; children?: ReactNode; icon?: ReactNode; tone?: "brand" | "danger" }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span
        className={cn(
          "inline-flex size-12 items-center justify-center rounded-full [&_svg]:size-6",
          tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong",
        )}
        aria-hidden="true"
      >
        {icon ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

const alertStyles: Record<string, string> = {
  neutral: "border-border bg-surface-muted text-foreground",
  brand: "border-[#bfe2c8] bg-brand-soft text-brand-strong dark:border-brand/40",
  info: "border-[#c5d7f5] bg-info-soft text-[#123e7a] dark:border-info/40 dark:text-info",
  success: "border-[#bfe2c8] bg-success-soft text-[#0f5321] dark:border-success/40 dark:text-success",
  warning: "border-[#f1d88e] bg-warning-soft text-[#5e3a00] dark:border-warning/40 dark:text-warning",
  danger: "border-[#f3c2bd] bg-danger-soft text-[#8e1b12] dark:border-danger/40 dark:text-danger",
};

function AlertIcon({ tone }: { tone: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, "aria-hidden": true, className: "mt-0.5 size-5 shrink-0" };
  if (tone === "success" || tone === "brand")
    return (
      <svg {...common}>
        <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
        <path d="M22 4 12 14l-3-3" />
      </svg>
    );
  if (tone === "warning")
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
    );
  if (tone === "danger")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export function Alert({
  tone = "neutral",
  title,
  children,
  className,
  action,
}: {
  tone?: "neutral" | "brand" | "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm", alertStyles[tone], className)}
    >
      <AlertIcon tone={tone} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

/* Tables ------------------------------------------------------------------ */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-separate border-spacing-0 text-left text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("whitespace-nowrap border-b border-border bg-surface-subtle px-4 py-2.5 text-xs font-semibold text-muted", className)}
      {...props}
    />
  );
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border px-4 py-3 align-middle text-foreground", className)} {...props} />;
}

/** Toolbar row above a table: search, filters, sort, actions. Wraps on small screens. */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2 border-b border-border px-4 py-3", className)} {...props} />;
}

export function Pager({ summary, children }: { summary: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
      <span>{summary}</span>
      {children}
    </div>
  );
}

/* Tabs as links (works without client JS) ---------------------------------- */
export function TabLinks({ tabs, active, className }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("mb-6 flex gap-1 overflow-x-auto border-b border-border", className)} aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold no-underline",
            t.key === active ? "border-brand text-brand-strong" : "border-transparent text-muted hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && <Tag>{t.count}</Tag>}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-bold leading-9 text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={label}>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}

const avatarTones = ["bg-[#d3edd3] text-[#064d10]", "bg-yellow-soft text-[#5c4100]", "bg-info-soft text-info"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const tone = avatarTones[(name.charCodeAt(0) + name.length) % avatarTones.length];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        tone,
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-14 text-lg",
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function DescriptionList({ items, columns = 3 }: { items: { label: string; value: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
      )}
    >
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs font-semibold text-muted">{i.label}</dt>
          <dd className="mt-1 text-sm text-foreground">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
