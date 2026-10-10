import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { authService, userService } from "../api/services";
import type { UserRole } from "../api/types";
import {
  OTP_LENGTH, isPasswordValid, passwordRules, validateConfirmation, validateEmail,
} from "../validation/validation";
import { useSession } from "../auth/SessionContext";
import { useBaseData, TABLE_LABELS } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { useSignUp } from "../app/signup";
import { FigmaScreen, type SceneOverlay } from "../figma/FigmaScreen";
import { semanticLabel, type SceneBinder } from "../figma/binder";
import type { DesignNode } from "../design/types";
import { BackHeader, Page } from "../ui/layout";
import { useIsWide } from "../ui/frames";
import { IntroCard, SignInCard, SignUpCard } from "./authCards";
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

/** `Splash` — v2 design 195:11749, plus the Android "Please wait…" sheet that lists
 *  every base table while the local cache is first populated. */
export function SplashScreen({ unreachable = false, onRetry }: { unreachable?: boolean; onRetry?: () => void } = {}) {
  const { pending, progress, failed: tablesFailed, reload } = useBaseData();
  const failed = tablesFailed || unreachable;
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const binder = useMemo<SceneBinder>(() => ({ handle: () => true }), []);
  const wide = useIsWide();
  if (wide) {
    // Tablet and desktop: a web loading state in the auth card, not the phone frame.
    return (
      <main className="splash auth-form auth-splash" aria-busy={!failed}>
        <img src={assetUrl("logo")} alt="" width={88} height={88} />
        <b className="auth-splash-name">Carezaar</b>
        <span className="muted">{t("splash_slogan", "Care, Connect, Compassion")}</span>
        {failed ? (
          <div className="auth-splash-status" role="alert">
            <p>{t("general_network_title", "Cannot communicate with server.")}</p>
            <Button onClick={() => (onRetry ? onRetry() : void reload(true))}>{t("general_try_again", "Try Again")}</Button>
          </div>
        ) : (
          <div className="auth-splash-status">
            <div className="auth-splash-bar" role="progressbar" aria-label={t("loading_please_wait", "Please wait…")}
              aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }} />
            </div>
            <p className="muted small">{t("loading_please_wait", "Please wait…")}</p>
          </div>
        )}
      </main>
    );
  }
  return (
    <div className="splash">
      <FigmaScreen sceneKey="v2-195-11749" binder={binder} />
      <div className="splash-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {pending.length > 0 && (
        <div className="busy-card splash-sheet">
          <div className="busy-head">
            <span className="spinner" aria-hidden="true" />
            <strong>{t("loading_please_wait", "Please wait…")}</strong>
          </div>
          {expanded && (
            <ul>{pending.map((p) => (
              <li key={p}>- {t(`loading_base_${p}`, TABLE_LABELS[p] ?? p)}</li>
            ))}</ul>
          )}
          <button type="button" className="icon-btn" onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}>
            <Icon name={expanded ? "ic_chevron_up" : "ic_chevron_down"} size={22} tint="var(--primary)" />
          </button>
        </div>
      )}
      {failed && (
        <div className="busy-card splash-sheet" role="alert">
          <strong>{t("general_network_title", "Cannot communicate with server.")}</strong>
          <Button onClick={() => (onRetry ? onRetry() : void reload(true))}>{t("general_try_again", "Try Again")}</Button>
        </div>
      )}
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
  const { t } = i18n;
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
      await act(t("loading_auth_login", "Signing in"), () => signIn(email.trim(), password));
    } catch (e) {
      toast(e instanceof ApiError && e.kind === "validation"
        ? Object.values(e.fields).flat()[0] ?? e.message : messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [email, password, act, signIn, t, toast, messageOf]);

  const forgotPassword = useCallback(() => {
    update({ isPasswordRecovery: true });
    navigate("/forgot-password");
  }, [update, navigate]);

  return {
    i18n, email, setEmail, password, setPassword, canSubmit, submit, forgotPassword, goBack,
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
  const { t, languageId } = form.i18n;
  const { email, setEmail, password, setPassword, canSubmit, submit, goBack } = form;
  const [revealed, setRevealed] = useState(false);

  const binder = useMemo<SceneBinder>(() => ({
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
  }), [email, setEmail, password, setPassword, submit, canSubmit, goBack, languageId, revealed]);

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
  const [email, setEmail] = useState(signUp.email);
  const [password, setPassword] = useState(signUp.password);
  const [confirmation, setConfirmation] = useState(signUp.password);
  const [accepted, setAccepted] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => passwordRules(password), [password]);
  const valid = validateEmail(email) === null && isPasswordValid(password)
    && password === confirmation && accepted;

  const proceed = useCallback(() => {
    const problem = validateEmail(email)
      ?? (isPasswordValid(password) ? null : t("general_required", "This field is required."))
      ?? validateConfirmation(password, confirmation);
    setError(problem === "Passwords do not match." ? t("signup_credentials_password_match", problem) : problem);
    if (!problem && accepted) setConfirming(true);
  }, [email, password, confirmation, accepted, t]);

  const confirm = useCallback(async () => {
    setConfirming(false);
    try {
      await act(t("loading_auth_register", "Registering"), async () => {
        await authService.register(role, email.trim(), password);
        update({ role, email: email.trim(), password, isPasswordRecovery: false });
        await userService.sendOTP(email.trim());
      });
      navigate("/otp");
    } catch (e) {
      if (e instanceof ApiError && e.kind === "validation") {
        setError(e.fieldError("email") ?? e.fieldError("password") ?? e.message);
      } else toast(messageOf(e));
    }
  }, [act, t, role, email, password, update, navigate, toast, messageOf]);

  return {
    i18n, toast, goBack,
    email, setEmail, password, setPassword, confirmation, setConfirmation, accepted, setAccepted,
    licenseOpen, setLicenseOpen, confirming, setConfirming,
    error, rules, valid, proceed, confirm,
  };
}
export type SignUpForm = ReturnType<typeof useSignUpForm>;

