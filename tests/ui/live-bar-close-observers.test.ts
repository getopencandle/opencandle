import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {WorkspaceAlertObserver,type WorkspaceAlertInput,type WorkspaceAlertView} from '../../src/ui/workspace-alert-observer';
import {TechnicalAlertObserver,type TechnicalAlertInput} from '../../src/ui/technical-alert-observer';
import {createLocalAlert,processAlertEvent} from '../../src/domain/alerts';
import type {AlertDefinition,AlertEvent} from '../../src/domain/alerts';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';

const T0=Date.UTC(2026,9,20,15,0,0)/1000,S=300;
const bar=(time:number,close:number):Bar=>({time,open:100,high:Math.max(100,close)+1,low:Math.min(100,close)-1,close,volume:1});
let rev=0;
function live(closes:number[],start=T0-S):BarDataset{
 const d=fixtureDataset('BTC',closes.length);d.bars=closes.map((c,i)=>bar(start+i*S,c));
 d.resolution='5m';d.provenance.fixture=false;d.provenance.providerId='coinbase-public';d.provenance.datasetId='live:coinbase:BTC-USD:5m';d.provenance.revision=`live-v1:s:${++rev}`;return d;
}
const fire=(alert:ReturnType<typeof createLocalAlert>,events:AlertEvent[])=>events.reduce((a,e)=>processAlertEvent(a,e).alert,alert);
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(T0*1000+60_000);});
afterEach(()=>vi.useRealTimers());

describe('workspace observer: once per bar close',()=>{
 it('fires exactly once on the bar close, not on the forming bar, not after reconnect',()=>{
  const observer=new WorkspaceAlertObserver(()=>'s1');
  const input=(d:BarDataset):WorkspaceAlertInput=>({dataset:d,priceSource:'close',replay:null,assumeReplayCompletion:false});
  const now=T0+100;
  const first=observer.observe(input(live([9,9])),now);
  expect(first.diagnostics).toEqual([]);const ctx=first.context!;
  const def:AlertDefinition={id:'a',name:'close',message:'m',instrumentId:ctx.instrumentId,sourceId:ctx.sourceId,mode:ctx.mode,runId:ctx.runId,observationBinding:ctx.binding,frequency:'once-per-bar-close',condition:{kind:'greater',value:10},createdAt:T0,expiresAt:null};
  let alert=createLocalAlert(def);
  // forming bar crosses 10: no firing
  const forming=observer.observe(input(live([9,12])),now+30);
  expect(forming.closedEvents).toBeUndefined();
  alert=fire(alert,forming.event?[forming.event]:[]);expect(alert.history).toEqual([]);
  // next bar opens: previous bar closes first, then the new forming bar is evaluated
  const opened=observer.observe(input(live([9,12,5])),now+60);
  expect(opened.closedEvents).toHaveLength(1);expect(opened.closedEvents![0].barClosed).toBe(true);
  expect(opened.closedEvents![0].observation?.completion).toBe('observed-closed');
  alert=fire(alert,[...opened.closedEvents!,...(opened.event?[opened.event]:[])]);expect(alert.history.length).toBe(1);
  // reconnect replays the same bars
  const again=observer.observe(input(live([9,12,5])),now+90);
  const replayed=observer.observe(input(live([9,9,12,5],T0-2*S)),now+120);
  alert=fire(alert,[...(again.closedEvents??[]),...(replayed.closedEvents??[])]);
  expect(alert.history.length).toBe(1);
  observer.dispose();
 });
 it('clock close with no new data is delivered through the callback once',()=>{
  const got:WorkspaceAlertView[]=[];
  const observer=new WorkspaceAlertObserver(()=>'s1',v=>got.push(v));
  const input=(d:BarDataset):WorkspaceAlertInput=>({dataset:d,priceSource:'close',replay:null,assumeReplayCompletion:false});
  observer.observe(input(live([9,12])),T0+100);
  vi.advanceTimersByTime(300_000);
  expect(got.length).toBe(1);expect(got[0].closedEvents![0].barClosed).toBe(true);
  observer.dispose();vi.advanceTimersByTime(900_000);expect(got.length).toBe(1);
 });
 it('non-live datasets create no watcher and behave unchanged',()=>{
  const observer=new WorkspaceAlertObserver(()=>'s1');
  const d=fixtureDataset('GME',3);
  const a=observer.observe({dataset:d,priceSource:'close',replay:null,assumeReplayCompletion:false},T0);
  expect(a.closedEvents).toBeUndefined();expect(vi.getTimerCount()).toBe(0);
 });
});

describe('technical observer: once per bar close',()=>{
 it('closed bar is evaluated first with barClosed; reconnect does not re-close',async()=>{
  let ids=0;const observer=new TechnicalAlertObserver(()=>`t${++ids}`,async()=>{});
  const source={kind:'price' as const,field:'close' as const,transformId:'standard' as const};
  const input=(d:BarDataset):TechnicalAlertInput=>({dataset:d,bars:d.bars,chartId:'c1',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:[]});
  const now=T0+100;
  await observer.observe(input(live([9,9])),now);
  const forming=await observer.observe(input(live([9,12])),now+30);
  expect(forming.closedEvents).toBeUndefined();expect(forming.events[0].barClosed).toBe(false);
  const opened=await observer.observe(input(live([9,12,5])),now+60);
  expect(opened.closedEvents).toHaveLength(1);
  expect(opened.closedEvents![0].barClosed).toBe(true);expect(opened.closedEvents![0].observation?.completion).toBe('observed-closed');
  expect(opened.closedEvents![0].observation?.sourceTime).toBe(T0);
  const again=await observer.observe(input(live([9,9,12,5],T0-2*S)),now+90);
  expect(again.closedEvents).toBeUndefined();
  observer.dispose();
 });
 it('non-live datasets create no watcher',async()=>{
  const observer=new TechnicalAlertObserver(()=>'t1',async()=>{});
  const d=fixtureDataset('GME',5);
  const v=await observer.observe({dataset:d,bars:d.bars,chartId:'c1',replay:null,assumeReplayCompletion:false,selectedSource:{kind:'price',field:'close',transformId:'standard'},alerts:[]},T0);
  expect(v.closedEvents).toBeUndefined();expect(vi.getTimerCount()).toBe(0);
 });
});
