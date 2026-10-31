import {expect,it} from 'vitest';
import {vwapIndicatorNativeHarness} from '../chart/vwap-indicator-native-harness';
import {drainVwap} from '../chart/vwap-indicator-native-harness';
import {isAnalysisPublicationFailure} from '../../src/chart/analysis-publication';

it('settled readiness cannot certify a newer actual native model under the same source and indicator ID',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'});await h.finish();
  const nativeId=h.port.list()[0].rendererId,record=h.records.get(nativeId),canonical=h.port.serialize(),before=h.port.values(id);
  const replacement=h.core.buildNativeModel(record,{series:[{id:'foreign',kind:'line',points:[{time:1700000000000,value:999}],style:{color:'#123456'}}],fills:[],priceLines:[]});
  h.core.applyModel(nativeId,replacement);
  expect(h.native.scene.indicators.get(nativeId)).toBe(replacement);
  expect(()=>h.port.assertVwapReady()).toThrow();
  expect(h.native.scene.indicators.get(nativeId)).toBe(replacement);expect(h.port.serialize()).toStrictEqual(canonical);expect(h.port.values(id)).toStrictEqual(before);expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});

it('settled readiness rejects a native emit method replaced by a controlled registry callback',async()=>{
 const h=await vwapIndicatorNativeHarness();let armed=false,mutations=0;try{
  const get=h.core.registry.get.bind(h.core.registry);
  h.core.registry.get=(nativeId:string)=>{const row=get(nativeId);if(armed&&row?.native?.instance?.ctx){armed=false;mutations++;const ctx=row.native.instance.ctx;ctx.emit=()=>{throw Error('Competing emit must not be invoked');};}return row;};
  const id=h.port.add('vwap',{kernelVersion:2});await h.finish();const canonical=h.port.serialize(),nativeId=h.port.list()[0].rendererId;armed=true;
  h.core.registry.get(nativeId);expect(mutations).toBe(1);
  expect(()=>h.port.assertVwapReady()).toThrow();
  expect(mutations).toBe(1);expect(h.port.serialize()).toStrictEqual(canonical);expect(h.quarantines).toEqual([]);expect(h.port.values(id).series).toHaveLength(1);
 }finally{h.dispose();}
});

it('the final readiness registry callback cannot replace emit after its descriptor check or revive the retired proof',async()=>{
 const h=await vwapIndicatorNativeHarness();let armed=false,mutations=0;try{
  const get=h.core.registry.get.bind(h.core.registry);let context:any,original:unknown;
  h.core.registry.get=(nativeId:string)=>{const row=get(nativeId);if(armed&&row?.native?.instance?.ctx){armed=false;mutations++;context=row.native.instance.ctx;original=context.emit;context.emit=()=>{throw Error('Changed native emit must remain unused');};}return row;};
  h.port.add('vwap',{kernelVersion:2});await h.finish();const before=h.port.serialize();armed=true;
  expect(()=>h.port.assertVwapReady()).toThrow();expect(mutations).toBe(1);
  context.emit=original;expect(()=>h.port.assertVwapReady()).toThrow();expect(h.port.serialize()).toStrictEqual(before);expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});

it('a native mount followed by an emit throw is unconfirmed publication rather than inferred accepted output',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'}),nativeId=h.port.list()[0].rendererId,canonical=h.port.serialize();
  await drainVwap();let armed=true,observers=0,failure:unknown;
  h.port.subscribe(()=>{observers++;});
  const original=h.core.applyModel.bind(h.core);
  h.core.applyModel=(target:string,model:any)=>{const returned=original(target,model);if(armed&&target===nativeId&&model.series?.some((plot:any)=>plot.points?.length)){armed=false;throw Error('SYNTHETIC mount then throw before emit return');}return returned;};
  try{await h.finish();}catch(error){failure=error;}
  expect(armed).toBe(false);expect(failure).toBeInstanceOf(Error);expect(String(failure)).toContain('mount then throw');
  expect(isAnalysisPublicationFailure(failure)).toBe(false);expect(()=>h.port.assertVwapReady()).toThrow();
  expect(h.port.serialize()).toStrictEqual(canonical);expect(h.port.list()).toHaveLength(1);expect(h.port.values(id).series).toEqual([]);expect(observers).toBe(0);
  expect(h.native.scene.indicators.get(nativeId).series[0].points).toHaveLength(3);
 }finally{h.dispose();}
});

it('the final genuine source assertion cannot replace native emit after the last native callback proof',async()=>{
 const h=await vwapIndicatorNativeHarness();let armed=false,seenNative=false,mutations=0;try{
  const get=h.core.registry.get.bind(h.core.registry);
  h.core.registry.get=(nativeId:string)=>{const value=get(nativeId);if(armed)seenNative=true;return value;};
  const id=h.port.add('vwap',{kernelVersion:2});await h.finish();const nativeId=h.port.list()[0].rendererId,ctx=h.instances.get(nativeId).ctx;
  const before=h.port.serialize();h.onPublicationAssert(()=>{if(armed&&seenNative){armed=false;mutations++;ctx.emit=()=>{throw Error('Retired native emit must not be called');};}});
  armed=true;let failure:unknown;try{h.port.assertVwapReady();}catch(error){failure=error;}
  expect(seenNative).toBe(true);expect(mutations).toBe(1);expect(failure).toBeInstanceOf(Error);
  expect(h.port.serialize()).toStrictEqual(before);expect(h.port.values(id).series).toHaveLength(1);expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});
