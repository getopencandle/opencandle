import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from '../chart/indicator-display-harness';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';

it('readout retirement validation rejects a callback-installed indexed getter without executing it',async()=>{
 const t=await indicatorDisplayHarness(false);let reads=0;
 try{
  const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),format=t.native.dataWindowFmt;
  t.native.dataWindowFmt=function(this:unknown,...args:unknown[]){Object.defineProperty(model.series[0].points,'1',{configurable:true,enumerable:true,get(){reads++;throw Error('Independent indexed getter executed');}});return Reflect.apply(format,this,args);};
  t.install();expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual([]);expect(reads).toBe(0);expect(t.display.diagnostics().length).toBeGreaterThan(0);
 }finally{t.dispose();}
});

it('the final native offset callback cannot retire the prefix and still return old precision rows',async()=>{
 const t=await indicatorDisplayHarness(false);let offsets=0;
 try{
  const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),offset=t.native.scene.offsetOf;
  t.native.scene.offsetOf=function(this:unknown,...args:unknown[]){const result=Reflect.apply(offset,this,args);if(++offsets===5)t.core.bars=[...t.core.bars];return result;};
  t.install();expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual([]);expect(offsets).toBeGreaterThanOrEqual(5);expect(t.display.diagnostics().some(row=>/prefix|source|owner/.test(row.message))).toBe(true);
 }finally{t.dispose();}
});

it('tick glyph method acquisition cannot retire the source and then paint a stale precision tick',async()=>{
 const t=await indicatorDisplayHarness(false);const descriptor=Object.getOwnPropertyDescriptor(t.recording.ctx,'fillText')!;let reads=0;
 try{
  const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId);model.ownScale=true;t.native.scene.indicatorScales.set(model.id,{scale:{min:0,max:40},scaleTarget:{min:0,max:40}});
  Object.defineProperty(t.recording.ctx,'fillText',{configurable:true,enumerable:true,get(){reads++;t.core.bars=[...t.core.bars];return descriptor.value;}});
  t.install();t.paint();expect(t.recording.commands.filter(row=>row.op==='fillText')).toEqual([]);expect(t.display.diagnostics().length).toBeGreaterThan(0);
 }finally{Object.defineProperty(t.recording.ctx,'fillText',descriptor);t.dispose();}
});
