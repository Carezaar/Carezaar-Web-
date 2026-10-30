import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { authService, userService } from "../api/services";
import type { UserRole } from "../api/types";
import {
  OTP_LENGTH, canSubmitPasswordReset, passwordRules, signUpErrors, validateEmail, type SignUpErrors,
} from "../validation/validation";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { DuplicateActionError, useGuarded } from "../app/actionGuard";
import { useI18n } from "../app/i18n";
import { useSignUp } from "../app/signup";
import { FigmaScreen, type SceneOverlay } from "../figma/FigmaScreen";
import { semanticLabel, type SceneBinder } from "../figma/binder";
import type { DesignNode } from "../design/types";
import { BackHeader, Page } from "../ui/layout";
import { useIsWide } from "../ui/frames";
import { IntroCard, SignInCard, SignUpCard, SignUpConfirmation } from "./authCards";
import { ConsentText, LegalDocumentDialog, type LegalDocument } from "./legal";
import { Button, Checkbox, Dialog, TextField } from "../ui/kit";
import { assetUrl, Icon } from "../ui/Icon";
import { RuleChips } from "../ui/RuleChips";

/** The frame's password-rule chips (Frame 5) are drawn in fixed met/unmet states; the
 *  live `RuleChips` replace them. */
const RULE_CHIP_ROW = "56:84399";
/** Intro frame (16:14997), trust row (24:8366): the two remaining
 *  badges move left so the row stays centred (span 133–332 → 74.5–273.5 of 348). */
const TRUST_REST = new Set(["24:8370", "39:8387", "24:8375"]);
const TRUST_SHIFT = -58.5;

/* ---------------------------------------------------------------- Splash */

/** `Splash` while the saved sign-in is checked, the one wait left before the first screen:
 *  the reference lists load behind the screens since the client's report of 29 Oct 2026
 *  (the Android "Please wait…" sheet that listed them stayed up while one list was slow or
 *  failed). The brand mark only, with the check's own progress, at every width. */
const SPLASH_PROGRESS_BAR = "195:11763";

