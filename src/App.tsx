import { useState, useEffect, useRef, useCallback } from 'react';
import { TopBar } from './components/layout/TopBar';
import { Home } from './components/screens/Home';
import { Detail } from './components/screens/Detail';
import { Settings } from './components/screens/Settings';
import { applyPalette } from './lib/palettes';
import { dispatch } from './lib/notifications';
import { useBackendReady } from './hooks/useBackendReady';
import { usePalettes } from './hooks/usePalettes';
import { useLocation } from './hooks/useLocation';
import { useSettings } from './hooks/useSettings';
import { ToastLayer } from './components/layout/ToastLayer';
import type { Feature, Mode, View } from './types';
import { STRINGS } from './lib/strings';

export function App() {
  const [mode, setModeState]       = useState<Mode>('dark');
  const [palette, setPaletteState] = useState('ember');
  const [view, setView]       = useState<View>('home');
  const [prevView, setPrevView] = useState<View>('home');
  const [feature, setFeature] = useState<Feature | null>(null);

  const backend = useBackendReady();
  const { palettes } = usePalettes();
  const { settings, loaded: settingsLoaded, updateSettings } = useSettings();
  const { loaded: locationLoaded, source: locationSource, location } = useLocation();
  const startupAttemptedRef = useRef(false);
  const settingsSyncedRef = useRef(false);

  useEffect(() => {
    if (settings && !settingsSyncedRef.current) {
      settingsSyncedRef.current = true;
      setModeState(settings.mode);
      setPaletteState(settings.palette);
    }
  }, [settings]);

  useEffect(() => {
    if (palettes.length > 0) {
      applyPalette(palette, mode);
    }
  }, [palette, mode, palettes.length]);

  useEffect(() => {
    if (backend.status !== 'ready' || !locationLoaded || startupAttemptedRef.current) return;
    startupAttemptedRef.current = true;
    if (locationSource === 'none') {
      dispatch('Warning', STRINGS.APP.NO_LOCATION);
    }
  }, [backend.status, locationLoaded, locationSource]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    void updateSettings({ mode: next });
  }, [updateSettings]);

  const setPalette = useCallback((next: string) => {
    setPaletteState(next);
    void updateSettings({ palette: next });
  }, [updateSettings]);

  if (backend.status !== 'ready' || !settingsLoaded) {
    return (
      <>
        <div className="bg-canvas"/>
        <div className="bg-stars"/>
        <div className="bg-noise"/>
        <div className="boot-splash" data-state={backend.status}>
          <div className="boot-splash-mark" aria-hidden="true"/>
          <div className="boot-splash-line">
            {backend.status === 'error' ? (backend.error ?? STRINGS.APP.BOOT_FAILED) : STRINGS.APP.BOOT_INITIALISING}
          </div>
        </div>
      </>
    );
  }

  const goDetail   = (f: Feature) => { setFeature(f); setView('detail'); };
  const goHome     = () => setView('home');
  const goSettings = () => { setPrevView(view); setView('settings'); };
  const closeSettings = () => setView(prevView);

  return (
    <>
      <div className="bg-canvas"/>
      <div className="bg-stars"/>
      <div className="bg-noise"/>
      <ToastLayer/>
      <div
        className="app"
        data-screen-label={
          view === 'home'     ? STRINGS.APP.BREADCRUMB_HOME :
          view === 'settings' ? STRINGS.APP.BREADCRUMB_SETTINGS :
          STRINGS.APP.breadcrumbFeature(feature?.name ?? '')
        }
      >
        <TopBar
          theme={mode} setTheme={setMode}
          view={view} feature={feature}
          onHome={goHome} onSettings={goSettings}
        />
        {view === 'home' ? (
          <Home onPick={goDetail} location={location}/>
        ) : view === 'settings' ? (
          <Settings mode={mode} setMode={setMode} palette={palette} setPalette={setPalette} onClose={closeSettings}/>
        ) : feature ? (
          <Detail feature={feature}/>
        ) : null}
      </div>
    </>
  );
}
