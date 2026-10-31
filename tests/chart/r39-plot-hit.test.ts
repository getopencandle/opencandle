import {describe,expect,it,vi} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {createRendererContextPort} from '../../src/chart/renderer-context';
import {createChartContextPort} from '../../src/chart/chart-context-port';
import {contextPlotHit,plotHitEntity,priceToPaneY,indicatorEntityCurrent,createBarMarksVisibility,BAR_MARKS_HIDE_LABEL,BAR_MARKS_SHOW_LABEL,type PlotHitPane} from '../../src/chart/context-menu';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartController} from '../../src/chart/adapter';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';

// Plot hit-testing for the chart menu. SYNTHETIC fixture bars and values only; the
// renderer is the pinned NativeRenderer with hand-set geometry (no canvas, no DOM, no window).
const pane=(over:Partial<PlotHitPane>={}):PlotHitPane=>({paneId:'price',kind:'price',top:0,height:300,scale:{min:100,max:200,log:false,invert:false},columns:[],owners:[{kind:'built',id:'sma',rendererId:'native-sma'}],...over});

describe(' priceToPaneY',()=>{
 it('inverts the capture y-to-price rule for linear, logarithmic and inverted scales',()=>{
  expect(priceToPaneY({top:0,height:300},{min:100,max:200,log:false,invert:false},150)).toBe(150);
  expect(priceToPaneY({top:10,height:300},{min:100,max:200,log:false,invert:false},200)).toBe(10);
  expect(priceToPaneY({top:0,height:300},{min:100,max:200,log:false,invert:true},200)).toBe(300);
  expect(priceToPaneY({top:0,height:300},{min:100,max:10000,log:true,invert:false},1000)).toBeCloseTo(150,10);
  expect(priceToPaneY({top:0,height:300},{min:100,max:10000,log:true,invert:false},-1)).toBeNull();
  expect(priceToPaneY({top:0,height:300},{min:100,max:200,log:false,invert:false},Number.NaN)).toBeNull();
 });
});

describe(' contextPlotHit',()=>{
 it('hits an indicator line within 4 px at the clicked bar, and misses beyond it',()=>{
  const hit=(y:number)=>contextPlotHit({y,logical:1,barIndex:1,pane:pane(),bar:null,indicators:[{id:'sma',rendererId:'native-sma',values:[[140,150,160]]}]});
  expect(hit(150)).toEqual({kind:'indicator',id:'sma',rendererId:'native-sma'});
  expect(hit(154)).toEqual({kind:'indicator',id:'sma',rendererId:'native-sma'});
  expect(hit(155)).toBeNull();
 });
 it('follows the line between the two bars around the pointer',()=>{
  // Between bar 1 (150 -> y 150) and bar 2 (160 -> y 120), half way: y 135.
  expect(contextPlotHit({y:135,logical:1.5,barIndex:1,pane:pane(),bar:null,indicators:[{id:'sma',rendererId:'native-sma',values:[[140,150,160]]}]})).toMatchObject({kind:'indicator'});
  expect(contextPlotHit({y:135,logical:1,barIndex:1,pane:pane(),bar:null,indicators:[{id:'sma',rendererId:'native-sma',values:[[140,150,160]]}]})).toBeNull();
 });
 it('reads an own-scale indicator against its own column, and skips owners the pane does not list',()=>{
  const own=pane({columns:[{owner:{kind:'built',id:'sma'},scale:{min:0,max:100,log:false,invert:false}}]});
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:own,bar:null,indicators:[{id:'sma',rendererId:'native-sma',values:[[50]]}]})).toMatchObject({kind:'indicator',id:'sma'});
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:pane({owners:[]}),bar:null,indicators:[{id:'sma',rendererId:'native-sma',values:[[150]]}]})).toBeNull();
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:pane(),bar:null,indicators:[{id:'sma',rendererId:'other',values:[[150]]}]})).toBeNull();
 });
 it('takes the nearest plot, the first listed one on a tie, and ignores warm-up gaps',()=>{
  const two=pane({owners:[{kind:'built',id:'a',rendererId:'na'},{kind:'built',id:'b',rendererId:'nb'}]});
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:two,bar:null,indicators:[{id:'a',rendererId:'na',values:[[151]]},{id:'b',rendererId:'nb',values:[[150]]}]})).toMatchObject({id:'b'});
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:two,bar:null,indicators:[{id:'a',rendererId:'na',values:[[150]]},{id:'b',rendererId:'nb',values:[[150]]}]})).toMatchObject({id:'a'});
  expect(contextPlotHit({y:150,logical:0,barIndex:0,pane:two,bar:null,indicators:[{id:'a',rendererId:'na',values:[[null]]}]})).toBeNull();
 });
 it('targets the main series between the bar high and low on the price pane; an indicator on it wins',()=>{
  const bar={high:160,low:140};// y 120 to 180
  expect(contextPlotHit({y:170,logical:1,barIndex:1,pane:pane({owners:[]}),bar,indicators:[]})).toEqual({kind:'series',owner:'main'});
  expect(contextPlotHit({y:183,logical:1,barIndex:1,pane:pane({owners:[]}),bar,indicators:[]})).toEqual({kind:'series',owner:'main'});
  expect(contextPlotHit({y:190,logical:1,barIndex:1,pane:pane({owners:[]}),bar,indicators:[]})).toBeNull();
  expect(contextPlotHit({y:170,logical:1,barIndex:1,pane:pane({kind:'study',paneId:'study',owners:[]}),bar,indicators:[]})).toBeNull();
  expect(contextPlotHit({y:150,logical:1,barIndex:1,pane:pane(),bar,indicators:[{id:'sma',rendererId:'native-sma',values:[[150,150,150]]}]})).toMatchObject({kind:'indicator'});
  expect(contextPlotHit({y:150,logical:null,barIndex:null,pane:pane(),bar,indicators:[]})).toBeNull();
 });
});

