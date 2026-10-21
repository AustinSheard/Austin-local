// Generates src/data/catalogue.json. Edit the JSON directly or change this script and re-run:
//   npm run catalogue
// Every number is a PLACEHOLDER unless tagged otherwise. Labeller quotes are real (source = quote).
import { writeFileSync } from 'node:fs';

const P = { kind: 'placeholder' };
const base = {
  kind: 'rate', state: 'ambient', sideStream: false, rate: { typ: 300 }, cupsHeld: 0, oee: 0.85,
  usableFill: 0.8, loss: 0, dwellMin: 1, dwellUnit: 'min', kW: { typ: 0 }, duty: 0.6, alwaysOn: false,
  operators: 0, cost: { typ: 0 }, currency: 'AUD', life: 10, maintPct: 0.03, materials: [], L: 1, W: 1,
  H: 1, clearance: 0.5, notes: '', customFields: [], sources: {},
};
const types = [];
const variants = [];
const categories = [];

function type(category, id, name, list) {
  if (!categories.includes(category)) categories.push(category);
  types.push({ id, name, category, defaultVariantId: `${id}.${list[0][0]}` });
  for (const [vid, vname, spec, extra = {}] of [...list, ['custom', 'Custom', list[0][2]]]) {
    const s = { ...base, ...spec };
    const sources = {};
    for (const k of Object.keys(s)) if (!['sources', 'notes', 'customFields', 'materials', 'dwellUnit'].includes(k)) sources[k] = P;
    Object.assign(sources, spec.sources ?? {});
    variants.push({ id: `${id}.${vid}`, typeId: id, name: vid === 'custom' ? `${name} (custom)` : vname, ...extra, spec: { ...s, sources } });
  }
}

const day = 1440;
const store = (o) => ({ kind: 'storage', state: 'frozen', alwaysOn: true, duty: 0.45, dwellUnit: 'd', dwellMin: 3 * day, oee: 1, clearance: 0.3, maintPct: 0.02, ...o });
const coolRoom = (m3) => store({ volumeM3: m3, cupsHeld: m3 * 1000, usableFill: 0.7, kW: { typ: 1.5 + m3 * 0.12 }, duty: 0.5, cost: { min: 15000 + m3 * 1500, typ: 20000 + m3 * 2000, max: 25000 + m3 * 2600 }, L: +Math.max(2.5, Math.sqrt(m3 / 2.4) * 1.2).toFixed(1), W: +Math.max(2.4, Math.sqrt(m3 / 2.4) / 1.2).toFixed(1), H: 2.7, life: 15 });

// Cold storage
type('Cold storage', 'chest-freezer', 'Chest freezer', [
  ['500', 'Chest freezer 500 L', store({ cupsHeld: 900, kW: { typ: 0.35 }, cost: { min: 900, typ: 1200, max: 1600 }, L: 1.6, W: 0.75, H: 0.9, life: 8 })],
  ['300', 'Chest freezer 300 L', store({ cupsHeld: 520, kW: { typ: 0.25 }, cost: { typ: 800 }, L: 1.1, W: 0.7, H: 0.9, life: 8 })],
  ['700', 'Chest freezer 700 L', store({ cupsHeld: 1250, kW: { typ: 0.45 }, cost: { typ: 1700 }, L: 2.0, W: 0.8, H: 0.9, life: 8 })],
  ['bank4', 'Chest freezer bank of 4 (500 L)', store({ cupsHeld: 3600, kW: { typ: 1.4 }, cost: { typ: 4800 }, L: 6.6, W: 0.75, H: 0.9, life: 8 })],
]);
type('Cold storage', 'upright-freezer', 'Upright freezer', [
  ['single', 'Upright freezer single door', store({ cupsHeld: 700, kW: { typ: 0.4 }, cost: { typ: 2500 }, L: 0.7, W: 0.8, H: 2.0 })],
  ['double', 'Upright freezer double door', store({ cupsHeld: 1400, kW: { typ: 0.7 }, cost: { typ: 4500 }, L: 1.4, W: 0.8, H: 2.0 })],
]);
type('Cold storage', 'cool-room', 'Cool room -20 °C', [
  ['20', 'Cool room -20 °C 20 m³', coolRoom(20)],
  ['10', 'Cool room -20 °C 10 m³', coolRoom(10)],
  ['40', 'Cool room -20 °C 40 m³', coolRoom(40)],
]);
type('Cold storage', 'blast-freezer', 'Blast freezer', [
  ['cabinet', 'Blast freezer cabinet', store({ cupsHeld: 400, dwellMin: 120, dwellUnit: 'h', kW: { typ: 3 }, duty: 0.8, cost: { typ: 12000 }, L: 0.9, W: 0.9, H: 2 })],
  ['tunnel', 'Blast freezer tunnel', store({ cupsHeld: 1500, dwellMin: 45, dwellUnit: 'min', kW: { typ: 25 }, duty: 0.8, cost: { typ: 180000 }, L: 8, W: 1.5, H: 2 })],
  ['spiral', 'Blast freezer spiral', store({ cupsHeld: 3000, dwellMin: 60, dwellUnit: 'min', kW: { typ: 45 }, duty: 0.8, cost: { typ: 350000 }, L: 5, W: 4, H: 3.5 })],
]);
type('Cold storage', 'pallet-freezer', 'Pallet freezer store', [
  ['std', 'Pallet freezer store (8 pallets)', store({ volumeM3: 60, cupsHeld: 60000, usableFill: 0.7, kW: { typ: 9 }, cost: { typ: 140000 }, L: 6, W: 4, H: 4, life: 15 })],
]);

