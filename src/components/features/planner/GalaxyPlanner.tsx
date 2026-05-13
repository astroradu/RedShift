import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { GalaxyComplexitySlider, GALAXY_COMPLEXITIES } from './GalaxyComplexitySlider';
import { GalaxyPlannerResults } from './GalaxyPlannerResults';
import { PlannerLoading } from '../../shared/PlannerLoading';
import { PanelHeader } from '../../shared/PanelHeader';
import { CheckboxOption } from '../../shared/CheckboxOption';
import { ActiveSessionBadge } from '../../shared/ActiveSessionBadge';
import { useGalaxyPlannerCalculation } from '../../../hooks/useGalaxyPlannerCalculation';
import { useLocation } from '../../../hooks/useLocation';
import { dispatch } from '../../../lib/notifications';
import { STRINGS } from '../../../lib/strings';
import { formatLat, formatLng } from '../../../lib/formatLocation';
import { clearSession, setSession, useSessionSlot } from '../../../lib/sessionCache';
import { GALAXY_PLANNER_SLOT } from './sessions';
import type { Feature, GalaxyResultsResponse } from '../../../types';

const DEFAULT_COMPLEXITY_SNAP = 0; // index → night=3, month=5

interface AngSizeOption {
  label: string;
  value: number;
}

const ANG_SIZE_OPTIONS: ReadonlyArray<AngSizeOption> = [
  { label: 'All', value: 0 },
  { label: '> 3′', value: 3 },
  { label: '> 8′', value: 8 },
  { label: '> 12′', value: 12 },
  { label: '> 18′', value: 18 },
];

interface GalaxyPlannerProps {
  feature: Feature;
}

interface ResultsState {
  period: string;
  computeNonstandard: boolean;
  minAngularSize: number;
  initialData: GalaxyResultsResponse | null;
}

export function GalaxyPlanner({ feature }: GalaxyPlannerProps) {
  const [period, setPeriod] = useState<string>(STRINGS.PLANNER.PERIODS[1]);
  const [complexity, setComplexity] = useState<number>(DEFAULT_COMPLEXITY_SNAP);
  const [computeNonstandard, setComputeNonstandard] = useState<boolean>(false);
  const [minAngularSize, setMinAngularSize] = useState<number>(0);
  const [resultsState, setResultsState] = useState<ResultsState | null>(null);
  const sse = useGalaxyPlannerCalculation();
  const { location, source: locationSource, loaded: locationLoaded } = useLocation();
  const cachedSession = useSessionSlot(GALAXY_PLANNER_SLOT);

  useEffect(() => {
    if (sse.error) {
      dispatch('Error', sse.error);
      sse.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sse.error]);

  // SSE finished → enter the results view with the params live at SSE done.
  // The idle form can't be edited while loading, so period/etc are still the
  // values submitted at calc start. Guarded by `prev ?? ...` so this only
  // fires once per SSE completion.
  useEffect(() => {
    if (!sse.done) return;
    setResultsState((prev) => prev ?? {
      period,
      computeNonstandard,
      minAngularSize,
      initialData: null,
    });
  }, [sse.done, period, computeNonstandard, minAngularSize]);

  const percent = sse.progress?.percent ?? 0;
  const statusIndex = sse.progress?.status_index ?? 0;
  const statusText = sse.progress?.status ?? STRINGS.GALAXY_PLANNER.STATUSES[statusIndex];

  const handleCalculate = () => {
    if (!locationLoaded) return;
    if (location === null || locationSource === 'none') {
      dispatch('Error', STRINGS.PLANNER.NO_LOCATION);
      return;
    }
    const precision = GALAXY_COMPLEXITIES[complexity];
    setResultsState(null);
    sse.start('/api/galaxy-planner/calculate', {
      period,
      month_precision: precision.month,
      night_precision: precision.night,
      compute_nonstandard: computeNonstandard,
      min_angular_size: minAngularSize,
    });
  };

  const handleBack = () => {
    setResultsState(null);
    sse.reset();
  };

  const handleJumpToCached = () => {
    if (!cachedSession) return;
    setResultsState({
      period: cachedSession.period,
      computeNonstandard: cachedSession.computeNonstandard,
      minAngularSize: cachedSession.minAngularSize,
      initialData: cachedSession.data,
    });
  };

  const handleClearSession = () => {
    clearSession(GALAXY_PLANNER_SLOT);
  };

  const handleLoaded = useCallback((data: GalaxyResultsResponse) => {
    setResultsState((prev) => {
      if (!prev) return prev;
      setSession(GALAXY_PLANNER_SLOT, {
        data,
        period: prev.period,
        computeNonstandard: prev.computeNonstandard,
        minAngularSize: prev.minAngularSize,
      });
      return prev;
    });
  }, []);

  if (resultsState) {
    return (
      <GalaxyPlannerResults
        period={resultsState.period}
        computeNonstandard={resultsState.computeNonstandard}
        minAngularSize={resultsState.minAngularSize}
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
        title={STRINGS.GALAXY_PLANNER.TITLE}
        subtitle={STRINGS.GALAXY_PLANNER.SUBTITLE}
        rightSlot={
          stage === 'idle' && hasSession ? (
            <ActiveSessionBadge onJump={handleJumpToCached} onClear={handleClearSession} />
          ) : undefined
        }
      />

      <div className="planner-stage">
        {stage === 'loading' ? (
          <PlannerLoading
            statuses={STRINGS.GALAXY_PLANNER.STATUSES}
            statusIndex={statusIndex}
            statusText={statusText}
            percent={percent}
            eyebrow={STRINGS.GALAXY_PLANNER.EYEBROW}
          />
        ) : (
          <div className="planner-idle fade-enter fade-in">
            <div className="pi-icon"><Icon name="galaxy" size={36}/></div>
            <h3 className="pi-name">{feature.name}</h3>
            <p className="pi-desc">{STRINGS.GALAXY_PLANNER.DESC}</p>

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

            <GalaxyComplexitySlider snap={complexity} onChange={setComplexity}/>

            <div className="complexity-block">
              <div className="cb-row">
                <span className="cb-label">{STRINGS.GALAXY_PLANNER.ANG_SIZE_LABEL}</span>
              </div>
              <div className="period-row" role="radiogroup" aria-label={STRINGS.GALAXY_PLANNER.ANG_SIZE_ARIA} style={{ marginTop: 0 }}>
                {ANG_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    role="radio"
                    aria-checked={minAngularSize === opt.value}
                    className={'period-btn' + (minAngularSize === opt.value ? ' on' : '')}
                    onClick={() => setMinAngularSize(opt.value)}
                    style={{ flex: 1 }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <CheckboxOption
              checked={computeNonstandard}
              onChange={setComputeNonstandard}
              title={STRINGS.GALAXY_PLANNER.NONSTANDARD_TITLE}
              description={STRINGS.GALAXY_PLANNER.NONSTANDARD_DESC}
            />

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
              <span><b>{STRINGS.GALAXY_PLANNER.FOOTER_CATALOGUE}</b> {STRINGS.GALAXY_PLANNER.FOOTER_CATALOGUE_VAL}</span>
              <span className="dotsep">·</span>
              <span><b>{STRINGS.PLANNER.FOOTER_ENGINE}</b> {STRINGS.PLANNER.FOOTER_ENGINE_VAL}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
