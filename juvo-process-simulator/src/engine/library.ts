// Catalogue (library) operations: validation, overrides, variant swap, save-to-palette, warnings, CSV.

import { resolveSpec, simulate, type Results } from './engine';
import type { Catalogue, EquipmentSpec, FlowNode, Quote, Scenario, Variant } from './types';

const SPEC_NUMBERS: (keyof EquipmentSpec)[] = [
  'cupsHeld', 'oee', 'usableFill', 'loss', 'dwellMin', 'duty', 'operators', 'life', 'maintPct', 'L', 'W', 'H', 'clearance',
];

/** Validate an imported catalogue. Returns a list of problems (empty = valid). */
export function validateCatalogue(c: unknown): string[] {
  const errs: string[] = [];
  const cat = c as Catalogue;
  if (!cat || typeof cat !== 'object') return ['Catalogue must be a JSON object'];
  if (typeof cat.version !== 'number') errs.push('version must be a number');
  if (!Array.isArray(cat.categories)) errs.push('categories must be an array');
  if (!Array.isArray(cat.types)) errs.push('types must be an array');
  if (!Array.isArray(cat.variants)) errs.push('variants must be an array');
  if (errs.length) return errs;
  const typeIds = new Set(cat.types.map((t) => t.id));
  const variantIds = new Set<string>();
  for (const t of cat.types) {
    if (!t.id || !t.name) errs.push(`type ${t.id ?? '?'} needs id and name`);
  }
  for (const v of cat.variants) {
    if (!v.id) { errs.push('variant without id'); continue; }
    if (variantIds.has(v.id)) errs.push(`duplicate variant id ${v.id}`);
    variantIds.add(v.id);
    if (!typeIds.has(v.typeId)) errs.push(`variant ${v.id} has unknown type ${v.typeId}`);
    const s = v.spec;
    if (!s) { errs.push(`variant ${v.id} has no spec`); continue; }
    if (s.kind !== 'rate' && s.kind !== 'storage') errs.push(`variant ${v.id}: kind must be rate or storage`);
    if (s.state !== 'frozen' && s.state !== 'ambient') errs.push(`variant ${v.id}: state must be frozen or ambient`);
    if (!s.rate || typeof s.rate.typ !== 'number') errs.push(`variant ${v.id}: rate.typ must be a number`);
    if (!s.cost || typeof s.cost.typ !== 'number') errs.push(`variant ${v.id}: cost.typ must be a number`);
    if (!s.kW || typeof s.kW.typ !== 'number') errs.push(`variant ${v.id}: kW.typ must be a number`);
    for (const k of SPEC_NUMBERS) {
      if (typeof s[k] !== 'number' || Number.isNaN(s[k] as number)) errs.push(`variant ${v.id}: ${k} must be a number`);
    }
    if (!Array.isArray(s.materials)) errs.push(`variant ${v.id}: materials must be an array`);
  }
  for (const t of cat.types) {
    if (!variantIds.has(t.defaultVariantId)) errs.push(`type ${t.id} default variant ${t.defaultVariantId} not found`);
  }
  return errs;
}

export function isOverridden(node: FlowNode, key?: keyof EquipmentSpec): boolean {
  return key ? key in node.overrides : Object.keys(node.overrides).length > 0;
}

export function setOverride<K extends keyof EquipmentSpec>(node: FlowNode, key: K, value: EquipmentSpec[K]): FlowNode {
  return { ...node, overrides: { ...node.overrides, [key]: value } };
}

export function resetOverride(node: FlowNode, key?: keyof EquipmentSpec): FlowNode {
  if (!key) return { ...node, overrides: {} };
  const o = { ...node.overrides };
  delete o[key];
  return { ...node, overrides: o };
}

/** Swap a node's variant, keeping position, units and connections. Overrides are cleared. */
export function swapVariant(s: Scenario, nodeId: string, variantId: string): Scenario {
  return {
    ...s,
    nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, variantId, overrides: {} } : n)),
    layout: {
      ...s.layout,
      items: s.layout.items.map((it) => (it.nodeId === nodeId ? { ...it, variantId } : it)),
    },
  };
}

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Save a customised node back to the palette as a new variant of the same type. */
export function saveNodeAsVariant(cat: Catalogue, node: FlowNode, name: string): { catalogue: Catalogue; variant: Variant } {
  const base = cat.variants.find((v) => v.id === node.variantId);
  if (!base) throw new Error('Unknown variant');
  const spec = resolveSpec(cat, node)!;
  const variant: Variant = {
    id: uid(`${base.typeId}.user`), typeId: base.typeId, name, supplier: base.supplier, model: base.model,
    spec: { ...spec, sources: { ...spec.sources } }, userMade: true,
  };
  return { catalogue: { ...cat, variants: [...cat.variants, variant] }, variant };
}

export interface Warning { nodeId?: string; message: string }

