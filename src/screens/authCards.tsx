import { useEffect, useRef, useState, type FormEvent } from "react";
import type { IntroModel, SignInForm, SignUpForm } from "./auth";
import { Button, Checkbox, Dialog, TextField } from "../ui/kit";
import { assetUrl, Icon } from "../ui/Icon";
import { RuleChips } from "../ui/RuleChips";

/* Signed-out screens from tablet width up (desktop designs 767:30, 767:33, 767:36):
 * real web forms in the AuthFrame card. Phones keep the Figma phone frames. */

/** Text the frames draw in English whose content key has different casing. */
const drawn = (translate: (english: string) => string | null, english: string) => translate(english) ?? english;

function CardTop({ onBack, logo = false }: { onBack?: () => void; logo?: boolean }) {
  return (
    <div className="auth-top">
      {onBack && (
        <button type="button" className="round-btn" onClick={onBack} aria-label="Back">
          <Icon name="ic_arrow_backward" size={20} tint="var(--text)" className="flip-rtl" />
        </button>
      )}
      {logo && <img className="auth-top-logo" src={assetUrl("logo")} alt="" width={56} height={56} />}
    </div>
  );
}

function submitHandler(action: () => void) {
  return (e: FormEvent) => { e.preventDefault(); action(); };
}

/* ---------------------------------------------------------------- Intro */

