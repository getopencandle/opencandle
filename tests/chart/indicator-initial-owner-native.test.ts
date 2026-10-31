import {expect,it} from 'vitest';
import {getNativeIndicator} from '@luxalgo/vela';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {AnalysisPublicationError} from '../../src/chart/analysis-publication';

const leaves=(error:unknown):unknown[]=>error instanceof AggregateError?[error,...error.errors.flatMap(leaves)]:[error];
async function fixture(calculation?:(bars:any[])=>any[]){
 const h=await nativeCoreHarness();let source={};const quarantines:unknown[]=[];
 const port=createIndicatorPort(h.chart,undefined,calculation as any,undefined,h.bridge.claim,undefined,{captureOwner(){const captured=source;return{isCurrent:()=>captured===source,quarantine(error){quarantines.push(error);}};}});
 return{...h,port,quarantines,retire(){source={};},cleanup(){port.dispose();h.dispose();}};
}

it('successful initial emit retains exact registered native handle after source retirement without status or old-result writes',async()=>{
 const t=await fixture();try{
  const mount=t.renderer.mountIndicator.bind(t.renderer);let statuses=0,published=0,first=true;t.port.subscribe(()=>{published++;});
  t.renderer.mountIndicator=model=>{const handle=mount(model);if(first){first=false;t.instances.get(model.id)!.ctx.setStatus=()=>{statuses++;};t.retire();}return handle;};
  expect(()=>t.port.add('sma',{length:1})).toThrow(AnalysisPublicationError);
  const row=t.port.list()[0],record=t.records.get(row.rendererId),instance=t.instances.get(row.rendererId)!;
  expect(t.port.list()).toHaveLength(1);expect(instance.handle).toBe(t.core.handles.get(row.rendererId));expect(getNativeIndicator(record.native.type)).toBe(record.native.descriptor);expect(t.native.scene.indicators.get(row.rendererId)).toBe(record.model);
  expect(statuses).toBe(0);expect(published).toBe(0);expect(t.quarantines).toEqual([]);expect(t.port.values(row.id).series).toEqual([]);expect(instance.acceptedOutput).toEqual({series:[],fills:[],priceLines:[]});expect(instance.display).toEqual([]);expect(instance.informationBars).toBe(0);
 }finally{t.cleanup();}
});

it('initial source retirement before emit is rejection without any mounted output or accepted publication',async()=>{
 let armed=false,retire=()=>{};const t=await fixture(bars=>{if(armed){armed=false;retire();}return bars;});retire=t.retire;
 try{armed=true;let published=0;t.port.subscribe(()=>{published++;});let failure:unknown;try{t.port.add('sma',{length:1});}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(Error);expect(leaves(failure).some(error=>error instanceof AnalysisPublicationError)).toBe(false);expect(t.port.list()).toEqual([]);expect(t.native.scene.indicators.size).toBe(0);expect(published).toBe(0);expect(t.quarantines).toEqual([]);
 }finally{t.cleanup();}
});

it('a real initial emit throw after mount and source retirement cannot mint returned-emission acceptance',async()=>{
 const t=await fixture();try{const mount=t.renderer.mountIndicator.bind(t.renderer),original=Error('SYNTHETIC first emit did not return');let calls=0;
  t.renderer.mountIndicator=model=>{calls++;mount(model);t.retire();throw original;};let failure:unknown;try{t.port.add('sma',{length:1});}catch(error){failure=error;}
  expect(leaves(failure)).toContain(original);expect(leaves(failure).some(error=>error instanceof AnalysisPublicationError)).toBe(false);expect(t.port.list()).toEqual([]);expect(calls).toBe(1);expect(t.quarantines).toEqual([]);
 }finally{t.cleanup();}
});

it('source plus exact entry replacement cannot defer the old initial frame or unregister the accepted replacement',async()=>{
 const t=await fixture();try{const mount=t.renderer.mountIndicator.bind(t.renderer);let first=true,replacement:unknown,replacementValues:unknown;
  t.renderer.mountIndicator=model=>{const handle=mount(model);if(first){first=false;const old=t.port.list()[0];t.retire();t.port.remove(old.id);t.port.add('volume',{length:1},{id:old.id});replacement=t.port.serialize();replacementValues=t.port.values(old.id);}return handle;};
  expect(()=>t.port.add('sma',{length:1})).toThrow();expect(t.port.serialize()).toEqual(replacement);const row=t.port.list()[0],record=t.records.get(row.rendererId);expect(row.kind).toBe('volume');expect(t.port.values(row.id)).toEqual(replacementValues);expect(getNativeIndicator(record.native.type)).toBe(record.native.descriptor);expect(t.instances.get(row.rendererId)!.handle).toBe(t.core.handles.get(row.rendererId));expect(t.quarantines).toEqual([]);
  t.port.update(row.id,{offset:1});expect(t.port.list()[0].offset).toBe(1);
 }finally{t.cleanup();}
});
