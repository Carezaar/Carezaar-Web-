import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DesignElement } from "../components/DesignElement";
import type { DesignNode } from "../design/types";
import { useI18n } from "../app/i18n";
import { SceneBinderContext, type SceneBinder } from "./binder";
import { Spinner, ErrorState } from "../ui/kit";

/** Renders an extracted v2 Figma scene at its designed geometry, scaled to the app
 *  column, with live state supplied by `binder`. English copy baked into the scene
 *  is translated through the server-driven content table. */
/** A real control placed in scene coordinates, for behaviour the Kotlin app has but
 *  the frame has no node for (e.g. "Forgot Password", the license checkbox). It
 *  scales with the design so it stays aligned at every width. */
export interface SceneOverlay {
  x: number; y: number; width: number; height: number; content: ReactNode;
}

export function FigmaScreen({ sceneKey, binder, overlays = [], children }: {
  sceneKey: string; binder: SceneBinder; overlays?: SceneOverlay[]; children?: ReactNode;
}) {
  const { translateEnglish, isRtl } = useI18n();
  const [node, setNode] = useState<DesignNode | null>(null);
  const [error, setError] = useState("");
  // Sized from the container, not the window: the same scene sits in the phone
  // column on mobile and inside the sign-in card on desktop.
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => Math.min(window.innerWidth, 480));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(el.clientWidth || window.innerWidth, 480));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [node]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/scenes/${sceneKey}.json`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error("This screen could not be loaded."); return r.json(); })
      .then(setNode)
      .catch((e: Error) => { if (e.name !== "AbortError") setError(e.message); });
    return () => ctrl.abort();
  }, [sceneKey]);

  const localised = useMemo<SceneBinder>(() => ({
    ...binder,
    rtl: isRtl,
    text: (n) => binder.text?.(n) ?? (n.text ? translateEnglish(n.text) ?? undefined : undefined),
  }), [binder, translateEnglish, isRtl]);

  if (error) return <ErrorState message={error} />;
  if (!node) return <div ref={host}><Spinner /></div>;
  const scale = width / node.width;
  return (
    <SceneBinderContext.Provider value={localised}>
      <div ref={host} className="figma-screen" dir="ltr" style={{ height: node.height * scale }}>
        <div style={{
          position: "relative", width: node.width, height: node.height,
          transform: `scale(${scale})`, transformOrigin: "top left",
        }}>
          <DesignElement node={node} parentWidth={node.width} />
          {overlays.map((o, i) => (
            <div key={i} className="scene-overlay"
              style={{ position: "absolute", left: isRtl ? node.width - o.x - o.width : o.x, top: o.y, width: o.width, height: o.height }}>
              {o.content}
            </div>
          ))}
        </div>
      </div>
      {children}
    </SceneBinderContext.Provider>
  );
}
