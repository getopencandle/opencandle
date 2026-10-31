import {expect,it} from 'vitest';
import {createAnalysisTransactionEngine,type AnalysisScriptLease} from '../../src/chart/analysis-transaction';
import {createMarketQueue} from '../../src/chart/market-queue';
import {createNotificationBatch} from '../../src/chart/notification-batch';
const bar={time:1,open:1,high:2,low:1,close:2,volume:1},source={datasetId:'fixture',revision:'1',fixture:true,label:'Synthetic'};
function setup(){let input={bars:[bar],source},native={indicator:1,drawing:1,script:1},failApply=0,failRestore=false;const published:typeof native[]=[],calls:string[]=[],broken:string[]=[],pending:boolean[]=[];const batch=createNotificationBatch(()=>published.push({...native}));const queue=createMarketQueue({read:()=>input,write:value=>{input=value;},apply:async()=>{},disposed:()=>false});
 const scripts:AnalysisScriptLease={changed:true,pauseAndCapture:()=>{calls.push('pause');},stage:()=>{native.script=2;calls.push('stage');batch.changed();},rollback:()=>{calls.push('metadata rollback');},resume:committed=>{calls.push('resume:'+committed);},abandon:()=>{calls.push('abandon');}};
 const engine=createAnalysisTransactionEngine<number,{input:typeof input;native:typeof native}>({exclusive:queue.exclusive,validate:request=>{if(request<0)throw new Error('Invalid config');},noOp:request=>request===0,capture:()=>({input:structuredClone(input),native:{...native}}),hold:batch.beginExternalTransaction,apply:async()=>{native.indicator=2;batch.changed();if(failApply===1)throw new Error('Native1');native.drawing=2;batch.changed();if(failApply===2)throw new Error('Native2');},settle:async()=>{if(failApply===3)throw new Error('Late pane failure');},restore:async snapshot=>{calls.push('native restore');if(failRestore)throw new Error('Broken restore');input=snapshot.input;native={...snapshot.native};batch.changed();},scripts:()=>scripts,pending:value=>pending.push(value),broken:message=>broken.push(message)});
 return{engine,queue,native:()=>native,input:()=>input,published,calls,broken,pending,fail:(stage:number,restore=false)=>{failApply=stage;failRestore=restore;}};
}
it('successful preparation exposes no partial captures; commit/seal publishes one complete configuration',async()=>{
 const test=setup(),lease=await test.engine.prepare(1);expect(test.native()).toEqual({indicator:2,drawing:2,script:2});expect(test.published).toEqual([]);expect(test.calls).toEqual(['pause','stage']);lease.commit();expect(test.published).toEqual([]);lease.seal();expect(test.published).toEqual([{indicator:2,drawing:2,script:2}]);expect(test.calls.at(-1)).toBe('resume:true');expect(test.pending).toEqual([true,false]);expect(()=>lease.seal()).toThrow();
});
it('first, middle and native-readiness failures restore all components without partial publication',async()=>{
 for(const stage of [1,2,3]){const test=setup();test.fail(stage);await expect(test.engine.prepare(1)).rejects.toThrow();expect(test.native()).toEqual({indicator:1,drawing:1,script:1});expect(test.published).toEqual([]);expect(test.calls.slice(-3)).toEqual(['native restore','metadata rollback','resume:false']);expect(test.pending).toEqual([true,false]);expect(test.broken).toEqual([]);}
});
it('incomplete native recovery abandons runtime metadata instead of declaring an old accepted result ready',async()=>{
 const test=setup();test.fail(2,true);await expect(test.engine.prepare(1)).rejects.toThrow('rollback was incomplete');expect(test.calls).toContain('abandon');expect(test.calls).not.toContain('metadata rollback');expect(test.calls).not.toContain('resume:false');expect(test.published).toEqual([]);expect(test.broken).toHaveLength(1);
});
it('new source ownership supersedes prepared rollback without restoring native or old runtime metadata',async()=>{
 const test=setup(),lease=await test.engine.prepare(1);await test.queue.set([bar],{...source,revision:'2'});expect(lease.isCurrent()).toBe(false);await expect(lease.rollback()).rejects.toThrow('superseded');expect(test.input().source.revision).toBe('2');expect(test.calls).toEqual(['pause','stage','abandon']);expect(test.published).toEqual([]);expect(test.broken).toHaveLength(1);expect(test.pending).toEqual([true,false]);
});
it('invalid and exact no-op requests do not pause, replace handles, recalculate or publish',async()=>{
 const test=setup();await expect(test.engine.prepare(-1)).rejects.toThrow('Invalid config');const lease=await test.engine.prepare(0);expect(lease.changed).toBe(false);lease.commit();expect(()=>lease.commit()).toThrow();lease.seal();expect(test.calls).toEqual([]);expect(test.published).toEqual([]);expect(test.pending).toEqual([]);
});
