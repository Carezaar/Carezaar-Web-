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

export function hasSpecialCharacter(password: string): boolean {
  return [...password].some((c) => PASSWORD_SPECIAL_CHARACTERS.includes(c));
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: "8_letters", label: "At least 8 characters", satisfied: password.length >= PASSWORD_MIN_LENGTH },
    { id: "1_lowercase", label: "At least 1 lowercase letter", satisfied: /[a-z]/.test(password) },
    { id: "1_uppercase", label: "At least 1 uppercase letter", satisfied: /[A-Z]/.test(password) },
    { id: "1_number", label: "At least 1 number", satisfied: /[0-9]/.test(password) },
    {
      id: "1_special_symbol",
      label: "At least 1 special symbol",
      satisfied: hasSpecialCharacter(password),
    },
  ];
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

export interface SignUpFields { email: string; password: string; confirmation: string; accepted: boolean }
export interface SignUpErrors { email?: string; password?: string; confirmation?: string; accepted?: string }

/** Create Account's Continue, as on Android (parity review v4.0, C2 / iOS v3.0, C1):
 *  every field is checked at once and each problem is reported under its own field, in
 *  the managed texts: a missing entry, an invalid email, the first password rule not
 *  met (its checklist label), passwords that differ, or the agreement not ticked. */
export function signUpErrors(f: SignUpFields, t: (slug: string, fallback: string) => string): SignUpErrors {
  const required = t("general_required", "This field is required.");
  const email = f.email.trim();
  const unmet = passwordRules(f.password).find((r) => !r.satisfied);
  return {
    email: email === "" ? required
      : validateEmail(email) ? t("signup_credentials_email_invalid", "Please enter a valid email address.") : undefined,
    password: f.password === "" ? required
      : unmet ? t(`signup_credentials_password_validation_${unmet.id}`, unmet.label) : undefined,
    confirmation: f.confirmation === "" ? required
      : f.confirmation !== f.password ? t("signup_credentials_password_match", "Passwords do not match.") : undefined,
    accepted: f.accepted ? undefined : t("signup_credentials_accept_required", "Please accept the license agreement to continue."),
  };
}

/** Pay rates: digits only, at most 6, as on Android (parity review v4.0, F4). Anything
 *  else typed or pasted is dropped, never rounded. */
export const PAY_MAX_DIGITS = 6;
export function parsePay(value: string): number | null {
  const digits = value.replace(/\D/g, "").slice(0, PAY_MAX_DIGITS);
  return digits === "" ? null : Number(digits);
}
