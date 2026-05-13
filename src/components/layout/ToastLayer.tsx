import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, type NotificationEntry } from '../../lib/notifications';
import { STRINGS } from '../../lib/strings';
import { Icon } from '../icons/Icon';

interface ToastItem {
  entry: NotificationEntry;
  exiting: boolean;
}

const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 6000;
const EXIT_ANIMATION_MS = 400;

export function ToastLayer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const pending = timers.current.get(id);
    if (pending !== undefined) {
      clearTimeout(pending);
      timers.current.delete(id);
    }
    setToasts(prev => prev.map(t => t.entry.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.entry.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const addToast = useCallback((entry: NotificationEntry) => {
    setToasts(prev => {
      const active = prev.filter(t => !t.exiting);
      let next = [...prev];
      if (active.length >= MAX_TOASTS) {
        const oldest = active[0];
        const pending = timers.current.get(oldest.entry.id);
        if (pending !== undefined) {
          clearTimeout(pending);
          timers.current.delete(oldest.entry.id);
        }
        next = next.filter(t => t.entry.id !== oldest.entry.id);
      }
      return [...next, { entry, exiting: false }];
    });

    const timer = setTimeout(() => dismiss(entry.id), TOAST_DURATION_MS);
    timers.current.set(entry.id, timer);
  }, [dismiss]);

  useEffect(() => {
    const seen = new Set<string>();
    return subscribe(state => {
      for (const entry of state.entries) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          addToast(entry);
        }
      }
    });
  }, [addToast]);

  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach(timer => clearTimeout(timer)); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-layer" aria-live="assertive">
      {toasts.map(toast => (
        <div
          key={toast.entry.id}
          className={`toast toast--${toast.entry.kind}${toast.exiting ? ' toast--exiting' : ''}`}
          role="alert"
        >
          <span className="toast-msg">{toast.entry.title}</span>
          <button
            className="toast-close"
            onClick={() => dismiss(toast.entry.id)}
            aria-label={STRINGS.TOAST.DISMISS_ARIA}
          >
            <Icon name="x" size={12} stroke={2}/>
          </button>
        </div>
      ))}
    </div>
  );
}
