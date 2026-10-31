import {it,expect} from 'vitest';
import {sessionFixture,sessionGrid} from '../fixtures/r41-session-fixture';
import {cellReplayLayoutFrames,cellReplayLayoutTimeline,cellReplaySources} from '../../src/ui/cell-replay-sessions';
import {replayChartFrame} from '../../src/domain/replay-session';
import {replayStepSourceFor} from '../../src/domain/replay-layout';
import type {ReplaySession} from '../../src/domain/replay-session';
it('All charts replay isolates two sessions sharing one raw source and never reveals post-clock bars',()=>{
 const raw=sessionFixture(),grid=sessionGrid(raw),regularId='spy';grid.layout.cells[1].symbol='GME';grid.cells[regularId].datasetId=raw.provenance.datasetId;
 const session:ReplaySession={schemaVersion:1,sessionId:'synthetic',generation:1,runId:'synthetic-run',scope:'all',phase:'active',activeCellId:'gme',interval:'1m',intervalChoice:'1m',clock:raw.bars[2].time+60,playing:false,stepsPerSecond:1,remainderMilliseconds:0,participants:grid.layout.cells.map(row=>({cellId:row.id,instrumentId:raw.instrument.id,symbol:'GME',interval:'1m',chartType:'candles',datasetId:raw.provenance.datasetId,revision:raw.provenance.revision}))};
 const frames=cellReplayLayoutFrames(session,grid,[raw]);expect(frames.spy.map(row=>row.time)).toEqual(raw.bars.slice(1,3).map(row=>row.time));expect(frames.spy.every(row=>row.time<session.clock!)).toBe(true);
 const switched=cellReplayLayoutFrames({...session,activeCellId:'spy'},grid,[raw]);expect(switched.gme).toHaveLength(3);expect(switched.gme[0].time).toBe(raw.bars[0].time);
 const regularOnly=cellReplayLayoutTimeline({...session,participants:[session.participants[1]]},grid,[raw]);expect(regularOnly).not.toContain(raw.bars[0].time+60);
});
it('a finer replay source retains the chart provider, synthetic flag and explicit session',()=>{
 const chart=sessionFixture('GME','5m'),minute=sessionFixture(),foreign={...minute,provenance:{...minute.provenance,providerId:'other',datasetId:'other'}};
 const sources=cellReplaySources(chart,{session:'regular'},[chart,minute,foreign]);expect(sources).toHaveLength(2);expect(sources.every(row=>row.provenance.session==='regular'&&row.provenance.fixture)).toBe(true);expect(sources.every(row=>row.bars.length===2)).toBe(true);
});

it('fresh regular-hours replay forms a parent solely from matching regular-hours finer bars',()=>{
 const minute=sessionFixture(),chart={...sessionFixture('GME','5m'),bars:[{...minute.bars[1],open:10,high:100,low:1,close:40,volume:100}]},sources=cellReplaySources(chart,{session:'regular'},[chart,minute]),regular=sources.find(row=>row.resolution==='5m')!,step=replayStepSourceFor('1m',regular,sources);
 expect(step?.bars.map(row=>row.time)).toEqual(minute.bars.slice(1,3).map(row=>row.time));const frame=replayChartFrame(regular,minute.bars[1].time+60,step);expect(frame.partial).toBe(true);expect(frame.bars[0].open).toBe(minute.bars[1].open);expect(frame.bars[0].volume).toBe(minute.bars[1].volume);
 for(const changed of [{exchange:'OTHER'},{currency:'EUR'},{tickSize:.05},{lotSize:100}])expect(cellReplaySources(chart,{session:'regular'},[chart,{...minute,instrument:{...minute.instrument,...changed}}])).toHaveLength(1);
});
