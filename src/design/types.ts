export type RGBA = [number, number, number, number];
export interface Paint {
  type: string;
  color?: RGBA;
  asset?: string;
  mode?: string;
  opacity?: number;
  stops?: { position: number; color: RGBA }[];
  transform?: Record<string, number>;
}
export interface SourceLine {
  position: { x: number; y: number };
  firstCharacter: number;
  endCharacter: number;
  lineHeight: number;
  lineY: number;
  /** Measured width of the line in the source frame. */
  width?: number;
}
export interface DesignNode {
  id: string;
  key?: string;
  name: string;
  kind: string;
  width: number;
  height: number;
  x: number;
  y: number;
  matrix: number[];
  opacity: number;
  clip: boolean;
  radius: number;
  corners?: number[];
  strokeDashes?: number[];
  textTruncation?: string;
  textCase?: string;
  actionTarget?: string;
  stateTarget?: string;
  inputType?: string;
  inputValue?: string;
  selectionGroup?: string;
  strokeAlign?: string;
  strokeCap?: string;
  fills: Paint[];
  strokes: Paint[];
  strokeWidth: number;
  children: DesignNode[];
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lines?: SourceLine[];
  lineHeight?: { value: number; units: string };
  letterSpacing?: { value: number; units: string };
  path?: string;
  pathWidth?: number;
  pathHeight?: number;
  glyphPaths?: { d: string; rule: string; color?: RGBA }[];
  fillPaths?: { d: string; rule: string }[];
  strokePaths?: { d: string; rule: string }[];
  effects: {
    type: string;
    radius: number;
    offset: { x: number; y: number };
    spread: number;
    color: RGBA;
  }[];
}
export const rgba = (c?: RGBA) =>
  c ? `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})` : "transparent";
