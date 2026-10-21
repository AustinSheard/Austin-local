import { useMemo } from 'react';
import { simulate } from '../engine/engine';
import { withLinkedFitOut } from '../engine/footprint';
import type { Catalogue, Scenario } from '../engine/types';
import { useActive, useStore } from '../store/store';

export const effective = (s: Scenario, cat: Catalogue) => withLinkedFitOut(s, cat);

export function useResults() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  return useMemo(() => simulate(effective(s, cat), cat), [s, cat]);
}