// Fruit handling
const amb = (o) => ({ state: 'ambient', ...o });
type('Fruit handling', 'fruit-portioning', 'Manual fruit portioning and cup loading', [
  ['manual', 'Manual portioning station', amb({ rate: { min: 120, typ: 150, max: 180 }, loss: 0.014, dwellMin: 5, operators: 1, cost: { typ: 2500 }, kW: { typ: 0.1 }, L: 1.8, W: 0.8, materials: [{ name: 'Fruit (IQF)', qty: 120, unit: 'g', price: 6, source: 'placeholder' }, { name: 'Aluminium cup', qty: 1, unit: 'each', price: 0.3, source: 'placeholder' }] })],
]);
type('Fruit handling', 'fruit-depositor', 'Semi-auto fruit depositor', [
  ['std', 'Semi-auto fruit depositor', amb({ rate: { typ: 600 }, loss: 0.01, dwellMin: 3, operators: 1, cost: { typ: 25000 }, kW: { typ: 1.5 }, L: 1.5, W: 1, materials: [{ name: 'Fruit (IQF)', qty: 120, unit: 'g', price: 6 }, { name: 'Aluminium cup', qty: 1, unit: 'each', price: 0.3 }] })],
]);
type('Fruit handling', 'comb-weigher', 'Combination weigher', [
  ['24head', '24-head combination weigher with denester', amb({ rate: { min: 2100, typ: 2400, max: 2700 }, loss: 0.008, dwellMin: 2, operators: 1, cost: { typ: 120000 }, kW: { typ: 4 }, L: 3, W: 2.5, H: 3.5, materials: [{ name: 'Fruit (IQF)', qty: 120, unit: 'g', price: 6 }, { name: 'Aluminium cup', qty: 1, unit: 'each', price: 0.3 }] })],
  ['10head', '10-head combination weigher', amb({ rate: { typ: 1200 }, loss: 0.01, dwellMin: 2, operators: 1, cost: { typ: 45000 }, kW: { typ: 2 }, L: 2, W: 2, H: 3, materials: [{ name: 'Fruit (IQF)', qty: 120, unit: 'g', price: 6 }, { name: 'Aluminium cup', qty: 1, unit: 'each', price: 0.3 }] })],
]);
type('Fruit handling', 'denester', 'Cup denester / dispenser', [
  ['semi', 'Cup denester semi-auto', amb({ rate: { typ: 1200 }, dwellMin: 0.5, cost: { typ: 8000 }, kW: { typ: 0.5 }, L: 0.8, W: 0.6 })],
  ['manual', 'Cup dispenser manual', amb({ rate: { typ: 600 }, dwellMin: 0.5, operators: 0.5, cost: { typ: 400 }, L: 0.5, W: 0.5 })],
  ['inline', 'Cup denester inline', amb({ rate: { typ: 3000 }, dwellMin: 0.5, cost: { typ: 18000 }, kW: { typ: 1 }, L: 1, W: 0.8 })],
]);
type('Fruit handling', 'fruit-feed', 'Fruit conveyor / hopper feed', [
  ['std', 'Fruit incline conveyor and hopper', amb({ rate: { typ: 3000 }, dwellMin: 1, cost: { typ: 15000 }, kW: { typ: 0.75 }, L: 3, W: 0.8 })],
]);