/** `SignUpCredentials/{role}` — v2 design 56:84378 on phones, desktop design 767:33 from
 *  tablet width up. */
export function SignUpCredentialsScreen() {
  const form = useSignUpForm();
  const { t } = form.i18n;
  return (
    <>
      {useIsWide() ? <SignUpCard form={form} /> : <SignUpScene form={form} />}
      <Dialog open={form.licenseOpen} onClose={() => form.setLicenseOpen(false)}
        title={capitalized(t("signup_credentials_accept_license", "License agreement"))} labelledBy="eula">
        <div className="eula">{t("signup_credentials_accept_contents", "")}</div>
        <Button onClick={() => { form.setAccepted(true); form.setLicenseOpen(false); }}>{t("general_confirm", "Confirm")}</Button>
      </Dialog>
    </>
  );
}

/** The phone frame, which contains the full form and the "Are you sure?" dialog. The
 *  dialog nodes stay hidden until Continue. */
function SignUpScene({ form }: { form: SignUpForm }) {
  const { t, languageId } = form.i18n;
  const {
    email, setEmail, password, setPassword, confirmation, setConfirmation, accepted, setAccepted,
    confirming, setConfirming, error, valid, rules, goBack, proceed, confirm,
  } = form;
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);

  const binder = useMemo<SceneBinder>(() => {
    const isDialogNode = (n: DesignNode) => n.name === "Dialog" || n.name === "Rectangle 2931";
    return {
      binding: (n) => n.inputType === "email" ? { value: email, onChange: setEmail }
        : n.inputType === "password" ? { value: password, onChange: setPassword } : undefined,
      handle: (n) => {
        const text = semanticLabel(n);
        if (n.name === "Header" || n.name === "Back") { goBack(); return true; }
        if (n.name === "Button" && text.includes("edit")) { setConfirming(false); return true; }
        if (n.name === "Button" && text.includes("confirm")) { void confirm(); return true; }
        if (n.name === "Button") { proceed(); return true; }
        return false;
      },
      isHidden: (n) => (isDialogNode(n) && !confirming)
        || n.id === RULE_CHIP_ROW
        // Two lines with the values in blue, drawn as an overlay below.
        || n.name === "Credentials"
        || (n.name === "Error" && !error)
        || n.text === "Confirm your password..."
        // No translation exists for this hint; the rule chips carry the same rules.
        || (languageId !== 1 && Boolean(n.text?.startsWith("Use 8 or more characters"))),
      isEnabled: (n) => (n.name === "Button" && !semanticLabel(n).match(/edit|confirm/) ? valid : true),
      opacity: (n) => {
        if (n.name === "Button" && !semanticLabel(n).match(/edit|confirm/) && !valid) return 0.45;
        return undefined;
      },
      text: (n) => {
        if (n.name === "Error") return error ?? undefined;
        if (n.text?.startsWith("Please review the details below")) {
          return t("signup_credentials_confirm_dialog_email_description", "Please review your email address below. It will be used to continue.");
        }
        return undefined;
      },
      inputType: (n) => (n.inputType === "password" && revealPassword ? "text" : undefined),
    };
  }, [email, setEmail, password, setPassword, confirming, setConfirming, error, valid, t, goBack, proceed, confirm, languageId, revealPassword]);

  return (
    <FigmaScreen sceneKey="v2-56-84378" binder={binder} overlays={[
      // Overlays sit above the frame, which moved the lower fields into the dialog's area:
      // while it's open, show only its email line (the form keeps the values for Edit).
      ...(confirming ? [{ x: 58, y: 460, width: 296, height: 24, content: (
        <div className="dialog-credentials">
          <span>{t("signup_credentials_email", "Email")}: <b dir="ltr">{email}</b></span>
        </div>
      ) }] : [
        { x: 20, y: 410, width: 372, height: 32, content: <RuleChips rules={rules} /> },
        { x: 348, y: 340, width: 32, height: 32, content: (
          <PasswordToggle revealed={revealPassword} onToggle={() => setRevealPassword((r) => !r)} />
        ) },
        { x: 68, y: 513, width: 278, height: 56, content: (
          <input className="scene-input" aria-label={t("signup_credentials_confirm_password", "Confirm Password")}
            type={revealConfirm ? "text" : "password"} value={confirmation}
            placeholder={t("signup_credentials_confirm_password_placeholder", "Confirm your password...")}
            onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
        ) },
        { x: 348, y: 525, width: 32, height: 32, content: (
          <PasswordToggle revealed={revealConfirm} onToggle={() => setRevealConfirm((r) => !r)} />
        ) },
        { x: 20, y: 572, width: 372, height: 28, content: (
          <Checkbox checked={accepted} onChange={setAccepted}>
            {t("signup_credentials_accept_label", "I accept the")}{" "}
            <button type="button" className="link" onClick={(e) => { e.preventDefault(); form.setLicenseOpen(true); }}>
              {t("signup_credentials_accept_license", "license agreement")}
            </button>
          </Checkbox>
        ) },
      ]),
    ]} />
  );
}

