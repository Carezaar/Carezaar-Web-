import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { SESSION_EXPIRED_EVENT } from "../api/client";
import { ApiError } from "../api/errors";
import { authService } from "../api/services";
import { tokenStore } from "../api/session";
import { prefetchFirstMatches, rememberRole } from "../app/matchesPrefetch";
import type { User, UserRole } from "../api/types";

/** Reproduces the Android Splash decision: a stored token means resolve the user and
 *  enter the app, otherwise show Intro. */
export type SessionState =
  | { status: "loading" }
  /** A stored session could not be checked (offline, server down). The token is kept
   *  and the splash offers a retry instead of silently signing the user out. */
  | { status: "unreachable" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User };

interface SessionContextValue {
  state: SessionState;
  user: User | null;
  role: UserRole | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function classify(user: User): SessionState {
  return { status: "signedIn", user };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const restore = useCallback(async (appStart = false) => {
    if (!tokenStore.hasSession) {
      setState({ status: "signedOut" });
      return;
    }
    if (appStart) prefetchFirstMatches();
    try {
      setState(classify(await authService.currentUser()));
    } catch (error) {
      if (error instanceof ApiError && error.kind === "unauthenticated") {
        tokenStore.clear();
        setState({ status: "signedOut" });
      } else {
        setState({ status: "unreachable" });
      }
    }
  }, []);

  useEffect(() => {
    if (state.status === "signedIn") rememberRole(state.user.role);
    else if (state.status === "signedOut") rememberRole(null);
  }, [state]);

  useEffect(() => {
    void restore(true);
    const onExpired = () => setState({ status: "signedOut" });
    // Signing in or out in another tab changes the stored token; follow it so two
    // tabs never disagree about who is signed in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "carezaar.accessToken") void restore();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener("storage", onStorage);
    };
  }, [restore]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      user: state.status === "signedIn" ? state.user : null,
      role:
        state.status === "signedIn"
          ? state.user.role
          : null,
      async signIn(email, password) {
        await authService.login(email, password);
        try {
          setState(classify(await authService.currentUser()));
        } catch (error) {
          // Tokens without a user would leave a half-signed-in app; undo the login.
          tokenStore.clear();
          throw error;
        }
      },
      async signOut() {
        // The server call is best effort; locally the user is always signed out.
        await authService.logout().catch(() => undefined);
        setState({ status: "signedOut" });
      },
      async retry() {
        setState({ status: "loading" });
        await restore();
      },
      async refreshUser() {
        try {
          setState(classify(await authService.currentUser()));
        } catch {
          /* keep the current state on a transient failure */
        }
      },
    }),
    [state, restore],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider");
  return context;
}