// Powder blending (side stream)
const side = (o) => ({ state: 'ambient', sideStream: true, dwellMin: 30, operators: 0.25, kW: { typ: 1.5 }, duty: 0.7, loss: 0.005, ...o });
const powder = [{ name: 'Powder blend', qty: 40, unit: 'g', price: 18, source: 'placeholder' }];
type('Powder blending', 'ribbon-mixer', 'Ribbon mixer', [
  ['50', 'Ribbon mixer 50 L', side({ rate: { typ: 600 }, cost: { typ: 3500 }, kW: { typ: 1.5 }, L: 1.2, W: 0.6, materials: powder })],
  ['100', 'Ribbon mixer 100 L', side({ rate: { typ: 1200 }, cost: { typ: 6000 }, kW: { typ: 2.2 }, L: 1.5, W: 0.7, materials: powder })],
  ['200', 'Ribbon mixer 200 L', side({ rate: { typ: 2400 }, cost: { typ: 9000 }, kW: { typ: 4 }, L: 1.8, W: 0.8, materials: powder })],
  ['500', 'Ribbon mixer 500 L', side({ rate: { typ: 6000 }, cost: { typ: 16000 }, kW: { typ: 7.5 }, L: 2.4, W: 1, materials: powder })],
]);
type('Powder blending', 'v-blender', 'V-blender', [['100', 'V-blender 100 L', side({ rate: { typ: 1000 }, cost: { typ: 5000 }, L: 1.5, W: 1, materials: powder })]]);
type('Powder blending', 'powder-scale', 'Powder scale / batching station', [['std', 'Powder batching station', side({ rate: { typ: 1500 }, kW: { typ: 0.1 }, cost: { typ: 1500 }, L: 1.2, W: 0.7 })]]);
type('Powder blending', 'sifter', 'Sifter', [['std', 'Vibratory sifter', side({ rate: { typ: 3000 }, kW: { typ: 0.5 }, cost: { typ: 3000 }, L: 0.8, W: 0.8 })]]);

// Powder dosing
type('Powder dosing', 'auger-filler', 'Auger filler', [
  ['desktop', 'Auger filler desktop single head', amb({ rate: { min: 240, typ: 300, max: 360 }, loss: 0.01, dwellMin: 3, operators: 0.5, cost: { typ: 3000 }, kW: { typ: 0.8 }, L: 0.8, W: 0.6 })],
  ['semi', 'Auger filler semi-auto floor model', amb({ rate: { typ: 600 }, loss: 0.01, dwellMin: 2, operators: 1, cost: { typ: 9000 }, kW: { typ: 1.5 }, L: 1, W: 0.9 })],
  ['inline1', 'Auger filler inline single head', amb({ rate: { min: 2400, typ: 3000, max: 3600 }, loss: 0.006, dwellMin: 1, operators: 0, cost: { typ: 35000 }, kW: { typ: 2.5 }, L: 2, W: 1.2 })],
  ['inline2', 'Auger filler inline dual head', amb({ rate: { typ: 5400 }, loss: 0.006, dwellMin: 1, cost: { typ: 55000 }, kW: { typ: 4 }, L: 2.5, W: 1.2 })],
  ['rotary', 'Auger filler rotary', amb({ rate: { typ: 4800 }, loss: 0.006, dwellMin: 1, cost: { typ: 90000 }, kW: { typ: 5 }, L: 2.5, W: 2 })],
]);
type('Powder dosing', 'vol-filler', 'Vibratory / volumetric cup filler', [['std', 'Volumetric cup filler', amb({ rate: { typ: 1800 }, loss: 0.01, dwellMin: 1, operators: 0.5, cost: { typ: 20000 }, kW: { typ: 1.5 }, L: 1.5, W: 1 })]]);
type('Powder dosing', 'powder-hopper', 'Powder hopper with level control', [['std', 'Powder hopper with level control', amb({ rate: { typ: 6000 }, dwellMin: 0.5, cost: { typ: 6000 }, kW: { typ: 0.4 }, L: 1, W: 1 })]]);

