import {afterEach,expect,it,vi} from 'vitest';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';
import type {Bar} from '../../src/domain/types';

const rows=(count=2):Bar[]=>Array.from({length:count},(_,index)=>({time:1700000000+index*60,open:10,high:12,low:9,close:11,volume:index?-0:5}));
function setup(count=2){
 const caller=rows(count);let basis:VwapPrefixBasis={epoch:{},source:{synthetic:true},bars:structuredClone(caller),style:'candles',executionIdentity:'ordinary',disposed:false};
 let onRead=()=>{};const source=createOwnedVwapPrefixSource({readBasis(){onRead();return basis;}});
 return{caller,source,basis:()=>basis,replace(next:VwapPrefixBasis){basis=next;},onRead(action:()=>void){onRead=action;}};
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

// These assertions intentionally revise admission timing. The original eager
// implementation is a performance-policy baseline, not a claimed data exploit.
it('capture owns only metadata and leaves private scalar locking to activation',()=>{
 const f=setup(),prefix=f.source.capture();
 expect(prefix.rows).toBe(2);expect(prefix.transform).toBe('standard');expect(prefix.executionIdentity).toBe('ordinary');
 expect(Object.isFrozen(prefix)).toBe(true);expect(Object.isFrozen(f.basis().bars)).toBe(false);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[0],'close')?.writable).toBe(true);
});

it('an unprepared metadata lease cannot disclose numerical row copies',()=>{
 const f=setup(),prefix=f.source.capture();
 expect(()=>prefix.readRows(0,1)).toThrow(/prepar|complete/i);
 expect(()=>prefix.assertCurrent()).not.toThrow();
});

it('a late malformed row fails during preparation without running its getter',async()=>{
 const f=setup(129);let reads=0;
 Object.defineProperty(f.basis().bars[128],'close',{get(){reads++;return 11;},enumerable:true,configurable:true});
 const prefix=f.source.capture();expect(reads).toBe(0);
 await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/numeric data|data field/i);
 expect(reads).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/i);
});

it('preparation locks and packs at most128 rows before its existing timer yield',async()=>{
 vi.useFakeTimers();const f=setup(257),prefix=f.source.capture(),signal=new AbortController();
 const work=prefix.prepare(signal.signal);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[0],'close')?.writable).toBe(false);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[127],'close')?.writable).toBe(false);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[128],'close')?.writable).toBe(true);
 expect(()=>prefix.readRows(0,1)).toThrow(/prepar|complete/i);expect(vi.getTimerCount()).toBe(1);
 await vi.runAllTimersAsync();const buffer=new Float64Array(await work);
 expect(buffer.length).toBe(257*6);expect(buffer[4]).toBe(11);expect(Object.is(buffer[11],-0)).toBe(true);
 expect(Object.isFrozen(f.basis().bars)).toBe(true);expect(prefix.readRows(256,1)[0]).toEqual(f.caller[256]);expect(vi.getTimerCount()).toBe(0);
});

it('elapsed work can yield before128 rows without changing the eventual buffer',async()=>{
 vi.useFakeTimers();const f=setup(4),prefix=f.source.capture();let clock=0;
 vi.spyOn(performance,'now').mockImplementation(()=>clock+=5);
 const work=prefix.prepare(new AbortController().signal);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[0],'close')?.writable).toBe(false);
 expect(Object.getOwnPropertyDescriptor(f.basis().bars[1],'close')?.writable).toBe(true);
 await vi.runAllTimersAsync();const buffer=new Float64Array(await work);
 expect([...buffer.filter((_value,index)=>index%6===4)]).toEqual([11,11,11,11]);expect(prefix.readRows(0,4)).toEqual(f.caller);
});

