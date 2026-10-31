import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {createScriptPort,renderScriptPlots,renderScriptVisuals,validateScriptVisuals,type ScriptVisuals} from '../../src/chart/script-port';
import type {PaneRegistry} from '../../src/chart/pane-registry';

// Script hline, fill, bgcolor, plotshape and plotchar through the existing script plot path. SYNTHETIC data.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const plots=[{id:'lvplot:Upper',title:'Upper',color:'#6fa8ff',values:[{time:100,value:2},{time:160,value:3}]},{id:'lvplot:Lower',title:'Lower',color:'#6fa8ff',values:[{time:100,value:1},{time:160,value:1}]}];
const visuals:ScriptVisuals={hlines:[{title:'Zero',price:0,color:'#787b86',lineStyle:'dashed',width:1}],fills:[{title:'Band',from:'Upper',to:'Lower',color:'#6fa8ff33'},{title:'Missing',from:'Upper',to:'Nope',color:'#000000'}],
 backgrounds:[{time:100,color:'#ff000080'},{time:160,color:'#00ff00'}],markers:[{title:'Up',time:100,shape:'triangleup',location:'belowbar',color:'#00ff00',text:'',size:'small'},{title:'Char',time:160,shape:'none',location:'abovebar',color:'#ff0000',text:'B',size:'normal'}]};

describe(' visual outputs render through the script port',()=>{
 it('maps hlines to price lines, fills to the plot series, bgcolor to bar spans and shapes to bar labels',()=>{
  const out=renderScriptVisuals('script-a',visuals,plots,160,[100,160]),series=renderScriptPlots('script-a',plots,{},160);
  expect(out.priceLines).toEqual([{id:'script-a:hline:0',paneId:'',price:0,color:'#787b86',lineStyle:'dashed',width:1,title:'Zero'}]);
  // A fill whose plot does not exist is not drawn; the drawn one anchors on the two rendered plot series.
  expect(out.fills).toEqual([{id:'script-a:fill:0',paneId:'',fromSeriesId:series[0].id,toSeriesId:series[1].id,color:'rgba(111,168,255,0.2)'}]);
  // Each background spans its bar up to the next chart bar; the last one uses the last bar spacing.
  expect(out.backgrounds).toEqual([{id:'script-a:bg:0',paneId:'',from:100000,to:160000,color:'rgba(255,0,0,0.502)'},{id:'script-a:bg:1',paneId:'',from:160000,to:220000,color:'#00ff00'}]);
  expect(out.labels).toEqual([
   expect.objectContaining({xloc:'bar_time',x:100000,yloc:'belowbar',style:'triangleup',color:'#00ff00',size:'small',tooltip:'Up',text:undefined}),
   expect.objectContaining({xloc:'bar_time',x:160000,yloc:'abovebar',style:'none',text:'B',textColor:'#ff0000',size:'normal'})]);
 });
 it('never draws a background or marker after the last available bar, and refuses malformed visuals',()=>{
  const out=renderScriptVisuals('script-a',visuals,plots,100,[100]);
  expect(out.backgrounds).toHaveLength(1);expect(out.labels).toHaveLength(1);expect(out.priceLines).toHaveLength(1);
  expect(renderScriptVisuals('script-a',undefined,plots,160,[100,160])).toEqual({fills:[],backgrounds:[],priceLines:[],labels:[]});
  expect(()=>validateScriptVisuals({...visuals,hlines:[{...visuals.hlines[0],color:'red'}]})).toThrow();
  expect(()=>validateScriptVisuals({...visuals,backgrounds:[{time:Infinity,color:'#000000'}]})).toThrow();
 });
 it('runs a script end to end: the worker output reaches the native emit with plots and visuals together',async()=>{
  const bars=[10,12,11,14,12,15].map((close,index)=>({id:'synthetic-r32-vis-'+index,revision:1,time:600*(index+1),open:close-1,high:close+1,low:close-2,close,volume:10}));
  const jobs=new ScriptJobs();let result:any;
  try{result=await jobs.run({requestId:'synthetic-r32-visuals',bars,source:`({ onBar(ctx) {
   const b = ctx.ta.bb('b', ctx.bar.close, 3, 1); ctx.plot('Upper', b.upper); ctx.plot('Lower', b.lower); ctx.fill('Band', 'Upper', 'Lower', { color: '#6fa8ff40' });
   ctx.hline('Mid', 12, { color: '#888888', lineStyle: 'dotted', width: 2 }); ctx.bgcolor(ctx.bar.close > 13 ? '#00ff0020' : null);
   ctx.plotshape('Up', ctx.ta.crossover('x', ctx.bar.close, 12.5), { shape: 'arrowup', location: 'belowbar', color: '#00aa00' }); ctx.plotchar('Down', ctx.ta.crossunder('y', ctx.bar.close, 12.5), 'D');
  } })`});}finally{jobs.close();}
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.visuals.hlines).toEqual([{title:'Mid',price:12,color:'#888888',lineStyle:'dotted',width:2}]);
  expect(result.value.visuals.backgrounds.map((row:any)=>row.time)).toEqual([2400,3600]);
  expect(result.value.visuals.markers.map((row:any)=>[row.title,row.time])).toEqual([['Up',2400],['Down',3000],['Up',3600]]);
  const emitted:any[]=[],chartBars=bars.map(bar=>({time:bar.time*1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}));
  const chart={addNativeIndicator(type:string){const model=getNativeIndicator(type)!.create() as any;model.start({id:'synthetic-handle',bars:()=>chartBars,emit:(out:unknown)=>emitted.push(out)});return {id:'synthetic-handle',setVisible(){},remove(){},moveTo(){}};}} as unknown as Vela;
  const panes={info:()=>undefined,bind(){},renderer:()=>undefined,logical:()=>undefined} as unknown as PaneRegistry;
  const port=createScriptPort(chart,panes);port.add(result.value,{id:'synthetic-visual-script',title:'Visual script'});
  const last=emitted.at(-1);
  expect(last.series.map((row:any)=>row.title)).toEqual(['Visual script · Upper','Visual script · Lower']);
  expect(last.fills).toEqual([expect.objectContaining({fromSeriesId:last.series[0].id,toSeriesId:last.series[1].id,color:'rgba(111,168,255,0.251)'})]);
  expect(last.priceLines).toEqual([expect.objectContaining({price:12,lineStyle:'dotted',width:2})]);
  expect(last.backgrounds.map((row:any)=>[row.from,row.to])).toEqual([[2400000,3000000],[3600000,4200000]]);
  expect(last.labels.map((row:any)=>[row.style,row.text,row.yloc])).toEqual([['arrowup',undefined,'belowbar'],['none','D','abovebar'],['arrowup',undefined,'belowbar']]);
  port.dispose();
 },30000);
});
