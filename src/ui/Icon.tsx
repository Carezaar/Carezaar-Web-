import type { CSSProperties } from "react";

const RASTERS = new Set([
  "bg_matches", "bg_messages", "bg_profile", "bg_splash", "logo",
  // Supplied by the client (2026-10-17) for the Messages tab (parity review v4.0, M1).
  "header_messages",
]);

/** Artwork the product does not show. These names still arrive from the server's
 *  reference lists (e.g. a care type's `icon`), so they render nothing rather than a
 *  broken image. */
export const OMITTED_ASSETS = new Set([
  "bg_intro", "client_adult", "client_child", "client_pregnancy", "client_senior",
  "header_adult", "header_child", "header_pregnancy", "header_senior",
  "ic_caregiver", "ic_client", "ic_condition_assessment", "ic_condition_babysitting_nanny",
  "ic_condition_companionship", "ic_condition_feeding", "ic_condition_overnight_care",
  "ic_condition_personal_care", "ic_condition_wound", "ic_shift_afternoon", "ic_shift_evening",
  "ic_shift_morning", "ic_special_calm", "ic_special_compassionate", "ic_special_culturally_aware",
  "ic_special_driver", "ic_special_good_communicator", "ic_special_pet_friendly",
  "ic_special_respectful", "ic_support",
]);

/** Figma scene images (by file name under /assets) the product shows differently: a
 *  replacement image, or nothing. */
export const SCENE_IMAGE_REPLACEMENTS: Record<string, string> = {
  "92bf103484e337567f379617f79c6c37ba10484d.jpg": "intro-room.jpg",
};
export const OMITTED_SCENE_IMAGES = new Set([
  "2c0c41de4775bed358fedceb4f03ba6bd2b76913.png",
  "80e754df1acd580e680f27c317c16f17a8ffb0eb.png", "b8a5332565873bf014bb9feaf8faef4b797407fe.png",
]);

/** URL of a product asset extracted from the Android APK, by its drawable name. */
export function assetUrl(name: string): string {
  return `/app-assets/${name}.${RASTERS.has(name) ? "webp" : "svg"}`;
}

/** Android tints its monochrome vectors at runtime. With `tint`, the SVG is used as
 *  a CSS mask so it takes that colour; without it, multi-colour art (flags,
 *  illustrations) renders as authored. */
export function Icon({
  name, size = 24, tint, className, style, label,
}: {
  name: string | null | undefined;
  size?: number;
  tint?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; omitted icons are decorative. */
  label?: string;
}) {
  if (!name || OMITTED_ASSETS.has(name)) return null;
  const url = assetUrl(name);
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  if (tint) {
    return (
      <span
        {...a11y}
        className={`icon ${className ?? ""}`}
        style={{
          width: size, height: size, backgroundColor: tint,
          WebkitMask: `url(${url}) center / contain no-repeat`,
          mask: `url(${url}) center / contain no-repeat`,
          ...style,
        }}
      />
    );
  }
  return (
    <img
      src={url} alt={label ?? ""} width={size} height={size}
      className={`icon ${className ?? ""}`} style={{ objectFit: "contain", ...style }}
      {...(label ? {} : { "aria-hidden": true })}
    />
  );
}
