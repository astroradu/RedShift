// DatePickerPopup2 — port of sky/DatePickerPopup.tsx into the sky2 namespace.
// Behaviour and CSS classes (`.dp-…`, `.date-picker`) are reused verbatim — the
// shared design tokens already make this popup palette-aware in both viewers.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../icons/Icon';
import {
  closePopup,
  getActivePopup,
  openPopup,
  subscribePopup,
} from '../../../lib/popups';
import { STRINGS } from '../../../lib/strings';
import { TimePickerStepper2 } from './TimePickerStepper2';

const POPUP_ID = 'sky2-date-picker';

interface Props {
  open: boolean;
  date: Date;
  onApply: (newDate: Date) => void;
  onClose: () => void;
}

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeInputValue(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function combineDateTime(dateStr: string, timeStr: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dateMatch || !timeMatch) return null;
  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10) - 1;
  const day = parseInt(dateMatch[3], 10);
  const hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const d = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface Preset {
  label: string;
  resolve: (now: Date, draftDate: string) => { dateStr: string; timeStr: string };
}

function buildPresets(S: typeof STRINGS.SKY2): readonly Preset[] {
  return [
    {
      label: S.DP_PRESET_TONIGHT,
      resolve: (now) => ({ dateStr: toDateInputValue(now), timeStr: '22:00' }),
    },
    {
      label: S.DP_PRESET_MIDNIGHT,
      resolve: (_now, draftDate) => ({ dateStr: draftDate, timeStr: '00:00' }),
    },
    {
      label: S.DP_PRESET_RESET,
      resolve: (now) => ({ dateStr: toDateInputValue(now), timeStr: toTimeInputValue(now) }),
    },
  ] as const;
}

export function DatePickerPopup2({ open, date, onApply, onClose }: Props) {
  const [draftDate, setDraftDate] = useState<string>(() => toDateInputValue(date));
  const [draftTime, setDraftTime] = useState<string>(() => toTimeInputValue(date));

  const prevOpenRef = useRef<boolean>(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setDraftDate(toDateInputValue(date));
      setDraftTime(toTimeInputValue(date));
    }
    prevOpenRef.current = open;
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    openPopup(POPUP_ID);
    const unsub = subscribePopup((activeId) => {
      if (activeId !== POPUP_ID) onClose();
    });
    return () => {
      unsub();
      if (getActivePopup() === POPUP_ID) closePopup(POPUP_ID);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const S = STRINGS.SKY2;
  const presets = useMemo(() => buildPresets(S), [S]);

  const handleApply = (): void => {
    const combined = combineDateTime(draftDate, draftTime);
    if (combined) onApply(combined);
    onClose();
  };

  return (
    <>
      {open && <div className="dp-scrim" onClick={onClose} />}
      <aside
        className={'date-picker' + (open ? ' open' : '')}
        aria-hidden={!open}
        role="dialog"
        aria-label={S.DP_TITLE}
      >
        <header className="dp-head">
          <div className="dp-title-row">
            <div className="dp-title">
              <span className="dp-mark">
                <Icon name="calendar" size={13} />
              </span>
              {S.DP_TITLE}
            </div>
            <button
              className="dp-x"
              aria-label={S.DP_CLOSE_ARIA}
              onClick={onClose}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="dp-sub">{S.DP_SUB}</div>
        </header>

        <div className="dp-body">
          <div className="dp-field">
            <label className="dp-label">{S.DP_DATE}</label>
            <div className="dp-input-row">
              <input
                type="date"
                className="dp-input"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
              <Icon name="calendar" size={13} />
            </div>
          </div>

          <div className="dp-field">
            <label className="dp-label">
              {S.DP_TIME_LABEL} <span className="dp-hint">{S.DP_TIME_HINT}</span>
            </label>
            <TimePickerStepper2
              hour={parseInt(draftTime.slice(0, 2), 10) || 0}
              minute={parseInt(draftTime.slice(3, 5), 10) || 0}
              onHourChange={(h) =>
                setDraftTime(`${h.toString().padStart(2, '0')}:${draftTime.slice(3, 5)}`)
              }
              onMinuteChange={(m) =>
                setDraftTime(`${draftTime.slice(0, 2)}:${m.toString().padStart(2, '0')}`)
              }
            />
          </div>

          <div className="dp-presets">
            <div className="dp-label">{S.DP_QUICK_SET}</div>
            <div className="dp-preset-row">
              {presets.map((p) => (
                <button
                  key={p.label}
                  className="dp-preset"
                  onClick={() => {
                    const { dateStr, timeStr } = p.resolve(new Date(), draftDate);
                    setDraftDate(dateStr);
                    setDraftTime(timeStr);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="dp-foot">
          <button className="dp-btn primary" onClick={handleApply}>
            {S.DP_APPLY}
          </button>
        </footer>
      </aside>
    </>
  );
}
