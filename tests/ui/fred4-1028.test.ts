import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {comparisonSourceTag,comparisonSourceText} from '../../src/chart/compare-port';
import {exportNoticeFor,FRED_EXPORT_NOTICE,LIVE_EXPORT_NOTICE} from '../../src/domain/live-provider';
import {liveDataOf,restoreLiveData} from '../../src/ui/live-workspace';
import {FredCacheSection} from '../../src/ui/FredCacheSection';

const prov=(datasetId:string,providerId:string)=>({provenance:{datasetId,providerId,providerName:'FRED',fixture:false}}) as never;
describe('FRED-4',()=>{
 it('tags a FRED comparison FRED, not LIVE',()=>{
  const d=prov('fred:fred-public:DGS10:1D','fred-public');
  expect(comparisonSourceTag(d)).toBe('FRED');expect(comparisonSourceText(d)).toMatch(/^FRED/);
  expect(comparisonSourceTag(prov('live:coinbase-public:BTC-USD:1m','coinbase-public'))).toBe('LIVE');
 });
 it('gives FRED its own export wording and keeps the live wording',()=>{
  expect(exportNoticeFor('fred:fred-public:DGS10:1D')).toBe(FRED_EXPORT_NOTICE);
  expect(FRED_EXPORT_NOTICE).not.toMatch(/live|—/i);
  expect(exportNoticeFor('live:coinbase-public:BTC-USD:1m')).toBe(LIVE_EXPORT_NOTICE);
 });
 it('fred flag: absent means on, false round-trips, junk is refused',()=>{
  expect(liveDataOf({liveData:{coinbase:true,alpacaSymbols:[]}}).fred).toBeUndefined();
  expect(liveDataOf({liveData:{coinbase:true,alpacaSymbols:[],fred:false}}).fred).toBe(false);
  expect(liveDataOf({}).fred).toBeUndefined();
  expect(restoreLiveData({coinbase:false,alpacaSymbols:[],fred:false})).toEqual({fred:false,coinbase:false,alpacaSymbols:[]});
  expect(restoreLiveData({coinbase:false,alpacaSymbols:[]})).toEqual({coinbase:false,alpacaSymbols:[]});
  expect(()=>restoreLiveData({coinbase:false,alpacaSymbols:[],fred:true})).toThrow();
  expect(()=>restoreLiveData({coinbase:false,alpacaSymbols:[],fred:'no'})).toThrow();
 });
 it('shows the Allow FRED downloads checkbox only when wired',()=>{
  const off=renderToStaticMarkup(React.createElement(FredCacheSection,{bridge:null,enabled:false,onEnabledChange:()=>{}}));
  expect(off).toContain('Allow FRED downloads');expect(off).not.toMatch(/checked/);expect(off).toContain('copies already saved');
  expect(renderToStaticMarkup(React.createElement(FredCacheSection,{bridge:null}))).not.toContain('Allow FRED');
 });
});

import {WorkspaceAlertObserver} from '../../src/ui/workspace-alert-observer';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
const NOW=Date.UTC(2026,9,28)/1000;
function asSource(datasetId:string,providerId:string,rev:string,lastClose?:number):BarDataset{
 const d=fixtureDataset('GME',3);d.provenance.fixture=false;d.provenance.datasetId=datasetId;d.provenance.providerId=providerId;d.provenance.revision=rev;
 if(lastClose!==undefined){const b=d.bars.at(-1)!;d.bars[d.bars.length-1]={...b,close:lastClose,high:Math.max(b.high,lastClose),low:Math.min(b.low,lastClose)};}
 return d;
}
describe('FRED-4 alert observers treat a revised FRED history as a correction',()=>{
 const ids={fred:['fred:fred-public:DGS10:1D','fred-public'],live:['live:coinbase-public:BTC-USD:1D','coinbase-public']} as const;
 const run=(kind:keyof typeof ids)=>{
  const [id,provider]=ids[kind],o=new WorkspaceAlertObserver(()=>'s'),mk=(rev:string,c?:number)=>({dataset:asSource(id,provider,rev,c),priceSource:'close' as const,replay:null,assumeReplayCompletion:false});
  o.observe(mk('r1'),NOW);const base=asSource(id,provider,'r1').bars.at(-1)!;
  return o.observe(mk('r2',base.close+0.01),NOW+60).event?.observation?.correction;
 };
 it('workspace observer: FRED last-bar revision is a correction, a live one is finalization',()=>{
  expect(run('fred')).toBe(true);expect(run('live')).toBe(false);
 });
 it('technical observer: same exclusion',async()=>{
  const RSI={kind:'indicator',instanceId:'rsi-1',snapshotId:'s1',indicator:'rsi',plotId:'rsi',inputs:{length:14,source:'close'},inputBasis:'standard-ohlc',transformId:'standard'} as never;
  const go=async(kind:keyof typeof ids)=>{
   const [id,provider]=ids[kind],o=new TechnicalAlertObserver(()=>'t',async()=>{},()=>{});
   const mk=(rev:string,c?:number)=>{const d=asSource(id,provider,rev,c);return{dataset:d,bars:d.bars,chartId:'c1',replay:null,assumeReplayCompletion:false,selectedSource:RSI,alerts:[]};};
   await o.observe(mk('r1'),NOW);const v=await o.observe(mk('r2',asSource(id,provider,'r1').bars.at(-1)!.close+0.01),NOW+60);o.dispose();
   return v.events.some(e=>e.observation?.correction);
  };
  expect(await go('fred')).toBe(true);expect(await go('live')).toBe(false);
 });
});