export function SplashScreen({ unreachable = false, onRetry, progress = 1 }: { unreachable?: boolean; onRetry?: () => void; progress?: number } = {}) {
  const { t } = useI18n();
  const wide = useIsWide();
  const binder = useMemo<SceneBinder>(() => ({ handle: () => true, isHidden: (n) => n.id === SPLASH_PROGRESS_BAR }), []);
  const percent = Math.round(progress * 100);
  const bar = (
    <div className="splash-progress" role="progressbar" aria-label={t("loading_please_wait", "Please wait…")}
      aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
  const failure = unreachable && (
    <div className="permission-gate" role="alertdialog" aria-modal="true" aria-labelledby="splash-failure">
      <div className="permission-card">
        <span className="permission-icon"><Icon name="ic_no_network" size={48} tint="var(--error)" /></span>
        <h1 id="splash-failure">{t("general_network_title", "Cannot communicate with server.")}</h1>
        {onRetry && <Button autoFocus onClick={onRetry}>{t("general_try_again", "Try Again")}</Button>}
      </div>
    </div>
  );
  if (wide) {
    return (
      <main className="splash auth-form auth-splash" aria-busy={!unreachable}>
        <img src={assetUrl("logo")} alt="" width={88} height={88} />
        <b className="auth-splash-name">Carezaar</b>
        <span className="muted">{t("splash_slogan", "Care, Connect, Compassion")}</span>
        <div className="auth-splash-status">{bar}</div>
        {failure}
      </main>
    );
  }
  return (
    <div className="splash" aria-busy={!unreachable}>
      <FigmaScreen sceneKey="v2-195-11749" binder={binder} overlays={[{ x: 32, y: 811, width: 348, height: 10, content: bar }]} />
      {failure}
    </div>
  );
}

/* ----------------------------------------------------------------- Intro */

function useIntro() {
  const navigate = useNavigate();
  const { update } = useSignUp();
  const i18n = useI18n();
  const start = useCallback((role: UserRole) => {
    update({ role, isPasswordRecovery: false });
    navigate(`/sign-up/${role}`);
  }, [navigate, update]);
  return { i18n, start, signIn: () => navigate("/sign-in") };
}
export type IntroModel = ReturnType<typeof useIntro>;

/** `Intro` — v2 design 16:14997 on phones, desktop design 767:30 from tablet width up:
 *  role choice, sign-in link, language selector. */
export function IntroScreen() {
  const intro = useIntro();
  return useIsWide() ? <IntroCard intro={intro} /> : <IntroScene intro={intro} />;
}

function IntroScene({ intro }: { intro: IntroModel }) {
  const { languages, languageId, setLanguage, t } = intro.i18n;
  const { start, signIn } = intro;
  const [menuOpen, setMenuOpen] = useState(false);

  const binder = useMemo<SceneBinder>(() => ({
    // The frame's own language pill is replaced by a working one in the same box.
    // The language pill and the "Sign in" link are real controls placed over the
    // frame: the link's 59px group cannot hold longer translations.
    isHidden: (n) => n.name === "Lanuage" || n.name === "Group 1",
    headingLevel: (n) => n.id === "18:8367" ? 1 : undefined,
    offsetX: (n) => (TRUST_REST.has(n.id) ? TRUST_SHIFT : undefined),
    // The server's English for this slug is empty, so the reverse lookup from the
    // scene copy can't find it; map it explicitly.
    text: (n) => (languageId !== 1 && n.text?.startsWith("For myself") ? t("intro_client_description", "") || undefined : undefined),
    handle: (n) => {
      const label = semanticLabel(n);
      if (label.includes("sign in")) { signIn(); return true; }
      if (label.includes("caregiver")) { start("caregiver"); return true; }
      if (label.includes("need care") || n.actionTarget) { start("client"); return true; }
      return false;
    },
  }), [signIn, start, languageId, t]);

  const current = languages.find((l) => l.id === languageId);
  const overlays: SceneOverlay[] = [{
    x: 20, y: 846, width: 372, height: 32,
    content: (
      <button type="button" className="link intro-signin" onClick={signIn}>
        {t("intro_sign_in", "Sign in")}
        <Icon name="ic_arrow_forward" size={14} tint="var(--primary)" className="flip-rtl" />
      </button>
    ),
  }, {
    x: 262, y: 16, width: 134, height: 36,
    content: (
      <button type="button" className="language-pill" onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={menuOpen}>
        <Icon name="ic_intl" size={22} tint="var(--text)" />
        <span>{current?.name ?? "English"}</span>
        <Icon name={menuOpen ? "ic_chevron_up" : "ic_chevron_down"} size={18} tint="var(--text)" />
      </button>
    ),
  }];
  if (menuOpen) {
    overlays.push({
      x: 262, y: 58, width: 134, height: 44 * languages.length,
      content: (
        <ul className="language-menu" role="listbox">
          {languages.map((l) => (
            <li key={l.id}>
              <button type="button" role="option" aria-selected={l.id === languageId}
                className={l.id === languageId ? "on" : ""}
                onClick={() => { setLanguage(l); setMenuOpen(false); }}>{l.name}</button>
            </li>
          ))}
        </ul>
      ),
    });
  }
  return <FigmaScreen sceneKey="v2-16-14997" binder={binder} overlays={overlays} />;
}

/* --------------------------------------------------------------- Sign in */

function useSignInForm() {
  const navigate = useNavigate();
  const goBack = useGoBack("/intro");
  const { signIn } = useSession();
  const i18n = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const { update } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim() !== "" && password !== "" && !busy;

  const submit = useCallback(async () => {
    // No email-format check here, as on Android: both fields filled is enough, and the
    // server answers a malformed address itself.
    if (email.trim() === "" || password === "") return;
    setBusy(true);
    try {
      // The signed-out route guard moves the user into the app once the session exists.
      await act("auth:login", () => signIn(email.trim(), password));
    } catch (e) {
      // A sign-up that was never finished (409, with the account's role in `meta`): as
      // on Android, show the server's message and continue at the profile step, which
      // is keyed by the email, then the role's preferences and the final sign-in.
      const role = e instanceof ApiError && e.status === 409 ? e.meta?.role : undefined;
      if (role === "client" || role === "caregiver") {
        toast(e instanceof ApiError && e.message && !e.isTechnical ? e.message : messageOf(e));
        update({
          role, email: email.trim(), password, userId: null, entityCreated: false, isPasswordRecovery: false,
        });
        navigate("/sign-up/profile");
        return;
      }
      toast(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [email, password, act, signIn, toast, messageOf, update, navigate]);

  const forgotPassword = useCallback(() => {
    update({ isPasswordRecovery: true });
    navigate("/forgot-password");
  }, [update, navigate]);

  return {
    i18n, email, setEmail, password, setPassword, canSubmit, submit, forgotPassword, goBack, busy,
    signUp: () => navigate("/intro"),
  };
}
export type SignInForm = ReturnType<typeof useSignInForm>;

/** `SignIn` — v2 design 51:5170 on phones, desktop design 767:36 from tablet width up. */
export function SignInScreen() {
  const form = useSignInForm();
  return useIsWide() ? <SignInCard form={form} /> : <SignInScene form={form} />;
}

/** The phone frame. "Forgot Password" and "Sign Up", which the Android app has but the
 *  frame does not, are placed in the frame's own gaps. */
function SignInScene({ form }: { form: SignInForm }) {
  const fieldPrefix = useId();
  const { t, languageId } = form.i18n;
  const { email, setEmail, password, setPassword, canSubmit, submit, goBack } = form;
  const [revealed, setRevealed] = useState(false);

  const binder = useMemo<SceneBinder>(() => ({
    accessibilityLabel: (n) => n.name === "Header" || n.name === "Back" ? "Back" : undefined,
    inputId: (n) => n.id === "40:8712" ? `${fieldPrefix}-email` : n.id === "40:8485" ? `${fieldPrefix}-password` : undefined,
    isRequired: (n) => n.id === "40:8712" || n.id === "40:8485" || undefined,
    labelFor: (n) => n.id === "40:9033" ? `${fieldPrefix}-email` : n.id === "40:8481" ? `${fieldPrefix}-password` : undefined,
    headingLevel: (n) => n.id === "51:5280" ? 1 : undefined,
    binding: (n) => n.inputType === "email" ? { value: email, onChange: setEmail }
      : n.inputType === "password" ? { value: password, onChange: setPassword } : undefined,
    // The content table has no translation for this subtitle; show it in English only.
    isHidden: (n) => languageId !== 1 && n.text === "Sign in to continue to Carezaar.",
    handle: (n) => {
      if (n.name === "Header" || n.name === "Back") { goBack(); return true; }
      if (n.name === "Button") { void submit(); return true; }
      return false;
    },
    isEnabled: (n) => (n.name === "Button" ? canSubmit : true),
    opacity: (n) => (n.name === "Button" && !canSubmit ? 0.45 : undefined),
    inputType: (n) => (n.inputType === "password" && revealed ? "text" : undefined),
  }), [email, setEmail, password, setPassword, submit, canSubmit, goBack, languageId, revealed, fieldPrefix]);

  // The frame has no <form>, so Enter in either field would otherwise do nothing.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT" || !canSubmit) return;
    e.preventDefault();
    void submit();
  };

  return (
    <div style={{ display: "contents" }} onKeyDown={onKeyDown}>
    <FigmaScreen sceneKey="v2-51-5170" binder={binder} overlays={[
      // The frame's eye (node "Visibility", 352,351) is drawn, not wired; this is the toggle.
      { x: 348, y: 347, width: 32, height: 32, content: (
        <PasswordToggle revealed={revealed} onToggle={() => setRevealed((r) => !r)} />
      ) },
      // Progress on the frame's own Sign In button (node 51:5272) while signing in.
      ...(form.busy ? [{ x: 344, y: 455, width: 24, height: 24, content: <span className="spinner spinner-sm" role="status" aria-label="Signing in" /> }] : []),
      { x: 20, y: 409, width: 372, height: 30, content: (
        <button type="button" className="link link-end" onClick={form.forgotPassword}>
          {t("signin_forgot_password", "Forgot Password")}
        </button>
      ) },
      { x: 20, y: 510, width: 372, height: 60, content: (
        <p className="center-row">
          <span className="muted">{t("signin_donot_have_account", "Don't have an account yet?")}</span>{" "}
          <button type="button" className="link" onClick={form.signUp}>{t("signin_sign_up", "Sign Up")}</button>
        </p>
      ) },
    ]} />
    </div>
  );
}

/* -------------------------------------------------------- Create account */

/** Kotlin sequence: register → hold credentials in memory → otp/send → OTP. */
function useSignUpForm() {
  const { role = "client" } = useParams<{ role: UserRole }>();
  const navigate = useNavigate();
  const goBack = useGoBack("/intro");
  const i18n = useI18n();
  const { t } = i18n;
  const { act, toast, messageOf } = useFeedback();
  const { state: signUp, update } = useSignUp();
  const [email, setEmailState] = useState(signUp.email);
  const [password, setPasswordState] = useState(signUp.password);
  const [confirmation, setConfirmationState] = useState(signUp.password);
  const [accepted, setAcceptedState] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<SignUpErrors>({});

  const rules = useMemo(() => passwordRules(password), [password]);
  // Editing a field clears its own message; the rest stay until the next Continue.
  const setEmail = useCallback((v: string) => { setEmailState(v); setErrors((e) => ({ ...e, email: undefined })); }, []);
  const setPassword = useCallback((v: string) => { setPasswordState(v); setErrors((e) => ({ ...e, password: undefined, confirmation: undefined })); }, []);
  const setConfirmation = useCallback((v: string) => { setConfirmationState(v); setErrors((e) => ({ ...e, confirmation: undefined })); }, []);
  const setAccepted = useCallback((v: boolean) => { setAcceptedState(v); }, []);

  /** Continue is always active, as on Android: it checks every field at once and puts
   *  each problem under its own field (parity review v4.0, C2). */
  const proceed = useCallback(() => {
    const next = signUpErrors({ email, password, confirmation, accepted }, t);
    const { accepted: agreement, ...fields } = next;
    setErrors(fields);
    if (Object.values(fields).some(Boolean)) return;
    // The agreement problem is only ever a short pop-up message, never text under the box
    // (parity review v6.0, C2).
    if (agreement) { toast(agreement); return; }
    setConfirming(true);
  }, [email, password, confirmation, accepted, t, toast]);

  const confirm = useCallback(async () => {
    let registered = false;
    try {
      await act("auth:register", async () => {
        await authService.register(role, email.trim(), password);
        registered = true;
        update({ role, email: email.trim(), password, isPasswordRecovery: false });
        await userService.sendOTP(email.trim());
      });
      setConfirming(false);
      navigate("/otp");
    } catch (e) {
      if (e instanceof DuplicateActionError) return;
      setConfirming(false);
      // The account exists but the code wasn't sent: open the code screen anyway, where
      // it can be asked for again (parity review v4.0, C5). Staying here would leave a
      // form whose Continue can only fail, because the account now exists.
      if (registered) {
        toast(messageOf(e));
        navigate("/otp", { state: { codeNotSent: true } });
        return;
      }
      if (e instanceof ApiError && e.kind === "validation" && !e.isTechnical) {
        const email = e.fieldError("email");
        const password = e.fieldError("password");
        setErrors({ email, password: password ?? (email ? undefined : e.message) });
      } else toast(messageOf(e));
    }
  }, [act, role, email, password, update, navigate, toast, messageOf]);

  return {
    i18n, toast, goBack,
    email, setEmail, password, setPassword, confirmation, setConfirmation, accepted, setAccepted,
    legalDocument, setLegalDocument, confirming, setConfirming,
    errors, rules, proceed, confirm,
  };
}
export type SignUpForm = ReturnType<typeof useSignUpForm>;

/** `SignUpCredentials/{role}` — v2 design 56:84378 on phones, desktop design 767:33 from
 *  tablet width up. */
export function SignUpCredentialsScreen() {
  const form = useSignUpForm();
  return (
    <>
      {useIsWide() ? <SignUpCard form={form} /> : <SignUpScene form={form} />}
      <LegalDocumentDialog doc={form.legalDocument} onClose={() => form.setLegalDocument(null)} />
    </>
  );
}

/** The frame's Continue button (56:84406) moves down to make room for the messages
 *  under Confirm Password and the agreement, and for the two-line agreement itself. */
const SIGNUP_CONTINUE = "56:84406";
const SIGNUP_CONTINUE_SHIFT = 66;

/** "Passwords do not match." while the two passwords differ, before any Continue (as
 *  the desktop card and Set Up Password do), or Continue's message for the field. */
function confirmationMessage(form: SignUpForm): string | undefined {
  return form.errors.confirmation;
}

/** The phone frame, which contains the full form and the "Are you sure?" dialog. The
 *  dialog nodes stay hidden until Continue. */
function SignUpScene({ form }: { form: SignUpForm }) {
  const fieldPrefix = useId();
  const { t, languageId } = form.i18n;
  const {
    email, setEmail, password, setPassword, confirmation, setConfirmation, accepted, setAccepted,
    errors, rules, goBack, proceed,
  } = form;
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);
  const confirmError = confirmationMessage(form);
  const [consentHeight, setConsentHeight] = useState(44);
  const consentObserver = useRef<ResizeObserver | null>(null);
  const attachConsent = useCallback((node: HTMLDivElement | null) => {
    consentObserver.current?.disconnect();
    consentObserver.current = null;
    if (!node) return;
    const measure = () => setConsentHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    consentObserver.current = observer;
    observer.observe(node);
  }, []);

  const binder = useMemo<SceneBinder>(() => {
    const isDialogNode = (n: DesignNode) => n.name === "Dialog" || n.name === "Rectangle 2931";
    return {
      inputId: (n) => n.id === "40:8712" ? `${fieldPrefix}-email` : n.id === "40:8485" ? `${fieldPrefix}-password` : undefined,
      isRequired: (n) => n.id === "40:8712" || n.id === "40:8485" || undefined,
      labelFor: (n) => n.id === "40:9033" ? `${fieldPrefix}-email` : n.id === "40:8481" ? `${fieldPrefix}-password` : n.id === "56:84393" ? `${fieldPrefix}-confirmation` : undefined,
      headingLevel: (n) => n.id === "56:84379" ? 1 : undefined,
      binding: (n) => n.inputType === "email" ? { value: email, onChange: setEmail }
        : n.inputType === "password" ? { value: password, onChange: setPassword } : undefined,
      handle: (n) => {
        if (n.name === "Header" || n.name === "Back") { goBack(); return true; }
        if (n.name === "Button") { proceed(); return true; }
        return false;
      },
      isHidden: (n) => isDialogNode(n)
        || n.id === RULE_CHIP_ROW
        // Two lines with the values in blue, drawn as an overlay below.
        || n.name === "Credentials"
        // The frame's message slot under Password is drawn smaller than the others; the
        // overlay below shows every field's message in one style.
        || n.name === "Error"
        || n.text === "Confirm your password..."
        // No translation exists for this hint; the rule chips carry the same rules.
        || (languageId !== 1 && Boolean(n.text?.startsWith("Use 8 or more characters"))),
      // The source button starts at y601; leave24 scene points after the
      // measured agreement, including enlarged phone link targets.
      offsetY: (n) => (n.id === SIGNUP_CONTINUE ? Math.max(SIGNUP_CONTINUE_SHIFT, consentHeight + 17) : undefined),
      inputType: (n) => (n.inputType === "password" && revealPassword ? "text" : undefined),
    };
  }, [email, setEmail, password, setPassword, goBack, proceed, languageId, revealPassword, fieldPrefix, consentHeight]);

  return (
    <>
    <FigmaScreen sceneKey="v2-56-84378" binder={binder} overlays={[
        ...(errors.email ? [{ x: 20, y: 266, width: 372, height: 18, content: (
          <p className="field-message" role="alert">{errors.email}</p>
        ) }] : []),
        ...(errors.password ? [{ x: 20, y: 388, width: 372, height: 18, content: (
          <p className="field-message" role="alert">{errors.password}</p>
        ) }] : []),
        { x: 20, y: 410, width: 372, height: 32, content: <RuleChips rules={rules} /> },
        { x: 348, y: 340, width: 32, height: 32, content: (
          <PasswordToggle revealed={revealPassword} onToggle={() => setRevealPassword((r) => !r)} />
        ) },
        { x: 68, y: 513, width: 278, height: 56, field: true, content: (
          <input id={`${fieldPrefix}-confirmation`} className="scene-input"
            aria-required="true"
            type={revealConfirm ? "text" : "password"} value={confirmation}
            placeholder={t("signup_credentials_confirm_password_placeholder", "Confirm your password...")}
            onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
        ) },
        { x: 348, y: 525, width: 32, height: 32, content: (
          <PasswordToggle revealed={revealConfirm} onToggle={() => setRevealConfirm((r) => !r)} />
        ) },
        ...(confirmError ? [{ x: 20, y: 572, width: 372, height: 18, content: (
          <p className="field-message" role="alert">{confirmError}</p>
        ) }] : []),
        { x: 20, y: 594, width: 372, height: consentHeight, content: (
          <div ref={attachConsent} style={{ width: "100%" }}>
          <Checkbox checked={accepted} onChange={setAccepted}>
            <ConsentText onOpen={form.setLegalDocument} />
          </Checkbox>
          </div>
        ) },
    ]} />
    <SignUpConfirmation form={form} />
    </>
  );
}

/* ------------------------------------------------------------------- OTP */

function useCountdown(seconds: number, initial = seconds) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return { left, mmss, restart: () => setLeft(seconds) };
}

/** Five single-digit boxes. Typing advances, backspace retreats, and a pasted or
 *  autofilled code (browsers put one-time codes into the first box) fills them all.
 *  There is deliberately no `maxLength`: it would truncate the paste to one digit. */
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
  const spread = (from: number, typed: string) => {
    const next = digits.slice();
    typed.split("").slice(0, OTP_LENGTH - from).forEach((d, k) => { next[from + k] = d; });
    onChange(next.join("").slice(0, OTP_LENGTH));
    refs.current[Math.min(from + typed.length, OTP_LENGTH - 1)]?.focus();
  };
  return (
    <div className="otp-boxes" dir="ltr">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`} value={d}
          onPaste={(e) => { e.preventDefault(); spread(i, e.clipboardData.getData("text").replace(/\D/g, "")); }}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (typed.length > 1) {
              // Either an autofill/paste into this box, or a digit typed over an existing one.
              spread(i, typed.length === 2 && d ? typed.replace(d, "") || typed.slice(-1) : typed);
              return;
            }
            const next = digits.slice(); next[i] = typed; onChange(next.join(""));
            if (typed && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
        />
      ))}
    </div>
  );
}

/** `OTP` — signup's email check. Verifying goes straight to the profile step without
 *  signing in, as Android does. (Password recovery asks for its code on Set Up Password.) */
export function OtpScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const { state: signUp } = useSignUp();
  const [code, setCode] = useState("");
  // Android starts the same two-minute wait even if the first send failed.
  const { left, mmss, restart } = useCountdown(120);
  const verifying = useGuarded("auth:otp-verify");
  const resending = useGuarded("auth:otp-send");

  useEffect(() => { if (!signUp.email) navigate("/intro", { replace: true }); }, [signUp.email, navigate]);

  const submit = async () => {
    try {
      await act("auth:otp-verify", () => userService.verifyOTP(signUp.email, code));
      navigate("/sign-up/profile", { state: { otp: code } });
    } catch (e) { toast(messageOf(e)); }
  };
  const resend = async () => {
    try {
      await act("auth:otp-send", () => userService.sendOTP(signUp.email));
      restart();
    } catch (e) { toast(messageOf(e)); }
  };

  return (
    <Page header={<BackHeader title={t("signup_otp_title", "OTP Confirmation")} />}>
      <div className="stack center">
        <p className="lead">{t("signup_otp_message", "Kindly enter the 5-digit OTP that we sent to your email.")}</p>
        <OtpBoxes value={code} onChange={setCode} />
        <Button trailingIcon="ic_chevron_forward" disabled={code.length !== OTP_LENGTH} loading={verifying} onClick={() => void submit()}>
          {t("signup_otp_continue", "Continue")}
        </Button>
        <p>{t("signup_otp_didnot_receive_otp", "Didn't receive the OTP?")}</p>
        {left > 0
          ? <p className="link-muted">{t("signup_otp_wait_to_resend", "Wait for mm:ss to re-send").replace("mm:ss", mmss)}</p>
          : <button type="button" className="link" disabled={resending} aria-busy={resending} onClick={() => void resend()}>{t("signup_otp_resend", "Re-send")}</button>}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------ Password recovery */

export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const { update } = useSignUp();
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);

  const sending = useGuarded("auth:otp-send");
  const send = async () => {
    try {
      await act("auth:otp-send", () => userService.sendOTP(email.trim()));
      setConfirming(false);
      update({ email: email.trim(), isPasswordRecovery: true });
      navigate("/setup-password");
    } catch (e) {
      if (e instanceof DuplicateActionError) return;
      setConfirming(false);
      toast(messageOf(e));
    }
  };

  return (
    <Page header={<BackHeader title={t("signup_forgot_password_title", "Forgot Password")} />}>
      <div className="stack">
        <p className="lead">{t("signup_forgot_password_message", "Enter your email for instruction.")}</p>
        <TextField label={t("signup_forgot_password_email", "Email Address")} required icon="ic_email"
          type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t("signup_forgot_password_email_placeholder", "Enter your email address...")} />
        <Button trailingIcon="ic_arrow_forward" disabled={validateEmail(email) !== null}
          onClick={() => setConfirming(true)}>
          {t("signup_forgot_password_reset_password", "Reset Password")}
        </Button>
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} labelledBy="fp-title"
        title={t("signup_forgot_password_dialog_title", "Are You Sure ?")}>
        <p>{t("signup_forgot_password_dialog_description", "You have selected to reset password of below email:")}</p>
        <p className="strong-blue">{email}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirming(false)}>{t("signup_forgot_password_dialog_deny", "Edit")}</Button>
          <Button loading={sending} onClick={() => void send()}>{t("signup_forgot_password_dialog_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
    </Page>
  );
}

/** `SetupPassword` — password recovery on one screen, as on Android: the emailed code,
 *  the new password and its confirmation, with the re-send timer. `users/password/reset`
 *  checks the code; a wrong or expired one keeps the user here with everything they
 *  typed, to correct the code or ask for a new one. */
export function SetupPasswordScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const { state: signUp, reset } = useSignUp();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const { left, mmss, restart } = useCountdown(120);

  // Reached without an email to recover (a direct link, or a reload after the session
  // ended): start again from Forgot Password instead of offering a reset that can only fail.
  const finished = useRef(false);
  useEffect(() => {
    if (finished.current) return;
    if (!signUp.email || !signUp.isPasswordRecovery) navigate("/forgot-password", { replace: true });
  }, [signUp.email, signUp.isPasswordRecovery, navigate]);

  const rules = passwordRules(password);
  // As on Android: a five-digit code and two nonblank, identical passwords. Strength is the
  // API's to judge, and its answer is shown.
  const valid = canSubmitPasswordReset(code, password, confirmation);
  const resetting = useGuarded("auth:password-reset");
  const resendingCode = useGuarded("auth:otp-send");

  const submit = async () => {
    setCodeError(null);
    try {
      await act("auth:password-reset",
        () => userService.resetPassword(signUp.email, code, password));
      // Clearing the recovery state must not trigger the "no recovery in progress" redirect.
      finished.current = true;
      reset();
      navigate("/sign-in", { replace: true });
    } catch (e) {
      const aboutCode = e instanceof ApiError && (Boolean(e.fieldError("otp")) || /\botp\b/i.test(e.message));
      if (aboutCode) {
        // Stay here: the code is corrected in place, or a new one requested.
        setCodeError(messageOf(e));
      } else {
        toast(messageOf(e));
      }
    }
  };
  const resend = async () => {
    try {
      await act("auth:otp-send", () => userService.sendOTP(signUp.email));
      setCodeError(null);
      setCode("");
      restart();
    } catch (e) { toast(messageOf(e)); }
  };

  return (
    <Page header={<BackHeader title={t("signup_setup_password_title", "Set Up Password")} />}>
      <div className="stack">
        <p className="lead">{t("signup_setup_password_message", "Kindly enter the 5-digit OTP that we sent to your email.")}</p>
        <p className="strong-blue" dir="ltr">{signUp.email}</p>
        <OtpBoxes value={code} onChange={(v) => { setCode(v); setCodeError(null); }} />
        {codeError && <p className="field-message" role="alert">{codeError}</p>}
        <p className="center">
          {t("signup_setup_password_didnot_receive_otp", "Didn't receive the OTP?")}{" "}
          {left > 0
            ? <span className="link-muted" aria-live="polite">{t("signup_setup_password_wait_to_resend", "Wait for mm:ss to re-send").replace("mm:ss", mmss)}</span>
            : <button type="button" className="link" disabled={resendingCode} aria-busy={resendingCode} onClick={() => void resend()}>{t("signup_setup_password_resend", "Re-send")}</button>}
        </p>
        <TextField label={t("signup_setup_password_password", "Password")} required icon="ic_lock" type="password"
          autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t("signup_setup_password_password_placeholder", "Enter your password...")} />
        <RuleChips rules={rules} />
        <TextField label={t("signup_setup_password_confirm_password", "Confirm Password")} required icon="ic_lock"
          type="password" autoComplete="new-password" value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={confirmation && confirmation !== password ? t("signup_credentials_password_match", "Passwords do not match.") : null}
          placeholder={t("signup_setup_password_confirm_password_placeholder", "Confirm your password...")} />
        <Button trailingIcon="ic_arrow_forward" disabled={!valid} loading={resetting} onClick={() => void submit()}>
          {t("signup_setup_password_continue", "Continue")}
        </Button>
      </div>
    </Page>
  );
}

/** Show/hide control drawn over a frame's (static) eye icon. */
function PasswordToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="scene-hit eye-toggle" onClick={onToggle} aria-pressed={revealed}
      aria-label={revealed ? "Hide password" : "Show password"}>
      <Icon name={revealed ? "ic_visible" : "ic_hidden"} size={22} tint="var(--text-secondary)" />
    </button>
  );
}

