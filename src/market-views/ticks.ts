/** "Nice" axis ticks (1, 2, 2.5, 5 x 10^n steps) covering [lo, hi]. Always includes 0 when the range spans it. */
export function niceTicks(lo: number, hi: number, target = 5): { ticks: number[]; lo: number; hi: number; step: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0], lo: 0, hi: 1, step: 1 };
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / Math.max(1, target - 1), mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.floor(lo / step + 1e-9) * step, last = Math.ceil(hi / step - 1e-9) * step, ticks: number[] = [];
  for (let v = first, i = 0; v <= last + step * 1e-9 && i < 50; i++, v = first + i * step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return { ticks, lo: first, hi: last, step };
}
/** Tick label with only the decimals the step needs. */
export function tickLabel(value: number, step: number): string {
  const text = String(Number(step.toPrecision(6))), digits = text.includes('.') ? Math.min(4, text.split('.')[1].length) : 0;
  return value.toFixed(digits);
}
