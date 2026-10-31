import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveBarCloseWatcher,LiveBarSeries} from '../../src/domain/live-bars';
import {closedBarDataset} from '../../src/domain/live-provider';
import {createLocalAlert,processAlertEvent} from '../../src/domain/alerts';
import type {AlertDefinition} from '../../src/domain/alerts';
import {alertObservationContext,createAlertObservationSession,observeAlertSnapshot} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';

const T0=Date.UTC(2026,9,20,15,0,0)/1000, S=300;
const bar=(time:number,close=100):Bar=>({time,open:100,high:Math.max(100,close)+1,low:Math.min(100,close)-1,close,volume:1});

describe('live bar close (the reference app way)',()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(T0*1000+60_000);});
  afterEach(()=>vi.useRealTimers());
  const make=()=>{const closed:Array<[number,string]>=[];const w=new LiveBarCloseWatcher({seconds:S,onClose:(b,r)=>closed.push([b.time,r])});return {w,closed};};

  it('treats bars present at startup as history, then fires when a newer bar opens',()=>{
    const {w,closed}=make();
    w.update([bar(T0-S),bar(T0)]);expect(closed).toEqual([]);
    w.update([bar(T0-S),bar(T0,105)]);expect(closed).toEqual([]);
    w.update([bar(T0-S),bar(T0,105),bar(T0+S)]);expect(closed).toEqual([[T0,'newer-bar']]);
    w.dispose();
  });
  it('fires from the wall clock after the interval end plus grace, with no further data',()=>{
    const {w,closed}=make();w.update([bar(T0-S),bar(T0)]);
    vi.setSystemTime((T0+S)*1000+1500);vi.advanceTimersByTime(240_000+1500);
    expect(closed).toEqual([]); // inside the 2s grace
    vi.advanceTimersByTime(600);
    expect(closed).toEqual([[T0,'clock']]);
    w.dispose();
  });
  it('reports each bar time once: clock close then the newer bar, reconnect and backfill replays do not re-fire',()=>{
    const {w,closed}=make();w.update([bar(T0)]);
    vi.advanceTimersByTime(243_000);
    expect(closed).toEqual([[T0,'clock']]);
    w.update([bar(T0),bar(T0+S)]);w.update([bar(T0-S),bar(T0),bar(T0+S)]); // append + REST backfill replay
    w.update([bar(T0-2*S),bar(T0-S),bar(T0)]);
    expect(closed).toEqual([[T0,'clock']]);
    w.update([bar(T0),bar(T0+S),bar(T0+2*S)]);
    expect(closed.map(c=>c[0])).toEqual([T0,T0+S]);
    w.dispose();
  });
  it('after a gap only the newest closed bar is reported, and dispose cancels the timer',()=>{
    const {w,closed}=make();w.update([bar(T0)]);
    w.update([bar(T0),bar(T0+S),bar(T0+2*S),bar(T0+3*S)]);
    expect(closed.map(c=>c[0])).toEqual([T0+2*S]);
    w.dispose();vi.setSystemTime((T0+10*S)*1000);vi.advanceTimersByTime(10*S*1000);
    expect(closed.length).toBe(1);
  });
  it('works against a LiveBarSeries',()=>{
    const s=new LiveBarSeries({seconds:S,baseSeconds:S,ticks:false,aligned:true});const {w,closed}=make();
    s.setBackfill([bar(T0)]);w.update(s.bars);
    s.applyBase(bar(T0+S,101));w.update(s.bars);
    expect(closed).toEqual([[T0,'newer-bar']]);w.dispose();
  });
});

describe('alert evaluation of a closed live bar',()=>{
  const live=(closes:number[]):BarDataset=>{
    const d=fixtureDataset('BTC',closes.length);d.bars=closes.map((c,i)=>bar(T0+i*S,c));
    d.provenance.fixture=false;d.provenance.providerId='coinbase-public';d.provenance.datasetId='live:coinbase:BTC-USD:5m';d.provenance.revision='live-v1:s:1';return d;
  };
  const now=T0+10*S;
  function setup(){
    const first=live([9,9]);const session=createAlertObservationSession(first,{sessionId:'s1',mode:'ordinary',startedAt:T0});
    const ctx=alertObservationContext(session,first);
    const def:AlertDefinition={id:'a',name:'close',message:'m',instrumentId:ctx.instrumentId,sourceId:ctx.sourceId,mode:ctx.mode,runId:ctx.runId,observationBinding:ctx.binding,frequency:'once-per-bar-close',condition:{kind:'greater',value:10},createdAt:T0,expiresAt:null};
    return {session,alert:createLocalAlert(def)};
  }
  it('forming bars never fire a once-per-bar-close alert; the completed bar fires once with barClosed true',()=>{
    let {session,alert}=setup();
    const forming=live([9,12]);forming.provenance.revision='live-v1:s:2';
    const a=observeAlertSnapshot(session,{dataset:forming,observedAt:now});session=a.session;
    expect(a.event?.barClosed).toBe(false);
    alert=processAlertEvent(alert,a.event!).alert;expect(alert.history).toEqual([]);
    const closedData=closedBarDataset(forming,T0+S)!;
    const b=observeAlertSnapshot(session,{dataset:closedData,observedAt:now+1,barClosed:true});
    expect(b.event?.barClosed).toBe(true);expect(b.event?.observation?.completion).toBe('observed-closed');
    const fired=processAlertEvent(alert,b.event!);
    expect(fired.notification?.value).toBe(12);expect(fired.alert.history.length).toBe(1);
    // the same close re-observed (reconnect) is deduped by fingerprint and cannot fire again
    const again=observeAlertSnapshot(b.session,{dataset:closedData,observedAt:now+2,barClosed:true});
    expect(again.event).toBeNull();
  });
  it('refuses a bar-close claim on non-live data or replay',()=>{
    const {session}=setup();const local=live([9,12]);local.provenance.datasetId='original-file';
    expect(observeAlertSnapshot(session,{dataset:local,observedAt:now,barClosed:true}).event).toBeNull();
    expect(closedBarDataset(local,T0)).toBeNull();
  });
});
