// Steady-state throughput, cost, power and residence-time model.
// Pure functions only: no UI, no storage, no randomness.

import type {
  Catalogue, EquipmentSpec, FlowNode, Globals, Ranged, RangePick, Scenario, Variant,
} from './types';

export const DAYS_PER_MONTH = 365 / 12;
export const prodDaysPerMonth = (g: Globals) => (g.prodDays * 52) / 12;

export function pickRange(r: Ranged | number | undefined, pick: RangePick): number {
  if (r === undefined) return 0;
  if (typeof r === 'number') return r;
  const v = pick === 'min' ? r.min : pick === 'max' ? r.max : r.typ;
  return v ?? r.typ;
}

export function findVariant(cat: Catalogue, id: string): Variant | undefined {
  return cat.variants.find((v) => v.id === id);
}

/** Library spec with per-node overrides applied. Never mutates the library. */
export function resolveSpec(cat: Catalogue, node: FlowNode): EquipmentSpec | undefined {
  const v = findVariant(cat, node.variantId);
  if (!v) return undefined;
  return { ...v.spec, ...node.overrides };
}

export function nodeName(cat: Catalogue, node: FlowNode): string {
  return node.label ?? findVariant(cat, node.variantId)?.name ?? 'Unknown equipment';
}

export interface StepResult {
  id: string;
  name: string;
  kind: 'rate' | 'storage';
  state: 'frozen' | 'ambient';
  sideStream: boolean;
  units: number;
  /** Fraction of the cup flow passing through this step. */
  flow: number;
  survival: number;
  capacityPerDay: number;
  perUnitCapacity: number;
  maxGood: number;
  requiredEntering: number;
  utilDemand: number;
  utilActual: number;
  isBottleneck: boolean;
  dwellMin: number;
  connectedKW: number;
  avgKW: number;
  kWhMonth: number;
  powerCostMonth: number;
  labourHoursMonth: number;
  labourCostMonth: number;
  fte: number;
  equipmentAUD: number;
  materialsPerGoodCup: number;
  maintenanceMonth: number;
  depreciationMonth: number;
  frozenStock: number;
  refrigeration: boolean;
  /** Good-path cups leaving the step per production hour. */
  cupsOutPerHour: number;
  /** Running out-of-freezer time when a cup leaves this step (min). */
  oofClockMin: number;
}

export interface Results {
  demand: number;
  maxGood: number;
  output: number;
  shortfall: number;
  supportedFleet: number;
  bottleneckId?: string;
  bottleneckName?: string;
  yield: number;
  steps: StepResult[];
  cupsPerMonth: number;
  monthly: {
    materials: number; labour: number; power: number; maintenance: number;
    depreciation: number; overheads: number; total: number; cashOpex: number;
  };
  perCup: {
    materials: number; labour: number; power: number; maintenance: number;
    depreciation: number; overheads: number; total: number;
  };
  capex: { equipment: number; installation: number; fitOut: number; contingency: number; total: number };
  power: {
    connectedKW: number; averageKW: number; kWhPerDay: number; kWhPerCup: number;
    costMonth: number; refrigerationShare: number;
  };
  labour: { fte: number; hoursMonth: number };
  residence: {
    oofWindowMin: number; oofLimitMin: number; oofOk: boolean;
    fruitAgeMin: number; cupAgeMin: number; startToFinishMin: number; frozenStock: number;
  };
}

const EMPTY_SPEC_SAFE = (n: number) => (Number.isFinite(n) ? n : 0);

interface Graph {
  main: FlowNode[]; // topological order
  side: FlowNode[];
  preds: Map<string, string[]>;
  succs: Map<string, string[]>;
}

