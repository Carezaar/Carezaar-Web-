import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserRole } from "../api/types";

/** In-progress signup, the equivalent of Android's in-memory `App.k/l/p`. On the web
 *  a refresh would wipe memory mid-signup and strand an account that is registered but
 *  cannot sign in yet, so it is mirrored to this tab's sessionStorage (gone when the
 *  tab closes) and cleared as soon as signup completes.
 *
 *  The verified sequence is entirely unauthenticated until the last step:
 *  register → OTP → profile (keyed by email) → role entity (keyed by user_id) →
 *  sign in with the credentials held here. */
export interface SignUpState {
  role: UserRole;
  countryId: number;
  email: string;
  password: string;
  userId: string | null;
  /** The client/caregiver entity exists; a retry after a failed final sign-in must
   *  not try to create it again. */
  entityCreated: boolean;
  isPasswordRecovery: boolean;
}

const initial: SignUpState = {
  role: "client", countryId: 1, email: "", password: "", userId: null, entityCreated: false, isPasswordRecovery: false,
};

const SignUpContext = createContext<{
  state: SignUpState;
  update: (patch: Partial<SignUpState>) => void;
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
    update: (patch: Partial<SignUpState>) => setState((s) => ({ ...s, ...patch })),
    reset: () => setState(initial),
  }), [state]);
  return <SignUpContext.Provider value={value}>{children}</SignUpContext.Provider>;
}

export function useSignUp() {
  const value = useContext(SignUpContext);
  if (!value) throw new Error("useSignUp must be used inside SignUpProvider");
  return value;
}
