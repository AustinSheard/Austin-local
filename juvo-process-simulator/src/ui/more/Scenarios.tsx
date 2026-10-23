import { useMemo, useState } from 'react';
import { rightSize, simulate, withFleet } from '../../engine/engine';
import { footprint } from '../../engine/footprint';
import { uid } from '../../engine/library';
import { DEFAULT_FLEETS, sweep } from '../../engine/sweep';
import type { RangePick, Scenario } from '../../engine/types';
import { useActive, useStore } from '../../store/store';
import { Btn, Card, NumInput, Select, Table, TextInput } from '../common';
import { MaterialsEditor } from '../EquipmentFields';
import { aud, download, fleet, mins, num, pickFile } from '../format';
import { effective } from '../useResults';
import { templates } from '../../data/templates';

export function ScenariosPage() {
  const scenarios = useStore((s) => s.scenarios);
  const activeId = useStore((s) => s.activeId);
  const set = useStore((s) => s.set);
  const setActive = useStore((s) => s.setActive);
  const addScenario = useStore((s) => s.addScenario);
  const notify = useStore((s) => s.notify);
  const active = useActive();
  const update = useStore((s) => s.update);
  const mode = useStore((s) => s.mode);
  const rename = (id: string, name: string) => set({ scenarios: scenarios.map((s) => (s.id === id ? { ...s, name } : s)) });
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3">
      <Card title="Scenarios" right={
        <div className="flex gap-1">
          <Btn onClick={() => download('juvo-scenarios.json', JSON.stringify({ kind: 'juvo-scenarios', scenarios }, null, 2))}>Export</Btn>
          <Btn onClick={async () => {
            const f = await pickFile('.json,application/json');
            if (!f) return;
            try {
              const o = JSON.parse(await f.text());
              const list: Scenario[] = Array.isArray(o) ? o : o.scenarios ?? [o];
              const fresh = list.filter((x) => x && Array.isArray(x.nodes)).map((x) => ({ ...x, id: uid('sc'), templateId: undefined }));
              if (!fresh.length) throw new Error('No scenarios in file');
              set({ scenarios: [...scenarios, ...fresh] });
              notify(`Imported ${fresh.length} scenario${fresh.length > 1 ? 's' : ''}.`);
            } catch (e) { notify(`Could not import: ${(e as Error).message}`); }
          }}>Import</Btn>
        </div>
      }>
        <p className="mb-2 text-xs text-slate-500">Scenarios are saved in this browser. The template switcher opens the scenario made from that template; duplicate one to keep a variation.</p>
        {scenarios.map((s) => (
          <div key={s.id} className={`mb-1 flex flex-wrap items-center gap-2 rounded p-1 ${s.id === activeId ? 'bg-sky-50 dark:bg-sky-950' : ''}`}>
            <TextInput value={s.name} onChange={(v) => rename(s.id, v)} className="min-w-[12rem] flex-1" />
            <span className="text-xs text-slate-500">{s.nodes.length} steps · {s.globals.fleet} machines</span>
            {s.id !== activeId && <Btn onClick={() => { setActive(s.id); set({ more: null, screen: 'flowsheet' }); }}>Open</Btn>}
            <Btn onClick={() => addScenario({ ...JSON.parse(JSON.stringify(s)), id: uid('sc'), name: `${s.name} (copy)`, templateId: undefined })}>Duplicate</Btn>
            {s.templateId && templates[s.templateId] && (
              <Btn title="Replace this flowsheet with the latest template. Your fleet size is kept." onClick={() => {
                if (!confirm(`Reset “${s.name}” to the latest ${templates[s.templateId!].name} template? Changes to its steps will be lost.`)) return;
                const fresh = { ...templates[s.templateId!].build(), id: s.id };
                fresh.globals = { ...fresh.globals, fleet: s.globals.fleet };
                set({ scenarios: scenarios.map((x) => (x.id === s.id ? fresh : x)), past: [], future: [] });
                notify(`Reset to the latest ${templates[s.templateId!].name} template.`);
              }}>Reset to template</Btn>
            )}
            <Btn kind="danger" disabled={scenarios.length < 2} onClick={() => {
              if (!confirm(`Delete “${s.name}”?`)) return;
              const rest = scenarios.filter((x) => x.id !== s.id);
              set({ scenarios: rest, activeId: s.id === activeId ? rest[0].id : activeId, past: [], future: [] });
            }}>Delete</Btn>
          </div>
        ))}
      </Card>
      {mode === 'advanced' && (
        <Card title={`Custom materials and cost lines for “${active.name}”`}>
          <MaterialsEditor title="Extra materials per good cup" list={active.extraMaterials} onChange={(m) => update((s) => ({ ...s, extraMaterials: m }))} />
          <div className="mt-3 mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Custom cost lines (freight, licence, calibration…)</span>
            <button className="text-sky-600" onClick={() => update((s) => ({ ...s, costLines: [...s.costLines, { name: 'Freight', amount: 0, kind: 'capex' }] }))}>+ Add</button>
          </div>
          {active.costLines.map((c, i) => (
            <div key={i} className="mb-1 grid grid-cols-[1fr_6rem_9rem_1.5rem] gap-1">
              <TextInput value={c.name} onChange={(v) => update((s) => ({ ...s, costLines: s.costLines.map((x, j) => (j === i ? { ...x, name: v } : x)) }))} />
              <NumInput value={c.amount} onChange={(v) => update((s) => ({ ...s, costLines: s.costLines.map((x, j) => (j === i ? { ...x, amount: v } : x)) }))} />
              <Select value={c.kind} onChange={(v) => update((s) => ({ ...s, costLines: s.costLines.map((x, j) => (j === i ? { ...x, kind: v } : x)) }))}
                options={[{ value: 'capex', label: 'CAPEX A$' }, { value: 'opex_month', label: 'OPEX A$/month' }, { value: 'opex_cup', label: 'OPEX A$/cup' }]} />
              <button onClick={() => update((s) => ({ ...s, costLines: s.costLines.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function ComparePage() {
  const scenarios = useStore((s) => s.scenarios);
  const cat = useStore((s) => s.catalogue);
  const [ids, setIds] = useState<string[]>(scenarios.slice(0, 3).map((s) => s.id));
  const [fl, setFl] = useState(useActive().globals.fleet);
  const [sized, setSized] = useState(false);
  const chosen = scenarios.filter((s) => ids.includes(s.id));
  const results = useMemo(() => chosen.map((s) => {
    let sc = withFleet(effective(s, cat), fl);
    if (sized) sc = rightSize(sc, cat);
    return { s, r: simulate(sc, cat), fp: footprint(sc, cat) };
  }), [chosen, cat, fl, sized]);
  type Row = { label: string; get: (x: (typeof results)[number]) => number; fmt: (v: number) => string; best: 'min' | 'max' };
  const rows: Row[] = [
    { label: 'Good cups/day', get: (x) => x.r.output, fmt: (v) => num(v), best: 'max' },
    { label: 'Supported fleet', get: (x) => x.r.supportedFleet, fmt: fleet, best: 'max' },
    { label: 'Cost per cup', get: (x) => x.r.perCup.total, fmt: (v) => aud(v, 2), best: 'min' },
    { label: 'CAPEX', get: (x) => x.r.capex.total, fmt: (v) => aud(v), best: 'min' },
    { label: 'Cash OPEX per month', get: (x) => x.r.monthly.cashOpex, fmt: (v) => aud(v), best: 'min' },
    { label: 'Labour (FTE)', get: (x) => x.r.labour.fte, fmt: (v) => num(v, 1), best: 'min' },
    { label: 'Connected power (kW)', get: (x) => x.r.power.connectedKW, fmt: (v) => num(v, 1), best: 'min' },
    { label: 'Out-of-freezer window', get: (x) => x.r.residence.oofWindowMin, fmt: mins, best: 'min' },
    { label: 'Floor area needed (m²)', get: (x) => x.fp.requiredM2, fmt: (v) => num(v, 1), best: 'min' },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <Card title="Compare scenarios">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          {scenarios.map((s) => (
            <label key={s.id} className="flex items-center gap-1">
              <input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds(e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />{s.name}
            </label>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Shared fleet
            <input type="range" min={1} max={300} value={fl} onChange={(e) => setFl(+e.target.value)} className="accent-sky-600" />
            <span className="w-24">{fl} machines</span>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={sized} onChange={(e) => setSized(e.target.checked)} />Right-size each</label>
        </div>
        <Table head={['', ...results.map((x) => x.s.name)]} rows={[
          ['Slowest step', ...results.map((x) => x.r.bottleneckName ?? '–')],
          ...rows.map((row) => {
            const vals = results.map(row.get).filter(Number.isFinite);
            const best = vals.length ? (row.best === 'min' ? Math.min(...vals) : Math.max(...vals)) : NaN;
            return [row.label, ...results.map((x) => {
              const v = row.get(x);
              const isBest = results.length > 1 && v === best;
              return <span className={isBest ? 'rounded bg-emerald-100 px-1 font-semibold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100' : ''}>{row.fmt(v)}</span>;
            })];
          }),
        ]} />
      </Card>
    </div>
  );
}

function LineChart({ title, series, fmt }: { title: string; series: { name: string; colour: string; pts: [number, number][]; dashed?: boolean }[]; fmt: (v: number) => string }) {
  const all = series.flatMap((s) => s.pts).filter(([, y]) => Number.isFinite(y));
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = 0, y1 = Math.max(...ys) * 1.05 || 1;
  const W = 320, H = 160, L = 48, B = 20;
  const px = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - 16);
  const py = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - B - 6);
  return (
    <Card title={title}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 6} y1={py(y1 * f)} y2={py(y1 * f)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={0.5} />
            <text x={L - 4} y={py(y1 * f)} fontSize={9} textAnchor="end" dominantBaseline="middle" className="fill-slate-500">{fmt(y1 * f)}</text>
          </g>
        ))}
        {[x0, (x0 + x1) / 2, x1].map((x) => <text key={x} x={px(x)} y={H - 6} fontSize={9} textAnchor="middle" className="fill-slate-500">{Math.round(x)}</text>)}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.colour} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined}
            points={s.pts.filter(([, y]) => Number.isFinite(y)).map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} />
        ))}
      </svg>
      <div className="flex gap-3 text-xs">{series.map((s) => <span key={s.name} style={{ color: s.colour }}>{s.dashed ? '- -' : '—'} {s.name}</span>)}</div>
    </Card>
  );
}

export function ScaleUpPage() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const [pick, setPick] = useState<RangePick>('typ');
  const data = useMemo(() => sweep(effective(s, cat), cat, DEFAULT_FLEETS, pick), [s, cat, pick]);
  const ser = (k: 'cogs' | 'capex' | 'fte' | 'area') => [
    { name: 'As built', colour: '#f59e0b', pts: data.map((d) => [d.fleet, d.built[k]] as [number, number]) },
    { name: 'Right-sized', colour: '#0284c7', pts: data.map((d) => [d.fleet, d.sized[k]] as [number, number]), dashed: true },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <Card title={`Scale-up: ${s.name}`} right={
        <Select ariaLabel="Assumption set" value={pick} onChange={setPick} options={[{ value: 'min', label: 'Low' }, { value: 'typ', label: 'Typical' }, { value: 'max', label: 'High' }]} />
      }>
        <p className="text-sm text-slate-600 dark:text-slate-300">“As built” keeps today's units, so it falls short of demand past its limit. “Right-sized” adds units so no step runs above {s.globals.targetUtil}%. Low and high use the min and max of rate, price and power ranges.</p>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <LineChart title="Cost per cup (A$)" series={ser('cogs')} fmt={(v) => v.toFixed(2)} />
        <LineChart title="CAPEX (A$)" series={ser('capex')} fmt={(v) => `${Math.round(v / 1000)}k`} />
        <LineChart title="Labour (FTE)" series={ser('fte')} fmt={(v) => v.toFixed(1)} />
        <LineChart title="Floor area (m²)" series={ser('area')} fmt={(v) => v.toFixed(0)} />
      </div>
      <Card title="Table">
        <Table head={['Fleet', 'Cost/cup as built', 'Cost/cup right-sized', 'CAPEX right-sized', 'FTE right-sized', 'Area right-sized (m²)']} rows={data.map((d) => [
          d.fleet, <span className={d.built.short ? 'text-red-600' : ''}>{aud(d.built.cogs, 2)}{d.built.short ? ' (short)' : ''}</span>,
          aud(d.sized.cogs, 2), aud(d.sized.capex), num(d.sized.fte, 1), num(d.sized.area, 0),
        ])} />
      </Card>
    </div>
  );
}