function buildGraph(s: Scenario, specs: Map<string, EquipmentSpec>): Graph {
  const active = s.nodes.filter((n) => {
    const sp = specs.get(n.id);
    return sp && !sp.facilityOnly;
  });
  const isMain = (id: string) => {
    const sp = specs.get(id);
    return !!sp && !sp.sideStream && !sp.facilityOnly;
  };
  const ids = new Set(active.map((n) => n.id));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const n of active) { preds.set(n.id, []); succs.set(n.id, []); }
  for (const e of s.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    succs.get(e.source)!.push(e.target);
    preds.get(e.target)!.push(e.source);
  }
  // Kahn topological sort over the main (cup) path. Cycles fall back to x position.
  const mainNodes = active.filter((n) => isMain(n.id));
  const indeg = new Map<string, number>();
  for (const n of mainNodes) indeg.set(n.id, preds.get(n.id)!.filter(isMain).length);
  const byX = (a: FlowNode, b: FlowNode) => a.x - b.x || a.y - b.y;
  const queue = mainNodes.filter((n) => indeg.get(n.id) === 0).sort(byX);
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    order.push(n);
    for (const t of succs.get(n.id)!.filter(isMain)) {
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) queue.push(mainNodes.find((m) => m.id === t)!);
    }
    queue.sort(byX);
  }
  for (const n of [...mainNodes].sort(byX)) if (!seen.has(n.id)) order.push(n);
  return { main: order, side: active.filter((n) => !isMain(n.id)), preds, succs };
}

export function stepCapacity(sp: EquipmentSpec, units: number, g: Globals): number {
  if (sp.kind === 'storage') {
    const dwellDays = sp.dwellMin / 1440;
    if (dwellDays <= 0) return Infinity;
    return ((units * sp.cupsHeld * sp.usableFill) / dwellDays) * (7 / g.prodDays);
  }
  return units * pickRange(sp.rate, g.pick.rate) * sp.oee * g.shiftHours;
}

export function demandPerDay(g: Globals): number {
  return (g.fleet * g.cupsPerMachine * 7) / g.prodDays;
}

