import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importPineScript, pineReportSummary } from '../../src/domain/pine-import';
import { lexPine } from '../../src/domain/pine-import/lexer';
import { parsePine } from '../../src/domain/pine-import/parser';

// Parser and translator units. Every Pine snippet here is written for this test.
const pine = (body: string, head = '//@version=5\nindicator("T")\n') => importPineScript(head + body);

describe('PINE-IMPORT1 lexer and parser', () => {
  it('reads the version, indentation blocks and wrapped lines', () => {
    const lexed = lexPine('//@version=6\nindicator("A")\nx = 1 +\n     2\nif x > 1\n    y = 2\n');
    expect(lexed.version).toBe(6);
    expect(lexed.tokens.filter(t => t.type === 'indent').length).toBe(1);
    const parsed = parsePine('//@version=5\nx = math.max(1,\n   2)\nz = x\n  + 1\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.body.map(s => s.k)).toEqual(['decl', 'decl']);
  });
  it('parses functions, tuples, switch, for and if-expressions', () => {
    const parsed = parsePine(`f(a, b = 2) => a + b
g(x) =>
    y = x * 2
    [x, y]
[p, q] = g(1)
s = switch
    p > 1 => 1
    => 0
for i = 0 to 3 by 1
    s := s + i
t = if p > 0
    1
else
    2
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.body.map(s => s.k)).toEqual(['fn', 'fn', 'tdecl', 'decl', 'for', 'decl']);
  });
  it('turns user types, methods and library imports into unsupported statements instead of failing', () => {
    const parsed = parsePine('type Pivot\n    float price\nmethod m(Pivot p) => p.price\nimport someone/lib/1 as lib\nx = close\n');
    expect(parsed.body.map(s => s.k)).toEqual(['unsupported', 'unsupported', 'unsupported', 'decl']);
  });
});

describe('PINE-IMPORT1 translation', () => {
  it('maps the declaration, overlay and pane, and the strategy kind', () => {
    const a = importPineScript('//@version=5\nindicator("My osc", "MO", overlay=false)\nplot(close)');
    expect(a).toMatchObject({ ok: true, name: 'My osc', kind: 'indicator', pane: 'new' });
    expect(importPineScript('//@version=5\nindicator("Ov", overlay=true)\nplot(close)').pane).toBe('price');
    expect(importPineScript('//@version=5\nstrategy("St")\nplot(close)').kind).toBe('strategy');
  });
  it('refuses libraries and Pine v4 and earlier, and reports why', () => {
    const lib = importPineScript('//@version=5\nlibrary("L")\nexport f(x) => x');
    expect(lib.ok).toBe(false); expect(lib.report.unsupported.some(row => /libraries/.test(row.reason))).toBe(true);
    const v4 = importPineScript('//@version=4\nstudy("Old")\nplot(sma(close, 10))');
    expect(v4.ok).toBe(false); expect(v4.report.unsupported[0].reason).toMatch(/v5 and v6/);
    expect(importPineScript('   ').ok).toBe(false);
  });
  it('maps inputs to CandleScript input declarations', () => {
    const r = pine(`len = input.int(14, "Length", minval = 1, maxval = 200)
mult = input.float(2.0, "Mult", step = 0.1)
show = input.bool(true, "Show")
mode = input.string("EMA", "Type", options = ["EMA", "SMA"])
src = input.source(hl2, "Source")
col = input.color(color.new(color.red, 50), "Colour")
pick = input.int(5, "Pick", options = [5, 10, 20])
legacy = input(10, "Legacy")
plot(src)
`);
    expect(r.source).toContain('len: { type: "int", default: 14, title: "Length", min: 1, max: 200 }');
    expect(r.source).toContain('mult: { type: "float", default: 2, title: "Mult", step: 0.1 }');
    expect(r.source).toContain('show: { type: "bool", default: true, title: "Show" }');
    expect(r.source).toContain('mode: { type: "string", default: "EMA", title: "Type", options: ["EMA", "SMA"] }');
    expect(r.source).toContain('src: { type: "source", default: "hl2", title: "Source" }');
    expect(r.source).toContain('col: { type: "color", default: "#e5566b80", title: "Colour" }');
    expect(r.source).toContain('pick: { type: "int", default: 5, title: "Pick", min: 5, max: 20 }');
    expect(r.source).toContain('legacy: { type: "int", default: 10, title: "Legacy" }');
    expect(r.source).toContain('const src = ctx.ta.source(ctx.input("src"));');
    expect(r.report.notes.some(note => /numeric options/.test(note))).toBe(true);
  });
  it('uses plain operators for na-free values and na-propagating helpers otherwise', () => {
    const r = pine('a = close - open\nb = ta.sma(close, 5) - open\nc = a > 0\nd = b > 0\nplot(a)\nplot(b)\nplot(c ? 1 : 0)\nplot(d ? 1 : 0)\n');
    expect(r.source).toContain('let a = (ctx.bar.close - ctx.bar.open);');
    expect(r.source).toContain('let b = $sub(ctx.ta.sma("t1", ctx.bar.close, 5), ctx.bar.open);');
    expect(r.source).toContain('let c = (a > 0);');
    expect(r.source).toContain('let d = $gt(b, 0);');
  });
  it('gives every ta call site its own key and stateful functions a call-site key', () => {
    const r = pine('f(x) => ta.ema(x, 3)\ng(x) => x + 1\nplot(f(close))\nplot(f(open))\nplot(g(close))\n');
    expect(r.source).toContain('const f = (__k, x) => {');
    expect(r.source).toContain('const g = (x) => {');
    expect(r.source).toMatch(/f\("f1", ctx\.bar\.close\)[\s\S]*f\("f2", ctx\.bar\.open\)/);
  });
  it('maps plots, shapes, hlines, fills, colours and the OpenCandle palette for unspecified colours', () => {
    const r = pine(`p = plot(close, "C", color = color.new(#ff0000, 50), linewidth = 2, style = plot.style_stepline)
q = plot(open)
z = plot(high)
fill(p, q, color = color.rgb(0, 128, 255, 80))
plotshape(close > open, "Up", style = shape.labelup, location = location.belowbar, size = size.small)
plotchar(close < open, "Dn", "v", location.abovebar)
hline(50, "Mid", linestyle = hline.style_dotted, linewidth = 6)
bgcolor(close > open ? color.new(color.lime, 85) : na)
barcolor(close > open ? color.green : color.red)
`);
    expect(r.source).toContain('ctx.plot("C", ctx.bar.close, { color: "#ff000080", linewidth: 2, style: "stepline" });');
    expect(r.source).toContain('ctx.plot("Plot", ctx.bar.open, { color: "#6fa8ff" });');
    expect(r.source).toContain('ctx.plot("Plot 2", ctx.bar.high, { color: "#f0a35e" });');
    expect(r.source).toContain('ctx.fill("Fill", "C", "Plot", { color: "#0080ff33" });');
    expect(r.source).toContain('ctx.plotshape("Up", (ctx.bar.close > ctx.bar.open), { shape: "triangleup", location: "belowbar", color: "#3fb68b", size: "small" });');
    expect(r.source).toContain('ctx.plotchar("Dn", (ctx.bar.close < ctx.bar.open), "v", { location: "abovebar", color: "#e5566b" });');
    expect(r.source).toContain('ctx.hline("Mid", 50, { lineStyle: "dotted", width: 4 });');
    expect(r.report.notes).toContain('shape.labelup is drawn as an OpenCandle triangleup.');
  });
  it('declares alert conditions with their messages', () => {
    const r = pine('alertcondition(ta.crossover(close, open), "Cross", "Close crossed open")\n');
    expect(r.source).toContain('"Cross": "Close crossed open"');
    expect(r.source).toContain('ctx.alertcondition("Cross", $b(ctx.ta.crossover("t1", ctx.bar.close, ctx.bar.open)));');
  });
  it('keeps var state in ctx.state and records global history at the end of the bar', () => {
    const r = pine('var float hi = na\nhi := na(hi) ? high : math.max(hi, high)\nplot(hi[1])\n');
    expect(r.source).toContain('if (!("hi" in S)) S.hi = null;');
    expect(r.source).toContain('$past(S, "hi", 1, S.hi)');
    expect(r.source.trimEnd()).toMatch(/\$rec\(S, "hi", S\.hi, 1\);\n {4}\}\n {2}\};\n\}\)\(\)$/);
  });
  it('marks unsupported calls and statements with TODO(pine) comments and report rows', () => {
    const r = pine('x = request.security(syminfo.tickerid, "D", close)\nl = label.new(bar_index, high, "a")\nm = matrix.new<float>(2, 2)\ny = ta.unknownthing(close)\nplot(close)\n');
    for (const line of [3, 4, 5, 6]) expect(r.report.unsupported.some(row => row.line === line), 'line ' + line).toBe(true);
    expect(r.source).toContain('TODO(pine): request.security()');
    expect(r.report.statements.total).toBeGreaterThan(r.report.statements.translated);
    expect(pineReportSummary(r.report).join(' ')).toMatch(/Not translated: \d+ items/);
  });
  it('warns about ta calls inside loops', () => {
    const r = pine('s = 0.0\nfor i = 1 to 3\n    s += ta.sma(close, 5)\nplot(s)\n');
    expect(r.report.unsupported.some(row => /inside a loop/.test(row.construct))).toBe(true);
  });
  it('never emits the words the CandleScript source guard refuses, and renames JavaScript reserved names', () => {
    const r = importPineScript('//@version=5\nindicator("export and import levels")\ndelete = close\nplot(delete, "async await Promise")\n');
    expect(/\b(async|await|import|export|Promise)\b/.test(r.source)).toBe(false);
    expect(r.source).toContain('let delete_ = ctx.bar.close;');
  });
  it('maps strategy entries, exits and closes to virtual order proposals', () => {
    const r = importPineScript(`//@version=5
strategy("S", default_qty_value = 2, default_qty_type = strategy.percent_of_equity)
if close > open
    strategy.entry("L", strategy.long, limit = low)
    strategy.exit("X", "L", stop = low * 0.9)
if close < open
    strategy.close_all()
plot(strategy.position_size)
`);
    expect(r.kind).toBe('strategy');
    expect(r.source).toContain('$entry(ctx, S, "L", "long", ctx.input("order_qty"), ctx.bar.low, null, true);');
    expect(r.source).toContain('ctx.exit("X", $clean({ fromEntry: "L", stop: (ctx.bar.low * 0.9) }));');
    expect(r.source).toContain('$close(ctx, S, null, ctx.input("order_qty"));');
    expect(r.source).toContain("order_qty: { type: 'float', default: 2,");
    expect(r.report.notes.some(note => /percent_of_equity/.test(note))).toBe(true);
  });
  it('is original code: no PineTS dependency and no the reference app script fixtures', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(name => /pinets/i.test(name))).toBe(false);
    for (const file of ['index.ts', 'lexer.ts', 'parser.ts', 'translate.ts', 'tables.ts', 'helpers.ts']) expect(readFileSync('src/domain/pine-import/' + file, 'utf8')).not.toMatch(/from ['"](pinets|@?tradingview)/i);
  });
});