// Closing
const lid = [{ name: 'Lid', qty: 1, unit: 'each', price: 0.12, source: 'placeholder' }];
type('Closing', 'seamer', 'Can seamer', [
  ['semi', 'Can seamer semi-auto desktop', amb({ rate: { min: 200, typ: 250, max: 300 }, loss: 0.01, dwellMin: 3, operators: 0.5, cost: { typ: 4500 }, kW: { typ: 0.75 }, L: 0.8, W: 0.6, materials: lid })],
  ['manual', 'Can seamer manual', amb({ rate: { typ: 120 }, loss: 0.015, dwellMin: 3, operators: 1, cost: { typ: 1500 }, L: 0.6, W: 0.5, materials: lid })],
  ['auto', 'Can seamer automatic inline', amb({ rate: { min: 2400, typ: 3000, max: 3600 }, loss: 0.005, dwellMin: 1, operators: 0, cost: { typ: 60000 }, kW: { typ: 3 }, L: 2, W: 1.2, materials: lid })],
]);
type('Closing', 'lid-placer', 'Lid placer', [
  ['semi', 'Lid placer semi-auto', amb({ rate: { typ: 900 }, dwellMin: 0.5, operators: 0.5, cost: { typ: 6000 }, kW: { typ: 0.3 }, L: 0.8, W: 0.6 })],
  ['manual', 'Lid placer manual', amb({ rate: { typ: 300 }, dwellMin: 0.5, operators: 1, cost: { typ: 300 }, L: 0.6, W: 0.5 })],
  ['auto', 'Lid placer automatic', amb({ rate: { typ: 3600 }, dwellMin: 0.5, cost: { typ: 20000 }, kW: { typ: 0.8 }, L: 1, W: 0.8 })],
]);
type('Closing', 'heat-sealer', 'Heat sealer', [
  ['desktop', 'Heat sealer desktop', amb({ rate: { typ: 300 }, loss: 0.01, dwellMin: 2, operators: 1, cost: { typ: 2000 }, kW: { typ: 1 }, L: 0.6, W: 0.5, materials: lid })],
  ['inline', 'Heat sealer inline', amb({ rate: { typ: 2400 }, loss: 0.006, dwellMin: 1, cost: { typ: 45000 }, kW: { typ: 4 }, L: 2, W: 1, materials: lid })],
]);
type('Closing', 'n2-flush', 'Nitrogen flushing add-on', [['std', 'Nitrogen flushing add-on', amb({ rate: { typ: 3000 }, dwellMin: 0.2, cost: { typ: 12000 }, kW: { typ: 0.3 }, L: 0.6, W: 0.6 })]]);

// Inspection
type('Inspection', 'checkweigher', 'Checkweigher', [
  ['inline', 'Checkweigher inline with reject', amb({ rate: { typ: 3600 }, loss: 0.003, dwellMin: 0.5, cost: { typ: 25000 }, kW: { typ: 0.5 }, L: 1.5, W: 0.8 })],
  ['basic', 'Checkweigher basic', amb({ rate: { typ: 600 }, loss: 0.003, dwellMin: 0.5, operators: 0.5, cost: { typ: 1500 }, kW: { typ: 0.1 }, L: 0.6, W: 0.5 })],
  ['traffic', 'Checkweigher traffic-light', amb({ rate: { typ: 900 }, loss: 0.003, dwellMin: 0.5, operators: 0.5, cost: { typ: 3500 }, kW: { typ: 0.1 }, L: 0.7, W: 0.5 })],
]);
type('Inspection', 'metal-detector', 'Metal detector', [['std', 'Metal detector conveyor', amb({ rate: { typ: 3600 }, loss: 0.001, dwellMin: 0.3, cost: { typ: 30000 }, kW: { typ: 0.5 }, L: 1.5, W: 0.8 })]]);
type('Inspection', 'vision', 'Vision inspection', [['std', 'Vision inspection station', amb({ rate: { typ: 3600 }, loss: 0.002, dwellMin: 0.2, cost: { typ: 40000 }, kW: { typ: 0.5 }, L: 1, W: 0.8 })]]);
type('Inspection', 'xray', 'X-ray', [['std', 'X-ray inspection', amb({ rate: { typ: 3600 }, loss: 0.002, dwellMin: 0.3, cost: { typ: 110000 }, kW: { typ: 2 }, L: 2, W: 1.2 })]]);

