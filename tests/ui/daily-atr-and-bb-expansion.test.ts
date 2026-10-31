import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {scriptExamples} from '../../src/ui/ScriptPanel';
import {calculateIndicator} from '../../src/domain/indicators';
import {renderIndicatorPresentation,BB_CONTRACTION_COLOR} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorDefaults,indicatorInputSchema,validateIndicatorInputs,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';
import {makeDemoIntraday,DEMO_INTRADAY_RESOLUTIONS} from '../../src/domain/fixtures';

// SYNTHETIC bars only. The Daily ATR panel example runs through the real restricted worker; the Bollinger
// expansion colors are read from the chart presentation.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const DAY=86400,D0=19700*DAY;

describe('Daily ATR panel example',{timeout:60000},()=>{
 it('shows the 14-day ATR of completed days, the range so far today and the share used',async()=>{
  // 16 completed days of four hourly bars, each day high 12, low 8, close 10: every true range is 4, so ATR(14) = 4.
  // Today has two bars (high 11, low 9): range 2, half of the ATR.
  const rows:{time:number;open:number;high:number;low:number;close:number}[]=[];
  for(let d=0;d<16;d++)for(let h=0;h<4;h++)rows.push({time:D0+d*DAY+(14+h)*3600,open:10,high:h===1?12:10.5,low:h===2?8:9.5,close:10});
  rows.push({time:D0+16*DAY+14*3600,open:10,high:11,low:9.5,close:10},{time:D0+16*DAY+15*3600,open:10,high:10.5,low:9,close:10});
  const bars=rows.map((row,index)=>({id:'synthetic-atr-'+index,revision:1,volume:1,...row}));
  const jobs=new ScriptJobs();
  try{
   const result=await jobs.run({requestId:'daily-atr',source:scriptExamples['Daily ATR panel'],bars});
   expect(result.ok,result.error?.message).toBe(true);
   const tables=result.value.objects.tables;expect(tables).toHaveLength(1);
   const texts=JSON.stringify(tables[0].cells);
   for(const text of ['Daily ATR','4.00','Today range','2.00','ATR used','50%'])expect(texts).toContain(JSON.stringify(text));
  }finally{jobs.close();}
 });
});

describe('Daily ATR panel on the intraday example data',{timeout:120000},()=>{
 /** Independent reference: UTC days from the bars, true range of each completed day, Wilder RMA seeded by the mean of the first 14. */
 function reference(bars:readonly Bar[]){
  const days:{high:number;low:number;close:number}[]=[];let key:number|null=null;
  for(const bar of bars){const k=Math.floor(bar.time/DAY);if(k!==key){days.push({high:bar.high,low:bar.low,close:bar.close});key=k;}else{const d=days.at(-1)!;d.high=Math.max(d.high,bar.high);d.low=Math.min(d.low,bar.low);d.close=bar.close;}}
  const done=days.slice(0,-1),today=days.at(-1)!;let atr=NaN,sum=0;
  done.forEach((d,i)=>{const p=i?done[i-1].close:null,tr=p===null?d.high-d.low:Math.max(d.high-d.low,Math.abs(d.high-p),Math.abs(d.low-p));sum+=tr;if(i<14){if(i===13)atr=sum/14;}else atr=(atr*13+tr)/14;});
  // Fewer than 14 completed days: the mean true range of the days there are, labelled with the count.
  const short=done.length<14;return {atr:short?sum/done.length:atr,label:short?'Daily ATR ('+done.length+'d)':'Daily ATR',today:today.high-today.low};
 }
 for(const resolution of DEMO_INTRADAY_RESOLUTIONS)it(resolution+': runs within the 5,000-bar limit and matches the reference',async()=>{
  const all=makeDemoIntraday('SPY')[resolution],bars=all.slice(-5000);expect(bars.length).toBeLessThanOrEqual(5000);
  const want=reference(bars),jobs=new ScriptJobs();
  try{
   const result=await jobs.run({requestId:'daily-atr-'+resolution,source:scriptExamples['Daily ATR panel'],bars:bars.map((bar,index)=>({id:'synthetic-'+resolution+'-'+index,revision:1,...bar}))});
   expect(result.ok,result.error?.message).toBe(true);const texts=JSON.stringify(result.value.objects.tables[0].cells);
   expect(Number.isFinite(want.atr)).toBe(true);expect(texts).toContain(JSON.stringify(want.label));expect(texts).toContain(JSON.stringify(want.atr.toFixed(2)));expect(texts).toContain(JSON.stringify(want.today.toFixed(2)));
   expect(texts).toContain(JSON.stringify((100*want.today/want.atr).toFixed(0)+'%'));
  }finally{jobs.close();}
 });
});

describe('Bollinger Bands color by expansion',()=>{
 const bars:Bar[]=[...Array.from({length:30},(_,i)=>10+(i%2)*0.2),...Array.from({length:15},(_,i)=>10+i*i*0.05),...Array.from({length:30},()=>21)].map((close,i)=>({time:D0+i*DAY,open:close,high:close+0.5,low:close-0.5,close,volume:100}));
 const settings=(inputs:Record<string,unknown>):IndicatorInstanceSettings=>({id:'bb1',kind:'bb',inputs:{...indicatorDefaults.bb,...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('bb')});
 it('is an optional input, off by default and never written into the defaults',()=>{
  expect(indicatorInputSchema('bb').find(row=>row.key==='colorByExpansion')).toMatchObject({type:'bool',defval:false,title:'Color by expansion'});
  expect(Object.hasOwn(indicatorDefaults.bb,'colorByExpansion')).toBe(false);
  expect(()=>validateIndicatorInputs('bb',{...indicatorDefaults.bb,colorByExpansion:true})).not.toThrow();
 });
 it('keeps the band color while the width rises and turns grey while it falls; off leaves every point alone',()=>{
  const inputs={...indicatorDefaults.bb,colorByExpansion:true},result=calculateIndicator('bb',bars,inputs as never);
  const upper=result.series.find(row=>row.id==='upper')!.values,lower=result.series.find(row=>row.id==='lower')!.values,width=(i:number)=>(upper[i] as number)-(lower[i] as number);
  const on=renderIndicatorPresentation(settings({colorByExpansion:true}),result,bars,{resolution:'1D'}),line=(r:typeof on,title:string)=>r.output.series!.find(row=>row.title===title) as {points:{color?:string}[]};
  const points=line(on,'Upper').points,grey=(color?:string)=>!!color&&color.toLowerCase().includes('8a92a6')||!!color&&/138, ?146, ?166/.test(color);
  let rising=0,falling=0;expect(on.diagnostics).toEqual([]);
  for(let i=20;i<bars.length;i++){if(width(i)>width(i-1)){rising++;expect(grey(points[i].color),'index '+i).toBe(false);}else{falling++;expect(grey(points[i].color),'index '+i).toBe(true);}}
  expect(rising).toBeGreaterThan(3);expect(falling).toBeGreaterThan(3);expect(BB_CONTRACTION_COLOR).toBe('#8a92a6');
  const off=renderIndicatorPresentation(settings({}),calculateIndicator('bb',bars,indicatorDefaults.bb as never),bars,{resolution:'1D'});
  expect(line(off,'Upper').points.every(point=>!grey(point.color))).toBe(true);
 });
});
