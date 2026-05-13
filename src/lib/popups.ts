/**
 * Centralized popup management.
 *
 * Enforces the app-wide rule that **only one Popup is visible at a time**.
 * Opening a new popup automatically closes whichever popup was active before
 * — this includes the Notification Tray, the Galaxy Detail popup, and any
 * future popup that opts in.
 *
 * Each popup must:
 *   1. Pick a unique string id (kebab-case, e.g. `notification-tray`).
 *   2. Call `openPopup(id)` when it becomes visible.
 *   3. Subscribe to changes; if `getActivePopup()` no longer matches its id,
 *      it must close itself.
 *   4. Call `closePopup(id)` when it closes via its own UI (escape key,
 *      explicit close button, click-outside).
 *
 * Global Popups (centered modals with a dimmed background) live outside this
 * system because they block the entire UI; they are not stackable with regular
 * popups by definition.
 */

export type PopupId = string | null;

type Listener = (active: PopupId) => void;

let active: PopupId = null;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => l(active));
}

export function getActivePopup(): PopupId {
  return active;
}

export function openPopup(id: string): void {
  if (active === id) return;
  active = id;
  notify();
}

export function closePopup(id: string): void {
  if (active !== id) return;
  active = null;
  notify();
}

export function closeAll(): void {
  if (active === null) return;
  active = null;
  notify();
}

export function subscribePopup(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
