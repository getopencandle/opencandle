import {describe,expect,it} from 'vitest';
import {getDrawingType} from '@luxalgo/vela';
import {prepareDrawingAlertGrid,validateDrawingBoundarySnapshot} from '../../src/chart/drawing-alert-geometry';
import {evaluateDrawingAlertShape,validateDrawingAlertShape,drawingAlertKey,type DrawingAlertShapeSnapshot} from '../../src/chart/drawing-alert-shapes';
import {readFibChannelAlert,FIB_CHANNEL_DEFAULT_RATIOS} from '../../src/chart/fib-channel-alert-data';
import {readFibChannel} from '../../src/chart/lv-types/fib-channel';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {captureFibChannelLevels,describeAlertLevels} from '../../src/domain/alert-levels';
import {createLocalAlert,processAlertEvent,type LocalAlert,type AlertCondition} from '../../src/domain/alerts';
import {alertDatasetKey,validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {DRAWING_DELETED_DIAGNOSTIC,DrawingAlertFollow} from '../../src/domain/drawing-alert-source';
import {drawingConditionError} from '../../src/domain/drawing-alert-rules';
import {alertDrawingIds} from '../../src/domain/drawing-alert-links';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import type {ChartController} from '../../src/chart/adapter';

// Arrow, Cross line and Fib channel drawing alerts (channel, and active level crossing). SYNTHETIC data only.
const day=1704153600,now=1791936000;
const t=(index:number)=>(day+index*86400)*1000;
const dataset=(values:number[]):BarDataset=>{const base=fixtureDataset('GME',5);return {...base,bars:values.map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:Math.max(.01,value-1),close:value,volume:100}))};};
const six=dataset([10,11,12,13,14,15]);
function grid(data=six,scale='linear'){const prepared=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:scale as never});if(!prepared.ok)throw new Error(prepared.diagnostics.join(' '));return prepared.grid;}
function shape(record:Record<string,unknown>,options:{scale?:string;shape?:'levels';data?:BarDataset}={}):DrawingAlertShapeSnapshot{const captured=grid(options.data,options.scale).captureShape({id:'d1',paneId:'price',...record},options.shape?{shape:options.shape}:{});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));return captured.snapshot;}
const pair=(snapshot:DrawingAlertShapeSnapshot,x:number)=>{const value=evaluateDrawingAlertShape(snapshot,x);return !value.ok?null:value.shape==='channel'?[value.lower,value.upper]:value.shape==='levels'?[value.zero,value.one]:null;};
const levels=(ratios:number[])=>ratios.map(ratio=>({ratio,color:'#808080',enabled:true}));
const member=(extendLeft:boolean,extendRight:boolean)=>({schemaVersion:1,background:true,opacity:20,extendLeft,extendRight,showLevels:true});
// p1 (0, 10) to p2 (4, 14): slope 1 per bar; the offset anchor sets the ratio 1 line.
const fib=(offset:{index:number;price:number},props:Record<string,unknown>={},id='fc1')=>({id,type:'fibchannel',paneId:'price',anchors:[{time:t(0),price:10},{time:t(4),price:14},{time:t(offset.index),price:offset.price}],props:{levels:levels([0,0.5,1]),numbersSize:'small',labelsSize:'normal',...props}});

describe('Arrow and Cross line',()=>{
 it('an arrow is a segment like the trend line; a cross line is its horizontal price at every bar',()=>{
  const arrow=shape({type:'arrow',anchors:[{time:t(0),price:10},{time:t(2),price:14}]});
  expect(arrow.shape).toBe('line');expect(arrow.name).toBe('Arrow');
  expect(evaluateDrawingAlertShape(arrow,1)).toEqual({ok:true,shape:'line',price:12});/* The alert follows the segment's line past its end */expect(evaluateDrawingAlertShape(arrow,3)).toEqual({ok:true,shape:'line',price:16});
  const cross=shape({type:'crossline',anchors:[{time:t(2),price:12.5}]});
  expect(cross.name).toBe('Cross line');expect(evaluateDrawingAlertShape(cross,-3)).toEqual({ok:true,shape:'line',price:12.5});expect(evaluateDrawingAlertShape(cross,40)).toEqual({ok:true,shape:'line',price:12.5});
  expect(validateDrawingBoundarySnapshot(JSON.parse(JSON.stringify(cross)))).toEqual(cross);
 });
});

