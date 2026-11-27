"use client";
import { ChevronDown, CircleAlert, CircleCheck, CircleX, Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

// Sky form parts: visible label above, hint or error under, 48px inputs, errors say what to do.

export function SkField({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode }) {
  const id = useId();
  const describedBy = [hint && !error && `${id}-h`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="sk-field">
      <label className="sk-label" htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && <p className="sk-hint" id={`${id}-h`}>{hint}</p>}
      {error && <p className="sk-error" id={`${id}-e`}><CircleX size={16} aria-hidden /> {error}</p>}
    </div>
  );
}

export function SkText({ label, hint, error, value, onChange, ...rest }: { label: string; hint?: ReactNode; error?: string | null; value: string; onChange: (v: string) => void } & Omit<ComponentProps<"input">, "onChange" | "value">) {
  return (
    <SkField label={label} hint={hint} error={error}>
      {(p) => <input className="sk-input" value={value} onChange={(e) => onChange(e.target.value)} {...p} {...rest} />}
    </SkField>
  );
}

/** Native select (best on phones). `empty` adds a first option with value "" (use it for optional fields). */
export function SkSelect({ label, hint, error, value, onChange, options, empty, ...rest }: { label: string; hint?: ReactNode; error?: string | null; value: string; onChange: (v: string) => void; options: readonly string[]; empty?: string } & Omit<ComponentProps<"select">, "onChange" | "value">) {
  return (
    <SkField label={label} hint={hint} error={error}>
      {(p) => (
        <div className="sk-select">
          <select className="sk-input" value={value} onChange={(e) => onChange(e.target.value)} {...p} {...rest}>
            {empty !== undefined && <option value="">{empty}</option>}
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={20} aria-hidden />
        </div>
      )}
    </SkField>
  );
}

export function SkPassword({ label, hint, error, value, onChange, autoComplete = "new-password" }: { label: string; hint?: ReactNode; error?: string | null; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <SkField label={label} hint={hint} error={error}>
      {(p) => (
        <div className="sk-pwd">
          <input className="sk-input" type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} {...p} />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
          </button>
        </div>
      )}
    </SkField>
  );
}

/** Consent and terms boxes start unticked: the person does the ticking. */
export function SkCheck({ label, checked, onChange, error }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  const id = useId();
  return (
    <div className="sk-field">
      <div className="sk-check">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} />
        <label htmlFor={id}>{label}</label>
      </div>
      {error && <p className="sk-error" id={`${id}-e`}><CircleX size={16} aria-hidden /> {error}</p>}
    </div>
  );
}

export function SkAlert({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div className={`sk-alert sk-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={20} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export const SkOk = ({ children }: { children: ReactNode }) => <p className="sk-ok"><CircleCheck size={16} aria-hidden /> {children}</p>;
export const SkBad = ({ children }: { children: ReactNode }) => <p className="sk-error"><CircleX size={16} aria-hidden /> {children}</p>;
