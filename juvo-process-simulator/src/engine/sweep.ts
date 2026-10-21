// Scale-up sweep: cost per cup, CAPEX, FTE and floor area against fleet size.

import { rightSize, simulate, withFleet, withPick } from './engine';
import { footprint } from './footprint';
import type { Catalogue, RangePick, Scenario } from './types';

export interface SweepPoint {
  fleet: number;
  built: { cogs: number; capex: number; fte: number; area: number; short: boolean };
  sized: { cogs: number; capex: number; fte: number; area: number };
}

export const DEFAULT_FLEETS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 300];

export function sweep(s: Scenario, cat: Catalogue, fleets = DEFAULT_FLEETS, pick: RangePick = 'typ'): SweepPoint[] {
  const base = withPick(s, pick);
  return fleets.map((fleet) => {
    const b = withFleet(base, fleet);
    const rb = simulate(b, cat);
    const sz = rightSize(b, cat);
    const rs = simulate(sz, cat);
    return {
      fleet,
      built: {
        cogs: rb.perCup.total, capex: rb.capex.total, fte: rb.labour.fte,
        area: footprint(b, cat).requiredM2, short: rb.shortfall > 0.5,
      },
      sized: { cogs: rs.perCup.total, capex: rs.capex.total, fte: rs.labour.fte, area: footprint(sz, cat).requiredM2 },
    };
  });
}
