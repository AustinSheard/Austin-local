import type { Quote } from '../engine/types';

// Real supplier quotes for labellers (USD, EXW China). Dates as supplied.
export const seedQuotes: Quote[] = [
  {
    id: 'q-ym140', variantId: 'labeller.ym140', supplier: 'Yimu', ref: 'YM140', date: '2026-08-28', validUntil: '2026-09-27',
    currency: 'USD', incoterm: 'EXW', freight: 0, dutyPct: 0, gstPct: 10, gstClaimable: true, installPct: 0,
    lines: [
      { description: 'YM140 semi-auto labeller', price: 3700, included: true },
      { description: 'Inkjet printer', price: 500, included: true },
    ],
    rate: { min: 900, typ: 1050, max: 1200 }, L: 1.0, W: 0.7,
    notes: '15-20 cups/min. Quote dated 28 Aug; validity has passed.',
  },
  {
    id: 'q-gsl212t', variantId: 'labeller.gsl212t', supplier: 'Gosunm', ref: 'GSL-212T', validUntil: '2026-11-18',
    currency: 'USD', incoterm: 'EXW', freight: 0, dutyPct: 0, gstPct: 10, gstClaimable: true, installPct: 0,
    lines: [
      { description: 'GSL-212T auto labeller', price: 3400, included: true },
      { description: 'Coder', price: 750, included: true },
    ],
    rate: { min: 720, typ: 960, max: 1200 }, L: 1.1, W: 1.1,
    notes: '12-20 cups/min. Handles tapered cups.',
  },
  {
    id: 'q-ym515', variantId: 'labeller.ym515', supplier: 'Yimu', ref: 'YM515', currency: 'USD', incoterm: 'EXW',
    freight: 0, dutyPct: 0, gstPct: 10, gstClaimable: true, installPct: 0, warranty: '24 months',
    lines: [
      { description: 'YM515 tapered-cup labeller', price: 6000, included: true },
      { description: 'Label inkjet', price: 500, included: true },
      { description: 'Cup-bottom inkjet', price: 1800, included: true },
      { description: 'Cup unstacking system (optional)', price: 1300, included: false },
    ],
    rate: { min: 600, typ: 1200, max: 1800 }, L: 2.0, W: 1.0,
    notes: '10-30 cups/min.',
  },
  {
    id: 'q-change', variantId: 'labeller.change', supplier: 'Change Machinery', currency: 'USD', incoterm: 'EXW',
    freight: 0, dutyPct: 0, gstPct: 10, gstClaimable: true, installPct: 0,
    lines: [
      { description: 'Semi-auto labeller', price: 1800, included: true },
      { description: 'Printer', price: 475, included: true },
    ],
    rate: { min: 0, typ: 750, max: 1500 },
    notes: '0-25 cups/min. Footprint not stated.',
  },
];
