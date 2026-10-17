import type { User } from "../api/types";

type Named = Pick<User, "first_name" | "last_name"> & { is_deleted?: boolean };

/** Someone who deleted their account (parity review v4.0, K3). */
export const isDeletedAccount = (user: Named | null | undefined): boolean => user?.is_deleted === true;

/** Another person's name as shown in lists, notifications and conversations: "Deleted
 *  Account" (managed text) for someone who deleted their account, as on Android. */
export function personName(user: Named | null | undefined, t: (slug: string, fallback?: string) => string): string {
  if (!user) return "";
  if (isDeletedAccount(user)) return t("general_deleted_account", "Deleted Account");
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
}
