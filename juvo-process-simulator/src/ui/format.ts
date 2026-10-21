export const aud = (v: number, dp = 0) =>
  Number.isFinite(v) ? `A$${v.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : '–';
export const num = (v: number, dp = 0) =>
  Number.isFinite(v) ? v.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'unlimited';
export const pct = (v: number, dp = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(dp)}%` : '–');
export const mins = (m: number) => {
  if (!Number.isFinite(m)) return '–';
  if (m < 120) return `${num(m, m < 10 && m % 1 ? 1 : 0)} min`;
  if (m < 2880) return `${num(m / 60, 1)} h`;
  return `${num(m / 1440, 1)} days`;
};
export const fleet = (v: number) => (Number.isFinite(v) ? `${Math.floor(v)} machines` : 'unlimited');

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0]);
    i.click();
  });
}
