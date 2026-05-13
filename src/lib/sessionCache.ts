import { useEffect, useState } from 'react';

/**
 * Centralized in-memory session cache for tool computation results.
 *
 * **Lifetime:** the running app session. Cleared on app restart. Nothing is
 * persisted to disk.
 *
 * **Slot model:** any tool that wants caching calls `defineSessionSlot<T>(key)`
 * once (module-level) to get a typed handle. The slot's generic parameter
 * propagates through `getSession` / `setSession` / `clearSession` /
 * `subscribeSession` so callers never need to assert types. Tools that don't
 * need caching simply don't define a slot.
 *
 * Mirrors the pub/sub shape of `notifications.ts` and `popups.ts`.
 */

export interface SessionSlot<T> {
  readonly key: string;
  // Phantom-type marker: keeps TS from widening <T> off the token.
  readonly __valueType?: T;
}

type AnyListener = (value: unknown) => void;

const store = new Map<string, unknown>();
const listeners = new Map<string, Set<AnyListener>>();

function notify(key: string, value: unknown): void {
  const set = listeners.get(key);
  if (!set) return;
  set.forEach((l) => l(value));
}

export function defineSessionSlot<T>(key: string): SessionSlot<T> {
  return { key };
}

export function getSession<T>(slot: SessionSlot<T>): T | null {
  if (!store.has(slot.key)) return null;
  return store.get(slot.key) as T;
}

export function setSession<T>(slot: SessionSlot<T>, value: T): void {
  store.set(slot.key, value);
  notify(slot.key, value);
}

export function clearSession<T>(slot: SessionSlot<T>): void {
  if (!store.has(slot.key)) return;
  store.delete(slot.key);
  notify(slot.key, null);
}

export function hasSession<T>(slot: SessionSlot<T>): boolean {
  return store.has(slot.key);
}

export function subscribeSession<T>(
  slot: SessionSlot<T>,
  listener: (value: T | null) => void,
): () => void {
  const wrapped: AnyListener = (v) => listener(v as T | null);
  let set = listeners.get(slot.key);
  if (!set) {
    set = new Set();
    listeners.set(slot.key, set);
  }
  set.add(wrapped);
  return () => {
    const s = listeners.get(slot.key);
    if (!s) return;
    s.delete(wrapped);
    if (s.size === 0) listeners.delete(slot.key);
  };
}

/**
 * React binding for a session slot. Returns the current value and re-renders
 * the caller whenever the slot is set or cleared. Mutations go through the
 * module-level `setSession` / `clearSession` so callers don't get fresh
 * closures every render (which would otherwise cause `useEffect` loops when
 * the value is written from inside a child).
 */
export function useSessionSlot<T>(slot: SessionSlot<T>): T | null {
  const [value, setValue] = useState<T | null>(() => getSession(slot));
  useEffect(() => {
    // Re-sync once on mount in case the slot changed between render and effect.
    setValue(getSession(slot));
    return subscribeSession(slot, setValue);
  }, [slot.key]);
  return value;
}
