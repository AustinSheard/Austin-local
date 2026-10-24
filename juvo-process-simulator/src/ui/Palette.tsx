import { useMemo, useState } from 'react';
import { uid } from '../engine/library';
import { pickRange } from '../engine/engine';
import { landedCost, quoteStatus } from '../engine/quotes';
import type { Catalogue, EquipmentType, Variant } from '../engine/types';
import { templates } from '../data/templates';
import { useActive, useStore } from '../store/store';
import { Btn, NumInput, SourceBadge, TextInput } from './common';
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

/** Mouse drags from anywhere on a card; touch drags only from the grip so the list scrolls freely. */
function dragProps(payload: { variantId?: string; templateId?: string }, label: string) {
  return {
    card: { onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') startDrag(e, payload, label); } },
    grip: {
      onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); startDrag(e, payload, label); },
      className: 'cursor-grab touch-none select-none px-1 text-base leading-none text-slate-400',
      'aria-label': `Drag ${label}`,
      title: 'Drag onto the flowsheet',
    },
  };
}

const addToSheet = (detail: { variantId?: string; templateId?: string }) =>
  window.dispatchEvent(new CustomEvent(PALETTE_ADD, { detail }));

function VariantCard({ v, label }: { v: Variant; label?: string }) {
  const cat = useStore((s) => s.catalogue);
  const quotes = useStore((s) => s.quotes);
  const favs = useStore((s) => s.favourites);
  const toggleFav = useStore((s) => s.toggleFavourite);
  const usd = useActive().globals.usdToAud;
  const sum = variantSummary(v, cat, usd);
  const q = quotes.find((x) => x.id === v.selectedQuoteId);
  const status = q ? quoteStatus(q) : undefined;
  const landed = q ? landedCost(q, usd).landedAUD : undefined;
  const name = label ?? v.name;
  const d = dragProps({ variantId: v.id }, name);
  return (
    <div {...d.card} className="group mb-1 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1.5 text-xs hover:border-sky-400 dark:border-slate-700 dark:bg-slate-900 md:cursor-grab">
      <span {...d.grip}>⠿</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium">{name}</span>
          <SourceBadge kind={sum.source} />
          {status === 'expired' && <span className="text-[10px] text-red-600">expired</span>}
          {status === 'expiring' && <span className="text-[10px] text-amber-600">expiring</span>}
        </div>
        <div className="truncate text-slate-500 dark:text-slate-400">
          {sum.rate} · {landed !== undefined ? `${aud(landed)} landed` : sum.cost} · {sum.kW}
        </div>
      </div>
      <button aria-label="Favourite" onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleFav(v.id)}
        className={`px-1 ${favs.includes(v.id) ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
      <button aria-label={`Add ${name}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => addToSheet({ variantId: v.id })}
        className="h-7 w-7 shrink-0 rounded bg-sky-600 text-sm text-white">+</button>
    </div>
  );
}

