import { tokens } from "../design/tokens";
import { SourceBorder } from "./SourceBorder";
import { SourceGradient } from "./SourceGradient";
import { useState, type CSSProperties } from "react";
import { useSceneBinder } from "../figma/binder";
import { rgba, type DesignNode } from "../design/types";
import { SourceText, measureText } from "./SourceText";
import { SourceVector } from "./SourceVector";
import { SourceImage } from "./SourceImage";
function accessibleLabel(n: DesignNode, translate?: (n: DesignNode) => string | undefined): string {
  return (n.text !== undefined ? translate?.(n) ?? n.text : "")
    || n.children.map((c) => accessibleLabel(c, translate)).filter(Boolean).join(" ");
}

/** A required-field "*" is drawn as its own node just after the English label.
 *  When the label is translated to something longer or shorter, keep the marker
 *  3px after the label's rendered text instead of at its English position. */
/** Figma layer order is not reading order (a frame may list Password before Email),
 *  and DOM order decides Tab order and what screen readers read first. Siblings are
 *  moved into top-to-bottom, left-to-right order, but two siblings swap only when
 *  their boxes don't overlap, so anything drawn on top of something else keeps its
 *  stacking order. */
function readingOrder(children: DesignNode[]): DesignNode[] {
  const out = children.slice();
  const overlaps = (a: DesignNode, b: DesignNode) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const before = (a: DesignNode, b: DesignNode) => (Math.abs(a.y - b.y) > 4 ? a.y < b.y : a.x < b.x);
  for (let pass = 0, swapped = true; swapped && pass < out.length; pass++) {
    swapped = false;
    for (let i = 0; i + 1 < out.length; i++) {
      if (before(out[i + 1], out[i]) && !overlaps(out[i], out[i + 1])) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
        swapped = true;
      }
    }
  }
  return out;
}

function placeMarkers(children: DesignNode[], translate?: (n: DesignNode) => string | undefined): DesignNode[] {
  return children.map((c) => {
    // A button's trailing arrow follows its (translated) label the same way.
    if (/trailing icon/i.test(c.name)) {
      const label = children.find((o) => o !== c && o.text && o.x < c.x);
      if (!label) return c;
      const shownText = translate?.(label) ?? label.text ?? "";
      if (shownText === label.text) return c;
      const gap = c.x - (label.x + label.width);
      const width = measureText(shownText, label.fontWeight ?? 400, label.fontSize ?? 14, label.fontFamily ?? "Vazirmatn");
      return { ...c, x: label.x + Math.max(label.width, width) + gap };
    }
    if (c.text?.trim() !== "*") return c;
    const label = children.find((o) => o !== c && o.text && o.text.trim() !== "*"
      && Math.abs(o.y - c.y) < 12 && o.x < c.x);
    if (!label) return c;
    const shownText = translate?.(label) ?? label.text ?? "";
    if (shownText === label.text) return c;
    const width = measureText(shownText, label.fontWeight ?? 400, label.fontSize ?? 14, label.fontFamily ?? "Vazirmatn");
    // The marker's box may span the rest of the row; shrink it to the glyph so it
    // mirrors next to the label in RTL.
    const own = measureText("*", c.fontWeight ?? 400, c.fontSize ?? 14, c.fontFamily ?? "Vazirmatn") + 2;
    return { ...c, x: label.x + width + 3, width: own };
  });
}

/** Glyphs that point along the reading direction; RTL mirrors their drawing, not
 *  just their position. */
