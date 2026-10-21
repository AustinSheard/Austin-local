import { useEffect, useMemo, useRef, useState } from 'react';
import { autoArrange, bodyRect, footprint, haloRect, layoutIssues } from '../engine/footprint';
import { uid } from '../engine/library';
import type { FloorLayout, PlacedItem } from '../engine/types';
import { useActive, useStore } from '../store/store';
import { Btn, Card, NumInput, Stat } from './common';
import { aud, num, pct } from './format';
import { Actions } from './Flowsheet';

const GRID = 0.1;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function FloorPlanScreen() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const update = useStore((x) => x.update);
  const presets = useStore((x) => x.presets);
  const set = useStore((x) => x.set);
  const lay = s.layout;
  const fp = useMemo(() => footprint(s, cat), [s, cat]);
  const issues = useMemo(() => layoutIssues(lay), [lay]);
  const bad = new Set(issues.flatMap((i) => i.ids));
  const [sel, setSel] = useState<string>();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<PlacedItem[] | null>(null);
  const items = live ?? lay.items;
  useEffect(() => {
    // First visit: lay the line out so the plan is never empty.
    if (!lay.items.length && s.nodes.length) update((sc) => ({ ...sc, layout: { ...sc.layout, items: autoArrange(sc, cat, GRID) } }), false);
  }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLayout = (fn: (l: FloorLayout) => FloorLayout, record = true) => update((sc) => ({ ...sc, layout: fn(sc.layout) }), record);
  const toMetres = (cx: number, cy: number) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const m = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: m.x, y: m.y };
  };
  const onDown = (e: React.PointerEvent, it: PlacedItem) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toMetres(e.clientX, e.clientY);
    drag.current = { id: it.id, dx: p.x - it.x, dy: p.y - it.y, moved: false };
    setSel(it.id);
    setLive(lay.items);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toMetres(e.clientX, e.clientY);
    d.moved = true;
    setLive((cur) => (cur ?? lay.items).map((it) => (it.id === d.id ? { ...it, x: snap(p.x - d.dx), y: snap(p.y - d.dy) } : it)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && live) setLayout((l) => ({ ...l, items: live }));
    setLive(null);
  };
  const rotate = (id: string) => setLayout((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, rot: (((it.rot + 90) % 360) as PlacedItem['rot']) } : it)) }));
  const remove = (id: string) => setLayout((l) => ({ ...l, items: l.items.filter((it) => it.id !== id) }));
  const facilityTypes = cat.variants.filter((v) => v.spec.facilityOnly && !v.hidden && !v.id.endsWith('.custom'));
  const unplaced = s.nodes.reduce((a, n) => a + Math.max(0, n.units - lay.items.filter((it) => it.nodeId === n.id).length), 0);
  const selected = items.find((it) => it.id === sel);
  const pad = 0.5;

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <Card title="Room" right={
          <div className="flex flex-wrap gap-1">
            <Btn kind="primary" onClick={() => setLayout((l) => ({ ...l, items: autoArrange(s, cat, GRID) }))}>Auto-arrange</Btn>
            <Btn kind="ghost" onClick={() => useStore.getState().undo()}>↶</Btn>
            <Btn kind="ghost" onClick={() => useStore.getState().redo()}>↷</Btn>
          </div>
        }>
          <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
            <label className="w-24">Length (m)<NumInput ariaLabel="Room length" value={lay.roomL} onChange={(v) => setLayout((l) => ({ ...l, roomL: Math.max(1, v), presetId: undefined }))} /></label>
            <label className="w-24">Width (m)<NumInput ariaLabel="Room width" value={lay.roomW} onChange={(v) => setLayout((l) => ({ ...l, roomW: Math.max(1, v), presetId: undefined }))} /></label>
            <label className="w-24">Ceiling (m)<NumInput ariaLabel="Ceiling height" value={lay.ceilingH} onChange={(v) => setLayout((l) => ({ ...l, ceilingH: v }))} /></label>
            <label className="min-w-[10rem]">Facility preset
              <select value={lay.presetId ?? ''} className="block w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                onChange={(e) => {
                  const p = presets.find((x) => x.id === e.target.value);
                  if (!p) return;
                  setLayout((l) => ({ ...l, presetId: p.id, roomL: p.L ?? l.roomL, roomW: p.W ?? l.roomW, ceilingH: p.ceilingH ?? l.ceilingH }));
                }}>
                <option value="">Custom</option>
                {presets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.L && p.W ? ` (${p.L} × ${p.W} m)` : ' (no size yet)'}</option>)}
              </select>
            </label>
            {lay.presetId && (
              <Btn onClick={() => set({ presets: presets.map((p) => (p.id === lay.presetId ? { ...p, L: lay.roomL, W: lay.roomW, ceilingH: lay.ceilingH } : p)) })}>Save size to preset</Btn>
            )}
          </div>
          {lay.presetId && !presets.find((p) => p.id === lay.presetId)?.L && (
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">This preset has no measured size yet. Enter the room size and press “Save size to preset”.</p>
          )}
          {unplaced > 0 && <p className="mb-2 text-xs text-slate-500">{unplaced} unit{unplaced > 1 ? 's are' : ' is'} not on the plan yet. Press Auto-arrange to place them.</p>}
          <div className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <svg ref={svg} viewBox={`${-pad} ${-pad} ${lay.roomL + 2 * pad} ${lay.roomW + 2 * pad}`} className="h-auto max-h-[60vh] w-full touch-none select-none"
              onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerDown={() => setSel(undefined)}>
              <defs>
                <pattern id="g" width="1" height="1" patternUnits="userSpaceOnUse">
                  <path d="M 1 0 L 0 0 0 1" fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="0.02" />
                </pattern>
              </defs>
              <rect x={0} y={0} width={lay.roomL} height={lay.roomW} fill="url(#g)" className="stroke-slate-500" strokeWidth={0.05} />
              {items.map((it) => {
                const b = bodyRect(it);
                const h = haloRect(it);
                const isBad = bad.has(it.id);
                const frozen = it.variantId ? cat.variants.find((v) => v.id === it.variantId)?.spec.state === 'frozen' : false;
                return (
                  <g key={it.id} onPointerDown={(e) => onDown(e, it)} onDoubleClick={() => rotate(it.id)} className="cursor-move">
                    {it.clearance > 0 && <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="none" strokeDasharray="0.1 0.08" strokeWidth={0.03} className={isBad ? 'stroke-red-500' : 'stroke-slate-400'} />}
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={0.05} strokeWidth={sel === it.id ? 0.08 : 0.04}
                      className={`${isBad ? 'fill-red-200 stroke-red-600 dark:fill-red-900' : it.nodeId ? (frozen ? 'fill-sky-100 stroke-sky-600 dark:fill-sky-900' : 'fill-amber-100 stroke-amber-600 dark:fill-amber-900') : 'fill-slate-200 stroke-slate-500 dark:fill-slate-700'}`} />
                    <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={Math.min(0.22, (b.w * 1.7) / Math.min(it.label.length, 24), b.h / 2)} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none fill-slate-800 dark:fill-slate-100">
                      {it.label.length > 24 ? it.label.slice(0, 22) + '…' : it.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {selected ? (
              <>
                <span className="font-medium">{selected.label}</span>
                <span className="text-slate-500">{selected.L} × {selected.W} m, clearance {selected.clearance} m</span>
                <Btn onClick={() => rotate(selected.id)}>Rotate 90°</Btn>
                <Btn kind="danger" onClick={() => { remove(selected.id); setSel(undefined); }}>Remove from plan</Btn>
              </>
            ) : <span className="text-xs text-slate-500">Drag items to move (snaps to 10 cm). Double-tap or use Rotate to turn 90°. Dashed line is the service clearance.</span>}
          </div>
        </Card>
        <Card title="Facility items (floor plan only)">
          <div className="flex flex-wrap gap-1">
            {facilityTypes.map((v) => (
              <Btn key={v.id} onClick={() => setLayout((l) => ({
                ...l, items: [...l.items, { id: uid('f'), variantId: v.id, label: v.name, x: 0.2, y: 0.2, L: v.spec.L, W: v.spec.W, clearance: v.spec.clearance, rot: 0 }],
              }))}>+ {v.name}</Btn>
            ))}
          </div>
        </Card>
        <div className="md:hidden"><Actions /></div>
      </div>
      <div className="space-y-3">
        {issues.length > 0 && (
          <Card title={<span className="text-red-600">Layout warnings</span>}>
            <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">{issues.map((i, k) => <li key={k}>• {i.message}</li>)}</ul>
          </Card>
        )}
        <Card title="Footprint">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Equipment" value={`${num(fp.equipmentM2, 1)} m²`} />
            <Stat label="Clearance" value={`${num(fp.clearanceM2, 1)} m²`} />
            <Stat label={`Aisles (${lay.aislePct}%)`} value={`${num(fp.aisleM2, 1)} m²`} />
            <Stat label="Cold storage" value={`${num(fp.coldStorageM2, 1)} m² · ${num(fp.coldStorageM3, 1)} m³`} />
            <Stat label="Facility items" value={`${num(fp.facilityM2, 1)} m²`} />
            <Stat label="Total needed" value={`${num(fp.requiredM2, 1)} m²`} />
            <Stat label="Room" value={`${num(fp.roomM2, 1)} m²`} />
            <Stat label="Room used" value={pct(fp.utilisation)} warn={fp.utilisation > 1} />
            <Stat label="Spare" value={`${num(fp.spareM2, 1)} m²`} warn={fp.spareM2 < 0} />
            <Stat label="Per machine supported" value={`${num(fp.m2PerMachine, 2)} m²`} />
            <Stat label="Minimum room needed" value={`${num(fp.minRoomSide, 1)} × ${num(fp.minRoomSide, 1)} m`} />
          </div>
        </Card>
        <Card title="Footprint settings and cost">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Aisle allowance (%)<NumInput value={lay.aislePct} onChange={(v) => setLayout((l) => ({ ...l, aislePct: v }))} /></label>
            <label>Packing density (cups/m³)<NumInput value={lay.cupsPerM3} onChange={(v) => setLayout((l) => ({ ...l, cupsPerM3: v }))} /></label>
            <label>Fit-out (A$/m²)<NumInput value={lay.fitOutPerM2} onChange={(v) => setLayout((l) => ({ ...l, fitOutPerM2: v }))} /></label>
            <label>Cool room (A$/m³)<NumInput value={lay.coolRoomPerM3} onChange={(v) => setLayout((l) => ({ ...l, coolRoomPerM3: v }))} /></label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lay.linkFitOut} onChange={(e) => setLayout((l) => ({ ...l, linkFitOut: e.target.checked }))} />
            Use floor area for fit-out cost ({aud(fp.fitOutAUD)})
          </label>
          <p className="mt-1 text-xs text-slate-500">Cool room estimate by volume: {aud(fp.coolRoomAUD)}. Fit-out and rates are placeholders.</p>
        </Card>
      </div>
    </div>
  );
}
