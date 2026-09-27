import { ApiError } from "../api/errors";
import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { assetUrl, Icon } from "./Icon";

export function Button({
  variant = "primary", loading = false, icon, trailingIcon, children, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger" | "ghost";
  loading?: boolean;
  icon?: string;
  trailingIcon?: string;
}) {
  const tint = variant === "primary" ? "#fff" : variant === "danger" ? "var(--error)" : "var(--primary)";
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading}
      className={`btn btn-${variant} ${className ?? ""}`}>
      {loading ? <span className="spinner spinner-sm" aria-hidden="true" /> : icon && <Icon name={icon} size={20} tint={tint} />}
      <span>{children}</span>
      {trailingIcon && !loading && <Icon name={trailingIcon} size={18} tint={tint} className="flip-rtl" />}
    </button>
  );
}

export function Field({
  label, required, error, icon, trailing, hint, children,
}: {
  label?: string; required?: boolean; error?: string | null; icon?: string;
  trailing?: ReactNode; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      {label && (
        <div className="field-label">
          <span>{label}{required && <b className="req"> *</b>}</span>
          {hint}
        </div>
      )}
      <div className="field-box">
        {icon && <Icon name={icon} size={22} tint="var(--text-secondary)" />}
        {children}
        {trailing}
      </div>
      {error && <p className="field-message" role="alert">{error}</p>}
    </div>
  );
}

export function TextField({
  label, required, error, icon, hint, ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string; required?: boolean; error?: string | null; icon?: string; hint?: ReactNode;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = input.type === "password";
  return (
    <Field label={label} required={required} error={error} icon={icon} hint={hint}
      trailing={isPassword ? (
        <button type="button" className="icon-btn" onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide password" : "Show password"}>
          <Icon name={revealed ? "ic_visible" : "ic_hidden"} size={22} tint="var(--text-secondary)" />
        </button>
      ) : undefined}>
      <input id={id} aria-label={label} aria-invalid={!!error} {...input}
        type={isPassword && revealed ? "text" : input.type} />
    </Field>
  );
}

export function TextArea({
  label, required, error, ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string; required?: boolean; error?: string | null;
}) {
  return (
    <Field label={label} required={required} error={error}>
      <textarea aria-label={label} aria-invalid={!!error} rows={4} {...rest} />
    </Field>
  );
}

/** Multi-select chip with a check box, as in the Android preference steps. */
export function CheckChip({
  selected, onToggle, children, icon,
}: { selected: boolean; onToggle: () => void; children: ReactNode; icon?: string | null }) {
  return (
    <button type="button" className={`check-chip ${selected ? "on" : ""}`}
      aria-pressed={selected} onClick={onToggle}>
      {/* Flags are multi-colour art; a tint would fill them solid. */}
      {icon ? <Icon name={icon} size={20} tint={icon.startsWith("ic_flag") ? undefined : selected ? "var(--primary)" : "var(--text-secondary)"} />
        : <Icon name={selected ? "ic_checkbox_on" : "ic_checkbox_off"} size={18}
            tint={selected ? "var(--primary)" : "var(--text-secondary)"} />}
      <span>{children}</span>
    </button>
  );
}

export function Checkbox({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Icon name={checked ? "ic_checkbox_on" : "ic_checkbox_off"} size={22}
        tint={checked ? "var(--primary)" : "var(--text-secondary)"} />
      <span>{children}</span>
    </label>
  );
}

export function Avatar({ src, size = 48, name }: { src?: string | null; size?: number; name?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {src && !failed
        ? <img src={src} alt={name ?? ""} onError={() => setFailed(true)} />
        : <Icon name="ic_user" size={size * 0.55} tint="var(--text-secondary)" />}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, message, illustration = "illus_chat", tint }: {
  title: string; message?: string; illustration?: string;
  /** For a monochrome APK icon (drawn as a tint mask) rather than full-colour art. */
  tint?: string;
}) {
  return (
    <div className="empty-card">
      {illustration === "illus_chat"
        // The Figma empty-conversation art; the APK's chat drawable is a tint mask.
        ? <img src="/assets/desktop-empty-message-illustration.jpg" alt="" width={150} height={157} className="empty-art" />
        : tint ? <span className="empty-icon"><Icon name={illustration} size={48} tint={tint} /></span>
        : <Icon name={illustration} size={140} />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel = "Try again", error }: {
  message: string; onRetry?: () => void; retryLabel?: string;
  /** The failure, so a connection problem and a server refusal look different. */
  error?: unknown;
}) {
  const offline = error === undefined || !(error instanceof ApiError) || error.kind === "network" || error.kind === "timeout";
  return (
    <div className="state" role="alert">
      <Icon name={offline ? "ic_no_network" : "ic_alert"} size={48} tint="var(--error)" />
      <p>{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, labelledBy }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    // Focus moves into the dialog, Tab cycles inside it, and on close focus returns
    // to whatever opened it.
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="dialog-title" id={labelledBy}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** The 1–4 wizard stepper from the Android preference flow. */
export function Stepper({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="stepper" aria-label={`${label} ${step} / ${total}`}>
      <ol>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <li key={n} className={n < step ? "done" : n === step ? "current" : ""}>
            {n < step ? <Icon name="ic_check" size={16} tint="#fff" /> : n}
          </li>
        ))}
      </ol>
      <span className="step-pill">{label} {step}</span>
    </div>
  );
}

/** Calls `onVisible` when scrolled into view: drives page-by-page loading. */
export function InfiniteSentinel({ onVisible, active }: { onVisible: () => void; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onVisible();
    }, { rootMargin: "240px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [active, onVisible]);
  return <div ref={ref} style={{ height: 1 }} />;
}

/** Props for a whole card that opens something: focusable, and Enter/Space open it
 *  like a click. Keys pressed on a control inside the card (the favourite heart) are
 *  left to that control. */
export function cardLink(open: () => void, label: string) {
  return {
    role: "link" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      open();
    },
  };
}

/** Rectangular profile photo with the Android grey placeholder when there is no
 *  photo or it fails to load. */
export function PhotoBox({ src, className, alt = "" }: { src?: string | null; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`photo-box placeholder ${className ?? ""}`} aria-hidden={alt ? undefined : true}>
        {/* Android shows the brand mark when a partner has no photo. */}
        <img src={assetUrl("logo")} alt="" style={{ width: "62%", height: "auto" }} />
      </span>
    );
  }
  return <img className={`photo-box ${className ?? ""}`} src={src} alt={alt} onError={() => setFailed(true)} />;
}
