import {describe,expect,it} from 'vitest';
import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {installAppearancePainters} from '../../src/chart/appearance-painters';
import {drawingAxisLabels,reservedAxisRanges} from '../../src/chart/axis-labels';
import {dwb3PaneSourceFor,dwb3ShapePayload,registerDwb3PaneSource,vlineRowSpans} from '../../src/chart/dwb3-shape-layer';
import {axisLineFlag,AXIS_LINE_FIELD} from '../../src/chart/lv-types/axis-line-settings';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {painterFixture} from './chart-paint-harness';
import {indicatorDisplayHarness} from './indicator-display-harness';

// Drawings-desktop-1028: Horizontal line Price label, sub-pane Vertical line across every pane, study-pane tag ranges.
void lvDrawingTypeStatus();
const T=Date.UTC(2026,9,28,14,30);
const row=(type:string,over:Record<string,unknown>={})=>({id:'SYNTHETIC '+type,type,paneId:'price',anchors:[{time:T,price:10}],style:{lineColor:'#445566'},...over});

describe('Horizontal line Price label (props.lvAxisLine.priceLabel)',()=>{
 it('fresh line writes no member, offers one Style checkbox, and an edit round trips',()=>{
  const h=createDrawing('hline' as never,{id:'SYNTHETIC hline',paneId:'price',anchors:[{time:T,price:10}]} as never)! as any;
  expect(h.serialize().props?.[AXIS_LINE_FIELD]).toBeUndefined();
  expect(h.schema().fields.filter((f:any)=>f.path.startsWith('lvAxisLine.')).map((f:any)=>[f.path,f.label,f.kind,f.group])).toEqual([['lvAxisLine.priceLabel','Price label','boolean','line']]);
  expect(h.lvAxisLine).toEqual({schemaVersion:1,priceLabel:true});
  h.applySettings({'lvAxisLine.priceLabel':false});
  const saved=h.serialize();expect(saved.props[AXIS_LINE_FIELD]).toEqual({schemaVersion:1,priceLabel:false});
  const back=deserializeDrawing(saved) as any;expect(back.lvAxisLine).toEqual({schemaVersion:1,priceLabel:false});expect(back.serialize()).toEqual(saved);
  expect(()=>h.applySettings({'lvAxisLine.timeLabel':false})).toThrow();
 });
 it('off drops the axis price label but keeps the selection band; absent or invalid = on',()=>{
  const off={[AXIS_LINE_FIELD]:{schemaVersion:1,priceLabel:false}};
  const labels=drawingAxisLabels([row('hline',{props:off})] as never,['SYNTHETIC hline']);
  expect(labels.labels).toEqual([]);expect(labels.bands).toHaveLength(1);
  expect(drawingAxisLabels([row('hline')] as never,[]).labels).toHaveLength(1);
  expect(axisLineFlag('hline',{[AXIS_LINE_FIELD]:{schemaVersion:2}},'priceLabel')).toBe(true);
  // The horizontal ray has no such setting yet: always on.
  expect(axisLineFlag('hray',off,'priceLabel')).toBe(true);
 });
});

describe('sub-pane Vertical line crosses every pane',()=>{
 it('a sub-pane row carries its pane id; a price-pane row is unchanged',()=>{
  expect(dwb3ShapePayload([row('vline',{paneId:'pane-rsi'})]).rows[0]).toMatchObject({kind:'vline',pricePane:false,paneId:'pane-rsi'});
  expect(Object.hasOwn(dwb3ShapePayload([row('vline')]).rows[0],'paneId')).toBe(false);
 });
 it('with its pane rectangle the line covers everything above and below that pane; without one, the price pane only',()=>{
  const sub={kind:'vline' as const,time:T,pricePane:false,paneId:'pane-rsi',color:'#fff',width:1,style:'solid' as const},price={top:0,bottom:400};
  const rects:Record<string,{top:number;height:number}>={'pane-rsi':{top:404,height:100}};
  expect(vlineRowSpans(sub,price,600,id=>rects[id]??null)).toEqual([[0,404],[504,600]]);
  expect(vlineRowSpans(sub,price,600,()=>null)).toEqual([[0,400]]);
  expect(vlineRowSpans(sub,price,600,()=>{throw Error('x');})).toEqual([[0,400]]);
  expect(vlineRowSpans(sub,price,600,null)).toEqual([[0,400]]);
  expect(vlineRowSpans({...sub,pricePane:true,paneId:undefined},{top:0,bottom:400},600,id=>rects[id]??null)).toEqual([[400,600]]);
 });
 it('the appearance painters register the live pane rectangles of their renderer and release them on dispose',async()=>{
  const f=await painterFixture(false),coords=f.native.coords;
  expect(dwb3PaneSourceFor(coords)).toBeNull();
  const dispose=installAppearancePainters(f.renderer,()=>null);
  try{
   const pane=f.native.scene.ensurePane('pane-x','indicator',1,1);Object.assign(pane,{bounds:{top:150,height:50},collapsed:false});
   const source=dwb3PaneSourceFor(coords)!;expect(source('pane-x')).toEqual({top:150,height:50});expect(source('missing')).toBeNull();
   const sub={kind:'vline' as const,time:T,pricePane:false,paneId:'pane-x',color:'#fff',width:1,style:'solid' as const};
   expect(vlineRowSpans(sub,{top:0,bottom:140},200,source)).toEqual([[0,150]]);
   pane.collapsed=true;expect(source('pane-x')).toBeNull();
  }finally{dispose();f.dispose();}
  expect(dwb3PaneSourceFor(coords)).toBeNull();
  const own={},off=registerDwb3PaneSource(own,()=>null);expect(dwb3PaneSourceFor(own)).not.toBeNull();off();expect(dwb3PaneSourceFor(own)).toBeNull();
 });
});

describe('study-pane value tags reserve their axis ranges',()=>{
 it('a drawn RSI-pane tag is published for its pane and cleared when the labels hide',async()=>{
  const t=await indicatorDisplayHarness();try{
   const rows=Array.from({length:50},(_,index)=>({time:1700000000000+index*60000,open:index+1,high:index+2,low:index,close:index+1,volume:1}));t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;
   t.port.add('rsi',{});const view=t.port.list()[0],model=t.native.scene.indicators.get(view.rendererId),pane=t.native.scene.panes.get(model.paneId);
   expect(model.paneId).not.toBe('price');Object.assign(pane,{bounds:{top:0,height:180},scale:{min:-10,max:110},axisFormat:'price'});
   expect(t.paint().map(r=>r.values[0])).toEqual(['100.00']);
   const ranges=reservedAxisRanges(t.native.scene,model.paneId);expect(ranges).toHaveLength(1);expect(ranges[0][1]-ranges[0][0]).toBeGreaterThan(10);
   expect(reservedAxisRanges(t.native.scene)).toEqual([]);
   t.display.setOptions({labelsVisible:false,valuesVisible:true});t.paint();
   expect(reservedAxisRanges(t.native.scene,model.paneId)).toEqual([]);
  }finally{t.dispose();}
 });
});
