import {afterEach,expect,it,vi} from 'vitest';
import {createOwnedVwapPrefixSource} from '../../src/chart/vwap-prefix-source';

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
function source(){const bars=Array.from({length:129},(_,index)=>({time:1700000000+index*60,open:10,high:12,low:9,close:11,volume:1}));const basis={bars,epoch:{},source:{},style:'candles',executionIdentity:'ordinary',disposed:false};return createOwnedVwapPrefixSource({readBasis:()=>basis});}
function causes(error:unknown):unknown[]{return error instanceof AggregateError?[error,...error.errors.flatMap(causes)]:[error];}

it('abort during timer acquisition preserves failure clearing the late returned owned timer',async()=>{
 vi.useFakeTimers();const schedule=setTimeout,clear=clearTimeout,abort=new AbortController(),marker=Error('SYNTHETIC late timer cleanup failed');let clears=0;
 vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void,delay?:number)=>{const timer=schedule(callback,delay);abort.abort();return timer;}) as typeof setTimeout);
 vi.spyOn(globalThis,'clearTimeout').mockImplementation(((timer:ReturnType<typeof setTimeout>)=>{clear(timer);if(++clears===1)throw marker;}) as typeof clearTimeout);
 const owned=source(),prefix=owned.capture();let failure:unknown;try{await prefix.prepare(abort.signal);}catch(error){failure=error;}
 expect(clears).toBeGreaterThan(0);expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);
 expect(causes(failure)).toContain(marker);owned.dispose();
});

it('an already acquired timer cleanup failure also preserves cancellation without publishing readable rows',async()=>{
 vi.useFakeTimers();const clear=clearTimeout,abort=new AbortController(),marker=Error('SYNTHETIC pending timer cleanup failed');let clears=0;
 vi.spyOn(globalThis,'clearTimeout').mockImplementation(((timer:ReturnType<typeof setTimeout>)=>{clear(timer);if(++clears===1)throw marker;}) as typeof clearTimeout);
 const owned=source(),prefix=owned.capture(),work=prefix.prepare(abort.signal);const settled=work.then(()=>({value:true,error:undefined as unknown}),error=>({value:false,error}));abort.abort();const result=await settled;
 expect(result.value).toBe(false);expect(causes(result.error)).toContain(marker);expect(vi.getTimerCount()).toBe(0);expect(()=>prefix.readRows(0,1)).toThrow(/retired/);owned.dispose();
});

it('abort from the last ownership callback after listener cleanup cannot publish a completed prefix',async()=>{
 async function probe(abortAt?:number){
  const bars=[{time:1700000000,open:10,high:12,low:9,close:11,volume:1}],basis={bars,epoch:{},source:{},style:'candles',executionIdentity:'ordinary',disposed:false},abort=new AbortController();let frozenReads=0;
  const owned=createOwnedVwapPrefixSource({readBasis(){if(Object.isFrozen(bars)&&++frozenReads===abortAt)abort.abort();return basis;}}),prefix=owned.capture();
  let buffer:unknown,failure:unknown;try{buffer=await prefix.prepare(abort.signal);}catch(error){failure=error;}
  const result={buffer,failure,frozenReads,aborted:abort.signal.aborted};owned.dispose();return result;
 }
 const control=await probe();expect(control.buffer).toBeInstanceOf(ArrayBuffer);expect(control.frozenReads).toBeGreaterThan(0);
 const fault=await probe(control.frozenReads);expect(fault.aborted).toBe(true);
 expect(fault.failure).toBeInstanceOf(Error);expect(fault.buffer).toBeUndefined();
});