// Labelling and coding — real quotes (USD EXW China), rate = mid-point of quoted range
const Q = (note) => ({ kind: 'quote', note });
const stickers = [{ name: 'Stickers / labels', qty: 1, unit: 'each', price: 0.1, source: 'placeholder' }];
const quoted = (o, note) => ({ ...amb(o), currency: 'USD', materials: stickers, sources: { rate: Q(note), cost: Q(note), L: Q(note), W: Q(note), currency: Q(note) } });
type('Labelling and coding', 'labeller', 'Labeller', [
  ['ym140', 'Yimu YM140 semi-auto labeller', quoted({ rate: { min: 900, typ: 1050, max: 1200 }, loss: 0.005, dwellMin: 2, operators: 0.5, cost: { typ: 4200 }, kW: { typ: 0.5 }, L: 1.0, W: 0.7 }, 'Yimu quote 28 Aug, expired'), { supplier: 'Yimu', model: 'YM140', quoteIds: ['q-ym140'], selectedQuoteId: 'q-ym140' }],
  ['gsl212t', 'Gosunm GSL-212T auto labeller', quoted({ rate: { min: 720, typ: 960, max: 1200 }, loss: 0.005, dwellMin: 1, operators: 0.25, cost: { typ: 4150 }, kW: { typ: 0.6 }, L: 1.1, W: 1.1 }, 'Gosunm quote valid to 18 Nov 2026'), { supplier: 'Gosunm', model: 'GSL-212T', quoteIds: ['q-gsl212t'], selectedQuoteId: 'q-gsl212t' }],
  ['ym515', 'Yimu YM515 tapered-cup auto labeller', quoted({ rate: { min: 600, typ: 1200, max: 1800 }, loss: 0.004, dwellMin: 1, operators: 0.25, cost: { typ: 8300 }, kW: { typ: 0.8 }, L: 2.0, W: 1.0 }, 'Yimu YM515 quote, 24-month warranty'), { supplier: 'Yimu', model: 'YM515', quoteIds: ['q-ym515'], selectedQuoteId: 'q-ym515' }],
  ['change', 'Change Machinery semi-auto labeller', { ...quoted({ rate: { min: 0, typ: 750, max: 1500 }, loss: 0.005, dwellMin: 2, operators: 0.5, cost: { typ: 2275 }, kW: { typ: 0.5 }, L: 1.0, W: 0.7, notes: 'Footprint not stated in quote; L × W is a placeholder.' }, 'Change Machinery quote'), sources: { rate: Q('Change Machinery quote'), cost: Q('Change Machinery quote'), currency: Q('Change Machinery quote') } }, { supplier: 'Change Machinery', quoteIds: ['q-change'], selectedQuoteId: 'q-change' }],
  ['manual', 'Manual labelling station', amb({ rate: { typ: 240 }, loss: 0.005, dwellMin: 2, operators: 1, cost: { typ: 300 }, L: 1.2, W: 0.7, materials: stickers })],
]);
type('Labelling and coding', 'coder', 'Coder', [
  ['label-ij', 'Label inkjet coder', amb({ rate: { typ: 3600 }, dwellMin: 0.2, cost: { typ: 500 }, currency: 'USD', kW: { typ: 0.1 }, L: 0.4, W: 0.3 })],
  ['cup-ij', 'Cup-bottom inkjet coder', amb({ rate: { typ: 3600 }, dwellMin: 0.2, cost: { typ: 1800 }, currency: 'USD', kW: { typ: 0.2 }, L: 0.6, W: 0.4 })],
  ['anser', 'ANSER U2 Pro-S inkjet', amb({ rate: { typ: 3600 }, dwellMin: 0.2, cost: { typ: 3000 }, kW: { typ: 0.1 }, L: 0.4, W: 0.3 })],
  ['tto', 'Thermal transfer coder', amb({ rate: { typ: 3600 }, dwellMin: 0.2, cost: { typ: 9000 }, kW: { typ: 0.2 }, L: 0.4, W: 0.4 })],
]);

