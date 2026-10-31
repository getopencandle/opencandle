import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {indexedFromBaseline,percentFromBaseline,priceFraction} from '../../src/chart/price-scale-state';

// Numerical oracles for what the chart actually draws: the pinned renderer's own
// coordinate and label functions (@luxalgo/vela 0.8.4, not package exports, so read
// from a temporary pinned-source copy exactly like tests/helpers/real-vela-chart.ts)
// checked against literal hand-computed values, and LV's transform helpers checked
// against the same renderer functions. No canvas, GUI or reference comparison.
interface Internals {CoordinateSystem:new()=>any;toPct(price:number,base:number):number;toIndex(price:number,base:number):number;formatPct(value:number):string;formatIndex(value:number):string;percentScaleFor(scene:any,pane:any):{baseline:number;indexed:boolean}|undefined}
let vela:Internals;
beforeAll(async()=>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-price-scale-math-${randomUUID()}.mjs`);
 mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { CoordinateSystem as LVCoordinateSystem, toPct as LVToPct, toIndex as LVToIndex, formatPct as LVFormatPct, formatIndex as LVFormatIndex, percentScaleFor as LVPercentScaleFor };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  vela={CoordinateSystem:module.LVCoordinateSystem,toPct:module.LVToPct,toIndex:module.LVToIndex,formatPct:module.LVFormatPct,formatIndex:module.LVFormatIndex,percentScaleFor:module.LVPercentScaleFor};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
});
const bounds={top:0,height:400};

describe('SCALE.NUMERIC renderer coordinates (hand oracles)',()=>{
 it('WS.SCALE.REGULAR: linear window [100,200] over 400 px puts 150 at 200 px and 125 at 300 px',()=>{
  const coords=new vela.CoordinateSystem();expect(coords.priceToY(150,{min:100,max:200},bounds)).toBe(200);expect(coords.priceToY(125,{min:100,max:200},bounds)).toBe(300);expect(coords.yToPrice(100,{min:100,max:200},bounds)).toBe(175);
 });
 it('WS.SCALE.LOGARITHMIC: window [10,1000] puts 100 at the middle (200 px) and 31.6227766 at 300 px',()=>{
  const coords=new vela.CoordinateSystem(),scale={min:10,max:1000,log:true};
  expect(coords.priceToY(100,scale,bounds)).toBeCloseTo(200,9);expect(coords.priceToY(Math.sqrt(1000),scale,bounds)).toBeCloseTo(300,9);expect(coords.priceToY(Math.pow(10,2.5),scale,bounds)).toBeCloseTo(100,9); // log10 1.5 and 2.5
  expect(coords.yToPrice(200,scale,bounds)).toBeCloseTo(100,9);
 });
 it('WS.SCALE.INVERT: the same prices mirror (150 stays mid, 125 moves to 100 px; log 100 stays mid, 1000 at the bottom)',()=>{
  const coords=new vela.CoordinateSystem();expect(coords.priceToY(125,{min:100,max:200,invert:true},bounds)).toBe(100);expect(coords.priceToY(150,{min:100,max:200,invert:true},bounds)).toBe(200);
  expect(coords.priceToY(1000,{min:10,max:1000,log:true,invert:true},bounds)).toBeCloseTo(400,9);
 });
 it('OpenCandle priceFraction agrees with the renderer for linear, log and inverted windows',()=>{
  const coords=new vela.CoordinateSystem();
  for(const [price,window,log,invert] of [[137,{min:100,max:200},false,false],[137,{min:100,max:200},false,true],[42,{min:10,max:1000},true,false],[42,{min:10,max:1000},true,true]] as const)
   expect(priceFraction(price,window,log,invert)!*400).toBeCloseTo(coords.priceToY(price,{...window,log,invert},bounds),9);
 });
});

describe('SCALE.NUMERIC percent and indexed labels (hand oracles)',()=>{
 it('WS.SCALE.PERCENT: baseline 80 -> 100 is +25.00%, 60 is -25.00%, 80 is +0.00%',()=>{
  expect(vela.toPct(100,80)).toBeCloseTo(25,12);expect(vela.formatPct(vela.toPct(100,80))).toBe('+25.00%');expect(vela.formatPct(vela.toPct(60,80))).toBe('-25.00%');expect(vela.formatPct(vela.toPct(80,80))).toBe('+0.00%');
  for(const [price,base] of [[100,80],[60,80],[123.45,99.5]])expect(percentFromBaseline(price,base)).toBeCloseTo(vela.toPct(price,base),12);
 });
 it('WS.SCALE.INDEXED_TO_100: baseline 80 -> 100 is 125.00, 60 is 75.00, 80 is 100.00',()=>{
  expect(vela.formatIndex(vela.toIndex(100,80))).toBe('125.00');expect(vela.formatIndex(vela.toIndex(60,80))).toBe('75.00');expect(vela.formatIndex(vela.toIndex(80,80))).toBe('100.00');
  for(const [price,base] of [[100,80],[60,80],[123.45,99.5]])expect(indexedFromBaseline(price,base)).toBeCloseTo(vela.toIndex(price,base),12);
 });
 it('the price pane uses its own baseline; regular mode has no percent scale and a zero baseline falls back to prices',()=>{
  const pane={kind:'price',percentBaseline:80};
  expect(vela.percentScaleFor({scaleMode:'percent'},pane)).toEqual({baseline:80,indexed:false});
  expect(vela.percentScaleFor({scaleMode:'indexed'},pane)).toEqual({baseline:80,indexed:true});
  expect(vela.percentScaleFor({scaleMode:'price'},pane)).toBeUndefined();
  expect(vela.percentScaleFor({scaleMode:'percent'},{kind:'price',percentBaseline:0})).toBeUndefined();
 });
});
