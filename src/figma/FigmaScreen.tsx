import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
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

/** One request per scene file: a screen mounted twice in quick succession (frames
 *  swapping on sign-out, for example) shares it instead of cancelling and repeating
 *  it. A failed load is forgotten so Try Again asks again. */
const scenes = new Map<string, Promise<DesignNode>>();
function loadScene(sceneKey: string): Promise<DesignNode> {
  let scene = scenes.get(sceneKey);
  if (!scene) {
    scene = fetch(`/scenes/${sceneKey}.json`)
      .then((r) => { if (!r.ok) throw new Error("This screen could not be loaded."); return r.json() as Promise<DesignNode>; });
    scene.catch(() => scenes.delete(sceneKey));
    scenes.set(sceneKey, scene);
  }
  return scene;
}

export function FigmaScreen({ sceneKey, binder, overlays = [], children }: {
  sceneKey: string; binder: SceneBinder; overlays?: SceneOverlay[]; children?: ReactNode;
}) {
  const { t, translateEnglish, isRtl } = useI18n();
  const [node, setNode] = useState<DesignNode | null>(null);
  const [error, setError] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
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
    let active = true;
    loadScene(sceneKey)
      .then((value) => { if (active) setNode(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [sceneKey, retryRevision]);

  const localised = useMemo<SceneBinder>(() => ({
    ...binder,
    rtl: isRtl,
    text: (n) => binder.text?.(n) ?? (n.text ? translateEnglish(n.text) ?? undefined : undefined),
  }), [binder, translateEnglish, isRtl]);

  if (error) return <ErrorState message={t("general_error_general", "Something went wrong. Please try again.")}
    retryLabel={t("general_try_again", "Try Again")}
    onRetry={() => { setError(false); setNode(null); setRetryRevision((value) => value + 1); }} />;
  if (!node) return <div ref={host}><Spinner /></div>;
  const scale = width / node.width;
  return (
    <SceneBinderContext.Provider value={localised}>
      <div ref={host} className="figma-screen" dir="ltr" style={{ height: node.height * scale }}>
        <div style={{
          "--scene-touch-min": `${44 / scale}px`,
          position: "relative", width: node.width, height: node.height,
          transform: `scale(${scale})`, transformOrigin: "top left",
        } as CSSProperties}>
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
