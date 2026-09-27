import { GradientDefinition } from "./SourceGradient";
import { useId } from "react";
import type { DesignNode } from "../design/types";
import { rgba } from "../design/types";
export function SourceVector({ node: n }: { node: DesignNode }) {
  const gradient = n.fills.find((p) => p.stops?.length),
    gradientId = useId();
  const fill = gradient
      ? `url(#${gradientId})`
      : rgba(n.fills.find((p) => p.color)?.color),
    stroke = rgba(n.strokes.find((p) => p.color)?.color);
  const derived = n.fillPaths?.length || n.strokePaths?.length;
  if (n.kind === "line")
    return (
      <svg
        aria-hidden="true"
        width={n.width}
        height={1}
        style={{ overflow: "visible", display: "block" }}
      >
        <line
          x1={0}
          y1={0}
          x2={n.width}
          y2={0}
          strokeLinecap={n.strokeCap === "ROUND" ? "round" : "butt"}
          stroke={stroke}
          strokeWidth={n.strokeWidth}
        />
      </svg>
    );
  return (
    <svg
      aria-hidden="true"
      width={Math.max(1, n.width)}
      height={Math.max(1, n.height)}
      viewBox={`0 0 ${Math.max(1, derived ? n.width : n.pathWidth || n.width)} ${Math.max(1, derived ? n.height : n.pathHeight || n.height)}`}
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        {gradient && <GradientDefinition paint={gradient} id={gradientId} />}
      </defs>
      {derived ? (
        <>
          {n.fillPaths?.map((p, i) => (
            <path
              key={"f" + i}
              d={p.d}
              fill={fill}
              fillRule={p.rule === "ODD" ? "evenodd" : "nonzero"}
            />
          ))}
          {n.strokePaths?.map((p, i) => (
            <path
              key={"s" + i}
              d={p.d}
              fill={stroke}
              fillRule={p.rule === "ODD" ? "evenodd" : "nonzero"}
            />
          ))}
        </>
      ) : (
        <path
          d={n.path}
          fill={fill}
          stroke={stroke}
          strokeWidth={n.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
