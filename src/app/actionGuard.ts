import { useSyncExternalStore } from "react";

/** Duplicate-action protection (client request, 25 Oct 2026): one shared, atomic guard for
 *  every action that changes data. A guard is taken synchronously before the request starts,
 *  so a second click, a re-render, a remounted screen or another component asking for the
 *  same key while the first is unresolved is rejected at once, not queued. It is released
 *  when the action ends: success, failure or cancellation.
 *
 *  Keys are scoped to the signed-in account and the resource, e.g. `match:<partner id>`:
 *  every action on one match (request, accept, reject, withdraw, end) shares a guard, while
 *  actions on another match, or other operations, stay usable. */
export class DuplicateActionError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Already in progress: ${key}`);
    this.name = "DuplicateActionError";
    this.key = key;
  }
}

let account = "signed-out";
const running = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** The signed-in account guards are scoped to (set by the session). */
export function setGuardAccount(id: string | null) {
  account = id ?? "signed-out";
  notify();
}

export const actionKey = (resource: string) => `${account}|${resource}`;

/** Runs `work` under the guard for `resource`, or rejects with DuplicateActionError when an
 *  action on that resource is already unresolved. */
export function guarded<T>(resource: string, work: () => Promise<T>): Promise<T> {
  const key = actionKey(resource);
  if (running.has(key)) return Promise.reject(new DuplicateActionError(key));
  const promise = (async () => work())().finally(() => {
    if (running.get(key) === promise) { running.delete(key); notify(); }
  });
  running.set(key, promise);
  notify();
  return promise;
}

export const isGuarded = (resource: string) => running.has(actionKey(resource));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True while an action on `resource` is unresolved, from any screen or component: drives
 *  the control's disabled state and its local progress indicator. */
export function useGuarded(resource: string | null): boolean {
  return useSyncExternalStore(subscribe, () => resource !== null && isGuarded(resource), () => false);
}

/** Test hook: forget every guard. */
export function resetGuards() {
  running.clear();
  notify();
}
