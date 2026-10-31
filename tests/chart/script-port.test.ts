import { it,expect } from 'vitest';
import { createScriptPort,renderScriptPlots,validateScriptPlots } from '../../src/chart/script-port';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import { defaultPlotStyle } from '../../src/chart/indicator-port';
const plot={id:'plot-close',title:'Close SMA3',color:'#6fa8ff',values:[{time:1000,value:null},{time:1060,value:null},{time:1120,value:2},{time:1180,value:3}]};
it('script render keeps warmup nulls, normalizes seconds and excludes future plot points',()=>{
  const model=renderScriptPlots('script-a',[plot],{},1120)[0] as any;
  expect(model.points).toEqual([{time:1000000,value:null},{time:1060000,value:null},{time:1120000,value:2}]);
  expect(plot.values).toHaveLength(4);
});
it('script plot identity persists through title/color/type edit and varies by user instance',()=>{
  const before=renderScriptPlots('a',[plot],{},1180)[0];
  const edited=renderScriptPlots('a',[{...plot,title:'Renamed',color:'#ff0000'}],{'plot-close':{...defaultPlotStyle('sma','plot-close',0),kind:'area'}},1180)[0];
  expect(edited.id).toBe(before.id);expect(renderScriptPlots('b',[plot],{},1180)[0].id).not.toBe(before.id);
});
it('script name prefixes emitted labels while retaining plot IDs and style applicability',()=>{
 const before=renderScriptPlots('a',[plot],{},1180,'Original name')[0],after=renderScriptPlots('a',[plot],{},1180,'Renamed instance')[0];
 expect(after.id).toBe(before.id);expect(after.title).toBe('Renamed instance · Close SMA3');if(!('points' in after)||!('points' in before))throw new Error('Expected line plot points');expect(after.points).toEqual(before.points);
});
it('rejects invalid script output without mutating accepted data',()=>{
  expect(()=>validateScriptPlots([plot,plot])).toThrow();
  expect(()=>validateScriptPlots([{...plot,values:[{time:1,value:Infinity}]}])).toThrow();
  expect(()=>validateScriptPlots([{...plot,values:[{time:2,value:1},{time:1,value:2}]}])).toThrow();
});
it('prototype-like plot names select genuine defaults and own styles, never inherited properties',()=>{
 for(const id of ['constructor','toString','__proto__']){const point={...plot,id},plain=renderScriptPlots('guest',[point],{},1180)[0];expect(plain.kind).toBe('line');expect(plain).toMatchObject({style:{color:'#6fa8ff',width:2}});
 const own=Object.fromEntries([[id,{...defaultPlotStyle('sma',id,0),color:'#abcdef'}]]);expect(renderScriptPlots('guest',[point],own,1180)[0]).toMatchObject({style:{color:'#abcdef'}});}
});
it('failed native creation leaves no registered descriptor or script instance and permits retry',()=>{
 let attempted='';const chart={addNativeIndicator(type:string){attempted=type;throw new Error('Native creation failed');}} as unknown as Vela;
 const port=createScriptPort(chart);expect(()=>port.add({plots:[plot]},{id:'retry'})).toThrow('Native creation failed');
 expect(port.list()).toEqual([]);expect(getNativeIndicator(attempted)).toBeUndefined();
 expect(()=>port.add({plots:[plot]},{id:'retry'})).toThrow('Native creation failed');port.dispose();
});
