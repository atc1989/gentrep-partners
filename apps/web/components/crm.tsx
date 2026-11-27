"use client";
// CRM parts used by both admin areas (playbook: 04 - Design System/CRM/02 - Components). Small on purpose.
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, Info, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import type { Loaded } from "@/lib/hooks";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "secondary", small, block, busy, className = "", children, ...rest }: ComponentProps<"button"> & { variant?: Variant; small?: boolean; block?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`cr-btn cr-btn--${variant}${small ? " cr-btn--sm" : ""}${block ? " cr-btn--block" : ""} ${className}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint && !error && `${fid}-hint`, error && `${fid}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="cr-field">
      <label className="cr-label" htmlFor={fid}>{label}</label>
      {children({ id: fid, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && <p className="cr-hint" id={`${fid}-hint`}>{hint}</p>}
      {error && (
        <p className="cr-error" id={`${fid}-err`}>
          <CircleX size={14} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, value, onChange, type = "text", ...rest }: { label: string; hint?: string; error?: string | null; value: string; onChange: (v: string) => void; type?: string } & Omit<ComponentProps<"input">, "onChange" | "value" | "type">) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => <input className="cr-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} {...p} {...rest} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, value, onChange, ...rest }: { label: string; hint?: string; error?: string | null; value: string; onChange: (v: string) => void } & Omit<ComponentProps<"textarea">, "onChange" | "value">) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => <textarea className="cr-input" value={value} onChange={(e) => onChange(e.target.value)} {...p} {...rest} />}
    </Field>
  );
}

export function Check({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <div className="cr-check">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint && <p className="cr-hint" id={`${id}-h`} style={{ marginLeft: 28 }}>{hint}</p>}
    </div>
  );
}

const TONES = { up: CircleCheck, warn: Clock, down: CircleX, muted: Info } as const;
export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  const Icon = TONES[tone];
  return (
    <span className={`cr-badge cr-badge--${tone}`}>
      <Icon size={12} aria-hidden /> {children}
    </span>
  );
}

const ALERT_ICON = { error: CircleAlert, warn: CircleAlert, ok: CircleCheck, info: Info } as const;
export function Alert({ tone = "info", title, children, actions }: { tone?: keyof typeof ALERT_ICON; title?: string; children?: ReactNode; actions?: ReactNode }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={`cr-alert cr-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden />
      <div>
        {title && <p className="cr-alert__title">{title}</p>}
        {children && <p>{children}</p>}
        {actions && <div className="cr-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}

/** The three states of a loaded screen: loading text, an error with its retry right under it, or the data. */
export function LoadView<T>({ state, children }: { state: Loaded<T>; children: (data: T) => ReactNode }) {
  if (state.error) {
    return (
      <Alert tone="error" title="Could not load this" actions={<Button small onClick={state.reload}><RefreshCw size={14} aria-hidden /> Try again</Button>}>
        {state.error}
      </Alert>
    );
  }
  if (state.data) return <>{children(state.data)}</>;
  return <p className="cr-muted" role="status">Loading…</p>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="cr-empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="cr-pager tnum">{total} {total === 1 ? "result" : "results"}</p>;
  return (
    <div className="cr-pager">
      <span className="tnum">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString("en-PH")}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <Button small disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} aria-hidden /> Previous</Button>
        <Button small disabled={page >= last} onClick={() => onPage(page + 1)}>Next <ChevronRight size={16} aria-hidden /></Button>
      </span>
    </div>
  );
}

/** Opens in place (native dialog: focus trap, Escape, and focus returns to the opener). Warnings use role=alertdialog. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Keep it", tone = "danger", busy, error, confirmDisabled, onConfirm, onCancel }: {
  open: boolean; title: string; children?: ReactNode; confirmLabel: string; cancelLabel?: string; tone?: "danger" | "primary"; busy?: boolean; error?: string | null; confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="cr-dialog" role={tone === "danger" ? "alertdialog" : "dialog"} aria-labelledby={titleId} onClose={onCancel} onCancel={(e) => { if (busy) e.preventDefault(); }}>
      <form method="dialog" className="cr-dialog__body" onSubmit={(e) => { e.preventDefault(); if (!confirmDisabled && !busy) onConfirm(); }}>
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 500 }}>{title}</h2>
        {children}
        {error && <p className="cr-error" role="alert"><CircleX size={14} aria-hidden /> {error}</p>}
        <div className="cr-dialog__actions">
          <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" variant={tone} busy={busy} disabled={confirmDisabled}>{confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}

/** A record opens in place: 480px from the right on desktop, full screen on phones (a long form never goes in a bottom sheet). */
export function SidePanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="cr-panel" aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="cr-panel__inner">
        <div className="cr-panel__head">
          <h2 id={titleId} style={{ fontSize: 16, fontWeight: 500 }}>{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close"><X size={18} aria-hidden /></Button>
        </div>
        <div className="cr-panel__body">{open && children}</div>
      </div>
    </dialog>
  );
}

/** Each page names itself in the browser tab. React 19 hoists this into <head>. */
export const PageTitle = ({ children }: { children: string }) => <title>{`${children} · Gentrep`}</title>;
