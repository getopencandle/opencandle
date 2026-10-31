import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {trendlinePriceDecimals,trendlineSpanText} from '../../src/chart/trendline-stats-painter';
import {paintDrawingTimeLabels,type AxisDrawing} from '../../src/chart/axis-labels';
import {paintSubPaneDrawingLabels,type AxisLabelContext} from '../../src/chart/appearance-painters';

const source=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const recorder=()=>{const calls:unknown[][]=[];const ctx:any={globalAlpha:1,font:'',textAlign:'',textBaseline:'',fillStyle:'',strokeStyle:'',lineWidth:1};
 for(const op of ['save','restore','beginPath','rect','clip','fillRect','fillText','stroke','moveTo','lineTo'])ctx[op]=(...args:unknown[])=>calls.push([op,...args]);
 ctx.measureText=(text:string)=>({width:text.length*6});return{ctx:ctx as CanvasRenderingContext2D,calls};};

describe('trend line stats text (#4)',()=>{
 it('uses 2 decimals at or above 1 and 4 significant digits below',()=>{
  expect(trendlinePriceDecimals([175.89,230.01])).toBe(2);
  expect(trendlinePriceDecimals([0.05231,0.06])).toBe(5);
  expect(trendlinePriceDecimals([0,0])).toBe(2);
 });
 it('shows the time span as days, hours and minutes',()=>{
  expect(trendlineSpanText(160*86_400_000)).toBe('160d');
  expect(trendlineSpanText(3*86_400_000+4*3_600_000)).toBe('3d 4h');
  expect(trendlineSpanText(2*3_600_000+15*60_000)).toBe('2h 15m');
  expect(trendlineSpanText(240_000)).toBe('4m');
  expect(trendlineSpanText(30_000)).toBe('30s');
 });
 it('never prints the unavailable reason jargon and draws a visible box',()=>{
  const text=source('src/chart/trendline-stats-painter.ts');
  expect(text).not.toMatch(/'unavailable \('\+/);
  expect(text).toMatch(/call\(ctx,'stroke',\[\]\)/);
 });
});

describe('derived chart viewport (#5)',()=>{
 it('refits like Reset chart view after a new derived construction',()=>{
  expect(source('src/chart/adapter.ts')).toMatch(/else if\(fedDerived\?fedDerivedKey!==previousDerivedKey:[^\n]*resetView/);
 });
});

describe('vertical line label on a derived chart (#6)',()=>{
 it('prints the text time while x stays on the renderer time',()=>{
  const {ctx,calls}=recorder(),synthetic=Date.UTC(2024,0,30),real=Date.UTC(2025,6,17);
  paintDrawingTimeLabels(ctx,[{id:'v:time',time:synthetic,color:'#2962ff'}],{xOf:t=>t===synthetic?300:NaN,textTime:(time,id)=>id==='v:time'&&time===synthetic?real:NaN,timezone:'UTC',intervalMs:86_400_000,dataWidth:800,top:500,height:28,font:'12px sans-serif'});
  const text=calls.find(call=>call[0]==='fillText')!;
  expect(text[1]).toBe("Thu 17 Jul '25");expect(text[2]).toBe(300);
 });
});

describe('indicator pane horizontal line label (#20)',()=>{
 it('paints the hline price on the indicator pane axis',()=>{
  const {ctx,calls}=recorder();
  const rsi={id:'rsi-pane',kind:'indicator',collapsed:false,bounds:{top:600,height:150},scale:{min:20,max:80}};
  const scene={orderedPanes:()=>[{id:'price',kind:'price',bounds:{top:0,height:590}},rsi],style:{fontSize:12},bars:[]};
  const coords={width:1100,priceToY:(price:number,scale:{min:number;max:number},bounds:{top:number;height:number})=>bounds.top+(scale.max-price)/(scale.max-scale.min)*bounds.height};
  const drawings:AxisDrawing[]=[{id:'h',type:'hline',paneId:'rsi-pane',anchors:[{price:41.48}],style:{lineColor:'#2962ff'}},{id:'main',type:'hline',paneId:'price',anchors:[{price:186.71}]}];
  const context={drawings:()=>drawings,selected:()=>[],labels:{noOverlap:true}} as unknown as AxisLabelContext;
  expect(paintSubPaneDrawingLabels(ctx,scene,coords,{fontFamily:'sans-serif'},1100,context)).toBe(1);
  expect(calls.filter(call=>call[0]==='fillText').map(call=>call[1])).toEqual(['41.48']);
 });
});

describe('layout fixes (#10, #14, #19)',()=>{
 it('scopes the runtime error strip to the open script',()=>{
  expect(source('src/ui/ScriptLibraryPanel.tsx')).toContain('runtimeError&&runtimeError.documentId===file.id&&<div role="alert"');
 });
 it('gives the replay bar its own row under the chart',()=>{
  const css=source('src/ui/replay-panel.css');
  expect(css).not.toMatch(/\.lv-replay-dock\{[^}]*height:0/);
  expect(css).not.toMatch(/\.lv-replay-floating\{[^}]*position:absolute/);
 });
 it('opens the Visual order submenu to the right and keeps the templates dialog compact',()=>{
  expect(source('src/ui/components.css')).toContain('.drawing-edit-more .drawing-edit-submenu-list{top:-5px;left:100%;right:auto;');
  expect(source('src/ui/drawing-edit-bar.tsx')).toMatch(/fitAnchoredMenu\(node,'right'\)/);
  const dialog=source('src/ui/IndicatorTemplatesDialog.tsx');
  expect(dialog).toContain('<Modal title="Indicator templates" onClose={close}>');expect(dialog).toContain('className="template-search"');
 });
});
