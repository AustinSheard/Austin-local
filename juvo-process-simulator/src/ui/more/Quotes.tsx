import { useState } from 'react';
import { exportLibrary, uid } from '../../engine/library';
import { applyQuote, compareQuotes, landedCost, revertQuote } from '../../engine/quotes';
import type { Quote } from '../../engine/types';
import { useActive, useStore } from '../../store/store';
import { Btn, Card, NumInput, Select, Table, TextInput } from '../common';
import { aud, download, num, pickFile } from '../format';

export const blankQuote = (variantId?: string): Quote => ({
  id: uid('q'), variantId, supplier: 'New supplier', currency: 'USD', incoterm: 'EXW', lines: [{ description: 'Machine', price: 0, included: true }],
  freight: 0, dutyPct: 0, gstPct: 10, gstClaimable: true, installPct: 0, date: new Date().toISOString().slice(0, 10),
});

const STATUS = {
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  valid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function QuoteEditor({ q, onChange }: { q: Quote; onChange: (q: Quote) => void }) {
  const cat = useStore((s) => s.catalogue);
  const usd = useActive().globals.usdToAud;
  const lc = landedCost(q, usd);
  const f = <K extends keyof Quote>(k: K, v: Quote[K]) => onChange({ ...q, [k]: v });
  const text = (label: string, k: 'supplier' | 'contact' | 'ref' | 'incoterm' | 'paymentTerms' | 'leadTime' | 'warranty') => (
    <label className="text-xs">{label}<TextInput value={q[k] ?? ''} onChange={(v) => f(k, v)} /></label>
  );
  const date = (label: string, k: 'date' | 'validUntil') => (
    <label className="text-xs">{label}
      <input type="date" value={q[k] ?? ''} onChange={(e) => f(k, e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900" />
    </label>
  );
  const sym = q.currency === 'USD' ? 'US$' : 'A$';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {text('Supplier', 'supplier')}{text('Contact', 'contact')}{text('Quote ref', 'ref')}
        <label className="text-xs">Equipment variant
          <select value={q.variantId ?? ''} onChange={(e) => f('variantId', e.target.value || undefined)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
            <option value="">Not linked</option>
            {cat.variants.filter((v) => !v.hidden).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {date('Quote date', 'date')}{date('Valid until', 'validUntil')}
        <label className="flex items-end gap-1 text-xs"><input type="checkbox" checked={!!q.expired} onChange={(e) => f('expired', e.target.checked)} />Marked expired</label>
        <label className="text-xs">Currency<Select value={q.currency} onChange={(v) => f('currency', v)} className="w-full" options={[{ value: 'USD', label: 'US$' }, { value: 'AUD', label: 'A$' }]} /></label>
        {text('Incoterm', 'incoterm')}{text('Payment terms', 'paymentTerms')}{text('Lead time', 'leadTime')}{text('Warranty', 'warranty')}
        <label className="text-xs">Attached file
          <div className="flex items-center gap-1">
            <span className="truncate text-sm">{q.fileName ?? 'None'}</span>
            <button className="text-sky-600" onClick={async () => { const file = await pickFile('*/*'); if (file) f('fileName', file.name); }}>Attach</button>
          </div>
        </label>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs"><span>Line items (untick to keep optional extras out of the total)</span>
          <button className="text-sky-600" onClick={() => f('lines', [...q.lines, { description: 'Extra', price: 0, included: false }])}>+ Add line</button></div>
        {q.lines.map((l, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1.5rem_1fr_7rem_1.5rem] items-center gap-1">
            <input type="checkbox" aria-label="Included in total" checked={l.included} onChange={(e) => f('lines', q.lines.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)))} />
            <TextInput value={l.description} onChange={(v) => f('lines', q.lines.map((x, j) => (j === i ? { ...x, description: v } : x)))} />
            <NumInput ariaLabel="Line price" value={l.price} onChange={(v) => f('lines', q.lines.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
            <button onClick={() => f('lines', q.lines.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <label className="text-xs">Freight ({sym})<NumInput value={q.freight} onChange={(v) => f('freight', v)} /></label>
        <label className="text-xs">Duty (%)<NumInput value={q.dutyPct} onChange={(v) => f('dutyPct', v)} /></label>
        <label className="text-xs">GST (%)<NumInput value={q.gstPct} onChange={(v) => f('gstPct', v)} /></label>
        <label className="flex items-end gap-1 text-xs"><input type="checkbox" checked={q.gstClaimable} onChange={(e) => f('gstClaimable', e.target.checked)} />GST claimable</label>
        <label className="text-xs">Installation (%)<NumInput value={q.installPct} onChange={(v) => f('installPct', v)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <label className="text-xs">Rate min (cups/h)<NumInput value={q.rate?.min ?? 0} onChange={(v) => f('rate', { typ: q.rate?.typ ?? v, ...q.rate, min: v })} /></label>
        <label className="text-xs">Rate typical<NumInput value={q.rate?.typ ?? 0} onChange={(v) => f('rate', { ...q.rate, typ: v })} /></label>
        <label className="text-xs">Rate max<NumInput value={q.rate?.max ?? 0} onChange={(v) => f('rate', { typ: q.rate?.typ ?? v, ...q.rate, max: v })} /></label>
        <label className="text-xs">kW (if stated)<NumInput value={q.kW ?? 0} onChange={(v) => f('kW', v || undefined)} /></label>
        <label className="text-xs">L (m, if stated)<NumInput value={q.L ?? 0} onChange={(v) => f('L', v || undefined)} /></label>
        <label className="text-xs">W (m, if stated)<NumInput value={q.W ?? 0} onChange={(v) => f('W', v || undefined)} /></label>
      </div>
      <Table head={['Landed cost build-up', 'Amount']} rows={[
        [`Quoted total (${sym}, included lines)`, `${sym}${num(lc.quoted)}`],
        [`Optional extras kept out (${sym})`, `${sym}${num(lc.excludedExtras)}`],
        [`Freight (${sym})`, `${sym}${num(lc.freight)}`],
        [`Subtotal in A$ (× ${q.currency === 'USD' ? usd : 1})`, aud(lc.subtotalAUD)],
        [`Duty ${q.dutyPct}%`, aud(lc.duty)],
        [`GST ${q.gstPct}% ${q.gstClaimable ? '(claimable, not added)' : '(added)'}`, aud(lc.gst)],
        [`Installation ${q.installPct}%`, aud(lc.installation)],
        [<b>Landed cost</b>, <b>{aud(lc.landedAUD)}</b>],
      ]} />
      <label className="block text-xs">Notes<textarea value={q.notes ?? ''} onChange={(e) => f('notes', e.target.value)} rows={2} className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900" /></label>
    </div>
  );
}

export function QuotesPage() {
  const quotes = useStore((s) => s.quotes);
  const setQuotes = useStore((s) => s.setQuotes);
  const cat = useStore((s) => s.catalogue);
  const setCatalogue = useStore((s) => s.setCatalogue);
  const notify = useStore((s) => s.notify);
  const usd = useActive().globals.usdToAud;
  const [openId, setOpenId] = useState<string | undefined>();
  const rows = compareQuotes(quotes, usd);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.quote.variantId ? cat.variants.find((v) => v.id === r.quote.variantId)?.typeId ?? 'unlinked' : 'unlinked';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const apply = (q: Quote) => {
    if (!q.variantId) return notify('Link the quote to an equipment variant first.');
    setCatalogue((c) => ({ ...c, variants: c.variants.map((v) => (v.id === q.variantId ? applyQuote(v, q) : v)) }));
    notify(`Applied ${q.supplier} quote. Cost, rate, kW and footprint (where stated) are now tagged “Quote”.`);
  };
  const revert = (variantId: string) => {
    setCatalogue((c) => ({ ...c, variants: c.variants.map((v) => (v.id === variantId ? revertQuote(v) : v)) }));
    notify('Reverted to the values before the last quote.');
  };
  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <Card title="Quotes" right={
        <div className="flex gap-1">
          <Btn kind="primary" onClick={() => { const q = blankQuote(); setQuotes((qs) => [...qs, q]); setOpenId(q.id); }}>New quote</Btn>
          <Btn onClick={() => download('juvo-quotes.json', JSON.stringify({ kind: 'juvo-quotes', quotes }, null, 2))}>Export</Btn>
          <Btn onClick={async () => {
            const f = await pickFile('.json');
            if (!f) return;
            try {
              const o = JSON.parse(await f.text());
              const list: Quote[] = o.quotes ?? o;
              setQuotes((qs) => [...qs.filter((x) => !list.some((y) => y.id === x.id)), ...list]);
              notify(`Imported ${list.length} quotes.`);
            } catch (e) { notify(`Could not import: ${(e as Error).message}`); }
          }}>Import</Btn>
          <Btn onClick={() => download('juvo-library.json', exportLibrary({ catalogue: cat, quotes }))}>Export with library</Btn>
        </div>
      }>
        <p className="text-xs text-slate-500">Landed cost uses US$1 = A${usd}. Green marks the cheapest landed cost and cheapest cost per cup/h in each group.</p>
      </Card>
      {[...groups.entries()].map(([typeId, rs]) => {
        const minLanded = Math.min(...rs.map((r) => r.landedAUD));
        const cph = rs.map((r) => r.costPerCupHour).filter((x): x is number => x !== undefined);
        const minCph = cph.length ? Math.min(...cph) : NaN;
        const best = 'rounded bg-emerald-100 px-1 font-semibold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100';
        return (
          <Card key={typeId} title={cat.types.find((t) => t.id === typeId)?.name ?? 'Not linked to equipment'}>
            <Table head={['Supplier', 'Landed', 'Rate (cups/h)', 'A$ per cup/h', 'Footprint', 'kW', 'Warranty', 'Valid until', '']} rows={rs.map((r) => {
              const v = cat.variants.find((x) => x.id === r.quote.variantId);
              const selected = v?.selectedQuoteId === r.quote.id;
              return [
                <button className="text-left text-sky-700 underline dark:text-sky-300" onClick={() => setOpenId(openId === r.quote.id ? undefined : r.quote.id)}>{r.quote.supplier} {r.quote.ref ?? ''}</button>,
                <span className={rs.length > 1 && r.landedAUD === minLanded ? best : ''}>{aud(r.landedAUD)}</span>,
                r.rate ? `${num(r.quote.rate?.min ?? r.rate)}–${num(r.quote.rate?.max ?? r.rate)}` : '–',
                <span className={rs.length > 1 && r.costPerCupHour === minCph ? best : ''}>{r.costPerCupHour ? aud(r.costPerCupHour, 2) : '–'}</span>,
                r.footprintM2 ? `${r.quote.L} × ${r.quote.W} m` : 'not stated',
                r.kW ?? 'not stated',
                r.quote.warranty ?? '–',
                <span className={`rounded px-1 text-xs ${STATUS[r.status]}`}>{r.quote.validUntil ?? (r.status === 'expired' ? 'lapsed' : 'not stated')}{r.status === 'expired' ? ' · expired' : r.status === 'expiring' ? ' · expiring' : ''}</span>,
                <div className="flex gap-1">
                  <Btn onClick={() => apply(r.quote)}>{selected ? 'Re-apply' : 'Apply'}</Btn>
                  {selected && (v?.history?.length ?? 0) > 0 && <Btn onClick={() => revert(v!.id)}>Revert</Btn>}
                </div>,
              ];
            })} />
            {rs.filter((r) => r.quote.id === openId).map((r) => (
              <div key={r.quote.id} className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                <QuoteEditor q={r.quote} onChange={(nq) => setQuotes((qs) => qs.map((x) => (x.id === nq.id ? nq : x)))} />
                <Btn kind="danger" className="mt-2" onClick={() => { setQuotes((qs) => qs.filter((x) => x.id !== r.quote.id)); setOpenId(undefined); }}>Delete quote</Btn>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

