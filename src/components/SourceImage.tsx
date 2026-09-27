import type { CSSProperties } from "react";
import type { DesignNode, Paint } from "../design/types";
/** Figma crop matrices map frame-normalized coordinates into the source image. */
export function SourceImage({
  node,
  paint,
}: {
  node: DesignNode;
  paint: Paint;
}) {
  const t = paint.transform;
  let style: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: paint.mode === "FIT" ? "contain" : "cover",
    opacity: paint.opacity ?? 1,
  };
  if (t && (paint.mode === "STRETCH" || paint.mode === "CROP")) {
    const determinant = t.m00 * t.m11 - t.m01 * t.m10;
    if (Math.abs(determinant) > 0.000001) {
      const a = t.m11 / determinant,
        b = -t.m10 / determinant,
        c = -t.m01 / determinant,
        d = t.m00 / determinant,
        e = (t.m01 * t.m12 - t.m11 * t.m02) / determinant,
        f = (t.m10 * t.m02 - t.m00 * t.m12) / determinant;
      style = {
        ...style,
        objectFit: "fill",
        transformOrigin: "0 0",
        transform: `matrix(${a},${(b * node.height) / node.width},${(c * node.width) / node.height},${d},${e * node.width},${f * node.height})`,
      };
    }
  }
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        borderRadius: "inherit",
        pointerEvents: "none",
      }}
    >
      <img alt="" src={`/assets/${paint.asset}`} style={style} />
    </span>
  );
}
