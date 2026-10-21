import { simulate } from '../src/engine/engine';
import {
  exportLibrary, flowWarnings, importLibrary, isOverridden, resetOverride, saveNodeAsVariant, setOverride,
  swapVariant, validateCatalogue,
} from '../src/engine/library';
import { applyQuote, compareQuotes, landedCost, quoteStatus, revertQuote } from '../src/engine/quotes';
import type { Catalogue, Quote } from '../src/engine/types';
import raw from '../src/data/catalogue.json';
import { seedQuotes } from '../src/data/quotes';
import { templates } from '../src/data/templates';

const cat = raw as unknown as Catalogue;
const today = new Date('2026-10-21T12:00:00');
const q = (id: string) => seedQuotes.find((x) => x.id === id)!;

describe('quotes', () => {
  it('landed cost converts USD and leaves out excluded extras', () => {
    const lc = landedCost(q('q-ym515'), 1.55);
    expect(lc.quoted).toBe(8300);
    expect(lc.excludedExtras).toBe(1300);
    expect(lc.landedAUD).toBeCloseTo(8300 * 1.55, 6);
  });
  it('landed cost builds up freight, duty, GST and installation', () => {
    const quote: Quote = { ...q('q-ym140'), freight: 800, dutyPct: 5, gstPct: 10, gstClaimable: false, installPct: 10 };
    const lc = landedCost(quote, 1.5);
    const sub = (4200 + 800) * 1.5;
    expect(lc.subtotalAUD).toBe(sub);
    expect(lc.landedAUD).toBeCloseTo(sub + sub * 0.05 + sub * 1.05 * 0.1 + sub * 0.1, 6);
  });
  it('flags expired and expiring quotes', () => {
    expect(quoteStatus(q('q-ym140'), today)).toBe('expired');
    expect(quoteStatus(q('q-gsl212t'), today)).toBe('expiring');
    expect(quoteStatus({ ...q('q-gsl212t'), validUntil: '2027-06-01' }, today)).toBe('valid');
    expect(quoteStatus(q('q-ym515'), today)).toBe('unknown');
  });
  it('applying a quote updates the variant, tags the fields and can be reverted', () => {
    const v = cat.variants.find((x) => x.id === 'labeller.manual')!;
    const quote: Quote = { ...q('q-ym515'), id: 'q-new', kW: 1.2 };
    const applied = applyQuote(v, quote);
    expect(applied.spec.cost.typ).toBe(8300);
    expect(applied.spec.currency).toBe('USD');
    expect(applied.spec.rate.typ).toBe(1200);
    expect(applied.spec.kW.typ).toBe(1.2);
    expect(applied.spec.L).toBe(2);
    expect(applied.spec.sources.cost).toMatchObject({ kind: 'quote', quoteId: 'q-new' });
    expect(applied.selectedQuoteId).toBe('q-new');
    const back = revertQuote(applied);
    expect(back.spec.cost.typ).toBe(v.spec.cost.typ);
    expect(back.spec.sources.cost?.kind).toBe('placeholder');
  });
  it('compares quotes by landed cost and cost per cup/h', () => {
    const rows = compareQuotes(seedQuotes, 1.55, today);
    const cheapest = rows.reduce((a, b) => (b.landedAUD < a.landedAUD ? b : a));
    expect(cheapest.quote.id).toBe('q-change');
    expect(rows.find((r) => r.quote.id === 'q-ym515')!.costPerCupHour).toBeCloseTo((8300 * 1.55) / 1200, 6);
  });
});

describe('library', () => {
  it('seed catalogue passes schema validation', () => expect(validateCatalogue(cat)).toEqual([]));
  it('schema validation catches errors', () => {
    const bad = JSON.parse(JSON.stringify(cat));
    bad.variants[0].spec.kind = 'magic';
    bad.variants[1].typeId = 'nope';
    expect(validateCatalogue(bad).length).toBeGreaterThanOrEqual(2);
    expect(validateCatalogue(null)).not.toEqual([]);
  });
  it('override and reset leave the library untouched', () => {
    const s = templates.midland.build();
    const n = s.nodes[1];
    const o = setOverride(n, 'oee', 0.5);
    expect(isOverridden(o, 'oee')).toBe(true);
    expect(cat.variants.find((v) => v.id === n.variantId)!.spec.oee).toBe(0.85);
    expect(isOverridden(resetOverride(o, 'oee'))).toBe(false);
  });
  it('variant swap keeps connections and position', () => {
    const s = templates.midland.build();
    const swapped = swapVariant(s, 'n6', 'labeller.ym515');
    expect(swapped.edges).toEqual(s.edges);
    const n = swapped.nodes.find((x) => x.id === 'n6')!;
    expect(n.variantId).toBe('labeller.ym515');
    expect([n.x, n.y]).toEqual([s.nodes[5].x, s.nodes[5].y]);
    expect(simulate(swapped, cat).steps.find((x) => x.id === 'n6')!.name).toMatch(/YM515/);
  });
  it('saves a customised node to the palette as a new variant', () => {
    const s = templates.midland.build();
    const n = setOverride(s.nodes[1], 'rate', { typ: 200 });
    const { catalogue, variant } = saveNodeAsVariant(cat, n, 'Faster portioning');
    expect(catalogue.variants).toHaveLength(cat.variants.length + 1);
    expect(variant.spec.rate.typ).toBe(200);
    expect(variant.typeId).toBe('fruit-portioning');
    expect(validateCatalogue(catalogue)).toEqual([]);
  });
  it('raises drop warnings without blocking', () => {
    const s = templates.midland.build();
    expect(flowWarnings(s, cat)).toEqual([]);
    // Seamer before filler: rewire n5 (seamer) to come before n4 (filler).
    const bad = {
      ...s,
      edges: [
        { id: 'a', source: 'n2', target: 'n5' }, { id: 'b', source: 'n5', target: 'n4' }, { id: 'c', source: 'n4', target: 'n6' },
        { id: 'd', source: 'n3', target: 'n4' },
      ],
    };
    expect(flowWarnings(bad, cat).some((w) => /before the filler/.test(w.message))).toBe(true);
    const lonely = { ...s, nodes: [{ ...s.nodes[5], id: 'z' }], edges: [] };
    expect(flowWarnings(lonely, cat)[0].message).toMatch(/no cup step upstream/);
    const noPack = { ...s, edges: s.edges.filter((e) => e.target !== 'n8' && e.source !== 'n7').concat({ id: 'q', source: 'n6', target: 'n8' }) };
    expect(flowWarnings(noPack, cat).some((w) => /no packing/.test(w.message))).toBe(true);
  });
  it('library and quotes survive a JSON round trip', () => {
    const text = exportLibrary({ catalogue: cat, quotes: seedQuotes });
    const back = importLibrary(text);
    expect(back.catalogue).toEqual(cat);
    expect(back.quotes).toEqual(seedQuotes);
  });
});
