import { createExactVwapAccumulator } from '../domain/vwap-exact';
import { vwapPercentageBounds } from '../domain/vwap-percentage';
import { createVwapDeviationAccumulator, vwapDeviationBounds, vwapSourcePrice } from '../domain/vwap-stdev-bands';
import { copyWireRequest, reject, vwapPlots } from './protocol';
import { VWAP_EXCHANGE_TIMEZONE, VWAP_WORKER_LIMITS as LIMIT, type VwapAnchor, type VwapDiagnostic, type VwapPlotId, type VwapWireResult } from './types';

/** Same calendar keys as legacy anchorKeys; this copy does not alter the v1 kernel. */
function anchorKey(formatter: Intl.DateTimeFormat, seconds: number, anchor: VwapAnchor): string {
  const parts = Object.fromEntries(formatter.formatToParts(seconds * 1000).map(part => [part.type, part.value]));
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  if (anchor === 'Year') return String(year);
  if (anchor === 'Decade') return String(Math.floor(year / 10));
  if (anchor === 'Century') return String(Math.floor(year / 100));
  if (anchor === 'Quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (anchor === 'Month') return `${year}-${month}`;
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  const midnight = date.getTime();
  if (anchor === 'Week') return String(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 86_400_000);
  return `${year}-${month}-${day}`;
}

/** Called only inside the fixed worker, or directly by bounded numerical tests. */
export function calculateVwapWorkerMessage(input: unknown): VwapWireResult {
  const request = copyWireRequest(input), { rows, settings } = request, plots = vwapPlots(settings), cells = rows * plots.length;
  if (rows * 6 * 8 + cells * 9 > LIMIT.activeBytes) reject('VWAP_BUDGET', 'VWAP numeric buffer limit exceeded before allocation.');
  const data = new Float64Array(request.buffer);
  // Validate the entire input before allocating output or publishing any partial values.
  let previousTime = -Infinity;
  for (let index = 0; index < rows; index++) {
    const start = index * 6, time = data[start], open = data[start + 1], high = data[start + 2], low = data[start + 3], close = data[start + 4], volume = data[start + 5];
    if (!Number.isSafeInteger(time) || time < -62_135_596_800 || time > 253_402_300_799 || time <= previousTime) reject('VWAP_INPUT', `VWAP time is invalid at row ${index}.`);
    if (![open, high, low, close].every(Number.isFinite) || high < Math.max(open, close, low) || low > Math.min(open, close)) reject('VWAP_INPUT', `VWAP OHLC is invalid at row ${index}.`);
    if (!Number.isFinite(volume) || volume < 0) reject('VWAP_VOLUME', `VWAP requires complete nonnegative finite volume; row ${index} is unavailable.`);
    previousTime = time;
  }
  const values = new Float64Array(cells), mask = new Uint8Array(cells), accumulator = createExactVwapAccumulator(settings.source);
  // An unresolved Exchange choice (no exchange zone was known) is UTC 00:00, as in vwapAnchorZone.
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone === VWAP_EXCHANGE_TIMEZONE ? 'UTC' : settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const diagnostics: VwapDiagnostic[] = [], failed = new Set<VwapPlotId>();
  let priorAnchor: string | null = null, priorHaOpen = 0, priorHaClose = 0;
  // Standard Deviation mode (src/domain/vwap-stdev-bands.ts), reset with the same anchor keys.
  const deviation = settings.bandMode === 'Standard Deviation' ? createVwapDeviationAccumulator() : null;
  for (let index = 0; index < rows; index++) {
    const start = index * 6, time = data[start], volume = data[start + 5];
    let open = data[start + 1], high = data[start + 2], low = data[start + 3], close = data[start + 4];
    if (settings.transform === 'heikin-ashi') {
      const haClose = (open + high + low + close) / 4, haOpen = index === 0 ? (open + close) / 2 : (priorHaOpen + priorHaClose) / 2;
      high = Math.max(high, haOpen, haClose); low = Math.min(low, haOpen, haClose); open = haOpen; close = haClose;
      if (![open, high, low, close].every(Number.isFinite)) reject('VWAP_TRANSFORM', 'The existing Heikin Ashi transform is nonfinite; no replacement transform was substituted.');
      priorHaOpen = haOpen; priorHaClose = haClose;
    }
    const key = anchorKey(formatter, time, settings.anchor), sd = deviation ? deviation.push(vwapSourcePrice(settings.source, open, high, low, close), volume, key !== priorAnchor) : null, value = accumulator.push(open, high, low, close, volume, key !== priorAnchor); priorAnchor = key;
    if (value === null) continue;
    values[index] = value; mask[index] = 1;
    let column = 1;
    for (let pair = 1; pair <= 3; pair++) {
      if (!settings[`band${pair}Enabled` as keyof typeof settings]) continue;
      const upperId = `upper${pair}` as VwapPlotId, lowerId = `lower${pair}` as VwapPlotId;
      try {
        const multiplier = settings[`band${pair}Multiplier` as keyof typeof settings] as number, bounds = deviation ? vwapDeviationBounds(value, sd, multiplier) : vwapPercentageBounds(value, multiplier);
        if (bounds) {
          values[column * rows + index] = bounds.upper; values[(column + 1) * rows + index] = bounds.lower;
          mask[column * rows + index] = 1; mask[(column + 1) * rows + index] = 1;
        }
      } catch {
        for (const id of [upperId, lowerId]) if (!failed.has(id)) { failed.add(id); diagnostics.push({ plotId: id, message: 'This percentage band has an unrepresentable boundary; affected points remain gaps.' }); }
      }
      column += 2;
    }
  }
  return { v: 1, type: 'result', job: request.job, rows, plotIds: plots.map(plot => plot.id), values: values.buffer, mask: mask.buffer, diagnostics };
}
