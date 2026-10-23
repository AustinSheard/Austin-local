import type { EquipmentSpec, FloorLayout, Globals, RoomPreset, Scenario } from '../engine/types';

// Everything here is a PLACEHOLDER except the 30 cups/machine/day planning rule.
export const defaultGlobals = (): Globals => ({
  fleet: 25,
  cupsPerMachine: 30,
  prodDays: 5,
  shiftHours: 8,
  wage: 42,
  kWhPrice: 0.3,
  overheads: 9000,
  fitOut: 15000,
  fitOutLife: 10,
  installPct: 15,
  contingencyPct: 10,
  usdToAud: 1.55,
  targetUtil: 85,
  oofLimitMin: 30,
  flexLabour: true,
  pick: { rate: 'typ', cost: 'typ', kW: 'typ' },
});

export const defaultLayout = (): FloorLayout => ({
  roomL: 12,
  roomW: 8,
  ceilingH: 2.7,
  aislePct: 30,
  cupsPerM3: 1000,
  fitOutPerM2: 400,
  coolRoomPerM3: 2000,
  linkFitOut: false,
  items: [],
});

/** Facility presets are user inputs. Dimensions are left empty on purpose. */
export const roomPresets: RoomPreset[] = [
  { id: 'midland-k7', name: 'Midland Kitchen 7' },
  { id: 'king-st-u9', name: 'King Street Unit 9' },
];

type Step = [variantId: string, units: number, side?: boolean, extra?: { label?: string; overrides?: Partial<EquipmentSpec> }];

function line(id: string, name: string, steps: Step[], extraEdges: [number, number][] = []): Scenario {
  const nodes: Scenario['nodes'] = [];
  const edges: Scenario['edges'] = [];
  let col = 0;
  let prevMain: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const [variantId, units, side, extra] = steps[i];
    const nid = `n${i + 1}`;
    nodes.push({ id: nid, variantId, units, overrides: extra?.overrides ?? {}, label: extra?.label, x: col * 320, y: side ? 230 : 40 });
    if (side) {
      // Side stream feeds the next main step.
      edges.push({ id: `e${i}s`, source: nid, target: `n${i + 2}` });
    } else {
      if (prevMain) edges.push({ id: `e${i}`, source: prevMain, target: nid });
      prevMain = nid;
      col++;
    }
  }
  for (const [a, b] of extraEdges) edges.push({ id: `x${a}-${b}`, source: `n${a}`, target: `n${b}` });
  return {
    id, name, templateId: id, globals: defaultGlobals(), nodes, edges, costLines: [], extraMaterials: [],
    layout: defaultLayout(),
  };
}

export const templates: Record<string, { name: string; build: () => Scenario }> = {
  midland: {
    name: 'Midland semi-auto',
    build: () => line('midland', 'Midland semi-auto (now to Mar-27)', [
      ['chest-freezer.500', 3, false, { label: 'Fruit chest freezers', overrides: { cupsHeld: 2000, notes: 'Bulk IQF fruit, held as cup-equivalents.' } }],
      ['fruit-portioning.manual', 2],
      ['ribbon-mixer.50', 1, true],
      ['auger-filler.desktop', 1],
      ['seamer.semi', 1],
      ['labeller.ym140', 1],
      ['cartoning.manual', 1],
      ['chest-freezer.500', 4, false, { label: 'Cup chest freezers' }],
    ]),
  },
  automated: {
    name: 'Automated line',
    build: () => {
      const s = line('automated', 'Automated line (200+ machines)', [
        ['cool-room.20', 1, false, { label: 'Fruit cool room', overrides: { cupsHeld: 40000, notes: 'Bulk IQF fruit, held as cup-equivalents.' } }],
        ['comb-weigher.24head', 1],
        ['ribbon-mixer.200', 1, true],
        ['auger-filler.inline1', 1],
        ['seamer.auto', 1],
        ['checkweigher.inline', 1],
        ['labeller.ym515', 1],
        ['cartoning.semi', 1],
        ['cool-room.40', 1, false, { label: 'Cup cool room' }],
      ]);
      s.globals.fitOut = 60000;
      s.layout.roomL = 25;
      s.layout.roomW = 12;
      return s;
    },
  },
  hybrid: {
    name: 'Hybrid',
    build: () => line('hybrid', 'Hybrid with automatic labelling', [
      ['chest-freezer.bank4', 1, false, { label: 'Fruit freezers', overrides: { cupsHeld: 8000 } }],
      ['fruit-depositor.std', 1],
      ['ribbon-mixer.100', 1, true],
      ['auger-filler.semi', 1],
      ['seamer.semi', 2],
      ['labeller.gsl212t', 1],
      ['cartoning.manual', 2],
      ['cool-room.10', 1, false, { label: 'Cup cool room' }],
    ]),
  },
  blank: {
    name: 'Blank',
    build: () => line('blank', 'Blank flowsheet', []),
  },
};
