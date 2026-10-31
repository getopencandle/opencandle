import {afterEach,expect,it} from 'vitest';
import {captureSeasonalityNativeOrigin,SEASONALITY_NATIVE_ORIGIN_COST} from '../../src/chart/seasonality-native-origin';
import {ownedSourceFixture} from '../fixtures/seasonality-calendar-owned-source';
type Fixture=Awaited<ReturnType<typeof ownedSourceFixture>>;
const held:Fixture[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const f of held.splice(0).reverse())try{f.dispose();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'SYNTHETIC origin cleanup failed.');});
async function own(){
 const f=await ownedSourceFixture();held.push(f);const id=f.port.add('seasonality',{startYear:2016,endYear:2017,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z'});
 for(let turn=0;turn<100;turn++){if(f.port.captureReadout!(id).state==='ready')break;await Promise.resolve();}
 const view=f.port.captureReadout!(id);if(view.state!=='ready')throw Error('Actual SYNTHETIC C did not settle.');
 const row=f.port.list().find(row=>row.id===id)!;const record=f.records.get(row.rendererId)!,model=f.instances.get(row.rendererId)!,basis=f.host.capture()!,frame=f.host.accepted(basis.basis)!;
 if(!frame.calendar)throw Error('Actual primary frame has no native geometry witness.');const count=frame.calendar.count,tail=frame.calendar.tail*1000;
 return{f,id,view,record,model,frame,count,tail,capture:()=>captureSeasonalityNativeOrigin(f.native,f.core,model,record.id,count,tail,frame.calendar!.frame)};
}
it('actual accepted C model proves whole-chart indexOffset0 without exposing a row/source graph',async()=>{
 const h=await own(),origin=h.capture();expect(origin).not.toBeNull();origin!.assertCurrent();expect(origin!.indexOffset).toBe(0);expect(origin!.count).toBe(14);expect(origin!.firstLoadedTime).toBe(Date.parse('2015-12-01T00:00:00Z')/1000);expect(Object.keys(origin!)).toEqual(['indexOffset','count','firstLoadedTime','assertCurrent','dispose']);expect(h.view.readAt(Date.parse('2017-01-01T00:00:00Z')/1000).plots[0].value).toBe(118.8);origin!.dispose();expect(()=>origin!.assertCurrent()).toThrow();
});
it('genuine native anchor offsets must be zero; observing a change is terminal after restoration',async()=>{
 const h=await own(),origin=h.capture()!;h.f.native.scene.setAnchorOffset(h.record.id,2);expect(h.capture()).toBeNull();expect(()=>origin.assertCurrent()).toThrow();h.f.native.scene.forgetAnchorOffset(h.record.id);expect(()=>origin.assertCurrent()).toThrow();expect(h.capture()).not.toBeNull();
});
it('full M count and exact native frame are mandatory, not a caller-supplied count or copied key',async()=>{
 const h=await own();expect(captureSeasonalityNativeOrigin(h.f.native,h.f.core,h.model,h.record.id,h.count-1,h.tail,h.frame.calendar!.frame)).toBeNull();expect(captureSeasonalityNativeOrigin(h.f.native,h.f.core,h.model,h.record.id,h.count,h.tail,{...h.frame.calendar!.frame})).toBeNull();
});
it('actual native data generation replacement terminally invalidates the old expected frame',async()=>{
 const h=await own(),origin=h.capture()!,times=h.f.native.coords.times;h.f.native.coords.setBars([...times]);expect(()=>origin.assertCurrent()).toThrow();expect(h.capture()).toBeNull();
});
it('real scene-model replacement B cannot be borrowed and old proof never revives after restoration',async()=>{
 const h=await own(),origin=h.capture()!,a=h.f.native.scene.indicators.get(h.record.id),b={...a};h.f.native.scene.indicators.set(h.record.id,b);expect(h.capture()).toBeNull();expect(()=>origin.assertCurrent()).toThrow();h.f.native.scene.indicators.set(h.record.id,a);expect(()=>origin.assertCurrent()).toThrow();expect(h.capture()).not.toBeNull();
});
it('renderer proxies and foreign expected frames refuse before property traps or arbitrary core inspection',async()=>{
 const h=await own();let traps=0;const hostile=new Proxy(h.f.native,{get(){traps++;throw Error('SYNTHETIC forbidden read');},getOwnPropertyDescriptor(){traps++;throw Error('SYNTHETIC forbidden descriptor');}});expect(captureSeasonalityNativeOrigin(hostile,h.f.core,h.model,h.record.id,h.count,h.tail,h.frame.calendar!.frame)).toBeNull();expect(traps).toBe(0);
 const core=new Proxy(h.f.core,{getOwnPropertyDescriptor(){traps++;throw Error('SYNTHETIC foreign-frame must refuse first');}});expect(captureSeasonalityNativeOrigin(h.f.native,core,h.model,h.record.id,h.count,h.tail,{})).toBeNull();expect(traps).toBe(0);
});
it('model proxies fail exact native instance membership without reading the proxy',async()=>{
 const h=await own();let traps=0;const model=new Proxy(h.model,{get(){traps++;throw Error('SYNTHETIC forbidden model read');},getOwnPropertyDescriptor(){traps++;throw Error('SYNTHETIC forbidden model descriptor');}});expect(captureSeasonalityNativeOrigin(h.f.native,h.f.core,model,h.record.id,h.count,h.tail,h.frame.calendar!.frame)).toBeNull();expect(traps).toBe(0);
});
it('actual same-frame visibility retirement cannot leave the previous origin proof current',async()=>{
 const h=await own(),origin=h.capture()!;h.f.port.update(h.id,{visible:false});expect(()=>origin.assertCurrent()).toThrow();expect(h.capture()).toBeNull();
});
it('origin metadata has an explicit fixed fee and conveys no provider or numerical result',()=>{
 expect(SEASONALITY_NATIVE_ORIGIN_COST).toEqual({operations:8192,numericSlots:256});
});
it('actual first pending nonnull C model has a geometric origin which retires on its first accepted result',async()=>{
 const f=await ownedSourceFixture();held.push(f);const id=f.port.add('seasonality',{startYear:2016,endYear:2017,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z'});
 const record=[...f.records.values()].find(row=>row.native?.instance?.settings?.id===id)!;
 expect(record).toBeDefined();const model=record.native.instance,initial=model.result,basis=f.host.capture()!,frame=f.host.accepted(basis.basis)!;
 expect(initial).not.toBeNull();expect(initial.series).toEqual([]);expect(record.model.series).toEqual([]);expect(frame.calendar).toBeDefined();
 const count=frame.calendar!.count,tail=frame.calendar!.tail*1000,origin=captureSeasonalityNativeOrigin(f.native,f.core,model,record.id,count,tail,frame.calendar!.frame);
 expect(origin).not.toBeNull();origin!.assertCurrent();
 for(let turn=0;turn<100;turn++){if(f.port.captureReadout!(id).state==='ready')break;await Promise.resolve();}
 expect(f.port.captureReadout!(id).state).toBe('ready');expect(model.result).not.toBe(initial);expect(()=>origin!.assertCurrent()).toThrow();
 expect(captureSeasonalityNativeOrigin(f.native,f.core,model,record.id,count,tail,frame.calendar!.frame)).not.toBeNull();
});
