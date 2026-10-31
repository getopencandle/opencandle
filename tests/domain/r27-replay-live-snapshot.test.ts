import {describe,expect,it} from 'vitest';
import {adoptLiveSnapshotRevisions,freezeLiveDataset,freezeLiveDatasets,pinReplayDataset,pinReplayDatasets,replayHoldsLive,replaySnapshotsFor,REPLAY_SNAPSHOT_MARK} from '../../src/domain/replay-live-snapshot';
import {closeReplay,continueReplaySession,jumpReplayToRealtime,openReplay,replayChartView,replayTimeline,selectReplayStart,stepReplaySession,type ReplayParticipant} from '../../src/domain/replay-session';
import {replayLayoutFrames} from '../../src/domain/replay-layout';
import type {Bar,BarDataset} from '../../src/domain/types';

// Synthetic bars only (labelled synthetic); the "live" datasets are hand-built stand-ins with live: ids.
const T0=Date.UTC(2026,9,20,14,0,0)/1000;
const bar=(i:number,step=300):Bar=>({time:T0+i*step,open:20+i,high:21+i,low:19+i,close:20.5+i,volume:100+i});
function live(symbol:string,count:number,resolution='5m',revision='live-v1:session-a'):BarDataset{
 const step=resolution==='1m'?60:300;
 return {instrument:{id:'US:'+symbol,symbol,name:symbol+' (synthetic test)',exchange:'US',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},resolution,bars:Array.from({length:count},(_,i)=>bar(i,step)),
  provenance:{providerId:'alpaca-iex',providerName:'SYNTHETIC test feed',datasetId:`live:alpaca-iex:${symbol}:${resolution}`,fixture:false,coverage:'synthetic',asOf:0,delaySeconds:0,adjustment:'split',session:'extended',timezone:'America/New_York',state:'ready',license:'synthetic',revision,notes:[]}} as unknown as BarDataset;
}
const grow=(data:BarDataset,more:number):BarDataset=>({...data,bars:[...data.bars,...Array.from({length:more},(_,i)=>bar(data.bars.length+i,data.resolution==='1m'?60:300))]});
const participant=(cellId:string,data:BarDataset):ReplayParticipant=>({cellId,instrumentId:data.instrument.id,symbol:data.instrument.symbol,interval:data.resolution,chartType:'candles',datasetId:data.provenance.datasetId,revision:data.provenance.revision});

describe('freezing a live chart for Bar Replay',()=>{
 it('copies the loaded bars under a pinned revision; the forming last bar is kept but never counted',()=>{
  const feed=live('GME',10),frozen=freezeLiveDataset(feed)!;
  expect(frozen.provenance.datasetId).toBe(feed.provenance.datasetId);
  expect(frozen.provenance.revision).toBe(`live-v1:session-a${REPLAY_SNAPSHOT_MARK}9:${T0+8*300}`);
  expect(frozen.bars).toEqual(feed.bars);expect(frozen.bars).not.toBe(feed.bars);
  expect(frozen.provenance.notes.at(-1)).toMatch(/frozen copy/);
  expect(freezeLiveDataset(live('GME',1))).toBeNull();
  expect(()=>freezeLiveDataset({...feed,provenance:{...feed.provenance,datasetId:'local-import:x'}})).toThrow(/live/);
 });
 it('replay reads the frozen copy: bars that arrive later are never shown, and the live dataset itself is not a participant',()=>{
  const feed=live('GME',12),held=freezeLiveDatasets([feed]),frozen=pinReplayDataset(feed,held);
  let session=openReplay({participants:[participant('c1',frozen)],activeCellId:'c1',sessionId:'s1'});
  session=selectReplayStart(session,frozen,frozen.bars[5].time,'5m');
  const later=grow(feed,6); // the live feed keeps running underneath
  const pinned=pinReplayDataset(later,held);
  expect(pinned).toBe(frozen);
  const timeline=replayTimeline([pinned]);
  session=stepReplaySession(session,timeline,100);
  const view=replayChartView(session,pinned,null);
  expect(view.frame.bars.map(row=>row.time)).toEqual(feed.bars.slice(0,11).map(row=>row.time)); // 11 closed bars, no forming, nothing new
  expect(()=>replayChartView(session,later,null)).toThrow(/not part of the replay session/);
 });
 it('All charts replay freezes every live chart of the layout and frames each from its copy',()=>{
  const gme=live('GME',12),spy=live('SPY',12),held=freezeLiveDatasets([gme,spy]),datasets=pinReplayDatasets([grow(gme,3),grow(spy,3)],held);
  let session=openReplay({participants:[participant('c1',held[gme.provenance.datasetId]),participant('c2',held[spy.provenance.datasetId])],activeCellId:'c1',scope:'all',sessionId:'s2'});
  session=selectReplayStart(session,datasets[0],gme.bars[4].time,'5m');
  const frames=replayLayoutFrames(session,datasets);
  expect(frames.c2.map(row=>row.time)).toEqual(spy.bars.slice(0,5).map(row=>row.time));
  expect(pinReplayDatasets(datasets,null)).toBe(datasets);
 });
});

