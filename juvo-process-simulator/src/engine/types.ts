// Core data types shared by the engine and the UI. No UI imports here.

export type SourceKind = 'placeholder' | 'quote' | 'measured' | 'calculated';

export interface SourceTag {
  kind: SourceKind;
  note?: string;
  date?: string;
  quoteId?: string;
}

/** A number that may carry a min / typical / max range. */
export interface Ranged {
  min?: number;
  typ: number;
  max?: number;
}

export type RangePick = 'min' | 'typ' | 'max';
export type Currency = 'AUD' | 'USD';
export type DwellUnit = 'min' | 'h' | 'd';

export interface Material {
  name: string;
  qty: number;
  unit: 'g' | 'each';
  /** A$/kg for grams, A$ each for each. */
  price: number;
  source?: SourceKind;
}

export type CostLineKind = 'none' | 'capex' | 'opex_month' | 'opex_cup';

export interface CustomField {
  key: string;
  value: number;
  unit: string;
  costType: CostLineKind;
}

/** Every editable number on a piece of equipment. */
export interface EquipmentSpec {
  kind: 'rate' | 'storage';
  state: 'frozen' | 'ambient';
  sideStream: boolean;
  facilityOnly?: boolean;
  /** cups/h per unit (rate steps). */
  rate: Ranged;
  /** cups held per unit (storage steps). */
  cupsHeld: number;
  /** cups held per m³ of internal volume, used when volumeM3 is set. */
  volumeM3?: number;
  oee: number; // 0..1
  usableFill: number; // 0..1
  loss: number; // 0..1
  /** Time in step, stored in minutes. */
  dwellMin: number;
  dwellUnit: DwellUnit;
  kW: Ranged;
  duty: number; // 0..1
  alwaysOn: boolean;
  operators: number; // per unit
  cost: Ranged; // per unit
  currency: Currency;
  life: number; // years
  maintPct: number; // % of equipment cost per year, as 0..1
  materials: Material[];
  L: number; // m
  W: number; // m
  H: number; // m
  clearance: number; // m, each side
  notes: string;
  customFields: CustomField[];
  sources: Record<string, SourceTag>;
}

export type SpecKey = keyof EquipmentSpec;

export interface Variant {
  id: string;
  typeId: string;
  name: string;
  supplier?: string;
  model?: string;
  spec: EquipmentSpec;
  quoteIds?: string[];
  selectedQuoteId?: string;
  /** Previous spec snapshots, newest last, for reverting a quote application. */
  history?: Partial<EquipmentSpec>[];
  hidden?: boolean;
  userMade?: boolean;
}

export interface EquipmentType {
  id: string;
  name: string;
  category: string;
  defaultVariantId: string;
}

export interface Catalogue {
  version: number;
  categories: string[];
  types: EquipmentType[];
  variants: Variant[];
}

export interface FlowNode {
  id: string;
  variantId: string;
  units: number;
  overrides: Partial<EquipmentSpec>;
  label?: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Globals {
  fleet: number;
  cupsPerMachine: number;
  prodDays: number;
  shiftHours: number;
  wage: number;
  kWhPrice: number;
  overheads: number;
  fitOut: number;
  /** Fit-out life, years. */
  fitOutLife: number;
  installPct: number;
  contingencyPct: number;
  usdToAud: number;
  targetUtil: number;
  oofLimitMin: number;
  flexLabour: boolean;
  pick: { rate: RangePick; cost: RangePick; kW: RangePick };
}

export interface CostLine {
  name: string;
  amount: number;
  kind: 'capex' | 'opex_month' | 'opex_cup';
}

export interface Scenario {
  id: string;
  name: string;
  templateId?: string;
  globals: Globals;
  nodes: FlowNode[];
  edges: FlowEdge[];
  costLines: CostLine[];
  extraMaterials: Material[];
  layout: FloorLayout;
}

// ---------- Floor plan ----------

export interface PlacedItem {
  id: string;
  /** Flowsheet node id, or undefined for facility items. */
  nodeId?: string;
  variantId?: string;
  label: string;
  x: number; // m, top-left
  y: number;
  L: number;
  W: number;
  clearance: number;
  rot: 0 | 90 | 180 | 270;
}

export interface FloorLayout {
  roomL: number;
  roomW: number;
  ceilingH: number;
  presetId?: string;
  aislePct: number;
  cupsPerM3: number;
  fitOutPerM2: number;
  coolRoomPerM3: number;
  /** When true the fit-out cost comes from A$/m² × required m². */
  linkFitOut: boolean;
  items: PlacedItem[];
}

export interface RoomPreset {
  id: string;
  name: string;
  L?: number;
  W?: number;
  ceilingH?: number;
}

// ---------- Quotes ----------

export interface QuoteLine {
  description: string;
  price: number;
  included: boolean;
}

export interface Quote {
  id: string;
  variantId?: string;
  supplier: string;
  contact?: string;
  ref?: string;
  date?: string;
  validUntil?: string;
  currency: Currency;
  incoterm?: string;
  lines: QuoteLine[];
  freight: number;
  dutyPct: number;
  gstPct: number;
  gstClaimable: boolean;
  installPct: number;
  paymentTerms?: string;
  leadTime?: string;
  warranty?: string;
  fileName?: string;
  /** Specs stated in the quote. Never guessed. */
  rate?: Ranged;
  kW?: number;
  L?: number;
  W?: number;
  notes?: string;
}
