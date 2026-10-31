import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {inputForScript}=require('../../electron/script-runtime.cjs');
const bars=[2,4,8,10].map((close,index)=>({id:'synthetic-'+index,revision:0,time:1000+index,open:close,high:close+1,low:close-1,close,volume:1}));
const source=`({init(ctx){ctx.state.initializations=(ctx.state.initializations||0)+1;ctx.state.random=[];},onBar(ctx){ctx.state.random.push(ctx.random());ctx.plot('SMA',ctx.sma('sma3',ctx.bar.close,3),'#123456');if(ctx.bar.close>7){ctx.alert('high','Synthetic alert');ctx.alert('high','Synthetic duplicate');ctx.order('buy',1);}}})`;
describe('restricted LVScript worker gate',()=>{
  it('matches independent SMA oracle and snapshot restores deterministic state with init once',async()=>{
    const jobs=new ScriptJobs();
    try {
      const full=await jobs.run({requestId:'full',source,bars});expect(full.ok).toBe(true);
      expect(full.value.plots[0].values.map((v:any)=>v.value)).toEqual([null,null,14/3,22/3]);
      expect(full.value.state.state.initializations).toBe(1);expect(full.value.alerts.length).toBe(2);expect(full.value.orders.map((v:any)=>v.sequence)).toEqual([1,2]);
      const first=await jobs.run({requestId:'first',source,bars:bars.slice(0,2)});expect(first.ok).toBe(true);
      const second=await jobs.run({requestId:'second',source,bars:bars.slice(2),snapshot:first.value.state});expect(second.ok).toBe(true);
      expect(second.value.state).toEqual(full.value.state);
      expect(second.value.state.state.random).toEqual(full.value.state.state.random);
      const invalidTa=structuredClone(first.value.state);invalidTa.ta=[];
      const invalid=await jobs.run({requestId:'bad-ta',source,bars:bars.slice(2),snapshot:invalidTa});expect(invalid.ok).toBe(false);expect(invalid.error.code).toBe('INVALID_SNAPSHOT');
    } finally{jobs.close();}
  });
  it('rolls provisional evaluation back and rejects repeated/corrected events without a prior snapshot',async()=>{
    const jobs=new ScriptJobs();
    try{
      const first=await jobs.run({requestId:'prior',source,bars:bars.slice(0,2)});
      const provisional=await jobs.run({requestId:'prov',source,bars:bars.slice(2),snapshot:first.value.state,provisional:true});expect(provisional.ok).toBe(true);
      expect(provisional.value.state).toEqual(first.value.state);expect(provisional.value.plots).toEqual([]);expect(provisional.value.alerts).toEqual([]);expect(provisional.value.orders).toEqual([]);
      const duplicate=await jobs.run({requestId:'duplicate',source,bars:bars.slice(0,1),snapshot:first.value.state});expect(duplicate.ok).toBe(false);
      expect(duplicate.error.message).toContain('Replay requires');
    }finally{jobs.close();}
  });
  it('accepts distinct stable derived-bar identities sharing a display timestamp and rejects reused identities',async()=>{
    const jobs=new ScriptJobs();try{
      const sameTime=bars.map(bar=>({...bar,time:1000}));
      const first=await jobs.run({requestId:'derived-first',source,bars:sameTime.slice(0,2)});expect(first.ok).toBe(true);
      const second=await jobs.run({requestId:'derived-second',source,bars:sameTime.slice(2),snapshot:first.value.state});expect(second.ok).toBe(true);expect(second.value.state.processedCount).toBe(4);
      const repeated=await jobs.run({requestId:'derived-repeat',source,bars:[sameTime[0]],snapshot:second.value.state});expect(repeated.ok).toBe(false);
      expect(()=>inputForScript({requestId:'duplicate-request',source,bars:[sameTime[0],sameTime[0]]})).toThrow('identities');
    }finally{jobs.close();}
  });
  it('rejects event effects from init without emitting identity-free orders, plots or alerts',async()=>{
    const jobs=new ScriptJobs();try{
      for(const [index,effect]of ["ctx.order('buy',1)","ctx.plot('Synthetic invalid init',2)","ctx.alert('Synthetic invalid init','no event')"].entries()){
        const result=await jobs.run({requestId:'invalid-init-'+index,bars,source:'({init(ctx){'+effect+';},onBar(ctx){ctx.state.called=true;}})'});
        expect(result.ok).toBe(false);expect(result.error.code).toBe('SCRIPT_FAILED');expect(result.error.message).toContain('require onBar');
        expect(result.value).toBeUndefined();
      }
    }finally{jobs.close();}
  });
  it('keeps opaque event IDs and alert names distinct even when delimiter concatenations collide',async()=>{
    const jobs=new ScriptJobs();try{
      const input=[{...bars[0],id:'a'},{...bars[1],id:'a:0:b'}];
      const result=await jobs.run({requestId:'opaque-alert-identity',bars:input,source:"({onBar(ctx){ctx.alert(ctx.index===0?'b:0:c':'c','Synthetic collision regression');}})"});
      expect(result.ok).toBe(true);expect(result.value.alerts.map((event:any)=>[event.event.id,event.name])).toEqual([['a','b:0:c'],['a:0:b','c']]);
      expect(new Set(result.value.state.alertDedupe).size).toBe(2);
    }finally{jobs.close();}
  });
  it('encodes adversarial plot titles as stable distinct IDs safe for persisted style-map keys',async()=>{
    const jobs=new ScriptJobs();try{
      const names=['constructor','toString','__proto__','lvplot:constructor'];
      const code='({onBar(ctx){for(const name of '+JSON.stringify(names)+')ctx.plot(name,ctx.bar.close,"#123456");}})';
      const first=await jobs.run({requestId:'prototype-plots-first',source:code,bars:bars.slice(0,2)});expect(first.ok).toBe(true);
      expect(first.value.plots.map((plot:any)=>plot.title)).toEqual(names);
      expect(first.value.plots.map((plot:any)=>plot.id)).toEqual(names.map(name=>'lvplot:'+name));expect(new Set(first.value.plots.map((plot:any)=>plot.id)).size).toBe(names.length);
      const second=await jobs.run({requestId:'prototype-plots-restored',source:code,bars:bars.slice(2),snapshot:first.value.state});expect(second.ok).toBe(true);
      expect(second.value.plots.map((plot:any)=>plot.id)).toEqual(first.value.plots.map((plot:any)=>plot.id));
      const {jsonData}=require('../../electron/validation.cjs');
      const styles=Object.fromEntries(first.value.plots.map((plot:any)=>[plot.id,{visible:true,color:plot.color,width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true}]));
      expect(jsonData({styles})).toEqual({styles});expect(Object.getPrototypeOf(styles)).toBe(Object.prototype);
    }finally{jobs.close();}
  });
  it('has no ambient FS/network/credentials and guest Date/eval/Promise APIs are unavailable',async()=>{
    const jobs=new ScriptJobs();
    try{
      const result=await jobs.run({requestId:'ambient',bars:bars.slice(0,1),source:`({onBar(ctx){ctx.state.types=[typeof process,typeof require,typeof fetch,typeof XMLHttpRequest,typeof Date,typeof eval,typeof globalThis['Pro'+'mise'],typeof input,typeof snapshot,typeof effects];}})`});
      expect(result.ok).toBe(true);expect(result.value.state.state.types).toEqual(Array(10).fill('undefined'));
      const escaped=await jobs.run({requestId:'escape',bars:bars.slice(0,1),source:`({onBar(ctx){ctx.state.escape=({}).constructor.constructor('return process')();}})`});expect(escaped.ok).toBe(false);
      const arrow=await jobs.run({requestId:'arrow',bars:bars.slice(0,1),source:`({onBar(ctx){ctx.state.escape=(()=>{}).constructor('return process')();}})`});expect(arrow.ok).toBe(false);
      const generator=await jobs.run({requestId:'generator',bars:bars.slice(0,1),source:`({onBar(ctx){ctx.state.escape=(function*(){}).constructor('yield process')();}})`});expect(generator.ok).toBe(false);
      const inherited=await jobs.run({requestId:'inherited-constructors',bars:bars.slice(0,1),source:`({onBar(ctx){ctx.state.types=[typeof Math.abs.constructor,typeof Object.getPrototypeOf(Object.getPrototypeOf(function*(){})).constructor,typeof globalThis['F'+'unction']];}})`});expect(inherited.ok).toBe(true);expect(inherited.value.state.state.types).toEqual(['undefined','undefined','undefined']);
      for(const [index,escapedAsync]of ['({a\\u0073ync onBar(ctx){ctx.plot("Synthetic",1)}})','({onBar(ctx){const f=(a\\u0073ync ()=>1);ctx.state.type=typeof f.constructor;}})'].entries()){
        const attempt=await jobs.run({requestId:'escaped-async-'+index,bars:bars.slice(0,1),source:escapedAsync});expect(attempt.ok).toBe(false);expect(attempt.value).toBeUndefined();
      }
      expect(()=>inputForScript({requestId:'async',bars:[],source:'({async onBar(){}})'})).toThrow('synchronous');
    }finally{jobs.close();}
  });
  it('interrupts infinite work, bounds allocation/output, cancels without a result commit, and permits the next run',async()=>{
    const jobs=new ScriptJobs();
    try{
      const infinite=jobs.run({requestId:'cancel',bars:bars.slice(0,1),source:'({onBar(){while(true){}}})'});
      expect(jobs.cancel('cancel')).toBe(true);expect((await infinite).error.code).toBe('CANCELLED');expect(jobs.cancel('cancel')).toBe(false);
      const loop=await jobs.run({requestId:'loop',bars:bars.slice(0,1),source:'({onBar(){while(true){}}})'});expect(loop.ok).toBe(false);
      const allocation=await jobs.run({requestId:'memory',bars:bars.slice(0,1),source:'({onBar(ctx){ctx.state.bomb=new Array(10000000).fill(5);}})'});expect(allocation.ok).toBe(false);
      const output=await jobs.run({requestId:'output',bars:bars.slice(0,1),source:`({onBar(ctx){for(let i=0;i<10001;i++)ctx.plot('Synthetic flood',i);}})`});expect(output.ok).toBe(false);
      const next=await jobs.run({requestId:'next',source,bars});expect(next.ok).toBe(true);
      expect(jobs.active.size).toBe(0);
    }finally{jobs.close();}
  },15000);
});
