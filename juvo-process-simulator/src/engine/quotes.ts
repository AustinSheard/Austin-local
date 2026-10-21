// Quote records: landed cost, expiry and applying a quote to a variant.

import type { Catalogue, Quote, Variant } from './types';

export interface LandedCost {
  quoted: number; // sum of included lines, quote currency
  excludedExtras: number; // quote currency, kept out of the total
  freight: number;
  subtotalAUD: number; // (quoted + freight) in AUD
  duty: number;
  gst: number; // shown, not added when claimable
  installation: number;
  landedAUD: number;
}

export function landedCost(q: Quote, usdToAud: number): LandedCost {
  const fx = q.currency === 'USD' ? usdToAud : 1;
  const quoted = q.lines.filter((l) => l.included).reduce((a, l) => a + l.price, 0);
  const excludedExtras = q.lines.filter((l) => !l.included).reduce((a, l) => a + l.price, 0);
  const subtotalAUD = (quoted + q.freight) * fx;
  const duty = (subtotalAUD * q.dutyPct) / 100;
  const gst = ((subtotalAUD + duty) * q.gstPct) / 100;
  const installation = (subtotalAUD * q.installPct) / 100;
  const landedAUD = subtotalAUD + duty + (q.gstClaimable ? 0 : gst) + installation;
  return { quoted, excludedExtras, freight: q.freight, subtotalAUD, duty, gst, installation, landedAUD };
}

export type QuoteStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

export function quoteStatus(q: Quote, today = new Date(), warnDays = 30): QuoteStatus {
  if (!q.validUntil) return 'unknown';
  const end = new Date(q.validUntil + 'T23:59:59');
  if (Number.isNaN(end.getTime())) return 'unknown';
  if (end < today) return 'expired';
  if ((end.getTime() - today.getTime()) / 86400000 <= warnDays) return 'expiring';
  return 'valid';
}

/**
 * Apply a quote to its variant: cost (quoted price, in quote currency), rate, kW and footprint
 * where the quote states them. Those fields are tagged "quote". The previous values are kept to revert.
 */
export function applyQuote(v: Variant, q: Quote): Variant {
  const quoted = q.lines.filter((l) => l.included).reduce((a, l) => a + l.price, 0);
  const prev: Variant['spec'] = v.spec;
  const spec = { ...prev, sources: { ...prev.sources } };
  const tag = { kind: 'quote' as const, quoteId: q.id, date: q.date, note: `${q.supplier}${q.ref ? ' ' + q.ref : ''}` };
  const snapshot: Partial<Variant['spec']> = { sources: prev.sources };
  const set = <K extends keyof Variant['spec']>(k: K, val: Variant['spec'][K]) => {
    (snapshot as Record<string, unknown>)[k] = prev[k];
    spec[k] = val;
    spec.sources[k] = tag;
  };
  set('cost', { typ: quoted });
  set('currency', q.currency);
  if (q.rate) set('rate', q.rate);
  if (q.kW !== undefined) set('kW', { typ: q.kW });
  if (q.L !== undefined) set('L', q.L);
  if (q.W !== undefined) set('W', q.W);
  const quoteIds = Array.from(new Set([...(v.quoteIds ?? []), q.id]));
  return { ...v, spec, quoteIds, selectedQuoteId: q.id, history: [...(v.history ?? []), snapshot] };
}

/** Undo the last quote application. */
export function revertQuote(v: Variant): Variant {
  const h = v.history ?? [];
  if (!h.length) return v;
  const last = h[h.length - 1];
  return { ...v, spec: { ...v.spec, ...last }, history: h.slice(0, -1) };
}

export interface QuoteRow {
  quote: Quote;
  landedAUD: number;
  rate?: number;
  footprintM2?: number;
  kW?: number;
  costPerCupHour?: number;
  status: QuoteStatus;
}

export function compareQuotes(quotes: Quote[], usdToAud: number, today = new Date()): QuoteRow[] {
  return quotes.map((q) => {
    const landedAUD = landedCost(q, usdToAud).landedAUD;
    const rate = q.rate?.typ;
    return {
      quote: q, landedAUD, rate, kW: q.kW,
      footprintM2: q.L !== undefined && q.W !== undefined ? q.L * q.W : undefined,
      costPerCupHour: rate ? landedAUD / rate : undefined,
      status: quoteStatus(q, today),
    };
  });
}

export function quotesForVariant(quotes: Quote[], cat: Catalogue, variantId: string): Quote[] {
  const v = cat.variants.find((x) => x.id === variantId);
  return quotes.filter((q) => q.variantId === variantId || v?.quoteIds?.includes(q.id));
}
