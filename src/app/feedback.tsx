import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { ApiError } from "../api/errors";
import { Icon } from "../ui/Icon";
import { useI18n } from "./i18n";

/** Android shows one modal "Please wait…" card listing every in-flight operation
 *  ("- Signing in", "- Getting list of chats - Page 1"). `run` reproduces that, and
 *  failures surface as the red toast Android uses for errors. */
interface FeedbackValue {
  /** Shows the operation in the "Please wait…" card. With a `key`, a second call
   *  with the same key while the first is in flight joins it instead of running. */
  run: <T>(label: string, work: () => Promise<T>, key?: string) => Promise<T>;
  /** For user actions (submit, send, accept…): a double click or tap joins the
   *  in-flight request instead of sending another. Loads use `run`, because two
   *  screens can load with the same label at once and must not share a result. */
  act: <T>(label: string, work: () => Promise<T>) => Promise<T>;
  toast: (message: string) => void;
  /** Turns any thrown value into the user-facing message. */
  messageOf: (error: unknown) => string;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [labels, setLabels] = useState<{ id: number; label: string }[]>([]);
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
    if (!mounted.current) return;
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

  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const run = useCallback(<T,>(label: string, work: () => Promise<T>, key?: string): Promise<T> => {
    const existing = key === undefined ? undefined : inFlight.current.get(key);
    if (existing) return existing as Promise<T>;
    const id = ++counter.current;
    setLabels((all) => [...all, { id, label }]);
    const promise = (async () => {
      try {
        return await work();
      } finally {
        if (key !== undefined) inFlight.current.delete(key);
        setLabels((all) => all.filter((x) => x.id !== id));
      }
    })();
    if (key !== undefined) inFlight.current.set(key, promise);
    return promise;
  }, []);

  const act = useCallback(<T,>(label: string, work: () => Promise<T>) => run(label, work, `act:${label}`), [run]);


  const value = useMemo(() => ({ run, act, toast, messageOf }), [run, act, toast, messageOf]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {labels.length > 0 && (
        <div className="busy-scrim" role="status" aria-live="polite">
          <div className="busy-card">
            <div className="busy-head">
              <span className="spinner" aria-hidden="true" />
              <strong>{t("loading_please_wait", "Please wait…")}</strong>
            </div>
            <ul>{labels.map((x) => <li key={x.id}>- {x.label}</li>)}</ul>
          </div>
        </div>
      )}
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
