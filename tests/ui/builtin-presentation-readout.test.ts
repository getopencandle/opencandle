import {afterEach,expect,it} from 'vitest';
import {builtinPresentationFixture,builtinRows} from '../fixtures/builtin-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import type {BuiltinReadoutSnapshot} from '../../src/chart/builtin-presentation-proof';
const held:Awaited<ReturnType<typeof builtinPresentationFixture>>[]=[];afterEach(()=>{for(const h of held.splice(0).reverse())h.dispose();});
async function fixture(options:Parameters<typeof builtinPresentationFixture>[0]={}){const h=await builtinPresentationFixture(options);held.push(h);return h;}
function read(h:Awaited<ReturnType<typeof fixture>>,id:string):BuiltinReadoutSnapshot{return h.port.captureReadout?.(id)??{state:'unavailable',message:'No current builtin scalar reader.'};}
function ready(h:Awaited<ReturnType<typeof fixture>>,id:string){const view=read(h,id);expect(view.state).toBe('ready');if(view.state!=='ready')throw Error(view.message);return view;}
it('actual accepted SMA scalars preserve irregular time alignment without a values clone',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);expect([100,160,400,700].map(time=>view.readAt(time).plots[0].value)).toEqual([null,6,7.5,9]);expect(view.readAt(160).title).toBe('Moving Average');
});
it('RSI and Volume read literal domain units and warmup rather than source close',async()=>{
 const h=await fixture(),rsi=h.port.add('rsi',{length:1}),volume=h.port.add('volume',{length:2});expect([100,160,400,700].map(time=>ready(h,rsi).readAt(time).plots[0].value)).toEqual([null,100,0,100]);expect(ready(h,volume).readAt(400).plots[0].value).toBe(30);
});
it('a qualifying synchronous catalog kind has no nine-kind product whitelist',async()=>{
 const h=await fixture(),id=h.port.add('cmo',{length:1});expect(ready(h,id).readAt(160).plots[0].value).toBe(100);
});
it('display offset leaves the exact unshifted numerical status value unchanged',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2});h.port.update(id,{offset:1});expect(ready(h,id).readAt(160).plots[0].value).toBe(6);expect(ready(h,id).readAt(400).plots[0].value).toBe(7.5);
});
it('HA values preserve units in a qualified raw-input native producer configuration',async()=>{
 const h=await fixture({style:'heikinashi'}),id=h.port.add('sma',{length:1});expect(ready(h,id).readAt(100).plots[0].value).toBe(2);expect(ready(h,id).readAt(160).plots[0].value).toBe(8);expect(h.rows[0].close).toBe(3);
});
it('invalid absent and future timestamp queries do not retire a genuine current view',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);for(const time of [NaN,Infinity,120,701])expect(()=>view.readAt(time)).toThrow();expect(view.readAt(160).plots[0].value).toBe(6);
});
it('owned output indices are immutable while source native rows remain writable',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id),values=model.result.series[0].values;expect(Object.getOwnPropertyDescriptor(values,'1')).toMatchObject({writable:false,configurable:false});expect(Object.getOwnPropertyDescriptor(values,'length')?.writable).toBe(false);expect(()=>{values[1]=999;}).toThrow();expect(Object.getOwnPropertyDescriptor(h.core.bars[1],'close')?.writable).toBe(true);expect(Object.getOwnPropertyDescriptor(h.rows[1],'close')?.writable).toBe(true);
});
it('a same-count correction retires old scalars before a freshly accepted producer result',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id),rows=builtinRows();rows[3].close=20;h.publish(rows);expect(()=>old.assertCurrent()).toThrow();expect(ready(h,id).readAt(700).plots[0].value).toBe(13);
});
it('core incremental reuse remains writable internally across a later live correction',async()=>{
 const rows=Array.from({length:1000},(_,i)=>({time:100+i*60,open:i+1,high:i+2,low:i,close:i+1,volume:10})),h=await fixture({rows}),id=h.port.add('sma',{length:2});expect(ready(h,id).readAt(rows[999].time).plots[0].value).toBe(999.5);const changed=rows.map(row=>({...row}));changed[999].close=2000;h.publish(changed);expect(ready(h,id).readAt(rows[999].time).plots[0].value).toBe(1499.5);
});
it('actual native input replacement cannot borrow old values at the same timestamps',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);h.core.bars=h.core.bars.map((row:any)=>({...row}));expect(()=>view.readAt(160)).toThrow();expect(read(h,id).state).toBe('unavailable');
});
it('an observed unavailable source leaves retained views terminal after flags recover',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);h.owner.unavailable('Synthetic source retired.');expect(()=>view.assertCurrent()).toThrow();h.owner.unavailable(null);expect(()=>view.assertCurrent()).toThrow();expect(read(h,id).state).toBe('unavailable');
});
it('missing actual publication authority withholds only optional readout and keeps calculation',async()=>{
 const h=await fixture({host:false}),id=h.port.add('sma',{length:2});expect(h.port.values(id).series[0].values).toEqual([null,6,7.5,9]);expect(read(h,id).state).toBe('unavailable');
});
it('derived timestamp topology remains unavailable until an owned logical mapping exists',async()=>{
 const h=await fixture({style:'renko'}),id=h.port.add('sma',{length:2});expect(h.port.values(id).series[0].values).toEqual([null,6,7.5,9]);expect(read(h,id).state).toBe('unavailable');
});
it('remove reattach and disposal never revive a retained current-value snapshot',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id);h.port.remove(id);expect(()=>view.readAt(160)).toThrow();const next=h.port.add('sma',{length:2});expect(ready(h,next).readAt(160).plots[0].value).toBe(6);h.port.dispose();expect(()=>ready(h,next)).toThrow();expect(()=>view.assertCurrent()).toThrow();
});
it('repeated scalar reads use no values list native-bars clone or recalculation path',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),view=ready(h,id),model=h.instance(id),original=model.result.series[0].values;h.port.values=()=>{throw Error('Full values clone called');};h.port.list=()=>{throw Error('Full list called');};model.ctx.bars=()=>{throw Error('Native bars called');};model.compute=()=>{throw Error('Recompute called');};for(let i=0;i<1000;i++)expect(view.readAt(i%2?160:400).plots[0].value).toBe(i%2?6:7.5);expect(model.result.series[0].values).toBe(original);
});

