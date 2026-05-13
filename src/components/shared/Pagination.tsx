import { memo } from 'react';
import { Icon } from '../icons/Icon';
import { STRINGS } from '../../lib/strings';

interface PaginationProps {
  currentPage: number;        // 1-indexed
  totalPages: number;
  /** Total row count across all pages — drives the "X-Y of N" range label. */
  totalItems: number;
  /** Items per page — drives the range label. */
  pageSize: number;
  onChange: (page: number) => void;
}

/**
 * Build the visible page-number list with an ellipsis-collapsed middle.
 *
 * Examples (current = ▢):
 *   total=4    →  1 2 3 4
 *   total=10, current=1   →  ▢ 2 3 4 5 … 10
 *   total=10, current=5   →  1 … 3 4 ▢ 6 7 … 10
 *   total=10, current=10  →  1 … 6 7 8 9 ▢
 */
function buildPages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const around = 2;
  const start = Math.max(2, current - around);
  const end = Math.min(total - 1, current + around);
  const pages: (number | 'ellipsis')[] = [1];
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onChange,
}: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="pagination" aria-label={STRINGS.PAGINATION.ARIA}>
        <span className="pagination-range">{STRINGS.PAGINATION.singlePage(totalItems)}</span>
      </div>
    );
  }

  const pages = buildPages(currentPage, totalPages);
  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="pagination" role="navigation" aria-label={STRINGS.PAGINATION.ARIA}>
      <button
        type="button"
        className="pagination-arrow"
        disabled={!canPrev}
        onClick={() => onChange(currentPage - 1)}
        aria-label={STRINGS.PAGINATION.PREV_ARIA}
      >
        <Icon name="arrow-left" size={12}/>
      </button>

      <div className="pagination-pages">
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="pagination-ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className={'pagination-num' + (p === currentPage ? ' on' : '')}
              aria-current={p === currentPage ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        className="pagination-arrow"
        disabled={!canNext}
        onClick={() => onChange(currentPage + 1)}
        aria-label={STRINGS.PAGINATION.NEXT_ARIA}
      >
        <Icon name="arrow-right" size={12}/>
      </button>

      <span className="pagination-range">
        {STRINGS.PAGINATION.range(rangeStart, rangeEnd, totalItems)}
      </span>
    </div>
  );
});
