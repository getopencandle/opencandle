// (fail-first): Middle point, Price labels, Stats Distance and Angle for Ray, Extended line, Info line and Arrow
// (the 16 trendline-style rows of visual-drawing-dialogs#dialog.LineTool{Ray,Extended,InfoLine,Arrow}.style.2/.3/.5). Each row must be
// offered by its own tool's editor, saved in props.lvTrendlineMarkers and painted by the shape layer. SYNTHETIC fixtures only.
import {afterEach,describe,expect,it} from 'vitest';
import {createDrawing,type DrawingTypeKey,type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,drawingFieldPathPossible,patchDrawingEdit,createDrawingFieldConsumerSet,setDrawingFieldConsumer,DRAWING_FIELD_CONSUMER_NAMES} from '../../src/chart/drawing-port';
import {dwb3ShapePayload,paintDwb3Row} from '../../src/chart/dwb3-shape-layer';
import {LINE_MARKER_TYPES,planTrendlineMarkers,paintTrendlineMarkers,lineDistanceText,lineAngleText} from '../../src/chart/trendline-markers-painter';
import {TRENDLINE_MARKERS_DEFAULTS,patchTrendlineMarkers} from '../../src/chart/trendline-stats-data';
import {DIALOG_SPECS,DIALOG_UNAVAILABLE,dialogSpecFor,type DialogRow} from '../../src/ui/drawing-dialog-spec';
import {bars,T0,T1} from './dwb3-helpers';

const MARKERS='props.lvTrendlineMarkers.';
const PATHS=['middlePoint','priceLabels','distance','angle'].map(key=>MARKERS+key);
const OTHER_LINES=['ray','extendedline','infoline','arrow'] as const;
const TOOL_IDS:Record<string,string>={ray:'LineToolRay',extendedline:'LineToolExtended',infoline:'LineToolInfoLine',arrow:'LineToolArrow'};
const record=(type:string):SerializedDrawing=>createDrawing(type as DrawingTypeKey,{id:'rows3-'+type,paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:120}]})!.serialize();
const flatten=(rows:readonly DialogRow[]):DialogRow[]=>rows.flatMap(row=>[row,...row.children?flatten(row.children):[]]);
// The adapter turns these on when the shape layer installs (adapter.ts shape-layer block).
const SHAPE_LAYER_FLAGS=['trendline.middlePoint','trendline.priceLabels','channel.levels','channel.extend','channel.background','box.extend'];
afterEach(()=>{for(const name of DRAWING_FIELD_CONSUMER_NAMES)setDrawingFieldConsumer(name,false);});
// SYNTHETIC projection over the 4 fixture bars: x = 100 px per bar, y = 300 - price.
const proj={xOf:(time:number)=>(time-T0)/60000*100,yOf:(price:number)=>300-price,indexOf:(time:number)=>(time-T0)/60000};
const bounds={left:0,right:600,top:0,bottom:300};

