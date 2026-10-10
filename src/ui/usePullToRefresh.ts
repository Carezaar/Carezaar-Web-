import { useEffect, useRef, useState } from "react";

/** Pull-to-refresh for touch screens, on the page's own scroll (the window). A downward
 *  drag that starts with the page at the top shows the indicator; releasing past
 *  TRIGGER refreshes. While the screen is mounted the browser's own pull-to-reload is
 *  turned off, so the gesture refreshes the list instead of reloading the whole app.
 *  Mouse and keyboard users are unaffected. */

/** Indicator travel (half the finger's) at which releasing refreshes: a 90 px drag. */
const TRIGGER = 45;
const MAX_PULL = 110;

export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled = true) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    const set = (value: number) => { pullRef.current = value; setPull(value); };
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && !busy.current && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { set(0); return; }
      // Resistance: the indicator moves at half the finger's speed.
      set(Math.min(MAX_PULL, dy / 2));
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      const reached = pullRef.current >= TRIGGER;
      set(0);
      if (!reached || busy.current) return;
      busy.current = true;
      setRefreshing(true);
      void refreshRef.current().catch(() => undefined).finally(() => { busy.current = false; setRefreshing(false); });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = previous;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  return { pull, refreshing, armed: pull >= TRIGGER };
}