const DIRECTIONAL = /chevron|angle-(left|right)|arrow-(left|right)|trailing icon/i;
function surface(n: DesignNode): CSSProperties {
  return {
    backgroundColor: rgba(
      n.fills.filter((p) => p.type === "solid").at(-1)?.color,
    ),
    borderRadius:
      n.kind === "ellipse"
        ? "50%"
        : n.corners?.map((v) => `${v}px`).join(" ") || n.radius,
    boxShadow:
      n.effects
        .filter((e) => e.type.includes("SHADOW"))
        .map(
          (e) =>
            `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread}px ${rgba(e.color)}`,
        )
        .join(",") || undefined,
  };
}
export function DesignElement({
  node: n,
  path = "",
  insideButton = false,
  parentWidth,
  noMirror = false,
}: {
  node: DesignNode;
  path?: string;
  insideButton?: boolean;
  /** Needed to mirror `x` when the bound screen is right-to-left. */
  parentWidth?: number;
  /** Inside a logo: brand marks keep their composition in RTL. */
  noMirror?: boolean;
}) {
  const binder = useSceneBinder();
  const [localValue, setLocalValue] = useState(n.inputValue ?? "");
  // The screen's binder owns bound inputs and selection; an unbound input keeps its own value.
  const bound = n.inputType ? binder?.binding?.(n) : undefined;
  const value = bound ? bound.value : localValue;
  const setValue = bound ? bound.onChange : setLocalValue;
  const selected = binder?.isSelected?.(n) ?? false;
  if (binder?.isHidden?.(n)) return null;
  const override = n.text !== undefined ? binder?.text?.(n) : undefined;
  let shown: DesignNode = !n.inputType && override !== undefined && override !== n.text
    ? { ...n, text: override, textSubstituted: true } as DesignNode : n;
  // Translated copy is usually longer than the English the box was drawn for. A
  // one-line label may grow into the free space towards the far edge of its parent
  // before it has to shrink.
  let widened = 0;
  if (shown !== n && parentWidth !== undefined && (n.fontSize ?? 14) * 2.2 > n.height) {
    const need = measureText(shown.text ?? "", n.fontWeight ?? 400, n.fontSize ?? 14, n.fontFamily ?? "Vazirmatn") + 2;
    const room = parentWidth - n.x - 4;
    if (need > n.width && room > n.width) {
      widened = Math.min(need, room) - n.width;
      shown = { ...shown, width: n.width + widened };
    }
  }
  const placeholderText = n.inputType ? (override ?? n.text) : n.text;
  const enabled = binder?.isEnabled?.(n) ?? true;
  const isText = n.text !== undefined,
    vector = n.kind === "vector" || n.kind === "line";
  const placeholder = isText && Boolean(n.inputType);
  const button =
    !insideButton &&
    (Boolean(n.actionTarget || n.stateTarget) ||
      n.name === "Button" ||
      n.name === "Back" ||
      n.name === "Care Needer" ||
      n.name === "Caregiver");
  const selectable =
    !insideButton &&
    (Boolean(n.selectionGroup) || /^Care Type|^Option|^Checkbox/.test(n.name));
  const mirrored = binder?.rtl && parentWidth !== undefined && !noMirror;
  const insideLogo = noMirror || /logo/i.test(n.name);
  const style: CSSProperties = {
    position: "absolute",
    left: mirrored ? parentWidth - n.x - n.width - widened - (binder?.offsetX?.(n) ?? 0) : n.x + (binder?.offsetX?.(n) ?? 0),
    top: n.y + (binder?.offsetY?.(n) ?? 0),
    width: n.width + widened,
    height: n.height,
    opacity: binder?.opacity?.(n) ?? n.opacity,
    transform: `matrix(${n.matrix.join(",")},0,0)`,
    transformOrigin: "0 0",
    overflow: n.clip && n.width > 1 && n.height > 1 ? "hidden" : undefined,
    ...(!isText && !vector ? surface(n) : {}),
    ...(selected ? { outline: `2px solid ${tokens.color.primary}` } : {}),
  };
  const content = isText ? (
    placeholder ? (
      n.inputType === "multiline" ? (
        <textarea
          className="design-input"
          aria-label={placeholderText}
          dir="auto"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholderText}
          style={{
            fontSize: n.fontSize,
            fontWeight: n.fontWeight,
            fontFamily: `"${n.fontFamily}", system-ui, sans-serif`,
            lineHeight: 1.4,
            // The frame's text node is the placeholder; typed text uses the text colour.
            ["--placeholder" as string]: rgba(n.fills.find((p) => p.color)?.color),
          }}
        />
      ) : (
        <input
          className="design-input"
          aria-label={placeholderText}
          dir={n.inputType === "email" || n.inputType === "password" ? "ltr" : "auto"}
          type={binder?.inputType?.(n) ?? (n.inputType === "select" ? "text" : n.inputType || "text")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholderText}
          style={{
            textTransform: n.textCase === "TITLE" ? "capitalize" : undefined,
            fontFamily: `"${n.fontFamily}", system-ui, sans-serif`,
            fontSize: n.fontSize,
            fontWeight: n.fontWeight,
            ["--placeholder" as string]: rgba(n.fills.find((p) => p.color)?.color),
          }}
        />
      )
    ) : (
      <SourceText node={shown} />
    )
  ) : vector ? (
    <SourceVector node={n} />
  ) : (
    <>
      {n.fills
        .filter((p) => p.stops?.length)
        .map((p, i) => (
          <SourceGradient key={"gradient" + i} paint={p} />
        ))}
      {n.fills
        .filter((p) => p.type === "image" && p.asset)
        .map((p, i) => (
          <SourceImage key={"image" + i} node={n} paint={p} />
        ))}
      <SourceBorder node={n} />
      {readingOrder(placeMarkers(n.children, binder?.text)).map((c, i) => (
        <DesignElement
          key={`${path}/${c.id}/${i}`}
          path={`${path}/${n.id}`}
          node={c}
          insideButton={insideButton || button || selectable}
          parentWidth={n.width}
          noMirror={insideLogo}
        />
      ))}
    </>
  );
  const body = mirrored && DIRECTIONAL.test(n.name)
    ? <div style={{ position: "absolute", inset: 0, transform: "scaleX(-1)" }}>{content}</div>
    : content;
  if (button || selectable)
    return (
      <button
        className="design-node"
        data-source={n.id}
        aria-label={accessibleLabel(n, binder?.text) || n.name}
        aria-pressed={selectable ? selected : undefined}
        style={style}
        disabled={!enabled}
        onClick={(e) => {
          e.stopPropagation();
          binder?.handle?.(n);
        }}
      >
        {body}
      </button>
    );
  return (
    <div className="design-node" data-source={n.id} style={style}>
      {body}
    </div>
  );
}
