import { insight, relieveBottleneck, rightSize, simulate, withFleet } from '../src/engine/engine';
import { sweep } from '../src/engine/sweep';
import type { Catalogue } from '../src/engine/types';
import raw from '../src/data/catalogue.json';
import { templates } from '../src/data/templates';

const cat = raw as unknown as Catalogue;

describe('Scenario A (Midland semi-auto)', () => {
  const a = templates.midland.build();
  const r = simulate(a, cat);

  it('makes 1,050 good cups/day at 25 machines', () => {
    expect(r.demand).toBeCloseTo(1050, 6);
    expect(r.output).toBeCloseTo(1050, 6);
  });
  it('costs about A$3.21 per cup', () => expect(r.perCup.total).toBeCloseTo(3.21, 1));
  it('cost per cup within 2c of A$3.21', () => expect(Math.abs(r.perCup.total - 3.21)).toBeLessThan(0.02));
  it('yields about 95.9%', () => expect(r.yield * 100).toBeCloseTo(95.9, 1));
  it('has a 20 min out-of-freezer window', () => expect(r.residence.oofWindowMin).toBe(20));
  it('slowest step is the cup freezer store', () => expect(r.bottleneckName).toBe('Cup chest freezers'));
  it('cost breakdown adds up', () => {
    const p = r.perCup;
    expect(p.materials + p.labour + p.power + p.maintenance + p.depreciation + p.overheads).toBeCloseTo(p.total, 9);
    expect(r.monthly.cashOpex).toBeCloseTo(r.monthly.total - r.monthly.depreciation, 6);
  });
  it('CAPEX = (equipment x (1 + install) + fit-out) x (1 + contingency)', () => {
    const g = a.globals;
    expect(r.capex.total).toBeCloseTo((r.capex.equipment * (1 + g.installPct / 100) + g.fitOut) * (1 + g.contingencyPct / 100), 6);
  });

  it('at 100 machines as built is short of demand', () => {
    const r100 = simulate(withFleet(a, 100), cat);
    expect(r100.output).toBeLessThan(r100.demand);
    expect(r100.shortfall).toBeGreaterThan(0);
  });
  it('at 100 machines right-sized costs about A$2.89 per cup', () => {
    const rs = rightSize(withFleet(a, 100), cat);
    const r2 = simulate(rs, cat);
    expect(r2.output).toBeCloseTo(4200, 6);
    expect(Math.abs(r2.perCup.total - 2.89)).toBeLessThan(0.02);
    for (const st of r2.steps) expect(st.utilDemand).toBeLessThanOrEqual(0.85 + 1e-9);
  });
  it('relieving the bottleneck raises the supported fleet', () => {
    const rel = relieveBottleneck(a, cat)!;
    expect(rel.after).toBeGreaterThan(rel.before);
    expect(insight(a, cat)).toMatch(/Adding one unit at Cup chest freezers/);
  });
});

describe('Scenario B (Automated line)', () => {
  const r = simulate(templates.automated.build(), cat);
  it('slowest step is the YM515 labeller', () => expect(r.bottleneckName).toMatch(/YM515/));
  it('supports about 193 machines', () => expect(Math.round(r.supportedFleet)).toBe(193));
});

describe('edge cases', () => {
  it('empty scenario returns Q = demand with no NaN', () => {
    const r = simulate(templates.blank.build(), cat);
    expect(r.output).toBe(r.demand);
    const walk = (o: unknown): void => {
      if (typeof o === 'number') expect(Number.isNaN(o)).toBe(false);
      else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(r);
  });
  it('side streams do not count in the out-of-freezer window', () => {
    const r = simulate(templates.midland.build(), cat);
    const mixer = r.steps.find((s) => s.sideStream)!;
    expect(mixer.dwellMin).toBe(30);
    expect(r.residence.oofWindowMin).toBe(20);
  });
  it('sweep runs from 5 to 300 machines', () => {
    const pts = sweep(templates.midland.build(), cat, [5, 300]);
    expect(pts).toHaveLength(2);
    expect(pts[1].built.short).toBe(true);
    expect(pts[1].sized.cogs).toBeLessThan(pts[0].sized.cogs);
  });
});
