import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { SessionProvider, useSession } from "./auth/SessionContext";
import type { UserRole } from "./api/types";
import { BaseDataProvider, useBaseData } from "./app/baseData";
import { I18nProvider } from "./app/i18n";
import { FeedbackProvider } from "./app/feedback";
import { NotificationsProvider } from "./app/notifications";
import { SignUpProvider } from "./app/signup";
import { RecoveryBoundary } from "./app/recovery";
import {
  ForgotPasswordScreen, IntroScreen, OtpScreen, SetupPasswordScreen, SignInScreen,
  SignUpCredentialsScreen, SplashScreen,
} from "./screens/auth";
import { ProfileFormScreen } from "./screens/profileForm";
import { CaregiverSkillsWizard, ClientPreferencesWizard } from "./screens/wizard";
import { MainScreen } from "./screens/main";
import { PartnerDetailScreen } from "./screens/partner";
import { ChatScreen } from "./screens/chat";
import { ManageMatchesScreen } from "./screens/matchesManage";
import { MatchedScreen } from "./screens/matched";
import {
  ChangeLanguageScreen, ChangePasswordScreen, DeleteAccountScreen, FaqScreen, FavoritesScreen,
  HelpCenterScreen, NotificationsScreen, ReportIssueScreen,
} from "./screens/account";
import { AppFrame, AuthFrame } from "./ui/frames";
import { peekReturnTo, rememberReturnTo, takeReturnTo } from "./navigation/returnTo";

/** Splash decides, as on Android: cache warm-up and session restore first, then the
 *  authenticated or unauthenticated graph. */
function Gate({ children, auth, role }: { children: ReactNode; auth: "in" | "out" | "any"; role?: UserRole }) {
  const { state, retry } = useSession();
  const { ready } = useBaseData();
  const location = useLocation();
  if (state.status === "loading" || !ready) return <SplashScreen />;
  if (state.status === "unreachable") return <SplashScreen unreachable onRetry={() => void retry()} />;
  const signedIn = state.status === "signedIn";
  if (auth === "in" && !signedIn) {
    // Only a link opened directly (a fresh page load) is worth returning to after
    // sign-in; being signed out mid-session starts again from My Matches.
    if (location.key === "default") rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/intro" replace />;
  }
  if (auth === "out" && signedIn) return <EnterApp />;
  // Screens that belong to the other role (the server answers 403 "User is not a
  // caregiver!"); send the user to their own matches instead.
  if (role && signedIn && state.user.role !== role) return <Navigate to="/main/matches" replace />;
  return <>{children}</>;
}

/** One frame for every route, so the desktop sidebar/top bar persist across
 *  navigation instead of remounting per page. */
function Frame() {
  const { state } = useSession();
  // The splash (session check, base-data warm-up) is full-bleed, not framed.
  if (state.status === "loading" || state.status === "unreachable") return <Outlet />;
  const signedIn = state.status === "signedIn";
  return signedIn ? <AppFrame><Outlet /></AppFrame> : <AuthFrame><Outlet /></AuthFrame>;
}

/** Where a freshly signed-in user lands: the protected link they originally opened,
 *  else My Matches. This is the only post-sign-in redirect, so screens that sign in
 *  (Sign In, the end of both signup wizards) do not race it with their own. */
function EnterApp() {
  const [target] = useState(() => peekReturnTo() ?? "/main/matches");
  useEffect(() => { takeReturnTo(); }, []);
  return <Navigate to={target} replace />;
}

function Localised({ children }: { children: ReactNode }) {
  const { items, languages } = useBaseData();
  return <I18nProvider contents={items("contents")} languages={languages}>{children}</I18nProvider>;
}

export function App() {
  const out = (el: ReactNode) => <Gate auth="out">{el}</Gate>;
  const any = (el: ReactNode) => <Gate auth="any">{el}</Gate>;
  const inn = (el: ReactNode, role?: UserRole) => <Gate auth="in" role={role}>{el}</Gate>;
  return (
    <BrowserRouter>
      <BaseDataProvider>
        <Localised>
          <RecoveryBoundary>
          <SessionProvider>
            <NotificationsProvider>
            <FeedbackProvider>
              <SignUpProvider>
                <div className="app-column">
                  <Routes>
                    <Route element={<Frame />}>
                    <Route path="/" element={any(<Navigate to="/main/matches" replace />)} />
                    <Route path="/intro" element={out(<IntroScreen />)} />
                    <Route path="/sign-in" element={out(<SignInScreen />)} />
                    <Route path="/sign-up/profile" element={out(<ProfileFormScreen mode="signup" />)} />
                    <Route path="/onboarding/client" element={out(<ClientPreferencesWizard mode="signup" />)} />
                    <Route path="/onboarding/caregiver" element={out(<CaregiverSkillsWizard mode="signup" />)} />
                    <Route path="/sign-up/:role" element={out(<SignUpCredentialsScreen />)} />
                    <Route path="/otp" element={out(<OtpScreen />)} />
                    <Route path="/forgot-password" element={out(<ForgotPasswordScreen />)} />
                    <Route path="/setup-password" element={out(<SetupPasswordScreen />)} />

                    <Route path="/main/:tab" element={inn(<MainScreen />)} />
                    <Route path="/profile" element={<Navigate to="/main/profile" replace />} />
                    <Route path="/profile/edit" element={inn(<ProfileFormScreen mode="edit" />)} />
                    <Route path="/profile/matches" element={inn(<ManageMatchesScreen />)} />
                    <Route path="/preferences" element={inn(<ClientPreferencesWizard mode="edit" />, "client")} />
                    <Route path="/skills" element={inn(<CaregiverSkillsWizard mode="edit" />, "caregiver")} />
                    <Route path="/caregivers/:id" element={inn(<PartnerDetailScreen kind="caregiver" />, "client")} />
                    <Route path="/clients/:id" element={inn(<PartnerDetailScreen kind="client" />, "caregiver")} />
                    <Route path="/chat/:chatId" element={inn(<ChatScreen />)} />
                    <Route path="/matched/:kind/:partnerId" element={inn(<MatchedScreen />)} />
                    <Route path="/notifications" element={inn(<NotificationsScreen />)} />
                    <Route path="/favorites" element={inn(<FavoritesScreen />)} />
                    <Route path="/help" element={inn(<HelpCenterScreen />)} />
                    <Route path="/faq" element={any(<FaqScreen />)} />
                    <Route path="/report-issue" element={inn(<ReportIssueScreen />)} />
                    <Route path="/change-language" element={any(<ChangeLanguageScreen />)} />
                    <Route path="/change-password" element={inn(<ChangePasswordScreen />)} />
                    <Route path="/delete-account" element={inn(<DeleteAccountScreen />)} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </div>
              </SignUpProvider>
            </FeedbackProvider>
            </NotificationsProvider>
          </SessionProvider>
          </RecoveryBoundary>
        </Localised>
      </BaseDataProvider>
    </BrowserRouter>
  );
}
