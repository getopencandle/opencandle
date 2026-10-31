import {afterEach,describe,expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {POSITION_FACTORY_ACCOUNT,POSITION_FACTORY_RISK_PERCENT,LV_POSITION_HIDDEN_PATH,isLvPositionModel,positionLabels,positionStats,positionTrade,registerPositionChartContext,chartPositionContext,tickDecimals} from '../../src/chart/lv-types/position-tool';
import {POSITION_INPUTS_FACTORY_DEFAULTS,readPositionInputs} from '../../src/chart/position-inputs';
import {drawingAxisLabels} from '../../src/chart/axis-labels';
import {capturePositionDrawing} from '../../src/domain/alert-position';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {bars} from './dwb3-helpers';
import {readFileSync} from 'node:fs';

// SYNTHETIC position fixtures with literal oracles.
const T0=1_700_000_000_000,T1=T0+10*86_400_000;
const KINDS=['position','lvshortposition'] as const;
const saved=(type:string='position',props:Record<string,unknown>={accountBalance:1000,riskPercent:25}):SerializedDrawing=>({id:'r32-'+type,type,paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}],style:{lineColor:'#808080',lineWidth:1,lineStyle:'solid'},locked:false,visible:true,zIndex:0,createdAt:1,props} as unknown as SerializedDrawing);
const fresh=(type:string)=>createDrawing(type as never,{paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}]})!;
const proj=(barsInRange?:(from:number,to:number)=>unknown[])=>({xOf:(t:number)=>(t-T0)/86_400_000*20+10,yOf:(p:number)=>400-p*2,pxToPoint:()=>({time:T0,price:100}),paneIdAtY:()=>'price',...barsInRange?{barsInRange}:{}}) as never;
function recorder(){const texts:string[]=[];const ctx:any={globalAlpha:1,save(){},restore(){},beginPath(){},stroke(){},fill(){},rect(){},fillRect(){},moveTo(){},lineTo(){},setLineDash(){},measureText:(s:string)=>({width:s.length*7}),fillText:(s:string)=>{texts.push(s);}};return{ctx,texts};}
const theme={fontFamily:'sans-serif',textColor:'#000',background:'#fff'};
let unregister:(()=>void)|null=null;
afterEach(()=>{unregister?.();unregister=null;});

describe('position numbers and labels',()=>{
 it('quantity in lots, amounts, ticks, percents and the ratio',()=>{
  const s=positionStats({entry:100,stop:90,target:120},{accountBalance:1000,riskPercent:25,lotSize:1,precision:2,tick:0.01});
  expect(s).toMatchObject({direction:'long',riskAmount:250,qty:25,rr:2,target:{offset:20,percent:20,ticks:2000,amount:500},stop:{offset:10,percent:10,ticks:1000,amount:250}});
  expect(positionStats({entry:100,stop:90,target:120},{accountBalance:1000,riskPercent:25,lotSize:2,precision:2,tick:0.01}).qty).toBe(12.5);
  // Qty precision rounds the quantity, and the amounts follow the rounded quantity.
  const r=positionStats({entry:100,stop:97,target:106},{accountBalance:1000,riskPercent:10,lotSize:1,precision:0,tick:0.25});
  expect(r).toMatchObject({qty:33,target:{ticks:24,amount:198},stop:{ticks:12,amount:99}});
  expect([tickDecimals(0.01),tickDecimals(0.25),tickDecimals(1),tickDecimals(0.0001)]).toEqual([2,2,0,4]);
 });
 it('full and compact plate text (Open P&L inside the box, Closed P&L after an exit)',()=>{
  const s=positionStats({entry:100,stop:90,target:120},{accountBalance:1000,riskPercent:25,lotSize:1,precision:2,tick:0.01});
  const full=positionLabels(s,{state:'open',price:104,pnl:100},{compact:false,priceDecimals:2,precision:2});
  expect(full.target).toEqual(['Target: 20.00 (20.00%) 2000, Amount: 500.00']);
  expect(full.stop).toEqual(['Stop: 10.00 (10.00%) 1000, Amount: 250.00']);
  expect(full.middle).toEqual(['Open P&L: 100.00, Qty: 25.00','Risk/reward ratio: 2']);
  expect(positionLabels(s,{state:'closed',price:90,pnl:-250,reason:'stop'},{compact:false,priceDecimals:2,precision:2}).middle[0]).toBe('Closed P&L: -250.00, Qty: 25.00');
  const compact=positionLabels(s,{state:'open',price:104,pnl:100},{compact:true,priceDecimals:2,precision:0});
  expect(compact).toEqual({target:['20.00 (20.00%) 2000, 500.00'],stop:['10.00 (10.00%) 1000, 250.00'],middle:['Open P&L: 100.00, Qty: 25, R/R: 2']});
  expect(positionLabels(s,{state:'unavailable'},{compact:false,priceDecimals:2,precision:2}).middle).toEqual(['Qty: 25.00','Risk/reward ratio: 2']);
  for(const line of [...full.target,...full.stop,...full.middle,...compact.middle])expect(line).not.toMatch(/—|–|OpenCandle-|DW\./);
 });
 it('the trade walk: waiting, open, target, stop (first on a two-sided bar) and box end',()=>{
  const levels={entry:100,stop:90,target:120},box={start:T0,end:T1},size={qty:25,lotSize:1},bar=(day:number,low:number,high:number,close:number)=>({time:T0+day*86_400_000,low,high,close});
  expect(positionTrade(null,levels,box,size)).toEqual({state:'unavailable'});
  expect(positionTrade([bar(1,101,105,103)],levels,box,size)).toEqual({state:'waiting'});
  expect(positionTrade([bar(1,99,104,103),bar(2,102,106,104)],levels,box,size)).toEqual({state:'open',price:104,pnl:100});
  expect(positionTrade([bar(1,99,104,103),bar(2,110,121,118)],levels,box,size)).toEqual({state:'closed',price:120,pnl:500,reason:'target'});
  expect(positionTrade([bar(1,99,104,103),bar(2,89,121,95)],levels,box,size)).toEqual({state:'closed',price:90,pnl:-250,reason:'stop'});
  expect(positionTrade([bar(1,99,104,103),bar(12,110,111,110)],levels,box,size)).toEqual({state:'closed',price:103,pnl:75,reason:'end'});
  // Short: target below, stop above.
  expect(positionTrade([bar(1,99,101,100),bar(2,95,99,96)],{entry:100,stop:110,target:80},box,size)).toEqual({state:'open',price:96,pnl:100});
 });
});

