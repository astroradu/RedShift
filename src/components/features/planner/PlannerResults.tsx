import { useEffect } from 'react';
import { PlannerTable, PlannerTableRow } from '../../shared/PlannerTable';
import { PanelHeader } from '../../shared/PanelHeader';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { dispatch } from '../../../lib/notifications';
import { STRINGS } from '../../../lib/strings';
import type { PlannerResultsResponse, PlannerRow } from '../../../types';

interface PlannerResultsProps {
  period: string;
  onBack: () => void;
  /** Pre-loaded data — when set, skips the network fetch entirely. */
  initialData?: PlannerResultsResponse | null;
  /** Fires once after a fresh fetch resolves; lets the parent cache the result. */
  onLoaded?: (data: PlannerResultsResponse) => void;
}

interface TopCardProps {
  eyebrow: string;
  description: string;
  row: PlannerRow;
  variant?: 'primary' | 'secondary';
}

function TopCard({ eyebrow, description, row, variant = 'primary' }: TopCardProps) {
  const peakScore = Math.max(0, ...row.months);
  return (
    <div className={'top-constellation-card tcc-' + variant}>
      <div className="tc-eyebrow">{eyebrow}</div>
      <div className="tc-name">{row.name}</div>
      <div className="tc-sub">{description}</div>
      <div className="tc-score">
        <span className="tc-score-num">{row.total.toFixed(1)}</span>
        <span className="tc-score-label">{STRINGS.PLANNER_RESULTS.SCORE_LABEL}</span>
      </div>
      <div className="tc-meta">
        <div className="tc-meta-cell">
          <span className="tc-meta-label">{STRINGS.PLANNER_RESULTS.META_BEST_MONTH}</span>
          <span className="tc-meta-value">{row.best}</span>
        </div>
        <div className="tc-meta-cell">
          <span className="tc-meta-label">{STRINGS.PLANNER_RESULTS.META_PEAK_SCORE}</span>
          <span className="tc-meta-value">{peakScore.toFixed(1)}</span>
        </div>
        <div className="tc-meta-cell">
          <span className="tc-meta-label">{STRINGS.PLANNER_RESULTS.META_SKY_BEHAVIOUR}</span>
          <span className="tc-meta-value">{row.circumpolar ? STRINGS.PLANNER_RESULTS.SKY_CIRCUMPOLAR : STRINGS.PLANNER_RESULTS.SKY_RISES}</span>
        </div>
      </div>
    </div>
  );
}

export function PlannerResults({ period, onBack, initialData = null, onLoaded }: PlannerResultsProps) {
  const seeded = initialData !== null;
  const query = useApiQuery<PlannerResultsResponse>(
    seeded ? null : `/api/planner/results?period=${encodeURIComponent(period)}`,
    [period, seeded ? 'seeded' : 'live']
  );

  const data: PlannerResultsResponse | null = initialData ?? query.data;
  const error = query.error;

  useEffect(() => {
    if (error) dispatch('Error', `Could not load planner results: ${error}`);
  }, [error]);

  useEffect(() => {
    if (!seeded && query.data && onLoaded) {
      onLoaded(query.data);
    }
  }, [seeded, query.data, onLoaded]);

  if (!data) {
    return <div className="planner-results fade-enter fade-in" />;
  }

  const { rows, months, kpis } = data;
  const topRow =
    rows.find((r) => r.name === kpis.best_constellation.name) ?? rows[0] ?? null;
  const topNonCircRow =
    kpis.best_non_circumpolar !== null
      ? rows.find((r) => r.name === kpis.best_non_circumpolar!.name) ?? null
      : null;
  const showSecondCard = topNonCircRow !== null && topNonCircRow.name !== topRow?.name;

  const tableRows: PlannerTableRow[] = rows.map((row) => ({
    key: row.name,
    name: row.name,
    months: row.months,
    best: row.best,
    total: row.total,
  }));

  return (
    <div className="planner-results fade-enter fade-in">
      <PanelHeader
        title={STRINGS.PLANNER_RESULTS.TITLE}
        subtitle={STRINGS.PLANNER_RESULTS.subtitle(period, rows.length)}
        onBack={onBack}
      />

      <div className="results-body">
        {topRow && (
          <div className={'top-card-row' + (showSecondCard ? ' two-up' : '')}>
            <TopCard
              eyebrow={STRINGS.PLANNER_RESULTS.CARD_TOP_EYEBROW}
              description={STRINGS.PLANNER_RESULTS.cardTopDesc(period)}
              row={topRow}
              variant="primary"
            />
            {showSecondCard && (
              <TopCard
                eyebrow={STRINGS.PLANNER_RESULTS.CARD_NOCIRC_EYEBROW}
                description={STRINGS.PLANNER_RESULTS.CARD_NOCIRC_DESC}
                row={topNonCircRow}
                variant="secondary"
              />
            )}
          </div>
        )}

        <PlannerTable
          rows={tableRows}
          months={months}
          nameHeader={STRINGS.PLANNER_RESULTS.TABLE_NAME_HEADER}
          toolbar={
            <>
              <span className="table-title">{STRINGS.PLANNER_RESULTS.TABLE_TITLE}</span>
              {/* view-mode chips hidden until view switching is implemented */}
              <div className="chip-row" style={{ display: 'none' }}>
                <button className="chip on">{STRINGS.PLANNER_RESULTS.CHIP_HEATMAP}</button>
                <button className="chip">{STRINGS.PLANNER_RESULTS.CHIP_NUMBERS}</button>
                <button className="chip">{STRINGS.PLANNER_RESULTS.CHIP_SPARKLINE}</button>
              </div>
            </>
          }
        />
      </div>
    </div>
  );
}
