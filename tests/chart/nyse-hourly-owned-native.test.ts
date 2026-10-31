import {afterEach,expect,it} from 'vitest';
import {qualifiedMtfNative} from '../fixtures/qualified-nyse-mtf-native';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {closeReplay,continueReplaySession,replayChartView,replayTimeline,stepReplaySession} from '../../src/domain/replay-session';
import {hourlyReplayDataset,selectHourlyReplay,selectHourlySecondClock} from '../fixtures/nyse-hourly-replay';
const owned:{dispose():void}[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const item of owned.splice(0).reverse())try{item.dispose();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Synthetic hourly test cleanup failed.');});
async function source(options:Parameters<typeof publishedSource>[0]={}){const value=await publishedSource({resolution:'60m',...options});owned.push(value);return value;}
async function native(data:Parameters<typeof qualifiedMtfNative>[0],options:Parameters<typeof qualifiedMtfNative>[1]={}){const value=await qualifiedMtfNative(data,options);owned.push(value);return value;}
function add(value:Awaited<ReturnType<typeof native>>,waitForClose=true){return value.port.add('sma',{length:2,source:'close'},{presentation:{...defaultIndicatorPresentation('sma'),timeframe:{schemaVersion:1,interval:'1D',waitForClose}}});}
const last=(value:Awaited<ReturnType<typeof native>>,id:string)=>value.port.values(id).series[0]?.values.at(-1);

it('publishes 120 through the actual ordinary hourly provider and actual native indicator owner',async()=>{
 const producer=await source(),chart=await native(producer.regular()),id=add(chart);await flushMtf();expect(last(chart,id)).toBe(120);expect(chart.port.values(id).policies.join(' ')).toContain('New York regular-session');
});
it('waits for the real constructor-ready native seed instead of treating equal hourly rows as acceptance',async()=>{
 const producer=await source(),chart=await native(producer.regular(),{deferInitial:true}),id=add(chart);expect(chart.port.values(id).series).toEqual([]);chart.initialDone();await flushMtf();expect(last(chart,id)).toBe(120);
});
it('keeps an hourly final candle unconfirmed one second before its producer-observed close',async()=>{
 const producer=await source({now:unix('2024-03-11T19:59:59Z')}),chart=await native(producer.regular()),confirmed=add(chart),developing=add(chart,false);await flushMtf();expect(last(chart,confirmed)).toBeNull();expect(last(chart,developing)).toBe(120);
});
it('aggregates the actual raw hourly feed before applying daily HA once',async()=>{
 const producer=await source(),chart=await native(producer.regular(),{style:'heikinashi'}),id=add(chart);await flushMtf();expect(last(chart,id)).toBe(119.25);
});
it('uses actual replay/native adoption before and at the real final half-hour endpoint',async()=>{
 const data=hourlyReplayDataset(),{clock,session}=selectHourlySecondClock(data),chart=await native(data),before=replayChartView(session,data,null);
 await chart.apply(data,before.frame.bars,session.runId);const id=add(chart);await flushMtf();expect(last(chart,id)).toBeNull();
 const next=stepReplaySession(session,replayTimeline([clock])),after=replayChartView(next,data,null);await chart.apply(data,after.frame.bars,next.runId);await flushMtf();expect(last(chart,id)).toBe(120);
});
it('reacquires a fresh restored replay execution through the actual native pipeline',async()=>{
 const data=hourlyReplayDataset(),session=selectHourlyReplay(data,data.bars.at(-1)!.time),before=replayChartView(session,data,null),chart=await native(data);
 await chart.apply(data,before.frame.bars,session.runId);const id=add(chart);await flushMtf();expect(last(chart,id)).toBe(120);
 const saved=closeReplay(session,session.clock!+5).saved!,restored=continueReplaySession(saved,[data],{hourly:'candles'},'60m');expect(restored.runId).not.toBe(session.runId);
 const current=replayChartView(restored,data,null);await chart.apply(data,current.frame.bars,restored.runId);await flushMtf();expect(last(chart,id)).toBe(120);
});
