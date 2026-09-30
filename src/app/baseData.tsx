import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import type { BaseTable } from "../api/services";
import type { BaseItem, Language, USState } from "../api/types";
import { loadBaseData, readBaseCache, type BaseDataCache } from "./baseDataLoader";

/** English labels matching the Android splash sheet; translated via
 *  `loading_base_*` slugs once contents are available. */
export const TABLE_LABELS: Record<string, string> = {
  faq_categories: "Loading FAQ categories", media: "Loading media",
  experiences: "Loading experiences", faqs: "Loading FAQs", countries: "Loading countries",
  worktypes: "Loading work types", genders: "Loading genders", languages: "Loading languages",
  commutes: "Loading commute distance options", states: "Loading states",
  contents: "Loading contents", issuetypes: "Loading issue types", shifts: "Loading shifts",
  certifications: "Loading documents & certifications", languageskills: "Loading language skills",
  roles: "Loading roles", clienttypes: "Loading client types",
  subjects: "Loading notification subjects", reasons: "Loading reasons",
  careconditions: "Loading care conditions", caredays: "Loading care days",
  carespecials: "Loading special qualities",
};

interface BaseDataValue {
  ready: boolean;
  failed: boolean;
  /** Tables still loading, for the splash progress sheet. */
  pending: string[];
  progress: number;
  items: (table: BaseTable) => BaseItem[];
  find: (table: BaseTable, id: number | null | undefined) => BaseItem | undefined;
  languages: Language[];
  states: USState[];
  reload: (force?: boolean) => Promise<void>;
}

const BaseDataContext = createContext<BaseDataValue | null>(null);

export function BaseDataProvider({ children }: { children: ReactNode }) {
  const initial = useRef(readBaseCache());
  const [cache, setCache] = useState<BaseDataCache | null>(initial.current);
  const [pending, setPending] = useState<string[]>([]);
  const [total, setTotal] = useState(1);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async (force = false) => {
    setFailed(false);
    const result = await loadBaseData({
      force,
      onStart: (names) => { setTotal(names.length); setPending(names); },
      onDone: (name) => setPending((p) => p.filter((n) => n !== name)),
      // First visit: open the app once the copy and languages are in; the other tables
      // fill in behind it. A stored copy is already showing, so it is kept until the end.
      onEssentials: (partial) => setCache((shown) => shown ?? partial),
    });
    setCache(result.cache);
    setFailed(result.failed);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<BaseDataValue>(() => ({
    ready: cache !== null && Object.keys(cache.tables).length > 0,
    failed,
    pending,
    progress: total === 0 ? 1 : 1 - pending.length / total,
    items: (table) => cache?.tables[table] ?? [],
    find: (table, id) => (id == null ? undefined : cache?.tables[table]?.find((x) => x.id === id)),
    languages: cache?.languages ?? [],
    states: cache?.states ?? [],
    reload,
  }), [cache, failed, pending, total, reload]);

  return <BaseDataContext.Provider value={value}>{children}</BaseDataContext.Provider>;
}

export function useBaseData(): BaseDataValue {
  const value = useContext(BaseDataContext);
  if (!value) throw new Error("useBaseData must be used inside BaseDataProvider");
  return value;
}
