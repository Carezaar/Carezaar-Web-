import type { CSSProperties } from "react";

const RASTERS = new Set([
  "bg_intro", "bg_matches", "bg_messages", "bg_profile", "bg_splash", "logo",
  "client_adult", "client_child", "client_pregnancy", "client_senior",
  "header_adult", "header_child", "header_pregnancy", "header_senior",
  // Supplied by the client (2026-10-17) for the Messages tab (parity review v4.0, M1).
  "header_messages",
]);

/** Scene images mapped to the corresponding Android product images. */
export const SCENE_IMAGE_REPLACEMENTS: Record<string, string> = {
  "92bf103484e337567f379617f79c6c37ba10484d.jpg": "welcome-hands.jpg",
  "2c0c41de4775bed358fedceb4f03ba6bd2b76913.png": "care-type-senior.png",
  "80e754df1acd580e680f27c317c16f17a8ffb0eb.png": "care-type-child.png",
  "b8a5332565873bf014bb9feaf8faef4b797407fe.png": "care-type-pregnancy.png",
};

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
  if (!name) return null;
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
