// The items folded into this lane (F3 script ID budget, F4 point cache release, F6 shared glue).
// SYNTHETIC bars only.
import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {scriptBarIds,clearScriptBarIdCache,scriptBarIdCacheRows,SCRIPT_BAR_ID_CACHE_ROWS} from '../../src/ui/script-input';
import {renderIndicatorSeries,releaseIndicatorPoints,reusableIndicatorPointCount} from '../../src/chart/indicator-rendering';
import {calculateIndicator,rsi,macd,bollingerBands} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {rma,emaSmaSeed,sma,standardDeviation} from '../fixtures/r27-indicator-oracle';
import type {Bar} from '../../src/domain/types';

const START=Date.UTC(2026,8,1,13,30)/1000;
const bars=(count:number,shift=0,close:(i:number)=>number=i=>100+5*Math.sin((i+shift)/7)+((i+shift)%5)/4):Bar[]=>Array.from({length:count},(_,i)=>{const c=close(i);return{time:START+i*60,open:c-.25,high:c+.5,low:c-.5,close:c,volume:100+((i+shift)*53)%500};});
const digest=(identity:string,bar:Bar,index:number)=>'b:'+createHash('sha256').update(JSON.stringify([identity,index,bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume])).digest('hex').slice(0,32);

it('F3: script bar IDs stay exact under one row budget across sources, least recently used source first',async()=>{
 clearScriptBarIdCache();
 const sources=Array.from({length:4},(_,n)=>({identity:JSON.stringify(['synthetic-'+n,'1']),bars:bars(30000,n)}));
 for(const source of sources){const ids=await scriptBarIds(source.identity,source.bars);expect(ids[0]).toBe(digest(source.identity,source.bars[0],0));expect(ids.at(-1)).toBe(digest(source.identity,source.bars.at(-1)!,source.bars.length-1));expect(scriptBarIdCacheRows()).toBeLessThanOrEqual(SCRIPT_BAR_ID_CACHE_ROWS);}
 // The newest three sources fit (90,000 rows); a rerun of the newest hashes nothing and returns the same IDs.
 expect(scriptBarIdCacheRows()).toBe(90000);
 const newest=sources.at(-1)!,again=await scriptBarIds(newest.identity,newest.bars);expect(again.every((id,index)=>id===digest(newest.identity,newest.bars[index],index))).toBe(true);
 // One source above the budget starts over instead of growing without bound.
 clearScriptBarIdCache();const huge=bars(100000),identity='["synthetic-huge"]',ids=await scriptBarIds(identity,huge);
 expect(scriptBarIdCacheRows()).toBeLessThanOrEqual(SCRIPT_BAR_ID_CACHE_ROWS);expect(ids[99999]).toBe(digest(identity,huge[99999],99999));expect(ids[5]).toBe(digest(identity,huge[5],5));
 clearScriptBarIdCache();expect(scriptBarIdCacheRows()).toBe(0);
},120000);

it('F4: an instance releases its reusable plot points when it is removed or its chart is disposed',()=>{
 const data=bars(500),result=calculateIndicator('sma',data,{length:9});
 const before=reusableIndicatorPointCount();
 renderIndicatorSeries('fold-a','sma',result,data,{},0);renderIndicatorSeries('fold-b','sma',result,data,{},0);
 expect(reusableIndicatorPointCount()).toBe(before+2);
 releaseIndicatorPoints(['fold-a']);expect(reusableIndicatorPointCount()).toBe(before+1);
 const reused=renderIndicatorSeries('fold-b','sma',result,data,{},0),fresh=renderIndicatorSeries('fold-c','sma',result,data,{},0);
 expect(JSON.stringify(reused)).toBe(JSON.stringify(fresh.map(series=>({...series,id:series.id.replace('fold-c','fold-b')}))));
 releaseIndicatorPoints(['fold-b','fold-c']);expect(reusableIndicatorPointCount()).toBe(before);
 // The cap: at most 24 plots are kept.
 for(let n=0;n<40;n++)renderIndicatorSeries('fold-cap-'+n,'sma',result,data,{},0);
 expect(reusableIndicatorPointCount()).toBeLessThanOrEqual(24);
 releaseIndicatorPoints(Array.from({length:40},(_,n)=>'fold-cap-'+n));
});

