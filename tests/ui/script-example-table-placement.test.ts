import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {scriptExamples} from '../../src/ui/ScriptPanel';

// Owner report (0.8.1): the Daily ATR example drew its table over the price legend. The legend (series heading plus the
// indicator list) sits at the top left and, in a narrow grid cell, spans nearly the whole top edge, so a built-in example's
// table must default to a lower corner. Every example runs through the real restricted worker on SYNTHETIC bars.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const DAY=86400,D0=19700*DAY;
const bars=Array.from({length:24*20},(_,index)=>{const close=100+Math.sin(index/9)*4+index*0.01;return{id:'synthetic-tp-'+index,revision:1,time:D0+index*3600,open:close-0.2,high:close+1,low:close-1,close,volume:10};});

describe('built-in example tables stay clear of the legend',{timeout:120000},()=>{
 it('Daily ATR draws its panel bottom right by default, and the position is a choice in its settings',async()=>{
  const jobs=new ScriptJobs();
  try{
   const result=await jobs.run({requestId:'atr-placement',source:scriptExamples['Daily ATR panel'],bars});
   expect(result.ok,result.error?.message).toBe(true);
   const tables=result.value.objects.tables;expect(tables).toHaveLength(1);
   expect(tables[0].position).toBe('bottom_right');
   const moved=await jobs.run({requestId:'atr-placement-moved',source:scriptExamples['Daily ATR panel'],bars,inputs:{position:'middle_right'}});
   expect(moved.ok,moved.error?.message).toBe(true);
   expect(moved.value.objects.tables[0].position).toBe('middle_right');
  }finally{jobs.close();}
 });
 it('no built-in example puts a table in the top band where the legend is',async()=>{
  const jobs=new ScriptJobs();let seen=0;
  try{
   for(const [name,source] of Object.entries(scriptExamples)){
    const result=await jobs.run({requestId:'placement-'+name.replace(/\W+/g,'-'),source,bars});
    expect(result.ok,name+': '+result.error?.message).toBe(true);
    for(const table of result.value.objects?.tables??[]){seen++;expect(table.position,name).not.toMatch(/^top_/);}
   }
  }finally{jobs.close();}
  expect(seen).toBeGreaterThanOrEqual(2);
 });
});
