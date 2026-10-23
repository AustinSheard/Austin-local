# Juvo Process Simulator

A simplified, HYSYS-style tool for modelling variations of the Juvo frozen smoothie cup process: IQF fruit and a powder blend filled into sealed aluminium cups, stored frozen and sold through vending machines.

It opens on the **Midland semi-auto** line with live results. Move the fleet slider, tap a step to edit it, or drag equipment in from the list.

```bash
npm install
npm run dev        # app on http://localhost:5173
npm test           # engine, footprint, library/quote and UX tests
npm run build      # static build in dist/ (works from any folder)
npm run proxy      # optional: quote-extraction proxy on :8787 (needs ANTHROPIC_API_KEY)
npm run catalogue  # regenerate src/data/catalogue.json from scripts/build-catalogue.mjs
```

> **Placeholders.** Apart from the four labeller quotes and the 30 cups/machine/day planning rule, every number in the seed data is a placeholder. Each field carries a source tag (Placeholder / Quote / Measured / Calculated) and the UI shows it. Don't present the results as fact until the placeholders are replaced.

## Screens

- **Flowsheet**: drag and drop equipment, connect steps, swap variants, edit a step in the side panel (bottom sheet on phones). Blue edges are frozen product and amber edges are out of the freezer. Each edge shows cups/h and the running out-of-freezer time.
- **Results**: throughput, cost per cup breakdown, CAPEX, power, time and freshness, a plain-English insight line, and CSV export.
- **Floor plan**: room size or facility preset, drag, snap and rotate items, clearance halos, overlap and out-of-room warnings, auto-arrange, and footprint maths that can feed the fit-out cost.
- **More**: Scenarios, Scale-up sweep, Compare, Quotes, Library, Import a quote (Advanced mode) and Settings.

Simple mode shows six fields per piece of equipment: rate, number of units, cost, power, footprint and time in step. Advanced mode shows every field: OEE, yield loss, duty, operators, life, maintenance, materials, clearance, min/typ/max ranges, source tags, custom fields and quotes.

Undo and redo cover both canvases (Ctrl+Z / Ctrl+Y or the buttons). Everything is saved to `localStorage`.

## How the model works

All of the maths is in `src/engine`, which has no UI imports. It's a steady-state model, with no thermodynamics, dynamic simulation or changeover scheduling.

