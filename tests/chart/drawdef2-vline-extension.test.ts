import {describe,expect,it} from 'vitest';
import {dwb3ShapePayload,vlineExtensionSpans,paintVlineExtension} from '../../src/chart/dwb3-shape-layer';

// The Vertical line crosses every pane (drawings-desktop-1028, Vertical line Extend on); the layer strokes the part
// of the plot height the native painter (own pane only) does not.
const vline=(over:Record<string,unknown>={})=>({id:'SYNTHETIC vline',type:'vline',paneId:'price',anchors:[{time:5000,price:10}],style:{lineColor:'#336699',lineWidth:2,lineStyle:'dashed'},...over});

describe('vline payload rows',()=>{
 it('every vline becomes one row, in any pane, without a props member',()=>{
  expect(dwb3ShapePayload([vline()]).rows).toEqual([{kind:'vline',time:5000,pricePane:true,color:'#336699',width:2,style:'dashed'}]);
  expect(dwb3ShapePayload([vline({paneId:'pane-2'})]).rows).toEqual([expect.objectContaining({kind:'vline',pricePane:false})]);
  expect(dwb3ShapePayload([vline({paneId:undefined,style:{}})]).rows).toEqual([{kind:'vline',time:5000,pricePane:true,color:'#9aa0a6',width:1,style:'solid'}]);
 });
 it('hidden, filtered-out and unplaceable lines plan nothing',()=>{
  expect(dwb3ShapePayload([vline({visible:false})]).rows).toEqual([]);
  expect(dwb3ShapePayload([vline()],new Set(['other'])).rows).toEqual([]);
  expect(dwb3ShapePayload([vline({anchors:[]})]).rows).toEqual([]);
  expect(dwb3ShapePayload([vline({anchors:[{time:'5000'}]})]).rows).toEqual([]);
  // A cross line keeps its vertical arm in its own pane: no row.
  expect(dwb3ShapePayload([vline({type:'crossline'})]).rows).toEqual([]);
 });
});

describe('vline extension spans and paint',()=>{
 it('a price-pane line covers above and below the price pane; another pane line covers the price pane',()=>{
  expect(vlineExtensionSpans(true,{top:0,bottom:400},600)).toEqual([[400,600]]);
  expect(vlineExtensionSpans(true,{top:20,bottom:400},600)).toEqual([[0,20],[400,600]]);
  expect(vlineExtensionSpans(true,{top:0,bottom:600},600)).toEqual([]);
  expect(vlineExtensionSpans(false,{top:0,bottom:400},600)).toEqual([[0,400]]);
 });
 it('strokes once per span with the line style, and nothing off-screen',()=>{
  const calls:unknown[][]=[];const ctx=new Proxy({} as Record<string,unknown>,{get:(target,key)=>typeof key==='string'&&['save','restore','beginPath','moveTo','lineTo','stroke','setLineDash'].includes(key)?(...args:unknown[])=>calls.push([key,...args]):target[key as string],set:(target,key,value)=>{target[key as string]=value;calls.push(['set',key,value]);return true;}}) as unknown as CanvasRenderingContext2D;
  const row={kind:'vline' as const,time:5000,pricePane:true,color:'#336699',width:2,style:'dotted' as const};
  expect(paintVlineExtension(ctx,row,120,[[0,20],[400,600]])).toBe(2);
  expect(calls).toEqual([['save'],['set','strokeStyle','#336699'],['set','lineWidth',2],['setLineDash',[2,3]],['beginPath'],['moveTo',120,0],['lineTo',120,20],['moveTo',120,400],['lineTo',120,600],['stroke'],['restore']]);
  expect(paintVlineExtension(ctx,row,NaN,[[0,20]])).toBe(0);
 });
});