it('nonfinite or backwards elapsed clocks retire preparation without publishing rows',async()=>{
 for(const invalid of [NaN,Infinity,-1]){
  const f=setup(),prefix=f.source.capture(),spy=vi.spyOn(performance,'now').mockReturnValue(invalid);
  await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/clock/);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);spy.mockRestore();
 }
 const f=setup(),prefix=f.source.capture();let reads=0;vi.spyOn(performance,'now').mockImplementation(()=>reads++?0:10);
 await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/clock/);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('abort before activation leaves private rows unlocked and does not allocate a continuation',async()=>{
 vi.useFakeTimers();const f=setup(),prefix=f.source.capture(),abort=new AbortController();abort.abort();
 await expect(prefix.prepare(abort.signal)).rejects.toThrow(/cancel/);expect(vi.getTimerCount()).toBe(0);
 expect(Object.isFrozen(f.basis().bars)).toBe(false);expect(Object.getOwnPropertyDescriptor(f.basis().bars[0],'close')?.writable).toBe(true);
 expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it.each(['abort','dispose'] as const)('%s removes a pending timer and rejects without waiting for it',async mode=>{
 vi.useFakeTimers();const f=setup(129),prefix=f.source.capture(),abort=new AbortController(),work=prefix.prepare(abort.signal),failure=expect(work).rejects.toThrow(/cancel|disposed/);
 expect(vi.getTimerCount()).toBe(1);if(mode==='abort')abort.abort();else f.source.dispose();
 await failure;expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);expect(Object.isFrozen(f.basis().bars)).toBe(false);
});

it.each(['epoch','source','bars','style','executionIdentity'] as const)('%s change during a slice permanently retires the metadata handle',async key=>{
 vi.useFakeTimers();const f=setup(129),prefix=f.source.capture(),before=f.basis(),work=prefix.prepare(new AbortController().signal),failure=expect(work).rejects.toThrow(/changed|retired/);
 f.replace({...before,[key]:key==='bars'?structuredClone(before.bars):key==='style'?'heikinashi':key==='executionIdentity'?'replay:new':{}});
 await vi.runAllTimersAsync();await failure;f.replace(before);expect(()=>prefix.assertCurrent()).toThrow(/retired/);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('a cancelled partial graph is revalidated by a separate capture, never treated as sealed',async()=>{
 vi.useFakeTimers();const f=setup(129),first=f.source.capture(),abort=new AbortController(),old=first.prepare(abort.signal),oldFailure=expect(old).rejects.toThrow(/cancel/);abort.abort();await oldFailure;
 let getterReads=0;Object.defineProperty(f.basis().bars[128],'close',{get(){getterReads++;return 11;},enumerable:true,configurable:true});
 const second=f.source.capture(),work=second.prepare(new AbortController().signal),failure=expect(work).rejects.toThrow(/numeric data/);
 await vi.runAllTimersAsync();await failure;expect(getterReads).toBe(0);expect(()=>second.readRows(0,1)).toThrow(/retired/);
});

it('a failed late row does not leave a reusable complete marker',async()=>{
 vi.useFakeTimers();const f=setup(129);(f.basis().bars[128] as unknown as {close:unknown}).close='bad';
 const first=f.source.capture(),one=first.prepare(new AbortController().signal),rejected=expect(one).rejects.toThrow(/numeric data/);await vi.runAllTimersAsync();await rejected;
 f.basis().bars[128].close=12;const second=f.source.capture();expect(()=>second.readRows(0,1)).toThrow(/preparation/);
 const two=second.prepare(new AbortController().signal);await vi.runAllTimersAsync();expect(new Float64Array(await two)[128*6+4]).toBe(12);expect(()=>first.assertCurrent()).toThrow(/retired/);
});

it('a later capture of a fully sealed graph still requires its own preparation',async()=>{
 const f=setup(),first=f.source.capture(),one=new Float64Array(await first.prepare(new AbortController().signal));
 const second=f.source.capture();expect(()=>second.readRows(0,1)).toThrow(/preparation/);
 const two=new Float64Array(await second.prepare(new AbortController().signal));expect([...two]).toEqual([...one]);
 second.readRows(0,1)[0].close=99;expect(first.readRows(0,1)[0].close).toBe(11);
});

it('source disposal retires all concurrently preparing captures and clears both continuations',async()=>{
 vi.useFakeTimers();const f=setup(129),one=f.source.capture(),two=f.source.capture();
 const first=one.prepare(new AbortController().signal),second=two.prepare(new AbortController().signal);
 const failures=[expect(first).rejects.toThrow(/disposed/),expect(second).rejects.toThrow(/disposed/)];expect(vi.getTimerCount()).toBe(2);
 f.source.dispose();await Promise.all(failures);expect(vi.getTimerCount()).toBe(0);expect(()=>one.readRows(0,1)).toThrow();expect(()=>two.readRows(0,1)).toThrow();
});

it('copied prepare/read methods cannot consume or read the genuine handle',async()=>{
 const f=setup(),prefix=f.source.capture(),copy={...prefix};
 await expect(copy.prepare(new AbortController().signal)).rejects.toThrow(/Foreign/);expect(()=>copy.readRows(0,1)).toThrow(/Foreign/);
 await prefix.prepare(new AbortController().signal);expect(prefix.readRows(0,1)[0].close).toBe(11);
 await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/consumed/);
});

it('swallowed ownership assertion reentry during preparation prevents final completion',async()=>{
 vi.useFakeTimers();const f=setup(129),prefix=f.source.capture(),work=prefix.prepare(new AbortController().signal),failure=expect(work).rejects.toThrow(/retired/);
 let armed=true,inner:unknown;f.onRead(()=>{if(armed){armed=false;try{prefix.assertCurrent();}catch(error){inner=error;}}});
 await vi.runAllTimersAsync();await failure;expect(inner).toBeInstanceOf(Error);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('AbortSignal own accessors cannot execute in place of the captured intrinsic methods',async()=>{
 const f=setup(),prefix=f.source.capture(),abort=new AbortController();let reads=0;
 for(const key of ['aborted','addEventListener','removeEventListener'])Object.defineProperty(abort.signal,key,{get(){reads++;throw Error('Own signal getter');}});
 await prefix.prepare(abort.signal);expect(reads).toBe(0);expect(prefix.readRows(0,1)[0].close).toBe(11);
});

it('retained old timer callbacks cannot resume cancelled or replacement preparation',async()=>{
 vi.useFakeTimers();const schedule=setTimeout,callbacks:Array<()=>void>=[];
 vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void,delay?:number)=>{callbacks.push(callback);return schedule(callback,delay);}) as typeof setTimeout);
 const f=setup(129),one=f.source.capture(),abort=new AbortController(),old=one.prepare(abort.signal),failure=expect(old).rejects.toThrow(/cancel/);const oldCallback=callbacks[0];abort.abort();await failure;
 const two=f.source.capture(),current=two.prepare(new AbortController().signal);oldCallback();expect(()=>two.readRows(0,1)).toThrow(/preparation/);expect(vi.getTimerCount()).toBe(1);
 await vi.runAllTimersAsync();await current;expect(two.readRows(128,1)[0].close).toBe(11);
});

it('synchronous timer reentry is rejected and its returned owned handle is cleaned',async()=>{
 vi.useFakeTimers();const schedule=setTimeout;
 vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void,delay?:number)=>{const timer=schedule(()=>{},delay);callback();return timer;}) as typeof setTimeout);
 const f=setup(129),prefix=f.source.capture();await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/asynchronously/);
 expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('cancellation while acquiring a timer cleans the late returned handle',async()=>{
 vi.useFakeTimers();const schedule=setTimeout,abort=new AbortController();
 vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void,delay?:number)=>{const timer=schedule(callback,delay);abort.abort();return timer;}) as typeof setTimeout);
 const f=setup(129),prefix=f.source.capture();await expect(prefix.prepare(abort.signal)).rejects.toThrow(/cancel/);
 expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('late source retirement during final ownership checks never makes rows readable',async()=>{
 const f=setup(),prefix=f.source.capture();let retired=false;
 f.onRead(()=>{if(!retired&&Object.isFrozen(f.basis().bars)){retired=true;f.replace({...f.basis(),epoch:{}});}});
 await expect(prefix.prepare(new AbortController().signal)).rejects.toThrow(/changed/);
 expect(retired).toBe(true);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});

it('a host cancellation followed by its own error retains both original causes',async()=>{
 vi.useFakeTimers();const f=setup(129),prefix=f.source.capture(),abort=new AbortController(),work=prefix.prepare(abort.signal);
 const literal=Error('Owned host failed after abort');let armed=true;
 f.onRead(()=>{if(armed){armed=false;abort.abort();throw literal;}});
 let failure:unknown;const settled=work.catch(error=>{failure=error;});await vi.runAllTimersAsync();await settled;
 const causes=(error:unknown):unknown[]=>error instanceof AggregateError?[error,...error.errors.flatMap(causes)]:[error];
 expect(causes(failure)).toContain(literal);expect(causes(failure).some(error=>error instanceof Error&&/cancel/.test(error.message))).toBe(true);
 expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
});