/** Make a new variant of a type from a few numbers, save it to the library and drop it on the flowsheet. */
function CustomForm({ type, onDone }: { type: EquipmentType; onDone: () => void }) {
  const cat = useStore((s) => s.catalogue);
  const setCatalogue = useStore((s) => s.setCatalogue);
  const notify = useStore((s) => s.notify);
  const base = cat.variants.find((v) => v.id === type.defaultVariantId)!;
  const storage = base.spec.kind === 'storage';
  const [name, setName] = useState(`${type.name} (my rates)`);
  const [rate, setRate] = useState(base.spec.rate.typ);
  const [rateMin, setRateMin] = useState(base.spec.rate.min ?? base.spec.rate.typ);
  const [rateMax, setRateMax] = useState(base.spec.rate.max ?? base.spec.rate.typ);
  const [perMin, setPerMin] = useState(false);
  const [held, setHeld] = useState(base.spec.cupsHeld);
  const [cost, setCost] = useState(base.spec.cost.typ);
  const [kW, setKW] = useState(base.spec.kW.typ);
  const [ops, setOps] = useState(base.spec.operators);
  const k = perMin ? 60 : 1;
  const save = () => {
    const note = { kind: 'measured' as const, note: 'Entered by you', date: new Date().toISOString().slice(0, 10) };
    const v: Variant = {
      id: uid(`${type.id}.user`), typeId: type.id, name: name || `${type.name} (custom)`, userMade: true,
      spec: {
        ...base.spec,
        rate: { min: rateMin * k, typ: rate * k, max: rateMax * k },
        cupsHeld: held, cost: { typ: cost }, currency: 'AUD', kW: { typ: kW }, operators: ops,
        sources: { ...base.spec.sources, ...(storage ? { cupsHeld: note } : { rate: note }), cost: note, kW: note, operators: note },
      },
    };
    setCatalogue((c) => ({ ...c, variants: [...c.variants, v] }));
    setTimeout(() => addToSheet({ variantId: v.id }), 0);
    notify(`Saved “${v.name}” to the list and added it to the flowsheet.`);
    onDone();
  };
  const field = (label: string, el: React.ReactNode) => <label className="block text-[11px] text-slate-600 dark:text-slate-300">{label}{el}</label>;
  return (
    <div className="mb-2 ml-5 space-y-1.5 rounded-md border border-sky-300 bg-sky-50 p-2 dark:border-sky-800 dark:bg-sky-950">
      {field('Name', <TextInput value={name} onChange={setName} />)}
      {storage ? field('Cups held per unit', <NumInput ariaLabel="Cups held" value={held} onChange={setHeld} />) : (
        <>
          <div className="flex items-center justify-between text-[11px]">
            <span>Rate</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={perMin} onChange={(e) => setPerMin(e.target.checked)} />per minute</label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {field('Min', <NumInput ariaLabel="Rate min" value={rateMin} onChange={setRateMin} />)}
            {field(`Typical (cups/${perMin ? 'min' : 'h'})`, <NumInput ariaLabel="Rate" value={rate} onChange={setRate} />)}
            {field('Max', <NumInput ariaLabel="Rate max" value={rateMax} onChange={setRateMax} />)}
          </div>
        </>
      )}
      <div className="grid grid-cols-3 gap-1">
        {field('Cost (A$)', <NumInput ariaLabel="Cost" value={cost} onChange={setCost} />)}
        {field('Power (kW)', <NumInput ariaLabel="Power" value={kW} onChange={setKW} />)}
        {field('Operators', <NumInput ariaLabel="Operators" value={ops} onChange={setOps} />)}
      </div>
      <div className="flex gap-1">
        <Btn kind="primary" onClick={save}>Save and add</Btn>
        <Btn kind="ghost" onClick={onDone}>Cancel</Btn>
      </div>
    </div>
  );
}

function TypeRow({ t, visible }: { t: EquipmentType; visible: Variant[] }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const vs = visible.filter((v) => v.typeId === t.id && !v.id.endsWith('.custom'));
  const def = vs.find((v) => v.id === t.defaultVariantId) ?? vs[0];
  if (!def) return null;
  return (
    <div>
      <div className="flex items-center">
        {vs.length > 1
          ? <button aria-label={`Show variants of ${t.name}`} onClick={() => setOpen(!open)} className="w-5 shrink-0 text-slate-400">{open ? '▾' : '▸'}</button>
          : <span className="w-5 shrink-0" />}
        <div className="min-w-0 flex-1"><VariantCard v={def} label={t.name} /></div>
      </div>
      {open && <div className="ml-5">{vs.map((v) => <VariantCard key={v.id} v={v} />)}</div>}
      {t.id !== 'blank' && !def.spec.facilityOnly && (custom
        ? <CustomForm type={t} onDone={() => setCustom(false)} />
        : <button onClick={() => setCustom(true)} className="mb-1.5 ml-6 text-[11px] text-sky-700 hover:underline dark:text-sky-300">+ Custom {t.name.toLowerCase()} (enter your own rates)</button>)}
    </div>
  );
}

