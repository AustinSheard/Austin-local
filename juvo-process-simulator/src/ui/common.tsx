import { useEffect, useState, type ReactNode } from 'react';
import type { SourceKind } from '../engine/types';

export function Btn({ children, onClick, kind = 'default', className = '', title, disabled }: {
  children: ReactNode; onClick?: () => void; kind?: 'default' | 'primary' | 'ghost' | 'danger'; className?: string; title?: string; disabled?: boolean;
}) {
  const k = {
    default: 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700',
    primary: 'bg-sky-600 text-white hover:bg-sky-700 border border-sky-600',
    ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800',
    danger: 'bg-white dark:bg-slate-800 border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950',
  }[kind];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-40 ${k} ${className}`}>{children}</button>
  );
}

const SRC: Record<SourceKind, string> = {
  placeholder: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  quote: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  measured: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  calculated: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
};
export const SourceBadge = ({ kind, title }: { kind: SourceKind; title?: string }) => (
  <span title={title} className={`inline-block rounded px-1.5 text-[10px] font-medium leading-4 ${SRC[kind]}`}>
    {kind[0].toUpperCase() + kind.slice(1)}
  </span>
);

/** Number input that only commits valid numbers, on blur or Enter. */
export function NumInput({ value, onChange, step = 'any', className = '', ariaLabel, scale = 1 }: {
  value: number; onChange: (v: number) => void; step?: string; className?: string; ariaLabel?: string; scale?: number;
}) {
  const shown = Number.isFinite(value) ? +(value * scale).toPrecision(10) : 0;
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== shown) onChange(v / scale);
    else setText(String(shown));
  };
  return (
    <input aria-label={ariaLabel} inputMode="decimal" type="number" step={step} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 ${className}`} />
  );
}

export function TextInput({ value, onChange, className = '', placeholder }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  return (
    <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 ${className}`} />
  );
}

export function Select<T extends string>({ value, onChange, options, className = '', ariaLabel }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; ariaLabel?: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value as T)}
      className={`rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 ${className}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      {title && <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{right}</div>}
      {children}
    </section>
  );
}

/** Side panel on wide screens, bottom sheet on phones. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 md:items-stretch" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={typeof title === 'string' ? title : 'Editor'}
        className={`max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 md:max-h-none md:rounded-none ${wide ? 'md:w-[48rem]' : 'md:w-[26rem]'}`}>
        <div className="mx-auto mb-2 h-1 w-10 rounded bg-slate-300 md:hidden" />
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded px-2 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`truncate text-sm font-semibold ${warn ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</div>
    </div>
  );
}

export function Table({ head, rows, className = '' }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">{head.map((h, i) => <th key={i} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-100 dark:border-slate-800">{r.map((c, j) => <td key={j} className="px-2 py-1 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
