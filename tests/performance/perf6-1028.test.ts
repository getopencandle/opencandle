// Cheaper live indicator updates must keep every value exactly equal to a full recalculation. SYNTHETIC data.
import {describe,expect,it} from 'vitest';
import {INDICATOR_KINDS,indicatorDefaults} from '../../src/chart/indicator-settings';
import {calculateIndicator,type IndicatorId,type IndicatorResult} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {isSealedIndicatorValues,sealIndicatorValues} from '../../src/domain/indicator-sealed-values';
import {scriptBarsKey} from '../../src/ui/script-bars-key';
import {builtinPresentationFixture} from '../fixtures/builtin-presentation';
import type {Bar} from '../../src/domain/types';

function rng(seed:number){let state=seed>>>0||1;return()=>{state^=state<<13;state>>>=0;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};}
function syntheticBars(count:number,seed:number,start=1700000000):Bar[]{
 const next=rng(seed);let close=100;
 return Array.from({length:count},(_,index)=>{close=Math.max(1,close+(next()-0.5)*2);const open=close+(next()-0.5),high=Math.max(open,close)+next(),low=Math.min(open,close)-next();return{time:start+index*60,open,high,low,close,volume:Math.floor(next()*1000)+1};});
}
/** Same values bit for bit (Object.is keeps -0 and NaN) and the same plot ids, labels, diagnostics and policies. */
function same(actual:IndicatorResult,expected:IndicatorResult,where:string){
 expect(actual.id,where).toBe(expected.id);expect(actual.diagnostics,where).toEqual(expected.diagnostics);expect(actual.policies,where).toEqual(expected.policies);
 expect(actual.series.map(plot=>[plot.id,plot.label,plot.values.length]),where).toEqual(expected.series.map(plot=>[plot.id,plot.label,plot.values.length]));
 actual.series.forEach((plot,index)=>{const reference=expected.series[index].values;for(let point=0;point<reference.length;point++)if(!Object.is(plot.values[point],reference[point]))throw new Error(`${where} ${plot.id}[${point}]: ${plot.values[point]} is not ${reference[point]}`);});
}
const tick=(bars:Bar[],step:number):Bar[]=>{const next=bars.slice(),last=next[next.length-1],close=last.close+(step%2?0.37:-0.21);next[next.length-1]={...last,close,high:Math.max(last.high,close),low:Math.min(last.low,close),volume:last.volume+step};return next;};
const append=(bars:Bar[],step:number):Bar[]=>{const last=bars[bars.length-1],close=last.close+0.1*step;return[...bars,{time:last.time+60,open:last.close,high:Math.max(last.close,close)+0.2,low:Math.min(last.close,close)-0.2,close,volume:10+step}];};

describe('PERF6 incremental equals full recalculation at 5,000 bars',()=>{
 const base=syntheticBars(5000,61),older=syntheticBars(1000,62,base[0].time-1000*60);
 // Every built-in kind whose default reference calculation succeeds on plain price bars.
 const kinds=INDICATOR_KINDS.filter(kind=>{try{const result=calculateIndicator(kind,base.slice(0,300),{...indicatorDefaults[kind]});return result.diagnostics.length===0&&result.series.length>0;}catch{return false;}});
 it('covers at least the top 30 built-in kinds',()=>{expect(kinds.length).toBeGreaterThanOrEqual(30);for(const kind of ['sma','ema','rsi','macd','bb','volume','obv','atr','stochastic'] as IndicatorId[])expect(kinds).toContain(kind);});
 for(const kind of kinds)it(`${kind}: live ticks, appends, a revised bar, a replay prefix and a prepended page`,()=>{
  const inputs={...indicatorDefaults[kind]},session=createIncrementalIndicatorSession({shared:true,sealed:true}),plain=createIncrementalIndicatorSession();
  let bars=base.slice(0,4990);const check=(where:string)=>{const expected=calculateIndicator(kind,bars,inputs),sealed=session.calculate(kind,bars,inputs),fresh=plain.calculate(kind,bars,inputs);same(sealed,expected,kind+' '+where);same(fresh,expected,kind+' plain '+where);
   for(const plot of sealed.series){expect(isSealedIndicatorValues(plot.values)).toBe(true);expect(Object.isFrozen(plot.values)).toBe(true);}for(const plot of fresh.series)expect(Object.isFrozen(plot.values)).toBe(false);};
  check('seed');
  for(let step=1;step<=4;step++){bars=tick(bars,step);check('tick '+step);}
  for(let step=1;step<=3;step++){bars=append(bars,step);check('append '+step);bars=tick(bars,step+10);check('append tick '+step);}
  const revised=bars.slice(),prior=revised[revised.length-2];revised[revised.length-2]={...prior,close:prior.close+0.05,high:prior.high+0.05};bars=revised;check('revised bar');
  const full=bars;bars=full.slice(0,4900);check('replay prefix');bars=full;check('replay forward');
  bars=[...older,...full];check('prepended page');bars=tick(bars,99);check('tick after prepend');
 },60000);
});