describe('Fib channel geometry',()=>{
 it('reads levels and Extend exactly as the renderer does',()=>{
  const native=(getDrawingType('fibchannel')!.create as unknown as (init:unknown)=>{levels:Array<{ratio:number;enabled:boolean}>})({id:'n',paneId:'price',createdAt:0});
  expect(readFibChannelAlert(undefined).enabledRatios).toEqual(native.levels.filter(level=>level.enabled).map(level=>level.ratio));
  expect([...FIB_CHANNEL_DEFAULT_RATIOS]).toEqual(native.levels.map(level=>level.ratio));
  expect(readFibChannelAlert({levels:[{ratio:0,color:'#000'},{ratio:0.5,color:'#000',enabled:false},{ratio:2,color:'#000'},{ratio:9}]}).enabledRatios).toEqual([0,2]);
  for(const props of [undefined,{},{lvFibChannel:member(true,false)},{lvFibChannel:member(false,true)}]){
   const renderer=readFibChannel(props),read=readFibChannelAlert(props);
   expect(renderer.state==='unavailable'?null:[renderer.settings.extendLeft,renderer.settings.extendRight]).toEqual([read.extendLeft,read.extendRight]);
  }
  expect(readFibChannel({lvFibChannel:{...member(true,true),opacity:101}}).state).toBe('unavailable');
  expect(()=>readFibChannelAlert({lvFibChannel:{...member(true,true),opacity:101}})).toThrow(/unreadable/);
 });
 it('as a channel: between its outermost enabled levels, each level line shifted by ratio * (offset - p1)',()=>{
  // offset (0, 20): dX 0, dY 10, level r at bar x = 10 + x + 10r over bars 0..4
  const flat=shape(fib({index:0,price:20}));
  expect(flat.shape).toBe('channel');expect(flat.name).toBe('Fib channel');
  expect(pair(flat,2)).toEqual([12,22]);expect(pair(flat,5)).toBeNull();
  // offset (1, 20): dX 1, so level r runs over bars r..4+r; level 1 starts at bar 1
  const slanted=shape(fib({index:1,price:20}));
  expect(pair(slanted,2)).toEqual([12,21]);expect(pair(slanted,0.5)).toBeNull();expect(pair(slanted,4.5)).toBeNull();
  const defaults=shape(fib({index:0,price:20},{levels:undefined}));
  const at=pair(defaults,0)!;expect(at[0]).toBe(10);expect(at[1]).toBeCloseTo(36.18,9);
  expect(grid().captureShape(fib({index:0,price:20},{levels:levels([0.5])})).ok).toBe(false);
  expect(grid().captureShape({...fib({index:2,price:12}),id:'zero-height'}).ok).toBe(false);
 });
 it('extends left and right along each level line, and follows the log scale',()=>{
  const right=shape(fib({index:0,price:20},{lvFibChannel:member(false,true)}));
  expect(pair(right,9)).toEqual([19,29]);expect(pair(right,-1)).toBeNull();
  const both=shape(fib({index:0,price:20},{lvFibChannel:member(true,true)}));expect(pair(both,-1)).toEqual([9,19]);
  // log: p1 (0, 10), p2 (2, 40), offset (0, 20): level r at bar 1 is 20 * 2^r
  const log=shape({type:'fibchannel',anchors:[{time:t(0),price:10},{time:t(2),price:40},{time:t(0),price:20}],props:{levels:levels([0,1,2])}},{scale:'logarithmic'});
  expect(log.coordinateModel).toBe('logical-bar-log-price');
  const middle=pair(log,1)!;expect(middle[0]).toBeCloseTo(20,9);expect(middle[1]).toBeCloseTo(80,9);
 });
 it('as levels: the ratio 0 and ratio 1 lines over the span of every enabled level; the key covers the enabled levels',()=>{
  const framed=shape(fib({index:1,price:20}),{shape:'levels'});
  expect(framed.shape).toBe('levels');
  // ratio 0 line: 10 + x; ratio 1 line: 19 + x; enabled levels span bars 0..5
  expect(pair(framed,2)).toEqual([12,21]);expect(pair(framed,5)).toEqual([15,24]);expect(pair(framed,5.5)).toBeNull();
  expect(validateDrawingAlertShape(JSON.parse(JSON.stringify(framed)))).toEqual(framed);
  expect(()=>validateDrawingAlertShape({...JSON.parse(JSON.stringify(framed)),tool:'parallelchannel'})).toThrow();
  expect(grid().captureShape({id:'tl',type:'trendline',anchors:[{time:t(0),price:1},{time:t(2),price:2}]},{shape:'levels'}).ok).toBe(false);
  const base=fib({index:1,price:20});
  expect(drawingAlertKey({...base,props:{...base.props,levels:levels([0,0.5,1]).map(level=>({...level,color:'#fff'}))}})).toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,props:{...base.props,levels:levels([0,1])}})).not.toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,props:{...base.props,lvFibChannel:member(false,true)}})).not.toBe(drawingAlertKey(base));
 });
});

