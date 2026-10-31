import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WorkspaceAlertObserver,type WorkspaceAlertInput} from '../../src/ui/workspace-alert-observer';
import {createLocalAlert,processAlertEvent,type AlertDefinition,type AlertEvent} from '../../src/domain/alerts';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

const T0=Date.UTC(2026,9,20,15,0,0)/1000;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(T0*1000);});
afterEach(()=>vi.useRealTimers());
const fire=(alert:ReturnType<typeof createLocalAlert>,events:AlertEvent[])=>events.reduce((a,e)=>processAlertEvent(a,e).alert,alert);

it('Coinbase 1m: once-per-bar-close crossing survives the per-minute REST volume reconcile',()=>{
 // Coinbase 1m wiring: base 60, ticks with size null (volume 0), REST reconcile of closed minutes.
 const series=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});
 series.setBackfill([{time:T0-120,open:9,high:9,low:9,close:9,volume:5},{time:T0-60,open:9,high:9,low:9,close:9,volume:5}]);
 const snap=():BarDataset=>{const d=fixtureDataset('BTC',1);d.bars=series.bars;d.resolution='1m';d.provenance.fixture=false;d.provenance.providerId='coinbase-public';d.provenance.datasetId='live:coinbase:BTC-USD:1m';d.provenance.revision='live-v1:s:1';return d;};
 const input=(d:BarDataset):WorkspaceAlertInput=>({dataset:d,priceSource:'close',replay:null,assumeReplayCompletion:false});
 const observer=new WorkspaceAlertObserver(()=>'s1');
 let now=T0+1;const ctx=observer.observe(input(snap()),now).context!;
 const def:AlertDefinition={id:'a',name:'x',message:'m',instrumentId:ctx.instrumentId,sourceId:ctx.sourceId,mode:ctx.mode,runId:ctx.runId,observationBinding:ctx.binding,frequency:'once-per-bar-close',condition:{kind:'crossing-up',value:10},createdAt:T0,expiresAt:null};
 let alert=createLocalAlert(def);
 const step=(t:number)=>{now=t;vi.setSystemTime(t*1000);const v=observer.observe(input(snap()),t);alert=fire(alert,[...(v.closedEvents??[]),...(v.event?[v.event]:[])]);return v;};
 // Minute T0 closes at 9, minute T0+60 closes at 12 (crosses 10 on bar close).
 for(let m=0;m<4;m++){
  const start=T0+m*60,close=m===2?12:9;
  series.applyTick({time:start+1,price:close});step(start+2);
  // REST reconcile of the just-closed minute (real volume, live volume was 0) lands a second later.
  if(m>0)series.reconcile([{...series.bars.at(-2)!,volume:7}]);step(start+3);
 }
 // minute T0+120 closed at 12 after T0+60 closed at 9: one crossing-up on bar close
 expect(alert.history.length).toBe(1);
 observer.dispose();
});

it('a corrected close of an earlier live bar is still a correction for a close alert; volume alone is not',async()=>{
 const {liveHistoryCorrected,priceSourceFields}=await import('../../src/domain/alert-observation');
 // The newest two bars may be finalized in place; corrections concern older bars (index 0 of three here).
 const prev=[{time:1,open:1,high:2,low:1,close:2,volume:0},{time:2,open:2,high:2,low:2,close:2,volume:0},{time:3,open:2,high:2,low:2,close:2,volume:0}];
 expect(liveHistoryCorrected(prev,[{...prev[0],volume:9},prev[1],prev[2]],priceSourceFields('close'))).toBe(false);
 expect(liveHistoryCorrected(prev,[{...prev[0],close:3},prev[1],prev[2]],priceSourceFields('close'))).toBe(true);
 expect(liveHistoryCorrected(prev,[{...prev[0],high:3},prev[1],prev[2]],priceSourceFields('hl2'))).toBe(true);
 expect(liveHistoryCorrected(prev,[{...prev[0],volume:9},prev[1],prev[2]])).toBe(true);
 expect(liveHistoryCorrected(prev,[{...prev[0],time:0},prev[1],prev[2]],priceSourceFields('close'))).toBe(true);
});
