'use strict';
const { newQuickJSWASMModuleFromVariant, DefaultIntrinsics } = require('quickjs-emscripten-core');
const variant = require('@jitl/quickjs-wasmfile-release-sync').default;
const { createHash } = require('node:crypto');
const { BoundaryError, exactKeys, jsonData } = require('./validation.cjs');
// History, the ctx.ta library and visual outputs (guest-side source, spliced into the bootstrap).
const { PRELUDE: TA_PRELUDE, RUNNER: TA_RUNNER, VISUAL_LIMITS } = require('./script-ta.cjs');
// Barcolor, drawing objects (label, line, box, table) and ctx.log (guest-side source, spliced after the TA runner).
const { RUNNER: OBJECT_RUNNER, OBJECT_LIMITS } = require('./script-objects.cjs');
const LIMITS = Object.freeze({ sourceBytes:65536, bars:5000, memoryBytes:16*1024*1024, stackBytes:256*1024, outputBytes:512*1024, computeMilliseconds:1000, inputs:32, requests:4, conditions:32 });
// Input and request names are plain identifiers. Names that start with two underscores are
// refused, so no name can address a prototype slot in any engine or renderer map.
const NAME = /^(?!__)[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function inputValues(raw) {
  if (raw === undefined || raw === null) return null;
  if (!plainObject(raw)) throw new BoundaryError('INVALID_ARGUMENT','Script inputs must be a plain object.');
  const names = Object.keys(raw);
  if (names.length > LIMITS.inputs) throw new BoundaryError('INVALID_ARGUMENT','Script input limit is 32 values.');
  const values = {};
  for (const name of names) {
    const value = raw[name];
    if (!NAME.test(name) || !(typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 200)) throw new BoundaryError('INVALID_ARGUMENT','Invalid script input value.');
    values[name] = value;
  }
  return values;
}
// Requested series arrive already aligned by the renderer: one row (or null) per supplied script bar.
// The host checks shape and bounds only; alignment without lookahead is the renderer's documented contract.
function requestRows(raw, barCount) {
  if (raw === undefined || raw === null) return null;
  if (!plainObject(raw)) throw new BoundaryError('INVALID_ARGUMENT','Script requests must be a plain object.');
  const names = Object.keys(raw);
  if (names.length > LIMITS.requests) throw new BoundaryError('INVALID_ARGUMENT','Script request limit is 4 other-series requests.');
  const requests = {};
  for (const name of names) {
    const rows = raw[name];
    if (!NAME.test(name) || !Array.isArray(rows) || rows.length !== barCount) throw new BoundaryError('INVALID_ARGUMENT','Requested series must align one row per script bar.');
    let previous = -Infinity;
    requests[name] = rows.map(row => {
      if (row === null) return null;
      exactKeys(row, ['time','open','high','low','close','volume']);
      const prices = [row.time,row.open,row.high,row.low,row.close];
      if (!prices.every(Number.isFinite) || !(row.volume === null || Number.isFinite(row.volume) && row.volume >= 0) || row.high < Math.max(row.open,row.close,row.low) || row.low > Math.min(row.open,row.close,row.high) || row.time < previous) throw new BoundaryError('INVALID_ARGUMENT','Invalid requested bar.');
      previous = row.time;
      return { time:row.time, open:row.open, high:row.high, low:row.low, close:row.close, volume:row.volume };
    });
  }
  return requests;
}
// Named higher-timeframe and other-symbol series. The renderer supplies
// each as completed rows (oldest first) plus `visible`, one count per script bar: how many leading rows are complete
// by the end of that bar. The guest can read only rows below that count, so a row never reaches a bar before it ended.
// Separate from LIMITS so the existing pinned resource caps stay unchanged.
const SERIES_LIMITS = Object.freeze({ timeframes:4, symbols:4, rows:5500, totalRows:20000, depth:500 });
function seriesFeeds(raw, bars, kind, budget) {
  if (raw === undefined || raw === null) return null;
  const what = kind === 'timeframes' ? 'timeframe' : 'symbol';
  const fail = message => { throw new BoundaryError('INVALID_ARGUMENT', message || 'Invalid script '+what+' series.'); };
  if (!plainObject(raw)) fail('Script '+what+' series must be a plain object.');
  const names = Object.keys(raw);
  if (names.length > SERIES_LIMITS[kind]) fail('Script '+what+' series limit is '+SERIES_LIMITS[kind]+'.');
  const feeds = {};
  for (const name of names) {
    const entry = raw[name];
    if (!NAME.test(name) || !plainObject(entry)) fail();
    try { exactKeys(entry, ['rows','visible']); } catch { fail(); }
    if (!Array.isArray(entry.rows) || entry.rows.length > SERIES_LIMITS.rows || !Array.isArray(entry.visible) || entry.visible.length !== bars.length) fail('Script '+what+' series must hold at most '+SERIES_LIMITS.rows+' rows and one visible count per script bar.');
    budget.rows += entry.rows.length;
    if (budget.rows > SERIES_LIMITS.totalRows) fail('Script timeframe and symbol series exceed '+SERIES_LIMITS.totalRows+' rows in total.');
    let previousTime = -Infinity, previousEnd = -Infinity;
    const rows = entry.rows.map(row => {
      if (!plainObject(row)) fail();
      try { exactKeys(row, ['time','open','high','low','close','volume','end']); } catch { fail(); }
      if (![row.time,row.open,row.high,row.low,row.close,row.end].every(Number.isFinite) || !(row.volume === null || Number.isFinite(row.volume) && row.volume >= 0) || row.high < Math.max(row.open,row.close,row.low) || row.low > Math.min(row.open,row.close,row.high) || !(row.time > previousTime) || !(row.end > row.time) || row.end < previousEnd) fail('Invalid '+what+' series row.');
      previousTime = row.time; previousEnd = row.end;
      return { time:row.time, open:row.open, high:row.high, low:row.low, close:row.close, volume:row.volume, end:row.end };
    });
    let previous = 0;
    const visible = entry.visible.map((count, index) => {
      if (!Number.isSafeInteger(count) || count < previous || count > rows.length) fail('Invalid '+what+' visible counts.');
      // Defence in depth for the renderer's no-lookahead contract: a visible row cannot start after this bar and
      // cannot end after the next bar begins.
      if (count > 0 && (rows[count-1].time > bars[index].time || index + 1 < bars.length && rows[count-1].end > bars[index+1].time)) fail('A '+what+' series row is visible before it completed.');
      previous = count; return count;
    });
    feeds[name] = { rows, visible };
  }
  return feeds;
}
// The Strategy tester's engine feed. `positions` has one row (or null) per supplied bar: the engine's
// actual position at that bar's close, before the bar's own new orders (ctx.strategy). `fills` lists the fills the
// engine recalculated on ("Recalculate after order is filled"), in bar and ordinal order; each calls onFill(ctx, fill)
// once. Plain data only, bounded by LIMITS.bars rows each; nothing here is executable or reaches the host back.
const FILL_KINDS=['order','exit','margin-call'],FILL_LEGS=['profit','loss','trail'];
function engineFeed(raw, barCount) {
  if (raw === undefined || raw === null) return null;
  const fail = () => { throw new BoundaryError('INVALID_ARGUMENT','Invalid strategy engine feed.'); };
  const keys = (row, names) => { if (!plainObject(row)) fail(); try { exactKeys(row, names); } catch { fail(); } };
  keys(raw, ['positions','fills']);
  if (!Array.isArray(raw.positions) || raw.positions.length !== barCount || !Array.isArray(raw.fills) || raw.fills.length > LIMITS.bars) fail();
  const held = row => {
    if (!Number.isFinite(row.position) || !(row.averagePrice === null || Number.isFinite(row.averagePrice) && row.averagePrice > 0) || !Number.isSafeInteger(row.openTrades) || row.openTrades < 0 || (row.position === 0) !== (row.averagePrice === null)) fail();
    return { position:row.position, averagePrice:row.averagePrice, openTrades:row.openTrades };
  };
  const positions = raw.positions.map(row => { if (row === null) return null; keys(row, ['position','averagePrice','openTrades']); return held(row); });
  let previous = -1;
  const fills = raw.fills.map(row => {
    keys(row, ['bar','ordinal','name','kind','leg','side','quantity','price','high','low','close','position','averagePrice','openTrades']);
    if (!Number.isSafeInteger(row.bar) || row.bar < 0 || row.bar >= barCount || !Number.isSafeInteger(row.ordinal) || row.ordinal < 0 || row.ordinal > 1000 || row.bar * 1001 + row.ordinal <= previous) fail();
    if (!(row.name === null || typeof row.name === 'string' && row.name.length >= 1 && row.name.length <= 64) || !FILL_KINDS.includes(row.kind) || !(row.leg === null || FILL_LEGS.includes(row.leg)) || !['buy','sell'].includes(row.side)) fail();
    if (![row.quantity,row.price,row.high,row.low,row.close].every(value => Number.isFinite(value) && value > 0) || row.high < row.close || row.low > row.close) fail();
    previous = row.bar * 1001 + row.ordinal;
    return { bar:row.bar, ordinal:row.ordinal, name:row.name, kind:row.kind, leg:row.leg, side:row.side, quantity:row.quantity, price:row.price, high:row.high, low:row.low, close:row.close, ...held(row) };
  });
  return { positions, fills };
}
// Declarations keep the existing wire shape. Recheck each default at the host boundary.
const SCRIPT_INPUT_TYPES=['int','float','bool','string','color','source','timeframe','symbol','session','time','price'];
const SCRIPT_PRICE_SOURCES=['open','high','low','close','hl2','hlc3','ohlc4','hlcc4'];
function validSessionText(value){
  if(typeof value!=='string'||value.length>200)return false;if(value==='24x7')return true;
  const parts=value.split(':');if(parts.length>2)return false;
  if(parts.length===2&&(!/^[1-7]{1,7}$/.test(parts[1])||new Set(parts[1]).size!==parts[1].length))return false;
  const ranges=parts[0].split(',');if(ranges.length<1||ranges.length>8)return false;
  return ranges.every(range=>{if(!/^[0-9]{4}-[0-9]{4}$/.test(range))return false;const start=Number(range.slice(0,4)),end=Number(range.slice(5));return start<2400&&start%100<60&&(end===2400||end<2400&&end%100<60);});
}
function scriptInputFits(spec,value){
  if(spec.type==='bool')return typeof value==='boolean';
  if(spec.type==='string')return typeof value==='string'&&value.length<=200&&(spec.options===null||spec.options.includes(value));
  if(spec.type==='color')return typeof value==='string'&&/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value);
  if(spec.type==='source')return SCRIPT_PRICE_SOURCES.includes(value)&&(spec.options===null||spec.options.includes(value));
  if(spec.type==='timeframe')return typeof value==='string'&&(value===''||/^[0-9a-zA-Z]{1,16}$/.test(value));
  if(spec.type==='symbol')return typeof value==='string'&&/^[A-Za-z0-9_.:^=\/!-]{1,40}$/.test(value);
  if(spec.type==='session')return validSessionText(value);
  if(!Number.isFinite(value)||((spec.type==='int'||spec.type==='time')&&!Number.isInteger(value))||spec.type==='time'&&(value<0||value>253402300799))return false;
  return (spec.min===null||value>=spec.min)&&(spec.max===null||value<=spec.max);
}
// The engine builds the catalog from its own checks; the host re-checks the shape before it leaves the main process.
function scriptCatalog(raw) {
  const fail = () => { throw new BoundaryError('INVALID_OUTPUT','Invalid script declaration catalog.'); };
  if (!plainObject(raw)) fail();
  // The engine always sends timeframes and symbols; an older catalog shape without them reads as none.
  exactKeys(raw, ['inputs','requests','conditions'], ['timeframes','symbols']);
  const declaredTimeframes = raw.timeframes === undefined ? [] : raw.timeframes, declaredSymbols = raw.symbols === undefined ? [] : raw.symbols;
  if (![raw.inputs,raw.requests,raw.conditions,declaredTimeframes,declaredSymbols].every(Array.isArray) || raw.inputs.length > LIMITS.inputs || raw.requests.length > LIMITS.requests || raw.conditions.length > LIMITS.conditions || declaredTimeframes.length > SERIES_LIMITS.timeframes || declaredSymbols.length > SERIES_LIMITS.symbols) fail();
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const number = value => value === null || Number.isFinite(value);
  const inputs = raw.inputs.map(row => {
    exactKeys(row, ['id','type','title','default','min','max','step','options']);
    if (!NAME.test(row.id) || !SCRIPT_INPUT_TYPES.includes(row.type) || !text(row.title,100) || ![row.min,row.max,row.step].every(number) || !(row.options === null || Array.isArray(row.options) && row.options.length <= 50 && row.options.every(option => text(option,200))) || !(typeof row.default === 'boolean' || Number.isFinite(row.default) || text(row.default,200))) fail();
    const numeric=['int','float','time','price'].includes(row.type),integer=row.type==='int'||row.type==='time';
    if(!numeric&&[row.min,row.max,row.step].some(value=>value!==null)||integer&&[row.min,row.max,row.step].some(value=>value!==null&&!Number.isInteger(value))||row.min!==null&&row.max!==null&&row.min>row.max||row.step!==null&&row.step<=0)fail();
    if(row.options!==null&&(!['string','source'].includes(row.type)||row.options.length===0||new Set(row.options).size!==row.options.length||row.type==='source'&&row.options.some(value=>!SCRIPT_PRICE_SOURCES.includes(value))))fail();
    if(!scriptInputFits(row,row.default))fail();
    return { id:row.id, type:row.type, title:row.title, default:row.default, min:row.min, max:row.max, step:row.step, options:row.options ? [...row.options] : null };
  });
  const requests = raw.requests.map(row => { exactKeys(row, ['id','symbol','interval']); if (!NAME.test(row.id) || !(row.symbol === null || text(row.symbol,40)) || !(row.interval === null || text(row.interval,16))) fail(); return { id:row.id, symbol:row.symbol, interval:row.interval }; });
  const conditions = raw.conditions.map(row => { exactKeys(row, ['name','message']); if (!text(row.name,128) || !row.name || !text(row.message,1000)) fail(); return { name:row.name, message:row.message }; });
  // Declared higher timeframes and other symbols (interval and symbol grammar as for requests).
  const timeframes = declaredTimeframes.map(row => { exactKeys(row, ['id','interval']); if (!NAME.test(row.id) || typeof row.interval !== 'string' || !/^[0-9A-Za-z]{1,16}$/.test(row.interval)) fail(); return { id:row.id, interval:row.interval }; });
  const symbols = declaredSymbols.map(row => { exactKeys(row, ['id','symbol']); if (!NAME.test(row.id) || typeof row.symbol !== 'string' || !/^[A-Za-z0-9_.:^=\/!-]{1,40}$/.test(row.symbol)) fail(); return { id:row.id, symbol:row.symbol }; });
  return { inputs, requests, conditions, timeframes, symbols };
}
// The host re-checks every visual row the engine produced before it leaves the main process.
// Host re-checks for the compact plot rows (the engine's own rules: #RRGGBB, 10,000 outputs).
const PLOT_COLOR=/^#[0-9A-Fa-f]{6}$/,OUTPUT_COUNT=10000;
const emptyVisuals=()=>({hlines:[],fills:[],backgrounds:[],markers:[]});
const HOST_PLOT_STYLES=['line','stepline','histogram','columns','circles','cross','area','areabr','linebr'];
const VISUAL_COLOR=/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const VISUAL_SHAPES=['none','circle','square','diamond','flag','arrowup','arrowdown','triangleup','triangledown','cross','xcross'];
/** Host re-check of the ctx.plot style options the engine normalised; null when invalid. */
function plotStyleOptions(raw){
  if(!plainObject(raw))return null;try{exactKeys(raw,['style','linewidth','offset','display']);}catch{return null;}
  const d=raw.display;if(!plainObject(d))return null;try{exactKeys(d,['pane','priceScale','legend','dataWindow']);}catch{return null;}
  if(!HOST_PLOT_STYLES.includes(raw.style)||!(raw.linewidth===null||Number.isInteger(raw.linewidth)&&raw.linewidth>=1&&raw.linewidth<=10)||!Number.isInteger(raw.offset)||Math.abs(raw.offset)>VISUAL_LIMITS.plotOffset||![d.pane,d.priceScale,d.legend,d.dataWindow].every(value=>typeof value==='boolean'))return null;
  return{style:raw.style,linewidth:raw.linewidth,offset:raw.offset,display:{pane:d.pane,priceScale:d.priceScale,legend:d.legend,dataWindow:d.dataWindow}};
}
/** Engine ordinals identify a consumed primary row; event-time equality alone never supplies one. */
function logicalEvent(row,input){return Number.isSafeInteger(row.n)&&row.n>=0&&row.n<input.bars.length&&Object.is(row.t,input.bars[row.n].time);}
function scriptVisuals(raw, input) {
  const logical=input?.chartPositionMode==='logical-v1';
  const fail = () => { throw new BoundaryError('INVALID_OUTPUT','Invalid script visual output.'); };
  if (!plainObject(raw)) fail();
  exactKeys(raw, ['hlines','fills','backgrounds','shapes']);
  if (![raw.hlines,raw.fills,raw.backgrounds,raw.shapes].every(Array.isArray) || raw.hlines.length > VISUAL_LIMITS.hlines || raw.fills.length > VISUAL_LIMITS.fills || raw.backgrounds.length > VISUAL_LIMITS.backgrounds || raw.shapes.length > VISUAL_LIMITS.shapes) fail();
  const title = value => typeof value === 'string' && value.length >= 1 && value.length <= 128;
  const color = value => typeof value === 'string' && VISUAL_COLOR.test(value);
  const hlines = raw.hlines.map(row => { exactKeys(row, ['title','price','color','lineStyle','width']); if (!title(row.title) || !Number.isFinite(row.price) || !color(row.color) || !['solid','dashed','dotted'].includes(row.lineStyle) || !Number.isInteger(row.width) || row.width < 1 || row.width > 4) fail(); return { title:row.title, price:row.price, color:row.color, lineStyle:row.lineStyle, width:row.width }; });
  // A fill may name two hlines (between) and carry per-bar colour rows (palette index, -1 unfilled).
  let fillColorRows = 0;
  const fills = raw.fills.map(row => { exactKeys(row, ['title','from','to','color'], ['between','colors']); if (!title(row.title) || !title(row.from) || !title(row.to) || row.from === row.to || !color(row.color) || row.between !== undefined && row.between !== 'hlines') fail();
    const out = { title:row.title, from:row.from, to:row.to, color:row.color };
    if (row.between === 'hlines') { if (!raw.hlines.some(line => line.title === row.from) || !raw.hlines.some(line => line.title === row.to)) fail(); out.between = 'hlines'; }
    if (row.colors !== undefined) {
      const c = row.colors; if (!plainObject(c)) fail(); exactKeys(c, ['palette','times','values'], logical ? ['indices'] : []);
      if (!Array.isArray(c.palette) || c.palette.length > VISUAL_LIMITS.plotPalette || !c.palette.every(color) || !Array.isArray(c.times) || !Array.isArray(c.values) || c.times.length < 1 || c.values.length !== c.times.length || logical && (!Array.isArray(c.indices) || c.indices.length !== c.times.length)) fail();
      fillColorRows += c.times.length; if (fillColorRows > VISUAL_LIMITS.fillColors) fail();
      let before = -Infinity;
      for (let i = 0; i < c.times.length; i++) { const at = logical ? c.indices[i] : c.times[i]; if (!Number.isFinite(c.times[i]) || !Number.isSafeInteger(c.values[i]) || c.values[i] < -1 || c.values[i] >= c.palette.length || at <= before || logical && !logicalEvent({ t:c.times[i], n:at }, input)) fail(); before = at; }
      out.colors = logical ? { palette:[...c.palette], times:[...c.times], indices:[...c.indices], values:[...c.values] } : { palette:[...c.palette], times:[...c.times], values:[...c.values] };
    }
    return out; });
  let previous = -Infinity;
  const backgrounds = raw.backgrounds.map(row => { exactKeys(row, ['t','color'],logical?['n']:[]); const at=logical?row.n:row.t;if (!Number.isFinite(row.t) || at <= previous || !color(row.color) || logical&&!logicalEvent(row,input)) fail(); previous = at; return { time:row.t, color:row.color,...(logical?{index:row.n}:{}) }; });
  previous = -Infinity;
  const markers = raw.shapes.map(row => { exactKeys(row, ['title','t','shape','location','color','text','size'],logical?['n']:[]); const at=logical?row.n:row.t;if (!title(row.title) || !Number.isFinite(row.t) || at < previous || logical&&!logicalEvent(row,input) || !VISUAL_SHAPES.includes(row.shape) || !['abovebar','belowbar','top','bottom'].includes(row.location) || !color(row.color) || typeof row.text !== 'string' || row.text.length > 40 || !['tiny','small','normal','large','huge'].includes(row.size)) fail(); previous = at; return { title:row.title, time:row.t,...(logical?{index:row.n}:{}), shape:row.shape, location:row.location, color:row.color, text:row.text, size:row.size }; });
  return { hlines, fills, backgrounds, markers };
}
// The host re-checks every bar color, drawing object and log row the engine produced, row by row.
const emptyObjects=()=>({base:null,barcolors:[],labels:[],lines:[],boxes:[],tables:[],linefills:[],polylines:[]});
const emptyLogs=()=>({entries:[],dropped:0});
const OBJ_ENUMS=Object.freeze({xloc:['index','time'],yloc:['price','abovebar','belowbar'],extend:['none','left','right','both'],size:['auto','tiny','small','normal','large','huge'],hAlign:['left','center','right'],vAlign:['top','center','bottom'],
  labelStyle:['label_up','label_down','label_left','label_right','label_center','label_lower_left','label_lower_right','label_upper_left','label_upper_right','circle','square','diamond','flag','arrowup','arrowdown','triangleup','triangledown','cross','xcross','text_outline','none'],
  lineStyle:['solid','dashed','dotted','arrowleft','arrowright','arrowboth'],borderStyle:['solid','dashed','dotted'],position:['top_left','top_center','top_right','middle_left','middle_center','middle_right','bottom_left','bottom_center','bottom_right']});