// Verbatim earlier RSI, MACD and band expressions over the oracle kernels.
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function oracleRsi(values:(number|null)[],period:number){const gains=values.map((value,i)=>i&&finite(value)&&finite(values[i-1])?Math.max(value-(values[i-1] as number),0):null),losses=values.map((value,i)=>i&&finite(value)&&finite(values[i-1])?Math.max((values[i-1] as number)-value,0):null);const up=rma(gains,period),down=rma(losses,period);return up.map((gain,i)=>{const loss=down[i];if(!finite(gain)||!finite(loss))return null;if(gain===0&&loss===0)return null;if(loss===0)return 100;if(gain===0)return 0;return 100-100/(1+gain/loss);});}
// The MACD EMAs are SMA-seeded (reference ARM 1D: line from bar 25, signal from bar 33), so the copy uses emaSmaSeed.
function oracleMacd(values:(number|null)[]){const a=emaSmaSeed(values,12),b=emaSmaSeed(values,26),line=a.map((value,i)=>finite(value)&&finite(b[i])?value-(b[i] as number):null),signal=emaSmaSeed(line,9),histogram=line.map((value,i)=>finite(value)&&finite(signal[i])?value-(signal[i] as number):null);return{line,signal,histogram};}
function oracleBands(values:(number|null)[],period:number,multiplier:number){const basis=sma(values,period),deviation=standardDeviation(values,period);return{basis,upper:basis.map((value,i)=>finite(value)&&finite(deviation[i])?value+multiplier*(deviation[i] as number):null),lower:basis.map((value,i)=>finite(value)&&finite(deviation[i])?value-multiplier*(deviation[i] as number):null)};}
const same=(a:unknown,b:unknown)=>expect(JSON.stringify(a,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v)).toBe(JSON.stringify(b,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v));

const attempt=(run:()=>unknown)=>{try{return{ok:run()};}catch(error){return{error:String(error)};}};
const both=(actual:()=>unknown,expected:()=>unknown)=>same(attempt(actual),attempt(expected));
it('F6: the shared RSI, MACD and band expressions equal the pre-lane copies on every branch',()=>{
 const series:(number|null)[][]=[bars(300).map(bar=>bar.close),Array(200).fill(50),Array.from({length:200},(_,i)=>10+i),Array.from({length:200},(_,i)=>500-i),[1,null,2,NaN,3,-0,0,1e308,-1e308,4,4,4,4,4,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]];
 for(const values of series){both(()=>rsi(values,14),()=>oracleRsi(values,14));both(()=>rsi(values,1),()=>oracleRsi(values,1));both(()=>macd(values),()=>oracleMacd(values));both(()=>bollingerBands(values,20,2),()=>oracleBands(values,20,2));both(()=>bollingerBands(values,5,0),()=>oracleBands(values,5,0));}
});

it('F6: an incremental session matches the reference when a branch first appears after the seed (flat, all-gain, all-loss)',()=>{
 const configurations:Array<[string,Record<string,unknown>]>=[['rsi',{length:14}],['rsi',{length:2,smoothingType:'SMA+BB',smoothingLength:5,smoothingMultiplier:2}],['macd',{}],['bb',{length:20,multiplier:2}],['sma',{length:9,smoothingType:'SMA+BB',smoothingLength:4,smoothingMultiplier:1.5}]];
 for(const [kind,inputs] of configurations){
  const session=createIncrementalIndicatorSession();let live=bars(200);session.calculate(kind as any,live,inputs as any);
  const tails=[(i:number)=>live.at(-1)!.close,(i:number)=>live.at(-1)!.close+i,(i:number)=>live.at(-1)!.close-i];
  for(const tail of tails)for(let step=1;step<=40;step++){
   const last=live.at(-1)!,c=tail(1);live=[...live,{time:last.time+60,open:c,high:c,low:c,close:c,volume:10}];
   const reference=calculateIndicator(kind,live,inputs as any),incremental=session.calculate(kind as any,live,inputs as any);same(incremental,reference);
  }
 }
});
