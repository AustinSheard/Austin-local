import { autoArrange, footprint, layoutIssues } from '../src/engine/footprint';
import type { Catalogue, FloorLayout, PlacedItem } from '../src/engine/types';
import raw from '../src/data/catalogue.json';
import { defaultLayout, templates } from '../src/data/templates';

const cat = raw as unknown as Catalogue;
const item = (id: string, x: number, y: number, L = 1, W = 1, clearance = 0.5, rot: PlacedItem['rot'] = 0): PlacedItem =>
  ({ id, label: id, x, y, L, W, clearance, rot });
const room = (items: PlacedItem[]): FloorLayout => ({ ...defaultLayout(), roomL: 10, roomW: 5, items });

describe('floor plan', () => {
  it('detects overlaps', () => {
    const issues = layoutIssues(room([item('a', 1, 1, 2, 1), item('b', 2, 1.5)]));
    expect(issues.some((i) => i.kind === 'overlap')).toBe(true);
  });
  it('detects clearance clashes without overlap', () => {
    const issues = layoutIssues(room([item('a', 1, 1), item('b', 2.2, 1)]));
    expect(issues.map((i) => i.kind)).toEqual(['clearance']);
  });
  it('touching halos with no body inside are fine', () => {
    expect(layoutIssues(room([item('a', 1, 1), item('b', 2.5, 1)]))).toEqual([]);
  });
  it('detects items outside the room, including after rotation', () => {
    expect(layoutIssues(room([item('a', 9.5, 1)]))[0].kind).toBe('outside');
    expect(layoutIssues(room([item('a', 8, 3, 3, 1, 0, 90)]))[0].kind).toBe('outside');
    expect(layoutIssues(room([item('a', 8, 1, 3, 1, 0, 90)]))).toEqual([]);
  });
  it('total area maths', () => {
    const s = templates.midland.build();
    s.layout.items = [item('office', 0, 0, 3, 3, 0)];
    const f = footprint(s, cat);
    expect(f.facilityM2).toBe(9);
    const net = f.equipmentM2 + f.clearanceM2 + f.coldStorageM2 + f.facilityM2;
    expect(f.aisleM2).toBeCloseTo(net * 0.3, 9);
    expect(f.requiredM2).toBeCloseTo(net * 1.3, 9);
    expect(f.roomM2).toBe(96);
    expect(f.spareM2).toBeCloseTo(96 - f.requiredM2, 9);
    expect(f.utilisation).toBeCloseTo(f.requiredM2 / 96, 9);
    expect(f.minRoomSide ** 2).toBeCloseTo(f.requiredM2, 9);
    expect(f.fitOutAUD).toBeCloseTo(400 * f.requiredM2, 6);
  });
  it('auto-arrange places every unit in process order', () => {
    const s = templates.midland.build();
    const items = autoArrange(s, cat);
    expect(items).toHaveLength(s.nodes.reduce((a, n) => a + n.units, 0));
    expect(items[0].nodeId).toBe('n1');
  });
});
