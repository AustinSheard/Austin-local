import { create } from 'zustand';
import rawCatalogue from '../data/catalogue.json';
import { seedQuotes } from '../data/quotes';
import { roomPresets, templates } from '../data/templates';
import { uid } from '../engine/library';
import type { Catalogue, Quote, RoomPreset, Scenario } from '../engine/types';

export type Screen = 'flowsheet' | 'results' | 'floor';
export type MorePage = 'scenarios' | 'scaleup' | 'compare' | 'quotes' | 'library' | 'settings' | 'import' | null;

export interface Settings {
  apiEnabled: boolean;
  proxyUrl: string;
  theme: 'light' | 'dark' | 'system';
}

interface Persisted {
  catalogue: Catalogue;
  quotes: Quote[];
  scenarios: Scenario[];
  activeId: string;
  mode: 'simple' | 'advanced';
  hints: Record<string, boolean>;
  favourites: string[];
  recent: string[];
  settings: Settings;
  presets: RoomPreset[];
}

interface State extends Persisted {
  screen: Screen;
  more: MorePage;
  selectedNodeId?: string;
  editorOpen: boolean;
  editingVariantId?: string;
  /** Arrow chosen with “Insert equipment here”; the next palette add goes on it. */
  insertEdgeId?: string;
  past: Scenario[];
  future: Scenario[];
  toast?: string;
  // actions
  set: (p: Partial<State>) => void;
  update: (fn: (s: Scenario) => Scenario, record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  switchTemplate: (templateId: string) => void;
  addScenario: (s: Scenario) => void;
  setActive: (id: string) => void;
  setCatalogue: (fn: (c: Catalogue) => Catalogue) => void;
  setQuotes: (fn: (q: Quote[]) => Quote[]) => void;
  touchRecent: (variantId: string) => void;
  toggleFavourite: (id: string) => void;
  dismissHint: (id: string) => void;
  notify: (msg: string) => void;
}

const KEY = 'juvo-process-simulator/v1';
export const seedCatalogue = rawCatalogue as unknown as Catalogue;

function initial(): Persisted {
  const first = templates.midland.build();
  return {
    catalogue: seedCatalogue,
    quotes: seedQuotes,
    scenarios: [first],
    activeId: first.id,
    mode: 'simple',
    hints: {},
    favourites: [],
    recent: [],
    settings: { apiEnabled: true, proxyUrl: '/api/extract', theme: 'system' },
    presets: roomPresets,
  };
}

function load(): Persisted {
  const base = initial();
  try {
    const text = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!text) return base;
    const saved = JSON.parse(text) as Partial<Persisted>;
    const merged = { ...base, ...saved };
    if (!merged.scenarios?.length || !merged.scenarios.some((s) => s.id === merged.activeId)) {
      merged.scenarios = merged.scenarios?.length ? merged.scenarios : base.scenarios;
      merged.activeId = merged.scenarios[0].id;
    }
    return merged;
  } catch {
    return base;
  }
}

const LIMIT = 100;

export const useStore = create<State>((set, get) => ({
  ...load(),
  screen: 'flowsheet',
  more: null,
  editorOpen: false,
  past: [],
  future: [],
  set: (p) => set(p),
  update: (fn, record = true) => {
    const st = get();
    const cur = st.scenarios.find((s) => s.id === st.activeId)!;
    const next = fn(cur);
    if (next === cur) return;
    set({
      scenarios: st.scenarios.map((s) => (s.id === cur.id ? next : s)),
      past: record ? [...st.past, cur].slice(-LIMIT) : st.past,
      future: record ? [] : st.future,
    });
  },
  undo: () => {
    const st = get();
    const prev = st.past[st.past.length - 1];
    if (!prev) return;
    const cur = st.scenarios.find((s) => s.id === st.activeId)!;
    set({
      scenarios: st.scenarios.map((s) => (s.id === cur.id ? prev : s)),
      past: st.past.slice(0, -1),
      future: [cur, ...st.future],
    });
  },
  redo: () => {
    const st = get();
    const nxt = st.future[0];
    if (!nxt) return;
    const cur = st.scenarios.find((s) => s.id === st.activeId)!;
    set({
      scenarios: st.scenarios.map((s) => (s.id === cur.id ? nxt : s)),
      past: [...st.past, cur],
      future: st.future.slice(1),
    });
  },
  switchTemplate: (templateId) => {
    const st = get();
    const existing = st.scenarios.find((s) => s.templateId === templateId);
    if (existing) {
      set({ activeId: existing.id, past: [], future: [], selectedNodeId: undefined, editorOpen: false });
      return;
    }
    const s = { ...templates[templateId].build(), id: uid('sc') };
    s.globals.fleet = st.scenarios.find((x) => x.id === st.activeId)?.globals.fleet ?? s.globals.fleet;
    set({ scenarios: [...st.scenarios, s], activeId: s.id, past: [], future: [], selectedNodeId: undefined, editorOpen: false });
  },
  addScenario: (s) => set((st) => ({ scenarios: [...st.scenarios, s], activeId: s.id, past: [], future: [] })),
  setActive: (id) => set({ activeId: id, past: [], future: [], selectedNodeId: undefined, editorOpen: false }),
  setCatalogue: (fn) => set((st) => ({ catalogue: fn(st.catalogue) })),
  setQuotes: (fn) => set((st) => ({ quotes: fn(st.quotes) })),
  touchRecent: (id) => set((st) => ({ recent: [id, ...st.recent.filter((x) => x !== id)].slice(0, 6) })),
  toggleFavourite: (id) => set((st) => ({
    favourites: st.favourites.includes(id) ? st.favourites.filter((x) => x !== id) : [...st.favourites, id],
  })),
  dismissHint: (id) => set((st) => ({ hints: { ...st.hints, [id]: true } })),
  notify: (msg) => {
    set({ toast: msg });
    setTimeout(() => { if (get().toast === msg) set({ toast: undefined }); }, 4000);
  },
}));

export const useActive = () => useStore((s) => s.scenarios.find((x) => x.id === s.activeId)!);

// Persist the durable parts (debounced).
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s) => {
  if (typeof localStorage === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const p: Persisted = {
      catalogue: s.catalogue, quotes: s.quotes, scenarios: s.scenarios, activeId: s.activeId, mode: s.mode,
      hints: s.hints, favourites: s.favourites, recent: s.recent, settings: s.settings, presets: s.presets,
    };
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
  }, 300);
});

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  useStore.setState({ ...initial(), past: [], future: [], selectedNodeId: undefined, editorOpen: false });
}
