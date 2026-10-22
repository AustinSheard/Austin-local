import { useState } from 'react';
import { resolveSpec } from '../engine/engine';
import { isOverridden, moveStep, removeAndBridge, resetOverride, saveNodeAsVariant, setOverride, uid } from '../engine/library';
import { quoteStatus } from '../engine/quotes';
import type { EquipmentSpec, SpecKey } from '../engine/types';
import { useActive, useStore } from '../store/store';
import { Btn, TextInput } from './common';
import { EquipmentFields } from './EquipmentFields';
import { mins, num, pct } from './format';
import { useResults } from './useResults';
import { Sheet } from './common';

export function NodeEditor() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const quotes = useStore((x) => x.quotes);
  const mode = useStore((x) => x.mode);
  const open = useStore((x) => x.editorOpen);
  const id = useStore((x) => x.selectedNodeId);
  const set = useStore((x) => x.set);
  const update = useStore((x) => x.update);
  const setCatalogue = useStore((x) => x.setCatalogue);
  const notify = useStore((x) => x.notify);
  const r = useResults();
  const [saveName, setSaveName] = useState<string | null>(null);
  const found = s.nodes.find((n) => n.id === id);
  if (!found || !open) return null;
  const node = found;
  const v = cat.variants.find((x) => x.id === node.variantId);
  const spec = resolveSpec(cat, node);
  const st = r.steps.find((x) => x.id === node.id);
  const close = () => set({ editorOpen: false });
  const patchNode = (fn: (n: typeof node) => typeof node) => update((sc) => ({ ...sc, nodes: sc.nodes.map((n) => (n.id === node.id ? fn(n) : n)) }));
  const siblings = cat.variants.filter((x) => x.typeId === v?.typeId && !x.hidden);
  const q = quotes.find((x) => x.id === v?.selectedQuoteId);
  const qs = q ? quoteStatus(q) : undefined;

  if (!spec || !v) {
    return (
      <Sheet open onClose={close} title="Missing equipment">
        <p className="text-sm">This step points to equipment that is no longer in the library.</p>
        <Btn kind="danger" onClick={() => { update((sc) => ({ ...sc, nodes: sc.nodes.filter((n) => n.id !== node.id), edges: sc.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); close(); }}>Delete step</Btn>
      </Sheet>
    );
  }

  const onChange = <K extends SpecKey>(k: K, val: EquipmentSpec[K]) => patchNode((n) => setOverride(n, k, val));
  return (
    <Sheet open onClose={close} title={
      <div className="flex flex-col">
        <input aria-label="Step name" value={node.label ?? v.name} onChange={(e) => patchNode((n) => ({ ...n, label: e.target.value }))}
          className="rounded bg-transparent text-base font-semibold hover:bg-slate-100 dark:hover:bg-slate-800" />
        <span className="text-xs font-normal text-slate-500">{v.supplier ? `${v.supplier} · ` : ''}{cat.types.find((t) => t.id === v.typeId)?.name}</span>
      </div>
    }>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">Swap variant</label>
        <select aria-label="Swap variant" value={node.variantId}
          onChange={(e) => patchNode((n) => ({ ...n, variantId: e.target.value, overrides: {} }))}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
          {siblings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {qs === 'expired' && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">The quote behind this price has expired. Check the price with {q?.supplier}.</p>}
      {qs === 'expiring' && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">The quote behind this price expires on {q?.validUntil}.</p>}
      {st && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded bg-slate-50 p-2 text-xs dark:bg-slate-800">
          <div><div className="text-slate-500">Use</div><b>{pct(st.utilDemand)}</b></div>
          <div><div className="text-slate-500">Capacity</div><b>{num(st.capacityPerDay)} cups/day</b></div>
          <div><div className="text-slate-500">Time in step</div><b>{mins(st.dwellMin)}</b></div>
          {st.isBottleneck && <div className="col-span-3 font-semibold text-red-600">This is the slowest step.</div>}
        </div>
      )}
      <EquipmentFields spec={spec} advanced={mode === 'advanced'} onChange={onChange}
        isOverridden={(k) => isOverridden(node, k)} onReset={(k) => patchNode((n) => resetOverride(n, k))}
        units={{ value: node.units, onChange: (u) => patchNode((n) => ({ ...n, units: u })) }} />
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        {!spec.sideStream && <>
          <Btn title="Swap with the step before" onClick={() => update((sc) => moveStep(sc, cat, node.id, 'earlier'))}>← Move earlier</Btn>
          <Btn title="Swap with the step after" onClick={() => update((sc) => moveStep(sc, cat, node.id, 'later'))}>Move later →</Btn>
        </>}
        <Btn onClick={() => patchNode((n) => ({ ...n, units: n.units + 1 }))}>Add a station</Btn>
        <Btn onClick={() => {
          const nid = uid('n');
          update((sc) => ({ ...sc, nodes: [...sc.nodes, { ...node, id: nid, x: node.x + 30, y: node.y + 140 }] }));
          set({ selectedNodeId: nid });
        }}>Duplicate</Btn>
        {isOverridden(node) && <Btn onClick={() => patchNode((n) => resetOverride(n))}>Reset to library</Btn>}
        <Btn onClick={() => setSaveName(`${node.label ?? v.name} (my version)`)}>Save to palette</Btn>
        <Btn kind="danger" onClick={() => {
          update((sc) => removeAndBridge(sc, node.id));
          set({ editorOpen: false, selectedNodeId: undefined });
        }}>Delete</Btn>
      </div>
      {saveName !== null && (
        <div className="mt-3 flex gap-2">
          <TextInput value={saveName} onChange={setSaveName} />
          <Btn kind="primary" onClick={() => {
            const out = saveNodeAsVariant(cat, node, saveName || 'My variant');
            setCatalogue(() => out.catalogue);
            patchNode((n) => ({ ...n, variantId: out.variant.id, overrides: {} }));
            setSaveName(null);
            notify(`Saved “${out.variant.name}” to the palette.`);
          }}>Save</Btn>
        </div>
      )}
      {mode === 'simple' && <p className="mt-3 text-xs text-slate-500">Switch to Advanced for OEE, yield loss, operators, materials and quotes.</p>}
    </Sheet>
  );
}
