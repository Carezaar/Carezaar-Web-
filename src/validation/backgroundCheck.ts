/** Background Check rules, taken from the Android app's submit handler: first name,
 *  last name, street and state are required, and date of birth, SSN and ZIP must be
 *  present and match these patterns (tested on the value as typed, as Android does).
 *  Middle name is optional. Nothing is sent while any rule fails. */
export const DATE_PATTERN = /^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/; // MM/DD/YYYY, the format sent to the server
export const SSN_PATTERN = /^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$/; // 123-45-6789 or 123456789
export const ZIP_PATTERN = /^[0-9]{5}(?:-[0-9]{4})?$/; // 12345 or 12345-6789

export interface BackgroundCheckForm {
  first: string;
  middle: string;
  last: string;
  /** From a date input: YYYY-MM-DD, or "" while incomplete. */
  dob: string;
  ssn: string;
  street: string;
  zip: string;
  state: string;
}

export type BackgroundCheckProblem = "required" | "format";

/** The date input's YYYY-MM-DD as the server's MM/DD/YYYY; anything else unchanged. */
export function toServerDate(isoDate: string): string {
  return isoDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1");
}

export function backgroundCheckProblems(form: BackgroundCheckForm): Partial<Record<keyof BackgroundCheckForm, BackgroundCheckProblem>> {
  const problems: Partial<Record<keyof BackgroundCheckForm, BackgroundCheckProblem>> = {};
  const blank = (v: string) => v.trim() === "";
  for (const field of ["first", "last", "street", "state"] as const) if (blank(form[field])) problems[field] = "required";
  const formatted: [keyof BackgroundCheckForm, string, RegExp][] = [
    ["dob", toServerDate(form.dob), DATE_PATTERN],
    ["ssn", form.ssn, SSN_PATTERN],
    ["zip", form.zip, ZIP_PATTERN],
  ];
  for (const [field, value, pattern] of formatted) {
    if (blank(value)) problems[field] = "required";
    else if (!pattern.test(value)) problems[field] = "format";
  }
  return problems;
}
