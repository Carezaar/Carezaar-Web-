import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { ApiError } from "../api/errors";
import { SubmissionStorageError } from "../api/idempotency";
import { Icon } from "../ui/Icon";
import { DuplicateActionError, guarded } from "./actionGuard";
import { useI18n } from "./i18n";

/** Failures surface as the red toast Android uses for errors. There is no blocking
 *  "Please wait…" window any more (client request, 25 Oct 2026): a load shows a skeleton or
 *  a local indicator where its content goes, and an action shows progress on its own control. */
interface FeedbackValue {
  /** For user actions (submit, send, accept…): runs `work` under the shared action guard
   *  for `resource` (see actionGuard.ts). A second attempt while the first is unresolved is
   *  rejected with DuplicateActionError, which shows no message. */
  act: <T>(resource: string, work: () => Promise<T>) => Promise<T>;
  toast: (message: string) => void;
  /** Turns any thrown value into the user-facing message. */
  messageOf: (error: unknown) => string;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const counter = useRef(0);
  const toastTimers = useRef(new Map<string, { id: number; timer: number }>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timers = toastTimers.current;
    return () => {
      mounted.current = false;
      for (const { timer } of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Every common failure is shown with the app's managed texts, never the server's
  // text or a web-only string: refused → general_error_forbidden, missing →
  // general_error_not_found, no connection or timeout → general_network_title,
  // anything else → general_error_general. Only a rejection of what the user entered
  // (400/422, e.g. "Invalid Credentials!" or a field rule) keeps the server's message,
  // because it says what to fix; technical text there gets the general message too.
  const messageOf = useCallback((error: unknown) => {
    const general = t("general_error_general", "Something went wrong. Please try again.");
    if (error instanceof DuplicateActionError) return "";
    // The browser refused to save the request, so it wasn't sent. No managed text exists for
    // this yet; the key lets one be added without a code change.
    if (error instanceof SubmissionStorageError) {
      return t("general_error_storage", "This wasn't sent because your browser couldn't save it. Allow this site to store data (or free up space), then try again.");
    }
    if (error instanceof ApiError) {
      if (import.meta.env?.DEV) console.info(`API error (${error.kind}, ${error.status})`);
      switch (error.kind) {
        case "network":
        case "timeout":
          return t("general_network_title", "Cannot communicate with server.");
        case "unauthenticated":
        case "forbidden":
          return t("general_error_forbidden", "You can't do this right now.");
        case "notFound":
          return t("general_error_not_found", "This item is no longer available.");
        case "validation":
          if (error.isTechnical) return general;
          return Object.values(error.fields).flat()[0] ?? (error.message || general);
        case "unknown":
          return error.status === 400 && error.message && !error.isTechnical ? error.message : general;
        default:
          return general;
      }
    }
    return general;
  }, [t]);

  const toast = useCallback((message: string) => {
    if (!mounted.current || !message) return;
    const previous = toastTimers.current.get(message);
    if (previous) window.clearTimeout(previous.timer);
    const id = ++counter.current;
    // A joined action can have several callers. Refresh its feedback once rather
    // than stacking identical alerts from each caller's error handler.
    setToasts((all) => [...all.filter((x) => x.message !== message), { id, message }]);
    const timer = window.setTimeout(() => {
      if (toastTimers.current.get(message)?.id === id) toastTimers.current.delete(message);
      setToasts((all) => all.filter((x) => x.id !== id));
    }, 4500);
    toastTimers.current.set(message, { id, timer });
  }, []);

  const dismissToast = useCallback((id: number, message: string) => {
    const entry = toastTimers.current.get(message);
    if (entry?.id === id) {
      window.clearTimeout(entry.timer);
      toastTimers.current.delete(message);
    }
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const act = useCallback(<T,>(resource: string, work: () => Promise<T>) => guarded(resource, work), []);

  const value = useMemo(() => ({ act, toast, messageOf }), [act, toast, messageOf]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="assertive">
        {toasts.map((x) => (
          <div key={x.id} className="toast" role="alert">
            <Icon name="ic_clear_circle" size={28} tint="var(--error)" />
            <span>{x.message}</span>
            <button type="button" aria-label="Dismiss"
              onClick={() => dismissToast(x.id, x.message)}>
              <Icon name="ic_clear" size={16} tint="var(--error)" />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}
