import { lazy, Suspense, useEffect, useState } from 'react';
import { templates } from './data/templates';
import { useActive, useStore, type MorePage, type Screen } from './store/store';
import { FlowsheetScreen } from './ui/Flowsheet';
import { ResultsScreen, ResultStrip } from './ui/Results';

const FloorPlanScreen = lazy(() => import('./ui/FloorPlan').then((m) => ({ default: m.FloorPlanScreen })));
const MoreView = lazy(() => import('./ui/more/More').then((m) => ({ default: m.MoreView })));

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'flowsheet', label: 'Flowsheet' },
  { id: 'results', label: 'Results' },
  { id: 'floor', label: 'Floor plan' },
];
const MORE: { id: Exclude<MorePage, null>; label: string }[] = [
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'scaleup', label: 'Scale-up' },
  { id: 'compare', label: 'Compare' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'library', label: 'Library' },
  { id: 'import', label: 'Import a quote' },
  { id: 'settings', label: 'Settings' },
];

function UndoRedo() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const cls = 'flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-35 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';
  return (
    <div className="flex gap-1">
      <button className={cls} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶<span className="hidden sm:inline">Undo</span></button>
      <button className={cls} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y or Ctrl+Shift+Z)" aria-label="Redo">↷<span className="hidden sm:inline">Redo</span></button>
    </div>
  );
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!mq?.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);
}

function useUndoKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo(); else useStore.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useTheme();
  useUndoKeys();
  const screen = useStore((s) => s.screen);
  const more = useStore((s) => s.more);
  const mode = useStore((s) => s.mode);
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);
  const switchTemplate = useStore((s) => s.switchTemplate);
  const toast = useStore((s) => s.toast);
  const active = useActive();
  const [menu, setMenu] = useState(false);
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mr-1 whitespace-nowrap text-sm font-bold">Juvo Process Simulator</h1>
        <select aria-label="Template" value={active.templateId ?? ''} onChange={(e) => switchTemplate(e.target.value)}
          className="max-w-[11rem] rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
          {!active.templateId && <option value="">{active.name}</option>}
          {Object.entries(templates).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
        </select>
        <nav className="order-last flex w-full gap-1 md:order-none md:w-auto">
          {SCREENS.map((sc) => (
            <button key={sc.id} onClick={() => set({ screen: sc.id, more: null })}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm md:flex-none ${screen === sc.id && !more ? 'bg-sky-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {sc.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <UndoRedo />
          <div role="group" aria-label="Mode" className="flex rounded-md border border-slate-300 text-xs dark:border-slate-600">
            {(['simple', 'advanced'] as const).map((m) => (
              <button key={m} onClick={() => set({ mode: m })}
                className={`px-2 py-1 ${mode === m ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : ''}`}>{m === 'simple' ? 'Simple' : 'Advanced'}</button>
            ))}
          </div>
          <button aria-label="Toggle dark mode" title="Light or dark" className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => set({ settings: { ...settings, theme: isDark ? 'light' : 'dark' } })}>{isDark ? '☀' : '☾'}</button>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className={`rounded-md px-3 py-1.5 text-sm ${more ? 'bg-sky-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>More ▾</button>
            {menu && (
              <div className="absolute right-0 z-50 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900" onMouseLeave={() => setMenu(false)}>
                {MORE.filter((m) => m.id !== 'import' || mode === 'advanced').map((m) => (
                  <button key={m.id} onClick={() => { set({ more: m.id }); setMenu(false); }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{m.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <ResultStrip />
      <main className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<div className="p-4 text-sm">Loading…</div>}>
          {more ? <MoreView page={more} /> : screen === 'flowsheet' ? <FlowsheetScreen /> : screen === 'results' ? <ResultsScreen /> : <FloorPlanScreen />}
        </Suspense>
      </main>
      {toast && (
        <div role="status" className="fixed bottom-16 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900 md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
