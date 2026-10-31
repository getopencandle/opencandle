/**
 * The report's strategy chooser. Every strategy on the active chart is
 * listed; the chosen one is the binding whose execution fills the report. The latest execution of each binding is kept
 * per cell, so a switch shows that strategy's settled run at once (it still passes the host's identity checks) instead
 * of waiting for the next recalculation.
 */
export interface StrategyChoice { readonly id: string; readonly name: string }
interface BindingRow { readonly id: string; readonly documentId: string; readonly name: string }
interface LibraryRow { readonly id: string; readonly kind?: string; readonly name?: string }

/** The chart's strategy bindings in chart order. Several instances of one script are numbered so each row is distinct. */
export function strategyChoices(bindings: readonly BindingRow[], documents: readonly LibraryRow[]): StrategyChoice[] {
  const kinds = new Map(documents.map(doc => [doc.id, doc.kind]));
  const rows = bindings.filter(row => kinds.get(row.documentId) === 'strategy');
  const counts = new Map<string, number>(), seen = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return rows.map(row => {
    const index = (seen.get(row.name) ?? 0) + 1; seen.set(row.name, index);
    return Object.freeze({ id: row.id, name: (counts.get(row.name) ?? 0) > 1 ? `${row.name} (${index})` : row.name });
  });
}

const runs = new WeakMap<object, Map<string, Map<string, unknown>>>();
/** Keep the latest execution of a binding on a cell (`owner` is the host's per-workspace selection map). */
export function rememberStrategyRun<T extends { bindingId: string }>(owner: object, cellId: string, value: T): void {
  let cells = runs.get(owner); if (!cells) { cells = new Map(); runs.set(owner, cells); }
  let cell = cells.get(cellId); if (!cell) { cell = new Map(); cells.set(cellId, cell); }
  cell.set(value.bindingId, value);
}
export function recalledStrategyRun<T>(owner: object, cellId: string, bindingId: string): T | null {
  return (runs.get(owner)?.get(cellId)?.get(bindingId) as T | undefined) ?? null;
}
/** Bars, chart type, cell or sources changed: every kept run is stale. */
export function forgetStrategyRuns(owner: object): void { runs.delete(owner); }
const inputs = new WeakMap<object, readonly unknown[]>();
/**
 * Forget the kept runs when the calculation input (bars, chart type, cell, replay run) changed. A binding change alone
 * keeps them: only the changed binding recalculates, and the host's checks refuse a run whose binding or source changed.
 */
export function forgetStrategyRunsOnInput(owner: object, input: readonly unknown[]): void {
  const prior = inputs.get(owner); inputs.set(owner, input);
  if (!prior || prior.length !== input.length || prior.some((value, index) => !Object.is(value, input[index]))) runs.delete(owner);
}
