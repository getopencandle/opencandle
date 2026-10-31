import {afterEach,expect,it} from 'vitest';
import {createStrategyReportClient,type ReportWorkerPort} from '../../src/strategy-report/client';
import {StrategyReportWorkerSession} from '../../src/strategy-report/worker-core';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
import type {StrategyReportJobInput} from '../../src/strategy-report/types';

// Independent client authority checks with the real numerical protocol and a
// controlled transport. These are not separate-thread or native-window tests.
class Port implements ReportWorkerPort {
 listeners=new Map<string,Set<(event:any)=>void>>();terminated=0;
 session=new StrategyReportWorkerSession((progress,job,sequence)=>this.emit({version:1,kind:'progress',job,sequence,progress}));
 constructor(){queueMicrotask(()=>this.emit({version:1,kind:'started'}));}
 emit(data:unknown){for(const listener of this.listeners.get('message')??[])listener({data});}
 addEventListener(type:string,listener:(event:any)=>void){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type)!.add(listener);}
 removeEventListener(type:string,listener:(event:any)=>void){this.listeners.get(type)?.delete(listener);}
 postMessage(message:unknown){const copy=structuredClone(message);queueMicrotask(()=>this.emit(this.session.handle(copy)));}
 terminate(){this.terminated++;}
}
const clients:ReturnType<typeof createStrategyReportClient>[]=[];
afterEach(()=>clients.splice(0).forEach(client=>client.dispose()));
function setup(){const ports:Port[]=[];const client=createStrategyReportClient({factory:()=>{const port=new Port();ports.push(port);return port;},yieldControl:()=>Promise.resolve()});clients.push(client);return{client,ports,owner:{signal:new AbortController().signal,assertCurrent(){}}};}
const input=():StrategyReportJobInput=>({execution:{bars:[1,2,3].map((close,index)=>({time:1000+index,open:close,high:close,low:close,close,volume:1})),barIds:['review:a','review:b','review:c'],proposals:[],chartType:'standard',context:{executionId:'synthetic-independent-authority',sourceLabel:'Synthetic independent authority fixture',currency:'USD',timezone:'UTC'}},config:{...DEFAULT_STRATEGY_CONFIG,commission:{kind:'fixed',value:0},initialCapital:1000}});

it('a copied client cannot start or retire the genuine active report',async()=>{
 const test=setup(),handle=await test.client.start(input(),test.owner),copy={...test.client};
 await expect(copy.start(input(),test.owner)).rejects.toThrow();
 expect(test.ports).toHaveLength(1);expect(test.ports[0].terminated).toBe(0);
 await expect(handle.inspect(2)).resolves.toMatchObject({point:{barIndex:2,equity:1000}});
});

it('rejected reentrant starts cannot lower the replacement barrier or leak a worker',async()=>{
 const test=setup();await test.client.start(input(),test.owner);const port=test.ports[0],failures:Promise<unknown>[]=[];
 port.terminate=()=>{port.terminated++;for(let attempt=0;attempt<2;attempt++)failures.push(test.client.start(input(),test.owner).then(()=> 'unexpected worker',error=>error));};
 const replacement=await test.client.start(input(),test.owner);
 expect(await Promise.all(failures)).toEqual([expect.any(Error),expect.any(Error)]);
 expect(test.ports).toHaveLength(2);expect(test.ports[0].terminated).toBe(1);expect(test.ports[1].terminated).toBe(0);
 await expect(replacement.inspect(2)).resolves.toMatchObject({point:{equity:1000}});
});
