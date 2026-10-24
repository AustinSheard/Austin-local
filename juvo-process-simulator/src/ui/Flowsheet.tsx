import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider,
  ConnectionMode, MarkerType, getBezierPath, reconnectEdge, useReactFlow, type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { relieveBottleneck, resolveSpec, rightSize } from '../engine/engine';
import { flowWarnings, insertOnEdge, moveStep, removeAndBridge, uid } from '../engine/library';
import type { Results, Scenario, StepResult } from '../engine';
import { templates } from '../data/templates';
import { useActive, useStore } from '../store/store';
import { Btn, SourceBadge } from './common';
import { fleet, mins, num, pct } from './format';
import { NodeEditor } from './NodeEditor';
import { PALETTE_ADD, PALETTE_DROP, Palette, type PaletteDrop } from './Palette';
import { effective, useResults } from './useResults';
import { Hint } from './Hints';
import { ROLES, roleOf, type Role } from './roles';
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
  const role = ROLES[roleOf(v?.typeId, sp?.sideStream)];
  return (
    <div style={{ borderLeftColor: role.colour, borderLeftWidth: 6 }} className={`w-48 rounded-lg border-2 bg-white p-2 text-[11px] shadow-sm dark:bg-slate-900 ${
      st?.isBottleneck ? 'border-red-500' : selected ? 'border-sky-500' : 'border-slate-200 dark:border-slate-700'}
      ${sp?.sideStream ? 'border-dashed' : ''}`}>
      {SIDES.map((side) => (
        <span key={side}>
          <Handle type="source" id={`s-${side}`} position={POS[side]} className="!h-2.5 !w-2.5" />
          <Handle type="target" id={`t-${side}`} position={POS[side]} className="!h-2.5 !w-2.5 !opacity-0" />
        </span>
      ))}
      {SIDES.map((side) => {
        const next = neighbourFor(s, n.id, side);
        if (!next) return null;
        const name = next.label ?? cat.variants.find((x) => x.id === next.variantId)?.name ?? 'next step';
        return (
          <button key={side} aria-label={`Connect to ${name}`} title={`Connect to ${name}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              useStore.getState().update((sc) => ({ ...sc, edges: [...sc.edges, { id: uid('e'), source: n.id, target: next.id }] }));
            }}
            className={`nodrag absolute z-10 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white shadow hover:bg-sky-700 ${BTN_POS[side]}`}>
            {ARROW[side]}
          </button>
        );
      })}
      <div className="mb-1 flex items-start gap-1">
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${frozen ? 'bg-sky-500' : 'bg-amber-500'}`} title={frozen ? 'Frozen' : 'Out of freezer'} />
        <div className="min-w-0 flex-1 font-semibold leading-tight">{n.label ?? v?.name ?? 'Missing equipment'}</div>
        {n.units > 1 && <span className="rounded bg-slate-100 px-1 dark:bg-slate-800">×{n.units}</span>}
      </div>
      {st?.isBottleneck && <div className="mb-1 rounded bg-red-100 px-1 font-semibold text-red-800 dark:bg-red-900/50 dark:text-red-200">Slowest step</div>}
      <div className="mb-1 flex items-center gap-1">
        <span className="rounded px-1 text-[10px] font-medium text-white" style={{ background: role.colour }}>{role.label}</span>
        {sp?.sideStream && <span className="text-slate-500">batch feed</span>}
      </div>
      <div className="mb-1 h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800" title={`Utilisation ${pct(util)}`}>
        <div className={`h-1.5 rounded ${utilColour}`} style={{ width: `${Math.min(100, util * 100)}%` }} />
      </div>
      {st && sp?.kind === 'rate' && !sp.sideStream && (
        <div className="mb-0.5 text-slate-600 dark:text-slate-300" title="The cup line moves in sync, so this step runs at the line rate, below its maximum.">
          Runs {num(st.runRatePerUnit)} of {num(st.maxRatePerUnit)} cups/h{n.units > 1 ? ' each' : ''}
          {!st.isBottleneck && st.utilActual < 0.98 && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800">paced</span>}
        </div>
      )}
      {sp?.kind === 'storage' && <div className="mb-0.5 text-slate-500">Storage · doesn’t limit the line</div>}
      <div className="grid grid-cols-2 gap-x-1 text-slate-600 dark:text-slate-300">
        <span>{sp?.kind === 'storage' ? 'Full' : 'Use'} {pct(util)}</span>
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

type FEdge = Edge<{ step?: StepResult; frozen: boolean; batch: boolean; role: Role }>;
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<FEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  // Batch feeds are dotted; the cup line is solid, coloured by the step it feeds (blue while frozen).
  const colour = data?.batch ? ROLES.batch.colour : data?.frozen ? ROLES.storage.colour : ROLES[data?.role ?? 'other'].colour;
  const st = data?.step;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{
        stroke: colour, strokeWidth: selected ? 5 : data?.batch ? 2.5 : 3.5,
        strokeDasharray: data?.batch ? '2 6' : undefined, strokeLinecap: 'round',
      }} />
      {st && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-100%) translate(${lx}px,${ly - 6}px)` }}
            className="pointer-events-none absolute whitespace-nowrap rounded bg-white/80 px-1 text-[9px] leading-tight text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
            {num(st.cupsOutPerHour)} cups/h
            {!data?.frozen && st.oofClockMin > 0 && <span className="text-amber-600"> · {mins(st.oofClockMin)}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const POS: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const ARROW: Record<Side, string> = { top: '↑', right: '→', bottom: '↓', left: '←' };
const BTN_POS: Record<Side, string> = {
  top: 'left-1/2 -top-7 -translate-x-1/2', right: '-right-7 top-1/2 -translate-y-1/2',
  bottom: 'left-1/2 -bottom-7 -translate-x-1/2', left: '-left-7 top-1/2 -translate-y-1/2',
};
// Approximate node box, used to pick the side an arrow leaves and enters by.
const NODE_W = 192;
const NODE_H = 110;
const centre = (n: { x: number; y: number }) => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });

/** Which side of `from` faces `to`. Boxes are wider than tall, so vertical is scaled. */
export function sideToward(from: { x: number; y: number }, to: { x: number; y: number }): Side {
  const a = centre(from);
  const b = centre(to);
  const dx = b.x - a.x;
  const dy = (b.y - a.y) * (NODE_W / NODE_H);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Nearest step lying off the given side, unless the two are already joined. */
function neighbourFor(s: Scenario, id: string, side: Side) {
  const link = bestLink(s, id);
  return link?.side === side ? link.node : undefined;
}

/**
 * Where a one-tap arrow should go from this step: the neighbouring step in whichever
 * direction is closest, offered only where the line is broken.
 */
function bestLink(s: Scenario, id: string) {
  const me = s.nodes.find((n) => n.id === id);
  if (!me || s.edges.some((e) => e.source === id)) return undefined;
  const cat = useStore.getState().catalogue;
  const isSide = (nid: string) => { const n = s.nodes.find((m) => m.id === nid); return !!(n && resolveSpec(cat, n)?.sideStream); };
  const mineIsSide = isSide(id);
  const c = centre(me);
  const dist = (n: { x: number; y: number }) => { const o = centre(n); return Math.hypot(o.x - c.x, o.y - c.y); };
  const others = s.nodes.filter((n) => n.id !== id && !resolveSpec(cat, n)?.facilityOnly);
  let out: { side: Side; node: (typeof others)[number]; d: number } | undefined;
  for (const side of SIDES) {
    const near = others.filter((n) => sideToward(me, n) === side).sort((p, q) => dist(p) - dist(q))[0];
    if (!near || isSide(near.id)) continue;
    if (s.edges.some((e) => e.source === near.id && e.target === id)) continue;
    // A cup step only joins a step with no cup coming in yet; a batch feed can join any cup step.
    if (!mineIsSide && s.edges.some((e) => e.target === near.id && !isSide(e.source))) continue;
    const d = dist(near);
    if (!out || d < out.d) out = { side, node: near, d };
  }
  return out;
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

export const OPEN_PALETTE = 'juvo-open-palette';

/** Put new equipment on an arrow, shifting everything downstream one column right. */
function insertNodeOnEdge(s: Scenario, edgeId: string, variantId: string): { s: Scenario; id: string } {
  const e = s.edges.find((x) => x.id === edgeId);
  const tgt = s.nodes.find((n) => n.id === e?.target);
  const src = s.nodes.find((n) => n.id === e?.source);
  const id = uid('n');
  const x = tgt ? tgt.x : (src?.x ?? 0) + 320;
  const y = tgt && src ? Math.min(tgt.y, src.y) : tgt?.y ?? 40;
  const shifted = { ...s, nodes: s.nodes.map((n) => (tgt && n.x >= tgt.x && n.id !== src?.id ? { ...n, x: n.x + 320 } : n)) };
  const st = useStore.getState();
  st.touchRecent(variantId);
  // An arrow out of a side stream stays a side stream, so the new step does not start a second cup path.
  const srcSide = src ? resolveSpec(st.catalogue, src)?.sideStream : false;
  const overrides = srcSide ? { sideStream: true } : {};
  return { s: insertOnEdge(shifted, edgeId, { id, variantId, units: 1, overrides, x, y: srcSide ? (src?.y ?? y) : y }), id };
}

function edgeAt(x: number, y: number): string | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const g = (el as Element).closest?.('.react-flow__edge');
    const id = g?.getAttribute('data-id') ?? g?.getAttribute('data-testid')?.replace('rf__edge-', '');
    if (id) return id;
  }
  return undefined;
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
  const [selEdge, setSelEdge] = useState<string>();
  const insertEdgeId = useStore((x) => x.insertEdgeId);

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
    const batch = !!sp?.sideStream;
    const frozen = sp?.state === 'frozen' && tsp?.state === 'frozen';
    const role = roleOf(tgt && cat.variants.find((v) => v.id === tgt.variantId)?.typeId, tsp?.sideStream);
    const color = batch ? ROLES.batch.colour : frozen ? ROLES.storage.colour : ROLES[role].colour;
    return {
      id: e.id, source: e.source, target: e.target, type: 'flow',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      // Lines leave and enter by the sides that face each other, so they can run in any direction.
      sourceHandle: src && tgt ? `s-${sideToward(src, tgt)}` : undefined,
      targetHandle: src && tgt ? `t-${sideToward(tgt, src)}` : undefined,
      data: {
        step: sp?.sideStream ? undefined : stepById.get(e.source),
        frozen,
        batch,
        role,
      },
    };
  }), [s.edges, s.nodes, cat, stepById]);

  const onNodesChange = useCallback((ch: NodeChange<PNode>[]) => {
    setNodes((ns) => applyNodeChanges(ch, ns));
    const removed = ch.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id);
    if (removed.length) {
      update((sc) => removed.reduce(removeAndBridge, sc));
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
        const onEdge = edgeAt(d.x, d.y);
        update((sc) => { const o = onEdge ? insertNodeOnEdge(sc, onEdge, d.variantId!) : addNodeAt(sc, d.variantId!, p.x - 96, p.y - 40); newId = o.id; return o.s; });
        set({ selectedNodeId: newId });
      }
      useStore.getState().dismissHint('drag');
    };
    const add = (ev: Event) => {
      const d = (ev as CustomEvent<{ variantId?: string; templateId?: string }>).detail;
      const st = useStore.getState();
      const sc = st.scenarios.find((x) => x.id === st.activeId)!;
      const sel = sc.nodes.find((n) => n.id === st.selectedNodeId);
      const maxX = sc.nodes.length ? Math.max(...sc.nodes.map((n) => n.x)) : -320;
      if (d.templateId) { update((x) => appendTemplate(x, d.templateId!, 0, (Math.max(0, ...sc.nodes.map((n) => n.y)) + 320))); return; }
      if (st.insertEdgeId && sc.edges.some((e) => e.id === st.insertEdgeId)) {
        let nid = '';
        update((x0) => { const o = insertNodeOnEdge(x0, st.insertEdgeId!, d.variantId!); nid = o.id; return o.s; });
        set({ selectedNodeId: nid, insertEdgeId: undefined });
        setSelEdge(undefined);
        return;
      }
      const v = st.catalogue.variants.find((m) => m.id === d.variantId);
      const x = sel ? sel.x + (v?.spec.sideStream ? 0 : 320) : maxX + 320;
      const y = sel ? sel.y + (v?.spec.sideStream ? 200 : 0) : 40;
      if (sel && !v?.spec.sideStream) {
        // Shift downstream nodes right to make room.
        update((x0) => ({ ...x0, nodes: x0.nodes.map((n) => (n.y === sel.y && n.x > sel.x ? { ...n, x: n.x + 320 } : n)) }), false);
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
          edgesReconnectable connectionMode={ConnectionMode.Loose}
          onReconnect={(old, c) => update((sc) => ({
            ...sc,
            edges: reconnectEdge({ ...old }, c, sc.edges.map((e) => ({ ...e })), { shouldReplaceId: false })
              .map((e) => ({ id: e.id, source: e.source, target: e.target })),
          }))}
          onEdgeClick={(_, e) => { setSelEdge(e.id); set({ selectedNodeId: undefined }); }}
          onEdgesDelete={(es) => update((sc) => ({ ...sc, edges: sc.edges.filter((e) => !es.some((x) => x.id === e.id)) }))}
          onNodeClick={(_, n) => { set({ selectedNodeId: n.id, editorOpen: true }); useStore.getState().dismissHint('tap'); }}
          onPaneClick={() => { set({ selectedNodeId: undefined, insertEdgeId: undefined }); setSelEdge(undefined); }}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} deleteKeyCode={['Delete', 'Backspace']} proOptions={{ hideAttribution: true }}>
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden md:!block" />
        </ReactFlow>
        {selEdge && s.edges.some((e) => e.id === selEdge) && (() => {
          const e = s.edges.find((x) => x.id === selEdge)!;
          const name = (id: string) => { const n = s.nodes.find((m) => m.id === id); return n ? (n.label ?? cat.variants.find((v) => v.id === n.variantId)?.name ?? '') : ''; };
          return (
            <div className="absolute bottom-20 left-1/2 z-10 flex max-w-[95%] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg bg-white p-2 text-sm shadow-lg dark:bg-slate-900 md:bottom-4">
              <span className="text-xs text-slate-500">{name(e.source)} → {name(e.target)}</span>
              {insertEdgeId === selEdge
                ? <span className="text-xs font-medium text-sky-700 dark:text-sky-300">Now pick equipment from the list (+)</span>
                : <Btn kind="primary" onClick={() => { set({ insertEdgeId: selEdge }); window.dispatchEvent(new Event(OPEN_PALETTE)); }}>Insert equipment here</Btn>}
              <Btn kind="danger" onClick={() => { update((sc) => ({ ...sc, edges: sc.edges.filter((x) => x.id !== selEdge) })); setSelEdge(undefined); set({ insertEdgeId: undefined }); }}>Delete arrow</Btn>
              <button aria-label="Close" className="px-1 text-lg" onClick={() => { setSelEdge(undefined); set({ insertEdgeId: undefined }); }}>×</button>
            </div>
          );
        })()}
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
    </div>
  );
}

export function FlowsheetScreen() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const warnings = useMemo(() => flowWarnings(s, cat), [s, cat]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  useEffect(() => {
    const open = () => { if (window.innerWidth < 768) setPaletteOpen(true); };
    window.addEventListener(OPEN_PALETTE, open);
    return () => window.removeEventListener(OPEN_PALETTE, open);
  }, []);
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
          <Legend />
          <div className="flex flex-col items-start gap-1">
            <Hint id="drag">Drag equipment in from the list{' '}<span className="md:hidden">(tap “Add equipment”)</span></Hint>
            <Hint id="tap">Tap a step to edit it. Tap an arrow to insert equipment, or drag its end to rewire</Hint>
          </div>
        </div>
        <button onClick={() => setPaletteOpen(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg md:hidden">
          + Add equipment
        </button>
        {paletteOpen && (
          <div className="fixed inset-0 z-40 flex items-end bg-black/20 md:hidden" onClick={() => setPaletteOpen(false)}>
            <div className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-slate-50 dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
              <PaletteSheet onClose={() => setPaletteOpen(false)} />
            </div>
          </div>
        )}
      </div>
      <NodeEditor />
    </div>
  );
}

function Legend() {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const line = (colour: string, dashed?: boolean) => (
    <svg width="26" height="8"><line x1="2" y1="4" x2="24" y2="4" stroke={colour} strokeWidth={dashed ? 2.5 : 3.5} strokeLinecap="round" strokeDasharray={dashed ? '2 6' : undefined} /></svg>
  );
  return (
    <div className="pointer-events-auto absolute right-0 top-0 rounded-lg bg-white/95 p-2 text-[11px] shadow dark:bg-slate-900/95">
      <button className="font-semibold" onClick={() => setOpen(!open)}>Key {open ? '▾' : '▸'}</button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {(['batch', 'dosing', 'modify', 'storage', 'inspect', 'pack'] as Role[]).map((r) => (
            <div key={r} className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded" style={{ background: ROLES[r].colour }} />{ROLES[r].label}</div>
          ))}
          <div className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-700" />
          <div className="flex items-center gap-1">{line(ROLES.dosing.colour)}{line(ROLES.modify.colour)} Cup line (colour of next step)</div>
          <div className="flex items-center gap-1">{line(ROLES.storage.colour)} Cup line, frozen</div>
          <div className="flex items-center gap-1">{line(ROLES.batch.colour, true)} Batch feed (e.g. mixer to filler)</div>
        </div>
      )}
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

