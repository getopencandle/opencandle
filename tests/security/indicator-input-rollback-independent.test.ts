import {expect,it} from 'vitest';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';

it('a successful same-instance edit during calculation-prefix preflight retires the earlier outer update',async()=>{
 const h=await nativeCoreHarness();let armed=false,id='';
 const port=createIndicatorPort(h.chart,undefined,input=>{if(armed){armed=false;port.update(id,{inputs:{maType:'WMA'}});}return input.map(row=>({...row}));},undefined,h.bridge.claim,()=>({resolution:'1m'}));
 try{
  h.core.bars=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));id=port.add('volume',{length:3});const rendererId=port.list()[0].rendererId;
  armed=true;expect(()=>port.update(id,{inputs:{length:2,maType:'EMA'}})).toThrow(/retired|changed|reentrant|replaced|owner/i);
  expect(port.list()[0].inputs).toEqual({length:3,maType:'WMA'});expect(h.records.get(rendererId).inputValues).toEqual({length:3,maType:'WMA'});expect(port.values(id).series[1].values).toEqual([null,null,6.5,9.5]);
 }finally{port.dispose();h.dispose();}
});

it('normal-return status reentry preserves and publishes the completed inner edit exactly once',async()=>{
 const h=await nativeCoreHarness(),port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim,()=>({resolution:'1m'}));
 try{
  h.core.bars=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));const id=port.add('volume',{length:3}),rendererId=port.list()[0].rendererId,instance=h.instances.get(rendererId)!;let entered=false,accepted:unknown,values:unknown,notified=0;
  port.subscribe(()=>{notified++;});instance.ctx.setStatus=()=>{if(!entered){entered=true;port.update(id,{inputs:{length:2,maType:'EMA'}});accepted=port.serialize();values=port.values(id);}};
  expect(()=>port.update(id,{inputs:{maType:'WMA'}})).toThrow(/retired|changed|reentrant|replaced|owner/i);expect(entered).toBe(true);expect(port.serialize()).toEqual(accepted);expect(port.values(id)).toEqual(values);expect(h.records.get(rendererId).inputValues).toEqual({length:2,maType:'EMA'});expect(notified).toBe(1);
 }finally{port.dispose();h.dispose();}
});

it('a no-op child cannot grant publication authority to an older provisional update',async()=>{
 const h=await nativeCoreHarness(),port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim,()=>({resolution:'1m'}));
 try{
  h.core.bars=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));const id=port.add('volume',{length:3}),rendererId=port.list()[0].rendererId,instance=h.instances.get(rendererId)!;let entered=false,notified=0;
  port.subscribe(()=>{notified++;});instance.ctx.setStatus=()=>{if(!entered){entered=true;port.update(id,{inputs:{maType:'WMA'}});}};
  expect(()=>port.update(id,{inputs:{maType:'WMA'}})).toThrow();expect(entered).toBe(true);expect(notified).toBe(0);expect(()=>port.update(id,{inputs:{length:2}})).toThrow(/rollback|recovery|reopen|incomplete/i);
 }finally{port.dispose();h.dispose();}
});

it('native rejection never executes a replaced handle input-method accessor during recovery',async()=>{
 const h=await nativeCoreHarness(),port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim,()=>({resolution:'1m'}));
 try{
  h.core.bars=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));const id=port.add('volume',{length:3}),rendererId=port.list()[0].rendererId,handle=h.core.handles.get(rendererId),mount=h.renderer.mountIndicator.bind(h.renderer);let reads=0,first=true;
  h.renderer.mountIndicator=model=>{const result=mount(model);if(first){first=false;Object.defineProperty(handle,'setInputs',{configurable:true,enumerable:true,get(){reads++;throw Error('Unowned method accessor ran');}});throw Error('SYNTHETIC native rejection after method replacement');}return result;};
  expect(()=>port.update(id,{inputs:{maType:'WMA'}})).toThrow();expect(reads).toBe(0);expect(port.list()[0].diagnostics.join(' ')).toMatch(/rollback|recovery|reopen/i);expect(()=>port.update(id,{inputs:{length:2}})).toThrow();expect(reads).toBe(0);
 }finally{port.dispose();h.dispose();}
});

it('accepted whole-instance hide and show preserve the native input identity with an absent hidden scene row',async()=>{
 const h=await nativeCoreHarness(),port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim,()=>({resolution:'1m'}));
 try{
  h.core.bars=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));const id=port.add('volume',{length:3,maType:'WMA'}),rendererId=port.list()[0].rendererId,record=h.records.get(rendererId),input=record.inputValues,handle=h.core.handles.get(rendererId);let notified=0;port.subscribe(()=>{notified++;});
  // Execute actual core visibility/remount semantics; the shared harness's short
  // setter omits pendingStructural and native resume. Input UI state is controlled.
  record.native.started=true;handle.setVisibleState=()=>{};handle.setVisible=(visible:boolean)=>h.core.setVisible(rendererId,visible);
  expect(()=>port.update(id,{visible:false})).not.toThrow();expect(port.serialize()[0].visible).toBe(false);expect(record.hidden).toBe(true);expect(h.native.scene.indicators.has(rendererId)).toBe(false);expect(record.inputValues).toBe(input);
  expect(()=>port.update(id,{visible:true})).not.toThrow();expect(port.serialize()[0].visible).toBe(true);expect(record.hidden).toBe(false);expect(h.native.scene.indicators.has(rendererId)).toBe(true);expect(port.list()[0].rendererId).toBe(rendererId);expect(record.inputValues).toBe(input);expect(notified).toBe(2);
 }finally{port.dispose();h.dispose();}
});
