import {describe,expect,it} from 'vitest';
import {WATCH_BENCHMARK_LIMIT,createWatchBenchmarks,pruneWatchBenchmarks,restoreWatchBenchmarks,setWatchBenchmark} from '../../src/watchlists/advanced';

// The benchmark is the user's pick among imported datasets. No default is ever chosen.
describe('watchBenchmarks',()=>{
 it('starts empty, restores exact keys only, and round-trips byte-identically',()=>{
  const empty=createWatchBenchmarks();expect(empty).toEqual({schemaVersion:1,byList:{}});
  const one=setWatchBenchmark(empty,'list-a','spy:1D');expect(one.byList).toEqual({'list-a':'spy:1D'});expect(JSON.stringify(restoreWatchBenchmarks(JSON.parse(JSON.stringify(one))))).toBe(JSON.stringify(one));
  expect(()=>restoreWatchBenchmarks({...one,extra:1})).toThrow();expect(()=>restoreWatchBenchmarks({schemaVersion:2,byList:{}})).toThrow();expect(()=>restoreWatchBenchmarks({schemaVersion:1})).toThrow();
  expect(()=>restoreWatchBenchmarks({schemaVersion:1,byList:{a:''}})).toThrow();expect(()=>restoreWatchBenchmarks({schemaVersion:1,byList:{a:5}})).toThrow();expect(()=>restoreWatchBenchmarks({schemaVersion:1,byList:[]})).toThrow();
  expect(()=>restoreWatchBenchmarks(JSON.parse('{"schemaVersion":1,"byList":{"__proto__":"x"}}'))).toThrow();
 });
 it('keeps at most 200 entries',()=>{
  const byList=Object.fromEntries(Array.from({length:WATCH_BENCHMARK_LIMIT},(_,i)=>['list-'+i,'ds-'+i]));expect(Object.keys(restoreWatchBenchmarks({schemaVersion:1,byList}).byList)).toHaveLength(200);
  expect(()=>restoreWatchBenchmarks({schemaVersion:1,byList:{...byList,extra:'x'}})).toThrow('200');expect(()=>setWatchBenchmark({schemaVersion:1,byList},'one-more','x')).toThrow('200');
 });
 it('setting null clears; a deleted list is pruned on the next save and flagged lists stay',()=>{
  let b=setWatchBenchmark(setWatchBenchmark(setWatchBenchmark(createWatchBenchmarks(),'keep','a'),'gone','b'),'flag:red','c');
  expect(pruneWatchBenchmarks(b,['keep']).byList).toEqual({keep:'a','flag:red':'c'});expect(setWatchBenchmark(b,'gone',null).byList).toEqual({keep:'a','flag:red':'c'});
 });
});
