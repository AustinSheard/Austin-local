import { useState } from 'react';
import { exportLibrary, importLibrary, libraryCsv, uid } from '../../engine/library';
import type { EquipmentSpec, SpecKey, Variant } from '../../engine/types';
import { seedCatalogue, useActive, useStore } from '../../store/store';
import { Btn, Card, TextInput } from '../common';
import { EquipmentFields } from '../EquipmentFields';
import { download, pickFile } from '../format';
import { variantSummary } from '../Palette';

const STARTERS: Record<string, Partial<EquipmentSpec>> = {
  rate: { kind: 'rate', state: 'ambient', sideStream: false },
  storage: { kind: 'storage', state: 'frozen', alwaysOn: true, cupsHeld: 1000, dwellMin: 4320, dwellUnit: 'd', oee: 1 },
  side: { kind: 'rate', state: 'ambient', sideStream: true, dwellMin: 30 },
};

export function LibraryPage() {
  const cat = useStore((s) => s.catalogue);
  const quotes = useStore((s) => s.quotes);
  const setCatalogue = useStore((s) => s.setCatalogue);
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const mode = useStore((s) => s.mode);
  const usd = useActive().globals.usdToAud;
  const [editId, setEditId] = useState<string>();
  const [q, setQ] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const editing = cat.variants.find((v) => v.id === editId);
  const patch = (id: string, fn: (v: Variant) => Variant) => setCatalogue((c) => ({ ...c, variants: c.variants.map((v) => (v.id === id ? fn(v) : v)) }));
  const create = (starter: keyof typeof STARTERS) => {
    const blank = cat.variants.find((v) => v.id === 'blank.blank')!;
    const v: Variant = { id: uid('blank.user'), typeId: 'blank', name: `New ${starter === 'side' ? 'side-stream' : starter} equipment`, userMade: true, spec: { ...blank.spec, ...STARTERS[starter], sources: {} } };
    setCatalogue((c) => ({ ...c, variants: [...c.variants, v] }));
    setEditId(v.id);
  };
  const clone = (v: Variant) => {
    const nv: Variant = { ...JSON.parse(JSON.stringify(v)), id: uid(`${v.typeId}.user`), name: `${v.name} (copy)`, userMade: true, history: [] };
    setCatalogue((c) => ({ ...c, variants: [...c.variants, nv] }));
    setEditId(nv.id);
  };
  const remove = (v: Variant) => {
    if (cat.types.some((t) => t.defaultVariantId === v.id)) return notify('This is the default for its type. Hide it instead.');
    if (!confirm(`Delete “${v.name}” from the library? Steps using it will show as missing.`)) return;
    setCatalogue((c) => ({ ...c, variants: c.variants.filter((x) => x.id !== v.id) }));
    setEditId(undefined);
  };
  const match = (v: Variant) => (showHidden || !v.hidden) && (!q || `${v.name} ${v.supplier ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[1fr_28rem]">
      <div className="space-y-3">
        <Card title="Equipment library" right={
          <div className="flex flex-wrap gap-1">
            <Btn onClick={() => download('juvo-library.json', exportLibrary({ catalogue: cat, quotes }))}>Export JSON</Btn>
            <Btn onClick={async () => {
              const f = await pickFile('.json');
              if (!f) return;
              try {
                const b = importLibrary(await f.text());
                set({ catalogue: b.catalogue, ...(b.quotes.length ? { quotes: b.quotes } : {}) });
                notify(`Imported ${b.catalogue.variants.length} variants${b.quotes.length ? ` and ${b.quotes.length} quotes` : ''}.`);
              } catch (e) { notify(`Not imported: ${(e as Error).message}`); }
            }}>Import JSON</Btn>
            <Btn onClick={() => download('juvo-library.csv', libraryCsv(cat), 'text/csv')}>Export CSV</Btn>
            <Btn kind="danger" onClick={() => { if (confirm('Replace the library with the built-in seed library? Your own variants will be lost.')) set({ catalogue: seedCatalogue }); }}>Reset library</Btn>
          </div>
        }>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TextInput value={q} onChange={setQ} placeholder="Search" className="max-w-xs" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />Show hidden</label>
            <span className="ml-auto text-xs text-slate-500">New:</span>
            <Btn onClick={() => create('rate')}>Rate-limited</Btn>
            <Btn onClick={() => create('storage')}>Storage</Btn>
            <Btn onClick={() => create('side')}>Side stream</Btn>
          </div>
          {cat.categories.map((c) => {
            const vs = cat.variants.filter((v) => cat.types.find((t) => t.id === v.typeId)?.category === c && match(v));
            if (!vs.length) return null;
            return (
              <div key={c} className="mb-3">
                <h4 className="mb-1 text-xs font-semibold text-slate-500">{c}</h4>
                {vs.map((v) => {
                  const sum = variantSummary(v, cat, usd);
                  return (
                    <div key={v.id} className={`mb-1 flex flex-wrap items-center gap-2 rounded border p-1.5 text-sm ${editId === v.id ? 'border-sky-500' : 'border-slate-200 dark:border-slate-700'} ${v.hidden ? 'opacity-50' : ''}`}>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditId(v.id)}>
                        <div className="truncate font-medium">{v.name}{v.userMade ? ' ★' : ''}</div>
                        <div className="text-xs text-slate-500">{sum.rate} · {sum.cost} · {sum.foot} · {sum.kW} · {sum.source}</div>
                      </button>
                      <Btn kind="ghost" onClick={() => clone(v)}>Clone</Btn>
                      <Btn kind="ghost" onClick={() => patch(v.id, (x) => ({ ...x, hidden: !x.hidden }))}>{v.hidden ? 'Show' : 'Hide'}</Btn>
                      <Btn kind="ghost" onClick={() => remove(v)}>Delete</Btn>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Card>
      </div>
      <div>
        {editing ? (
          <Card title="Edit library item" className="sticky top-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 text-xs">Name<TextInput value={editing.name} onChange={(v) => patch(editing.id, (x) => ({ ...x, name: v }))} /></label>
              <label className="text-xs">Supplier<TextInput value={editing.supplier ?? ''} onChange={(v) => patch(editing.id, (x) => ({ ...x, supplier: v }))} /></label>
              <label className="text-xs">Model<TextInput value={editing.model ?? ''} onChange={(v) => patch(editing.id, (x) => ({ ...x, model: v }))} /></label>
              <label className="col-span-2 text-xs">Equipment type
                <select value={editing.typeId} onChange={(e) => patch(editing.id, (x) => ({ ...x, typeId: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
                  {cat.types.map((t) => <option key={t.id} value={t.id}>{t.category}: {t.name}</option>)}
                </select>
              </label>
            </div>
            <EquipmentFields spec={editing.spec} advanced={mode === 'advanced'}
              onChange={<K extends SpecKey>(k: K, val: EquipmentSpec[K]) => patch(editing.id, (x) => ({ ...x, spec: { ...x.spec, [k]: val } }))} />
            <p className="mt-3 text-xs text-slate-500">Changes here update every step that uses this item, unless the step overrides the field.</p>
          </Card>
        ) : <Card><p className="text-sm text-slate-500">Pick an item to edit, or create a new one.</p></Card>}
      </div>
    </div>
  );
}
