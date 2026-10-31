// The switch-path guards change speed only. Each check pins the unchanged result next to the skipped work.
import {describe,expect,it,vi} from 'vitest';
import {rendererPatchIsNoop} from '../../src/chart/adapter';
import {createObservationScheduler} from '../../src/ui/technical-alert-observer';
import {structuralKey} from '../../src/ui/use-structural-value';
import {watchQuote} from '../../src/watchlists/quotes';
import {fixtureDataset} from '../../src/domain/fixtures';
import {referenceFromDataset} from '../../src/watchlists/model';

describe('rendererPatchIsNoop',()=>{
 const current={version:1,chartTypes:{lv:{a:1,b:{x:1}},candles:{up:'#0f0'}},layout:{background:'#000',fontSize:12},priceScale:{mode:'normal',log:false}};
 it('skips a patch whose every leaf already holds',()=>{
  expect(rendererPatchIsNoop(current,{layout:{background:'#000'},chartTypes:{lv:{a:1,b:{x:1}}}})).toBe(true);
  expect(rendererPatchIsNoop(current,{})).toBe(true);
 });
 it('applies any change, unknown key, other shape or chart-type value that is not deeply equal',()=>{
  expect(rendererPatchIsNoop(current,{layout:{background:'#111'}})).toBe(false);
  expect(rendererPatchIsNoop(current,{layout:{unknown:1}})).toBe(false);
  expect(rendererPatchIsNoop(current,{layout:{background:{}}})).toBe(false);
  expect(rendererPatchIsNoop(current,{chartTypes:{lv:{b:{x:1,y:2}}}})).toBe(false);
  expect(rendererPatchIsNoop(current,{chartTypes:{renko:{}}})).toBe(false);
  expect(rendererPatchIsNoop(current,{priceScale:{log:0}})).toBe(false);
  expect(rendererPatchIsNoop(null,{})).toBe(false);
  expect(rendererPatchIsNoop(current,null)).toBe(false);
 });
});

describe('createObservationScheduler',()=>{
 it('runs at once without an idle callback, as before',()=>{
  const run=vi.fn(),scheduler=createObservationScheduler(run,{});
  scheduler.request();scheduler.request();expect(run).toHaveBeenCalledTimes(2);expect(scheduler.pending).toBe(false);
 });
 it('coalesces requests into one idle run with a deadline and cancels it',()=>{
  const callbacks:(()=>void)[]=[],options:unknown[]=[],cancelled:number[]=[];
  const host={requestIdleCallback:(callback:()=>void,option?:{timeout?:number})=>{callbacks.push(callback);options.push(option);return callbacks.length;},cancelIdleCallback:(handle:number)=>{cancelled.push(handle);}};
  const run=vi.fn(),scheduler=createObservationScheduler(run,host,100);
  scheduler.request();scheduler.request();expect(callbacks).toHaveLength(1);expect(options[0]).toEqual({timeout:100});expect(run).not.toHaveBeenCalled();
  callbacks[0]();expect(run).toHaveBeenCalledTimes(1);expect(scheduler.pending).toBe(false);
  scheduler.request();scheduler.cancel();expect(cancelled).toEqual([2]);expect(scheduler.pending).toBe(false);
  scheduler.request();expect(callbacks).toHaveLength(3);
 });
});

describe('structuralKey',()=>{
 it('tells apart what JSON merges',()=>{
  expect(structuralKey({a:undefined})).not.toBe(structuralKey({}));
  expect(structuralKey({a:Number.NaN})).not.toBe(structuralKey({a:null}));
  expect(structuralKey({a:-0})).not.toBe(structuralKey({a:0}));
  expect(structuralKey({a:[1,{b:2}]})).toBe(structuralKey({a:[1,{b:2}]}));
 });
});

describe('watchQuote reuse',()=>{
 it('returns an equal fresh quote while the sources are the same and recomputes when bars change',()=>{
  const daily=fixtureDataset('GME',400);daily.provenance.datasetId='synthetic-fix-switch';const reference=referenceFromDataset(daily);
  const first=watchQuote(reference,[daily]),second=watchQuote(reference,[daily]);
  expect(second).toEqual(first);expect(second).not.toBe(first);
  const grown={...daily,bars:[...daily.bars,{...daily.bars.at(-1)!,time:daily.bars.at(-1)!.time+86400,close:daily.bars.at(-1)!.close+1}]};
  const third=watchQuote(reference,[grown]);expect(third.last).toBe(grown.bars.at(-1)!.close);expect(third.dataset).toBe(grown);
 });
 it('never shares a generated synthetic fixture dataset between calls',()=>{
  const reference={symbol:'GME',exchange:'SYNTHETIC',datasetId:'lv-synthetic-v1:GME',dailyDatasetId:null,synthetic:true};
  const first=watchQuote(reference,[]),second=watchQuote(reference,[]);
  expect(second).toEqual(first);expect(second.dataset).not.toBe(first.dataset);
 });
});
