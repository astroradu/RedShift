import { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { STRINGS } from '../../lib/strings';

export interface PlannerTableRow {
  /** Stable unique key for React + click identity. */
  key: string;
  /** Displayed in the leading "name" column. The dot prefix is added by the table. */
  name: ReactNode;
  /** Per-month visibility scores; one number per `months` header. */
  months: number[];
  /** Best-month label rendered inside the trailing pill. */
  best: string;
  /** Total score rendered as a tabular number with one decimal. */
  total: number;
  /** Optional metadata cells appended after Total. Length must match `metadataColumns`. */
  metadataCells?: ReactNode[];
}

interface PlannerTableProps {
  rows: PlannerTableRow[];
  months: string[];
  /** Header label for the leading "name" column. */
  nameHeader: string;
  /** Header label for the "best" column. Defaults to "Best". */
  bestHeader?: string;
  /** Optional metadata column headers shown after Total. */
  metadataColumns?: string[];
  /** Toolbar content rendered above the table (title chip / chip-row / pagination meta). */
  toolbar: ReactNode;
  /**
   * If set, rows become clickable and `onRowClick(row.key)` fires on click /
   * Enter / Space. The row whose key matches `activeKey` gets the `.active`
   * highlight (used by the galaxy table to indicate the currently inspected row).
   */
  onRowClick?: (key: string) => void;
  activeKey?: string | null;
  /** When true, wraps the table in `.galaxy-table-hscroll` for horizontal scroll. */
  horizontalScroll?: boolean;
  /**
   * CSS string written to the `--gx-cols` custom property. Used by the galaxy
   * planner — the `.galaxy-results .data-table .dt-row` rule reads this via
   * the outer `.galaxy-results` wrapper so the row grid matches the metadata
   * column count.
   */
  gridTemplateColumns?: string;
}

/**
 * Shared planner data-table.
 *
 * Used by both the constellation and galaxy planners. The galaxy variant
 * passes `metadataColumns`, `onRowClick`/`activeKey`, `horizontalScroll`, and
 * `galaxyResults`; the constellation variant only supplies `rows`/`months`/
 * `toolbar` and gets the default 14-column grid.
 *
 * Heatmap colouring is computed from the maximum cell value across all rows.
 */
export function PlannerTable({
  rows,
  months,
  nameHeader,
  bestHeader = STRINGS.PLANNER_TABLE.BEST_DEFAULT,
  metadataColumns = [],
  toolbar,
  onRowClick,
  activeKey = null,
  horizontalScroll = false,
  gridTemplateColumns,
}: PlannerTableProps) {
  const max = rows.length > 0 ? Math.max(0, ...rows.flatMap((r) => r.months)) : 0;
  const tableStyle: CSSProperties | undefined = gridTemplateColumns
    ? ({ '--gx-cols': gridTemplateColumns } as CSSProperties)
    : undefined;

  const tableEl = (
    <div className="data-table" style={tableStyle}>
      <div className="dt-row dt-head">
        <div className="dt-cell name">{nameHeader}</div>
        {months.map(m => <div key={m} className="dt-cell month">{m}</div>)}
        <div className="dt-cell best">{bestHeader}</div>
        <div className="dt-cell total">{STRINGS.PLANNER_TABLE.TOTAL}</div>
        {metadataColumns.map(c => (
          <div key={c} className="dt-cell meta" data-col={c}>{c}</div>
        ))}
      </div>

      {rows.map((row) => {
        const peakIdx = row.months.indexOf(Math.max(...row.months));
        const isActive = activeKey !== null && row.key === activeKey;
        const clickable = onRowClick !== undefined;
        const handleClick = clickable ? () => onRowClick!(row.key) : undefined;
        const handleKeyDown = clickable
          ? (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick!(row.key);
              }
            }
          : undefined;

        return (
          <div
            key={row.key}
            className={
              'dt-row' +
              (clickable ? ' galaxy-dt-row' : '') +
              (isActive ? ' active' : '')
            }
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div className="dt-cell name">
              <span className="dt-dot"/>
              {row.name}
            </div>
            {row.months.map((v, i) => {
              const intensity = max > 0 ? v / max : 0;
              return (
                <div
                  key={i}
                  className={'dt-cell month heat' + (i === peakIdx ? ' peak' : '')}
                  style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 38)}%, transparent)` }}
                  title={`${months[i]} · ${v.toFixed(1)}`}
                >
                  {v.toFixed(0)}
                </div>
              );
            })}
            <div className="dt-cell best"><span className="best-pill">{row.best}</span></div>
            <div className="dt-cell total">{row.total.toFixed(1)}</div>
            {(row.metadataCells ?? []).map((cell, i) => (
              <div key={i} className="dt-cell meta" data-col={metadataColumns[i]}>{cell}</div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="table-wrap">
      <div className="table-toolbar">{toolbar}</div>
      {horizontalScroll ? (
        <div className="galaxy-table-hscroll">{tableEl}</div>
      ) : (
        tableEl
      )}
    </div>
  );
}
