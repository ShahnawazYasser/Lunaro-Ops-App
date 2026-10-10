import type { ReactNode } from "react";

interface FormFieldProps {
  label: ReactNode;
  /** Shown in red under the control; also turns the control's border red */
  error?: string;
  children: ReactNode;
}

/**
 * Label + control + inline error. Pass `error` only once the user has
 * attempted to submit — the parent decides when an error is visible.
 */
export default function FormField({ label, error, children }: FormFieldProps) {
  return (
    <div className="min-w-0" data-invalid={error ? "true" : undefined}>
      <label className="block text-sm font-medium mb-1.5 text-text-muted">{label}</label>
      {children}
      {error && <p className="text-xs mt-1 text-danger">{error}</p>}
    </div>
  );
}

interface MoneyFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function MoneyField({ label, value, onChange, error }: MoneyFieldProps) {
  return (
    <FormField label={label} error={error}>
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0 text-text-muted">PKR</span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base flex-1"
        />
      </div>
    </FormField>
  );
}

/** Defines the shared `.input-base` control style. Render once per screen that uses it. */
export function InputStyles() {
  return (
    <style>{`
      .input-base {
        background-color: #0B1929;
        color: #E8EFF5;
        border: 1px solid rgba(200,212,224,0.2);
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 16px;
        line-height: 1.4;
        outline: none;
        transition: border-color 0.15s;
      }
      .input-base:focus { border-color: rgba(201,168,76,0.5); }
      [data-invalid="true"] .input-base { border-color: #C45A4A !important; }
      select.input-base option { background-color: #16293D; }
      input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
      input[type="date"], input[type="time"] { color-scheme: dark; }
    `}</style>
  );
}
