import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { PlannerResults } from './PlannerResults';
import { ComplexitySlider, COMPLEXITY_VALUES } from './ComplexitySlider';
import { PlannerLoading } from '../../shared/PlannerLoading';
import { PanelHeader } from '../../shared/PanelHeader';
import { ActiveSessionBadge } from '../../shared/ActiveSessionBadge';
import { useApiSSE } from '../../../hooks/useApiSSE';
import { useLocation } from '../../../hooks/useLocation';
import { dispatch } from '../../../lib/notifications';
import { STRINGS } from '../../../lib/strings';
import { formatLat, formatLng } from '../../../lib/formatLocation';
import { clearSession, setSession, useSessionSlot } from '../../../lib/sessionCache';
import { CONSTELLATION_PLANNER_SLOT } from './sessions';
import type { Feature, PlannerResultsResponse } from '../../../types';
const DEFAULT_COMPLEXITY_SNAP = 1; // index → value 3 (matches script's default precision)

interface PlannerProgress { percent: number; status_index: number; status: string }
interface PlannerDone { result_id: string }

interface ConstellationPlannerProps {
  feature: Feature;
}

interface ResultsState {
  period: string;
  initialData: PlannerResultsResponse | null;
}

export function ConstellationPlanner({ feature }: ConstellationPlannerProps) {
  const [period, setPeriod] = useState<string>(STRINGS.PLANNER.PERIODS[1]);
  const [complexity, setComplexity] = useState<number>(DEFAULT_COMPLEXITY_SNAP);
  const [resultsState, setResultsState] = useState<ResultsState | null>(null);
  const sse = useApiSSE<PlannerProgress, PlannerDone>();
  const { location, source: locationSource, loaded: locationLoaded } = useLocation();
  const cachedSession = useSessionSlot(CONSTELLATION_PLANNER_SLOT);

  // Surface mid-stream / network errors as toasts and bail back to idle.
  useEffect(() => {
    if (sse.error) {
      dispatch('Error', sse.error);
      sse.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sse.error]);

  // SSE finished → enter the results view with the period live at SSE done.
  // The idle form can't be edited while loading, so `period` is still the
  // value submitted at calc start. `prev ?? ...` ensures this fires once.
  useEffect(() => {
    if (!sse.done) return;
    setResultsState((prev) => prev ?? { period, initialData: null });
  }, [sse.done, period]);

  const percent = sse.progress?.percent ?? 0;
  const statusIndex = sse.progress?.status_index ?? 0;
  const statusText = sse.progress?.status ?? STRINGS.CONSTELLATION_PLANNER.STATUSES[statusIndex];

  const handleCalculate = () => {
    if (!locationLoaded) return;
    if (location === null || locationSource === 'none') {
      dispatch('Error', STRINGS.PLANNER.NO_LOCATION);
      return;
    }
    setResultsState(null);
    const precision = COMPLEXITY_VALUES[complexity];
    sse.start('/api/planner/calculate', {
      period,
      month_precision: precision,
      night_precision: precision,
    });
  };

  const handleBack = () => {
    setResultsState(null);
    sse.reset();
  };

  const handleJumpToCached = () => {
    if (!cachedSession) return;
    setResultsState({ period: cachedSession.period, initialData: cachedSession.data });
  };

  const handleClearSession = () => {
    clearSession(CONSTELLATION_PLANNER_SLOT);
  };

  // Stable callback so PlannerResults' onLoaded effect doesn't refire on every render.
  const handleLoaded = useCallback((data: PlannerResultsResponse) => {
    setResultsState((prev) => {
      if (!prev) return prev;
      setSession(CONSTELLATION_PLANNER_SLOT, { data, period: prev.period });
      return prev;
    });
  }, []);

  if (resultsState) {
    return (
      <PlannerResults
        period={resultsState.period}
        initialData={resultsState.initialData}
        onLoaded={handleLoaded}
        onBack={handleBack}
      />
    );
  }

  const stage: 'idle' | 'loading' = sse.running ? 'loading' : 'idle';
  const hasSession = cachedSession !== null;

  return (
    <>
      <PanelHeader
        title={STRINGS.CONSTELLATION_PLANNER.TITLE}
        subtitle={STRINGS.CONSTELLATION_PLANNER.SUBTITLE}
        rightSlot={
          stage === 'idle' && hasSession ? (
            <ActiveSessionBadge onJump={handleJumpToCached} onClear={handleClearSession} />
          ) : undefined
        }
      />

      <div className="planner-stage">
        {stage === 'loading' ? (
          <PlannerLoading
            statuses={STRINGS.CONSTELLATION_PLANNER.STATUSES}
            statusIndex={statusIndex}
            statusText={statusText}
            percent={percent}
            eyebrow={STRINGS.CONSTELLATION_PLANNER.EYEBROW}
          />
        ) : (
          <div className="planner-idle fade-enter fade-in">
            <div className="pi-icon"><Icon name="constellation" size={36}/></div>
            <h3 className="pi-name">{feature.name}</h3>
            <p className="pi-desc">{STRINGS.CONSTELLATION_PLANNER.DESC}</p>

            <div className="period-row" role="radiogroup">
              {STRINGS.PLANNER.PERIODS.map(p => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={period === p}
                  className={'period-btn' + (period === p ? ' on' : '')}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <ComplexitySlider snap={complexity} onChange={setComplexity}/>

            <button className="btn primary calc-btn" onClick={handleCalculate}>
              <Icon name="play" size={12}/> {STRINGS.PLANNER.BTN_CALCULATE}
            </button>

            {hasSession && (
              <div className="planner-overwrite-note" role="note">
                <span className="pon-icon"><Icon name="info" size={12}/></span>
                <span>{STRINGS.PLANNER.OVERWRITE_NOTE}</span>
              </div>
            )}

            <div className="pi-foot">
              <span><b>{STRINGS.PLANNER.FOOTER_LAT}</b> {location ? formatLat(location.lat) : STRINGS.PLANNER.FOOTER_NO_LOCATION}</span>
              <span className="dotsep">·</span>
              <span><b>{STRINGS.PLANNER.FOOTER_LNG}</b> {location ? formatLng(location.lng) : STRINGS.PLANNER.FOOTER_NO_LOCATION}</span>
              <span className="dotsep">·</span>
              <span><b>{STRINGS.CONSTELLATION_PLANNER.FOOTER_SAMPLE}</b> {STRINGS.CONSTELLATION_PLANNER.FOOTER_SAMPLE_VAL}</span>
              <span className="dotsep">·</span>
              <span><b>{STRINGS.PLANNER.FOOTER_ENGINE}</b> {STRINGS.PLANNER.FOOTER_ENGINE_VAL}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
