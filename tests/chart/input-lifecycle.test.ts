import {expect,it} from 'vitest';
import {acceptChartInput} from '../../src/chart/input-lifecycle';
import {createMarketQueue} from '../../src/chart/market-queue';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {chartInputCommitted,type ChartInputSnapshot} from '../../src/chart/input-visibility';
import type {Bar} from '../../src/domain/types';
const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars),a:ChartInputSnapshot={bars,source,style:'candles'};
function native(){let state={bars:[...bars],source},style='candles',mutations=0,release:(()=>void)|null=null,delay=false;const queue=createMarketQueue({read:()=>state,write:value=>{state=value;},apply:async()=>{mutations++;if(delay)await new Promise<void>(resolve=>{release=resolve;});},disposed:()=>false});return{queue,port:{isInputCurrent:(input:ChartInputSnapshot)=>!queue.isPending()&&sameChartSourceBasis(input.source,state.source)&&state.source.inputIdentity===barInputIdentity(input.bars)&&style===input.style,ready:async()=>{},setStyle:(next:string)=>{style=next;return{ok:true as const};},setBars:(next:readonly Bar[],nextSource=state.source)=>queue.set(next,sourceContextForInput(nextSource,next))},mutations:()=>mutations,delay:()=>{delay=true;},release:()=>{release?.();}};}
it('an already prepared exact input skips duplicate native market mutations that would erase restored frame state',async()=>{
 const test=native(),result=await acceptChartInput(test.port,a,()=>true);expect(result).toMatchObject({accepted:true});expect(test.mutations()).toBe(0);if(!result.accepted)throw new Error('Expected accepted input');expect(result.input.bars).toBe(bars);expect(result.input.source).not.toBe(source);
});
it('C completion under newer D props carries actual C readiness instead of inventing D readiness',async()=>{
 const test=native(),c={...a,source:{...source,datasetId:'C'}},d={...a,source:{...source,datasetId:'D'}};test.delay();const completed=acceptChartInput(test.port,c,()=>true);await Promise.resolve();await Promise.resolve();let latestProps=d;test.release();const result=await completed;if(!result.accepted)throw new Error('Expected C commit');const callbackTag=result.input;expect(callbackTag.source.datasetId).toBe('C');expect(chartInputCommitted(callbackTag,latestProps)).toBe(false);latestProps=c;expect(chartInputCommitted(callbackTag,latestProps)).toBe(true);
});
it('same-array revision changes mutate native input; a values-equal fresh array cannot bypass identity',async()=>{
 const test=native(),revision={...a,source:{...source,revision:'2'}};expect((await acceptChartInput(test.port,revision,()=>true)).accepted).toBe(true);expect(test.mutations()).toBe(1);const cloned={...revision,bars:structuredClone(bars)};expect((await acceptChartInput(test.port,cloned,()=>true)).accepted).toBe(true);expect(test.mutations()).toBe(2);
});
it('queued earlier input prevents a premature exact-input shortcut and cancellation withholds readiness',async()=>{
 const test=native();test.delay();const prior=test.queue.set(bars,{...source,revision:'queued'});expect(test.queue.isPending()).toBe(true);const wanted=acceptChartInput(test.port,a,()=>true);await Promise.resolve();await Promise.resolve();test.release();await prior;await Promise.resolve();await Promise.resolve();test.release();expect((await wanted).accepted).toBe(true);expect(test.mutations()).toBe(2);expect(test.queue.isPending()).toBe(false);expect(await acceptChartInput(test.port,a,()=>false)).toEqual({accepted:false});
});