export function simulate(s: Scenario, cat: Catalogue): Results {
  const g = s.globals;
  const fx = (c: string) => (c === 'USD' ? g.usdToAud : 1);
  const specs = new Map<string, EquipmentSpec>();
  for (const n of s.nodes) {
    const sp = resolveSpec(cat, n);
    if (sp) specs.set(n.id, sp);
  }
  const graph = buildGraph(s, specs);
  const mainIds = new Set(graph.main.map((n) => n.id));
  const demand = demandPerDay(g);

  // Flow fractions: roots share the cup flow equally, branches split equally.
  const flow = new Map<string, number>();
  const mainPreds = (id: string) => graph.preds.get(id)!.filter((p) => mainIds.has(p));
  const mainSuccs = (id: string) => graph.succs.get(id)!.filter((t) => mainIds.has(t));
  const roots = graph.main.filter((n) => mainPreds(n.id).length === 0);
  for (const n of graph.main) flow.set(n.id, 0);
  for (const r of roots) flow.set(r.id, 1 / roots.length);
  for (const n of graph.main) {
    const out = mainSuccs(n.id);
    for (const t of out) flow.set(t, flow.get(t)! + flow.get(n.id)! / out.length);
  }

  // Survival to the end of the main path.
  const surv = new Map<string, number>();
  for (const n of [...graph.main].reverse()) {
    const sp = specs.get(n.id)!;
    const out = mainSuccs(n.id);
    const down = out.length ? out.reduce((a, t) => a + surv.get(t)!, 0) / out.length : 1;
    surv.set(n.id, (1 - sp.loss) * down);
  }
  // Side streams: survival of the next main step x own (1 - loss).
  const nextMain = (id: string, guard = new Set<string>()): string | undefined => {
    if (guard.has(id)) return undefined;
    guard.add(id);
    for (const t of graph.succs.get(id) ?? []) {
      if (mainIds.has(t)) return t;
      const m = nextMain(t, guard);
      if (m) return m;
    }
    return undefined;
  };
  for (const n of graph.side) {
    const sp = specs.get(n.id)!;
    const m = nextMain(n.id);
    surv.set(n.id, (1 - sp.loss) * (m ? surv.get(m)! : 1));
    flow.set(n.id, m ? flow.get(m)! : 1);
  }

  const all = [...graph.main, ...graph.side];
  let maxGood = Infinity;
  let bottleneckId: string | undefined;
  const caps = new Map<string, number>();
  for (const n of all) {
    const sp = specs.get(n.id)!;
    const cap = stepCapacity(sp, n.units, g);
    caps.set(n.id, cap);
    const f = flow.get(n.id)!;
    const mg = f > 0 ? (cap * surv.get(n.id)!) / f : Infinity;
    if (mg < maxGood) { maxGood = mg; bottleneckId = n.id; }
  }
  const output = Math.min(demand, maxGood);
  const pdm = prodDaysPerMonth(g);
  const cupsPerMonth = output * pdm;

  const steps: StepResult[] = [];
  let materialsPerCup = 0;
  for (const n of all) {
    const sp = specs.get(n.id)!;
    const cap = caps.get(n.id)!;
    const S = surv.get(n.id)!;
    const f = flow.get(n.id)!;
    const reqDemand = (demand * f) / S;
    const reqActual = (output * f) / S;
    const utilDemand = cap > 0 ? reqDemand / cap : Infinity;
    const utilActual = cap > 0 ? Math.min(1, reqActual / cap) : 0;
    const finiteUtil = Number.isFinite(utilActual) ? utilActual : 0;

    const connectedKW = n.units * pickRange(sp.kW, g.pick.kW);
    const avgKW = connectedKW * sp.duty;
    const kWhMonth = sp.alwaysOn
      ? avgKW * 24 * DAYS_PER_MONTH
      : avgKW * g.shiftHours * finiteUtil * pdm;
    const paidHours = g.flexLabour ? g.shiftHours * finiteUtil : g.shiftHours;
    const labourHoursDay = sp.operators * n.units * paidHours;
    const unitCost = pickRange(sp.cost, g.pick.cost) * fx(sp.currency);
    const equipmentAUD = n.units * unitCost;
    const customCapex = sp.customFields
      .filter((c) => c.costType === 'capex')
      .reduce((a, c) => a + c.value * n.units, 0);
    const life = sp.life > 0 ? sp.life : 10;
    const depreciationMonth =
      ((equipmentAUD + customCapex) * (1 + g.installPct / 100) * (1 + g.contingencyPct / 100)) / life / 12;
    const maintenanceMonth = (equipmentAUD * sp.maintPct) / 12;
    const matEntering = sp.materials.reduce(
      (a, m) => a + (m.unit === 'g' ? (m.qty * m.price) / 1000 : m.qty * m.price), 0);
    const materialsPerGoodCup = (matEntering * f) / S;
    materialsPerCup += materialsPerGoodCup;
    const frozenStock = sp.kind === 'storage' && sp.state === 'frozen'
      ? reqActual * (g.prodDays / 7) * (sp.dwellMin / 1440)
      : 0;

    steps.push({
      id: n.id, name: nodeName(cat, n), kind: sp.kind, state: sp.state, sideStream: !mainIds.has(n.id),
      units: n.units, flow: f, survival: S, capacityPerDay: cap,
      perUnitCapacity: n.units > 0 ? cap / n.units : stepCapacity(sp, 1, g),
      maxGood: f > 0 ? (cap * S) / f : Infinity, requiredEntering: reqDemand,
      utilDemand, utilActual: finiteUtil, isBottleneck: n.id === bottleneckId,
      dwellMin: sp.dwellMin, connectedKW, avgKW, kWhMonth, powerCostMonth: kWhMonth * g.kWhPrice,
      labourHoursMonth: labourHoursDay * pdm, labourCostMonth: labourHoursDay * pdm * g.wage,
      fte: g.shiftHours > 0 ? labourHoursDay / g.shiftHours : 0,
      equipmentAUD: equipmentAUD + customCapex, materialsPerGoodCup, maintenanceMonth, depreciationMonth,
      frozenStock, refrigeration: sp.state === 'frozen' && (sp.kind === 'storage' || sp.alwaysOn),
      cupsOutPerHour: g.shiftHours > 0 ? (reqActual * (1 - sp.loss)) / g.shiftHours : 0, oofClockMin: 0,
    });
  }

  const sum = (k: keyof StepResult) => steps.reduce((a, st) => a + (st[k] as number), 0);
  const firstYield = roots.reduce((a, r) => a + flow.get(r.id)! * surv.get(r.id)!, 0);
  const overallYield = roots.length ? firstYield : 1;

  // Scenario-level and per-equipment custom cost lines.
  let extraCapex = 0;
  let extraOpexMonth = 0;
  let extraOpexCup = 0;
  for (const n of all) {
    const sp = specs.get(n.id)!;
    for (const c of sp.customFields) {
      if (c.costType === 'opex_month') extraOpexMonth += c.value * n.units;
      if (c.costType === 'opex_cup') extraOpexCup += c.value;
    }
  }
  for (const c of s.costLines) {
    if (c.kind === 'capex') extraCapex += c.amount;
    if (c.kind === 'opex_month') extraOpexMonth += c.amount;
    if (c.kind === 'opex_cup') extraOpexCup += c.amount;
  }
  const extraMat = s.extraMaterials.reduce(
    (a, m) => a + (m.unit === 'g' ? (m.qty * m.price) / 1000 : m.qty * m.price), 0) / overallYield;
  materialsPerCup += extraMat;

  const equipment = sum('equipmentAUD') + extraCapex;
  const installation = (equipment * g.installPct) / 100;
  const fitOut = g.fitOut;
  const contingency = ((equipment + installation + fitOut) * g.contingencyPct) / 100;
  const capexTotal = equipment + installation + fitOut + contingency;

  const fitOutDep = (fitOut * (1 + g.contingencyPct / 100)) / (g.fitOutLife || 10) / 12;
  const extraCapexDep = (extraCapex * (1 + g.installPct / 100) * (1 + g.contingencyPct / 100)) / 10 / 12;
  const monthly = {
    materials: materialsPerCup * cupsPerMonth,
    labour: sum('labourCostMonth'),
    power: sum('powerCostMonth'),
    maintenance: sum('maintenanceMonth'),
    depreciation: sum('depreciationMonth') + fitOutDep + extraCapexDep,
    overheads: g.overheads + extraOpexMonth + extraOpexCup * cupsPerMonth,
    total: 0,
    cashOpex: 0,
  };
  monthly.total = monthly.materials + monthly.labour + monthly.power + monthly.maintenance
    + monthly.depreciation + monthly.overheads;
  monthly.cashOpex = monthly.total - monthly.depreciation;
  const per = (v: number) => (cupsPerMonth > 0 ? v / cupsPerMonth : 0);
  const perCup = {
    materials: per(monthly.materials), labour: per(monthly.labour), power: per(monthly.power),
    maintenance: per(monthly.maintenance), depreciation: per(monthly.depreciation),
    overheads: per(monthly.overheads), total: per(monthly.total),
  };

  const kWhMonth = sum('kWhMonth');
  const refrigKWh = steps.filter((st) => st.refrigeration).reduce((a, st) => a + st.kWhMonth, 0);

  // Residence times along the main path (side streams excluded).
  const dwell = (id: string) => specs.get(id)!.dwellMin;
  const ambient = (id: string) => specs.get(id)!.state === 'ambient';
  const run = new Map<string, number>();
  const longest = new Map<string, number>();
  const frozenPrefix = new Map<string, number | null>();
  let oof = 0;
  let fruitAge = 0;
  for (const n of graph.main) {
    const ps = mainPreds(n.id);
    const prevRun = ps.length ? Math.max(...ps.map((p) => run.get(p) ?? 0)) : 0;
    const r = ambient(n.id) ? prevRun + dwell(n.id) : 0;
    run.set(n.id, r);
    oof = Math.max(oof, r);
    longest.set(n.id, dwell(n.id) + (ps.length ? Math.max(...ps.map((p) => longest.get(p) ?? 0)) : 0));
    const pf = ps.map((p) => frozenPrefix.get(p));
    const allFrozenUp = pf.every((v) => v !== null && v !== undefined);
    if (!ambient(n.id) && allFrozenUp) {
      frozenPrefix.set(n.id, dwell(n.id) + (pf.length ? Math.max(...(pf as number[])) : 0));
    } else {
      frozenPrefix.set(n.id, null);
      if (ambient(n.id) && allFrozenUp && pf.length) fruitAge = Math.max(fruitAge, Math.max(...(pf as number[])));
    }
  }
  for (const st of steps) st.oofClockMin = run.get(st.id) ?? 0;
  const startToFinish = graph.main.length ? Math.max(...graph.main.map((n) => longest.get(n.id)!)) : 0;

  return {
    demand, maxGood, output, shortfall: Math.max(0, demand - maxGood),
    supportedFleet: (maxGood * g.prodDays) / (7 * g.cupsPerMachine),
    bottleneckId, bottleneckName: bottleneckId ? steps.find((st) => st.id === bottleneckId)?.name : undefined,
    yield: overallYield, steps, cupsPerMonth, monthly, perCup,
    capex: { equipment, installation, fitOut, contingency, total: capexTotal },
    power: {
      connectedKW: sum('connectedKW'), averageKW: sum('avgKW'), kWhPerDay: kWhMonth / DAYS_PER_MONTH,
      kWhPerCup: per(kWhMonth), costMonth: monthly.power,
      refrigerationShare: kWhMonth > 0 ? refrigKWh / kWhMonth : 0,
    },
    labour: { fte: sum('fte'), hoursMonth: sum('labourHoursMonth') },
    residence: {
      oofWindowMin: oof, oofLimitMin: g.oofLimitMin, oofOk: oof <= g.oofLimitMin,
      fruitAgeMin: fruitAge, cupAgeMin: Math.max(0, startToFinish - fruitAge),
      startToFinishMin: startToFinish, frozenStock: EMPTY_SPEC_SAFE(sum('frozenStock')),
    },
  };
}

