import { insight } from '../engine/engine';
import { resultsCsv } from '../engine/library';
import { useActive, useStore } from '../store/store';
import { Btn, Card, Stat, Table } from './common';
import { aud, download, fleet, mins, num, pct } from './format';
import { effective, useResults } from './useResults';
import { useMemo } from 'react';

export function ResultStrip() {
  const r = useResults();
  const s = useActive();
  const update = useStore((x) => x.update);
  const dismiss = useStore((x) => x.dismissHint);
  const hint = useStore((x) => !x.hints.fleet);
  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-w-[14rem] flex-1 items-center gap-2 text-sm md:max-w-sm">
          <span className="whitespace-nowrap font-medium">Fleet</span>
          <input aria-label="Fleet size" type="range" min={1} max={300} value={s.globals.fleet} className="flex-1 accent-sky-600"
            onChange={(e) => { update((sc) => ({ ...sc, globals: { ...sc.globals, fleet: +e.target.value } }), false); if (hint) dismiss('fleet'); }} />
          <span className="w-24 whitespace-nowrap text-right tabular-nums">{s.globals.fleet} machines</span>
        </label>
        {hint && (
          <span className="flex items-center gap-1 rounded-full bg-sky-600 px-3 py-0.5 text-xs text-white">
            💡 Move the fleet slider <button aria-label="Dismiss hint" onClick={() => dismiss('fleet')}>×</button>
          </span>
        )}
      </div>
      <div data-testid="result-strip" className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
        <Stat label="Cups/day" value={`${num(r.output)}${r.shortfall > 0 ? ` of ${num(r.demand)}` : ''}`} warn={r.shortfall > 0} />
        <Stat label="Slowest step" value={r.bottleneckName ?? 'None'} />
        <Stat label="Cost per cup" value={aud(r.perCup.total, 2)} />
        <Stat label="CAPEX" value={aud(r.capex.total)} />
        <Stat label="Power" value={`${num(r.power.connectedKW, 1)} kW`} />
        <Stat label="Out-of-freezer time" value={`${mins(r.residence.oofWindowMin)} of ${s.globals.oofLimitMin}`} warn={!r.residence.oofOk} />
      </div>
    </div>
  );
}

export function InsightLine() {
  const s = useActive();
  const cat = useStore((x) => x.catalogue);
  const text = useMemo(() => insight(effective(s, cat), cat), [s, cat]);
  return <p className="text-sm text-slate-700 dark:text-slate-200">{text}</p>;
}

