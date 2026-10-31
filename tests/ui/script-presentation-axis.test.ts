import {afterEach,expect,it} from 'vitest';
import {scriptAxisFixture} from '../fixtures/script-presentation-axis';
import {SYNTHETIC_BINDING,settle} from '../fixtures/script-presentation';
const held:ReturnType<typeof scriptAxisFixture>[]=[];afterEach(()=>{for(const value of held.splice(0).reverse())value.f.close();});
const fixture=(options:Parameters<typeof scriptAxisFixture>[0]={})=>{const value=scriptAxisFixture(options);held.push(value);return value;};
const snapshot=(x:ReturnType<typeof fixture>)=>x.f.port.captureReadout?.(SYNTHETIC_BINDING.id);
async function accept(x:ReturnType<typeof fixture>){x.f.runtime().update(x.context());x.complete();await settle();expect(x.f.port.list()).toHaveLength(1);}
function ready(x:ReturnType<typeof fixture>){const view=snapshot(x);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Qualified synthetic identity axis unavailable.');return view;}
it('genuine confirmed Line break identity axis preserves accepted numerical units',async()=>{
 const x=fixture();expect(x.consumed.map(row=>row.time)).toEqual([160,220]);expect(x.axis.feed.map(row=>row.time)).toEqual([160,220]);await accept(x);
 const view=ready(x);expect(view.readAt(160).plots[0].value).toBe(7);expect(view.readAt(220).plots[0].value).toBe(11);expect(x.f.pending).toHaveLength(1);
});
it('nonidentity event and native logical grids cannot falsely report ready',async()=>{
 const x=fixture({nonidentity:true});expect(x.consumed.map(row=>row.time)).toEqual([160,400]);expect(x.axis.feed.map(row=>row.time)).toEqual([160,220]);await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('duplicate genuine Renko event times cannot falsely report ready through timestamp lookup',async()=>{
 const x=fixture({duplicate:true});expect(new Set(x.consumed.map(row=>row.time)).size).toBeLessThan(x.consumed.length);expect(new Set(x.axis.feed.map(row=>row.time)).size).toBe(x.axis.feed.length);await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('missing axis cannot falsely report ready from matching confirmed OHLC values',async()=>{
 const x=fixture();x.memo.axis=null as any;await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('missing actual feed refuses only optional proof while calculation still accepts',async()=>{
 const x=fixture();delete (x.axis as any).feed;await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('a source-times entry must match the actual confirmed event',async()=>{
 const x=fixture();x.axis.sourceTimes[0]=999;await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('projectionFrom must equal the exact consumed confirmed prefix',async()=>{
 const x=fixture();x.axis.projectionFrom=1;await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('native milliseconds must match actual axis feed seconds even when OHLC agrees',async()=>{
 const x=fixture();x.f.core.bars[0].time+=1000;await accept(x);expect(snapshot(x)?.state).toBe('unavailable');
});
it('genuine projected tail is not consumed and cannot be queried as a confirmed scalar',async()=>{
 const x=fixture({projection:true});expect(x.axis.projectionFrom).toBe(1);expect(x.axis.feed).toHaveLength(2);await accept(x);const view=ready(x);expect(view.readAt(160).plots[0].value).toBe(7);expect(()=>view.readAt(220)).toThrow('outside');expect(view.readAt(160).plots[0].value).toBe(7);
});
it('replacing an owned axis feed retires the view permanently despite restoring it',async()=>{
 const x=fixture();await accept(x);const view=ready(x),original=x.axis.feed;x.axis.feed=[...original];expect(()=>view.assertCurrent()).toThrow();x.axis.feed=original;expect(()=>view.assertCurrent()).toThrow();
});
it('replacing owned sourceTimes retires without a model or native ID change',async()=>{
 const x=fixture();await accept(x);const view=ready(x);x.axis.sourceTimes=[...x.axis.sourceTimes];expect(()=>view.readAt(160)).toThrow();
});
it('axis accessors are refused before getter execution and preserve normal calculation',async()=>{
 const x=fixture();let calls=0;Object.defineProperty(x.axis,'feed',{configurable:true,get(){calls++;throw Error('Axis getter must never run.');}});await accept(x);expect(snapshot(x)?.state).toBe('unavailable');expect(calls).toBe(0);
});