const typeOf = (cat: Catalogue, n: FlowNode) => cat.variants.find((v) => v.id === n.variantId)?.typeId ?? '';

/** Flowsheet warnings. Never blocking. */
export function flowWarnings(s: Scenario, cat: Catalogue): Warning[] {
  const out: Warning[] = [];
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const preds = (id: string) => s.edges.filter((e) => e.target === id).map((e) => e.source);
  const upstream = (id: string, seen = new Set<string>()): string[] => {
    for (const p of preds(id)) if (!seen.has(p)) { seen.add(p); upstream(p, seen); }
    return [...seen];
  };
  const isCupStep = (t: string) => ['fruit-portioning', 'fruit-depositor', 'comb-weigher', 'denester'].includes(t);
  const isFiller = (t: string) => ['auger-filler', 'vol-filler'].includes(t);
  const isClosing = (t: string) => ['seamer', 'heat-sealer', 'lid-placer'].includes(t);
  const isPacking = (t: string) => ['cartoning', 'shrink'].includes(t);
  for (const n of s.nodes) {
    const t = typeOf(cat, n);
    const name = n.label ?? cat.variants.find((v) => v.id === n.variantId)?.name ?? 'step';
    const up = upstream(n.id).map((id) => byId.get(id)).filter(Boolean) as FlowNode[];
    const upTypes = up.map((u) => typeOf(cat, u));
    const downstreamOf = (other: FlowNode) => upstream(other.id).includes(n.id);
    if (isClosing(t)) {
      const filler = s.nodes.find((m) => isFiller(typeOf(cat, m)) && downstreamOf(m));
      if (filler) out.push({ nodeId: n.id, message: `${name} comes before the filler. Cups would be sealed before powder goes in.` });
    }
    if (t === 'labeller' && !upTypes.some(isCupStep)) {
      out.push({ nodeId: n.id, message: `${name} has no cup step upstream.` });
    }
    const sp = resolveSpec(cat, n);
    if (sp?.kind === 'storage' && sp.state === 'frozen' && preds(n.id).length) {
      const direct = preds(n.id).map((id) => byId.get(id)).filter(Boolean) as FlowNode[];
      const ambientFeed = direct.some((d) => resolveSpec(cat, d)?.state === 'ambient');
      if (ambientFeed && upTypes.some((x) => isCupStep(x)) && !upTypes.some(isPacking)) {
        out.push({ nodeId: n.id, message: `An ambient step feeds ${name} with no packing step before it.` });
      }
    }
    if (sp?.sideStream && !s.edges.some((e) => e.source === n.id)) {
      out.push({ nodeId: n.id, message: `${name} is a side stream but does not feed any step.` });
    }
    if (!sp) out.push({ nodeId: n.id, message: `Equipment for this step is missing from the library.` });
  }
  return out;
}

// ---------- JSON and CSV ----------

export interface LibraryBundle { catalogue: Catalogue; quotes: Quote[] }

export function exportLibrary(b: LibraryBundle): string {
  return JSON.stringify({ kind: 'juvo-library', version: 1, ...b }, null, 2);
}

