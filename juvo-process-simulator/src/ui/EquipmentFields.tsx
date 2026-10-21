import type { ReactNode } from 'react';
import type { CostLineKind, DwellUnit, EquipmentSpec, Material, Ranged, SourceKind, SpecKey } from '../engine/types';
import { NumInput, Select, SourceBadge, TextInput } from './common';

export interface FieldsProps {
  spec: EquipmentSpec;
  advanced: boolean;
  onChange: <K extends SpecKey>(k: K, v: EquipmentSpec[K]) => void;
  isOverridden?: (k: SpecKey) => boolean;
  onReset?: (k: SpecKey) => void;
  /** Node-level units field (flowsheet only). */
  units?: { value: number; onChange: (v: number) => void };
}

const DWELL_SCALE: Record<DwellUnit, number> = { min: 1, h: 1 / 60, d: 1 / 1440 };

function Field({ label, k, p, children, unit }: { label: string; k?: SpecKey; p: FieldsProps; children: ReactNode; unit?: string }) {
  const src = k ? p.spec.sources[k]?.kind ?? 'placeholder' : undefined;
  const over = k && p.isOverridden?.(k);
  return (
    <div data-testid="field" className="min-w-0">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span>{label}{unit && <span className="text-slate-400"> ({unit})</span>}</span>
        {src && !p.advanced && <SourceBadge kind={src} title={p.spec.sources[k!]?.note} />}
        {over && (
          <button onClick={() => p.onReset?.(k!)} title="Reset to library value"
            className="rounded bg-violet-100 px-1 text-[10px] text-violet-900 dark:bg-violet-900/50 dark:text-violet-200">overridden ↺</button>
        )}
        {k && p.advanced && <SourcePicker k={k} p={p} />}
      </div>
      {children}
    </div>
  );
}

