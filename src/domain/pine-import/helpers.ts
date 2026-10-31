// LVScript helper functions the translator emits into a translated script when it needs them. Original
// OpenCandle code. $grad steps the gradient in 16ths: an LV plot may use at most 64 distinct colours. They give Pine's na rules (na propagates through arithmetic, comparisons with na are false) on
// LVScript's null values, and keep series history in ctx.state as plain JSON.

interface Helper { code: string; deps?: string[] }
export const HELPERS: Readonly<Record<string, Helper>> = Object.freeze({
  $n: { code: `const $n = v => typeof v === 'number' && isFinite(v) ? v : null;` },
  $add: { code: `const $add = (a, b) => typeof a === 'string' || typeof b === 'string' ? String(a == null ? 'NaN' : a) + String(b == null ? 'NaN' : b) : a == null || b == null ? null : $n(a + b);`, deps: ['$n'] },
  $sub: { code: `const $sub = (a, b) => a == null || b == null ? null : $n(a - b);`, deps: ['$n'] },
  $mul: { code: `const $mul = (a, b) => a == null || b == null ? null : $n(a * b);`, deps: ['$n'] },
  $div: { code: `const $div = (a, b) => a == null || b == null || b === 0 ? null : $n(a / b);`, deps: ['$n'] },
  $mod: { code: `const $mod = (a, b) => a == null || b == null || b === 0 ? null : $n(a % b);`, deps: ['$n'] },
  $neg: { code: `const $neg = a => a == null ? null : -a;` },
  $lt: { code: `const $lt = (a, b) => a != null && b != null && a < b;` },
  $le: { code: `const $le = (a, b) => a != null && b != null && a <= b;` },
  $gt: { code: `const $gt = (a, b) => a != null && b != null && a > b;` },
  $ge: { code: `const $ge = (a, b) => a != null && b != null && a >= b;` },
  $eq: { code: `const $eq = (a, b) => a != null && b != null && a === b;` },
  $ne: { code: `const $ne = (a, b) => a != null && b != null && a !== b;` },
  $na: { code: `const $na = v => v == null || (typeof v === 'number' && !isFinite(v));` },
  $b: { code: `const $b = v => v === true || (typeof v === 'number' && isFinite(v) && v !== 0);` },
  $int: { code: `const $int = v => v == null ? null : Math.trunc(v);` },
  $round: { code: `const $round = (v, p) => v == null ? null : p == null ? Math.round(v) : $n(Math.round(v * Math.pow(10, p)) / Math.pow(10, p));`, deps: ['$n'] },
  $m1: { code: `const $m1 = (f, v) => v == null ? null : $n(f(v));`, deps: ['$n'] },
  $m2: { code: `const $m2 = (f, a, b) => a == null || b == null ? null : $n(f(a, b));`, deps: ['$n'] },
  $max: { code: `const $max = (...v) => { for (let i = 0; i < v.length; i++) if (v[i] == null) return null; return Math.max(...v); };` },
  $min: { code: `const $min = (...v) => { for (let i = 0; i < v.length; i++) if (v[i] == null) return null; return Math.min(...v); };` },
  $avg: { code: `const $avg = (...v) => { let t = 0; for (let i = 0; i < v.length; i++) { if (v[i] == null) return null; t += v[i]; } return t / v.length; };` },
  $hex2: { code: `const $hex2 = v => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? '0' + h : h; };` },
  $rgba: { code: `const $rgba = (c, t) => c == null ? null : t == null ? c : c.slice(0, 7) + $hex2(255 * (100 - t) / 100);`, deps: ['$hex2'] },
  $rgb: { code: `const $rgb = (r, g, b, t) => r == null || g == null || b == null ? null : '#' + $hex2(r) + $hex2(g) + $hex2(b) + (t == null || t === 0 ? '' : $hex2(255 * (100 - t) / 100));`, deps: ['$hex2'] },
  $grad: { code: `const $grad = (v, lo, hi, c1, c2) => {
    if (v == null || lo == null || hi == null || c1 == null || c2 == null) return null;
    const f = hi === lo ? 0 : Math.round(16 * Math.max(0, Math.min(1, (v - lo) / (hi - lo)))) / 16, p = (c, i) => parseInt(c.slice(i, i + 2), 16);
    const a1 = c1.length > 7 ? p(c1, 7) : 255, a2 = c2.length > 7 ? p(c2, 7) : 255;
    return '#' + $hex2(p(c1, 1) + (p(c2, 1) - p(c1, 1)) * f) + $hex2(p(c1, 3) + (p(c2, 3) - p(c1, 3)) * f) + $hex2(p(c1, 5) + (p(c2, 5) - p(c1, 5)) * f) + $hex2(a1 + (a2 - a1) * f);
  };`, deps: ['$hex2'] },
  $str: { code: `const $str = (v, f) => {
    if (v == null) return 'NaN';
    if (typeof v !== 'number') return String(v);
    if (typeof f === 'string' && /^[#0,]*(\\.[#0]*)?$/.test(f)) {
      const dot = f.indexOf('.'), digits = dot < 0 ? 0 : f.length - dot - 1;
      let text = v.toFixed(digits);
      if (dot >= 0 && f.slice(dot + 1).indexOf('0') < 0) text = text.replace(/\\.?0+$/, '');
      return text;
    }
    return String(Math.round(v * 1e8) / 1e8);
  };` },
  $past: { code: `const $past = (S, k, n, v) => { if (n === 0) return v; const a = S.$h && S.$h[k], x = a ? a[n - 1] : undefined; return x === undefined ? null : x; };` },
  $rec: { code: `const $rec = (S, k, v, d) => { const h = S.$h || (S.$h = {}), a = h[k] || (h[k] = []); a.unshift(v === undefined ? null : v); if (a.length > d) a.length = d; };` },
  $H: { code: `const $H = (S, k, v, n, i, d) => {
    const h = S.$H || (S.$H = {}); let r = h[k]; if (v === undefined) v = null;
    if (!r) r = h[k] = { b: i, c: v, p: [] };
    else if (r.b !== i) { r.p.unshift(r.c); if (r.p.length > d) r.p.length = d; r.b = i; }
    r.c = v; if (n === 0) return v; const x = r.p[n - 1]; return x === undefined ? null : x;
  };` },
  $hb: { code: `const $hb = (ctx, n, f) => { const b = ctx.history(n); return b === null ? null : b[f]; };` },
  $ht: { code: `const $ht = (ctx, n) => { const b = ctx.history(n); return b === null ? null : b.time * 1000; };` },
  $bi: { code: `const $bi = (ctx, n) => ctx.index - n >= 0 ? ctx.index - n : null;` },
  $newDay: { code: `const $newDay = ctx => { const p = ctx.history(1); if (p === null) return true; const a = ctx.calendar(p.time), b = ctx.calendar(); return a.year !== b.year || a.dayofyear !== b.dayofyear; };` },
  $bar: { code: `const $bar = (ctx, c) => { if (c != null) ctx.barcolor(c); };` },
  $clean: { code: `const $clean = o => { const r = {}; for (const k in o) if (o[k] != null) r[k] = o[k]; return r; };` },
  $held: { code: `const $held = (ctx, S) => { if (ctx.strategy) S.$pos = Math.sign(ctx.strategy.position); return S.$pos || 0; };` },
  $pos: { code: `const $pos = (ctx, S) => ctx.strategy ? ctx.strategy.position : $held(ctx, S);`, deps: ['$held'] },
  $entry: { code: `const $entry = (ctx, S, id, dir, qty, limit, stop, entry) => {
    const side = dir === 'short' ? -1 : 1;
    if (entry && $held(ctx, S) === side) return;
    const o = { id: String(id).slice(0, 64) };
    if (entry) o.entry = true;
    if (limit != null) o.limit = limit;
    if (stop != null) o.stop = stop;
    o.type = limit != null && stop != null ? 'stop-limit' : limit != null ? 'limit' : stop != null ? 'stop' : 'market';
    ctx.order(side > 0 ? 'buy' : 'sell', qty, o);
    if (entry) S.$pos = side;
  };`, deps: ['$held'] },
  $close: { code: `const $close = (ctx, S, id, qty) => {
    const held = $held(ctx, S); if (held === 0) return;
    ctx.order(held > 0 ? 'sell' : 'buy', qty, { id: id == null ? 'Close' : ('Close ' + id).slice(0, 64), close: true });
    S.$pos = 0;
  };`, deps: ['$held'] },
  $rand: { code: `const $rand = (ctx, lo, hi) => lo + (hi - lo) * ctx.random();` },
});

/** The helper sources for a set of names, dependencies first, in a stable order. */
export function helperSource(names: Iterable<string>): string[] {
  const wanted = new Set<string>(), visit = (name: string) => { if (wanted.has(name)) return; for (const dep of HELPERS[name]?.deps ?? []) visit(dep); wanted.add(name); };
  for (const name of names) visit(name);
  return Object.keys(HELPERS).filter(name => wanted.has(name)).map(name => HELPERS[name].code);
}
