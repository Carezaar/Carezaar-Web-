import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { UserRole } from "../api/types";

/** In-progress signup, the equivalent of Android's in-memory `App.k/l/p`. On the web
 *  a refresh would wipe memory mid-signup and strand an account that is registered but
 *  cannot sign in yet, so it is mirrored to this tab's sessionStorage (gone when the
 *  tab closes) and cleared as soon as signup completes.
 *
 *  The verified sequence is entirely unauthenticated until the last step:
 *  register → OTP → profile (keyed by email) → role entity (keyed by user_id) →
 *  sign in with the credentials held here. */
type WizardValue = number[] | number | boolean | { lat: number; lng: number } | null;
interface WizardDraft {
  role: UserRole;
  userId: string;
  fields: Record<string, WizardValue>;
}

export interface SignUpState {
  role: UserRole;
  email: string;
  password: string;
  userId: string | null;
  /** The client/caregiver entity exists; a retry after a failed final sign-in must
   *  not try to create it again. */
  entityCreated: boolean;
  isPasswordRecovery: boolean;
  /** Unsaved wizard choices belong only to this tab and this signup owner. */
  wizardDraft?: WizardDraft;
}

const initial: SignUpState = {
  role: "client", email: "", password: "", userId: null, entityCreated: false, isPasswordRecovery: false,
};

const SignUpContext = createContext<{
  state: SignUpState;
  update: (patch: Partial<SignUpState> | ((state: SignUpState) => Partial<SignUpState>)) => void;
  reset: () => void;
} | null>(null);

const KEY = "carezaar.signup";

function load(): SignUpState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? { ...initial, ...(JSON.parse(raw) as Partial<SignUpState>) } : initial;
  } catch {
    return initial;
  }
}

function persist(state: SignUpState) {
  try {
    if (state.email) window.sessionStorage.setItem(KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable: memory only */ }
}

export function SignUpProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load);
  useEffect(() => persist(state), [state]);
  const value = useMemo(() => ({
    state,
    update: (patch: Partial<SignUpState> | ((state: SignUpState) => Partial<SignUpState>)) => setState((s) => {
      const change = typeof patch === "function" ? patch(s) : patch;
      const next = { ...s, ...change };
      if (next.email !== s.email || next.role !== s.role) {
        // Verification and a created role entity belong to the previous identity.
        // Only an explicit server-backed update may supply the new owner's ID.
        next.userId = change.userId ?? null;
        next.entityCreated = change.entityCreated ?? false;
      }
      // A new registration must never inherit another owner's unfinished choices.
      if (next.email !== s.email || next.role !== s.role || next.userId !== s.userId) delete next.wizardDraft;
      return next;
    }),
    reset: () => setState(initial),
  }), [state]);
  return <SignUpContext.Provider value={value}>{children}</SignUpContext.Provider>;
}

export function useSignUp() {
  const value = useContext(SignUpContext);
  if (!value) throw new Error("useSignUp must be used inside SignUpProvider");
  return value;
}

function ownedWizard(state: SignUpState, role: UserRole): WizardDraft | undefined {
  const draft = state.wizardDraft;
  return draft?.role === role && draft.userId === state.userId && draft.fields
    && typeof draft.fields === "object" && !Array.isArray(draft.fields) ? draft : undefined;
}

function wizardValue<T extends WizardValue>(draft: WizardDraft | undefined, key: string, fallback: T): T {
  const value = draft?.fields[key];
  let valid = false;
  if (Array.isArray(fallback)) valid = Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id >= 0);
  else if (key === "started") valid = typeof value === "boolean";
  else if (key === "location") valid = value === null || (typeof value === "object" && !Array.isArray(value)
    && value !== null && "lat" in value && "lng" in value && Number.isFinite(value.lat)
    && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180);
  else valid = value === null && fallback === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  return valid ? value as T : fallback;
}

/** Editing remains local; unfinished signup reuses the existing tab-only draft. */
export function useSignUpWizardValue<T extends WizardValue>(mode: "signup" | "edit", role: UserRole, key: string, initial: T): readonly [T, Dispatch<SetStateAction<T>>] {
  const [local, setLocal] = useState(initial);
  const { state, update } = useSignUp();
  const value = mode === "signup" ? wizardValue(ownedWizard(state, role), key, initial) : local;
  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    if (mode === "edit") { setLocal(next); return; }
    update((current) => {
      if (!current.userId || current.role !== role) return {};
      const draft = ownedWizard(current, role);
      const previous = wizardValue(draft, key, initial);
      const resolved = typeof next === "function" ? next(previous) : next;
      return { wizardDraft: { role, userId: current.userId, fields: { ...draft?.fields, [key]: resolved } } };
    });
  };
  return [value, setValue];
}
