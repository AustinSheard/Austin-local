// Equipment roles drive node and line colours on the flowsheet.

export type Role = 'batch' | 'dosing' | 'modify' | 'storage' | 'inspect' | 'pack' | 'other';

const BY_TYPE: Record<string, Role> = {
  'ribbon-mixer': 'batch', 'v-blender': 'batch', 'powder-scale': 'batch', sifter: 'batch',
  'fruit-portioning': 'dosing', 'fruit-depositor': 'dosing', 'comb-weigher': 'dosing', denester: 'dosing',
  'fruit-feed': 'dosing', 'auger-filler': 'dosing', 'vol-filler': 'dosing', 'powder-hopper': 'dosing', 'powder-manual': 'dosing',
  seamer: 'modify', 'lid-placer': 'modify', 'heat-sealer': 'modify', 'n2-flush': 'modify', labeller: 'modify', coder: 'modify',
  'chest-freezer': 'storage', 'upright-freezer': 'storage', 'cool-room': 'storage', 'blast-freezer': 'storage', 'pallet-freezer': 'storage',
  checkweigher: 'inspect', 'metal-detector': 'inspect', vision: 'inspect', xray: 'inspect',
  cartoning: 'pack', shrink: 'pack', 'pallet-wrap': 'pack',
};

export const ROLES: Record<Role, { label: string; colour: string }> = {
  batch: { label: 'Bulk batch', colour: '#8b5cf6' },
  dosing: { label: 'Cup dosing', colour: '#10b981' },
  modify: { label: 'Cup modification', colour: '#ec4899' },
  storage: { label: 'Frozen storage', colour: '#0ea5e9' },
  inspect: { label: 'Inspection', colour: '#f59e0b' },
  pack: { label: 'Packing', colour: '#64748b' },
  other: { label: 'Other', colour: '#94a3b8' },
};

export function roleOf(typeId: string | undefined, sideStream?: boolean): Role {
  if (sideStream) return 'batch';
  return (typeId && BY_TYPE[typeId]) || 'other';
}