export function importLibrary(text: string): LibraryBundle {
  const o = JSON.parse(text);
  const catalogue: Catalogue = o.catalogue ?? o;
  const errs = validateCatalogue(catalogue);
  if (errs.length) throw new Error(errs.slice(0, 5).join('\n'));
  return { catalogue, quotes: Array.isArray(o.quotes) ? o.quotes : [] };
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function resultsCsv(r: Results): string {
  const rows: unknown[][] = [
    ['Metric', 'Value', 'Unit'],
    ['Demand', r.demand.toFixed(0), 'cups/day'],
    ['Good cups made', r.output.toFixed(0), 'cups/day'],
    ['Supported fleet', Number.isFinite(r.supportedFleet) ? r.supportedFleet.toFixed(1) : 'unlimited', 'machines'],
    ['Slowest step', r.bottleneckName ?? '', ''],
    ['Yield', (r.yield * 100).toFixed(1), '%'],
    ['Cost per cup', r.perCup.total.toFixed(3), 'A$/cup'],
    ...Object.entries(r.perCup).filter(([k]) => k !== 'total').map(([k, v]) => [`Cost per cup: ${k}`, v.toFixed(3), 'A$/cup']),
    ['CAPEX', r.capex.total.toFixed(0), 'A$'],
    ['Cash OPEX', r.monthly.cashOpex.toFixed(0), 'A$/month'],
    ['Connected power', r.power.connectedKW.toFixed(2), 'kW'],
    ['Energy', r.power.kWhPerDay.toFixed(1), 'kWh/day'],
    ['Out-of-freezer window', r.residence.oofWindowMin.toFixed(1), 'min'],
    ['FTE', r.labour.fte.toFixed(2), 'FTE'],
    [],
    ['Step', 'Units', 'Capacity (cups/day)', 'Utilisation (%)', 'Time in step (min)', 'kW', 'Slowest'],
    ...r.steps.map((s) => [s.name, s.units, s.capacityPerDay.toFixed(0), (s.utilDemand * 100).toFixed(0), s.dwellMin, s.connectedKW.toFixed(2), s.isBottleneck ? 'yes' : '']),
  ];
  return toCsv(rows);
}

export function libraryCsv(cat: Catalogue): string {
  const rows: unknown[][] = [['Type', 'Variant', 'Supplier', 'Kind', 'Rate (cups/h)', 'Cups held', 'Cost', 'Currency', 'kW', 'L (m)', 'W (m)', 'Source (cost)']];
  for (const v of cat.variants) {
    const t = cat.types.find((x) => x.id === v.typeId);
    rows.push([t?.name, v.name, v.supplier, v.spec.kind, v.spec.rate.typ, v.spec.cupsHeld, v.spec.cost.typ, v.spec.currency, v.spec.kW.typ, v.spec.L, v.spec.W, v.spec.sources.cost?.kind ?? 'placeholder']);
  }
  return toCsv(rows);
}

export { simulate };

// ---------- Rewiring ----------

/** Put a new node on an existing arrow: source → node → target. */
export function insertOnEdge(s: Scenario, edgeId: string, node: FlowNode): Scenario {
  const e = s.edges.find((x) => x.id === edgeId);
  if (!e) return { ...s, nodes: [...s.nodes, node] };
  return {
    ...s,
    nodes: [...s.nodes, node],
    edges: s.edges.filter((x) => x.id !== edgeId).concat(
      { id: uid('e'), source: e.source, target: node.id },
      { id: uid('e'), source: node.id, target: e.target },
    ),
  };
}

/** Take a node out of the line and join its upstream steps straight to its downstream steps. */
export function removeAndBridge(s: Scenario, nodeId: string): Scenario {
  const ins = s.edges.filter((e) => e.target === nodeId).map((e) => e.source);
  const outs = s.edges.filter((e) => e.source === nodeId).map((e) => e.target);
  const kept = s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  const bridges = ins.flatMap((a) => outs.filter((b) => a !== b && !kept.some((e) => e.source === a && e.target === b))
    .map((b) => ({ id: uid('e'), source: a, target: b })));
  return { ...s, nodes: s.nodes.filter((n) => n.id !== nodeId), edges: [...kept, ...bridges] };
}

/**
 * Swap a step with the next (or previous) step on the cup path.
 * Arrows are rewired and the two boxes swap places; side streams stay with the step they feed.
 */
export function moveStep(s: Scenario, cat: Catalogue, nodeId: string, dir: 'earlier' | 'later'): Scenario {
  const isMain = (id: string) => {
    const n = s.nodes.find((x) => x.id === id);
    const sp = n && resolveSpec(cat, n);
    return !!sp && !sp.sideStream && !sp.facilityOnly;
  };
  const mainOut = (id: string) => s.edges.filter((e) => e.source === id && isMain(e.target)).map((e) => e.target);
  const mainIn = (id: string) => s.edges.filter((e) => e.target === id && isMain(e.source)).map((e) => e.source);
  let a: string; // the earlier of the pair
  let b: string;
  if (dir === 'later') {
    const o = mainOut(nodeId);
    if (o.length !== 1) return s;
    [a, b] = [nodeId, o[0]];
  } else {
    const i = mainIn(nodeId);
    if (i.length !== 1) return s;
    [a, b] = [i[0], nodeId];
  }
  if (mainOut(a).length !== 1 || mainIn(b).length !== 1) return s;
  const swap = (id: string) => (id === a ? b : id === b ? a : id);
  const edges = s.edges.map((e) => {
    const sideIn = !isMain(e.source) && (e.target === a || e.target === b);
    if (sideIn) return e; // side stream keeps feeding the same step
    return { ...e, source: swap(e.source), target: swap(e.target) };
  });
  const na = s.nodes.find((n) => n.id === a)!;
  const nb = s.nodes.find((n) => n.id === b)!;
  const dx = nb.x - na.x;
  const dy = nb.y - na.y;
  const sideOf = (id: string) => s.edges.filter((e) => e.target === id && !isMain(e.source)).map((e) => e.source);
  const sa = sideOf(a);
  const sb = sideOf(b);
  const nodes = s.nodes.map((n) => {
    if (n.id === a) return { ...n, x: nb.x, y: nb.y };
    if (n.id === b) return { ...n, x: na.x, y: na.y };
    if (sa.includes(n.id)) return { ...n, x: n.x + dx, y: n.y + dy };
    if (sb.includes(n.id)) return { ...n, x: n.x - dx, y: n.y - dy };
    return n;
  });
  return { ...s, nodes, edges };
}
