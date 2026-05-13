import { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons/Icon';
import {
  getState,
  subscribe,
  markAllRead,
  dismiss as dismissEntry,
  clearAll as clearAllEntries,
  type NotificationEntry,
  type NotificationKind,
} from '../../lib/notifications';
import { PopupShell } from '../shared/PopupShell';
import { STRINGS } from '../../lib/strings';

const POPUP_ID = 'notification-tray';

type FilterMode = 'all' | 'alerts' | 'activity';

interface KindMeta {
  label: string;
  icon: string;
  color: string;
}

const KIND_META: Record<NotificationKind, KindMeta> = {
  error:    { label: STRINGS.NOTIFICATION_TRAY.KIND_ERROR,    icon: 'x-circle', color: '#FF5566' },
  warn:     { label: STRINGS.NOTIFICATION_TRAY.KIND_WARN,     icon: 'alert',    color: '#FFB347' },
  info:     { label: STRINGS.NOTIFICATION_TRAY.KIND_INFO,     icon: 'info',     color: '#4DBBFF' },
  success:  { label: STRINGS.NOTIFICATION_TRAY.KIND_SUCCESS,  icon: 'check',    color: '#4DEBA0' },
  progress: { label: STRINGS.NOTIFICATION_TRAY.KIND_PROGRESS, icon: 'sparkle',  color: '#FFA94D' },
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)       return STRINGS.NOTIFICATION_TRAY.TIME_NOW;
  if (diff < 3_600_000)    return STRINGS.NOTIFICATION_TRAY.timeMinAgo(Math.floor(diff / 60_000));
  if (diff < 86_400_000)   return STRINGS.NOTIFICATION_TRAY.timeHrAgo(Math.floor(diff / 3_600_000));
  return STRINGS.NOTIFICATION_TRAY.TIME_YESTERDAY;
}

