import { createContext, useContext } from "react";
import type { DesignNode } from "../design/types";

/** Binds live state onto a rendered Figma scene, mirroring the iOS `SceneBinder`.
 *
 *  The scene JSON stays the visual source of truth; the binder supplies values for
 *  its input nodes, handles taps on its action nodes, and substitutes copy
 *  (translations, validation messages) into designed text slots. */
export interface SceneBinder {
  binding?: (node: DesignNode) => { value: string; onChange: (v: string) => void } | undefined;
  /** Return true when handled; otherwise the tap is ignored. */
  handle?: (node: DesignNode) => boolean;
  text?: (node: DesignNode) => string | undefined;
  isHidden?: (node: DesignNode) => boolean;
  opacity?: (node: DesignNode) => number | undefined;
  isEnabled?: (node: DesignNode) => boolean;
  isSelected?: (node: DesignNode) => boolean | undefined;
  /** Overrides an input node's type, e.g. "text" while a password is revealed. */
  inputType?: (node: DesignNode) => string | undefined;
  /** Mirror the frame's absolute layout for right-to-left languages, as iOS does. */
  rtl?: boolean;
}

export const SceneBinderContext = createContext<SceneBinder | null>(null);
export const useSceneBinder = () => useContext(SceneBinderContext);

/** Lower-cased name + text: how scenes identify their controls. */
export function semanticLabel(n: DesignNode): string {
  const collect = (x: DesignNode): string[] => [x.text ?? "", ...x.children.flatMap(collect)];
  return `${n.name} ${collect(n).join(" ")}`.toLowerCase();
}