// ---- the alert, end to end ----
function boundary(data:BarDataset,record:Record<string,unknown>,levelsShape=false):Extract<AlertSourceSnapshot,{kind:'drawing-boundary'}>{
 const captured=grid(data).captureShape(record,levelsShape?{shape:'levels'}:{});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));
 return {kind:'drawing-boundary',instanceId:String(record.id),snapshotId:'SYNTHETIC-geometry',geometry:captured.snapshot,mutationPolicy:'follow'};
}
async function value(data:BarDataset,source:AlertSourceSnapshot,drawings?:unknown[]|null){const batch=await evaluateTechnicalAlertSources(data.bars,[source],'USD',{sourceBasis:alertDatasetKey(data,2),sourceRevision:data.provenance.revision,drawings});return batch.results.get(technicalSourceKey(source))!;}
const input=(data:BarDataset,source:AlertSourceSnapshot,alerts:LocalAlert[],drawings:unknown[]):TechnicalAlertInput=>({dataset:data,bars:data.bars,chartId:'SYNTHETIC-chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts,drawings});
const engine=()=>{let i=0;return new TechnicalAlertObserver(()=>'SYNTHETIC-session-'+ ++i,()=>Promise.resolve());};
function makeAlert(view:TechnicalAlertView,condition:AlertCondition):LocalAlert{
 const c=view.selectedContext!;return createLocalAlert({id:'fib-alert',name:'SYNTHETIC Fib channel alert',message:'Synthetic',instrumentId:c.instrumentId,sourceId:c.sourceId,mode:c.mode,runId:c.runId,observationBinding:c.binding,conditionVersion:2,condition,frequency:'every-time',createdAt:view.now,expiresAt:null});
}
const consume=(alert:LocalAlert,view:TechnicalAlertView)=>view.events.reduce((state,event)=>processAlertEvent(state,event).alert,alert);
const fibLevels=(drawing:Record<string,unknown>)=>{const read=captureFibChannelLevels(drawing,readFibChannelAlert(drawing.props).enabledRatios);if(!read.ok)throw new Error(read.diagnostics.join(' '));return read.levels;};

describe('Fib channel alerts',()=>{
 it('the levels value is the close\'s Fib ratio in the channel, following the drawing when it moves or is deleted',async()=>{
  // offset (0, 20): ratio of the close at bar x = (close - 10 - x) / 10
  const data=dataset([10,11,17,18]),drawing=fib({index:0,price:20}),source=boundary(data,drawing,true);
  const result=await value(data,source,[drawing]);expect(result.sample.value).toBeCloseTo(0.5,12);expect(result.diagnostics).toEqual([]);
  expect(result.sample.operands?.left.plots?.map(plot=>plot.id)).toEqual(['zero','one','price']);
  // moved up by 5: ratio (18 - 18) / 10
  const moved=fib({index:0,price:20});moved.anchors=moved.anchors.map(anchor=>({...anchor,price:anchor.price+5}));
  expect((await value(data,source,[moved])).sample.value).toBe(0);
  const deleted=await value(data,source,[]);expect(deleted.sample.value).toBeNull();expect(deleted.diagnostics).toContain(DRAWING_DELETED_DIAGNOSTIC);
 });
 it('fires once on crossing an enabled level, names the level, and is tied to that drawing\'s levels',async()=>{
  const data=dataset([10,11]),drawing=fib({index:0,price:20}),source=boundary(data,drawing,true),observer=engine(),set=fibLevels(drawing);
  expect(set).toMatchObject({tool:'fibchannel',drawingId:'fc1',levels:[{ratio:0,price:0},{ratio:0.5,price:0.5},{ratio:1,price:1}]});
  expect(describeAlertLevels(set)).toBe('3 active levels: 0, 0.5, 1');
  const first=await observer.observe(input(data,source,[],[drawing]),now);
  let alert=consume(makeAlert(first,{kind:'level-crossing',levels:set}),first);expect(alert.history).toHaveLength(0);
  const grown={...data,bars:[...data.bars,{time:day+2*86400,open:17,high:18,low:16,close:17,volume:100}]};
  const next=await observer.observe(input(grown,source,[alert],[drawing]),now+1);
  const fired=next.events.reduce<{alert:LocalAlert;messages:string[]}>((state,event)=>{const out=processAlertEvent(state.alert,event);return{alert:out.alert,messages:out.notification?[...state.messages,out.notification.message]:state.messages};},{alert,messages:[]});
  alert=fired.alert;expect(alert.history).toHaveLength(1);expect(alert.history[0].value).toBeCloseTo(0.5,12);
  expect(fired.messages.join()).toContain('(level 0.5)');expect(fired.messages.join()).not.toContain(' at ');
  expect(alertDrawingIds(alert)).toEqual(['fc1']);
  // the channel choice takes Entering..Outside; level crossing needs the levels source and that drawing's levels
  const channel=boundary(data,drawing),channelView=await engine().observe(input(data,channel,[],[drawing]),now);
  expect(()=>makeAlert(channelView,{kind:'entering',lower:0,upper:1})).not.toThrow();
  expect(()=>makeAlert(channelView,{kind:'level-crossing',levels:set})).toThrow();
  expect(()=>makeAlert(first,{kind:'crossing',value:0.5})).toThrow(/Fib channel level/);
  expect(()=>makeAlert(first,{kind:'level-crossing',levels:{...set,drawingId:'other'}})).toThrow(/Fib channel level/);
  expect(drawingConditionError({kind:'price',field:'close',transformId:'standard'},{kind:'level-crossing',levels:set})).toMatch(/Fib channel/);
  expect(()=>validateTechnicalAlertSource({kind:'comparison',snapshotId:'x',left:{kind:'price',field:'close',transformId:'standard'},right:source})).toThrow(/alone/);
 });
 it('a moved Fib channel restarts its level alert (history kept), never on first sight',async()=>{
  const data=dataset([10,11]),drawing=fib({index:0,price:20}),source=boundary(data,drawing,true),view=await engine().observe(input(data,source,[],[drawing]),now);
  const alerts=[consume(makeAlert(view,{kind:'level-crossing',levels:fibLevels(drawing)}),view)],tracker=new DrawingAlertFollow();
  expect(tracker.follow(alerts,[drawing],now+1).alerts).toBe(alerts);
  const restarted=tracker.follow(alerts,[fib({index:0,price:30})],now+2);expect(restarted.restarted).toEqual(['fib-alert']);expect(restarted.alerts[0].definition.condition.levels).toEqual(alerts[0].definition.condition.levels);
 });
});

describe('the source picker',()=>{
 it('offers a Fib channel as a channel and as its active level crossing, and Arrow and Cross line against the price',()=>{
  const data=dataset([10,11,12,13]),bars=data.bars,source=sourceContextForDataset(data,bars);
  const drawings=[fib({index:0,price:20}),{id:'ar1',type:'arrow',paneId:'price',anchors:[{time:t(0),price:9},{time:t(2),price:11}]},{id:'cl1',type:'crossline',paneId:'price',anchors:[{time:t(1),price:12}]},fib({index:0,price:20},{levels:levels([0.5])},'fc2')];
  const chart={getSourceContext:()=>source,getStyle:()=>'candles',getDataWindow:()=>({pending:false,source,series:{count:bars.length,firstTime:bars[0]!.time,lastTime:bars.at(-1)!.time,style:'candles'}}),indicators:{serialize:()=>[]},saveDrawings:()=>({version:1,drawings:structuredClone(drawings)}),getChartOptions:()=>({scale:'linear'})} as unknown as ChartController;
  let id=0;const choices=new TechnicalAlertCatalog(()=>String(++id)).capture(chart,data,bars,[]);
  expect(choices.find(row=>row.id==='drawing:fc1')).toMatchObject({label:'Fib channel 1: close in the channel',drawingShape:'channel',source:{geometry:{shape:'channel'}}});
  const level=choices.find(row=>row.id==='drawing:fc1:levels')!;
  expect(level.label).toBe('Fib channel 1: any level');expect(level.levels?.tool).toBe('fibchannel');
  expect(level.source).toMatchObject({kind:'drawing-boundary',mutationPolicy:'follow',geometry:{shape:'levels',tool:'fibchannel'}});
  expect(choices.find(row=>row.id==='drawing:ar1')!.label).toBe('Arrow');
  expect(choices.find(row=>row.id==='drawing:cl1')!.label).toBe('Cross line');
  // one enabled level: no inside, but its level crossing is offered
  expect(choices.find(row=>row.id==='drawing:fc2')!.disabledReason).toMatch(/two different enabled levels/);
  expect(choices.find(row=>row.id==='drawing:fc2:levels')!.disabledReason).toBeUndefined();
 });
});
