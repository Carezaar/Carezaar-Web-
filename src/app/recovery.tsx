import { Component, lazy, type ComponentType, type ReactNode } from "react";
import { useI18n } from "./i18n";

const RELOADED = "carezaar.chunkReload";

/** `lazy` for code-split screens. After a new deploy an open tab still asks for the
 *  old chunk names, which no longer exist; reload once to pick up the new build
 *  rather than failing the screen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same constraint React.lazy declares
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().then(
    (module) => { sessionStorage.removeItem(RELOADED); return module; },
    (error) => {
      if (!sessionStorage.getItem(RELOADED)) {
        sessionStorage.setItem(RELOADED, "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    },
  ));
}

function Fallback() {
  const { t } = useI18n();
  return (
    <div className="state" role="alert" style={{ minHeight: "100dvh" }}>
      <p>Something went wrong.</p>
      <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
        {t("general_try_again", "Try Again")}
      </button>
    </div>
  );
}

/** A render failure shows a way back instead of a blank page. */
export class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("Screen failed to render", error); }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}