| Quantity | Formula |
|---|---|
| Demand per production day | machines × cups/machine/day × 7 / production days |
| Survival `S_i` | product of (1 − loss) from step *i* to the end of the main path. A side stream uses the next main step's S × its own (1 − loss) |
| Rate step capacity/day | units × rate (cups/h) × OEE × shift hours |
| Storage step capacity/day | units × cups held × usable fill / dwell days × 7 / production days (Little's law) |
| Max good output | min over rate steps of capacity × S_i (the argmin is the **slowest step**). Freezers and cool rooms hold stock and never limit the line |
| Supported fleet | max good × production days / (7 × cups/machine/day) |
| Output made Q | min(demand, max good). All costs use Q |
| Cup balance | cups in at de-nesting = good cups out + rejects. Every step passes the cups it receives to the next one |
| Line pacing | the line moves in sync at Q / shift hours. Each step runs at that rate (shown as “runs X of Y cups/h”), and steps faster than the slowest one are marked “paced” |
| Utilisation | (demand / S_i) / capacity |
| Power | connected = units × kW; average = connected × duty. Always-on steps run 24 h, others run shift × utilisation |
| Labour | operators × units × paid hours (shift × utilisation when flex labour is on). FTE = hours / shift |
| Materials | charged at the step that uses them, ÷ S_i. Grams use A$/kg, "each" uses A$ each |
| CAPEX | (Σ units × cost, converted to A$) × (1 + install %) + fit-out, then × (1 + contingency %) |
| Depreciation | straight line over item life, including installation and contingency. Fit-out uses its own life |
| Maintenance | % of equipment cost per year |
| Cost per cup | (materials + labour + power + maintenance + depreciation + overheads) / cups per month. Cash OPEX leaves out depreciation |
| Out-of-freezer window | longest run of consecutive ambient main-path steps once there is product in the cup (empty cups from de-nesting and side streams don't count) |
| Right-size | units = ceil(required entering cups / (per-unit capacity × target utilisation)), minimum 1 |

Monthly figures use 365/12 calendar days and production days × 52/12 production days.

**Parallel branches** split the cup flow equally, and merges add it back up. With a straight line every step carries 100% of the flow, which gives the formulas above. **Side streams** (for example powder blending) feed a main step but aren't on the cup path.

**Ranges.** Rate, price and power can each hold min / typ / max values. Settings chooses which value the model uses, and the scale-up sweep can run low, typical or high.

### Seed checks (from `tests/engine.test.ts`)

- Midland semi-auto at 25 machines: 1,050 good cups/day, about A$3.21/cup, 95.9% yield, 20 min out of the freezer. The slowest step is the semi-auto seamer; freezers never pace the line.
- Each template starts with a cup de-nesting step (cups in, where the aluminium cup cost is charged). Fruit stores feed the dosing step from the side.
- Midland at 100 machines as built is short of demand. Right-sized, it costs about A$2.89/cup.
- Automated line at 25 machines: the slowest step is the YM515 labeller, and the line supports about 193 machines.
- An empty flowsheet returns output = demand, with no NaN.

### Assumptions in the seed data

- Bulk fruit stores hold fruit as "cup-equivalents" (set as a per-step override on the fruit freezers and the fruit cool room).
- Labeller rates are the mid-point of each quoted range in cups/min × 60. Quoted prices are US$ EXW China, converted at the US$→A$ setting.
- The Change Machinery quote gave no footprint, so its L × W is a tagged placeholder.
- The YM140 quote (dated 28 Aug) has lapsed and gives no validity date. It's marked expired.
- Room presets for Midland Kitchen 7 and King Street Unit 9 are empty. Enter the real sizes and press **Save size to preset**.

## Adding equipment

- **In the app**: More → Library → *New: rate-limited / storage / side stream*, or **Clone** an existing item. To keep a step you've changed on the flowsheet, use **Save to palette** in the step editor. Edits on a flowsheet step are per-step overrides: they show an *overridden* marker and a reset button, and never change the library.
- **Outside the app**: edit `src/data/catalogue.json` (or `scripts/build-catalogue.mjs`, then run `npm run catalogue`), or export the library as JSON, edit it and import it again. Imports are checked against the catalogue schema (`validateCatalogue`).
- **Custom fields** (key, value, unit) can add a CAPEX line (A$ per unit), an OPEX line (A$/month per unit) or a per-cup cost. Scenario-level extra materials and cost lines are under More → Scenarios in Advanced mode.

## Adding quotes

1. More → Quotes → **New quote**, or More → Import a quote (Advanced mode).
2. Enter the line items. Untick optional extras to keep them out of the total. Then add freight, duty %, GST (claimable or not) and installation %. The landed A$ cost builds up step by step.
3. Link the quote to an equipment variant. **Apply** copies the cost (in the quote currency), plus the rate, kW and footprint where the quote states them, onto the variant and tags those fields *Quote*. **Revert** restores the previous values.
4. Quotes for the same equipment type are compared side by side. The cheapest landed cost and the cheapest A$ per cup/h are highlighted. Expired and expiring quotes are flagged in the palette, the step editor and the quotes table.

### Assisted import

`server/proxy.mjs` is a small Node server. It calls the Anthropic API (`claude-opus-5-5`, with structured JSON output) using a key that **stays on the server**. Set `ANTHROPIC_API_KEY` and run `npm run proxy`. Vite forwards `/api` to it during development.

- Paste text or email, or upload a PDF, image, text or CSV file. For Excel, save the sheet as CSV or paste the cells.
- Every extracted value comes back with its source snippet and a confidence level. You check and edit everything on a review screen before it's saved. Missing fields stay empty, and power, footprint and yield are never guessed.
- Multi-item quotes are split into line items, and you map each one to a library item.
- You can turn the API off in Settings. The manual form still works without it.

## Layout

```
src/engine/    types, engine (simulate, rightSize, relieveBottleneck, insight), footprint, quotes, library, sweep
src/data/      catalogue.json, templates (Midland, Automated, Hybrid, Blank), seed quotes
src/store/     Zustand store, localStorage persistence, undo/redo
src/ui/        Flowsheet (React Flow), Palette, NodeEditor, Results, FloorPlan, more/*
server/        quote-extraction proxy
tests/         Vitest suites
```

The engine is pure, so new behaviour (batching, changeovers, dynamic runs) can be added beside `simulate` without touching the UI.