// Packing
const carton = [{ name: 'Carton share', qty: 1, unit: 'each', price: 0.05, source: 'placeholder' }];
type('Packing', 'cartoning', 'Cartoning', [
  ['manual', 'Manual cartoning station', amb({ rate: { min: 300, typ: 400, max: 480 }, loss: 0.003, dwellMin: 7, operators: 1, cost: { typ: 1500 }, L: 1.8, W: 0.8, materials: carton })],
  ['semi', 'Semi-auto carton erector', amb({ rate: { typ: 1800 }, loss: 0.002, dwellMin: 3, operators: 1, cost: { typ: 30000 }, kW: { typ: 1.5 }, L: 2, W: 1.5, materials: carton })],
  ['case', 'Case packer', amb({ rate: { typ: 3600 }, loss: 0.002, dwellMin: 2, operators: 0.25, cost: { typ: 90000 }, kW: { typ: 3 }, L: 3, W: 2, materials: carton })],
]);
type('Packing', 'shrink', 'Shrink wrapper', [['std', 'Shrink wrapper', amb({ rate: { typ: 1800 }, dwellMin: 1, operators: 0.5, cost: { typ: 15000 }, kW: { typ: 6 }, L: 2, W: 1 })]]);
type('Packing', 'pallet-wrap', 'Pallet wrapper', [['std', 'Pallet wrapper', amb({ rate: { typ: 10000 }, dwellMin: 1, cost: { typ: 12000 }, kW: { typ: 1.5 }, L: 2.5, W: 2 })]]);

// Handling and utilities
type('Handling and utilities', 'conveyor', 'Conveyor', [
  ['2m', 'Conveyor 2 m', amb({ rate: { typ: 6000 }, dwellMin: 0.3, cost: { typ: 3000 }, kW: { typ: 0.37 }, L: 2, W: 0.4 })],
  ['1m', 'Conveyor 1 m', amb({ rate: { typ: 6000 }, dwellMin: 0.2, cost: { typ: 2000 }, kW: { typ: 0.25 }, L: 1, W: 0.4 })],
  ['3m', 'Conveyor 3 m', amb({ rate: { typ: 6000 }, dwellMin: 0.5, cost: { typ: 4000 }, kW: { typ: 0.37 }, L: 3, W: 0.4 })],
  ['accum', 'Accumulation table', amb({ rate: { typ: 6000 }, dwellMin: 2, cost: { typ: 5000 }, kW: { typ: 0.37 }, L: 1.2, W: 1.2 })],
]);
const util = (o) => ({ ...amb(o), facilityOnly: true });
type('Handling and utilities', 'pallet-jack', 'Pallet jack / trolley', [['std', 'Pallet jack', util({ cost: { typ: 600 }, L: 1.6, W: 0.7, clearance: 0.3 })]]);
type('Handling and utilities', 'handwash', 'Handwash and sanitising station', [['std', 'Handwash station', util({ cost: { typ: 1500 }, L: 0.6, W: 0.5 })]]);
type('Handling and utilities', 'work-table', 'Work table and scales', [['std', 'Work table and scales', util({ cost: { typ: 900 }, L: 1.8, W: 0.75 })]]);
type('Handling and utilities', 'cip', 'Cleaning / CIP station', [['std', 'Cleaning station', util({ cost: { typ: 4000 }, kW: { typ: 3 }, L: 1.5, W: 1 })]]);

// Facility items (floor plan only)
type('Facility', 'dry-store', 'Dry goods store', [['std', 'Dry goods store', util({ L: 3, W: 3, clearance: 0 })]]);
type('Facility', 'pack-store', 'Packaging store', [['std', 'Packaging store', util({ L: 3, W: 2, clearance: 0 })]]);
type('Facility', 'dock', 'Dock / receiving', [['std', 'Dock / receiving', util({ L: 4, W: 3, clearance: 0 })]]);
type('Facility', 'office', 'Office', [['std', 'Office', util({ L: 3, W: 3, clearance: 0 })]]);
type('Facility', 'amenities', 'Amenities', [['std', 'Amenities', util({ L: 3, W: 2.5, clearance: 0 })]]);
type('Facility', 'strip-curtain', 'PVC strip curtain', [['std', 'PVC strip curtain', util({ cost: { typ: 600 }, L: 1.5, W: 0.2, clearance: 0 })]]);
type('Facility', 'fan', 'Extraction fan', [['std', 'Extraction fan', util({ cost: { typ: 1200 }, kW: { typ: 0.5 }, L: 0.6, W: 0.6, clearance: 0 })]]);

// Top-level blank equipment
types.push({ id: 'blank', name: 'Blank equipment', category: 'Custom', defaultVariantId: 'blank.blank' });
categories.push('Custom');
variants.push({ id: 'blank.blank', typeId: 'blank', name: 'Blank equipment', spec: { ...base, sources: {} } });

writeFileSync(new URL('../src/data/catalogue.json', import.meta.url), JSON.stringify({ version: 1, categories, types, variants }, null, 1));
console.log(`${types.length} types, ${variants.length} variants`);
