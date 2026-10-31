import {expect,it,vi} from 'vitest';
import {acceptChartExecutionInput} from '../../src/chart/execution-input-lifecycle';

const input={bars:[{time:1700000000,open:1,high:2,low:1,close:2,volume:3}],source:{datasetId:'synthetic',revision:'1',fixture:true,label:'Synthetic test'},style:'candles'};
function fixture(){let run='ordinary',active=true,inputCurrent=true;const events:string[]=[];let release=()=>{};
 const settled=new Promise<void>(resolve=>release=resolve),port={setExecutionIdentity(next:string){events.push('run:'+next);run=next;},getExecutionIdentity:()=>run,isInputCurrent:()=>inputCurrent,ready:async()=>{events.push('native-ready');},setBars:vi.fn(async()=>({ok:true as const})),setStyle:vi.fn(()=>({ok:true as const})),waitForAnalysisCalculations:async()=>{events.push('await-calculation');await settled;}};
 return{port,events,release,current:()=>active,retire:()=>active=false,replace:(next:string)=>run=next,inputRetire:()=>inputCurrent=false};
}
it('same-bars replay run waits for its actual calculation before publishing readiness',async()=>{
 const f=fixture();let complete=false;const work=acceptChartExecutionInput(f.port,input,'replay:2',f.current).then(value=>{complete=true;return value;});await Promise.resolve();await Promise.resolve();expect(complete).toBe(false);expect(f.events).toEqual(['run:replay:2','native-ready','await-calculation']);expect(f.port.setBars).not.toHaveBeenCalled();f.release();expect(await work).toMatchObject({accepted:true,executionIdentity:'replay:2'});
});
it.each(['run','effect','input'] as const)('%s replacement during calculation prevents an old ready callback',async kind=>{
 const f=fixture(),work=acceptChartExecutionInput(f.port,input,'replay:2',f.current);await Promise.resolve();await Promise.resolve();if(kind==='run')f.replace('replay:3');else if(kind==='effect')f.retire();else f.inputRetire();f.release();expect(await work).toEqual({accepted:false});
});
it('a rejected calculation wait is never accepted input readiness',async()=>{
 const f=fixture();f.port.waitForAnalysisCalculations=async()=>{throw Error('Native publication unconfirmed');};await expect(acceptChartExecutionInput(f.port,input,'replay:2',f.current)).rejects.toThrow('unconfirmed');
});
it('a retired effect cannot change the native execution owner',async()=>{
 const f=fixture();f.retire();expect(await acceptChartExecutionInput(f.port,input,'replay:2',f.current)).toEqual({accepted:false});expect(f.events).toEqual([]);
});
