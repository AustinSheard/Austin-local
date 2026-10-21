import { useState } from 'react';
import type { Globals, Quote, RangePick } from '../../engine/types';
import { resetAll, useActive, useStore } from '../../store/store';
import { Btn, Card, NumInput, Select, TextInput } from '../common';
import { blankQuote } from './Quotes';

export function SettingsPage() {
  const s = useActive();
  const update = useStore((x) => x.update);
  const settings = useStore((x) => x.settings);
  const set = useStore((x) => x.set);
  const g = s.globals;
  const setG = <K extends keyof Globals>(k: K, v: Globals[K]) => update((sc) => ({ ...sc, globals: { ...sc.globals, [k]: v } }));
  const n = (label: string, k: keyof Globals, unit?: string) => (
    <label className="text-sm">{label}{unit && <span className="text-slate-400"> ({unit})</span>}
      <NumInput ariaLabel={label} value={g[k] as number} onChange={(v) => setG(k, v as never)} />
    </label>
  );
  const pick = (label: string, k: 'rate' | 'cost' | 'kW') => (
    <label className="text-sm">{label}
      <Select className="w-full" value={g.pick[k]} onChange={(v: RangePick) => setG('pick', { ...g.pick, [k]: v })}
        options={[{ value: 'min', label: 'Low (min)' }, { value: 'typ', label: 'Typical' }, { value: 'max', label: 'High (max)' }]} />
    </label>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3">
      <Card title={`Model inputs for “${s.name}”`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {n('Fleet', 'fleet', 'machines')}{n('Cups per machine per day', 'cupsPerMachine')}{n('Production days', 'prodDays', 'per week')}
          {n('Shift length', 'shiftHours', 'h')}{n('Loaded wage', 'wage', 'A$/h')}{n('Power price', 'kWhPrice', 'A$/kWh')}
          {n('Fixed overheads', 'overheads', 'A$/month')}{n('Fit-out', 'fitOut', 'A$')}{n('Fit-out life', 'fitOutLife', 'years')}
          {n('Installation', 'installPct', '%')}{n('Contingency', 'contingencyPct', '%')}{n('US$ to A$', 'usdToAud')}
          {n('Right-size target use', 'targetUtil', '%')}{n('Out-of-freezer limit', 'oofLimitMin', 'min')}
          <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={g.flexLabour} onChange={(e) => setG('flexLabour', e.target.checked)} />Flex labour (pay only hours used)</label>
          {pick('Rates use', 'rate')}{pick('Prices use', 'cost')}{pick('Power uses', 'kW')}
        </div>
        <p className="mt-2 text-xs text-slate-500">All inputs except the 30 cups/machine/day planning rule are placeholders.</p>
      </Card>
      <Card title="Quote import">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.apiEnabled} onChange={(e) => set({ settings: { ...settings, apiEnabled: e.target.checked } })} />Allow assisted extraction (sends the quote to the Anthropic API through your proxy)</label>
        <label className="mt-2 block text-sm">Proxy URL<TextInput value={settings.proxyUrl} onChange={(v) => set({ settings: { ...settings, proxyUrl: v } })} /></label>
        <p className="mt-1 text-xs text-slate-500">Run <code>npm run proxy</code> with ANTHROPIC_API_KEY set on the server. The key is never sent to the browser.</p>
      </Card>
      <Card title="Data">
        <p className="mb-2 text-sm">Everything is saved in this browser. Export from Scenarios, Quotes or Library to keep a copy.</p>
        <Btn kind="danger" onClick={() => { if (confirm('Delete all scenarios, library edits and quotes in this browser?')) resetAll(); }}>Reset everything</Btn>
      </Card>
    </div>
  );
}

type Conf = 'high' | 'medium' | 'low';
interface Extracted { value: string | number | null; snippet: string | null; confidence: Conf }
type Line = { description: string; price: number | null; optional: boolean; snippet: string | null; confidence: Conf };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extraction = { lines: Line[]; [field: string]: any };
export type { Extracted };

const FIELDS: [string, string][] = [
  ['supplier', 'Supplier'], ['contact', 'Contact'], ['ref', 'Quote ref'], ['date', 'Quote date'], ['validUntil', 'Valid until'],
  ['currency', 'Currency'], ['incoterm', 'Incoterm'], ['paymentTerms', 'Payment terms'], ['leadTime', 'Lead time'], ['warranty', 'Warranty'],
  ['freight', 'Freight'], ['rateMin', 'Rate min (cups/h)'], ['rateMax', 'Rate max (cups/h)'], ['kW', 'Power (kW)'], ['L', 'Length (m)'], ['W', 'Width (m)'],
];

const toB64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = rej;
  r.readAsDataURL(f);
});

