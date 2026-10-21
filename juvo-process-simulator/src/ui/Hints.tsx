import type { ReactNode } from 'react';
import { useStore } from '../store/store';

/** One of three dismissible first-run hints. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const done = useStore((s) => s.hints[id]);
  const dismiss = useStore((s) => s.dismissHint);
  if (done) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-sky-600 px-3 py-1 text-xs text-white shadow">
      <span>💡 {children}</span>
      <button aria-label="Dismiss hint" onClick={() => dismiss(id)} className="text-white/80 hover:text-white">×</button>
    </div>
  );
}
