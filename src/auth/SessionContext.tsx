import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { SESSION_EXPIRED_EVENT, clearConnectionProblem } from "../api/client";
import { ApiError } from "../api/errors";
import { authService } from "../api/services";
import { tokenStore, type SessionOwner } from "../api/session";
import type { User, UserRole } from "../api/types";
import { forgetMatches } from "../app/matchesState";

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
  hasSignedInThisPage: boolean;
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
  // The frame changes between authenticated and public screens. Keep this history
  // above that frame so signing out cannot recreate an initial deep-link intent.
  const hasSignedInThisPage = useRef(false);
  // Only the latest session check may settle after a cross-tab identity change.
  const restoreRevision = useRef(0);
  const acceptedOwner = useRef<SessionOwner>(null);
  const acceptUser = useCallback((user: User) => {
    // Migrate legacy token pairs before private screens mount. This callback
    // runs after identity resolution, never during render.
    acceptedOwner.current = tokenStore.captureOwner();
    hasSignedInThisPage.current = true;
    setState(classify(user));
  }, []);

  // Nothing that needs the session (My Matches first of all) starts until this check
  // has resolved: the signed-in screens only mount once the state is "signedIn".
  const restore = useCallback(async () => {
    const revision = ++restoreRevision.current;
    if (!tokenStore.hasSession) {
      acceptedOwner.current = null;
      setState({ status: "signedOut" });
      return;
    }
    try {
      const user = await authService.currentUser();
      if (revision !== restoreRevision.current) return;
      acceptUser(user);
    } catch (error) {
      if (revision !== restoreRevision.current) return;
      if (error instanceof ApiError && error.kind === "unauthenticated") {
        tokenStore.clear();
        acceptedOwner.current = null;
        setState({ status: "signedOut" });
      } else {
        setState({ status: "unreachable" });
      }
    }
  }, [acceptUser]);

  // Signing out (or a sign-in that ends) forgets the My Matches sort and list (23 Oct 2026).
  useEffect(() => { if (state.status === "signedOut") forgetMatches(); }, [state.status]);

  useEffect(() => {
    const invalidateSessionChecks = () => { restoreRevision.current++; };
    void restore();
    const onExpired = () => {
      invalidateSessionChecks();
      acceptedOwner.current = null;
      setState({ status: "signedOut" });
    };
    // Signing in or out in another tab changes the stored token; follow it so two
    // tabs never disagree about who is signed in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "carezaar.accessToken") {
        // Hide the previous login's private controls before resolving the new
        // identity. Renewal keeps the owner and must not discard local drafts.
        if (tokenStore.owner !== acceptedOwner.current) setState({ status: "loading" });
        void restore();
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener("storage", onStorage);
    return () => {
      invalidateSessionChecks();
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener("storage", onStorage);
    };
  }, [restore]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      hasSignedInThisPage: hasSignedInThisPage.current,
      user: state.status === "signedIn" ? state.user : null,
      role:
        state.status === "signedIn"
          ? state.user.role
          : null,
      async signIn(email, password) {
        const revision = ++restoreRevision.current;
        try {
          await authService.login(email, password, () => revision === restoreRevision.current);
        } catch (error) {
          if (revision !== restoreRevision.current) return;
          throw error;
        }
        try {
          const user = await authService.currentUser();
          if (revision !== restoreRevision.current) return;
          acceptUser(user);
        } catch (error) {
          if (revision !== restoreRevision.current) return;
          // Tokens without a user would leave a half-signed-in app; undo the login.
          tokenStore.clear();
          throw error;
        }
      },
      async signOut() {
        const revision = ++restoreRevision.current;
        // Nothing should keep waiting for a renewal once the user has signed out.
        clearConnectionProblem();
        // Best effort for this session; a newer session check owns any later state.
        await authService.logout().catch(() => undefined);
        if (revision === restoreRevision.current) {
          acceptedOwner.current = null;
          setState({ status: "signedOut" });
        }
      },
      async retry() {
        setState({ status: "loading" });
        await restore();
      },
      async refreshUser() {
        const revision = restoreRevision.current;
        try {
          const user = await authService.currentUser();
          if (revision !== restoreRevision.current) return;
          acceptUser(user);
        } catch {
          /* keep the current state on a transient failure */
        }
      },
    }),
    [state, restore, acceptUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider");
  return context;
}