describe.each(KINDS)('%s on the OpenCandle position model',kind=>{
 it('is registered on the native class, keeps its type id and seeds the Long defaults into a fresh drawing',()=>{
  expect(lvDrawingTypeStatus().find(row=>row.type===kind)).toMatchObject({state:'registered'});
  const model=fresh(kind);
  expect(model.type).toBe(kind);expect(isLvPositionModel(model)).toBe(true);expect(typeof (model as any).lvPaint).toBe('function');
  const props=model.serialize().props as any;
  expect([props.accountBalance,props.riskPercent]).toEqual([POSITION_FACTORY_ACCOUNT,POSITION_FACTORY_RISK_PERCENT]);
  expect(props.lvPositionInputs).toEqual(POSITION_INPUTS_FACTORY_DEFAULTS);
 });
 it('a saved record (no member) gains no member on a load and save, is not mutated, and still feeds a position alert',()=>{
  const record=saved(kind),before=JSON.stringify(record);
  const again=deserializeDrawing(structuredClone(record))!.serialize();
  expect(again.props).toMatchObject(record.props!);expect(Object.hasOwn(again.props!,'lvPositionInputs')).toBe(false);expect(JSON.stringify(record)).toBe(before);
  const captured=capturePositionDrawing(again,{symbol:'GME',currency:'USD'});
  expect(captured).toMatchObject({ok:true,position:{drawingId:'r32-'+kind,entry:100,stop:90,target:120,quantity:25}});
 });
 it('offers the reference Inputs and Style settings and hides the native-only ones',()=>{
  const editor=drawingEditor(saved(kind),bars),shown=editor.fields.filter(field=>!field.when);
  expect(shown.filter(field=>field.group==='behavior').map(field=>field.label)).toEqual(['Account size','Lot size','Risk','Risk unit','Leverage','Entry price','Profit level ticks','Profit level price','Stop level ticks','Stop level price','Qty precision','Account currency','Locked','Visible']);
  expect(shown.filter(field=>field.group!=='behavior').map(field=>field.label)).toEqual(['Line color','Line width','Line style','Stop color','Target color','Text color','Text size','Price labels','Compact stats mode','Always show stats']);
  const hidden=editor.fields.filter(field=>field.when).map(field=>field.path);
  expect(hidden).toEqual(expect.arrayContaining(['riskPercent','quantity','direction','showText','showStopLabel']));
  for(const field of editor.fields.filter(row=>row.when))expect(field.when).toEqual({path:LV_POSITION_HIDDEN_PATH,in:[true]});
  expect(editor.values).toMatchObject({'lvPosition.risk':25,'lvPosition.riskUnit':'percentage','lvPosition.profitTicks':2000,'lvPosition.stopTicks':1000,'lvPosition.lotSize':1,'lvPosition.alwaysShowStats':false,'lvPosition.priceLabels':true});
 });
 it('edits lot size, risk in money, ticks, and keeps the risk amount when the account changes in money mode',()=>{
  const record=saved(kind);
  const lot=patchDrawingEdit(record,bars,{'lvPosition.lotSize':2});
  expect(readPositionInputs(lot.props)).toMatchObject({state:'supported',settings:{schemaVersion:2,lotSize:2}});
  const money=patchDrawingEdit(record,bars,{'lvPosition.riskUnit':'money','lvPosition.risk':100});
  expect((money.props as any).riskPercent).toBe(10);expect(drawingEditor(money,bars).values['lvPosition.risk']).toBe(100);
  const account=patchDrawingEdit(money,bars,{accountBalance:2000});
  expect((account.props as any).riskPercent).toBe(5);expect(drawingEditor(account,bars).values['lvPosition.risk']).toBe(100);
  const percent=patchDrawingEdit(record,bars,{accountBalance:2000});
  expect((percent.props as any).riskPercent).toBe(25);
  const ticks=patchDrawingEdit(record,bars,{'lvPosition.profitTicks':500,'lvPosition.stopTicks':300});
  expect(ticks.anchors.map(anchor=>anchor.price)).toEqual([100,97,105]);
  expect(()=>patchDrawingEdit(record,bars,{'lvPosition.risk':101})).toThrow('Risk is outside');
  expect(()=>patchDrawingEdit(record,bars,{'lvPosition.precision':9})).toThrow();
 });
 it('dragging the target, stop and entry handles updates the plate text live',()=>{
  const model=deserializeDrawing(saved(kind))! as any,p=proj();
  const before=model.lvStats(p).labels.target[0];
  model.anchors[2].price=130;model.anchors[2].time=T1+86_400_000;model.constrainHandleDrag(2);
  expect(model.lvStats(p).labels.target[0]).toBe('Target: 30.00 (30.00%) 3000, Amount: 750.00');expect(before).not.toBe(model.lvStats(p).labels.target[0]);
  expect(model.anchors[1].time).toBe(model.anchors[2].time);
  model.anchors[1].price=95;model.constrainHandleDrag(1);
  expect(model.lvStats(p).labels.stop[0]).toBe('Stop: 5.00 (5.00%) 500, Amount: 250.00');
  expect(model.lvStats(p).labels.middle[1]).toBe('Risk/reward ratio: 6');
  model.anchors[0].price=105;model.constrainHandleDrag(0);
  expect(model.lvStats(p).labels.target[0]).toBe('Target: 25.00 (23.81%) 2500, Amount: 625.00');
 });
});