describe('the four marker rows on every trendline-family tool with a recorded dialog',()=>{
 it('the family is trendline, ray, extended line, info line and arrow (the five recorded line dialogs)',()=>{
  expect([...LINE_MARKER_TYPES]).toEqual(['trendline',...OTHER_LINES]);
  for(const type of LINE_MARKER_TYPES)expect(dialogSpecFor(type)!.style.length).toBeGreaterThan(3);
 });
 it.each(OTHER_LINES)('%s: the 16 rows are bound (no longer DIALOG_UNAVAILABLE) and possible for the tool',type=>{
  const spec=dialogSpecFor(type)!,rows=flatten(spec.style);
  expect(rows.find(row=>row.title==='Middle point')!.lv).toEqual({showMiddlePoint:MARKERS+'middlePoint'});
  expect(rows.find(row=>row.title==='Price labels')!.lv).toEqual({showPriceLabels:MARKERS+'priceLabels'});
  expect(rows.find(row=>row.title==='Stats')!.lv).toMatchObject({showDistance:MARKERS+'distance',showAngle:MARKERS+'angle'});
  expect(DIALOG_UNAVAILABLE.filter(row=>row.toolId===TOOL_IDS[type]).map(row=>row.property)).toEqual(['showPipsPriceRange']);
  for(const path of PATHS)expect(drawingFieldPathPossible(type,path),path).toBe(true);
 });
 it('tools outside the family still cannot offer them',()=>{
  for(const type of ['hline','box','trendangle','fibretracement'])for(const path of PATHS)expect(drawingFieldPathPossible(type,path),type+' '+path).toBe(false);
 });
 it.each(OTHER_LINES)('%s: its own editor offers the four rows once the shape layer is installed, and none before',type=>{
  const off=createDrawingFieldConsumerSet(),on=createDrawingFieldConsumerSet();
  try{
   for(const name of SHAPE_LAYER_FLAGS)on.set(name);
   const fieldsOff=drawingEditor(record(type),bars,undefined,{consumers:off}).fields.map(field=>field.path);
   const editor=drawingEditor(record(type),bars,undefined,{consumers:on});
   for(const path of PATHS){expect(fieldsOff,path).not.toContain(path);expect(editor.fields.map(field=>field.path),path).toContain(path);expect(editor.values[path],path).toBe(false);}
  }finally{off.dispose();on.dispose();}
 });
 it('the trendline keeps its own consumers: distance and angle follow the statistics painter flags',()=>{
  const layerOnly=createDrawingFieldConsumerSet();
  try{for(const name of SHAPE_LAYER_FLAGS)layerOnly.set(name);const paths=drawingEditor(record('trendline'),bars,undefined,{consumers:layerOnly}).fields.map(field=>field.path);
   expect(paths).toContain(MARKERS+'middlePoint');expect(paths).not.toContain(MARKERS+'distance');expect(paths).not.toContain(MARKERS+'angle');}
  finally{layerOnly.dispose();}
 });
 it('per tool, no bound marker path is dead: every marker path a spec row binds is on that tool\'s own editor',()=>{
  for(const name of SHAPE_LAYER_FLAGS)setDrawingFieldConsumer(name,true);
  for(const type of OTHER_LINES){
   const paths=new Set(drawingEditor(record(type),bars).fields.map(field=>field.path));
   for(const row of flatten(dialogSpecFor(type)!.style))for(const [property,path] of Object.entries(row.lv)){
    if(path===null)continue;
    if(path.startsWith(MARKERS))expect(paths.has(path),type+' '+property+' -> '+path).toBe(true);
   }
  }
  expect(DIALOG_SPECS.length).toBeGreaterThan(5);
 });
});

describe('saving the rows',()=>{
 it.each(OTHER_LINES)('%s: a row edit writes the whole marker member, a no-op returns the same record, a saved drawing stays as it was',type=>{
  for(const name of SHAPE_LAYER_FLAGS)setDrawingFieldConsumer(name,true);
  const saved=record(type);expect(saved.props?.lvTrendlineMarkers).toBeUndefined();
  expect(patchDrawingEdit(saved,bars,{[MARKERS+'distance']:false})).toBe(saved);
  const edited=patchDrawingEdit(saved,bars,{[MARKERS+'middlePoint']:true,[MARKERS+'angle']:true});
  expect(edited.props!.lvTrendlineMarkers).toEqual({schemaVersion:1,middlePoint:true,priceLabels:false,distance:false,angle:true});
  expect(edited.anchors).toEqual(saved.anchors);expect(edited.style).toEqual(saved.style);
  expect(drawingEditor(edited,bars).values[MARKERS+'angle']).toBe(true);
  expect(patchDrawingEdit(edited,bars,{[MARKERS+'angle']:true})).toBe(edited);
  expect(()=>patchDrawingEdit(saved,bars,{[MARKERS+'angle']:'yes'})).toThrow();
 });
 it('a tool outside the family refuses the paths',()=>{
  for(const name of SHAPE_LAYER_FLAGS)setDrawingFieldConsumer(name,true);
  expect(()=>patchDrawingEdit(record('hline'),bars,{[MARKERS+'middlePoint']:true})).toThrow('not supported');
 });
});