function SourcePicker({ k, p }: { k: SpecKey; p: FieldsProps }) {
  const cur = p.spec.sources[k] ?? { kind: 'placeholder' as SourceKind };
  return (
    <span className="ml-auto flex items-center gap-1">
      <select aria-label={`Source of ${k}`} value={cur.kind}
        onChange={(e) => p.onChange('sources', { ...p.spec.sources, [k]: { ...cur, kind: e.target.value as SourceKind, date: new Date().toISOString().slice(0, 10) } })}
        className="rounded border border-slate-200 bg-transparent px-0.5 text-[10px] dark:border-slate-700">
        {(['placeholder', 'quote', 'measured', 'calculated'] as SourceKind[]).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input aria-label={`Source note for ${k}`} placeholder="note" value={cur.note ?? ''}
        onChange={(e) => p.onChange('sources', { ...p.spec.sources, [k]: { ...cur, note: e.target.value } })}
        className="w-16 rounded border border-slate-200 bg-transparent px-1 text-[10px] dark:border-slate-700" />
    </span>
  );
}

function RangeInput({ r, onChange, advanced, label }: { r: Ranged; onChange: (r: Ranged) => void; advanced: boolean; label: string }) {
  if (!advanced) return <NumInput ariaLabel={label} value={r.typ} onChange={(v) => onChange({ ...r, typ: v })} />;
  return (
    <div className="grid grid-cols-3 gap-1">
      <NumInput ariaLabel={`${label} min`} value={r.min ?? r.typ} onChange={(v) => onChange({ ...r, min: v })} />
      <NumInput ariaLabel={label} value={r.typ} onChange={(v) => onChange({ ...r, typ: v })} className="font-semibold" />
      <NumInput ariaLabel={`${label} max`} value={r.max ?? r.typ} onChange={(v) => onChange({ ...r, max: v })} />
    </div>
  );
}

export function EquipmentFields(p: FieldsProps) {
  const { spec: s, onChange: set, advanced } = p;
  const dwellScale = DWELL_SCALE[s.dwellUnit] ?? 1;
  const simple = (
    <div className="grid grid-cols-2 gap-3">
      {s.kind === 'rate' ? (
        <Field label="Rate" unit={`cups/h${advanced ? ' min · typ · max' : ''}`} k="rate" p={p}>
          <RangeInput label="Rate" r={s.rate} advanced={advanced} onChange={(v) => set('rate', v)} />
        </Field>
      ) : (
        <Field label="Cups held per unit" unit="cups" k="cupsHeld" p={p}>
          <NumInput ariaLabel="Cups held" value={s.cupsHeld} onChange={(v) => set('cupsHeld', v)} />
        </Field>
      )}
      {p.units ? (
        <Field label="Number of units" p={p}>
          <NumInput ariaLabel="Number of units" step="1" value={p.units.value} onChange={(v) => p.units!.onChange(Math.max(0, Math.round(v)))} />
        </Field>
      ) : (
        <Field label="Currency" k="currency" p={p}>
          <Select ariaLabel="Currency" value={s.currency} onChange={(v) => set('currency', v)} options={[{ value: 'AUD', label: 'A$' }, { value: 'USD', label: 'US$' }]} className="w-full" />
        </Field>
      )}
      <Field label="Cost per unit" unit={s.currency === 'USD' ? 'US$' : 'A$'} k="cost" p={p}>
        <RangeInput label="Cost" r={s.cost} advanced={advanced} onChange={(v) => set('cost', v)} />
      </Field>
      <Field label="Power" unit="kW per unit" k="kW" p={p}>
        <RangeInput label="Power" r={s.kW} advanced={advanced} onChange={(v) => set('kW', v)} />
      </Field>
      <Field label="Footprint" unit="L × W m" k="L" p={p}>
        <div className="flex items-center gap-1">
          <NumInput ariaLabel="Length" value={s.L} onChange={(v) => set('L', v)} />
          <span className="text-slate-400">×</span>
          <NumInput ariaLabel="Width" value={s.W} onChange={(v) => set('W', v)} />
        </div>
      </Field>
      <Field label="Time in step" k="dwellMin" p={p}>
        <div className="flex gap-1">
          <NumInput ariaLabel="Time in step" value={s.dwellMin} scale={dwellScale} onChange={(v) => set('dwellMin', v)} />
          <select aria-label="Time unit" value={s.dwellUnit} onChange={(e) => set('dwellUnit', e.target.value as DwellUnit)}
            className="rounded border border-slate-300 bg-white px-1 text-sm dark:border-slate-600 dark:bg-slate-900">
            <option value="min">min</option><option value="h">h</option><option value="d">days</option>
          </select>
        </div>
      </Field>
    </div>
  );
  if (!advanced) return simple;

  const pctField = (label: string, k: 'oee' | 'usableFill' | 'loss' | 'duty' | 'maintPct', unit = '%') => (
    <Field label={label} unit={unit} k={k} p={p}>
      <NumInput ariaLabel={label} value={s[k]} scale={100} onChange={(v) => set(k, Math.max(0, Math.min(1, v)))} />
    </Field>
  );
  const numField = (label: string, k: 'operators' | 'life' | 'H' | 'clearance' | 'cupsHeld', unit?: string) => (
    <Field label={label} unit={unit} k={k} p={p}>
      <NumInput ariaLabel={label} value={s[k]} onChange={(v) => set(k, v)} />
    </Field>
  );
  return (
    <div className="space-y-4">
      {simple}
      <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
        <Field label="Type" k="kind" p={p}>
          <Select ariaLabel="Type" value={s.kind} onChange={(v) => set('kind', v)} className="w-full"
            options={[{ value: 'rate', label: 'Rate-limited' }, { value: 'storage', label: 'Storage (holds cups)' }]} />
        </Field>
        <Field label="Product state" k="state" p={p}>
          <Select ariaLabel="Product state" value={s.state} onChange={(v) => set('state', v)} className="w-full"
            options={[{ value: 'frozen', label: 'Frozen' }, { value: 'ambient', label: 'Out of freezer' }]} />
        </Field>
        {s.kind === 'rate' ? pctField('OEE', 'oee') : pctField('Usable fill', 'usableFill')}
        {s.kind === 'rate' && numField('Cups held per unit', 'cupsHeld', 'cups')}
        {pctField('Yield loss', 'loss')}
        {pctField('Duty', 'duty')}
        {numField('Operators per unit', 'operators')}
        {numField('Life', 'life', 'years')}
        {pctField('Maintenance', 'maintPct', '% of cost/yr')}
        {numField('Service clearance', 'clearance', 'm each side')}
        {numField('Height', 'H', 'm')}
        <Field label="Flags" p={p}>
          <div className="flex flex-col gap-0.5 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.alwaysOn} onChange={(e) => set('alwaysOn', e.target.checked)} /> Always on (24 h)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.sideStream} onChange={(e) => set('sideStream', e.target.checked)} /> Side stream</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.facilityOnly} onChange={(e) => set('facilityOnly', e.target.checked)} /> Floor plan only</label>
          </div>
        </Field>
      </div>
      <MaterialsEditor list={s.materials} onChange={(m) => set('materials', m)} />
      <CustomFieldsEditor spec={s} onChange={set} />
      <div>
        <div className="mb-0.5 text-xs text-slate-600 dark:text-slate-300">Notes</div>
        <textarea value={s.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
          className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
      </div>
    </div>
  );
}

export function MaterialsEditor({ list, onChange, title = 'Materials used per cup' }: { list: Material[]; onChange: (m: Material[]) => void; title?: string }) {
  const upd = (i: number, m: Partial<Material>) => onChange(list.map((x, j) => (j === i ? { ...x, ...m } : x)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>{title}</span>
        <button className="text-sky-600" onClick={() => onChange([...list, { name: 'New material', qty: 1, unit: 'each', price: 0, source: 'placeholder' }])}>+ Add</button>
      </div>
      {list.map((m, i) => (
        <div key={i} className="mb-1 grid grid-cols-[1fr_4rem_4.5rem_4.5rem_1.5rem] items-center gap-1">
          <TextInput value={m.name} onChange={(v) => upd(i, { name: v })} />
          <NumInput ariaLabel="Quantity" value={m.qty} onChange={(v) => upd(i, { qty: v })} />
          <select value={m.unit} onChange={(e) => upd(i, { unit: e.target.value as Material['unit'] })}
            className="rounded border border-slate-300 bg-white text-xs dark:border-slate-600 dark:bg-slate-900">
            <option value="g">g (A$/kg)</option><option value="each">each (A$)</option>
          </select>
          <NumInput ariaLabel="Price" value={m.price} onChange={(v) => upd(i, { price: v })} />
          <button aria-label="Remove material" onClick={() => onChange(list.filter((_, j) => j !== i))} className="text-slate-400">×</button>
        </div>
      ))}
    </div>
  );
}

function CustomFieldsEditor({ spec, onChange }: { spec: EquipmentSpec; onChange: FieldsProps['onChange'] }) {
  const list = spec.customFields;
  const upd = (i: number, c: Partial<EquipmentSpec['customFields'][number]>) => onChange('customFields', list.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>Custom fields (can add a cost line)</span>
        <button className="text-sky-600" onClick={() => onChange('customFields', [...list, { key: 'Calibration', value: 0, unit: 'A$', costType: 'none' }])}>+ Add</button>
      </div>
      {list.map((c, i) => (
        <div key={i} className="mb-1 grid grid-cols-[1fr_4.5rem_3rem_6.5rem_1.5rem] items-center gap-1">
          <TextInput value={c.key} onChange={(v) => upd(i, { key: v })} />
          <NumInput ariaLabel="Value" value={c.value} onChange={(v) => upd(i, { value: v })} />
          <TextInput value={c.unit} onChange={(v) => upd(i, { unit: v })} />
          <select value={c.costType} onChange={(e) => upd(i, { costType: e.target.value as CostLineKind })}
            className="rounded border border-slate-300 bg-white text-xs dark:border-slate-600 dark:bg-slate-900">
            <option value="none">Info only</option><option value="capex">CAPEX A$/unit</option>
            <option value="opex_month">OPEX A$/month/unit</option><option value="opex_cup">OPEX A$/cup</option>
          </select>
          <button aria-label="Remove field" onClick={() => onChange('customFields', list.filter((_, j) => j !== i))} className="text-slate-400">×</button>
        </div>
      ))}
    </div>
  );
}