describe('painting and the chart context',()=>{
 it('always paints the zones; stats show while selected or with Always show stats, and Open P&L while price is inside the box',()=>{
  const record=saved('position'),model=deserializeDrawing(record)! as any;
  const inside=proj(()=>[{time:T0+86_400_000,low:99,high:104,close:103}]);
  let selected=false;
  unregister=registerPositionChartContext({owns:({model:item})=>item===model,isSelected:()=>selected,tickSize:()=>0.01});
  const off=recorder();model.lvPaint(off.ctx,inside,theme);expect(off.texts).toEqual([]);
  selected=true;const on=recorder();model.lvPaint(on.ctx,inside,theme);
  expect(on.texts).toEqual(['Target: 20.00 (20.00%) 2000, Amount: 500.00','Open P&L: 75.00, Qty: 25.00','Risk/reward ratio: 2','Stop: 10.00 (10.00%) 1000, Amount: 250.00']);
  selected=false;model.applySettings({'lvPosition.alwaysShowStats':true,'lvPosition.compactStats':true});
  const compact=recorder();model.lvPaint(compact.ctx,inside,theme);
  expect(compact.texts).toEqual(['20.00 (20.00%) 2000, 500.00','Open P&L: 75.00, Qty: 25.00, R/R: 2','10.00 (10.00%) 1000, 250.00']);
  // A chart that answers for its canvas: the paint binds the model to that chart, later reads (editor ticks) use it.
  unregister?.();const canvas={},other=deserializeDrawing(saved('position'))! as any;
  unregister=registerPositionChartContext({owns:probe=>probe.canvas===canvas,tickSize:()=>0.5,isSelected:()=>true});
  expect(other.lvPosition.profitTicks).toBe(2000);const bound=recorder();bound.ctx.canvas=canvas;other.lvPaint(bound.ctx,inside,theme);
  expect(other.lvPosition.profitTicks).toBe(40);expect(bound.texts[0]).toBe('Target: 20.0 (20.00%) 40, Amount: 500.00');
  // A plate outside the box is hit-testable.
  const plate=model.lvPlates(inside)[0].rect;expect(model.hitTest(plate.x+2,plate.y+2,inside,0)).toBe(true);
 });
 it('ticks follow the chart tick size',()=>{
  const model=deserializeDrawing(saved('position'))! as any;
  unregister=registerPositionChartContext({owns:({model:item})=>item===model,tickSize:()=>0.25});
  expect(model.lvPosition.profitTicks).toBe(80);expect(model.lvStats(proj()).labels.target[0]).toBe('Target: 20.00 (20.00%) 80, Amount: 500.00');
 });
 it('the chart context of adapter.ts brings the instrument tick size and the selection to the painter',()=>{
  const canvas={},elsewhere={},selected:string[]=[],model=deserializeDrawing(saved('position'))! as any;
  unregister=registerPositionChartContext(chartPositionContext({container:{contains:(node:unknown)=>node===canvas},tickSize:()=>0.05,selectedIds:()=>selected}));
  const paint=(target:object)=>{const r=recorder();r.ctx.canvas=target;model.lvPaint(r.ctx,proj(),theme);return r.texts;};
  // A canvas of another chart matches no context: the unwired fallback applies (plates shown, tick 0.01).
  expect(paint(elsewhere)[0]).toBe('Target: 20.00 (20.00%) 2000, Amount: 500.00');
  // Always show stats is off (the default): the plates show only while the chart has the drawing selected.
  expect(paint(canvas)).toEqual([]);
  selected.push(model.id);
  expect(paint(canvas)).toEqual(['Target: 20.00 (20.00%) 400, Amount: 500.00','Qty: 25.00','Risk/reward ratio: 2','Stop: 10.00 (10.00%) 200, Amount: 250.00']);
  expect(drawingEditor(model.serialize(),bars).values['lvPosition.profitTicks']).toBe(2000);// a fresh model built from the record is not painted yet
  expect(model.lvPosition.profitTicks).toBe(400);expect(model.lvPosition.stopTicks).toBe(200);
  selected.length=0;expect(paint(canvas)).toEqual([]);
  // adapter.ts registers the context with the source tick size and its selection as one of the chart's unsubscribes (released by disposeChart).
  const adapter=readFileSync('src/chart/adapter.ts','utf8');
  const start=adapter.indexOf('const unsubscribes = ['),list=adapter.slice(start,adapter.indexOf('\n',start));
  // The context also reads the hovered drawing from the renderer (Always show stats off then shows the plates on hover).
  expect(list).toContain("registerPositionChartContext(chartPositionContext({container,tickSize:()=>sourceTickSize(currentSource),selectedIds:()=>selectedDrawingIds,hoveredId:()=>rendererHoveredDrawingId(rendererHolder.current)}))");
  const dispose=adapter.slice(adapter.indexOf('disposeChart=()=>{'),adapter.indexOf(';return {controller,dispose:disposeChart};'));expect(dispose).toContain('...unsubscribes');
  // A newer chart in the same container wins over a context a failed initialization left behind.
  const newer=registerPositionChartContext(chartPositionContext({container:{contains:(node:unknown)=>node===canvas},tickSize:()=>1,selectedIds:()=>[model.id]}));
  try{const fresh=deserializeDrawing(saved('position'))! as any,r=recorder();r.ctx.canvas=canvas;fresh.lvPaint(r.ctx,proj(),theme);expect(fresh.lvPosition.profitTicks).toBe(20);}finally{newer();}
 });
 it('Price labels off drops the three axis labels of a selected position',()=>{
  const on=saved('position'),off=patchDrawingEdit(on,bars,{'lvPosition.priceLabels':false});
  expect(drawingAxisLabels([on as never],[on.id]).labels).toHaveLength(3);
  const result=drawingAxisLabels([off as never],[off.id]);expect(result.labels).toEqual([]);expect(result.bands).toHaveLength(1);
 });
});
