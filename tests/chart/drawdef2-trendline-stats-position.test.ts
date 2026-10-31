import {describe,expect,it} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {readTrendlineStats,validateTrendlineStatsSettings,TRENDLINE_STATS_DEFAULTS} from '../../src/chart/trendline-stats-data';
import {trendlineStatsPlacement} from '../../src/chart/trendline-stats-painter';
import {drawingEditor,patchDrawingProperties,TRENDLINE_STATS_EDITOR_FIELDS} from '../../src/chart/drawing-port';
import {FACTORY_DEFAULTS_UNAPPLIED} from '../../src/chart/drawing-factory-defaults';

// Drawings-desktop-1028, Trendline Stats position Left/Center/Right/Auto, default Right.
const P='props.lvTrendlineStats.';
const bars=Array.from({length:6},(_,index)=>({time:1000+60*index,open:100,high:220,low:90,close:120,volume:10}));
const record=(position?:string):SerializedDrawing=>({id:'SYNTHETIC stats position',type:'trendline',paneId:'price',zIndex:0,anchors:[{time:1060000,price:130},{time:1240000,price:180}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'},
 ...(position?{props:{lvTrendlineStats:{...TRENDLINE_STATS_DEFAULTS,priceRange:true,position}}}:{})} as unknown as SerializedDrawing);

describe('stats position member',()=>{
 it('default is Right; the reference four and the earlier above/below are valid, anything else is not',()=>{
  expect(TRENDLINE_STATS_DEFAULTS.position).toBe('right');
  for(const position of ['left','center','right','auto','above','below'])expect(validateTrendlineStatsSettings({...TRENDLINE_STATS_DEFAULTS,position}).position).toBe(position);
  expect(()=>validateTrendlineStatsSettings({...TRENDLINE_STATS_DEFAULTS,position:'top'})).toThrow();
  expect(readTrendlineStats(record('below').props).state).toBe('supported');
 });
 it('the Trendline statsPosition default is applied (no unapplied row); the other line tools keep theirs',()=>{
  expect(FACTORY_DEFAULTS_UNAPPLIED.some(row=>row.toolId==='LineToolTrendLine'&&row.property==='statsPosition')).toBe(false);
  expect(FACTORY_DEFAULTS_UNAPPLIED.some(row=>row.toolId==='LineToolRay'&&row.property==='statsPosition')).toBe(true);
 });
});

describe('editor',()=>{
 it('offers Left, Center, Right, Auto',()=>{
  expect(TRENDLINE_STATS_EDITOR_FIELDS.find(field=>field.path===P+'position')!.options).toEqual([{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'},{value:'auto',label:'Auto'}]);
 });
 it('shows saved above/below as Center, a legacy record as Right, and keeps the stored value until the position is changed',()=>{
  expect(drawingEditor(record(),bars).values[P+'position']).toBe('right');
  expect(drawingEditor(record('above'),bars).values[P+'position']).toBe('center');
  expect(drawingEditor(record('below'),bars).values[P+'position']).toBe('center');
  expect(drawingEditor(record('auto'),bars).values[P+'position']).toBe('auto');
  const saved=record('above');
  const styled=patchDrawingProperties(saved,{'style.lineWidth':3});
  expect((styled.props as any).lvTrendlineStats.position).toBe('above');
  // A template or reset may carry the stored value back; it is accepted and is a no-op.
  expect(patchDrawingProperties(saved,{[P+'position']:'above'})).toBe(saved);
  expect((patchDrawingProperties(saved,{[P+'position']:'left'}).props as any).lvTrendlineStats.position).toBe('left');
  expect(()=>patchDrawingProperties(saved,{[P+'position']:'top'})).toThrow();
 });
});

describe('trendlineStatsPlacement',()=>{
 const points=[{x:100,y:200},{x:300,y:100}];
 it('above / below keep the earlier midpoint placement; Center sits below the midpoint',()=>{
  expect(trendlineStatsPlacement('above',points,60,2,800)).toEqual({x:200,lineTop:150-6-32});
  expect(trendlineStatsPlacement('below',points,60,2,800)).toEqual({x:200,lineTop:156});
  expect(trendlineStatsPlacement('center',points,60,2,800)).toEqual({x:200,lineTop:156});
 });
 it('Left / Right sit beside the left / right end point, centered on it, whatever the anchor order',()=>{
  expect(trendlineStatsPlacement('right',points,60,2,800)).toEqual({x:300+14+30,lineTop:100-16});
  expect(trendlineStatsPlacement('left',points,60,2,800)).toEqual({x:100-14-30,lineTop:200-16});
  expect(trendlineStatsPlacement('right',[...points].reverse(),60,2,800)).toEqual({x:344,lineTop:84});
 });
 it('Auto is Right when it fits, else Left, else Center',()=>{
  expect(trendlineStatsPlacement('auto',points,60,2,800)).toEqual(trendlineStatsPlacement('right',points,60,2,800));
  expect(trendlineStatsPlacement('auto',points,60,2,350)).toEqual(trendlineStatsPlacement('left',points,60,2,350));
  expect(trendlineStatsPlacement('auto',[{x:20,y:200},{x:300,y:100}],60,2,350)).toEqual({x:160,lineTop:156});
 });
});
