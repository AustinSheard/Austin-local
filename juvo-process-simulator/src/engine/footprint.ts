// Floor plan geometry and footprint maths. Metres throughout.

import { nodeName, resolveSpec, simulate } from './engine';
import type { Catalogue, FloorLayout, PlacedItem, Scenario } from './types';

export interface Rect { x: number; y: number; w: number; h: number }

/** Body rectangle after rotation (90/270 swap L and W). */
export function bodyRect(it: PlacedItem): Rect {
  const swap = it.rot === 90 || it.rot === 270;
  return { x: it.x, y: it.y, w: swap ? it.W : it.L, h: swap ? it.L : it.W };
}

export function haloRect(it: PlacedItem): Rect {
  const b = bodyRect(it);
  const c = it.clearance;
  return { x: b.x - c, y: b.y - c, w: b.w + 2 * c, h: b.h + 2 * c };
}

const EPS = 1e-6;
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

export function insideRoom(r: Rect, L: number, W: number): boolean {
  return r.x >= -EPS && r.y >= -EPS && r.x + r.w <= L + EPS && r.y + r.h <= W + EPS;
}

export interface LayoutIssue {
  kind: 'overlap' | 'clearance' | 'outside';
  ids: string[];
  message: string;
}

export function layoutIssues(layout: FloorLayout): LayoutIssue[] {
  const out: LayoutIssue[] = [];
  const its = layout.items;
  for (const it of its) {
    if (!insideRoom(bodyRect(it), layout.roomL, layout.roomW)) {
      out.push({ kind: 'outside', ids: [it.id], message: `${it.label} is outside the room` });
    }
  }
  for (let i = 0; i < its.length; i++) {
    for (let j = i + 1; j < its.length; j++) {
      const a = its[i];
      const b = its[j];
      if (intersects(bodyRect(a), bodyRect(b))) {
        out.push({ kind: 'overlap', ids: [a.id, b.id], message: `${a.label} overlaps ${b.label}` });
      } else if (intersects(haloRect(a), bodyRect(b)) || intersects(bodyRect(a), haloRect(b))) {
        out.push({ kind: 'clearance', ids: [a.id, b.id], message: `${a.label} is inside the service clearance of ${b.label}` });
      }
    }
  }
  return out;
}

export interface FootprintResult {
  equipmentM2: number;
  clearanceM2: number;
  aisleM2: number;
  coldStorageM2: number;
  coldStorageM3: number;
  facilityM2: number;
  requiredM2: number;
  roomM2: number;
  utilisation: number;
  spareM2: number;
  m2PerMachine: number;
  minRoomSide: number;
  fitOutAUD: number;
  coolRoomAUD: number;
}

/**
 * Area needed by a scenario. Uses flowsheet units (each unit is a rectangle),
 * plus any facility-only items placed on the plan.
 */
export function footprint(s: Scenario, cat: Catalogue): FootprintResult {
  const lay = s.layout;
  const r = simulate(s, cat);
  let equipmentM2 = 0;
  let clearanceM2 = 0;
  let coldStorageM2 = 0;
  let coldStorageM3 = 0;
  for (const n of s.nodes) {
    const sp = resolveSpec(cat, n);
    if (!sp) continue;
    const body = sp.L * sp.W * n.units;
    const halo = ((sp.L + 2 * sp.clearance) * (sp.W + 2 * sp.clearance) - sp.L * sp.W) * n.units;
    if (sp.kind === 'storage' && sp.state === 'frozen') {
      const st = r.steps.find((x) => x.id === n.id);
      const stock = st ? st.frozenStock : 0;
      const m3 = stock / Math.max(1, lay.cupsPerM3) / Math.max(0.01, sp.usableFill);
      coldStorageM3 += m3;
      if (sp.volumeM3) {
        // Cool rooms: area from required volume at ceiling height, or own footprint if larger.
        const area = Math.max(m3 / Math.max(0.5, lay.ceilingH), body);
        coldStorageM2 += area;
        clearanceM2 += halo;
        continue;
      }
      coldStorageM2 += body;
      clearanceM2 += halo;
      continue;
    }
    if (sp.facilityOnly) continue;
    equipmentM2 += body;
    clearanceM2 += halo;
  }
  const facilityM2 = lay.items
    .filter((it) => !it.nodeId)
    .reduce((a, it) => a + it.L * it.W, 0);
  const net = equipmentM2 + clearanceM2 + coldStorageM2 + facilityM2;
  const aisleM2 = (net * lay.aislePct) / 100;
  const requiredM2 = net + aisleM2;
  const roomM2 = lay.roomL * lay.roomW;
  const supported = Number.isFinite(r.supportedFleet) ? Math.min(r.supportedFleet, s.globals.fleet) : s.globals.fleet;
  const coolRoomM3 = s.nodes.reduce((a, n) => {
    const sp = resolveSpec(cat, n);
    return a + (sp?.volumeM3 ? sp.volumeM3 * n.units : 0);
  }, 0);
  return {
    equipmentM2, clearanceM2, aisleM2, coldStorageM2, coldStorageM3, facilityM2, requiredM2, roomM2,
    utilisation: roomM2 > 0 ? requiredM2 / roomM2 : 0,
    spareM2: roomM2 - requiredM2,
    m2PerMachine: supported > 0 ? requiredM2 / supported : 0,
    minRoomSide: Math.sqrt(requiredM2),
    fitOutAUD: lay.fitOutPerM2 * requiredM2,
    coolRoomAUD: lay.coolRoomPerM3 * coolRoomM3,
  };
}

/** Scenario with the fit-out taken from the floor plan when linked. */
export function withLinkedFitOut(s: Scenario, cat: Catalogue): Scenario {
  if (!s.layout.linkFitOut) return s;
  const fp = footprint(s, cat);
  return { ...s, globals: { ...s.globals, fitOut: fp.fitOutAUD } };
}

/** Place every flowsheet unit left to right in process order, wrapping rows inside the room. */
export function autoArrange(s: Scenario, cat: Catalogue, grid = 0.1): PlacedItem[] {
  const r = simulate(s, cat);
  const order = r.steps.filter((x) => !x.sideStream).map((x) => x.id)
    .concat(r.steps.filter((x) => x.sideStream).map((x) => x.id))
    .concat(s.nodes.filter((n) => !r.steps.some((x) => x.id === n.id)).map((n) => n.id));
  const items: PlacedItem[] = [];
  const snap = (v: number) => Math.round(v / grid) * grid;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const id of order) {
    const n = s.nodes.find((m) => m.id === id);
    if (!n) continue;
    const sp = resolveSpec(cat, n);
    if (!sp) continue;
    for (let u = 0; u < n.units; u++) {
      const w = sp.L + 2 * sp.clearance;
      const h = sp.W + 2 * sp.clearance;
      if (x + w > s.layout.roomL && x > 0) { x = 0; y += rowH; rowH = 0; }
      items.push({
        id: `${n.id}#${u}`, nodeId: n.id, variantId: n.variantId, label: nodeName(cat, n),
        x: snap(x + sp.clearance), y: snap(y + sp.clearance), L: sp.L, W: sp.W, clearance: sp.clearance, rot: 0,
      });
      x += w;
      rowH = Math.max(rowH, h);
    }
  }
  const facility = s.layout.items.filter((it) => !it.nodeId);
  return [...items, ...facility];
}