describe('snapshot lifecycle follows the session',()=>{
 it('is held while the session lasts, released by Jump to real time and Close, and keeps its identity between steps',()=>{
  const gme=live('GME',8),spy=live('SPY',8),fine=live('GME',40,'1m');
  const session=openReplay({participants:[participant('c1',gme)],activeCellId:'c1',sessionId:'s3'});
  const first=replaySnapshotsFor(null,session,[gme,spy,fine])!;
  expect(Object.keys(first).sort()).toEqual([fine.provenance.datasetId,gme.provenance.datasetId].sort()); // the finer GME series too, never SPY
  expect(replayHoldsLive(first)).toBe(true);
  expect(replaySnapshotsFor(first,session,[grow(gme,5),spy,fine])).toBe(first);
  expect(replaySnapshotsFor(first,jumpReplayToRealtime(session).session,[gme])).toBeNull();
  expect(replaySnapshotsFor(first,null,[gme])).toBeNull();
  expect(replaySnapshotsFor(null,openReplay({participants:[{...participant('c9',gme),datasetId:'local-import:a',instrumentId:'LOCAL:A'}],activeCellId:'c9'}),[gme])).toBeNull();
 });
});

describe('Continue session on a live chart',()=>{
 it('adopts a fresh freeze of the same feed that still covers the saved clock, even after the feed reopened',()=>{
  const feed=live('GME',12),held=freezeLiveDatasets([feed]),frozen=held[feed.provenance.datasetId];
  let session=openReplay({participants:[participant('c1',frozen)],activeCellId:'c1',sessionId:'s4'});
  session=selectReplayStart(session,frozen,frozen.bars[6].time,'5m');
  const saved=closeReplay(session,Date.now()).saved!;
  const reopened=grow({...feed,provenance:{...feed.provenance,revision:'live-v1:session-b'}},4),later=freezeLiveDatasets([reopened]);
  expect(()=>continueReplaySession(saved,[later[feed.provenance.datasetId]],{c1:'candles'},'5m')).toThrow(/revised/);
  const adopted=adoptLiveSnapshotRevisions(saved,later);
  expect(adopted.participants[0].revision).toBe(later[feed.provenance.datasetId].provenance.revision);
  const continued=continueReplaySession(adopted,[later[feed.provenance.datasetId]],{c1:'candles'},'5m');
  expect(continued.clock).toBe(saved.clock);
  // A freeze whose history starts after the saved clock cannot continue it.
  const shifted={...reopened,bars:reopened.bars.slice(9)},none=freezeLiveDatasets([shifted]);
  expect(adoptLiveSnapshotRevisions(saved,none)).toBe(saved);
 });
});
