import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { closePopup, getActivePopup, openPopup, subscribePopup } from '../../lib/popups';

interface PopupShellProps {
  /** Unique kebab-case id used by the global popup manager. */
  popupId: string;
  /** Class applied to the outer wrapper (e.g. `tray-panel`, `galaxy-detail-popup`). */
  className: string;
  /** Required for the dialog role — read by assistive tech. */
  ariaLabel: string;
  /** Called whenever the popup should close (Escape, click-outside, another popup opens). */
  onClose: () => void;
  /**
   * Optional ref to the element that opens this popup (e.g. a bell button).
   * Clicks on or inside this element are not treated as click-outside, so the
   * trigger's own toggle handler can close the popup without the click-outside
   * firing first and racing with it.
   */
  triggerRef?: RefObject<HTMLElement>;
  children: ReactNode;
}

/**
 * Shared chrome for top-right anchored Popups (NotificationTray, GalaxyDetailPopup).
 *
 * Encapsulates:
 * - the wrapper `<div role="dialog">` element
 * - close-on-Escape
 * - close-on-click-outside
 * - participation in the global popup manager (`openPopup` / `closePopup` /
 *   `subscribePopup`) so the app-wide "only one popup at a time" rule is enforced
 *
 * Visual style is supplied by the consumer's class on `className` (e.g.
 * `tray-panel`, `galaxy-detail-popup`).
 */
export function PopupShell({ popupId, className, ariaLabel, onClose, triggerRef, children }: PopupShellProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, triggerRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    openPopup(popupId);
    const unsub = subscribePopup((activeId) => {
      if (activeId !== popupId) onClose();
    });
    return () => {
      unsub();
      if (getActivePopup() === popupId) closePopup(popupId);
    };
  }, [popupId, onClose]);

  return (
    <div ref={wrapperRef} className={className} role="dialog" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
