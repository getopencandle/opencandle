import {afterEach,expect,it,vi} from 'vitest';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';
import type {Bar} from '../../src/domain/types';
import {CHART_TYPES} from '../../src/chart/chart-types';

const rows=(count=2):Bar[]=>Array.from({length:count},(_,index)=>({time:1700000000+index*60,open:1+index,high:3+index,low:1,close:2+index,volume:index===0?-0:10}));
function setup(count=2){const original=rows(count);let basis:VwapPrefixBasis={epoch:{},source:{datasetId:'SYNTHETIC'},bars:structuredClone(original),style:'candles',executionIdentity:'ordinary',disposed:false};const host={readBasis:()=>basis},source=createOwnedVwapPrefixSource(host);return{original,source,host,read:()=>basis,write(next:VwapPrefixBasis){basis=next;}};}
afterEach(()=>vi.useRealTimers());
// Time price opportunity is a time-based type on the standard bars, so it is admitted like the thirteen.
it('admits the actual thirteen temporal styles and Time price opportunity, and rejects every derived topology before sealing',()=>{
 for(const [index,[style]] of CHART_TYPES.entries()){const f=setup();f.write({...f.read(),style});if(index<13||style==='tpo'||style==='hlcbars'||style==='sessionvp'||style==='footprint'){/* HLC bars is a standard time type; So is Session volume profile (candles); And Volume footprint */const prefix=f.source.capture();expect(prefix.transform).toBe(style==='heikinashi'?'heikin-ashi':'standard');}else{expect(()=>f.source.capture()).toThrow('topology');expect(Object.isFrozen(f.read().bars)).toBe(false);}}
 const f=setup();f.write({...f.read(),style:'future-unsupported'});expect(()=>f.source.capture()).toThrow('topology');expect(Object.isFrozen(f.read().bars)).toBe(false);
});
it('captures the calculation transform atomically with its raw prefix and retires on style change',async()=>{
 const f=setup(),standard=f.source.capture();expect(standard.transform).toBe('standard');f.write({...f.read(),style:'heikinashi'});expect(()=>standard.assertCurrent()).toThrow();const ha=f.source.capture();expect(ha.transform).toBe('heikin-ashi');expect(()=>ha.readRows(0,1)).toThrow(/preparation/);await ha.prepare(new AbortController().signal);expect(ha.readRows(0,1)[0].close).toBe(2);expect(Object.isFrozen(ha)).toBe(true);
});
it('locks only detached committed input and transports exact six-column values',async()=>{
 const f=setup(),prefix=f.source.capture();f.original[0].close=99;expect(Object.isFrozen(f.original)).toBe(false);expect(Object.isFrozen(f.read().bars)).toBe(false);
 const values=new Float64Array(await prefix.prepare(new AbortController().signal));expect(Object.isFrozen(f.read().bars)).toBe(true);expect(()=>{f.read().bars[0].close=7;}).toThrow();expect([...values]).toEqual([1700000000,1,3,1,2,-0,1700000060,2,4,1,3,10]);expect(Object.is(values[5],-0)).toBe(true);
 const copy=prefix.readRows(0,1);copy[0].close=55;expect(prefix.readRows(0,1)[0].close).toBe(2);await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow('consumed');
});
it('missing volume remains unavailable and irrelevant nested extras are not read or transported',async()=>{
 const f=setup(1),row=f.read().bars[0];delete(row as Partial<Bar>).volume;let reads=0;Object.defineProperty(row,'extra',{get(){reads++;throw Error('Unrelated extra');},configurable:true});
 const prefix=f.source.capture(),packed=new Float64Array(await prefix.prepare(new AbortController().signal));expect(Number.isNaN(packed[5])).toBe(true);expect(reads).toBe(0);expect(()=>{row.volume=1;}).toThrow();
});
it.each(['epoch','source','bars','style','executionIdentity','disposed'] as const)('%s replacement permanently retires the old handle even after restoration',key=>{
 const f=setup(),prefix=f.source.capture(),original=f.read(),replacement={...original,[key]:key==='style'?'heikinashi':key==='executionIdentity'?'new-replay-run':key==='disposed'?true:key==='bars'?structuredClone(original.bars):{}};
 f.write(replacement);expect(()=>prefix.assertCurrent()).toThrow();f.write(original);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});
it('copied receivers, chunk overrun and source disposal do not grant a current prefix',()=>{
 const f=setup(),prefix=f.source.capture(),copy={...prefix};expect(()=>copy.assertCurrent()).toThrow(/Foreign/);expect(()=>copy.readRows(0,1)).toThrow(/Foreign/);expect(()=>prefix.readRows(0,129)).toThrow();expect(()=>prefix.readRows(2,1)).toThrow();expect(()=>prefix.readRows(-1,1)).toThrow();f.source.dispose();expect(()=>prefix.assertCurrent()).toThrow();expect(()=>f.source.capture()).toThrow();
});
it.each(['cancel','replace'] as const)('%s during yielded packing returns no partial buffer',async mode=>{
 vi.useFakeTimers();const f=setup(129),prefix=f.source.capture(),abort=new AbortController(),work=prefix.prepare(abort.signal),assertion=expect(work).rejects.toThrow();if(mode==='cancel')abort.abort();else f.write({...f.read(),epoch:{}});await vi.runAllTimersAsync();await assertion;expect(()=>prefix.assertCurrent()).toThrow();
});
it('sparse, accessor and nonnumeric rows reject during preparation; over-limit metadata rejects at capture',async()=>{
 for(const malformed of [new Array(1),[{...rows(1)[0],close:'bad'}]]){const f=setup();f.write({...f.read(),bars:malformed as Bar[]});const prefix=f.source.capture();await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow();expect(()=>prefix.readRows(0,1)).toThrow(/retired/);}
 const large=setup();large.write({...large.read(),bars:new Array(100001)});expect(()=>large.source.capture()).toThrow();
 const f=setup();let reads=0;Object.defineProperty(f.read().bars[0],'close',{get(){reads++;return 2;}});const prefix=f.source.capture();await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow();expect(reads).toBe(0);
});
it('a separately supplied future tail is never consulted by the committed prefix',async()=>{
 const f=setup(),future:any[]=[];Object.defineProperty(future,'0',{get(){throw Error('Future row read');}});(f.read().source as any).future= future;const prefix=f.source.capture();expect(new Float64Array(await prefix.prepare(new AbortController().signal))).toHaveLength(12);
});
