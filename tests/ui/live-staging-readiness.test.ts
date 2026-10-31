import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {actualCell,actualTree,binding,liveData,newer} from '../fixtures/live-staging-cell';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';

beforeEach(()=>{clearLiveDatasets();vi.useFakeTimers();});
afterEach(()=>{clearLiveDatasets();vi.useRealTimers();});
it('the actual hidden GridCell keeps the exact target snapshot while its real subscription receives newer candles',()=>{
 const original=liveData(),initialLatest=newer(original,2);registerLiveDataset(initialLatest);const cell=actualCell(original);
 try{
  expect(cell.panel().bars).toBe(original.bars);expect(cell.runner().bars).toBe(original.bars);
  const latest=newer(original,3,true);cell.publish(latest);
  expect(cell.panel().bars).toBe(original.bars);expect(cell.runner().bars).toBe(original.bars);
  cell.set({staging:false});expect(cell.panel().bars).toBe(latest.bars);expect(cell.runner().bars).toBe(latest.bars);
 }finally{cell.dispose();}
});
it('ordinary active cells continue consuming the newest real published bars',()=>{
 const original=liveData();registerLiveDataset(newer(original,2));const cell=actualCell(original,false);
 try{expect(cell.panel().bars).not.toBe(original.bars);const latest=newer(original,3,true);cell.publish(latest);expect(cell.panel().bars).toBe(latest.bars);expect(cell.runner().bars).toBe(latest.bars);}finally{cell.dispose();}
});
it('a replacement source/revision supplied during staging cannot borrow the retired subscription',()=>{
 const a=liveData(),b=liveData('SPY','2');registerLiveDataset(newer(a,2));const cell=actualCell(a);
 try{
  registerLiveDataset(newer(b,2));
  cell.set({saved:{...(cell.getProps().saved as any),datasetId:b.provenance.datasetId},dataset:b,datasets:[b],bars:b.bars});
  expect(cell.panel().bars).toBe(b.bars);cell.publish(newer(a,8));expect(cell.panel().bars).toBe(b.bars);
  cell.set({staging:false});expect((cell.panel().bars as typeof b.bars).at(-1)!.close).toBe(14.02);
 }finally{cell.dispose();}
});
it('a supplied replay prefix remains the target and does not grow from an ordinary subscription',()=>{
 const original=liveData();registerLiveDataset(newer(original,2,true));const cell=actualCell(original),prefix=original.bars.slice(0,2);
 try{cell.set({bars:prefix,replayActive:true,executionIdentity:'SYNTHETIC-replay-prefix'});cell.publish(newer(original,5,true));expect(cell.panel().bars).toBe(prefix);cell.set({staging:false});expect(cell.panel().bars).toBe(prefix);}finally{cell.dispose();}
});
for(const [name,bindings]of [['empty',[]],['nonempty',[binding]]] as const)it('real Runtime/coordinator stages '+name+' bindings despite 1Hz live changes, then catches up after publication',async()=>{
 const h=actualTree([...bindings]);let sequence=2,last=h.latest,outcome:unknown;
 const timer=setInterval(()=>{last=newer(h.data,++sequence);h.publish(last);},1000);
 const waiting=h.coordinator.waitUntilReady(h.input,new AbortController().signal);void waiting.then(value=>{outcome=value;},error=>{outcome=error;});
 try{
  // On old source this returns the same exact 30s configuration timeout as the retained UI failure.
  await vi.advanceTimersByTimeAsync(30100);clearInterval(timer);
  expect(outcome instanceof Error?outcome.message:outcome).not.toBe('Native chart configuration did not settle within 30 seconds');
  expect(outcome).not.toBeInstanceOf(Error);const lease=await waiting;
  expect(h.stageCount()).toBe(2);expect(h.commits()).toBe(0);expect(lease.isCurrent()).toBe(true);
  for(const cell of h.cells.values())expect(cell.panel().bars).toBe(h.data.bars);
  expect(lease.publish().publicationErrors).toEqual([]);expect(h.commits()).toBe(1);
  h.published();for(const cell of h.cells.values()){expect(cell.panel().bars).toBe(last.bars);expect(cell.runner().bars).toBe(last.bars);}
 }finally{clearInterval(timer);h.close();}
});
it('a foreign equal-valued active input cannot establish staged native readiness',async()=>{
 const h=actualTree([],1),foreign=h.input.activeBars.map(row=>({...row}));h.input.activeBars=foreign;
 const signal=new AbortController(),waiting=h.coordinator.waitUntilReady(h.input,signal.signal);
 try{await vi.advanceTimersByTimeAsync(100);expect(h.stageCount()).toBe(0);signal.abort();await expect(waiting).rejects.toThrow('cancel');expect(h.commits()).toBe(0);}finally{signal.abort();h.close();}
});
it('source/revision replacement retires a pending stage without a canonical commit',async()=>{
 const h=actualTree([],1),id=h.input.state.layout.activeCellId;h.statuses.set(id,{...h.statuses.get(id)!,settled:false});
 const waiting=h.coordinator.waitUntilReady(h.input,new AbortController().signal);const result=waiting.catch(error=>error);
 try{h.replaceSource();await vi.advanceTimersByTimeAsync(100);expect(await result).toBeInstanceOf(Error);expect((await result).message).toMatch(/superseded/);expect(h.commits()).toBe(0);}finally{h.close();}
});
it('replay execution replacement cannot acquire an ordinary pending tree',async()=>{
 const h=actualTree([],1),id=h.input.state.layout.activeCellId;h.statuses.set(id,{...h.statuses.get(id)!,settled:false});
 const waiting=h.coordinator.waitUntilReady(h.input,new AbortController().signal),result=waiting.catch(error=>error);
 try{h.replay();await vi.advanceTimersByTimeAsync(100);expect((await result).message).toMatch(/superseded/);expect(h.commits()).toBe(0);}finally{h.close();}
});
it('abort releases readiness waiting and a later valid attempt can stage once',async()=>{
 const h=actualTree([],1),id=h.input.state.layout.activeCellId,saved=h.statuses.get(id)!;h.statuses.set(id,{...saved,settled:false});
 const signal=new AbortController(),first=h.coordinator.waitUntilReady(h.input,signal.signal),rejection=first.catch(error=>error);
 try{signal.abort();expect((await rejection).message).toMatch(/cancel/);h.statuses.set(id,saved);const second=h.coordinator.waitUntilReady(h.input,new AbortController().signal);await vi.advanceTimersByTimeAsync(100);const lease=await second;expect(h.stageCount()).toBe(1);expect(h.commits()).toBe(0);lease.dispose();}finally{h.close();}
});
