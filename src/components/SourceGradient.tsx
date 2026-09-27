import { useId } from "react";
import { rgba, type Paint } from "../design/types";
export function gradientMatrix(paint: Paint) {
  const t = paint.transform;
  if (!t) return undefined;
  const det = t.m00 * t.m11 - t.m01 * t.m10;
  if (Math.abs(det) < 1e-9) return undefined;
  return `matrix(${t.m11 / det} ${-t.m10 / det} ${-t.m01 / det} ${t.m00 / det} ${(t.m01 * t.m12 - t.m11 * t.m02) / det} ${(t.m10 * t.m02 - t.m00 * t.m12) / det})`;
}
export function GradientDefinition({
  paint,
  id,
}: {
  paint: Paint;
  id: string;
}) {
  return (
    <linearGradient
      id={id}
      x1="0"
      y1="0.5"
      x2="1"
      y2="0.5"
      gradientTransform={gradientMatrix(paint)}
    >
      {paint.stops?.map((s, i) => (
        <stop key={i} offset={s.position} stopColor={rgba(s.color)} />
      ))}
    </linearGradient>
  );
}
export function SourceGradient({ paint }: { paint: Paint }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <defs>
        <GradientDefinition paint={paint} id={id} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
