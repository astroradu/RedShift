import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pagination } from '../../shared/Pagination';
import { PlannerTable, PlannerTableRow } from '../../shared/PlannerTable';
import { PanelHeader } from '../../shared/PanelHeader';
import { useGalaxyPlannerResults } from '../../../hooks/useGalaxyPlannerResults';
import { dispatch } from '../../../lib/notifications';
import { STRINGS } from '../../../lib/strings';
import { GalaxyDetailPopup } from './GalaxyDetailPopup';
import type { GalaxyResultsResponse, GalaxyRow } from '../../../types';

interface GalaxyPlannerResultsProps {
  period: string;
  computeNonstandard: boolean;
  minAngularSize: number;
  onBack: () => void;
  /** Pre-loaded data — when set, skips the network fetch entirely. */
  initialData?: GalaxyResultsResponse | null;
  /** Fires once after a fresh fetch resolves; lets the parent cache the result. */
  onLoaded?: (data: GalaxyResultsResponse) => void;
}

const PAGE_SIZE = 100;

export function GalaxyPlannerResults({
  period,
  computeNonstandard,
  minAngularSize,
  onBack,
  initialData = null,
  onLoaded,
}: GalaxyPlannerResultsProps) {
  const seeded = initialData !== null;
  const query = useGalaxyPlannerResults(period, computeNonstandard, minAngularSize, !seeded);
  const data: GalaxyResultsResponse | null = initialData ?? query.data;
  const error = query.error;
  const [activeRowPgc, setActiveRowPgc] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    if (error) dispatch('Error', `Could not load galaxy planner results: ${error}`);
  }, [error]);

  useEffect(() => {
    if (!seeded && query.data && onLoaded) {
      onLoaded(query.data);
    }
  }, [seeded, query.data, onLoaded]);

  const rows = data?.rows ?? [];
  const months = data?.months ?? [];
  const metadataColumns = data?.metadata_columns ?? [];

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [rows]);

  const safePage = Math.min(page, totalPages);

  const handlePageChange = useCallback((p: number) => { setPage(p); }, []);

  const handleSelect = useCallback((pgc: string) => {
    setActiveRowPgc((prev) => (prev === pgc ? null : pgc));
  }, []);

  const tableRows: PlannerTableRow[] = useMemo(() => {
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, rows.length);
    return rows.slice(pageStart, pageEnd).map((row) => ({
      key: row.pgc,
      name: row.pgc,
      months: row.months,
      best: row.best,
      total: row.total,
      metadataCells: metadataColumns.map((c) => row.metadata[c] ?? ''),
    }));
  }, [rows, metadataColumns, safePage]);

  if (!data) {
    return <div className="planner-results galaxy-results fade-enter fade-in" />;
  }

  const { total_rows } = data;
  const activeRow: GalaxyRow | null =
    activeRowPgc !== null ? (rows.find((r) => r.pgc === activeRowPgc) ?? null) : null;

  const metaCols = metadataColumns.length > 0 ? ` repeat(${metadataColumns.length}, 160px)` : '';
  const colTemplate = `120px repeat(${months.length}, 64px) 130px 84px${metaCols}`;

  return (
    <div className="planner-results galaxy-results fade-enter fade-in">
      <PanelHeader
        title={STRINGS.GALAXY_RESULTS.TITLE}
        subtitle={STRINGS.GALAXY_RESULTS.subtitle(period, total_rows, computeNonstandard)}
        onBack={onBack}
      />

      <div className="results-body">
        <PlannerTable
          rows={tableRows}
          months={months}
          nameHeader={STRINGS.GALAXY_RESULTS.TABLE_NAME_HEADER}
          bestHeader={STRINGS.GALAXY_RESULTS.TABLE_BEST_HEADER}
          metadataColumns={metadataColumns}
          toolbar={
            <>
              <span className="table-title">
                {STRINGS.GALAXY_RESULTS.TABLE_TITLE}
              </span>
              <span className="galaxy-count-pill">
                {STRINGS.GALAXY_RESULTS.countPill(safePage, totalPages, PAGE_SIZE)}
              </span>
            </>
          }
          onRowClick={handleSelect}
          activeKey={activeRowPgc}
          horizontalScroll
          gridTemplateColumns={colTemplate}
        />
      </div>

      <div className="galaxy-pagination-bar">
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={rows.length}
          pageSize={PAGE_SIZE}
          onChange={handlePageChange}
        />
      </div>

      {activeRow && createPortal(
        <GalaxyDetailPopup
          row={activeRow}
          months={months}
          onClose={() => setActiveRowPgc(null)}
        />,
        document.body,
      )}
    </div>
  );
}