function todayCutoff(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface NotificationItemProps {
  entry: NotificationEntry;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}

function NotificationItem({ entry, expanded, onToggle, onDismiss }: NotificationItemProps) {
  const meta = KIND_META[entry.kind];
  const kindStyle = { color: meta.color, '--k': meta.color } as React.CSSProperties;

  return (
    <div
      className={`ntf${expanded ? ' open' : ''}${entry.unread ? ' unread' : ''}${entry.pinned ? ' pinned' : ''}`}
      data-kind={entry.kind}
      onClick={onToggle}
    >
      <div className="ntf-rail">
        <span className="ntf-glyph" style={kindStyle}>
          <Icon name={meta.icon} size={11}/>
        </span>
      </div>
      <div className="ntf-body">
        <div className="ntf-head">
          <span className="ntf-kind" style={{ color: meta.color }}>
            <span className="nk-dot" style={{ background: meta.color }}/>
            {meta.label}
          </span>
          <span className="ntf-time">{formatTime(entry.timestamp)}</span>
        </div>
        <div className="ntf-title">
          {entry.title}
          {entry.unread && <span className="ntf-unread-dot"/>}
        </div>
        {entry.body && <div className="ntf-msg">{entry.body}</div>}

        {entry.kind === 'progress' && entry.progress !== undefined && (
          <div className="ntf-progress">
            <div className="ntf-bar">
              <i style={{ width: `${Math.round(entry.progress * 100)}%` }}/>
            </div>
            <span className="ntf-pct">{Math.round(entry.progress * 100)}%</span>
          </div>
        )}

        {expanded && (
          <div className="ntf-detail" onClick={e => e.stopPropagation()}>
            <div className="ntf-meta-row">
              {entry.source && <span className="ntf-source">SOURCE · {entry.source}</span>}
              <span className="ntf-id">#{entry.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="ntf-actions">
              {(entry.actions ?? []).map(a => (
                <button
                  key={a}
                  className={`ntf-act${a === 'Recover' || a === 'Apply' ? ' primary' : ''}`}
                >
                  {a}
                </button>
              ))}
              <button
                className="ntf-act ghost"
                onClick={e => { e.stopPropagation(); onDismiss(); }}
              >
                {STRINGS.NOTIFICATION_TRAY.DISMISS}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationTray() {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<NotificationEntry[]>(() => getState().entries);
  const [unreadCount, setUnreadCount] = useState(() => getState().unreadCount);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(s => {
    setEntries(s.entries);
    setUnreadCount(s.unreadCount);
  }), []);

  // Refresh relative timestamps every minute.
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Clear expanded row when the tray closes.
  useEffect(() => {
    if (!isOpen) setExpandedId(null);
  }, [isOpen]);

  const cutoff = todayCutoff();
  const filtered = [...entries].reverse().filter(e => {
    if (filter === 'alerts')   return e.kind === 'error' || e.kind === 'warn';
    if (filter === 'activity') return e.kind === 'progress' || e.kind === 'success' || e.kind === 'info';
    return true;
  });
  const todayEntries   = filtered.filter(e => e.timestamp >= cutoff);
  const earlierEntries = filtered.filter(e => e.timestamp < cutoff);

  const errorCount = entries.filter(e => e.kind === 'error').length;
  const alertCount = entries.filter(e => e.kind === 'error' || e.kind === 'warn').length;
  const runningCount = entries.filter(e => e.kind === 'progress').length;

  const handleBell = () => {
    if (!isOpen) markAllRead();
    setIsOpen(o => !o);
  };

  const handleFilterChange = (f: FilterMode) => {
    setFilter(f);
    setExpandedId(null);
  };

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="notif-tray">
      <button
        ref={bellRef}
        className="icon-btn notif-bell-btn"
        aria-label={STRINGS.NOTIFICATION_TRAY.BELL_ARIA}
        onClick={handleBell}
      >
        <Icon name="bell" size={14}/>
        {unreadCount > 0 && <span className="notif-badge" aria-hidden="true"/>}
      </button>

      {isOpen && (
        <PopupShell
          popupId={POPUP_ID}
          className="tray-panel"
          ariaLabel={STRINGS.NOTIFICATION_TRAY.TRAY_ARIA}
          onClose={() => setIsOpen(false)}
          triggerRef={bellRef}
        >
          <header className="tray-head">
            <div className="tray-title-row">
              <div className="tray-title">
                <span className="tt-mark"><Icon name="bell" size={14}/></span>
                {STRINGS.NOTIFICATION_TRAY.TITLE}
                {unreadCount > 0 && <span className="tt-count">{unreadCount}</span>}
              </div>
              <button className="tray-x" aria-label={STRINGS.NOTIFICATION_TRAY.CLOSE_ARIA} onClick={() => setIsOpen(false)}>
                <Icon name="x" size={14}/>
              </button>
            </div>

            <div className="tray-stats">
              <div className="ts-pill">
                <span className="ts-num">{entries.length}</span>
                <span className="ts-lbl">{STRINGS.NOTIFICATION_TRAY.STAT_TOTAL}</span>
              </div>
              <div className="ts-pill" data-tone="error">
                <span className="ts-num">{errorCount}</span>
                <span className="ts-lbl">{STRINGS.NOTIFICATION_TRAY.STAT_ERRORS}</span>
              </div>
              {runningCount > 0 && (
                <div className="ts-pill" data-tone="ok">
                  <span className="ts-dot"/>
                  <span className="ts-lbl">
                    {STRINGS.NOTIFICATION_TRAY.liveRunning(runningCount)}
                  </span>
                </div>
              )}
            </div>

            <div className="tray-tabs">
              {(['all', 'alerts', 'activity'] as const).map(f => (
                <button
                  key={f}
                  className={`tray-tab${filter === f ? ' on' : ''}`}
                  onClick={() => handleFilterChange(f)}
                >
                  {f === 'all' ? STRINGS.NOTIFICATION_TRAY.TAB_ALL : f === 'alerts' ? STRINGS.NOTIFICATION_TRAY.TAB_ALERTS : STRINGS.NOTIFICATION_TRAY.TAB_ACTIVITY}
                  {f === 'alerts' && alertCount > 0 && (
                    <span className="tab-badge">{alertCount}</span>
                  )}
                </button>
              ))}
            </div>
          </header>

          <div className="tray-body">
            {todayEntries.length > 0 && (
              <>
                <div className="tray-group">
                  <span className="tg-label">{STRINGS.NOTIFICATION_TRAY.GROUP_TODAY}</span>
                  <span className="tg-line"/>
                  <span className="tg-count">{todayEntries.length}</span>
                </div>
                <div className="ntf-list">
                  {todayEntries.map(e => (
                    <NotificationItem
                      key={e.id}
                      entry={e}
                      expanded={expandedId === e.id}
                      onToggle={() => toggle(e.id)}
                      onDismiss={() => dismissEntry(e.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {earlierEntries.length > 0 && (
              <>
                <div className="tray-group">
                  <span className="tg-label">{STRINGS.NOTIFICATION_TRAY.GROUP_EARLIER}</span>
                  <span className="tg-line"/>
                  <span className="tg-count">{earlierEntries.length}</span>
                </div>
                <div className="ntf-list">
                  {earlierEntries.map(e => (
                    <NotificationItem
                      key={e.id}
                      entry={e}
                      expanded={expandedId === e.id}
                      onToggle={() => toggle(e.id)}
                      onDismiss={() => dismissEntry(e.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {filtered.length === 0 && (
              <div className="tray-empty">
                <span className="te-mark"><Icon name="bell" size={20}/></span>
                <div className="te-title">{STRINGS.NOTIFICATION_TRAY.EMPTY_TITLE}</div>
                <div className="te-sub">
                  {STRINGS.NOTIFICATION_TRAY.emptyNotices(filter)}
                </div>
              </div>
            )}
          </div>

          <footer className="tray-foot">
            <button className="tf-btn" onClick={clearAllEntries}>{STRINGS.NOTIFICATION_TRAY.CLEAR_ALL}</button>
          </footer>
        </PopupShell>
      )}
    </div>
  );
}