export function Palette({ onClose }: { onClose?: () => void }) {
  const cat = useStore((s) => s.catalogue);
  const quotes = useStore((s) => s.quotes);
  const favs = useStore((s) => s.favourites);
  const recent = useStore((s) => s.recent);
  const [q, setQ] = useState('');
  const [fromQuote, setFromQuote] = useState(false);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => cat.variants.filter((v) => !v.hidden), [cat]);
  const match = (v: Variant) => {
    const t = cat.types.find((x) => x.id === v.typeId);
    const text = `${v.name} ${t?.name} ${t?.category} ${v.supplier ?? ''}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (fromQuote && !(v.quoteIds?.length || quotes.some((x) => x.variantId === v.id))) return false;
    return !v.id.endsWith('.custom');
  };
  const filtering = q || fromQuote;
  const byId = (id: string) => visible.find((v) => v.id === id);
  const jump = (c: string) => {
    setOpenCats((o) => ({ ...o, [c]: true }));
    setTimeout(() => document.getElementById(`pal-${c}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-1.5 border-b border-slate-200 p-2 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <input placeholder="Search equipment" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
          {onClose && <button aria-label="Close list" onClick={onClose} className="px-2 text-2xl leading-none">×</button>}
        </div>
        <div className="-mx-2 flex gap-1 overflow-x-auto px-2 pb-0.5 text-xs">
          {cat.categories.map((c) => (
            <button key={c} onClick={() => jump(c)} className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">{c}</button>
          ))}
          <label className="flex shrink-0 items-center gap-1 px-1"><input type="checkbox" checked={fromQuote} onChange={(e) => setFromQuote(e.target.checked)} />From quote</label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-24 pt-1 md:pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {filtering ? (
          visible.filter(match).map((v) => <VariantCard key={v.id} v={v} />)
        ) : (
          <>
            {favs.length > 0 && <h4 className="mb-1 mt-1 text-xs font-semibold text-slate-500">Favourites</h4>}
            {favs.map(byId).filter(Boolean).map((v) => <VariantCard key={'f' + v!.id} v={v!} />)}
            {recent.length > 0 && <h4 className="mb-1 mt-2 text-xs font-semibold text-slate-500">Recently used</h4>}
            {recent.map(byId).filter(Boolean).slice(0, 4).map((v) => <VariantCard key={'r' + v!.id} v={v!} />)}
            {cat.categories.map((c) => {
              const open = openCats[c] ?? false;
              const types = cat.types.filter((t) => t.category === c);
              return (
                <div key={c} id={`pal-${c}`} className="scroll-mt-1">
                  <button onClick={() => setOpenCats({ ...openCats, [c]: !open })}
                    className="sticky top-0 z-10 mb-1 mt-1 flex w-full items-center justify-between rounded bg-slate-100 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span>{open ? '▾' : '▸'} {c}</span><span className="font-normal text-slate-500">{types.length}</span>
                  </button>
                  {open && types.map((t) => <TypeRow key={t.id} t={t} visible={visible} />)}
                </div>
              );
            })}
            <h4 className="mb-1 mt-3 text-xs font-semibold text-slate-500">Whole lines</h4>
            {Object.entries(templates).filter(([id]) => id !== 'blank').map(([id, t]) => {
              const d = dragProps({ templateId: id }, t.name);
              return (
                <div key={id} {...d.card} className="mb-1 flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-1 py-1.5 text-xs dark:border-slate-600">
                  <span {...d.grip}>⠿</span>
                  <span className="flex-1">{t.name}</span>
                  <button onPointerDown={(e) => e.stopPropagation()} className="h-7 w-7 rounded bg-sky-600 text-sm text-white" onClick={() => addToSheet({ templateId: id })}>+</button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
