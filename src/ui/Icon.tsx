import type { CSSProperties } from "react";

const RASTERS = new Set([
  "bg_intro", "bg_matches", "bg_messages", "bg_profile", "bg_splash",
  "client_adult", "client_child", "client_pregnancy", "client_senior",
  "header_adult", "header_child", "header_pregnancy", "header_senior", "logo",
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