describe('PERF6 sealed values',()=>{
 it('are frozen copies and only module-built arrays count as sealed',()=>{
  const source=[1,null,-0,2.5],copy=sealIndicatorValues(source);
  expect(copy).toEqual(source);expect(copy).not.toBe(source);expect(Object.is(copy[2],-0)).toBe(true);expect(Object.isFrozen(copy)).toBe(true);expect(Object.isFrozen(source)).toBe(false);
  expect(isSealedIndicatorValues(copy)).toBe(true);expect(isSealedIndicatorValues(Object.freeze([1,2]))).toBe(false);expect(isSealedIndicatorValues(new Proxy(copy,{}))).toBe(false);
 });
 it('a chart port at 5,000 bars keeps current readouts through live ticks and still refuses a changed native price',async()=>{
  const rows=syntheticBars(5000,63),h=await builtinPresentationFixture({rows});
  try{
   const ids=(['bb','rsi','macd','volume'] as const).map(kind=>h.port.add(kind,{}));
   let current=rows;for(let step=1;step<=3;step++){current=tick(current,step);h.publish(current);}
   for(const id of ids){const view=h.port.captureReadout?.(id);expect(view?.state).toBe('ready');if(view?.state!=='ready')continue;const model=h.instance(id),time=current[current.length-1].time;
    expect(view.readAt(time).plots.map(plot=>plot.value)).toEqual(model.result.series.map((plot:{values:readonly (number|null)[]})=>plot.values.at(-1)));
    for(const plot of model.result.series){expect(isSealedIndicatorValues(plot.values)).toBe(true);expect(Object.getOwnPropertyDescriptor(plot.values,'4999')).toMatchObject({writable:false,configurable:false});}
    const expected=calculateIndicator(h.port.list().find(row=>row.id===id)!.kind,current,{...indicatorDefaults[h.port.list().find(row=>row.id===id)!.kind]});same(model.result,{...expected,policies:model.result.policies},id);}
   const changed=h.core.bars.map((row:Bar,index:number)=>index===2500?{...row,close:row.close+1}:row);h.core.bars=changed;for(const id of ids)h.instance(id).onBars();
   for(const id of ids)expect(h.port.captureReadout?.(id).state).toBe('unavailable');
  }finally{h.dispose();}
 },60000);
});

describe('PERF6 script input key',()=>{
 const json=(bars:readonly Bar[])=>JSON.stringify(bars);
 it('is equal exactly when the JSON text of the bars is equal',()=>{
  const bars=syntheticBars(300,64),copy=bars.map(row=>({...row}));
  expect(scriptBarsKey(copy)).toBe(scriptBarsKey(bars));
  const changed=copy.slice();changed[150]={...changed[150],close:changed[150].close+1e-9};expect(json(changed)).not.toBe(json(bars));expect(scriptBarsKey(changed)).not.toBe(scriptBarsKey(bars));
  const zero=[{time:1,open:0,high:1,low:0,close:Infinity,volume:NaN}],negative=[{time:1,open:-0,high:1,low:0,close:-Infinity,volume:Infinity}];expect(json(zero)).toBe(json(negative));expect(scriptBarsKey(zero)).toBe(scriptBarsKey(negative));
  expect(scriptBarsKey([])).toBe(scriptBarsKey([]));expect(scriptBarsKey(bars.slice(0,299))).not.toBe(scriptBarsKey(bars));
 });
 it('sees an edit in place and falls back to the JSON text for other row shapes',()=>{
  const bars=syntheticBars(50,65),before=scriptBarsKey(bars);bars[10].close+=1;expect(scriptBarsKey(bars)).not.toBe(before);
  const odd=[{close:1,time:1,open:1,high:1,low:1,volume:1}] as Bar[],extra=[{time:1,open:1,high:1,low:1,close:1,volume:1,note:'x'}] as unknown as Bar[];
  expect(scriptBarsKey(odd)).toBe('j'+json(odd));expect(scriptBarsKey(extra)).toBe('j'+json(extra));
 });
});