/* ------------------------------------------------------------------- OTP */

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
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
  const { left, mmss, restart } = useCountdown(120);

  useEffect(() => { if (!signUp.email) navigate("/intro", { replace: true }); }, [signUp.email, navigate]);

  const submit = async () => {
    try {
      await act(t("loading_user_otp_verify", "Verifying OTP code"), () => userService.verifyOTP(signUp.email, code));
      navigate("/sign-up/profile", { state: { otp: code } });
    } catch (e) { toast(messageOf(e)); }
  };
  const resend = async () => {
    try {
      await act(t("loading_user_otp_send", "Sending OTP code"), () => userService.sendOTP(signUp.email));
      restart();
    } catch (e) { toast(messageOf(e)); }
  };

  return (
    <Page header={<BackHeader title={t("signup_otp_title", "OTP Confirmation")} />}>
      <div className="stack center">
        <p className="lead">{t("signup_otp_message", "Kindly enter the 5-digit OTP that we sent to your email.")}</p>
        <OtpBoxes value={code} onChange={setCode} />
        <Button trailingIcon="ic_chevron_forward" disabled={code.length !== OTP_LENGTH} onClick={() => void submit()}>
          {t("signup_otp_continue", "Continue")}
        </Button>
        <p>{t("signup_otp_didnot_receive_otp", "Didn't receive the OTP?")}</p>
        {left > 0
          ? <p className="link-muted">{t("signup_otp_wait_to_resend", "Wait for mm:ss to re-send").replace("mm:ss", mmss)}</p>
          : <button type="button" className="link" onClick={() => void resend()}>{t("signup_otp_resend", "Re-send")}</button>}
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

  const send = async () => {
    setConfirming(false);
    try {
      await act(t("loading_user_otp_send", "Sending OTP code"), () => userService.sendOTP(email.trim()));
      update({ email: email.trim(), isPasswordRecovery: true });
      navigate("/setup-password");
    } catch (e) { toast(messageOf(e)); }
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
          <Button onClick={() => void send()}>{t("signup_forgot_password_dialog_confirm", "Confirm")}</Button>
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
  const { act, toast, messageOf, unavailable } = useFeedback();
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
  const valid = code.length === OTP_LENGTH && isPasswordValid(password) && password === confirmation;

  const submit = async () => {
    setCodeError(null);
    try {
      await act(t("loading_user_password_reset", "Resetting password"),
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
        toast(e instanceof ApiError && e.isServiceFault ? unavailable(t("signup_forgot_password_title", "Forgot Password")) : messageOf(e));
      }
    }
  };
  const resend = async () => {
    try {
      await act(t("loading_user_otp_send", "Sending OTP code"), () => userService.sendOTP(signUp.email));
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
            : <button type="button" className="link" onClick={() => void resend()}>{t("signup_setup_password_resend", "Re-send")}</button>}
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
        <Button trailingIcon="ic_arrow_forward" disabled={!valid} onClick={() => void submit()}>
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

/** The link text ("license agreement") doubles as the dialog title. */
const capitalized = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