export function QuoteImportPage() {
  const settings = useStore((x) => x.settings);
  const cat = useStore((x) => x.catalogue);
  const setQuotes = useStore((x) => x.setQuotes);
  const set = useStore((x) => x.set);
  const notify = useStore((x) => x.notify);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [ex, setEx] = useState<Extraction>();
  const [lineMap, setLineMap] = useState<Record<number, string>>({});

  const run = async () => {
    setBusy(true); setErr(undefined);
    try {
      const body: Record<string, unknown> = { text: text || undefined };
      if (file) {
        if (/\.xlsx?$/i.test(file.name)) throw new Error('Save the Excel sheet as CSV, or paste the cells, then try again.');
        body.file = { mediaType: file.type || 'text/plain', data: await toB64(file) };
      }
      const r = await fetch(settings.proxyUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error ?? `Proxy returned ${r.status}`);
      setEx(o);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };
  const manual = () => setEx(Object.fromEntries([...FIELDS.map(([k]) => [k, { value: null, snippet: null, confidence: 'high' }]), ['lines', []]]) as unknown as Extraction);
  const v = (k: string) => ex?.[k]?.value ?? null;
  const save = () => {
    if (!ex) return;
    const numV = (k: string) => (v(k) === null || v(k) === '' ? undefined : Number(v(k)));
    const lines = ex.lines.map((l) => ({ description: l.description, price: l.price ?? 0, included: !l.optional }));
    const rmin = numV('rateMin'), rmax = numV('rateMax');
    const groups = new Map<string, typeof lines>();
    ex.lines.forEach((l, i) => { const k = lineMap[i] ?? ''; groups.set(k, [...(groups.get(k) ?? []), lines[i]]); });
    if (!ex.lines.length) groups.set('', []);
    const made: Quote[] = [...groups.entries()].map(([variantId, ls]) => ({
      ...blankQuote(variantId || undefined),
      supplier: String(v('supplier') ?? 'Unknown supplier'), contact: (v('contact') as string) ?? undefined, ref: (v('ref') as string) ?? undefined,
      date: (v('date') as string) ?? undefined, validUntil: (v('validUntil') as string) ?? undefined,
      currency: v('currency') === 'AUD' ? 'AUD' : 'USD', incoterm: (v('incoterm') as string) ?? undefined,
      paymentTerms: (v('paymentTerms') as string) ?? undefined, leadTime: (v('leadTime') as string) ?? undefined, warranty: (v('warranty') as string) ?? undefined,
      freight: groups.size > 1 ? 0 : numV('freight') ?? 0, lines: ls,
      rate: rmin !== undefined || rmax !== undefined ? { min: rmin, max: rmax, typ: ((rmin ?? rmax!) + (rmax ?? rmin!)) / 2 } : undefined,
      kW: numV('kW'), L: numV('L'), W: numV('W'), fileName: file?.name,
    }));
    setQuotes((qs) => [...qs, ...made]);
    notify(`Saved ${made.length} quote record${made.length > 1 ? 's' : ''}. Apply it from the Quotes page.`);
    set({ more: 'quotes' });
  };
  const confColour: Record<string, string> = { high: 'text-emerald-600', medium: 'text-amber-600', low: 'text-red-600' };

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3">
      <Card title="Import a quote">
        {!settings.apiEnabled && <p className="mb-2 text-sm text-amber-700">Assisted extraction is turned off in Settings. You can still use the manual form.</p>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste the quote or email text here"
          className="w-full rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="file" accept=".pdf,image/*,.txt,.csv,.eml,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0])} className="text-sm" />
          <Btn kind="primary" disabled={!settings.apiEnabled || busy || (!text && !file)} onClick={run}>{busy ? 'Reading…' : 'Extract'}</Btn>
          <Btn onClick={manual}>Manual form</Btn>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </Card>
      {ex && (
        <Card title="Review before saving">
          <p className="mb-2 text-xs text-slate-500">Check every value against its source text. Empty means the quote did not say. Nothing is applied to the model until you apply the quote.</p>
          <div className="space-y-1">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="grid grid-cols-[8rem_10rem_1fr_3.5rem] items-center gap-2 text-sm">
                <span>{label}</span>
                <TextInput value={v(k) === null ? '' : String(v(k))} onChange={(nv) => setEx({ ...ex, [k]: { ...(ex[k] ?? { snippet: null, confidence: 'high' }), value: nv === '' ? null : nv, confidence: 'high' } })} />
                <span className="truncate text-xs italic text-slate-500" title={ex[k]?.snippet ?? ''}>{ex[k]?.snippet ? `“${ex[k].snippet}”` : '—'}</span>
                <span className={`text-xs ${confColour[ex[k]?.confidence ?? 'high']}`}>{v(k) === null ? '' : ex[k]?.confidence}</span>
              </div>
            ))}
          </div>
          <h4 className="mt-3 text-sm font-semibold">Line items</h4>
          {ex.lines.map((l, i) => (
            <div key={i} className="mt-1 grid grid-cols-[1fr_6rem_5rem_12rem] items-center gap-2 text-sm">
              <TextInput value={l.description} onChange={(d) => setEx({ ...ex, lines: ex.lines.map((x, j) => (j === i ? { ...x, description: d } : x)) })} />
              <NumInput value={l.price ?? 0} onChange={(p) => setEx({ ...ex, lines: ex.lines.map((x, j) => (j === i ? { ...x, price: p } : x)) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.optional} onChange={(e) => setEx({ ...ex, lines: ex.lines.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} />optional</label>
              <select value={lineMap[i] ?? ''} onChange={(e) => setLineMap({ ...lineMap, [i]: e.target.value })} className="rounded border border-slate-300 bg-white text-xs dark:border-slate-600 dark:bg-slate-900">
                <option value="">Map to equipment…</option>
                {cat.variants.filter((x) => !x.hidden).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          ))}
          <button className="mt-1 text-xs text-sky-600" onClick={() => setEx({ ...ex, lines: [...ex.lines, { description: 'Item', price: 0, optional: false, snippet: null, confidence: 'high' }] })}>+ Add line</button>
          <div className="mt-3"><Btn kind="primary" onClick={save}>Save quote record</Btn></div>
        </Card>
      )}
    </div>
  );
}
