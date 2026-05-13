export type NotificationKind = 'error' | 'warn' | 'info' | 'success' | 'progress';
export type NotificationType = 'Error' | 'Warning' | 'Info' | 'Success' | 'Progress';

const TYPE_TO_KIND: Record<NotificationType, NotificationKind> = {
  Error:    'error',
  Warning:  'warn',
  Info:     'info',
  Success:  'success',
  Progress: 'progress',
};

export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timestamp: number;
  source?: string;
  progress?: number;
  pinned?: boolean;
  actions?: string[];
  unread: boolean;
}

interface StoreState {
  entries: NotificationEntry[];
  unreadCount: number;
}

type Listener = (state: StoreState) => void;

let state: StoreState = { entries: [], unreadCount: 0 };
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach(l => l(state));
}

function countUnread(entries: NotificationEntry[]): number {
  return entries.filter(e => e.unread).length;
}

export function dispatch(type: NotificationType, message: string): NotificationEntry {
  const kind = TYPE_TO_KIND[type];
  const entry: NotificationEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    title: message,
    body: '',
    timestamp: Date.now(),
    unread: true,
  };
  const base = kind === 'progress'
    ? state.entries.filter(e => e.kind !== 'progress')
    : state.entries;
  const newEntries = [...base, entry];
  state = { entries: newEntries, unreadCount: countUnread(newEntries) };
  notifyListeners();
  return entry;
}

export function dismiss(id: string): void {
  const remaining = state.entries.filter(e => e.id !== id);
  state = { entries: remaining, unreadCount: countUnread(remaining) };
  notifyListeners();
}

export function clearAll(): void {
  const pinned = state.entries.filter(e => e.pinned);
  state = { entries: pinned, unreadCount: countUnread(pinned) };
  notifyListeners();
}

export function markAllRead(): void {
  if (state.unreadCount === 0) return;
  state = {
    entries: state.entries.map(e => ({ ...e, unread: false })),
    unreadCount: 0,
  };
  notifyListeners();
}

export function getState(): StoreState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
