// Speed-only changes. Each check pins the unchanged result next to the skipped work.
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {aggregateInterval,chooseIntervalSource,isoDaySeconds,DEFAULT_AGGREGATION_POLICY,type AggregationPolicy} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';
import {referenceFromDataset,resolveWatchSource} from '../../src/watchlists/model';
import {composeInputFeel,INPUT_FEEL_RUNTIMES,inputFeelSteps} from '../../src/chart/vela-input-feel-transform.mjs';
import type {Bar,BarDataset} from '../../src/domain/types';

const clone=<T,>(value:T):T=>structuredClone(value);
const usMinutes=(days:number):BarDataset=>{const bars:Bar[]=[];let price=100;for(let day=0;day<days;day++){const open=Date.UTC(2024,2,4+day,13,30)/1000;for(let m=0;m<390;m+=5){price+=Math.sin(day*7+m)*0.1;bars.push({time:open+m*60,open:price,high:price+0.2,low:price-0.2,close:price+0.05,volume:1000+m});}}
 return{instrument:{id:'TEST:AAA',symbol:'AAA',name:'AAA',exchange:'NASDAQ',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars,resolution:'5m',provenance:{providerId:'test',providerName:'Test',datasetId:'test:AAA:5m',fixture:true,coverage:'test',asOf:bars.at(-1)!.time,delaySeconds:null,adjustment:'raw',session:'extended',timezone:'UTC',state:'ready',license:'test',revision:'1',notes:[]}} as BarDataset;};

describe('isoDaySeconds',()=>{
 it('equals Date.parse(date + "T00:00:00Z") / 1000 for every day 1890-2110, sampled years 0001-9999 and odd input',()=>{
  for(let t=Date.UTC(1890,0,1);t<Date.UTC(2110,0,1);t+=86400000){const date=new Date(t).toISOString().slice(0,10);expect(isoDaySeconds(date)).toBe(Date.parse(date+'T00:00:00Z')/1000);}
  for(let year=1;year<=9999;year+=37)for(const md of ['01-01','02-28','02-29','03-01','12-31'])
   {const date=String(year).padStart(4,'0')+'-'+md;expect(Object.is(isoDaySeconds(date),Date.parse(date+'T00:00:00Z')/1000),date).toBe(true);}
  for(const odd of ['2024-02-30','2023-02-29','2024-13-01','2024-00-10','2024-1-01','abcd-ef-gh','','2024-01-01T00','0000-01-01'])expect(Object.is(isoDaySeconds(odd),Date.parse(odd+'T00:00:00Z')/1000),odd).toBe(true);
 });
});

describe('aggregateInterval cache',()=>{
 const daily=fixtureDataset('GME',500);
 it('returns results equal to an uncached build, as fresh copies, for the same or a cloned source',()=>{
  const first=aggregateInterval(clone(daily),'1W'),second=aggregateInterval(daily,'1W'),third=aggregateInterval(clone(daily),'1W');
  expect(second).toEqual(first);expect(third).toEqual(first);
  expect(second).not.toBe(first);expect(second.dataset).not.toBe(first.dataset);expect(second.dataset.bars).not.toBe(first.dataset.bars);expect(second.derivation).not.toBe((second.dataset as {derivation?:unknown}).derivation);
  second.dataset.bars[0].close=-1;second.dataset.bars.pop();expect(aggregateInterval(daily,'1W')).toEqual(first);
 });
 it('rebuilds when any bar value, the bar count, a source field or the policy changes',()=>{
  const base=aggregateInterval(daily,'1M'),edited=clone(daily);edited.bars[100]={...edited.bars[100],close:edited.bars[100].close+0.01,high:edited.bars[100].high+0.01};
  const changed=aggregateInterval(edited,'1M');expect(changed).not.toEqual(base);expect(changed).toEqual(aggregateInterval(clone(edited),'1M'));
  const shorter={...daily,bars:daily.bars.slice(0,-1)};expect(aggregateInterval(shorter,'1M').dataset.bars.length).toBeLessThanOrEqual(base.dataset.bars.length);expect(aggregateInterval(shorter,'1M').coverage.inputBars).toBe(499);
  const renamed={...daily,instrument:{...daily.instrument,name:'Other'}};expect(aggregateInterval(renamed,'1M').dataset.instrument.name).toBe('Other');
  const revised={...daily,provenance:{...daily.provenance,revision:'2'}};expect(aggregateInterval(revised,'1M').derivation!.sourceRevision).toBe('2');
  const policy:AggregationPolicy={...DEFAULT_AGGREGATION_POLICY,weekStartsOn:0};expect(aggregateInterval(daily,'1W',policy).derivation!.policy.weekStartsOn).toBe(0);
  expect(aggregateInterval(daily,'1W',policy).dataset.bars[0].time).not.toBe(aggregateInterval(daily,'1W').dataset.bars[0].time);
 });
 it('keeps extra bar fields and key order exact by building those sources every time',()=>{
  const tagged={...daily,bars:daily.bars.map((bar,index)=>index===0?{...bar,tag:'x'}:bar)} as BarDataset;
  expect((aggregateInterval(tagged,'1W').dataset.bars[0] as Bar&{tag?:string}).tag).toBe('x');
  const reordered={...daily,bars:daily.bars.map(bar=>({volume:bar.volume,time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close}))};
  expect(Object.keys(aggregateInterval(reordered,'1W').dataset.bars[0])).toEqual(['volume','time','open','high','low','close']);
 });
 it('replays a failure with the same message each time',()=>{
  const message=(()=>{try{aggregateInterval(daily,'5m');}catch(error){return (error as Error).message;}return '';})();
  expect(message).toBe('Finer bars cannot be created from a coarser source.');
  for(let i=0;i<3;i++)expect(()=>aggregateInterval(clone(daily),'5m')).toThrow(message);
  expect(chooseIntervalSource([daily],{instrumentId:daily.instrument.id,target:'5m',sourceKey:null})).toMatchObject({ok:false,code:'SOURCE_REQUIRED'});
 });
 it('caches the US trading-day path (civil-day arithmetic) with unchanged buckets',()=>{
  const minutes=usMinutes(12),policy={...DEFAULT_AGGREGATION_POLICY};
  const once=aggregateInterval(minutes,'1D',policy),again=aggregateInterval(clone(minutes),'1D',policy);
  expect(again).toEqual(once);expect(once.dataset.bars.length).toBe(12);
  for(const bar of once.dataset.bars)expect(bar.time%3600).toBe(0);
 });
});

describe('synthetic watch sources',()=>{
 it('builds a symbol once and returns fresh deep copies equal to fixtureDataset',()=>{
  const reference=referenceFromDataset(fixtureDataset('SPY',500)),first=resolveWatchSource(reference,[]),second=resolveWatchSource(reference,[]);
  expect(first).not.toBeNull();expect(second).not.toBe(first);expect(second!.bars).not.toBe(first!.bars);expect(second!.bars[0]).not.toBe(first!.bars[0]);expect(second!.provenance.notes).not.toBe(first!.provenance.notes);
  expect(first).toEqual(fixtureDataset('SPY',500));expect(Object.keys(first!)).toEqual(Object.keys(fixtureDataset('SPY',500)));first!.bars[0].close=-1;expect(resolveWatchSource(reference,[])).toEqual(fixtureDataset('SPY',500));
 });
});

describe('vela resize guard steps',()=>{
 it('compose once into every runtime, idempotently, and only gate the renderer ResizeObserver resize',()=>{
  expect(inputFeelSteps.map(([id])=>id)).toEqual(expect.arrayContaining(['resize-guard-method','resize-guard-record','resize-guard-observer']));
  for(const path of INPUT_FEEL_RUNTIMES){const raw=readFileSync('node_modules/@luxalgo/vela/'+path,'utf8'),once=composeInputFeel(raw,path);
   expect(composeInputFeel(once,path)).toBe(once);expect(once.split('if (!this.lvSyncSizeUnchanged()) this.resize();').length-1).toBe(1);
   expect(once.split('this.lvSynced = {').length-1).toBe(1);expect(once).toMatch(/resize\(\) \{\n\s+this\.syncSize\(\);/);}
 });
});
