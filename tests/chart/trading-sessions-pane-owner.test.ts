import {afterEach,expect,it} from 'vitest';
import {tradingSessionPaneOwner} from '../fixtures/trading-sessions-pane-owner';
const rigs:ReturnType<typeof tradingSessionPaneOwner>[]=[];afterEach(()=>{for(const rig of rigs.splice(0))rig.dispose();});
const fixture=()=>{const value=tradingSessionPaneOwner();rigs.push(value);return value;};
it('actual adapter mount event refreshes initially withheld labels only after the native pane is proved',()=>{
 const f=fixture();expect(f.model().output.labels).toEqual([]);expect(f.port.capturePresentationOwner(f.id)?.nativeId).toBe(f.model().handle.id);expect(f.queue.length).toBeGreaterThan(0);f.flush();expect(f.model().output.labels,JSON.stringify({trace:f.trace,contexts:f.contexts})).toHaveLength(1);expect(f.model().output.labels[0].y).toBe(9);expect(f.adapter.diagnostics()).toEqual([]);
 const owner=f.port.capturePresentationOwner(f.id)!;expect(Object.keys(owner.instanceOwner)).toEqual([]);expect(Object.isFrozen(owner.instanceOwner)).toBe(true);expect(owner.instanceOwner).not.toBe(f.model().model);
});
it('actual native config and scale callbacks change stationary labels without changing numerical values or guides',()=>{
 const f=fixture();f.flush();const values=f.port.values(f.id),lines=structuredClone(f.model().output.lines),count=f.emissions();f.renderer.applyConfig({priceScale:{invert:true}});f.flush();expect(f.model().output.labels[0].y).toBe(15);expect(f.port.values(f.id).series).toEqual(values.series);expect(f.model().output.lines).toEqual(lines);
 const after=f.emissions();expect(after).toBeGreaterThan(count);f.renderer.applyConfig({layout:{fontSize:12}});f.flush();expect(f.emissions()).toBe(after);f.scale('price',false);f.flush();expect(f.model().output.labels[0].y).toBe(9);
});
it('actual moved-pane mapping follows its own inversion ignores a main flip and restores price-pane placement on moveback',()=>{
 const f=fixture();f.flush();f.move('SYNTHETIC-separate');f.flush();const before=f.emissions();f.scale('price',true);f.flush();expect(f.emissions()).toBe(before);expect(f.model().output.labels[0].y).toBe(9);f.scale('SYNTHETIC-separate',true);f.flush();expect(f.model().output.labels[0].y).toBe(15);f.scale('price',false);f.flush();expect(f.model().output.labels[0].y).toBe(15);f.move('price');f.flush();expect(f.model().output.labels[0].y).toBe(9);
});
it('historical flips undo redo and fresh restored layout use current per-instance orientation',()=>{
 const f=fixture();f.flush();for(const invert of [true,false,true]){f.historical(invert);f.flush();expect(f.model().output.labels[0].y).toBe(invert?15:9);}const saved=f.port.serialize(),frame=f.adapter.capture(),owner=f.port.capturePresentationOwner(f.id)!;f.port.restore([]);expect(()=>owner.assertCurrent()).toThrow();f.port.restore(saved);f.adapter.historical(frame);f.flush();expect(f.model().output.labels[0].y).toBe(15);expect(f.port.capturePresentationOwner(f.id)!.instanceOwner).not.toBe(owner.instanceOwner);
});
it('hidden show and source execution controller retirement do not publish old queued owner work',()=>{
 const f=fixture();f.flush();f.port.update(f.id,{visible:false});f.scale('price',true);f.flush();f.port.update(f.id,{visible:true});f.flush();expect(f.model().output.labels[0].y).toBe(15);
 f.scale('price',false);const before=f.emissions();f.adapter.source();f.flush();expect(f.emissions()).toBe(before);f.adapter.refresh.request();f.flush();expect(f.model().output.labels[0].y).toBe(9);f.scale('price',true);const next=f.emissions();f.adapter.execution();f.adapter.controller();f.flush();expect(f.emissions()).toBe(next);
});
it('current publication proof refuses native replacement and pane accessor facts without reading a getter',()=>{
 const f=fixture();f.flush();const owner=f.port.capturePresentationOwner(f.id)!,record=f.records.get(f.model().handle.id);record.model={...record.model};expect(()=>owner.assertCurrent()).toThrow();f.native.scene.indicators.set(record.model.id,record.model);
 let reads=0;const pane=f.native.scene.panes.get('price'),before=Object.getOwnPropertyDescriptor(pane,'kind')!;Object.defineProperty(pane,'kind',{configurable:true,enumerable:true,get(){reads++;return 'price';}});try{expect(()=>f.adapter.read(f.port.capturePresentationOwner(f.id))).toThrow();expect(reads).toBe(0);}finally{Object.defineProperty(pane,'kind',before);}
});
it('same Domain owner native ID pane and inversion still refresh after hidden native remount finishes before the queued comparison',()=>{
 const f=fixture();f.flush();const old=f.port.capturePresentationOwner(f.id)!,model=f.model().model;f.port.update(f.id,{visible:false});f.remountMode();f.port.update(f.id,{visible:true});expect(f.model().model).toBe(model);expect(model.ctx).toBeNull();expect(f.adapter.image()).toMatchObject({ok:false,diagnostic:{message:expect.stringMatching(/pane is not ready/)}});expect(f.canvasReads()).toBe(0);f.finishNativeMount();expect(f.model().output.labels).toEqual([]);
 const mounted=f.port.capturePresentationOwner(f.id)!;expect(mounted.instanceOwner).toBe(old.instanceOwner);expect(mounted.nativeId).toBe(old.nativeId);expect(mounted.nativeIncarnation).not.toBe(old.nativeIncarnation);expect(Object.keys(mounted.nativeIncarnation!)).toEqual([]);f.flush();expect(f.model().output.labels[0].y).toBe(9);
});
it('same-turn export refuses dirty label placement before reading any native canvas and recovers after accepted refresh',()=>{
 const f=fixture();f.flush();f.renderer.applyConfig({priceScale:{invert:true}});const refused=f.adapter.image();expect(refused).toMatchObject({ok:false,diagnostic:{message:expect.stringMatching(/label placement is updating/)}});expect(f.canvasReads()).toBe(0);f.flush();expect(f.model().output.labels[0].y).toBe(15);const after=f.adapter.image();expect(after).toMatchObject({ok:false,diagnostic:{message:'The renderer has no usable chart export surface.'}});expect(f.canvasReads()).toBe(1);
});
it('export detects an actual pane orientation change even without a configuration notification',()=>{
 const f=fixture();f.flush();f.native.scene.invertScale=true;expect(f.adapter.image()).toMatchObject({ok:false,diagnostic:{message:expect.stringMatching(/label placement is updating/)}});expect(f.canvasReads()).toBe(0);f.adapter.refresh.request();f.flush();expect(f.model().output.labels[0].y).toBe(15);
});