describe(' plotHitEntity',()=>{
 const bars=[{high:150,low:140},{high:160,low:140},{high:170,low:150}];
 it('refines only a chart-body capture with plot geometry, from shown indicators of that pane',()=>{
  const indicators={list:()=>[{id:'sma',rendererId:'native-sma',visible:true}],values:vi.fn(()=>({series:[{values:[150,150,150]}]}))};
  const capture={entity:{kind:'chart' as const},point:{logical:1,barIndex:1},local:{x:5,y:150},plot:pane()};
  expect(plotHitEntity(capture,bars,indicators)).toEqual({kind:'indicator',id:'sma',rendererId:'native-sma'});
  expect(plotHitEntity({...capture,plot:null},bars,indicators)).toBeNull();
  expect(plotHitEntity({...capture,entity:{kind:'time-axis'}},bars,indicators)).toBeNull();
  expect(plotHitEntity(capture,bars,{...indicators,list:()=>[{id:'sma',rendererId:'native-sma',visible:false}]})).toEqual({kind:'series',owner:'main'});
 });
 it('skips a plot whose length is not the bar count, and a values read that throws',()=>{
  const capture={entity:{kind:'chart' as const},point:{logical:1,barIndex:1},local:{x:5,y:150},plot:pane()};
  expect(plotHitEntity(capture,bars,{list:()=>[{id:'sma',rendererId:'native-sma',visible:true}],values:()=>({series:[{values:[150,150]}]})})).toEqual({kind:'series',owner:'main'});
  expect(plotHitEntity(capture,bars,{list:()=>[{id:'sma',rendererId:'native-sma',visible:true}],values:()=>{throw Error('gone');}})).toEqual({kind:'series',owner:'main'});
 });
 it('an indicator target stays current only while the same instance and renderer id are listed',()=>{
  const entity={kind:'indicator' as const,id:'sma',rendererId:'n1'};
  expect(indicatorEntityCurrent(entity,[{id:'sma',rendererId:'n1'}])).toBe(true);
  expect(indicatorEntityCurrent(entity,[{id:'sma',rendererId:'n2'}])).toBe(false);
  expect(indicatorEntityCurrent({kind:'chart'},[])).toBe(true);
 });
});

