import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {scriptExamples} from '../../src/ui/ScriptPanel';
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars=Array.from({length:30},(_,index)=>({id:'synthetic-example-'+index,revision:1,time:index+1,open:index+1,high:index+2,low:index,close:index+1,volume:1}));
describe('shipped editor examples actually execute through the restricted worker',()=>{
  for(const [name,source] of Object.entries(scriptExamples))it(name,async()=>{
    const jobs=new ScriptJobs();try{
      const result=await jobs.run({requestId:'example-'+name.replaceAll(' ','-'),source,bars});
      expect(result.ok,result.error?.message).toBe(true);
      if(name==='SMA 20')expect(result.value.plots.find((plot:any)=>plot.title==='SMA 20').values.at(-1).value).toBe(20.5);
      if(name==='Persistent range')expect(result.value.plots[0].values.at(-1).value).toBe(31);
      if(name==='Moving average cross strategy')expect(result.value.orders.map((order:any)=>[order.side,order.quantity,order.event.id])).toEqual([['buy',1,'synthetic-example-20']]);
    }finally{jobs.close();}
  });
});
