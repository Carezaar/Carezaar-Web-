import {
  createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode,
} from "react";
import type { BaseTable, ExtraTable } from "../api/services";
import type { BaseItem, Language } from "../api/types";
import {
  baseDataState, listsState, loadBaseData, retryBaseData, subscribeBaseData, type ListName, type ListStatus,
} from "./baseDataLoader";

interface BaseDataValue {
  status: (name: ListName) => ListStatus;
  items: (table: BaseTable) => BaseItem[];
  /** States, media, FAQs and FAQ categories, in their own shapes. */
  extra: <T = unknown>(table: ExtraTable) => T[];
  find: (table: BaseTable, id: number | null | undefined) => BaseItem | undefined;
  languages: Language[];
  /** Asks again for the lists that failed. */
  retry: () => Promise<void>;
}

const BaseDataContext = createContext<BaseDataValue | null>(null);

/** One empty list for every list still missing, so its identity doesn't change on each
 *  update (translations and the callbacks that use them would be rebuilt, and screens that
 *  load on a change of those callbacks would ask the server again). */
const NONE: never[] = Object.freeze([]) as never[];

/** The reference lists. The app no longer waits for them to open (client report, 29 Oct
 *  2026: the "Please wait…" sheet stayed up while one list was slow or failed). Each
 *  screen waits only for the lists it shows (`useBaseLists`), and copy that comes from
 *  `contents` reads its English text until the translations arrive. */
export function BaseDataProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeBaseData, baseDataState, baseDataState);

  // One load per page: a remount or a later visit to the provider joins the running load,
  // and a finished one has already published its lists.
  useEffect(() => { loadBaseData().catch(() => undefined); }, []);

  const value = useMemo<BaseDataValue>(() => {
    const { cache, status } = state;
    return {
      status: (name) => status[name],
      items: (table) => cache.tables[table] ?? NONE,
      extra: <T,>(table: ExtraTable) => (cache.extras[table] ?? NONE) as T[],
      find: (table, id) => (id == null ? undefined : cache.tables[table]?.find((x) => x.id === id)),
      languages: cache.languages,
      retry: () => retryBaseData().then(() => undefined, () => undefined),
    };
  }, [state]);

  return <BaseDataContext.Provider value={value}>{children}</BaseDataContext.Provider>;
}

export function useBaseData(): BaseDataValue {
  const value = useContext(BaseDataContext);
  if (!value) throw new Error("useBaseData must be used inside BaseDataProvider");
  return value;
}

/** Whether the lists a screen shows are there (see `listsState`), and Try Again. */
export function useBaseLists(names: readonly ListName[]): { state: "loading" | "ready" | "failed"; retry: () => void } {
  const { status, retry } = useBaseData();
  return { state: listsState(names.map(status)), retry: () => void retry() };
}