function fixture(){
 const dataset=fixtureDataset('GME',3),renderer=new NativeRenderer(),r=renderer as any,price=r.scene.ensurePane('price','price',0,1);
 Object.assign(price,{bounds:{top:0,height:300},scale:{min:100,max:200},initialized:true});
 r.coords={times:dataset.bars.map(bar=>bar.time*1000),widthPx:400,dataHeightPx:300,pitchScale:1,viewport:{barSpacing:20,rightOffset:0}};r.rightAxisW=64;r.plot={getBoundingClientRect:()=>({left:10,top:20,width:464,height:326})};r.userDrawings=null;
 r.scene.indicators.set('native-sma',{id:'native-sma',paneId:'price'});
 const inventory:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[{kind:'built',id:'sma',rendererId:'native-sma'}]}],occupiedIds:[]};
 return{renderer,r,price,inventory,port:createRendererContextPort(renderer),dataset};
}
describe(' renderer geometry and the chart context port',()=>{
 it('the renderer reports the clicked pane geometry and owners for a chart-body click only',()=>{
  const f=fixture(),body=f.port.capture(f.inventory,f.dataset.bars,{x:390,y:170});
  expect(body.entity).toEqual({kind:'chart'});
  expect((body as {plot?:PlotHitPane}).plot).toEqual({paneId:'price',kind:'price',top:0,height:300,scale:{min:100,max:200,log:false,invert:false},columns:[],owners:[{kind:'built',id:'sma',rendererId:'native-sma'}]});
  expect('plot' in f.port.capture(f.inventory,f.dataset.bars,{x:435,y:95})).toBe(false);
  expect('plot' in f.port.capture(f.inventory,f.dataset.bars,{x:300,y:330})).toBe(false);
  f.price.initialized=false;expect('plot' in f.port.capture(f.inventory,f.dataset.bars,{x:390,y:170})).toBe(false);
 });
 it('a right-click on the plot issues an indicator snapshot, which retires when the indicator goes',()=>{
  const f=fixture(),source=sourceContextForDataset(f.dataset),input={bars:f.dataset.bars,source,style:'candles'};
  let rows=[{id:'sma',rendererId:'native-sma',visible:true}];
  const values=f.dataset.bars.map(()=>150);
  const chart={isInputCurrent:()=>true,getStyle:()=>input.style,sourceContext:()=>source,getAnalysisPaneInventory:()=>f.inventory,getChartOptions:()=>({}),getChartSettingsBook:()=>({}),saveDrawings:()=>({drawings:[]}),indicators:{list:()=>rows,values:()=>({series:[{values}]})}} as unknown as ChartController;
  const port=createChartContextPort(chart,f.port,()=>false);
  const open=(y:number)=>port.capture({cellId:'cell',treeOwner:{},input,executionIdentity:'ordinary',instrument:f.dataset.instrument,client:{x:390,y},ownerCurrent:()=>true});
  const snapshot=open(170);
  expect(snapshot.entity).toEqual({kind:'indicator',id:'sma',rendererId:'native-sma'});
  expect(port.isCurrent(snapshot)).toBe(true);
  rows=[{id:'sma',rendererId:'native-other',visible:true}];
  expect(port.isCurrent(snapshot)).toBe(false);
  rows=[];
  expect(open(100).entity.kind).not.toBe('indicator');
 });
 it('a failing indicator read keeps the chart menu',()=>{
  const f=fixture(),source=sourceContextForDataset(f.dataset),input={bars:f.dataset.bars,source,style:'candles'};
  const chart={isInputCurrent:()=>true,getStyle:()=>input.style,sourceContext:()=>source,getAnalysisPaneInventory:()=>f.inventory,getChartOptions:()=>({}),getChartSettingsBook:()=>({}),saveDrawings:()=>({drawings:[]}),indicators:{list:()=>{throw Error('port retired');},values:()=>({series:[]})}} as unknown as ChartController;
  const port=createChartContextPort(chart,f.port,()=>false);
  expect(port.capture({cellId:'cell',treeOwner:{},input,executionIdentity:'ordinary',instrument:f.dataset.instrument,client:{x:390,y:170},ownerCurrent:()=>true}).entity).toEqual({kind:'chart'});
 });
});

describe(' Hide marks on bars store',()=>{
 it('toggles per chart cell, notifies, and never keeps a blank cell',()=>{
  const store=createBarMarksVisibility(),seen=vi.fn(),off=store.subscribe(seen);
  expect(store.hiddenFor('a')).toBe(false);
  expect(store.toggle('a')).toBe(true);expect(store.hiddenFor('a')).toBe(true);expect(store.hiddenFor('b')).toBe(false);
  expect(store.toggle('a')).toBe(false);expect(store.hiddenFor('a')).toBe(false);
  expect(seen).toHaveBeenCalledTimes(2);off();store.toggle('b');expect(seen).toHaveBeenCalledTimes(2);
  expect(()=>store.toggle('')).toThrow();store.clear();expect(store.hiddenFor('b')).toBe(false);
  expect([BAR_MARKS_HIDE_LABEL,BAR_MARKS_SHOW_LABEL]).toEqual(['Hide marks on bars','Show marks on bars']);
 });
});
