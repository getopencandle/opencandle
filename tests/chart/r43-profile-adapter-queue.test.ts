import {afterEach,it,expect} from 'vitest';
import {profileAdapterHarness} from '../fixtures/r43-profile-adapter';
import {fixtures,source} from '../fixtures/r43-profile-source';
import {setProfileDatasets,profileSourceContext,profileLowerTimeframe} from '../../src/chart/vp-visible-range-ltf';
import {profileInputOriginal,cloneProfileInputBars,cloneProfileMarketInput} from '../../src/chart/profile-input-clone';
import {cloneBarList,cloneMarketInput} from '../../src/chart/bar-clone';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
const held:ReturnType<typeof profileAdapterHarness>[]=[];afterEach(()=>{for(const item of held.splice(0))item.dispose();setProfileDatasets([]);});
const rig=(primary:Parameters<typeof profileAdapterHarness>[0])=>{const value=profileAdapterHarness(primary);held.push(value);return value;};
it('actual adapter initialization and context mint legitimate local finer authority through its private domain clone',()=>{
 const {primary,fine}=fixtures();setProfileDatasets([primary,fine]);const current=rig(primary),frame=current.read();
 expect(frame.bars).not.toBe(primary.bars);expect(frame.source.inputIdentity).toBe(barInputIdentity(primary.bars));expect({finerChartBars:current.profile().lowerTimeframeBars,poc:current.poc()}).toEqual({finerChartBars:1,poc:expect.closeTo(265/24,12)});expect(profileInputOriginal(frame.bars)).toBe(primary.bars);
});
it('actual adapter write/apply and queue transaction rollback preserve exact source ancestry across two providers',async()=>{
 const {primary,fine}=fixtures(),next=source('1D',primary.bars.map(row=>({...row,open:25,high:30,low:20,close:25})),'local:SYNTHETIC-B:1D'),nextFine=source('60m',fine.bars.map(row=>({...row,open:21,high:21.2,low:21,close:21.1})),'local:SYNTHETIC-B:60m');
 for(const value of [next,nextFine])Object.assign(value.provenance,{providerId:'SYNTHETIC-provider-B',providerName:'SYNTHETIC provider B'});setProfileDatasets([primary,fine,next,nextFine]);const current=rig(primary),transaction=current.controller.setBarsWithRollback(next.bars,sourceContextForDataset(next));
 await transaction.result;expect(profileInputOriginal(current.read().bars)).toBe(next.bars);expect(current.profile().lowerTimeframeBars).toBe(1);expect(current.poc()).toBeCloseTo(505/24,12);
 await transaction.rollback();expect(profileInputOriginal(current.read().bars)).toBe(primary.bars);expect(current.read().source.datasetId).toBe(primary.provenance.datasetId);expect(current.profile().lowerTimeframeBars).toBe(1);expect(current.poc()).toBeCloseTo(265/24,12);
});
it('actual failed queue application restores the original source and its valid private copied frame',async()=>{
 const {primary,fine}=fixtures(),next=source('1D',primary.bars.map(row=>({...row,close:16})),'local:SYNTHETIC-failed:1D');setProfileDatasets([primary,fine,next]);const current=rig(primary);current.failNext();await expect(current.controller.setBars(next.bars,sourceContextForDataset(next))).rejects.toThrow('SYNTHETIC native market failure');
 expect(current.read().source.datasetId).toBe(primary.provenance.datasetId);expect(profileInputOriginal(current.read().bars)).toBe(primary.bars);expect(current.profile().lowerTimeframeBars).toBe(1);expect(current.poc()).toBeCloseTo(265/24,12);
});
it('a retired or detached domain clone cannot be rescued by equal values or copied source metadata',()=>{
 const {primary,fine}=fixtures();setProfileDatasets([primary,fine]);const current=rig(primary),frame=current.read(),copy=structuredClone(frame.bars);expect(profileSourceContext(frame.source,copy).profileSource).toBeUndefined();
 frame.bars[0]={...frame.bars[0]};expect(profileInputOriginal(frame.bars)).toBeNull();const context=profileSourceContext(frame.source,frame.bars);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,context.profileSource)).toBeNull();
});
it('source and clone corrections require a fresh actual copy instead of silently retargeting an old clone',()=>{
 const {primary}=fixtures(),copy=cloneProfileInputBars(primary.bars);primary.bars[0].close=16;expect(profileInputOriginal(copy)).toBeNull();const corrected=cloneProfileInputBars(primary.bars);expect(profileInputOriginal(corrected)).toBe(primary.bars);corrected[0].close=17;expect(profileInputOriginal(corrected)).toBeNull();
});
it('clone ancestry checks reject source/copy accessors and emptied arrays without invoking a getter',()=>{
 for(const owner of ['source','copy']){const {primary}=fixtures(),copy=cloneProfileInputBars(primary.bars);let reads=0;Object.defineProperty((owner==='source'?primary.bars:copy)[0],'close',{get(){reads++;return 15;},enumerable:true,configurable:true});expect(profileInputOriginal(copy)).toBeNull();expect(reads).toBe(0);}
 const {primary}=fixtures(),copy=cloneProfileInputBars(primary.bars);copy.length=0;expect(profileInputOriginal(copy)).toBeNull();
});
it('rollback copies inherit one genuine original while an unproved copy does not inherit that source',()=>{
 const {primary}=fixtures(),copy=cloneProfileInputBars(primary.bars),rollback=cloneProfileMarketInput({bars:copy,source:sourceContextForDataset(primary)});expect(rollback.bars).not.toBe(copy);expect(profileInputOriginal(rollback.bars)).toBe(primary.bars);expect(profileInputOriginal(structuredClone(copy))).not.toBe(primary.bars);
});
it('owned clone wrappers preserve existing clone values and fallback behavior when proof is unavailable',()=>{
 const {primary}=fixtures();primary.bars[0].close=-0;primary.bars[0].volume=NaN;const copy=cloneProfileInputBars(primary.bars);expect(copy).toEqual(cloneBarList(primary.bars));expect(Object.is(copy[0].close,-0)).toBe(true);expect(profileInputOriginal(copy)).toBe(primary.bars);
 const unusual={bars:primary.bars.map(row=>({...row,extra:{synthetic:true}})),source:{datasetId:'SYNTHETIC'}} as any;expect(cloneProfileMarketInput(unusual)).toEqual(cloneMarketInput(unusual));expect(profileInputOriginal(cloneProfileInputBars(unusual.bars))).toBeNull();
});

it('observed clone or original retirement is terminal after values are restored and wrapper retry cannot renew it',()=>{
 for(const owner of ['copy','original']){const {primary}=fixtures(),copy=cloneProfileInputBars(primary.bars),sibling=cloneProfileInputBars(primary.bars),raw=primary.bars,changed=owner==='copy'?copy:raw,previous=changed[0].close;changed[0].close=previous+1;
  expect(profileInputOriginal(copy)).toBeNull();changed[0].close=previous;expect(profileInputOriginal(copy)).toBeNull();expect(profileInputOriginal(cloneProfileInputBars(copy))).toBeNull();expect(profileInputOriginal(cloneProfileMarketInput({bars:copy,source:sourceContextForDataset(primary)}).bars)).toBeNull();
  if(owner==='original')expect(profileInputOriginal(sibling)).toBeNull();else expect(profileInputOriginal(sibling)).toBe(raw);
  expect(profileInputOriginal(cloneProfileInputBars(raw))).toBe(raw);
 }
});