function LanguagePicker({ intro }: { intro: IntroModel }) {
  const { languages, languageId, setLanguage } = intro.i18n;
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const current = languages.find((l) => l.id === languageId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="auth-language" ref={host}>
      <button type="button" className="language-pill" onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open}>
        <Icon name="ic_intl" size={20} tint="var(--text)" />
        <span>{current?.name ?? "English"}</span>
        <Icon name={open ? "ic_chevron_up" : "ic_chevron_down"} size={16} tint="var(--text)" />
      </button>
      {open && (
        <ul className="language-menu" role="listbox" aria-label="Language">
          {languages.map((l) => (
            <li key={l.id}>
              <button type="button" role="option" aria-selected={l.id === languageId}
                className={l.id === languageId ? "on" : ""}
                onClick={() => { setLanguage(l); setOpen(false); }}>{l.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleCard({ tone, icon, title, description, onClick }: {
  tone: "client" | "caregiver"; icon: string; title: string; description: string; onClick: () => void;
}) {
  return (
    <button type="button" className={`role-card role-card-${tone}`} onClick={onClick}>
      <span className="role-card-icon"><Icon name={icon} size={26} tint={tone === "client" ? "var(--primary)" : "var(--success-text)"} /></span>
      <span className="role-card-text">
        <b>{title}</b>
        {description && <span>{description}</span>}
      </span>
      <span className="role-card-go" aria-hidden="true"><Icon name="ic_chevron_forward" size={18} tint="#fff" className="flip-rtl" /></span>
    </button>
  );
}

export function IntroCard({ intro }: { intro: IntroModel }) {
  const { t } = intro.i18n;
  const trust: [string, string, string][] = [
    ["ic_check_circle", t("intro_personalized_matching", "Personalized Matching"), "var(--success)"],
    ["ic_lock", t("intro_secure_private", "Secure & Private"), "#5b3fa0"],
  ];
  return (
    <main className="auth-form auth-intro">
      <LanguagePicker intro={intro} />
      <div className="auth-intro-brand">
        <img src={assetUrl("logo")} alt="" width={96} height={96} />
        <b>Carezaar</b>
        <Icon name="ic_favorite_off" size={18} tint="var(--primary)" />
      </div>
      <h1 className="auth-divider-title">{t("intro_title", "How can we help you today?")}</h1>
      <div className="role-cards">
        <RoleCard tone="client" icon="ic_user" title={t("intro_client_title", "I need care")}
          description={t("intro_client_description", "") || "For myself, for a loved one, or for my organization"}
          onClick={() => intro.start("client")} />
        <RoleCard tone="caregiver" icon="ic_user" title={t("intro_caregiver_title", "I'm a caregiver")}
          description={t("intro_caregiver_description", "Find flexible jobs that fit your life")}
          onClick={() => intro.start("caregiver")} />
      </div>
      <ul className="trust-row">
        {trust.map(([icon, text, tint]) => (
          <li key={icon}><Icon name={icon} size={28} tint={tint} /><span>{text}</span></li>
        ))}
      </ul>
      <p className="auth-alt stacked">
        <span className="muted">{t("intro_have_account", "Already have an account?")}</span>
        <button type="button" className="link" onClick={intro.signIn}>
          {t("intro_sign_in", "Sign in")}
          <Icon name="ic_arrow_forward" size={16} tint="var(--primary)" className="flip-rtl" />
        </button>
      </p>
    </main>
  );
}

/* --------------------------------------------------------------- Sign in */

export function SignInCard({ form }: { form: SignInForm }) {
  const { t, languageId, translateEnglish } = form.i18n;
  const title = drawn(translateEnglish, "Sign In");
  return (
    <main className="auth-form">
      <CardTop onBack={form.goBack} />
      <h1>{title}</h1>
      {/* The content table has no key for this subtitle; like the frame, English only. */}
      {languageId === 1 && <p className="auth-sub">Sign in to continue to Carezaar.</p>}
      <form className="auth-fields" noValidate onSubmit={submitHandler(() => { if (form.canSubmit) void form.submit(); })}>
        <TextField label={t("signin_email", "Email Address")} required icon="ic_email" type="email"
          autoComplete="email" value={form.email} onChange={(e) => form.setEmail(e.target.value)}
          placeholder={t("signin_email_placeholder", "Enter your email address...")} />
        <TextField label={t("signin_password", "Password")} required icon="ic_lock" type="password"
          autoComplete="current-password" value={form.password} onChange={(e) => form.setPassword(e.target.value)}
          placeholder={t("signin_password_placeholder", "Enter your password...")} />
        <div className="auth-row-end">
          <button type="button" className="link" onClick={form.forgotPassword}>
            {t("signin_forgot_password", "Forgot Password")}
          </button>
        </div>
        <Button type="submit" trailingIcon="ic_arrow_forward" disabled={!form.canSubmit}>{title}</Button>
      </form>
      <p className="auth-alt">
        <span className="muted">{t("signin_donot_have_account", "Don't have an account yet?")}</span>
        <button type="button" className="link" onClick={form.signUp}>{t("signin_sign_up", "Sign Up")}</button>
      </p>
    </main>
  );
}

/* -------------------------------------------------------- Create account */

export function SignUpCard({ form }: { form: SignUpForm }) {
  const { t, languageId } = form.i18n;
  const mismatch = form.confirmation !== "" && form.confirmation !== form.password;
  return (
    <main className="auth-form">
      <CardTop onBack={form.goBack} logo />
      <h1>{t("signup_credentials_title", "Create Account")}</h1>
      <p className="auth-sub">{t("signup_credentials_description", "Setup your account credentials.")}</p>
      <form className="auth-fields" noValidate onSubmit={submitHandler(() => { if (form.valid) form.proceed(); })}>
        <TextField label={t("signup_credentials_email", "Email Address")} required icon="ic_email" type="email"
          autoComplete="email" value={form.email} onChange={(e) => form.setEmail(e.target.value)}
          placeholder={t("signup_credentials_email_placeholder", "Enter your email address...")} />
        <TextField label={t("signup_credentials_password", "Password")} required icon="ic_lock" type="password"
          autoComplete="new-password" value={form.password} onChange={(e) => form.setPassword(e.target.value)}
          placeholder={t("signup_credentials_password_placeholder", "Enter your password...")}
          error={form.error} />
        <div className="auth-rules">
          <RuleChips rules={form.rules} />
          {/* No content key exists for this hint; the chips carry the same rules. */}
          {languageId === 1 && <p className="muted small">Use 8 or more characters with a mix of letters, numbers &amp; symbols</p>}
        </div>
        <TextField label={t("signup_credentials_confirm_password", "Confirm Password")} required icon="ic_lock"
          type="password" autoComplete="new-password" value={form.confirmation}
          onChange={(e) => form.setConfirmation(e.target.value)}
          error={mismatch ? t("signup_credentials_password_match", "Passwords do not match.") : null}
          placeholder={t("signup_credentials_confirm_password_placeholder", "Confirm your password...")} />
        <Checkbox checked={form.accepted} onChange={form.setAccepted}>
          {t("signup_credentials_accept_label", "I accept the")}{" "}
          <button type="button" className="link" onClick={(e) => { e.preventDefault(); form.setLicenseOpen(true); }}>
            {t("signup_credentials_accept_license", "license agreement")}
          </button>
        </Checkbox>
        <Button type="submit" trailingIcon="ic_arrow_forward" disabled={!form.valid}>
          {t("signup_credentials_continue", "Continue")}
        </Button>
      </form>
      <Dialog open={form.confirming} onClose={() => form.setConfirming(false)} labelledBy="signup-confirm"
        title={t("signup_credentials_confirm_dialog_title", "Are You Sure?")}>
        <p>{t("signup_credentials_confirm_dialog_email_description", "Please review your email address below. It will be used to continue.")}</p>
        <div className="dialog-credentials">
          <span>{t("signup_credentials_email", "Email")}: <b dir="ltr">{form.email}</b></span>
        </div>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => form.setConfirming(false)}>
            {t("signup_credentials_confirm_dialog_deny_label", "Edit")}
          </Button>
          <Button onClick={() => void form.confirm()}>{t("signup_credentials_confirm_dialog_confirm_label", "Confirm")}</Button>
        </div>
      </Dialog>
    </main>
  );
}