it('first native mount publishes a ready view only after the actual returned handle exists',async()=>{
 const h=await fixture(),states:string[]=[];h.port.subscribe(()=>{const id=h.port.list()[0]?.id;if(id)states.push(read(h,id).state);});const id=h.port.add('sma',{length:2});expect(states.length).toBeGreaterThan(0);expect(states.every(value=>value==='ready')).toBe(true);expect(ready(h,id).readAt(160).paneId).toBe(h.records.get(h.port.list()[0].rendererId).model.paneId);
});
it('an actual pane move and move-back keep numerical result identity and retire old pane views',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id),result=model.result,old=ready(h,id),first=old.readAt(160).paneId;h.port.move(id,{newPane:true});const moved=ready(h,id);expect(moved.readAt(160).paneId).not.toBe(first);expect(model.result).toBe(result);expect(()=>old.assertCurrent()).toThrow();h.port.move(id,{pane:'price'});expect(ready(h,id).readAt(160).paneId).toBe('price');expect(()=>moved.assertCurrent()).toThrow();
});
it('actual native hide/show remount creates a fresh view without reviving the old one',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),model=h.instance(id),nativeId=h.port.list()[0].rendererId,record=h.records.get(nativeId),handle=h.core.handles.get(nativeId),old=ready(h,id);record.native.started=true;handle.setVisibleState=()=>{};handle.setVisible=(visible:boolean)=>h.core.setVisible(nativeId,visible);h.port.update(id,{visible:false});expect(read(h,id).state).toBe('unavailable');h.port.update(id,{visible:true});expect(h.instance(id)).toBe(model);expect(ready(h,id).readAt(160).plots[0].value).toBe(6);expect(()=>old.assertCurrent()).toThrow();
});
it('owned metadata styles and precision refresh without borrowing old effective config',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id),presentation=h.port.serialize()[0].presentation!;h.port.update(id,{plots:{sma:{...defaultPlotStyle('sma','sma',0),color:'#123456',legend:false}},presentation:{...presentation,precision:2}});const value=ready(h,id).readAt(160);expect(value.precision).toBe(2);expect(value.plots[0]).toMatchObject({value:6,color:'#123456',legend:false,dataWindow:true});expect(()=>old.assertCurrent()).toThrow();
});
it('foreign actual native model replacement cannot obtain a fresh view by matching IDs',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id),nativeId=h.port.list()[0].rendererId,record=h.records.get(nativeId);h.core.applyModel(nativeId,h.core.buildNativeModel(record,{series:[{id:'foreign',kind:'line',points:[{time:160000,value:999}],style:{color:'#123456'}}]}));expect(()=>old.readAt(160)).toThrow();expect(read(h,id).state).toBe('unavailable');
});
it('failed native input edit preserves old calculation and withholds optional values until owned reproof',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id),mount=h.renderer.mountIndicator.bind(h.renderer);let armed=true;h.renderer.mountIndicator=model=>{const value=mount(model);if(armed){armed=false;throw Error('Synthetic native output refusal.');}return value;};expect(()=>h.port.update(id,{inputs:{length:1}})).toThrow();expect(h.port.values(id).series[0].values).toEqual([null,6,7.5,9]);expect(()=>old.assertCurrent()).toThrow();expect(read(h,id).state).toBe('unavailable');h.port.recompute();expect(ready(h,id).readAt(160).plots[0].value).toBe(6);
});
it('an accepted reentrant descendant edit cannot lend its view to the retired outer result',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),old=ready(h,id),model=h.instance(id);let armed=true;model.ctx.setStatus=()=>{if(armed){armed=false;h.port.update(id,{inputs:{length:1}});}};expect(()=>h.port.update(id,{inputs:{length:3}})).toThrow(/retired|replaced|owner|changed/i);expect(ready(h,id).readAt(160).plots[0].value).toBe(9);expect(h.port.list()[0].inputs.length).toBe(1);expect(()=>old.assertCurrent()).toThrow();
});