function scriptObjects(raw, input) {
  const logical=input?.chartPositionMode==='logical-v1';
  const fail = () => { throw new BoundaryError('INVALID_OUTPUT','Invalid script drawing object output.'); };
  if (!plainObject(raw)) fail();
  try { exactKeys(raw, ['base','barcolors','labels','lines','boxes','tables','linefills','polylines']); } catch { fail(); }
  const max=OBJECT_LIMITS.maxBudget;
  if (![raw.barcolors,raw.labels,raw.lines,raw.boxes,raw.tables].every(Array.isArray) || raw.barcolors.length > OBJECT_LIMITS.barcolors || raw.labels.length > max || raw.lines.length > max || raw.boxes.length > max || raw.tables.length > OBJECT_LIMITS.tables) fail();
  const keys = (row, names) => { if (!plainObject(row)) fail(); try { exactKeys(row, names); } catch { fail(); } };
  const color = value => typeof value === 'string' && VISUAL_COLOR.test(value);
  const colorOrNull = value => value === null || color(value);
  const text = value => typeof value === 'string' && value.length <= OBJECT_LIMITS.text;
  const id = value => Number.isSafeInteger(value) && value >= 0;
  const oneOf = (value, list) => typeof value === 'string' && list.includes(value);
  const int = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const x = (value, xloc) => xloc === 'index' ? Number.isSafeInteger(value) && value >= 0 : Number.isFinite(value);
  let base = null;
  if (raw.base !== null) { keys(raw.base, ['index','time']); if (!Number.isSafeInteger(raw.base.index) || raw.base.index < 0 || !Number.isFinite(raw.base.time)) fail(); base = { index:raw.base.index, time:raw.base.time }; }
  let previous = -Infinity;
  const barcolors = raw.barcolors.map(row => { keys(row,logical?['t','color','n']:['t','color']);const at=logical?row.n:row.t;if (!Number.isFinite(row.t) || at <= previous || !color(row.color) || logical&&!logicalEvent(row,input)) fail(); previous = at; return { time:row.t, color:row.color,...(logical?{index:row.n}:{}) }; });
  const ids = new Set(), unique = value => { if (!id(value) || ids.has(value)) fail(); ids.add(value); return value; };
  const labels = raw.labels.map(row => { keys(row, ['id','xloc','x','y','yloc','text','style','color','textColor','size','textAlign','tooltip']);
    if (!oneOf(row.xloc, OBJ_ENUMS.xloc) || !x(row.x, row.xloc) || !Number.isFinite(row.y) || !oneOf(row.yloc, OBJ_ENUMS.yloc) || !text(row.text) || !oneOf(row.style, OBJ_ENUMS.labelStyle) || !colorOrNull(row.color) || !colorOrNull(row.textColor) || !oneOf(row.size, OBJ_ENUMS.size) || !oneOf(row.textAlign, OBJ_ENUMS.hAlign) || !text(row.tooltip)) fail();
    return { id:unique(row.id), xloc:row.xloc, x:row.x, y:row.y, yloc:row.yloc, text:row.text, style:row.style, color:row.color, textColor:row.textColor, size:row.size, textAlign:row.textAlign, tooltip:row.tooltip }; });
  const lines = raw.lines.map(row => { keys(row, ['id','xloc','x1','y1','x2','y2','extend','color','style','width']);
    if (!oneOf(row.xloc, OBJ_ENUMS.xloc) || !x(row.x1, row.xloc) || !x(row.x2, row.xloc) || !Number.isFinite(row.y1) || !Number.isFinite(row.y2) || !oneOf(row.extend, OBJ_ENUMS.extend) || !colorOrNull(row.color) || !oneOf(row.style, OBJ_ENUMS.lineStyle) || !int(row.width, 1, 10)) fail();
    return { id:unique(row.id), xloc:row.xloc, x1:row.x1, y1:row.y1, x2:row.x2, y2:row.y2, extend:row.extend, color:row.color, style:row.style, width:row.width }; });
  const boxes = raw.boxes.map(row => { keys(row, ['id','xloc','left','top','right','bottom','extend','borderColor','borderWidth','borderStyle','bgColor','text','textColor','textSize','hAlign','vAlign']);
    if (!oneOf(row.xloc, OBJ_ENUMS.xloc) || !x(row.left, row.xloc) || !x(row.right, row.xloc) || !Number.isFinite(row.top) || !Number.isFinite(row.bottom) || !oneOf(row.extend, OBJ_ENUMS.extend) || !colorOrNull(row.borderColor) || !int(row.borderWidth, 0, 10) || !oneOf(row.borderStyle, OBJ_ENUMS.borderStyle) || !colorOrNull(row.bgColor) || !text(row.text) || !colorOrNull(row.textColor) || !oneOf(row.textSize, OBJ_ENUMS.size) || !oneOf(row.hAlign, OBJ_ENUMS.hAlign) || !oneOf(row.vAlign, OBJ_ENUMS.vAlign)) fail();
    return { id:unique(row.id), xloc:row.xloc, left:row.left, top:row.top, right:row.right, bottom:row.bottom, extend:row.extend, borderColor:row.borderColor, borderWidth:row.borderWidth, borderStyle:row.borderStyle, bgColor:row.bgColor, text:row.text, textColor:row.textColor, textSize:row.textSize, hAlign:row.hAlign, vAlign:row.vAlign }; });
  let cellCount = 0;
  const tables = raw.tables.map(row => { keys(row, ['id','position','columns','rows','bgColor','frameColor','frameWidth','borderColor','borderWidth','cells']);
    if (!oneOf(row.position, OBJ_ENUMS.position) || !int(row.columns, 1, OBJECT_LIMITS.tableColumns) || !int(row.rows, 1, OBJECT_LIMITS.tableRows) || !colorOrNull(row.bgColor) || !colorOrNull(row.frameColor) || !int(row.frameWidth, 0, 10) || !colorOrNull(row.borderColor) || !int(row.borderWidth, 0, 10) || !Array.isArray(row.cells)) fail();
    cellCount += row.cells.length; if (cellCount > OBJECT_LIMITS.tableCells) fail();
    const seen = new Set();
    const cells = row.cells.map(cell => { keys(cell, ['column','row','text','textColor','bgColor','hAlign','vAlign','textSize','tooltip']);
      if (!int(cell.column, 0, row.columns - 1) || !int(cell.row, 0, row.rows - 1) || seen.has(cell.row * row.columns + cell.column) || !text(cell.text) || !colorOrNull(cell.textColor) || !colorOrNull(cell.bgColor) || !oneOf(cell.hAlign, OBJ_ENUMS.hAlign) || !oneOf(cell.vAlign, OBJ_ENUMS.vAlign) || !oneOf(cell.textSize, OBJ_ENUMS.size) || !text(cell.tooltip)) fail();
      seen.add(cell.row * row.columns + cell.column);
      return { column:cell.column, row:cell.row, text:cell.text, textColor:cell.textColor, bgColor:cell.bgColor, hAlign:cell.hAlign, vAlign:cell.vAlign, textSize:cell.textSize, tooltip:cell.tooltip }; });
    return { id:unique(row.id), position:row.position, columns:row.columns, rows:row.rows, bgColor:row.bgColor, frameColor:row.frameColor, frameWidth:row.frameWidth, borderColor:row.borderColor, borderWidth:row.borderWidth, cells }; });
  // Linefills name two lines of this output; polylines carry their own bounded points.
  if (!Array.isArray(raw.linefills) || raw.linefills.length > max || !Array.isArray(raw.polylines) || raw.polylines.length > OBJECT_LIMITS.polylineMax) fail();
  const lineIds = new Set(lines.map(row => row.id));
  const linefills = raw.linefills.map(row => { keys(row, ['id','line1','line2','color']); if (!lineIds.has(row.line1) || !lineIds.has(row.line2) || row.line1 === row.line2 || !colorOrNull(row.color)) fail(); return { id:unique(row.id), line1:row.line1, line2:row.line2, color:row.color }; });
  let pointCount = 0;
  const polylines = raw.polylines.map(row => { keys(row, ['id','xloc','curved','closed','lineColor','fillColor','lineWidth','lineStyle','points']);
    if (!oneOf(row.xloc, OBJ_ENUMS.xloc) || typeof row.curved !== 'boolean' || typeof row.closed !== 'boolean' || !colorOrNull(row.lineColor) || !colorOrNull(row.fillColor) || !int(row.lineWidth, 1, 10) || !oneOf(row.lineStyle, OBJ_ENUMS.lineStyle) || !Array.isArray(row.points) || row.points.length < 2 || row.points.length > OBJECT_LIMITS.polylinePoints) fail();
    pointCount += row.points.length; if (pointCount > OBJECT_LIMITS.polylinePointTotal) fail();
    const points = row.points.map(point => { keys(point, ['x','y']); if (!x(point.x, row.xloc) || !Number.isFinite(point.y)) fail(); return { x:point.x, y:point.y }; });
    return { id:unique(row.id), xloc:row.xloc, curved:row.curved, closed:row.closed, lineColor:row.lineColor, fillColor:row.fillColor, lineWidth:row.lineWidth, lineStyle:row.lineStyle, points }; });
  if ((labels.length || lines.length || boxes.length || tables.length || polylines.length) && base === null) fail();
  return { base, barcolors, labels, lines, boxes, tables, linefills, polylines };
}
function scriptLogs(raw) {
  const fail = () => { throw new BoundaryError('INVALID_OUTPUT','Invalid script log output.'); };
  if (!plainObject(raw)) fail();
  try { exactKeys(raw, ['entries','dropped']); } catch { fail(); }
  if (!Array.isArray(raw.entries) || raw.entries.length > OBJECT_LIMITS.logs || !Number.isSafeInteger(raw.dropped) || raw.dropped < 0) fail();
  let previous = -Infinity;
  const entries = raw.entries.map(row => { if (!plainObject(row)) fail(); try { exactKeys(row, ['t','n','level','message']); } catch { fail(); }
    if (!Number.isFinite(row.t) || row.t < previous || !Number.isSafeInteger(row.n) || row.n < 0 || !['info','warn','error'].includes(row.level) || typeof row.message !== 'string' || row.message.length > OBJECT_LIMITS.logText) fail();
    previous = row.t; return { time:row.t, index:row.n, level:row.level, message:row.message }; });
  return { entries, dropped:raw.dropped };
}
function inputForScript(input) {
  exactKeys(input, ['requestId','source','bars'], ['snapshot','provisional','provenance','inputs','requests','timeframes','symbols','engine','chartPositionMode']);
  const logical = input.chartPositionMode === 'logical-v1';
  if (input.chartPositionMode !== undefined && !logical) throw new BoundaryError('INVALID_ARGUMENT','Invalid chart position mode.');
  if (logical && (input.snapshot != null || input.provisional === true)) throw new BoundaryError('INVALID_ARGUMENT','Logical chart positions require a fresh confirmed input.');
  if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.requestId)) throw new BoundaryError('INVALID_ARGUMENT','Invalid script request identifier.');
  if (typeof input.source !== 'string' || Buffer.byteLength(input.source) > LIMITS.sourceBytes) throw new BoundaryError('INVALID_ARGUMENT','Script source limit is 64 KiB.');
  // Conservative LVScript v1 restriction, intentionally rejects these tokens even in comments/strings.
  if (/\b(async|await|import|export|Promise)\b/.test(input.source)) throw new BoundaryError('UNSUPPORTED_SYNTAX','CandleScript v1 supports synchronous object definitions only.');
  if (!Array.isArray(input.bars) || input.bars.length > LIMITS.bars) throw new BoundaryError('INVALID_ARGUMENT','Script bar limit is 5000 per request.');
  const bars = input.bars.map(bar => {
    exactKeys(bar,['id','revision','time','open','high','low','close','volume']);
    if (typeof bar.id !== 'string' || bar.id.length < 1 || bar.id.length > 128 || !Number.isSafeInteger(bar.revision) || bar.revision < 0 || ![bar.time,bar.open,bar.high,bar.low,bar.close].every(Number.isFinite) || !(Number.isFinite(bar.volume) && bar.volume >= 0 || logical && bar.volume === null) || bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close,bar.high)) throw new BoundaryError('INVALID_ARGUMENT','Invalid script bar.');
    return {...bar};
  });
  if(new Set(bars.map(bar=>bar.id)).size!==bars.length)throw new BoundaryError('INVALID_ARGUMENT','Script source bar identities must be unique per request.');
  if (input.provisional !== undefined && typeof input.provisional !== 'boolean') throw new BoundaryError('INVALID_ARGUMENT','Invalid provisional flag.');
  const provenance = input.provenance || {kind:'synthetic',label:'Synthetic script fixture'};
  exactKeys(provenance,['kind','label']);
  if (!['synthetic','local-import'].includes(provenance.kind) || typeof provenance.label !== 'string' || !provenance.label) throw new BoundaryError('INVALID_ARGUMENT','Explicit synthetic or local-import provenance required.');
  if (Buffer.byteLength(provenance.label,'utf8') > LIMITS.outputBytes) throw new BoundaryError('INVALID_ARGUMENT','Script provenance label exceeds 512 KiB.');
  const scriptHash=createHash('sha256').update(input.source).digest('hex');
  let snapshot=null;
  if (input.snapshot != null) {
    snapshot=jsonData(input.snapshot);
    exactKeys(snapshot,['schemaVersion','scriptHash','initialized','state','ta','rng','processedCount','processedEvent','processedIds','plots','drawings','alerts','alertDedupe','brokerSequence']);
    if (snapshot.schemaVersion!==1 || snapshot.scriptHash!==scriptHash || snapshot.initialized!==true || !Number.isSafeInteger(snapshot.rng) || !Number.isSafeInteger(snapshot.processedCount) || snapshot.processedCount<0 || !Number.isSafeInteger(snapshot.brokerSequence) || snapshot.brokerSequence<0 || !Array.isArray(snapshot.processedIds) || snapshot.processedIds.length!==snapshot.processedCount || new Set(snapshot.processedIds).size!==snapshot.processedIds.length || !snapshot.processedIds.every(id=>typeof id==='string') || !Array.isArray(snapshot.plots) || !Array.isArray(snapshot.drawings) || !Array.isArray(snapshot.alerts) || !Array.isArray(snapshot.alertDedupe)) throw new BoundaryError('INVALID_SNAPSHOT','Snapshot identity or structure is invalid.');
    if(!snapshot.ta||Array.isArray(snapshot.ta)||typeof snapshot.ta!=='object'||snapshot.rng<0||snapshot.rng>4294967295)throw new BoundaryError('INVALID_SNAPSHOT','Invalid TA or RNG snapshot.');
    for(const accumulator of Object.values(snapshot.ta)){exactKeys(accumulator,['length','values','sum']);if(!Number.isSafeInteger(accumulator.length)||accumulator.length<1||accumulator.length>5000||!Array.isArray(accumulator.values)||accumulator.values.length>accumulator.length||!accumulator.values.every(Number.isFinite)||!Number.isFinite(accumulator.sum))throw new BoundaryError('INVALID_SNAPSHOT','Invalid keyed TA accumulator.');}
  }
  const inputs=inputValues(input.inputs),requests=requestRows(input.requests,bars.length),engine=engineFeed(input.engine,bars.length);
  const seriesBudget={rows:0},timeframes=seriesFeeds(input.timeframes,bars,'timeframes',seriesBudget),symbols=seriesFeeds(input.symbols,bars,'symbols',seriesBudget);
  return {requestId:input.requestId,source:input.source,bars,snapshot,provisional:input.provisional===true,provenance,scriptHash,inputs,requests,timeframes,symbols,engine,...(logical?{chartPositionMode:'logical-v1'}:{})};
}
// Script isolation: every QuickJS compile path (host evalCode, guest eval, Function and
// its generator/async variants) goes through one per-context pointer, which is all the Eval intrinsic installs.
// The host compiles trusted and guest code first, then clears that pointer before any guest code runs, so the
// guest realm executes with no compiler at all. The slot is found by diffing contexts built with and without
// Eval in a throwaway runtime, and every job proves the clear through a compile the engine itself refuses.
const GUEST_INTRINSICS=Object.freeze({...DefaultIntrinsics,Date:false,Promise:false,Proxy:false});
let compilerSlot=null;
const isolationFailure=()=>new BoundaryError('ISOLATION_FAILED','Script isolation could not be established.');
// Re-acquired on every access: WASM memory growth replaces the buffer.
const heapView=quickJS=>new DataView(quickJS.module.HEAPU8.buffer);
function compileRefused(context){
  const probe=context.evalCode('0','lvscript-isolation.js',{type:'global'});
  if(!probe.error){probe.value.dispose();return false;}
  let detail;try{detail=context.dump(probe.error);}finally{probe.error.dispose();}
  return detail?.message==='eval is not supported';
}
function locateCompilerSlot(quickJS){
  if(compilerSlot)return compilerSlot;
  const runtime=quickJS.newRuntime(),contexts=[];
  try{
    const a=runtime.newContext({intrinsics:GUEST_INTRINSICS}),b=runtime.newContext({intrinsics:GUEST_INTRINSICS}),none=runtime.newContext({intrinsics:{...GUEST_INTRINSICS,Eval:false}});
    contexts.push(a,b,none);
    const word=(context,offset)=>heapView(quickJS).getUint32(context.ctx.value+offset,true);
    // A slot that is the same nonzero function index with Eval and zero without it; the first one whose
    // clearing makes the engine refuse compilation (and leaves the twin context compiling) is the pointer.
    for(let offset=0;offset<1024;offset+=4){
      const value=word(a,offset);if(value===0||value!==word(b,offset)||word(none,offset)!==0)continue;
      heapView(quickJS).setUint32(a.ctx.value+offset,0,true);
      if(compileRefused(a)&&!compileRefused(b))return compilerSlot=Object.freeze({offset,value});
      heapView(quickJS).setUint32(a.ctx.value+offset,value,true);
    }
    throw isolationFailure();
  } finally {
    try {for(const context of contexts)context.dispose();} finally {runtime.dispose();}
  }
}
function disableGuestCompiler(quickJS,context){
  const slot=locateCompilerSlot(quickJS),at=context.ctx.value+slot.offset;
  if(heapView(quickJS).getUint32(at,true)!==slot.value)throw isolationFailure();
  heapView(quickJS).setUint32(at,0,true);
  if(!compileRefused(context))throw isolationFailure();
}
async function executeSnapshot(raw) {
  const started=performance.now();
  const input=inputForScript(raw);
  // A fresh WASM module and runtime for every job: no untrusted instance shares a runtime/heap.
  const quickJS=await newQuickJSWASMModuleFromVariant(variant);
  const runtime=quickJS.newRuntime();
  runtime.setMemoryLimit(LIMITS.memoryBytes); runtime.setMaxStackSize(LIMITS.stackBytes);
  const deadline=Date.now()+LIMITS.computeMilliseconds;
  runtime.setInterruptHandler(()=>Date.now()>deadline);
  runtime.setModuleLoader(()=>{throw new Error('Module loading is prohibited.');});
  // Eval is installed only so the host can compile; disableGuestCompiler clears it before guest code runs.
  const context=runtime.newContext({intrinsics:GUEST_INTRINSICS});
  const serialized=JSON.stringify({bars:input.bars,snapshot:input.snapshot,scriptHash:input.scriptHash,inputs:input.inputs,requests:input.requests,timeframes:input.timeframes,symbols:input.symbols,engine:input.engine,...(input.chartPositionMode?{chartPositionMode:input.chartPositionMode}:{})});
  const lockdown=`(()=>{'use strict';
    for(const prototype of [Object.getPrototypeOf(function(){}),Object.getPrototypeOf(function*(){})])Object.defineProperty(prototype,'constructor',{value:undefined,writable:false,configurable:false});
    for(const name of ['eval','Function'])Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false});
    Object.freeze(Object.prototype);Object.freeze(Array.prototype);Object.freeze(JSON);
    Object.defineProperty(Math,'random',{value:()=>{throw Error('Use ctx.random() for deterministic randomness.');},writable:false,configurable:false});
  })()`;
  // Construct the private runner before compiling guest code. Capturing a JSON
  // object is insufficient: the guest may replace globals or mutable providers.
  // The bootstrap evaluates to prepare(text). The host calls it with the input JSON as a string
  // value (no longer spliced into the source as a literal), still before any guest code is compiled; it captures,
  // parses and returns the private runner exactly as the bootstrap did.
  const bootstrap=`(text=>{'use strict';
    const parse=JSON.parse,stringify=JSON.stringify,freeze=Object.freeze,keys=Object.keys,defineProperty=Object.defineProperty;
    const getPrototypeOf=Object.getPrototypeOf,getDescriptor=Object.getOwnPropertyDescriptor,plainPrototype=Object.prototype;
    const isArray=Array.isArray,isFinite=Number.isFinite,isInteger=Number.isInteger,toNumber=Number,toString=String;
    const Failure=Error,apply=Reflect.apply,charCodeAt=String.prototype.charCodeAt;
    const ancestors=new Set(),setHas=Set.prototype.has,setAdd=Set.prototype.add,setDelete=Set.prototype.delete;
    // Processed bar IDs and alert dedupe keys are also kept in private Sets, made here before any
    // guest code exists and used only through the captured Set methods. The snapshot arrays are kept as before.
    const seenIds=new Set(),dedupeKeys=new Set();
    ${TA_PRELUDE}
    const input=parse(text);
    const append=(array,value)=>{array[array.length]=value;};
    const contains=(array,value)=>{for(let i=0;i<array.length;i++)if(array[i]===value)return true;return false;};
    const join=(array,extra)=>{for(let i=0;i<extra.length;i++)append(array,extra[i]);return array;};
    const hexColor=value=>{if(typeof value!=='string'||value.length!==7||apply(charCodeAt,value,[0])!==35)return false;for(let i=1;i<7;i++){const c=apply(charCodeAt,value,[i]);if(!((c>=48&&c<=57)||(c>=65&&c<=70)||(c>=97&&c<=102)))return false;}return true;};
    // Script declarations. Engine checks use captured primitives and index loops only: guest code may
    // replace RegExp, String and iterator prototypes before the runner starts, so none of those are used here.
    const nameChar=(c,first)=>(c>=65&&c<=90)||(c>=97&&c<=122)||c===95||(!first&&c>=48&&c<=57);
    const identifier=value=>{if(typeof value!=='string'||value.length<1||value.length>64)return false;if(value.length>1&&apply(charCodeAt,value,[0])===95&&apply(charCodeAt,value,[1])===95)return false;for(let i=0;i<value.length;i++)if(!nameChar(apply(charCodeAt,value,[i]),i===0))return false;return true;};
    const symbolText=value=>{if(typeof value!=='string'||value.length<1||value.length>40)return false;for(let i=0;i<value.length;i++){const c=apply(charCodeAt,value,[i]);if(!(nameChar(c,false)||c===46||c===45||c===58||c===94||c===61||c===47||c===33))return false;}return true;};
    const intervalText=value=>{if(typeof value!=='string'||value.length<1||value.length>16)return false;for(let i=0;i<value.length;i++){const c=apply(charCodeAt,value,[i]);if(!((c>=48&&c<=57)||(c>=65&&c<=90)||(c>=97&&c<=122)))return false;}return true;};
    const field=(object,key,label)=>{const descriptor=getDescriptor(object,key);if(!descriptor)return undefined;if(!('value' in descriptor))throw Failure(label+' must be a plain data property.');return descriptor.value;};
    const record=(value,label)=>{if(value===null||typeof value!=='object'||isArray(value))throw Failure(label+' must be an object.');return value;};
    const onlyKeys=(object,allowed,label)=>{const names=keys(object);for(let i=0;i<names.length;i++)if(!contains(allowed,names[i]))throw Failure(label+' has an unsupported field.');};
    // Input grammar uses captured character access, never guest prototypes or regular expressions.
    const colorText=value=>{if(typeof value!=='string'||(value.length!==7&&value.length!==9)||apply(charCodeAt,value,[0])!==35)return false;for(let i=1;i<value.length;i++){const c=apply(charCodeAt,value,[i]);if(!((c>=48&&c<=57)||(c>=65&&c<=70)||(c>=97&&c<=102)))return false;}return true;};
    const sessionText=value=>{if(typeof value!=='string'||value.length<1||value.length>200)return false;if(value==='24x7')return true;let at=0,ranges=0;const code=i=>apply(charCodeAt,value,[i]);const clock=()=>{if(at+4>value.length)return -1;let n=0;for(let i=0;i<4;i++){const c=code(at++);if(c<48||c>57)return -1;n=n*10+c-48;}return n;};while(at<value.length){if(++ranges>8)return false;const start=clock();if(start<0||start>=2400||start%100>=60||code(at++)!==45)return false;const end=clock();if(end<0||end>2400||end%100>=60)return false;if(at===value.length)return true;const c=code(at++);if(c===44){if(at===value.length)return false;continue;}if(c!==58)return false;let mask=0,count=0;while(at<value.length){const d=code(at++)-49;if(d<0||d>6||mask&(1<<d))return false;mask|=1<<d;count++;}return count>0;}return false;};
    const INPUT_TYPES=['int','float','bool','string','color','source','timeframe','symbol','session','time','price'];
    // Virtual order options, exits and cancels. Every value is read through its own data descriptor and
    // copied into a fresh plain record; names are 1 to 64 characters. The host and the report re-check each shape.
    const ORDER_TYPES=['market','limit','stop','stop-limit'],OCA_TYPES=['cancel','reduce','none'];
    const orderName=value=>typeof value==='string'&&value.length>=1&&value.length<=64;
    const optionValue=(spec,key,label,test,message)=>{const value=field(spec,key,label);if(value===undefined)return undefined;if(!test(value))throw Failure(label+' '+key+' '+message);return value;};
    const positiveNumber=value=>isFinite(value)&&value>0;
    const orderOptions=raw=>{
      if(raw===undefined)return null;const label='Order options',spec=record(raw,label);onlyKeys(spec,['id','type','limit','stop','ocaName','ocaType','entry','close'],label);const out={};
      const id=optionValue(spec,'id',label,orderName,'must be text of 1 to 64 characters.');if(id!==undefined)out.id=id;
      const type=optionValue(spec,'type',label,value=>contains(ORDER_TYPES,value),'must be market, limit, stop or stop-limit.');if(type!==undefined)out.type=type;
      const limit=optionValue(spec,'limit',label,positiveNumber,'must be a positive price.');if(limit!==undefined)out.limit=limit;
      const stop=optionValue(spec,'stop',label,positiveNumber,'must be a positive price.');if(stop!==undefined)out.stop=stop;
      const ocaName=optionValue(spec,'ocaName',label,orderName,'must be text of 1 to 64 characters.');if(ocaName!==undefined)out.ocaName=ocaName;
      const ocaType=optionValue(spec,'ocaType',label,value=>contains(OCA_TYPES,value),'must be cancel, reduce or none.');if(ocaType!==undefined)out.ocaType=ocaType;
      // Entry (a strategy entry that reverses an opposite position) and close (close-only), true or omitted, not both.
      const entry=optionValue(spec,'entry',label,value=>value===true,'must be true or omitted.');if(entry!==undefined)out.entry=true;
      const close=optionValue(spec,'close',label,value=>value===true,'must be true or omitted.');if(close!==undefined)out.close=true;
      if(out.entry&&out.close)throw Failure(label+' cannot set both entry and close.');
      return out;
    };
    const EXIT_POSITIVE=['quantity','profit','loss','limit','stop','trailPrice','trailPoints'];
    const exitSpec=raw=>{
      const label='Exit',spec=record(raw,label);onlyKeys(spec,['fromEntry','quantity','quantityPercent','profit','loss','limit','stop','trailPrice','trailPoints','trailOffset','ocaName'],label);const out={};
      const from=optionValue(spec,'fromEntry',label,orderName,'must be the name of an entry (1 to 64 characters).');if(from!==undefined)out.fromEntry=from;
      for(let i=0;i<EXIT_POSITIVE.length;i++){const key=EXIT_POSITIVE[i],value=optionValue(spec,key,label,positiveNumber,'must be a positive number.');if(value!==undefined)out[key]=value;}
      const percent=optionValue(spec,'quantityPercent',label,value=>isFinite(value)&&value>0&&value<=100,'must be a percent above 0 and at most 100.');if(percent!==undefined)out.quantityPercent=percent;
      const offset=optionValue(spec,'trailOffset',label,value=>isFinite(value)&&value>=0,'must be zero or more ticks.');if(offset!==undefined)out.trailOffset=offset;
      const ocaName=optionValue(spec,'ocaName',label,orderName,'must be text of 1 to 64 characters.');if(ocaName!==undefined)out.ocaName=ocaName;
      return out;
    };
    const fits=(spec,value)=>{
      if(spec.type==='bool')return typeof value==='boolean';
      if(spec.type==='string')return typeof value==='string'&&value.length<=200&&(spec.options===null||contains(spec.options,value));
      if(spec.type==='color')return colorText(value);
      if(spec.type==='source')return contains(PRICE_SOURCES,value)&&(spec.options===null||contains(spec.options,value));
      if(spec.type==='timeframe')return value===''||intervalText(value);
      if(spec.type==='symbol')return symbolText(value);
      if(spec.type==='session')return sessionText(value);
      if(!isFinite(value)||(spec.type==='int'||spec.type==='time')&&!isInteger(value)||spec.type==='time'&&(value<0||value>253402300799))return false;
      return (spec.min===null||value>=spec.min)&&(spec.max===null||value<=spec.max);
    };
    const declareInputs=(definition,supplied)=>{
      const declarations=[],values={},raw=field(definition,'inputs','The inputs declaration');
      if(raw===undefined)return{declarations,values:freeze(values)};
      record(raw,'The inputs declaration');const names=keys(raw);
      if(names.length>${LIMITS.inputs})throw Failure('A script may declare at most ${LIMITS.inputs} inputs.');
      for(let i=0;i<names.length;i++){
        const id=names[i];if(!identifier(id))throw Failure('Input names must be identifiers of at most 64 characters that do not start with two underscores.');
        const label='Input '+id,spec=record(field(raw,id,label),label);
        onlyKeys(spec,['type','default','title','min','max','step','options'],label);
        const type=field(spec,'type',label),title=field(spec,'title',label),fallback=field(spec,'default',label);
        if(!contains(INPUT_TYPES,type))throw Failure(label+' has an unsupported input type.');
        if(title!==undefined&&(typeof title!=='string'||title.length<1||title.length>100))throw Failure(label+' title must be 1 to 100 characters.');
        const numeric=type==='int'||type==='float'||type==='price'||type==='time',integer=type==='int'||type==='time';
        const bound=key=>{const value=field(spec,key,label);if(value===undefined)return null;if(!numeric||!isFinite(value)||integer&&!isInteger(value))throw Failure(label+' '+key+' must be a finite '+(integer?'integer':'number')+' on a numeric input.');return value;};
        const min=bound('min'),max=bound('max'),step=bound('step');
        if(min!==null&&max!==null&&min>max||step!==null&&step<=0)throw Failure(label+' bounds are inconsistent.');
        let options=null;const rawOptions=field(spec,'options',label);
        if(rawOptions!==undefined){
          if(type!=='string'&&type!=='source'||!isArray(rawOptions)||rawOptions.length<1||rawOptions.length>50)throw Failure(label+' options must be a list of 1 to 50 strings on a string or source input.');
          options=[];for(let j=0;j<rawOptions.length;j++){const option=field(rawOptions,toString(j),label);if(typeof option!=='string'||option.length>200||contains(options,option)||type==='source'&&!contains(PRICE_SOURCES,option))throw Failure(label+' options must be distinct strings of at most 200 characters.');append(options,option);}
        }
        if(type==='source'&&options===null){options=[];for(let j=0;j<PRICE_SOURCES.length;j++)append(options,PRICE_SOURCES[j]);}
        const declaration={id,type,title:title===undefined?id:title,default:fallback,min,max,step,options};
        if(!fits(declaration,fallback))throw Failure(label+' default does not match its type, bounds or options.');
        let value=fallback;const saved=supplied?getDescriptor(supplied,id):undefined;
        if(saved){if(!fits(declaration,saved.value))throw Failure('The saved value of input '+id+' no longer fits its declaration. Reset it in Settings.');value=saved.value;}
        append(declarations,declaration);defineProperty(values,id,{value,enumerable:true,writable:false,configurable:false});
      }
      return{declarations,values:freeze(values)};
    };
    const declareRequests=definition=>{
      const declarations=[],raw=field(definition,'requests','The requests declaration');if(raw===undefined)return declarations;
      record(raw,'The requests declaration');const names=keys(raw);
      if(names.length>${LIMITS.requests})throw Failure('A script may declare at most ${LIMITS.requests} requests.');
      for(let i=0;i<names.length;i++){
        const id=names[i];if(!identifier(id))throw Failure('Request names must be identifiers of at most 64 characters that do not start with two underscores.');
        const label='Request '+id,spec=record(field(raw,id,label),label);onlyKeys(spec,['symbol','interval'],label);
        const symbol=field(spec,'symbol',label),interval=field(spec,'interval',label);
        if(symbol!==undefined&&!symbolText(symbol)||interval!==undefined&&!intervalText(interval)||symbol===undefined&&interval===undefined)throw Failure(label+' needs a symbol (at most 40 letters, digits or . _ - : ^ = / !) and/or an interval such as 60m or 1D.');
        append(declarations,{id,symbol:symbol===undefined?null:symbol,interval:interval===undefined?null:interval});
      }
      return declarations;
    };
    // SCRIPT-RT (SCRIPT.RUNTIME.MTF / MULTISYMBOL): timeframes:{name:'1D'} and symbols:{name:'QQQ'} declarations.
    const declareSeries=(definition,key,limit,valid,label,hint,property)=>{
      const declarations=[],raw=field(definition,key,'The '+key+' declaration');if(raw===undefined)return declarations;
      record(raw,'The '+key+' declaration');const names=keys(raw);
      if(names.length>limit)throw Failure('A script may declare at most '+limit+' '+key+'.');
      for(let i=0;i<names.length;i++){
        const id=names[i];if(!identifier(id))throw Failure(label+' names must be identifiers of at most 64 characters that do not start with two underscores.');
        const value=field(raw,id,label+' '+id);if(!valid(value))throw Failure(label+' '+id+' '+hint);
        append(declarations,property==='interval'?{id,interval:value}:{id,symbol:value});
      }
      return declarations;
    };
    const checkSupplied=(declared,supplied,what,key)=>{
      for(let i=0;i<declared.length;i++)if(!supplied||!getDescriptor(supplied,declared[i].id))throw Failure(what+' '+declared[i].id+' has no supplied data. Run the script on a chart so its '+key+' can be resolved.');
      if(supplied){const names=keys(supplied);for(let i=0;i<names.length;i++){let known=false;for(let j=0;j<declared.length;j++)if(declared[j].id===names[i])known=true;if(!known)throw Failure('Supplied '+key+' data was not declared by the script.');}}
    };
    return definition=>{
    if(!definition || typeof definition.onBar!=='function') throw Failure('Define an onBar(ctx) function.');
    const timeframesDeclared=declareSeries(definition,'timeframes',${SERIES_LIMITS.timeframes},intervalText,'Timeframe','must be an interval such as 60m, 4h, 1D, 1W or 1M.','interval');
    const symbolsDeclared=declareSeries(definition,'symbols',${SERIES_LIMITS.symbols},symbolText,'Symbol','must be a loaded symbol of at most 40 letters, digits or . _ - : ^ = / !.','symbol');
    const requested=declareRequests(definition),declaredInputs=declareInputs(definition,input.inputs),inputValues=declaredInputs.values,supplied=input.requests;
    if(input.bars.length){
      for(let i=0;i<requested.length;i++)if(!supplied||!getDescriptor(supplied,requested[i].id))throw Failure('Request '+requested[i].id+' has no supplied data. Run the script on a chart so its requests can be resolved.');
      if(supplied){const names=keys(supplied);for(let i=0;i<names.length;i++){let known=false;for(let j=0;j<requested.length;j++)if(requested[j].id===names[i])known=true;if(!known)throw Failure('Supplied request data was not declared by the script.');}}
      checkSupplied(timeframesDeclared,input.timeframes,'Timeframe','timeframes');checkSupplied(symbolsDeclared,input.symbols,'Symbol','symbols');
    }
    const conditionNames=[],conditionInfo=[],conditionDeclared=[];let position=0;
    // SCRIPT-RT (SCRIPT.RUNTIME.ALERTS): conditions:{name:'message'} lists alert conditions up front, in declared order,
    // so the alert dialog offers them before (or without) a bar that evaluates them. Undeclared names still register on first use.
    {
      const raw=field(definition,'conditions','The conditions declaration');
      if(raw!==undefined){
        record(raw,'The conditions declaration');const names=keys(raw);
        if(names.length>${LIMITS.conditions})throw Failure('A script may declare at most ${LIMITS.conditions} alert conditions.');
        for(let i=0;i<names.length;i++){
          const name=names[i];if(name.length<1||name.length>128)throw Failure('Alert condition names must be 1 to 128 characters.');
          const message=field(raw,name,'Alert condition '+name);if(typeof message!=='string'||message.length>1000)throw Failure('Alert condition '+name+' needs a message of at most 1000 characters.');
          append(conditionNames,name);append(conditionInfo,{name,message});append(conditionDeclared,true);
        }
      }
    }
    const snapshot=input.snapshot || {schemaVersion:1,scriptHash:input.scriptHash,initialized:false,state:{},ta:{},rng:123456789,processedCount:0,processedEvent:null,processedIds:[],plots:[],drawings:[],alerts:[],alertDedupe:[],brokerSequence:0};
    const effects={plots:[],drawings:[],alerts:[],orders:[],conditions:[],visuals:null,objects:null,logs:null};
    for(let i=0;i<snapshot.processedIds.length;i++)apply(setAdd,seenIds,[snapshot.processedIds[i]]);
    for(let i=0;i<snapshot.alertDedupe.length;i++)apply(setAdd,dedupeKeys,[snapshot.alertDedupe[i]]);
    // One private row per plot title, {name, color (the first point's), times, values}, in first-use
    // order. The host rebuilds the same series from it. snapshot.plots keeps one entry per point: its title.
    const plotSeries=createObject(null),logicalPositions=input.chartPositionMode==='logical-v1';
    // The last colour that passed hexColor; the same string always passes again.
    let lastPlotColor=null;
    const plotColor=color=>{if(color===lastPlotColor)return true;if(!hexColor(color))return false;lastPlotColor=color;return true;};
    // Ctx.sma keeps its {length, values, sum} accumulator, used as a ring once full and put back in
    // oldest-to-newest order after the last bar. The same additions and subtractions happen in the same order.
    const smaEntries=createObject(null),smaList=[];
    const hasNul=text=>{for(let i=0;i<text.length;i++)if(apply(charCodeAt,text,[i])===0)return true;return false;};
    const finishSma=()=>{for(let i=0;i<smaList.length;i++){const entry=smaList[i],a=entry.a,n=a.values.length;if(!entry.start)continue;const ordered=[];for(let j=0;j<n;j++)ordered[j]=a.values[(entry.start+j)%n];a.values=ordered;entry.start=0;}};
    let outputCount=0;
    // While onFill runs, only ctx.input, ctx.order, ctx.exit and ctx.cancel work, whichever ctx
    // object the guest calls them on (a ctx kept from init or onBar included). Every other effect, TA and request path
    // goes through requireEvent or fillBlocked and throws.
    const fillBlocked=()=>{if(fillOrdinal!==null)throw Failure('Inside onFill only ctx.input, ctx.order, ctx.exit and ctx.cancel are available.');};
    const requireEvent=allowFill=>{if(allowFill!==true)fillBlocked();if(!snapshot.processedEvent)throw Failure('Plot, alert and order effects require onBar; init may initialize state only.');};
    // The Strategy tester's engine feed (checked by engineFeed in the host). ctx.strategy is the engine's
    // actual position at each bar's close, or null in a run without a feed. A fed fill calls onFill(ctx, fill) once, before
    // that bar's onBar, on a reduced ctx: a copy of the state (changes are discarded when it returns, so the
    // bar rolls back), the bar up to the fill, the position after it, ctx.input, and ctx.order, ctx.exit and ctx.cancel,
    // whose proposals carry fill (the fill's ordinal on its bar).
    const engine=input.engine,positionRecord=row=>row?freeze({position:row.position,averagePrice:row.averagePrice,openTrades:row.openTrades}):null;
    let fillOrdinal=null,fillCursor=0,copiedNodes=0;
    const propose=record=>{if(fillOrdinal!==null)record.fill=fillOrdinal;append(effects.orders,record);};
    const copyState=(value,depth)=>{
      if(value===null||typeof value!=='object')return value;
      if(++copiedNodes>100000||depth>40)throw Failure('ctx.state is too large or deep to copy for onFill.');
      const array=isArray(value);if(!array&&getPrototypeOf(value)!==plainPrototype)throw Failure('ctx.state must hold plain objects and arrays for onFill.');
      const out=array?[]:{},names=keys(value);
      for(let i=0;i<names.length;i++){const descriptor=getDescriptor(value,names[i]);if(!descriptor||!('value' in descriptor))throw Failure('ctx.state properties must be own data for onFill.');defineProperty(out,names[i],{value:copyState(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});}
      return out;
    };
    const emit=allowFill=>{requireEvent(allowFill);if(++outputCount>10000)throw Failure('Output count limit exceeded.');};
    // Rows below visible[position] are complete by the end of the current bar; n counts completed rows back.
    const seriesReader=(feeds,what,key)=>(name,n=0)=>{
      requireEvent();
      const entry=typeof name==='string'&&feeds?getDescriptor(feeds,name):undefined;
      if(!entry)throw Failure('Unknown '+what+'. Declare it in the '+key+' field of the script definition.');
      if(!isInteger(n)||n<0||n>${SERIES_LIMITS.depth})throw Failure('ctx.'+what+'(name, n) needs n from 0 (the latest completed bar) to ${SERIES_LIMITS.depth}.');
      const count=entry.value.visible[position]-n;if(count<1)return null;
      const row=entry.value.rows[count-1];
      return freeze({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume,end:row.end});
    };
${TA_RUNNER}
${OBJECT_RUNNER}
    const ctx={state:snapshot.state,bar:null,index:snapshot.processedCount,strategy:null,
      // Ctx.ta.*, ctx.history(n), ctx.series(key,value,depth) and the visual outputs.
      ta:lv.ta,history:lv.history,series:lv.series,hline:lv.hline,fill:lv.fill,bgcolor:lv.bgcolor,plotshape:lv.plotshape,plotchar:lv.plotchar,
      // Plotarrow, calendar fields, session tests, nz and the per-bar barstate record.
      plotarrow:lv.plotarrow,calendar:lv.calendar,insession:lv.insession,nz:lv.nz,barstate:null,
      // Ctx.barcolor, the drawing objects and ctx.log.
      barcolor:lvObjects.barcolor,label:lvObjects.label,line:lvObjects.line,box:lvObjects.box,table:lvObjects.table,log:lvObjects.log,linefill:lvObjects.linefill,polyline:lvObjects.polyline,
      random(){if(fillOrdinal!==null)fillBlocked();let x=snapshot.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;snapshot.rng=x>>>0;return snapshot.rng/4294967296;},
      sma(key,value,length){if(fillOrdinal!==null)fillBlocked();if(typeof key!=='string'||!isFinite(value)||!isInteger(length)||length<1||length>5000)throw Failure('Invalid SMA parameters.');
        let entry=smaEntries[key];
        if(entry===undefined){const descriptor=getDescriptor(snapshot.ta,key);if(descriptor&&!('value' in descriptor))throw Failure('Invalid SMA accumulator.');let a=descriptor?.value;if(!descriptor){a={length,values:[],sum:0};defineProperty(snapshot.ta,key,{value:a,enumerable:true,writable:true,configurable:true});}
          // A key containing NUL may name a ctx.ta slot; it keeps the shifting update so both see one ordered array.
          entry={a,start:0,ring:!hasNul(key)};defineProperty(smaEntries,key,{value:entry,writable:false,configurable:false});append(smaList,entry);}
        const a=entry.a;if(a.length!==length)throw Failure('SMA key parameters changed.');
        if(entry.ring&&a.values.length===length){const oldest=a.values[entry.start];a.sum+=value;a.sum-=oldest;a.values[entry.start]=value;if(++entry.start===length)entry.start=0;return a.sum/length;}
        append(a.values,value);a.sum+=value;if(a.values.length>length){a.sum-=a.values[0];for(let i=1;i<a.values.length;i++)a.values[i-1]=a.values[i];a.values.length--;}return a.values.length===length?a.sum/length:null;},
      // The third argument is a colour (#RRGGBB or #RRGGBBAA), null (no colour on this bar) or options
      // {color, style, linewidth, offset, display}. Style fields stay fixed per title; the colour may change per bar. The
      // row colour is the first colour's #RRGGBB; once a bar differs, colors holds a palette index per point (-1 none).
      plot(name,value,color='#6fa8ff'){if(typeof name!=='string'||name.length>128||!(value===null||isFinite(value)))throw Failure('Invalid plot.');let opts=null;
        if(color!==null&&typeof color==='object'){const parsed=lv.plotOptions(color);color=parsed.color;opts=parsed.opts;}else if(color!==null&&!plotColor(color)){if(typeof color!=='string'||color.length!==9)throw Failure('Invalid plot.');colorOf(color,'ctx.plot');}
        emit();let series=plotSeries[name];if(series===undefined){const base=color===null?'#6fa8ff':color.length===7?color:apply(stringSlice,color,[0,7]);series=logicalPositions?{name,color:base,times:[],values:[],indices:[],opts,palette:null,colors:null}:{name,color:base,times:[],values:[],opts,palette:null,colors:null};defineProperty(plotSeries,name,{value:series,writable:false,configurable:false});append(effects.plots,series);}
        else if(opts!==null&&(series.opts===null||!lv.sameOpts(series.opts,opts)))throw Failure('ctx.plot "'+name+'" must keep the same style, linewidth, offset and display on every bar.');
        if(series.colors===null&&color!==series.color){const colors=[],palette=[series.color];for(let i=0;i<series.values.length;i++)append(colors,0);series.colors=colors;series.palette=palette;}
        if(series.colors!==null)append(series.colors,lv.paletteIndex(series.palette,color,'ctx.plot "'+name+'"'));
        append(series.times,snapshot.processedEvent.time);append(series.values,value);if(logicalPositions)append(series.indices,snapshot.processedCount);append(snapshot.plots,name);},
      alert(name,message){if(typeof name!=='string'||name.length>128||typeof message!=='string'||message.length>1000)throw Failure('Invalid alert.');requireEvent();const key=stringify([snapshot.processedEvent.id,snapshot.processedEvent.revision,name]);if(!apply(setHas,dedupeKeys,[key])){emit();apply(setAdd,dedupeKeys,[key]);append(snapshot.alertDedupe,key);append(effects.alerts,{name,message,event:snapshot.processedEvent});}},
      order(side,quantity,options){if((side!=='buy'&&side!=='sell')||!isFinite(quantity)||quantity<=0)throw Failure('Invalid virtual order proposal.');const extra=orderOptions(options);emit(true);propose(extra?{sequence:++snapshot.brokerSequence,side,quantity,event:snapshot.processedEvent,virtual:true,options:extra}:{sequence:++snapshot.brokerSequence,side,quantity,event:snapshot.processedEvent,virtual:true});},
      // Ctx.exit(name, spec) proposes a virtual exit (take profit, stop loss and/or trailing stop);
      // ctx.cancel(name) cancels the working order or exit of that name. Both are virtual proposals, as ctx.order is.
      exit(name,spec){if(!orderName(name))throw Failure('ctx.exit needs a name of 1 to 64 characters.');const exit=exitSpec(spec);emit(true);propose({sequence:++snapshot.brokerSequence,side:'exit',target:name,exit,event:snapshot.processedEvent,virtual:true});},
      cancel(name){if(!orderName(name))throw Failure('ctx.cancel needs the name of an order or exit.');emit(true);propose({sequence:++snapshot.brokerSequence,side:'cancel',target:name,event:snapshot.processedEvent,virtual:true});},
      // A declared input value (saved instance setting, else the declared default).
      input(name){const descriptor=typeof name==='string'?getDescriptor(inputValues,name):undefined;if(!descriptor)throw Failure('Unknown input. Declare it in the inputs field of the script definition.');return descriptor.value;},
      // The requested series row aligned to the current bar (null before its first completed bar).
      // Only this bar's row is reachable; the aligned array itself stays engine-private.
      request(name){requireEvent();const rows=typeof name==='string'&&supplied?getDescriptor(supplied,name):undefined;if(!rows)throw Failure('Unknown request. Declare it in the requests field of the script definition.');const row=rows.value[position];return row===null||row===undefined?null:freeze({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});},
      // SCRIPT-RT: the latest completed bar (n = 0) or an earlier completed bar of a declared higher timeframe or
      // loaded symbol, or null. Rows come from the renderer's no-lookahead alignment, checked again by the host.
      timeframe:seriesReader(input.timeframes,'timeframe','timeframes'),
      symbol:seriesReader(input.symbols,'symbol','symbols'),
      // A named true/false series that the alert dialog offers as a script alert condition.
      alertcondition(name,condition,message=''){
        if(typeof name!=='string'||name.length<1||name.length>128||typeof condition!=='boolean'||typeof message!=='string'||message.length>1000)throw Failure('Invalid alert condition. Use ctx.alertcondition(name, true or false, message).');
        requireEvent();let index=-1;for(let i=0;i<conditionNames.length;i++)if(conditionNames[i]===name)index=i;
        if(index>=0&&conditionDeclared[index]===true&&message!==''&&message!==conditionInfo[index].message)throw Failure('Alert condition '+name+' was declared with another message. Omit the message or use the declared one.');
        if(index<0){if(conditionNames.length>=${LIMITS.conditions})throw Failure('A script may define at most ${LIMITS.conditions} alert conditions.');index=conditionNames.length;append(conditionNames,name);append(conditionInfo,{name,message});append(conditionDeclared,false);}
        if(effects.conditions.length>=${LIMITS.conditions*LIMITS.bars})throw Failure('Alert condition output limit exceeded.');
        append(effects.conditions,logicalPositions?{n:index,v:condition?1:0,t:snapshot.processedEvent.time,b:snapshot.processedCount}:{n:index,v:condition?1:0,t:snapshot.processedEvent.time});
      }
    };
    // The onFill ctx members, captured before any guest code runs.
    // The host-written ctx slots are data properties the guest cannot turn into accessors, and
    // the host writes them with defineProperty value semantics, so no guest setter or getter runs when the host moves the
    // bar, the position or the index. bar, index and strategy are non-configurable (a guest defineProperty on them throws).
    // state stays configurable because a script may replace it; any accessor there is refused by the own-data checks and
    // overwritten (never called) by setSlot.
    for(let i=0;i<4;i++){const name=['bar','index','strategy','barstate'][i];defineProperty(ctx,name,{value:getDescriptor(ctx,name).value,writable:true,enumerable:true,configurable:false});}
    const setSlot=(name,value)=>{defineProperty(ctx,name,name==='state'?{value,writable:true,enumerable:true,configurable:true}:{value});};
    const fillApi={input:ctx.input,order:ctx.order,exit:ctx.exit,cancel:ctx.cancel};
    const fillHook=engine&&engine.fills.length&&typeof definition.onFill==='function'?definition.onFill:null;
    // The full ctx also shows only the bar so far and the position after the fill while onFill
    // runs, and ctx.state is restored from a copy taken before the call, so a ctx kept from init or onBar sees no later
    // price and keeps no state change. JavaScript values the guest holds outside ctx.state are its own and are not rolled back.
    // The onFill guard is on from before the first ctx write of a fill until after the last restore.
    const runFill=(row,bar)=>{
      fillOrdinal=row.ordinal;try{
      const descriptor=getDescriptor(ctx,'state');if(!descriptor||!('value' in descriptor))throw Failure('Snapshot state must be an own data property.');
      copiedNodes=0;const kept=copyState(descriptor.value,0),partial=freeze({id:bar.id,revision:bar.revision,time:bar.time,open:bar.open,high:row.high,low:row.low,close:row.close,volume:0}),after=positionRecord(row);
      const fillCtx=freeze({state:descriptor.value,bar:partial,index:snapshot.processedCount,strategy:after,input:fillApi.input,order:fillApi.order,exit:fillApi.exit,cancel:fillApi.cancel});
      const fill=freeze({name:row.name,kind:row.kind,leg:row.leg,side:row.side,quantity:row.quantity,price:row.price});
      setSlot('bar',partial);setSlot('strategy',after);
      try{apply(fillHook,definition,[fillCtx,fill]);}finally{setSlot('state',kept);setSlot('bar',null);setSlot('strategy',null);}
      }finally{fillOrdinal=null;}
    };
    if(!snapshot.initialized){if(typeof definition.init==='function')definition.init(ctx);snapshot.initialized=true;}
    for(let i=0;i<input.bars.length;i++){const bar=input.bars[i];if(logicalPositions&&bar.volume===null)bar.volume=0/0;if(apply(setHas,seenIds,[bar.id])||(snapshot.processedEvent && bar.time<snapshot.processedEvent.time))throw Failure('Replay requires a snapshot before the repeated/corrected bar.');position=i;setSlot('index',snapshot.processedCount);snapshot.processedEvent={id:bar.id,revision:bar.revision,time:bar.time};
      // The fills of a bar run before its complete bar and close position are assigned.
      if(engine){if(fillHook)while(fillCursor<engine.fills.length&&engine.fills[fillCursor].bar===i)runFill(engine.fills[fillCursor++],bar);setSlot('strategy',positionRecord(engine.positions[i]));}
      setSlot('barstate',freeze({isfirst:snapshot.processedCount===0,islast:i===input.bars.length-1}));setSlot('bar',freeze(bar));definition.onBar(ctx);append(snapshot.processedIds,bar.id);apply(setAdd,seenIds,[bar.id]);snapshot.processedCount++;}
    finishSma();finishHistory();
    const stateDescriptor=getDescriptor(ctx,'state');
    if(!stateDescriptor||!('value' in stateDescriptor))throw Failure('Snapshot state must be an own data property.');
    snapshot.state=stateDescriptor.value;
    snapshot.drawings=join(snapshot.drawings,effects.drawings);snapshot.alerts=join(snapshot.alerts,effects.alerts);
    finishVisuals();effects.visuals=visuals;effects.objects=finishObjects();effects.logs=logsOut;
    let nodes=0;
    // Detach through own data descriptors. Retained stringify alone would still
    // invoke guest getters/toJSON after validation. No guest object reaches it.
    function detach(value,depth=0){
      if(++nodes>100000||depth>40)throw Failure('Snapshot structure exceeds limits.');
      if(value===null||typeof value==='string'||typeof value==='boolean')return value;
      if(typeof value==='number'){if(!isFinite(value))throw Failure('Snapshot numbers must be finite.');return value;}
      if(typeof value!=='object'||apply(setHas,ancestors,[value]))throw Failure('Snapshot must be acyclic JSON.');
      const array=isArray(value);
      if(!array&&getPrototypeOf(value)!==plainPrototype)throw Failure('Snapshot objects must be plain.');
      apply(setAdd,ancestors,[value]);
      const result=array?[]:{},names=keys(value);
      for(let i=0;i<names.length;i++){
        const key=names[i];
        if(key==='__proto__'||key==='constructor'||key==='prototype')throw Failure('Unsafe snapshot key.');
        const descriptor=getDescriptor(value,key);
        if(!descriptor||!('value' in descriptor))throw Failure('Snapshot properties must be own data.');
        const index=array?toNumber(key):-1;
        if(array&&isInteger(index)&&index>=0&&index<value.length&&toString(index)===key)continue;
        const child=detach(descriptor.value,depth+1);
        if(!array)defineProperty(result,key,{value:child,enumerable:true,writable:true,configurable:true});
      }
      if(array){for(let i=0;i<value.length;i++){const descriptor=getDescriptor(value,toString(i));if(descriptor&&!('value' in descriptor))throw Failure('Snapshot properties must be own data.');result[i]=detach(descriptor?descriptor.value:null,depth+1);}}
      apply(setDelete,ancestors,[value]);return result;
    }
    // Plot rows are engine-built and hold only primitives (titles and colours checked by ctx.plot,
    // times from the supplied bars, values null or finite numbers) and no guest reference, so they are copied into
    // the detached result directly instead of being walked node by node. They stay bounded by the 10,000 output
    // count. The snapshot and every other part are detached exactly as before.
    const plotRows=effects.plots;effects.plots=[];
    const detached=detach({snapshot,effects,catalog:{inputs:declaredInputs.declarations,requests:requested,conditions:conditionInfo,timeframes:timeframesDeclared,symbols:symbolsDeclared},inputs:inputValues});
    // WRAP-FIXES: a logical-position snapshot can never be resumed (inputForScript refuses one), so its per-bar ID list and
    // per-point title list are sent empty (compact). The full snapshot was still walked and checked above.
    if(logicalPositions){detached.snapshot.processedIds=[];detached.snapshot.plots=[];}
    const rows=[];for(let i=0;i<plotRows.length;i++){const row=plotRows[i],out=logicalPositions?{name:row.name,color:row.color,times:row.times,values:row.values,indices:row.indices}:{name:row.name,color:row.color,times:row.times,values:row.values};
      // Style options and per-point colours, both engine-built primitives (checked again by the host).
      if(row.opts!==null)out.opts={style:row.opts.style,linewidth:row.opts.linewidth,offset:row.opts.offset,display:{pane:row.opts.display.pane,priceScale:row.opts.display.priceScale,legend:row.opts.display.legend,dataWindow:row.opts.display.dataWindow}};
      if(row.colors!==null){out.palette=row.palette;out.colors=row.colors;}
      append(rows,out);}
    defineProperty(detached.effects,'plots',{value:rows,enumerable:true,writable:true,configurable:true});
    const output=stringify(detached);
    if(output.length>${LIMITS.outputBytes})throw Failure('Output byte limit exceeded.');
    return output;
    };
  })`;
  let handle,runner,definition;
  try {
    const locked=context.evalCode(lockdown,'lvscript-lockdown.js',{type:'global'});context.unwrapResult(locked).dispose();
    const prepare=context.unwrapResult(context.evalCode(bootstrap,'lvscript-bootstrap.js',{type:'global'}));
    let prepared;
    try {const text=context.newString(serialized);try {prepared=context.callFunction(prepare,context.undefined,text);} finally {text.dispose();}} finally {prepare.dispose();}
    runner=context.unwrapResult(prepared);
    // Compile source independently so user callbacks cannot close over engine input,
    // future bars, snapshot, effect arrays or engine-private locals.
    // Compile-only check of the exact former text keeps accepted sources and syntax messages
    // unchanged. Lexing is identical inside the wrapper, so a source that passes cannot hold the unmatched '}'
    // needed to leave the wrapper body: compiling the wrapper runs no guest code before the compiler is cleared.
    const checked=context.evalCode('('+input.source+')','lvscript.js',{type:'global',compileOnly:true});
    if(checked.error){let detail;try{detail=context.dump(checked.error);}finally{checked.error.dispose();}throw new BoundaryError('SCRIPT_FAILED',String(detail?.message || 'Script definition failed.').slice(0,500));}
    checked.value.dispose();
    const wrapped=context.evalCode('(()=>{return ('+input.source+')})','lvscript.js',{type:'global'});
    if(wrapped.error){let detail;try{detail=context.dump(wrapped.error);}finally{wrapped.error.dispose();}throw new BoundaryError('SCRIPT_FAILED',String(detail?.message || 'Script definition failed.').slice(0,500));}
    let defined;
    try {disableGuestCompiler(quickJS,context);defined=context.callFunction(wrapped.value,context.undefined);} finally {wrapped.value.dispose();}
    if(defined.error){let detail;try{detail=context.dump(defined.error);}finally{defined.error.dispose();}throw new BoundaryError('SCRIPT_FAILED',String(detail?.message || 'Script definition failed.').slice(0,500));}
    definition=defined.value;
    const result=context.callFunction(runner,context.undefined,definition);
    if(result.error){let detail;try{detail=context.dump(result.error);}finally{result.error.dispose();}throw new BoundaryError('SCRIPT_FAILED',String(detail?.message || 'Script execution failed.').slice(0,500));}
    handle=result.value;
    if(runtime.hasPendingJob()) throw new BoundaryError('ASYNC_PROHIBITED','Residual runtime jobs are prohibited.');
    const text=context.getString(handle);
    if(Buffer.byteLength(text)>LIMITS.outputBytes) throw new BoundaryError('OUTPUT_LIMIT','Script output exceeds 512 KiB.');
    const parsed=jsonData(JSON.parse(text));
    exactKeys(parsed,['snapshot','effects','catalog','inputs']);
    // Validate only this engine-produced snapshot through the unchanged strict rules; callers still cannot resume logical mode.
    // A logical run sends the compact snapshot (no per-bar ID list, no per-point titles). Both lists must be
    // empty; the strict rules then check it with stand-in IDs for the processed count (such a snapshot still cannot resume).
    let checkedSnapshot=parsed.snapshot;
    if(input.chartPositionMode==='logical-v1'){const compact=parsed.snapshot;if(!plainObject(compact)||!Array.isArray(compact.processedIds)||compact.processedIds.length!==0||!Array.isArray(compact.plots)||compact.plots.length!==0||!Number.isSafeInteger(compact.processedCount)||compact.processedCount<0||compact.processedCount>LIMITS.bars)throw new BoundaryError('INVALID_SNAPSHOT','Snapshot identity or structure is invalid.');checkedSnapshot={...compact,processedIds:Array.from({length:compact.processedCount},(_,index)=>'compact:'+index)};}
    inputForScript({...raw,chartPositionMode:undefined,snapshot:checkedSnapshot,bars:[],requests:undefined,timeframes:undefined,symbols:undefined,engine:undefined});
    exactKeys(parsed.effects,['plots','drawings','alerts','orders','conditions','visuals','objects','logs']);
    if(!['plots','drawings','alerts','orders','conditions'].every(key=>Array.isArray(parsed.effects[key]))) throw new BoundaryError('INVALID_OUTPUT','Invalid script effect structure.');
    const visuals=scriptVisuals(parsed.effects.visuals,input),objects=scriptObjects(parsed.effects.objects,input),logs=scriptLogs(parsed.effects.logs);
    const catalog=scriptCatalog(parsed.catalog),resolvedInputs=inputValues(parsed.inputs)??{};
    const state=input.provisional?input.snapshot:parsed.snapshot;
    const effects=input.provisional?{plots:[],alerts:[],orders:[],conditions:[]}:parsed.effects;
    const outputVisuals=input.provisional?emptyVisuals():visuals,outputObjects=input.provisional?emptyObjects():objects,outputLogs=input.provisional?emptyLogs():logs;
    const plots=new Map();
    // The engine sends one row per plot title, {name, color, times, values}. Every row and point is
    // checked again here, and the total point count stays within the engine's output count.
    let points=0;const plotStyles=[];
    for(const row of effects.plots){
      const invalid=()=>new BoundaryError('INVALID_OUTPUT','Invalid script plot.');
      if(!plainObject(row))throw invalid();try{exactKeys(row,input.chartPositionMode==='logical-v1'?['name','color','times','values','indices']:['name','color','times','values'],['opts','palette','colors']);}catch{throw invalid();}
      if(typeof row.name!=='string'||row.name.length>128||plots.has(row.name)||typeof row.color!=='string'||!PLOT_COLOR.test(row.color)||!Array.isArray(row.times)||!Array.isArray(row.values)||row.times.length<1||row.times.length!==row.values.length)throw invalid();
      points+=row.times.length;if(points>OUTPUT_COUNT)throw invalid();
      const logical=input.chartPositionMode==='logical-v1';if(logical&&(!Array.isArray(row.indices)||row.indices.length!==row.times.length))throw invalid();
      // Titles are user text; opaque IDs must never equal prototype keys when
      // persisted as keys in renderer style maps. Prefixing is injective.
      const series={id:'lvplot:'+row.name,title:row.name,values:[],color:row.color};plots.set(row.name,series);
      // Style options and per-point palette indices (aligned with the points kept below).
      const options=row.opts===undefined?null:plotStyleOptions(row.opts),colored=row.colors!==undefined||row.palette!==undefined;
      if(row.opts!==undefined&&options===null)throw invalid();
      if(colored&&(!Array.isArray(row.palette)||row.palette.length<1||row.palette.length>VISUAL_LIMITS.plotPalette||!row.palette.every(color=>typeof color==='string'&&VISUAL_COLOR.test(color))||!Array.isArray(row.colors)||row.colors.length!==row.times.length))throw invalid();
      const colors=colored?[]:null;
      let previousIndex=-1;for(let i=0;i<row.times.length;i++){const time=row.times[i],value=row.values[i];if(!Number.isFinite(time)||!(value===null||Number.isFinite(value)))throw invalid();const tint=colored?row.colors[i]:0;if(colored&&(!Number.isSafeInteger(tint)||tint<-1||tint>=row.palette.length))throw invalid();if(logical){const index=row.indices[i];if(!Number.isSafeInteger(index)||index<previousIndex||index<0||index>=input.bars.length||!Object.is(time,input.bars[index].time))throw invalid();const last=series.values[series.values.length-1];if(last&&last.index===index){last.value=value;if(colors)colors[colors.length-1]=tint;}else{series.values.push({time,value,index});if(colors)colors.push(tint);}previousIndex=index;}else{series.values.push({time,value});if(colors)colors.push(tint);}}
      if(options||colors)plotStyles.push({title:row.name,...(options??{style:'line',linewidth:null,offset:0,display:{pane:true,priceScale:true,legend:true,dataWindow:true}}),palette:colors?[...row.palette]:null,colors});
    }
    if(points+effects.alerts.length+effects.orders.length+outputObjects.barcolors.length+outputLogs.entries.length>OUTPUT_COUNT)throw new BoundaryError('INVALID_OUTPUT','Invalid script effect structure.');
    // Condition rows reference the catalog by index; a repeated call on one bar keeps the last value.
    const conditions=catalog.conditions.map(row=>({id:'lvcond:'+row.name,title:row.name,message:row.message,values:[]}));
    for(const point of effects.conditions){
      if(!point||typeof point!=='object'||!Number.isSafeInteger(point.n)||point.n<0||point.n>=conditions.length||(point.v!==0&&point.v!==1)||!Number.isFinite(point.t))throw new BoundaryError('INVALID_OUTPUT','Invalid script alert condition.');
      const values=conditions[point.n].values,last=values[values.length-1];
      if(input.chartPositionMode==='logical-v1'){try{exactKeys(point,['n','v','t','b']);}catch{throw new BoundaryError('INVALID_OUTPUT','Invalid logical script condition.');}const index=point.b;if(!Number.isSafeInteger(index)||index<0||index>=input.bars.length||last&&index<last.index||!Object.is(input.bars[index].time,point.t))throw new BoundaryError('INVALID_OUTPUT','Invalid logical script condition position.');if(last&&last.index===index)last.value=point.v;else values.push({time:point.t,value:point.v,index});}
      else if(last&&last.time===point.t)last.value=point.v;else if(last&&last.time>point.t)throw new BoundaryError('INVALID_OUTPUT','Script alert condition times must increase.');else values.push({time:point.t,value:point.v});
    }
    const output={plots:Array.from(plots.values()),alerts:effects.alerts,orders:effects.orders,conditions,visuals:{...outputVisuals,plotStyles},objects:outputObjects,logs:outputLogs,declarations:{inputs:catalog.inputs,requests:catalog.requests,timeframes:catalog.timeframes,symbols:catalog.symbols},inputs:resolvedInputs,state,diagnostics:[],elapsedMs:performance.now()-started,provisional:input.provisional,provenance:input.provenance};
    // The public result, including provenance and projected plots, shares the
    // existing byte budget; the private snapshot/effects check remains above.
    if(Buffer.byteLength(JSON.stringify(output),'utf8')>LIMITS.outputBytes)throw new BoundaryError('OUTPUT_LIMIT','Script output exceeds 512 KiB.');
    return output;
  } finally {
    // A failed handle cleanup must not strand the other owned WASM handles.
    try {handle?.dispose();} finally {
      try {definition?.dispose();} finally {
        try {runner?.dispose();} finally {
          try {context.dispose();} finally {runtime.dispose();}
        }
      }
    }
  }
}
module.exports={LIMITS,SERIES_LIMITS,inputForScript,executeSnapshot,disableGuestCompiler};