/** Units per step so every step runs at or below the target utilisation. */
export function rightSize(s: Scenario, cat: Catalogue): Scenario {
  const r = simulate(s, cat);
  const target = s.globals.targetUtil / 100;
  const nodes = s.nodes.map((n) => {
    const st = r.steps.find((x) => x.id === n.id);
    if (!st || !Number.isFinite(st.perUnitCapacity) || st.perUnitCapacity <= 0) return n;
    const units = Math.max(1, Math.ceil(st.requiredEntering / (st.perUnitCapacity * target) - 1e-9));
    return { ...n, units };
  });
  return { ...s, nodes };
}

export interface ReliefResult {
  scenario: Scenario;
  stepName: string;
  before: number;
  after: number;
  nextName?: string;
}

/** Add one unit to the slowest step. */
export function relieveBottleneck(s: Scenario, cat: Catalogue): ReliefResult | undefined {
  const r = simulate(s, cat);
  if (!r.bottleneckId) return undefined;
  const scenario = {
    ...s,
    nodes: s.nodes.map((n) => (n.id === r.bottleneckId ? { ...n, units: n.units + 1 } : n)),
  };
  const r2 = simulate(scenario, cat);
  return {
    scenario, stepName: r.bottleneckName ?? '', before: r.supportedFleet, after: r2.supportedFleet,
    nextName: r2.bottleneckName,
  };
}

export function withFleet(s: Scenario, fleet: number): Scenario {
  return { ...s, globals: { ...s.globals, fleet } };
}

export function withPick(s: Scenario, pick: RangePick): Scenario {
  return { ...s, globals: { ...s.globals, pick: { rate: pick, cost: pick, kW: pick } } };
}

export function insight(s: Scenario, cat: Catalogue): string {
  const r = simulate(s, cat);
  if (!r.bottleneckId) return 'Add equipment to see where the line runs out of capacity.';
  const rel = relieveBottleneck(s, cat);
  if (!rel) return '';
  const f = (v: number) => (Number.isFinite(v) ? Math.floor(v).toString() : 'unlimited');
  const short = r.shortfall > 0
    ? `The line is ${Math.round(r.shortfall).toLocaleString()} cups/day short of demand. `
    : '';
  return `${short}Adding one unit at ${rel.stepName} lifts the supported fleet from ${f(rel.before)} to ${f(rel.after)} machines. Next limit is ${rel.nextName ?? 'none'}.`;
}