describe('painting the rows',()=>{
 const marked=(type:string,settings:Partial<typeof TRENDLINE_MARKERS_DEFAULTS>)=>{const base=record(type);return {...base,props:{...(base.props??{}),lvTrendlineMarkers:{...TRENDLINE_MARKERS_DEFAULTS,...settings}}};};
 it.each(OTHER_LINES)('%s: each of the four toggles alone puts a row in the layer payload and paints something',type=>{
  for(const key of ['middlePoint','priceLabels','distance','angle'] as const){
   const rows=dwb3ShapePayload([marked(type,{[key]:true}) as never]).rows;
   expect(rows.map(row=>row.kind),type+' '+key).toEqual(['line']);
   const calls:string[]=[],ctx:any=new Proxy({},{get:(_,name)=>name==='measureText'?(text:string)=>({width:text.length*6}):typeof name==='string'?(...args:unknown[])=>{calls.push(String(name)+'('+args.join(',')+')');}:undefined,set:()=>true});
   const painted=paintDwb3Row(ctx,rows[0],proj,bounds,{fontFamily:'sans-serif',background:'#000',textColor:'#fff'});
   expect(painted,type+' '+key).toBeGreaterThan(0);
   expect(calls.some(call=>call.startsWith(key==='middlePoint'?'arc(':'fillText(')),type+' '+key).toBe(true);
  }
 });
 it('a saved line or all toggles off adds nothing; hidden rows and other panes stay out',()=>{
  for(const type of OTHER_LINES){
   expect(dwb3ShapePayload([record(type) as never]).rows).toEqual([]);
   expect(dwb3ShapePayload([marked(type,{}) as never]).rows).toEqual([]);
   expect(dwb3ShapePayload([{...marked(type,{middlePoint:true}),visible:false} as never,{...marked(type,{middlePoint:true}),paneId:'pane-2'} as never]).rows).toEqual([]);
  }
 });
 it('the trendline payload is unchanged: distance and angle alone stay with the statistics painter',()=>{
  const only=patchTrendlineMarkers(record('trendline'),{schemaVersion:1,middlePoint:false,priceLabels:false,distance:true,angle:true});
  expect(dwb3ShapePayload([only as never]).rows).toEqual([]);
  const dot=patchTrendlineMarkers(record('trendline'),{schemaVersion:1,middlePoint:true,priceLabels:false,distance:true,angle:true});
  const rows=dwb3ShapePayload([dot as never]).rows;expect(rows.map(row=>row.kind)).toEqual(['trendline']);
  expect(planTrendlineMarkers((rows[0] as {markers:typeof TRENDLINE_MARKERS_DEFAULTS}).markers,[{time:T0,price:100},{time:T1,price:120}],proj,bounds,{color:'#123'}).map(op=>op.kind)).toEqual(['dot']);
 });
 it('distance is the bar count and the price difference; angle is read from the projected segment',()=>{
  const ops=planTrendlineMarkers({...TRENDLINE_MARKERS_DEFAULTS,distance:true,angle:true},[{time:T0,price:100},{time:T1,price:120}],proj,bounds,{color:'#123',statistics:true});
  expect(ops).toEqual([{kind:'block',lines:['Distance: 3 bars, 20','Angle: 3.81 deg'],x:150,y:190-6-32,lineHeight:16}]);
  expect(lineDistanceText([{time:T0,price:120},{time:T1,price:100}],proj)).toBe('Distance: 3 bars, 20');
  expect(lineDistanceText([{time:T0,price:100},{time:T1,price:120}],{xOf:()=>0,yOf:()=>0})).toMatch(/^Distance: unavailable/);
  expect(lineAngleText({x:0,y:100},{x:100,y:0})).toBe('Angle: 45 deg');
  expect(lineAngleText({x:5,y:5},{x:5,y:5})).toMatch(/^Angle: unavailable/);
 });
 it('without statistics the plan is the trendline plan exactly; the block paints inside one save/restore pair',()=>{
  expect(planTrendlineMarkers({...TRENDLINE_MARKERS_DEFAULTS,distance:true,angle:true},[{time:T0,price:100},{time:T1,price:120}],proj,bounds,{color:'#123'})).toEqual([]);
  const calls:string[]=[],ctx:any=new Proxy({},{get:(_,name)=>typeof name==='string'?(...args:unknown[])=>{calls.push(String(name));return undefined;}:undefined,set:()=>true});
  paintTrendlineMarkers(ctx,[{kind:'block',lines:['a','b'],x:1,y:2,lineHeight:16}],{fontFamily:'sans-serif'});
  expect(calls.filter(call=>call==='save')).toHaveLength(1);expect(calls.filter(call=>call==='restore')).toHaveLength(1);
  expect(calls.filter(call=>call==='fillText')).toHaveLength(2);expect(calls).toContain('fillRect');
 });
});
