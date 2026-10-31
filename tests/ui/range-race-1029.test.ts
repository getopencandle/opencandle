import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
// The pending range effect re-checks a busy chart input instead of waiting for a re-render that may never come.
// The effect body is taken from App.tsx (type annotation stripped) and run against a fake chart with fake timers.
const app=readFileSync('src/ui/App.tsx','utf8');
const start=app.indexOf('useEffect(()=>{let retry:ReturnType<typeof setTimeout>|null=null;');
const end=app.indexOf('},[chart,bars,dataset,inspectionEpoch]);',start);
const body=app.slice(start+'useEffect(()=>{'.length,end).replace('let retry:ReturnType<typeof setTimeout>|null=null;','let retry=null;');
const effect=new Function('pendingRange','chart','dataset','bars','source','workspace','setMessage','liveHistoryState','requestLiveHistory','reportFailure',body) as (...args:unknown[])=>(()=>void)|undefined;
afterEach(()=>{vi.useRealTimers();});
function run(chart:any,pending:any={preset:'6M',interval:'240m',datasetId:'d4h'}){
 const ref={current:pending},messages:string[]=[];
 const cleanup=effect(ref,chart,{provenance:{datasetId:'d4h'}},[{time:1}],{},{chartStyle:'candles'},(m:string)=>messages.push(m),()=>undefined,()=>{},(e:unknown)=>{throw e;});
 return {ref,messages,cleanup};
}
it('the effect is found and still pins the range-fix contract',()=>{
 expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
 expect(body).toContain('if(Date.now()<until)retry=setTimeout(apply,16);return;');
 expect(body).toContain('return()=>{if(retry!==null)clearTimeout(retry);};');
});
it('a busy input on the last render is re-checked and the range lands once it frees up',()=>{
 vi.useFakeTimers();let busy=3;const chart={isInputCurrent:vi.fn(()=>busy--<=0),setRange:vi.fn(()=>({ok:true,limitedByHistory:false}))};
 const {ref}=run(chart);
 expect(chart.setRange).not.toHaveBeenCalled();
 vi.advanceTimersByTime(16*5);
 expect(chart.setRange).toHaveBeenCalledTimes(1);expect(chart.setRange).toHaveBeenCalledWith('6M');expect(ref.current).toBeNull();
 vi.advanceTimersByTime(1000);expect(chart.setRange).toHaveBeenCalledTimes(1);
});
it('a newer render cancels the re-check, and the re-check gives up after 5 s',()=>{
 vi.useFakeTimers();const chart={isInputCurrent:vi.fn(()=>false),setRange:vi.fn()};
 const first=run(chart);const calls=chart.isInputCurrent.mock.calls.length;first.cleanup!();vi.advanceTimersByTime(1000);
 expect(chart.isInputCurrent.mock.calls.length).toBe(calls);
 const second=run(chart);vi.advanceTimersByTime(6000);const after=chart.isInputCurrent.mock.calls.length;vi.advanceTimersByTime(2000);
 expect(chart.isInputCurrent.mock.calls.length).toBe(after);expect(chart.setRange).not.toHaveBeenCalled();expect(second.ref.current).not.toBeNull();
});
it('a pending range for another feed is left alone (no re-check)',()=>{
 vi.useFakeTimers();const chart={isInputCurrent:vi.fn(()=>false),setRange:vi.fn()};
 run(chart,{preset:'6M',interval:'240m',datasetId:'other'});vi.advanceTimersByTime(1000);
 expect(chart.isInputCurrent).not.toHaveBeenCalled();
});
