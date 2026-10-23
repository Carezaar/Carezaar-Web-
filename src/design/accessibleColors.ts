import type { DesignNode, RGBA } from "./types";

// Same output as `rgba` in ./types (kept local so this module loads without a bundler).
const rgba = (c?: RGBA) => (c ? `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})` : "transparent");

/* Accessible renderings of the v2 frames' colours (WCAG 2.2 AA). The frames keep their
 * design values; these are applied where they are drawn. */

/** The frames' mid greys (#7F7F7F–#A3A3A3) are 2.6–4.0:1 on white, below WCAG AA for
 *  body text; they render as the app's secondary text grey (#666, 5.7:1). The frames'
 *  error red #FF0000 (required "*", field errors; 4.0:1) and success green #01BB8A
 *  ("Edit" in the email review; 2.5:1) render as the app's --error (#C81E2A, 5.7:1) and
 *  --success-text (#017A5A, 5.3:1). */
export function textColor(c?: RGBA): string {
  if (c && Math.abs(c[0] - c[1]) < 0.01 && Math.abs(c[1] - c[2]) < 0.01 && c[0] > 0.45 && c[0] < 0.66 && c[3] > 0.9) return "#666666";
  const is = (hex: number) => c !== undefined && c[3] > 0.9
    && [hex >> 16 & 255, hex >> 8 & 255, hex & 255].every((v, i) => Math.abs(c[i] * 255 - v) < 2);
  if (is(0xff0000)) return "#c81e2a";
  if (is(0x01bb8a)) return "#017a5a";
  return rgba(c);
}

/** A text field's outline must reach 3:1 against the page (WCAG 1.4.11). The frames draw it
 *  #CFCFCF (1.5:1 on white); it renders in the app's --field-border (#80868F, 3.7:1). A field
 *  outline is a #CFCFCF-stroked shape that encloses a text input — one of the frame's own or a
 *  real input overlaid on it (`extraFields`, scene coordinates). Other #CFCFCF strokes
 *  (dividers, password-rule chips) are decorative and keep the frame colour. */
type Box = { x: number; y: number; w: number; h: number };
const FIELD_BORDER: RGBA = [0x80 / 255, 0x86 / 255, 0x8f / 255, 1];
const isFieldGrey = (c?: RGBA) => !!c && c.slice(0, 3).every((v) => Math.abs(v * 255 - 0xcf) < 2);
export function withFieldOutlines(root: DesignNode, extraFields: Box[] = []): DesignNode {
  const inputs: Box[] = [...extraFields];
  const collect = (n: DesignNode, ox: number, oy: number) => {
    if (n.inputType) inputs.push({ x: ox, y: oy, w: n.width, h: n.height });
    n.children.forEach((c) => collect(c, ox + c.x, oy + c.y));
  };
  collect(root, 0, 0);
  if (!inputs.length) return root;
  const encloses = (x: number, y: number, n: DesignNode) => inputs.some((i) =>
    i.x >= x - 2 && i.y >= y - 2 && i.x + i.w <= x + n.width + 2 && i.y + i.h <= y + n.height + 2);
  const map = (n: DesignNode, ox: number, oy: number): DesignNode => {
    const outlined = n.strokes.some((p) => isFieldGrey(p.color)) && encloses(ox, oy, n);
    return {
      ...n,
      strokes: outlined ? n.strokes.map((p) => (isFieldGrey(p.color) ? { ...p, color: FIELD_BORDER } : p)) : n.strokes,
      children: n.children.map((c) => map(c, ox + c.x, oy + c.y)),
    };
  };
  return map(root, 0, 0);
}

