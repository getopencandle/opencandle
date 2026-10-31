import {describe,expect,it} from 'vitest';
import {drawingAxisLabels,drawingTimeAxisLabels,layoutTimeAxisLabels,paintDrawingTimeLabels,timeAxisLabelText,type AxisDrawing} from '../../src/chart/axis-labels';

// Drawings-desktop-1028: Cross line Price label on; Vertical line and Cross line Time label on.
const drawing=(type:string,over:Partial<AxisDrawing>={}):AxisDrawing=>({id:'SYNTHETIC '+type,type,paneId:'price',anchors:[{time:Date.UTC(2026,9,28,14,30),price:101.5}],style:{lineColor:'#445566'},...over});

describe('cross line price label',()=>{
 it('labels its price in the line color like a horizontal line, selected or not',()=>{
  expect(drawingAxisLabels([drawing('crossline')],[]).labels).toEqual([{id:'SYNTHETIC crossline:price',price:101.5,color:'#445566'}]);
  expect(drawingAxisLabels([drawing('crossline')],['SYNTHETIC crossline']).bands).toEqual([{id:'SYNTHETIC crossline',min:101.5,max:101.5,color:'#445566'}]);
  expect(drawingAxisLabels([drawing('vline')],[]).labels).toEqual([]);
  expect(drawingAxisLabels([drawing('crossline',{visible:false})],[]).labels).toEqual([]);
 });
});

describe('time-axis labels',()=>{
 it('one label per visible vertical line and cross line at its anchor time, any pane',()=>{
  const time=Date.UTC(2026,9,28,14,30);
  expect(drawingTimeAxisLabels([drawing('vline'),drawing('crossline',{paneId:'pane-2'}),drawing('hline'),drawing('vline',{id:'hidden',visible:false}),drawing('vline',{id:'no time',anchors:[{price:1}]})]))
   .toEqual([{id:'SYNTHETIC vline:time',time,color:'#445566'},{id:'SYNTHETIC crossline:time',time,color:'#445566'}]);
  expect(drawingTimeAxisLabels([drawing('vline',{style:{}})])[0].color).toBe('#2962ff');
 });
 it('text: date and time on intraday bars, date only on daily bars, in the chart timezone',()=>{
  const time=Date.UTC(2026,9,28,14,30);
  expect(timeAxisLabelText(time,'UTC',60_000)).toBe("Wed 28 Oct '26 14:30");
  expect(timeAxisLabelText(time,'America/New_York',60_000)).toBe("Wed 28 Oct '26 10:30");
  expect(timeAxisLabelText(time,'UTC',86_400_000)).toBe("Wed 28 Oct '26");
  expect(timeAxisLabelText(time,'Not/AZone',60_000)).toBe("Wed 28 Oct '26 14:30");
  expect(timeAxisLabelText(Date.UTC(2025,8,29),'UTC',86_400_000)).toBe("Mon 29 Sep '25");
  expect(timeAxisLabelText(NaN,'UTC',60_000)).toBe('');
 });
 it('layout centers on x, stays inside the plot and hides off-plot labels',()=>{
  expect(layoutTimeAxisLabels([{id:'a',x:400,width:100},{id:'b',x:20,width:100},{id:'c',x:790,width:100},{id:'d',x:-5,width:100},{id:'e',x:NaN,width:100}],800))
   .toEqual([{id:'a',left:350,hidden:false},{id:'b',left:0,hidden:false},{id:'c',left:700,hidden:false},{id:'d',left:0,hidden:true},{id:'e',left:0,hidden:true}]);
 });
});

describe('paintDrawingTimeLabels',()=>{
 it('paints one box and text per placed label in the time-axis strip',()=>{
  const calls:unknown[][]=[];const ctx={save:()=>calls.push(['save']),restore:()=>calls.push(['restore']),measureText:(text:string)=>({width:text.length*6}),fillRect:(...args:unknown[])=>calls.push(['fillRect',...args]),fillText:(...args:unknown[])=>calls.push(['fillText',...args])} as unknown as CanvasRenderingContext2D;
  const time=Date.UTC(2026,9,28,14,30);
  const count=paintDrawingTimeLabels(ctx,[{id:'a',time,color:'#ffffff'},{id:'b',time,color:'#000000'}],{xOf:t=>t===time?400:NaN,timezone:'UTC',intervalMs:60_000,dataWidth:800,top:500,height:28,font:'12px sans-serif'});
  expect(count).toBe(2);
  const text="Wed 28 Oct '26 14:30",width=text.length*6+12;
  expect(calls.filter(call=>call[0]==='fillRect')).toEqual([['fillRect',400-width/2,504,width,20],['fillRect',400-width/2,504,width,20]]);
  expect(calls.filter(call=>call[0]==='fillText')).toEqual([['fillText',text,400,514],['fillText',text,400,514]]);
  expect(paintDrawingTimeLabels(ctx,[],{xOf:()=>0,timezone:'UTC',intervalMs:60_000,dataWidth:800,top:500,height:28,font:''})).toBe(0);
 });
});
