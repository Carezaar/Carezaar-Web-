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

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: "8_letters", label: "At least 8 characters", satisfied: password.length >= PASSWORD_MIN_LENGTH },
    { id: "1_lowercase", label: "At least 1 lowercase letter", satisfied: /[a-z]/.test(password) },
    { id: "1_uppercase", label: "At least 1 uppercase letter", satisfied: /[A-Z]/.test(password) },
    { id: "1_number", label: "At least 1 number", satisfied: /[0-9]/.test(password) },
    {
      id: "1_special_symbol",
      label: "At least 1 special symbol",
      satisfied: /[^A-Za-z0-9\s]/.test(password),
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
