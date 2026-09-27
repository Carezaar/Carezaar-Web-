import type { CSSProperties } from "react";
import type { DesignNode } from "../design/types";
import { rgba } from "../design/types";
let canvas: HTMLCanvasElement | null = null;
export function measureText(text: string, weight: number, size: number, family: string): number {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${weight} ${size}px '${family}', sans-serif`;
  return ctx.measureText(text).width;
}

/** Preserves source baselines without converting readable text to outlines. */
export function SourceText({ node }: { node: DesignNode }) {
  const size = node.fontSize ?? 14;
  const lines = node.lines?.filter(
    (l) => node.textTruncation !== "ENDING" || l.position.y <= node.height,
  );
  // Substituted copy (translation, validation) cannot reuse the glyph outlines or
  // line ranges measured for the original string, so it renders as plain text.
  const substituted = (node as DesignNode & { textSubstituted?: boolean }).textSubstituted;
  if (substituted) {
    // Translations are usually longer than the English the box was measured for:
    // shrink to fit the designed width (down to 70%) rather than clipping.
    const measured = measureText(node.text ?? "", node.fontWeight ?? 400, size, node.fontFamily ?? "Vazirmatn");
    // A box designed for one line (links, buttons, labels) must stay on one line;
    // wrapping would push the second line outside the clip.
    const singleLine = node.height < size * 2.2;
    const floor = singleLine ? 0.55 : 0.7;
    const fitted = measured > node.width ? Math.max(size * floor, (size * node.width) / measured) : size;
    // The frame records alignment only through where each measured line sits; keep
    // centred copy centred when the text changes.
    const centred = Boolean(node.lines?.length)
      && node.lines!.every((l) => l.width !== undefined && Math.abs(l.position.x - (node.width - l.width - l.position.x)) < 3)
      && node.lines!.some((l) => l.position.x > 4);
    return (
      <span className="source-text substituted" dir="auto" style={{
        ...(centred ? { display: "block", width: "100%", textAlign: "center" as const } : { textAlign: "start" as const }),
        fontFamily: `'${node.fontFamily}', system-ui, sans-serif`, fontWeight: node.fontWeight,
        fontSize: fitted, color: rgba(node.fills.find((p) => p.color)?.color),
        whiteSpace: singleLine || fitted > size * floor ? "nowrap" : "normal", lineHeight: 1.25,
        overflowWrap: "anywhere",
      }}>{node.text}</span>
    );
  }
  if (node.glyphPaths?.length)
    return (
      <span>
        <span className="sr-only">{node.text}</span>
        <svg
          aria-hidden="true"
          width={node.width}
          height={node.height}
          style={{ overflow: "visible" }}
        >
          {node.glyphPaths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill={rgba(p.color ?? node.fills.find((p) => p.color)?.color)}
              fillRule="nonzero"
            />
          ))}
        </svg>
      </span>
    );
  const style: CSSProperties = {
    textTransform:
      node.textCase === "TITLE"
        ? "capitalize"
        : node.textCase === "UPPER"
          ? "uppercase"
          : undefined,
    fontFamily: `'${node.fontFamily}', system-ui, sans-serif`,
    fontWeight: node.fontWeight,
    fontSize: size,
    color: rgba(node.fills.find((p) => p.color)?.color),
    letterSpacing:
      node.letterSpacing?.units === "PERCENT"
        ? (size * node.letterSpacing.value) / 100
        : node.letterSpacing?.value,
  };
  return (
    <span style={style} className="source-text">
      {lines?.length
        ? lines.map((l, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: l.position.x,
                top:
                  l.position.y -
                  size *
                    (node.fontFamily === "Arial" ? 1.1279296875 : 1.025390625),
                whiteSpace: "pre",
                lineHeight: 1.5625,
                width:
                  node.textTruncation === "ENDING"
                    ? node.width - l.position.x
                    : undefined,
                overflow:
                  node.textTruncation === "ENDING" ? "hidden" : undefined,
                textOverflow: "ellipsis",
              }}
            >
              {Array.from(node.text ?? "")
                .slice(
                  l.firstCharacter,
                  node.textTruncation === "ENDING" && i === lines.length - 1
                    ? undefined
                    : l.endCharacter,
                )
                .join("")
                .replace(/[\n\r\u2028\u2029]$/, "")}
            </span>
          ))
        : node.text}
    </span>
  );
}
