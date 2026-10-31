import {captureAlpacaSessionCompletion} from '../../src/domain/live-session-source';
import {expect,it} from 'vitest';
import {barCloseTime,captureReplayFrameCompletion,closeReplay,openReplay,replayBarCloseTime,replayChartFrame,replayChartView,replayStartCandidate,replayTimeline,selectReplayStart,stepReplaySession} from '../../src/domain/replay-session';
import {adoptLiveSnapshotRevisions,freezeLiveDataset} from '../../src/domain/replay-live-snapshot';
import {publishedSource,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {planNyseDailyTimeframe,alignHigherTimeframe} from '../../src/domain/indicator-resample';
import {nyseRegularBarRange} from '../../src/domain/nyse-session-bars';
import {hourlyReplayDataset,hourlyParticipant,selectHourlyReplay,selectHourlySecondClock,HOURLY_MONDAY_CLOSE} from '../fixtures/nyse-hourly-replay';

it('keeps nominal public arithmetic while the qualified final hour ends at the real session close',()=>{
 const data=hourlyReplayDataset(),last=data.bars.at(-1)!;expect(barCloseTime(last,'60m')).toBe(1710189000);expect(replayBarCloseTime(data,last)).toBe(HOURLY_MONDAY_CLOSE);
});
it('uses the true close for clicked start selection and the accepted replay frame',()=>{
 const data=hourlyReplayDataset(),session=selectHourlyReplay(data,data.bars.at(-1)!.time),view=replayChartView(session,data,null);expect(session.clock).toBe(HOURLY_MONDAY_CLOSE);expect(view.frame.completeBars).toBe(14);expect(captureReplayFrameCompletion(view.frame.bars,data)?.closedThrough).toBe(HOURLY_MONDAY_CLOSE);
 expect(replayStartCandidate(data,HOURLY_MONDAY_CLOSE)).toMatchObject({ok:false});
});
it('puts the actual DST and early-close boundaries on the replay timeline',()=>{
 const data=hourlyReplayDataset(),timeline=replayTimeline([data]);expect(timeline).toContain(1709931600);expect(timeline).toContain(HOURLY_MONDAY_CLOSE);expect(timeline).not.toContain(1709933400);expect(timeline).not.toContain(1710189000);
 const early=hourlyReplayDataset(1732890600,4);expect(replayTimeline([early]).at(-1)).toBe(1732903200);expect(selectHourlyReplay(early,early.bars.at(-1)!.time).clock).toBe(1732903200);
});
it('uses an actual second-clock replay to withhold the final hour one second before close',()=>{
 const data=hourlyReplayDataset(),{session}=selectHourlySecondClock(data),view=replayChartView(session,data,null),lease=captureReplayFrameCompletion(view.frame.bars,data)!;expect(session.clock).toBe(HOURLY_MONDAY_CLOSE-1);expect(view.frame.completeBars).toBe(13);expect(lease.completeRows).toBe(13);expect(lease.closedThrough).toBe(HOURLY_MONDAY_CLOSE-1);
 const planned=planNyseDailyTimeframe(view.frame.bars,'60m',{...lease,coveredFrom:-Infinity});expect(planned.ok).toBe(true);if(!planned.ok)throw Error(planned.message);expect(planned.plan.confirmedAt).toEqual([6,null]);expect(alignHigherTimeframe([null,120],planned.plan,13,true).at(-1)).toBeNull();
});
it('reveals the real half-hour endpoint on the next actual clock event and retires the old observation',()=>{
 const data=hourlyReplayDataset(),{clock,session}=selectHourlySecondClock(data),before=replayChartView(session,data,null),lease=captureReplayFrameCompletion(before.frame.bars,data)!;
 const next=stepReplaySession(session,replayTimeline([clock])),after=replayChartView(next,data,null),current=captureReplayFrameCompletion(after.frame.bars,data)!;expect(next.clock).toBe(HOURLY_MONDAY_CLOSE);expect(after.frame.completeBars).toBe(14);expect(()=>lease.assertCurrent()).toThrow();expect(current.completeRows).toBe(14);
 const planned=planNyseDailyTimeframe(after.frame.bars,'60m',{...current,coveredFrom:-Infinity});expect(planned.ok).toBe(true);if(!planned.ok)throw Error(planned.message);expect(alignHigherTimeframe([null,120],planned.plan,14,true).at(-1)).toBe(120);
});
it('builds a developing last hour only from genuinely revealed finer rows',()=>{
 const data=hourlyReplayDataset(),{clock,session}=selectHourlySecondClock(data),view=replayChartView(session,data,clock),lease=captureReplayFrameCompletion(view.frame.bars,data)!;expect(view.frame.completeBars).toBe(13);expect(view.frame.partial).toBe(true);expect(view.frame.bars.at(-1)?.close).toBe(160);
 const planned=planNyseDailyTimeframe(view.frame.bars,'60m',{...lease,coveredFrom:-Infinity});expect(planned.ok).toBe(true);if(!planned.ok)throw Error(planned.message);expect(planned.plan.confirmedAt).toEqual([6,null]);expect(planned.plan.bars.at(-1)?.close).toBe(160);expect(alignHigherTimeframe([null,135],planned.plan,14,true).at(-1)).toBeNull();expect(alignHigherTimeframe([null,135],planned.plan,14,false).at(-1)).toBe(135);
});
it('does not inspect future hourly OHLC while deciding that its close is still unavailable',()=>{
 const data=hourlyReplayDataset(),{session}=selectHourlySecondClock(data);let reads=0;Object.defineProperty(data.bars[13],'high',{get(){reads++;throw Error('SYNTHETIC future hourly price read');},enumerable:true});expect(replayChartView(session,data,null).frame.completeBars).toBe(13);expect(reads).toBe(0);
});
it('does not inspect future second-bar OHLC while constructing the developing hour',()=>{
 const data=hourlyReplayDataset(),{clock,session}=selectHourlySecondClock(data);let reads=0;Object.defineProperty(clock.bars[1],'close',{get(){reads++;throw Error('SYNTHETIC future second price read');},enumerable:true});expect(replayChartView(session,data,clock).frame.bars.at(-1)?.close).toBe(160);expect(reads).toBe(0);
});
it('preserves nominal arithmetic for unrelated data and rejects unsupported calendar rows',()=>{
 const data=hourlyReplayDataset(),bar=data.bars.at(-1)!,crypto={...data,instrument:{...data.instrument,assetClass:'crypto' as const}};expect(replayBarCloseTime(crypto,bar)).toBe(barCloseTime(bar,'60m'));
 const unknown={...data,provenance:{...data.provenance,session:'unknown' as const}};expect(replayBarCloseTime(unknown,bar)).toBe(barCloseTime(bar,'60m'));
 expect(nyseRegularBarRange(1732804200,3600)).toBeNull();expect(nyseRegularBarRange(1709906400,3600)).toBeNull();expect(replayChartFrame(crypto,HOURLY_MONDAY_CLOSE).completeBars).toBe(13);
});
it('does not overstate a real frozen hourly source coverage by the final half hour during restore adoption',async()=>{
 const producer=await publishedSource({resolution:'60m'});
 try{
  const initial=freezeLiveDataset(producer.raw())!;expect(initial).not.toBeNull();
  const template=hourlyReplayDataset(),clock={...template,instrument:initial.instrument,resolution:'1s',bars:[{time:HOURLY_MONDAY_CLOSE+899,open:1,high:1,low:1,close:1,volume:1}],provenance:{...template.provenance,datasetId:'SYNTHETIC:restore-clock',revision:'SYNTHETIC:restore-clock:1'}};
  const session=selectReplayStart(openReplay({participants:[hourlyParticipant(initial),hourlyParticipant(clock,'clock')],activeCellId:'clock',scope:'all'}),clock,clock.bars[0].time,'1s'),saved=closeReplay(session,session.clock!+1).saved!;
  producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:HOURLY_MONDAY_CLOSE+60,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();
  const current=freezeLiveDataset(producer.raw())!;expect(current.provenance.revision).not.toBe(initial.provenance.revision);
  expect(adoptLiveSnapshotRevisions(saved,{[current.provenance.datasetId]:current})).toBe(saved);
 }finally{producer.dispose();}
});

it('selects hourly endpoint arithmetic for declared raw Alpaca feeds without changing unrelated unknown sessions',()=>{
 const data=hourlyReplayDataset(),bar=data.bars.at(-1)!;for(const providerId of ['alpaca-iex','alpaca-stub','alpaca-sip-delayed']){const raw={...data,provenance:{...data.provenance,session:'unknown' as const,providerId}};expect(replayBarCloseTime(raw,bar)).toBe(HOURLY_MONDAY_CLOSE);expect(captureAlpacaSessionCompletion(raw,raw.bars)).toBeNull();}
 const unknown={...data,provenance:{...data.provenance,session:'unknown' as const}};expect(replayBarCloseTime(unknown,bar)).toBe(barCloseTime(bar,'60m'));
});
it('does not lend genuine provider completion to copied metadata or copied rows after selecting the same close arithmetic',async()=>{
 const producer=await publishedSource({resolution:'60m'});try{const raw=producer.raw(),copy={...raw,instrument:{...raw.instrument},provenance:{...raw.provenance},bars:raw.bars.map(row=>({...row}))};expect(raw.provenance.session).toBe('unknown');expect(replayBarCloseTime(copy,copy.bars.at(-1)!)).toBe(HOURLY_MONDAY_CLOSE);expect(captureAlpacaSessionCompletion(copy,copy.bars)).toBeNull();const view=producer.regular(),lease=captureAlpacaSessionCompletion(view,view.bars);expect(lease).not.toBeNull();expect(captureAlpacaSessionCompletion(view,[...view.bars])).toBeNull();expect(()=>lease!.assertCurrent()).not.toThrow();}finally{producer.dispose();}
});
