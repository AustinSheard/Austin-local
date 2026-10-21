import { useMemo, useState } from 'react';
import { pickRange } from '../engine/engine';
import { landedCost, quoteStatus } from '../engine/quotes';
import type { Catalogue, Variant } from '../engine/types';
import { templates } from '../data/templates';
import { useActive, useStore } from '../store/store';
import { SourceBadge } from './common';
import { aud, num } from './format';

export type PaletteDrop = { variantId?: string; templateId?: string; x: number; y: number };
export const PALETTE_DROP = 'juvo-palette-drop';
export const PALETTE_ADD = 'juvo-palette-add';

/** Pointer-based drag so it works for touch and mouse. */
function startDrag(e: React.PointerEvent, payload: { variantId?: string; templateId?: string }, label: string) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost: HTMLDivElement | null = null;
  const move = (ev: PointerEvent) => {
    if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
      ghost = document.createElement('div');
      ghost.textContent = label;
      ghost.className = 'fixed z-50 pointer-events-none rounded-md bg-sky-600 px-2 py-1 text-xs text-white shadow-lg';
      document.body.appendChild(ghost);
    }
    if (ghost) {
      ghost.style.left = `${ev.clientX + 8}px`;
      ghost.style.top = `${ev.clientY + 8}px`;
      ev.preventDefault();
    }
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (ghost) {
      ghost.remove();
      window.dispatchEvent(new CustomEvent<PaletteDrop>(PALETTE_DROP, { detail: { ...payload, x: ev.clientX, y: ev.clientY } }));
    }
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
}

export function variantSummary(v: Variant, cat: Catalogue, usdToAud: number) {
  const s = v.spec;
  const cost = pickRange(s.cost, 'typ') * (s.currency === 'USD' ? usdToAud : 1);
  return {
    rate: s.kind === 'rate' ? `${num(s.rate.typ)} cups/h` : `${num(s.cupsHeld)} cups held`,
    cost: aud(cost),
    foot: `${s.L} × ${s.W} m`,
    kW: `${s.kW.typ} kW`,
    source: s.sources.cost?.kind ?? s.sources.rate?.kind ?? 'placeholder',
    type: cat.types.find((t) => t.id === v.typeId),
  };
}

function VariantCard({ v, compact }: { v: Variant; compact?: boolean }) {
  const cat = useStore((s) => s.catalogue);
  const quotes = useStore((s) => s.quotes);
  const favs = useStore((s) => s.favourites);
  const toggleFav = useStore((s) => s.toggleFavourite);
  const usd = useActive().globals.usdToAud;
  const sum = variantSummary(v, cat, usd);
  const q = quotes.find((x) => x.id === v.selectedQuoteId);
  const status = q ? quoteStatus(q) : undefined;
  const landed = q ? landedCost(q, usd).landedAUD : undefined;
  return (
    <div onPointerDown={(e) => startDrag(e, { variantId: v.id }, v.name)}
      className="group mb-1 flex cursor-grab touch-none select-none items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-xs hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium">{v.name}</span>
          <SourceBadge kind={sum.source} />
          {status === 'expired' && <span className="text-[10px] text-red-600">quote expired</span>}
          {status === 'expiring' && <span className="text-[10px] text-amber-600">quote expiring</span>}
        </div>
        {!compact && (
          <div className="text-slate-500 dark:text-slate-400">
            {sum.rate} · {landed !== undefined ? `${aud(landed)} landed` : sum.cost} · {sum.foot} · {sum.kW}
          </div>
        )}
      </div>
      <button aria-label="Favourite" onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleFav(v.id)}
        className={favs.includes(v.id) ? 'text-amber-500' : 'text-slate-300 group-hover:text-slate-400'}>★</button>
      <button aria-label={`Add ${v.name}`} onPointerDown={(e) => e.stopPropagation()}
        onClick={() => window.dispatchEvent(new CustomEvent(PALETTE_ADD, { detail: { variantId: v.id } }))}
        className="rounded bg-sky-600 px-1.5 text-white">+</button>
    </div>
  );
}

