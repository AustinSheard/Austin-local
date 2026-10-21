import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider,
  getBezierPath, useReactFlow, type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { relieveBottleneck, resolveSpec, rightSize } from '../engine/engine';
import { flowWarnings, uid } from '../engine/library';
import type { Results, Scenario, StepResult } from '../engine';
import { templates } from '../data/templates';
import { useActive, useStore } from '../store/store';
import { Btn, SourceBadge } from './common';
import { fleet, mins, num, pct } from './format';
import { NodeEditor } from './NodeEditor';
import { PALETTE_ADD, PALETTE_DROP, Palette, type PaletteDrop } from './Palette';
import { effective, useResults } from './useResults';
import { Hint } from './Hints';
import { simulate } from '../engine/engine';

const ResultsCtx = createContext<Results | null>(null);

type PNode = Node<{ id: string }, 'process'>;

const ProcessNode = memo(function ProcessNode({ data, selected }: NodeProps<PNode>) {
  const r = useContext(ResultsCtx);
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const n = s.nodes.find((x) => x.id === data.id);
  if (!n) return null;
  const v = cat.variants.find((x) => x.id === n.variantId);
  const sp = resolveSpec(cat, n);
  const st = r?.steps.find((x) => x.id === n.id);
  const siblings = cat.variants.filter((x) => x.typeId === v?.typeId && !x.hidden);
  const util = st ? st.utilDemand : 0;
  const utilColour = util > 1 ? 'bg-red-500' : util > 0.85 ? 'bg-amber-500' : 'bg-emerald-500';
  const src = sp?.sources.rate?.kind ?? sp?.sources.cost?.kind ?? 'placeholder';
  const overridden = Object.keys(n.overrides).length > 0;
  const frozen = sp?.state === 'frozen';
  return (
    <div className={`w-48 rounded-lg border-2 bg-white p-2 text-[11px] shadow-sm dark:bg-slate-900 ${
      st?.isBottleneck ? 'border-red-500' : selected ? 'border-sky-500' : 'border-slate-200 dark:border-slate-700'}
      ${sp?.sideStream ? 'border-dashed' : ''}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
      <Handle type="source" id="bottom" position={Position.Bottom} className="!h-2.5 !w-2.5" />
      <Handle type="target" id="top" position={Position.Top} className="!h-2.5 !w-2.5" />
      <div className="mb-1 flex items-start gap-1">
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${frozen ? 'bg-sky-500' : 'bg-amber-500'}`} title={frozen ? 'Frozen' : 'Out of freezer'} />
        <div className="min-w-0 flex-1 font-semibold leading-tight">{n.label ?? v?.name ?? 'Missing equipment'}</div>
        {n.units > 1 && <span className="rounded bg-slate-100 px-1 dark:bg-slate-800">×{n.units}</span>}
      </div>
      {st?.isBottleneck && <div className="mb-1 rounded bg-red-100 px-1 font-semibold text-red-800 dark:bg-red-900/50 dark:text-red-200">Slowest step</div>}
      {sp?.sideStream && <div className="mb-1 text-slate-500">Side stream</div>}
      <div className="mb-1 h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800" title={`Utilisation ${pct(util)}`}>
        <div className={`h-1.5 rounded ${utilColour}`} style={{ width: `${Math.min(100, util * 100)}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-1 text-slate-600 dark:text-slate-300">
        <span>Use {pct(util)}</span>
        <span>{num(st?.capacityPerDay ?? 0)} cups/day</span>
        <span>{mins(sp?.dwellMin ?? 0)}</span>
        <span>{num(st?.connectedKW ?? 0, 1)} kW</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <SourceBadge kind={src} />
        {overridden && <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-900 dark:bg-violet-900/50 dark:text-violet-200">overridden</span>}
        {siblings.length > 1 && (
          <select aria-label="Swap variant" value={n.variantId} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const id = e.target.value;
              useStore.getState().update((sc) => ({ ...sc, nodes: sc.nodes.map((m) => (m.id === n.id ? { ...m, variantId: id, overrides: {} } : m)) }));
            }}
            className="nodrag ml-auto w-20 rounded border border-slate-200 bg-transparent text-[10px] dark:border-slate-700">
            {siblings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
});

type FEdge = Edge<{ step?: StepResult; frozen: boolean }>;
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<FEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const colour = data?.frozen ? '#0ea5e9' : '#f59e0b';
  const st = data?.step;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: colour, strokeWidth: selected ? 4 : 2.5 }} />
      {st && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
            className="pointer-events-none absolute rounded bg-white/90 px-1 text-[10px] leading-tight shadow-sm dark:bg-slate-900/90">
            {num(st.cupsOutPerHour)} cups/h
            {!data?.frozen && <span className="text-amber-600"> · {mins(st.oofClockMin)}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { process: ProcessNode };
const edgeTypes = { flow: FlowEdge };

function addNodeAt(s: Scenario, variantId: string, x: number, y: number, after?: string): { s: Scenario; id: string } {
  const st = useStore.getState();
  const v = st.catalogue.variants.find((m) => m.id === variantId);
  const id = uid('n');
  const node = { id, variantId, units: 1, overrides: {}, x, y };
  let edges = s.edges;
  if (after && v) {
    if (v.spec.sideStream) {
      edges = [...edges, { id: uid('e'), source: id, target: after }];
    } else {
      const outs = edges.filter((e) => e.source === after);
      edges = edges.filter((e) => e.source !== after)
        .concat({ id: uid('e'), source: after, target: id })
        .concat(outs.map((e) => ({ ...e, id: uid('e'), source: id })));
    }
  }
  st.touchRecent(variantId);
  return { s: { ...s, nodes: [...s.nodes, node], edges }, id };
}

function appendTemplate(s: Scenario, templateId: string, ox: number, oy: number): Scenario {
  const t = templates[templateId].build();
  const map = new Map(t.nodes.map((n) => [n.id, uid('n')]));
  const minX = Math.min(...t.nodes.map((n) => n.x));
  const minY = Math.min(...t.nodes.map((n) => n.y));
  return {
    ...s,
    nodes: [...s.nodes, ...t.nodes.map((n) => ({ ...n, id: map.get(n.id)!, x: n.x - minX + ox, y: n.y - minY + oy }))],
    edges: [...s.edges, ...t.edges.map((e) => ({ id: uid('e'), source: map.get(e.source)!, target: map.get(e.target)! }))],
  };
}

function Canvas() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const update = useStore((x) => x.update);
  const set = useStore((x) => x.set);
  const selectedNodeId = useStore((x) => x.selectedNodeId);
  const r = useResults();
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);

  const stepById = useMemo(() => new Map(r.steps.map((st) => [st.id, st])), [r]);
  const derived: PNode[] = useMemo(() => s.nodes.map((n) => ({
    id: n.id, type: 'process', position: { x: n.x, y: n.y }, data: { id: n.id }, selected: n.id === selectedNodeId,
  })), [s.nodes, selectedNodeId]);
  const [nodes, setNodes] = useState<PNode[]>(derived);
  useEffect(() => setNodes(derived), [derived]);

  const edges: FEdge[] = useMemo(() => s.edges.map((e) => {
    const src = s.nodes.find((n) => n.id === e.source);
    const sp = src ? resolveSpec(cat, src) : undefined;
    const tgt = s.nodes.find((n) => n.id === e.target);
    const tsp = tgt ? resolveSpec(cat, tgt) : undefined;
    return {
      id: e.id, source: e.source, target: e.target, type: 'flow',
      data: { step: sp?.sideStream ? undefined : stepById.get(e.source), frozen: sp?.state === 'frozen' && tsp?.state === 'frozen' },
    };
  }), [s.edges, s.nodes, cat, stepById]);

  const onNodesChange = useCallback((ch: NodeChange<PNode>[]) => {
    setNodes((ns) => applyNodeChanges(ch, ns));
    const removed = ch.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id);
    if (removed.length) {
      update((sc) => ({
        ...sc, nodes: sc.nodes.filter((n) => !removed.includes(n.id)),
        edges: sc.edges.filter((e) => !removed.includes(e.source) && !removed.includes(e.target)),
      }));
      set({ selectedNodeId: undefined, editorOpen: false });
    }
  }, [update, set]);

  const onNodeDragStop = useCallback((_: unknown, __: PNode, dragged: PNode[]) => {
    update((sc) => ({
      ...sc,
      nodes: sc.nodes.map((n) => {
        const d = dragged.find((x) => x.id === n.id);
        return d ? { ...n, x: Math.round(d.position.x), y: Math.round(d.position.y) } : n;
      }),
    }));
  }, [update]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    update((sc) => sc.edges.some((e) => e.source === c.source && e.target === c.target) ? sc
      : { ...sc, edges: [...sc.edges, { id: uid('e'), source: c.source!, target: c.target! }] });
  }, [update]);

  useEffect(() => {
    const drop = (ev: Event) => {
      const d = (ev as CustomEvent<PaletteDrop>).detail;
      const box = wrap.current?.getBoundingClientRect();
      if (!box || d.x < box.left || d.x > box.right || d.y < box.top || d.y > box.bottom) return;
      const p = rf.screenToFlowPosition({ x: d.x, y: d.y });
      if (d.templateId) update((sc) => appendTemplate(sc, d.templateId!, p.x, p.y));
      else if (d.variantId) {
        let newId = '';
        update((sc) => { const o = addNodeAt(sc, d.variantId!, p.x - 96, p.y - 40); newId = o.id; return o.s; });
        set({ selectedNodeId: newId });
      }
      useStore.getState().dismissHint('drag');
    };
    const add = (ev: Event) => {
      const d = (ev as CustomEvent<{ variantId?: string; templateId?: string }>).detail;
      const st = useStore.getState();
      const sc = st.scenarios.find((x) => x.id === st.activeId)!;
      const sel = sc.nodes.find((n) => n.id === st.selectedNodeId);
      const maxX = sc.nodes.length ? Math.max(...sc.nodes.map((n) => n.x)) : -260;
      if (d.templateId) { update((x) => appendTemplate(x, d.templateId!, 0, (Math.max(0, ...sc.nodes.map((n) => n.y)) + 320))); return; }
      const v = st.catalogue.variants.find((m) => m.id === d.variantId);
      const x = sel ? sel.x + (v?.spec.sideStream ? 0 : 260) : maxX + 260;
      const y = sel ? sel.y + (v?.spec.sideStream ? 200 : 0) : 40;
      if (sel && !v?.spec.sideStream) {
        // Shift downstream nodes right to make room.
        update((x0) => ({ ...x0, nodes: x0.nodes.map((n) => (n.y === sel.y && n.x > sel.x ? { ...n, x: n.x + 260 } : n)) }), false);
      }
      let newId = '';
      update((x0) => { const o = addNodeAt(x0, d.variantId!, x, y, sel?.id ?? (sc.nodes.length ? lastMain(x0) : undefined)); newId = o.id; return o.s; });
      set({ selectedNodeId: newId });
      useStore.getState().dismissHint('drag');
    };
    window.addEventListener(PALETTE_DROP, drop);
    window.addEventListener(PALETTE_ADD, add);
    return () => { window.removeEventListener(PALETTE_DROP, drop); window.removeEventListener(PALETTE_ADD, add); };
  }, [rf, update, set]);

  return (
    <ResultsCtx.Provider value={r}>
      <div ref={wrap} className="h-full w-full">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect}
          onEdgesDelete={(es) => update((sc) => ({ ...sc, edges: sc.edges.filter((e) => !es.some((x) => x.id === e.id)) }))}
          onNodeClick={(_, n) => { set({ selectedNodeId: n.id, editorOpen: true }); useStore.getState().dismissHint('tap'); }}
          onPaneClick={() => set({ selectedNodeId: undefined })}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} deleteKeyCode={['Delete', 'Backspace']} proOptions={{ hideAttribution: true }}>
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden md:!block" />
        </ReactFlow>
      </div>
    </ResultsCtx.Provider>
  );
}

function lastMain(s: Scenario): string | undefined {
  const cat = useStore.getState().catalogue;
  const r = simulate(s, cat);
  const main = r.steps.filter((x) => !x.sideStream);
  return main[main.length - 1]?.id;
}

export function Actions() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const update = useStore((x) => x.update);
  const notify = useStore((x) => x.notify);
  const switchTemplate = useStore((x) => x.switchTemplate);
  const undo = useStore((x) => x.undo);
  const redo = useStore((x) => x.redo);
  const canUndo = useStore((x) => x.past.length > 0);
  const canRedo = useStore((x) => x.future.length > 0);
  const addStation = () => {
    const rel = relieveBottleneck(effective(s, cat), cat);
    if (!rel) return notify('Add some equipment first.');
    update((sc) => ({ ...sc, nodes: rel.scenario.nodes }));
    notify(`Added a unit at ${rel.stepName}: ${fleet(rel.before)} → ${fleet(rel.after)}. Next limit: ${rel.nextName}.`);
  };
  const rightSizeAll = () => {
    update((sc) => rightSize(sc, cat));
    notify(`Right-sized every step to ${s.globals.targetUtil}% use at ${s.globals.fleet} machines.`);
  };
  return (
    <div className="flex flex-wrap gap-1">
      <Btn kind="primary" onClick={addStation}>Add a station to the slowest step</Btn>
      <Btn onClick={rightSizeAll}>Right-size everything</Btn>
      {s.templateId !== 'automated' && <Btn onClick={() => switchTemplate('automated')}>Try the automated line</Btn>}
      <Btn kind="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶ Undo</Btn>
      <Btn kind="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↷ Redo</Btn>
    </div>
  );
}

export function FlowsheetScreen() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const warnings = useMemo(() => flowWarnings(s, cat), [s, cat]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 md:block">
        <Palette />
      </aside>
      <div className="relative min-w-0 flex-1">
        <ReactFlowProvider><Canvas /></ReactFlowProvider>
        <div className="pointer-events-none absolute left-2 right-2 top-2 flex flex-col gap-2">
          <div className="pointer-events-auto"><Actions /></div>
          {warnings.length > 0 && (
            <div className="pointer-events-auto self-start">
              <button onClick={() => setShowWarn(!showWarn)} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                ⚠ {warnings.length} thing{warnings.length > 1 ? 's' : ''} to check
              </button>
              {showWarn && (
                <ul className="mt-1 max-w-md rounded bg-white p-2 text-xs shadow dark:bg-slate-900">
                  {warnings.map((w, i) => <li key={i}>• {w.message}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-col items-start gap-1">
            <Hint id="drag">Drag equipment in from the list{' '}<span className="md:hidden">(tap “Add equipment”)</span></Hint>
            <Hint id="tap">Tap a step to edit it</Hint>
          </div>
        </div>
        <button onClick={() => setPaletteOpen(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg md:hidden">
          + Add equipment
        </button>
        {paletteOpen && (
          <div className="fixed inset-0 z-40 flex items-end bg-black/20 md:hidden" onClick={() => setPaletteOpen(false)}>
            <div className="h-[70vh] w-full rounded-t-2xl bg-slate-50 dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
              <PaletteSheet onClose={() => setPaletteOpen(false)} />
            </div>
          </div>
        )}
      </div>
      <NodeEditor />
    </div>
  );
}

function PaletteSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener(PALETTE_ADD, close);
    window.addEventListener(PALETTE_DROP, close);
    return () => { window.removeEventListener(PALETTE_ADD, close); window.removeEventListener(PALETTE_DROP, close); };
  }, [onClose]);
  return <Palette onClose={onClose} />;
}