it('actual HA-view context with private raw input transforms once instead of twice',async()=>{
 const rows=[{time:100,open:10,high:14,low:6,close:12,volume:10},{time:160,open:12,high:20,low:8,close:16,volume:20},{time:220,open:16,high:22,low:12,close:18,volume:30}],h=await fixture({style:'heikinashi',rows}),id=h.port.add('sma',{length:2});
 expect(h.core.bars.map((row:any)=>row.close)).toEqual([10.5,14,17]);expect(h.port.values(id).series[0].values).toEqual([null,12.25,15.5]);expect(ready(h,id).readAt(160).plots[0].value).toBe(12.25);expect(ready(h,id).readAt(220).plots[0].value).toBe(15.5);
});

it('HA higher timeframe aggregates genuine raw bars before applying the transform once',async()=>{
 const t=1700000040,rows=[{time:t,open:10,high:14,low:6,close:12,volume:10},{time:t+60,open:12,high:20,low:8,close:16,volume:20},{time:t+120,open:16,high:22,low:12,close:18,volume:30},{time:t+180,open:18,high:24,low:14,close:20,volume:40}],h=await fixture({style:'heikinashi',rows}),id=h.port.add('sma',{length:1});
 const presentation=h.port.serialize()[0].presentation!;h.port.update(id,{presentation:{...presentation,timeframe:{schemaVersion:1,interval:'2m',waitForClose:true}}});expect(h.port.values(id).series[0].values).toEqual([null,13,13,18]);expect(ready(h,id).readAt(t+60).plots[0].value).toBe(13);expect(ready(h,id).readAt(t+180).plots[0].value).toBe(18);
});

it('a full private snapshot cannot emit a future row while the native grow is still a prefix',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:1}),old=ready(h,id),rows=[...builtinRows(),{time:760,open:98,high:101,low:97,close:100,volume:50},{time:820,open:198,high:201,low:197,close:200,volume:60}];
 h.prefix(rows,5);expect(h.port.values(id).series[0].values).toEqual([3,9,6,12,100]);const record=h.records.get(h.port.list()[0].rendererId);expect(record.model.series[0].points.every((point:any)=>point.time<=760000)).toBe(true);expect(read(h,id).state).toBe('unavailable');expect(()=>old.assertCurrent()).toThrow();h.prefix(rows,6);expect(h.port.values(id).series[0].values).toEqual([3,9,6,12,100,200]);expect(ready(h,id).readAt(820).plots[0].value).toBe(200);
});

it('owned restore creates fresh model and scalar authority instead of reviving an older view',async()=>{
 const h=await fixture(),id=h.port.add('sma',{length:2}),saved=h.port.serialize(),old=ready(h,id),model=h.instance(id);h.port.update(id,{inputs:{length:1}});const changed=ready(h,id);expect(changed.readAt(160).plots[0].value).toBe(9);h.port.restore(saved);expect(h.instance(id)).not.toBe(model);expect(ready(h,id).readAt(160).plots[0].value).toBe(6);expect(()=>old.assertCurrent()).toThrow();expect(()=>changed.assertCurrent()).toThrow();
});
it('equal labels and saved IDs in separate cells retain independent source and native owners',async()=>{
 const left=await fixture(),right=await fixture(),id=left.port.add('sma',{length:2},{id:'shared-synthetic-study'}),other=right.port.add('sma',{length:1},{id:'shared-synthetic-study'}),a=ready(left,id),b=ready(right,other);expect(a.readAt(160).title).toBe(b.readAt(160).title);expect(a.readAt(160).plots[0].value).toBe(6);expect(b.readAt(160).plots[0].value).toBe(9);const rows=builtinRows();rows[1].close=20;right.publish(rows);expect(a.readAt(160).plots[0].value).toBe(6);expect(()=>b.assertCurrent()).toThrow();expect(ready(right,other).readAt(160).plots[0].value).toBe(20);
});