export function ResultsScreen() {
  const r = useResults();
  const s = useActive();
  const cost = r.perCup;
  const bar = (v: number) => (
    <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded bg-sky-500" style={{ width: `${Math.min(100, cost.total > 0 ? (v / cost.total) * 100 : 0)}%` }} /></div>
  );
  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <Card><InsightLine /></Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Throughput" right={<Btn onClick={() => download(`${s.name}-results.csv`, resultsCsv(r), 'text/csv')}>Export CSV</Btn>}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Good cups/day" value={num(r.output)} />
            <Stat label="Demand" value={`${num(r.demand)} cups/day`} />
            <Stat label="Supported fleet" value={fleet(r.supportedFleet)} warn={r.shortfall > 0} />
            <Stat label="Yield" value={pct(r.yield, 1)} />
          </div>
          {r.shortfall > 0 && <p className="mb-2 text-sm text-red-600">Short of demand by {num(r.shortfall)} cups/day. Slowest step: {r.bottleneckName}.</p>}
          <div className="mb-3 rounded bg-slate-50 p-2 text-sm dark:bg-slate-800">
            <div className="font-medium">Cup balance (per production day)</div>
            <div>{num(r.balance.cupsIn)} cups in = {num(r.balance.cupsOut)} good cups out + {num(r.balance.rejected)} rejected</div>
            <div className="mt-1 text-xs text-slate-500">
              Cups move along the line in sync at {num(r.lineRatePerHour)} good cups/h. Steps faster than the slowest step run below
              their maximum to keep the balance; they are marked “paced”. Freezers and cool rooms hold stock and don’t limit the line.
            </div>
          </div>
          <Table head={['Step', 'Units', 'Cups in/day', 'Cups out/day', 'Runs at (cups/h per unit)', 'Use']} rows={r.steps.map((st) => [
            <span className={st.isBottleneck ? 'font-semibold text-red-600' : ''}>{st.name}{st.sideStream ? ' (feed)' : ''}{st.isBottleneck ? ' · slowest' : ''}</span>,
            st.units,
            st.sideStream ? '–' : num(st.cupsInPerDay),
            st.sideStream ? '–' : num(st.cupsOutPerDay),
            st.kind === 'storage' ? 'storage' : st.sideStream ? '–' : <span>{num(st.runRatePerUnit)} of {num(st.maxRatePerUnit)}{!st.isBottleneck && st.utilActual < 0.98 ? ' · paced' : ''}</span>,
            <span className={st.limitsLine && st.utilDemand > 1 ? 'text-red-600' : st.limitsLine && st.utilDemand > 0.85 ? 'text-amber-600' : ''}>{pct(st.utilDemand)}{st.kind === 'storage' ? ' full' : ''}</span>,
          ])} />
        </Card>
        <Card title={`Cost per cup: ${aud(cost.total, 2)}`}>
          <div className="space-y-1.5 text-sm">
            {([['Materials', cost.materials], ['Labour', cost.labour], ['Power', cost.power], ['Maintenance', cost.maintenance], ['Depreciation', cost.depreciation], ['Overheads and other', cost.overheads]] as const).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-2"><span>{k}</span>{bar(v)}<span className="text-right tabular-nums">{aud(v, 3)}</span></div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Cups per month" value={num(r.cupsPerMonth)} />
            <Stat label="Cash OPEX" value={`${aud(r.monthly.cashOpex)}/month`} />
            <Stat label="Labour" value={`${num(r.labour.fte, 1)} FTE`} />
          </div>
        </Card>
        <Card title={`CAPEX: ${aud(r.capex.total)}`}>
          <Table head={['Item', 'A$']} rows={[
            ['Equipment', aud(r.capex.equipment)],
            [`Installation (${s.globals.installPct}%)`, aud(r.capex.installation)],
            [`Fit-out${s.layout.linkFitOut ? ' (from floor plan)' : ''}`, aud(r.capex.fitOut)],
            [`Contingency (${s.globals.contingencyPct}%)`, aud(r.capex.contingency)],
            [<b>Total</b>, <b>{aud(r.capex.total)}</b>],
          ]} />
          <Table className="mt-3" head={['Step', 'Equipment A$', 'Depreciation A$/month']} rows={r.steps.map((st) => [st.name, aud(st.equipmentAUD), aud(st.depreciationMonth)])} />
        </Card>
        <Card title="Power">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Connected" value={`${num(r.power.connectedKW, 1)} kW`} />
            <Stat label="Average" value={`${num(r.power.averageKW, 1)} kW`} />
            <Stat label="Energy" value={`${num(r.power.kWhPerDay, 1)} kWh/day`} />
            <Stat label="Per cup" value={`${num(r.power.kWhPerCup, 3)} kWh`} />
            <Stat label="Power cost" value={`${aud(r.power.costMonth)}/month`} />
            <Stat label="Refrigeration share" value={pct(r.power.refrigerationShare)} />
          </div>
          <Table head={['Step', 'kW', 'kWh/month']} rows={r.steps.map((st) => [st.name, num(st.connectedKW, 2), num(st.kWhMonth)])} />
        </Card>
        <Card title="Time and freshness" className="md:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Longest out-of-freezer window" value={`${mins(r.residence.oofWindowMin)} (limit ${r.residence.oofLimitMin} min)`} warn={!r.residence.oofOk} />
            <Stat label="Fruit age at use" value={mins(r.residence.fruitAgeMin)} />
            <Stat label="Cup age at dispatch" value={mins(r.residence.cupAgeMin)} />
            <Stat label="Start to finish" value={mins(r.residence.startToFinishMin)} />
            <Stat label="Frozen stock" value={`${num(r.residence.frozenStock)} cups`} />
          </div>
          <Table head={['Step', 'Time in step', 'State', 'Out-of-freezer clock']} rows={r.steps.filter((x) => !x.sideStream).map((st) => [
            st.name, mins(st.dwellMin), st.state === 'frozen' ? 'Frozen' : 'Out of freezer', st.state === 'ambient' ? mins(st.oofClockMin) : '–',
          ])} />
        </Card>
      </div>
    </div>
  );
}
