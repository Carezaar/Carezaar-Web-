/** The five password conditions the Android app renders as a live checklist on
 *  SignUpCredentials, SetupPassword and ChangePassword.
 *  Keys: `*_password_validation_8_letters | _1_lowercase | _1_uppercase | _1_number
 *  | _1_special_symbol` */
export interface PasswordRule {
  id: string;
  label: string;
  satisfied: boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

/** The only symbols that count as "special", exactly as on Android:
 *  ! @ # $ % ^ & * ( ) _ + [ ] { } | - ; : , . < > ?
 *  Anything else (`~`, `=`, `/`, `\`, quotes, spaces, accented letters, emoji…) is
 *  allowed in a password but does not satisfy this rule. Matched character by character
 *  against this list rather than through a regex class, so no symbol can be read as
 *  regex syntax. */
export const PASSWORD_SPECIAL_CHARACTERS = "!@#$%^&*()_+[]{}|-;:,.<>?";

/** Android tests each rule with Java's `Pattern.matches(".*[class].*")`. Java's `.` stops at
 *  line terminators, so a password containing one fails every character rule there. */
const JAVA_LINE_TERMINATORS = /[\n\r\u0085\u2028\u2029]/;

/** Whether some UTF-16 unit of the password passes `test`, the way Android's pattern does. */
function javaContains(password: string, test: (unit: string) => boolean): boolean {
  if (JAVA_LINE_TERMINATORS.test(password)) return false;
  for (let i = 0; i < password.length; i++) if (test(password[i])) return true;
  return false;
}

export function hasSpecialCharacter(password: string, set = PASSWORD_SPECIAL_CHARACTERS): boolean {
  return javaContains(password, (c) => set.includes(c));
}

/** In Android's order (its checklist and its error toasts): length, uppercase, lowercase,
 *  number, special. Length counts UTF-16 units (Kotlin `String.length`); letters and digits
 *  are ASCII only, as in Android's `[A-Z]`, `[a-z]` and `[0-9]`. */
export function passwordRules(password: string, special = PASSWORD_SPECIAL_CHARACTERS): PasswordRule[] {
  return [
    { id: "8_letters", label: "At least 8 characters", satisfied: password.length >= PASSWORD_MIN_LENGTH },
    { id: "1_uppercase", label: "At least 1 uppercase letter", satisfied: javaContains(password, (c) => c >= "A" && c <= "Z") },
    { id: "1_lowercase", label: "At least 1 lowercase letter", satisfied: javaContains(password, (c) => c >= "a" && c <= "z") },
    { id: "1_number", label: "At least 1 number", satisfied: javaContains(password, (c) => c >= "0" && c <= "9") },
    { id: "1_special_symbol", label: "At least 1 special symbol", satisfied: hasSpecialCharacter(password, special) },
  ];
}

/** The first rule the password doesn't meet, in Android's order, or null. */
export function firstUnmetPasswordRule(password: string): PasswordRule | null {
  return passwordRules(password).find((rule) => !rule.satisfied) ?? null;
}

export function isPasswordValid(password: string): boolean {
  return passwordRules(password).every((rule) => rule.satisfied);
}

/** Matches the Android copy: "Password is required" / "Confirm Password is required". */
export function required(value: string, field: string): string | null {
  return value.trim() === "" ? `${field} is required` : null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Email is required";
  // Deliberately permissive; the backend is authoritative and returns 422.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)
    ? null
    : "Please enter a valid email address";
}

/** "Passwords do not match." */
export function validateConfirmation(password: string, confirmation: string): string | null {
  if (confirmation === "") return "Confirm Password is required";
  return password === confirmation ? null : "Passwords do not match.";
}

/** The OTP is 5 digits ("Kindly enter the 5-digit OTP that we sent to your email."). */
export const OTP_LENGTH = 5;

/** Exactly five ASCII digits. */
export const isFiveDigitCode = (code: string) => /^[0-9]{5}$/.test(code);

/** Kotlin's `isBlank`: empty, or only characters Kotlin's `Char.isWhitespace` accepts — Java
 *  `isWhitespace` or `isSpaceChar`: space, line and paragraph separators (Zs, Zl, Zp, no-break
 *  spaces included), tab, line feed, vertical tab, form feed, carriage return and U+001C-U+001F. */
export const isBlank = (value: string) => [...value].every((c) => {
  const code = c.codePointAt(0)!;
  return /\p{Zs}|\p{Zl}|\p{Zp}/u.test(c) || (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x1f);
});

/** Set Up Password (reset) can be submitted, as on Android: a five-digit code and two
 *  nonblank, identical passwords. Password strength is the API's to judge. */
export const canSubmitPasswordReset = (code: string, password: string, confirmation: string) =>
  isFiveDigitCode(code) && !isBlank(password) && !isBlank(confirmation) && password === confirmation;

/** Change Password's confirmation, as on Android: all three fields nonblank and the new
 *  passwords identical. Password strength is the API's to judge. */
export const canSubmitPasswordChange = (current: string, next: string, confirmation: string) =>
  !isBlank(current) && !isBlank(next) && !isBlank(confirmation) && next === confirmation;

export interface SignUpFields { email: string; password: string; confirmation: string; accepted: boolean }
export interface SignUpErrors { email?: string; password?: string; confirmation?: string; accepted?: string }

/** Create Account's Continue, as on Android (parity review v4.0, C2 / iOS v3.0, C1):
 *  every field is checked at once and each problem is reported under its own field, in
 *  the managed texts: a missing entry, an invalid email, the first password rule not
 *  met (its checklist label), passwords that differ, or the agreement not ticked. */
export function signUpErrors(f: SignUpFields, t: (slug: string, fallback: string) => string): SignUpErrors {
  const required = t("general_required", "This field is required.");
  const email = f.email.trim();
  const unmet = firstUnmetPasswordRule(f.password);
  return {
    email: email === "" ? required
      : validateEmail(email) ? t("signup_credentials_email_invalid", "Please enter a valid email address.") : undefined,
    password: f.password === "" ? required
      : unmet ? t(`signup_credentials_password_validation_${unmet.id}`, unmet.label) : undefined,
    confirmation: f.confirmation === "" ? required
      : f.confirmation !== f.password ? t("signup_credentials_password_match", "Passwords do not match.") : undefined,
    accepted: f.accepted || email === "" || validateEmail(email) || unmet || f.confirmation === "" || f.confirmation !== f.password ? undefined : t("signup_credentials_accept_required", "Please accept the license agreement to continue."),
  };
}

/** Pay rates: digits only, at most 6, as on Android (parity review v4.0, F4). Anything
 *  else typed or pasted is dropped, never rounded. */
export const PAY_MAX_DIGITS = 6;
export function parsePay(value: string): number | null {
  const digits = value.replace(/\D/g, "").slice(0, PAY_MAX_DIGITS);
  return digits === "" ? null : Number(digits);
}
