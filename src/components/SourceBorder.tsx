import { rgba, type DesignNode } from "../design/types";
/** Draw strokes above image paints so photographs cannot obscure the border. */
export function SourceBorder({ node: n }: { node: DesignNode }) {
  if (!n.strokes.length || !n.strokeWidth) return null;
  const offset =
    n.strokeAlign === "OUTSIDE"
      ? -n.strokeWidth
      : n.strokeAlign === "CENTER"
        ? -n.strokeWidth / 2
        : 0;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: offset,
        borderRadius: n.kind === "ellipse" ? "50%" : "inherit",
        pointerEvents: "none",
        border: `${n.strokeWidth}px ${n.strokeDashes?.length ? "dashed" : "solid"} ${rgba(n.strokes.find((p) => p.color)?.color)}`,
        boxSizing: "border-box",
      }}
    />
  );
}