export function Palette({ onClose }: { onClose?: () => void }) {
  const cat = useStore((s) => s.catalogue);
  const quotes = useStore((s) => s.quotes);
  const favs = useStore((s) => s.favourites);
  const recent = useStore((s) => s.recent);
  const [q, setQ] = useState('');
  const [cat_, setCat] = useState('all');
  const [fromQuote, setFromQuote] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => cat.variants.filter((v) => !v.hidden), [cat]);
  const match = (v: Variant) => {
    const t = cat.types.find((x) => x.id === v.typeId);
    const text = `${v.name} ${t?.name} ${t?.category} ${v.supplier ?? ''}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (cat_ !== 'all' && t?.category !== cat_) return false;
    if (fromQuote && !(v.quoteIds?.length || quotes.some((x) => x.variantId === v.id))) return false;
    return true;
  };
  const filtering = q || cat_ !== 'all' || fromQuote;
  const byId = (id: string) => visible.find((v) => v.id === id);
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <input placeholder="Search equipment" value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900" />
        {onClose && <button onClick={onClose} className="px-2 text-xl">×</button>}
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        <select value={cat_} onChange={(e) => setCat(e.target.value)} aria-label="Category"
          className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900">
          <option value="all">All categories</option>
          {cat.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={fromQuote} onChange={(e) => setFromQuote(e.target.checked)} />From quote</label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtering ? (
          visible.filter(match).map((v) => <VariantCard key={v.id} v={v} />)
        ) : (
          <>
            {favs.length > 0 && <h4 className="mb-1 text-xs font-semibold text-slate-500">Favourites</h4>}
            {favs.map(byId).filter(Boolean).map((v) => <VariantCard key={'f' + v!.id} v={v!} compact />)}
            {recent.length > 0 && <h4 className="mb-1 mt-2 text-xs font-semibold text-slate-500">Recently used</h4>}
            {recent.map(byId).filter(Boolean).map((v) => <VariantCard key={'r' + v!.id} v={v!} compact />)}
            <h4 className="mb-1 mt-2 text-xs font-semibold text-slate-500">Process templates</h4>
            {Object.entries(templates).filter(([id]) => id !== 'blank').map(([id, t]) => (
              <div key={id} onPointerDown={(e) => startDrag(e, { templateId: id }, t.name)}
                className="mb-1 flex cursor-grab touch-none select-none items-center justify-between rounded-md border border-dashed border-slate-300 p-2 text-xs dark:border-slate-600">
                <span>{t.name} line</span>
                <button onPointerDown={(e) => e.stopPropagation()} className="rounded bg-sky-600 px-1.5 text-white"
                  onClick={() => window.dispatchEvent(new CustomEvent(PALETTE_ADD, { detail: { templateId: id } }))}>+</button>
              </div>
            ))}
            {cat.categories.map((c) => (
              <div key={c}>
                <h4 className="mb-1 mt-2 text-xs font-semibold text-slate-500">{c}</h4>
                {cat.types.filter((t) => t.category === c).map((t) => {
                  const vs = visible.filter((v) => v.typeId === t.id);
                  const def = vs.find((v) => v.id === t.defaultVariantId) ?? vs[0];
                  if (!def) return null;
                  return (
                    <div key={t.id}>
                      <div className="flex items-center gap-1">
                        <button aria-label={`Show variants of ${t.name}`} onClick={() => setOpen({ ...open, [t.id]: !open[t.id] })}
                          className="w-4 text-slate-400">{open[t.id] ? '▾' : '▸'}</button>
                        <div className="min-w-0 flex-1"><VariantCard v={{ ...def, name: t.name }} /></div>
                      </div>
                      {open[t.id] && <div className="ml-5">{vs.map((v) => <VariantCard key={v.id} v={v} />)}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
