// SYNTHETIC rows and bars; real projection, payload, editor and indicator renderer run (no DOM or GUI claim).
import {describe,expect,it} from 'vitest';
import {createDrawingVisibilityProjection,makeDrawingVisibility} from '../../src/chart/drawing-visibility';
import {dwb3ShapePayload} from '../../src/chart/dwb3-shape-layer';
import {patchTrendlineMarkers} from '../../src/chart/trendline-stats-data';
import {seedNewChannel} from '../../src/chart/channel-levels-data';
import {createDrawingFieldConsumerSet,drawingEditor} from '../../src/chart/drawing-port';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {indicatorContextWithOverlay} from '../../src/chart/indicator-hide-overlay';
import {calculateIndicator} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {trendline,channel,bars as dwbBars} from './dwb3-helpers';

type Row=Record<string,unknown>;
const marked=(id:string,extra:Row={})=>({...patchTrendlineMarkers({...trendline(),id},{schemaVersion:1,middlePoint:true,priceLabels:true,distance:false,angle:false}),...extra}) as unknown as Row;
const seededChannel=(id:string,extra:Row={})=>({...seedNewChannel({...channel(),id}),...extra}) as unknown as Row;

function projectionFor(canonical:Row[],state:{hidden:boolean;resolution:string;unavailable:Set<string>},applied:Array<string[]>){
 const projection:ReturnType<typeof createDrawingVisibilityProjection<Row>>=createDrawingVisibilityProjection<Row>({
  read:()=>canonical,resolution:()=>state.resolution,overlay:()=>({hidden:state.hidden}),eligible:row=>!state.unavailable.has(String(row.id)),
  push:()=>{},applied:()=>applied.push([...projection.visibleIds()].sort()),
 });
 return projection;
}
// The native rows carry no lvTrendlineMarkers/lvChannel members; the layer must read them from the canonical rows.
const nativeOf=(canonical:Row[])=>canonical.map(row=>({id:row.id,type:row.type,paneId:'price',anchors:row.anchors}) as Row);

describe('fix 2: the layer paints exactly the drawings the renderer paints',()=>{
 it('interval visibility, Hide all drawings and unavailable ids remove a row from the payload; each change repaints',()=>{
  const canonical=[marked('t-all'),marked('t-hourly',{lvIntervalVisibility:makeDrawingVisibility('include',['1h'])}),marked('t-lost'),seededChannel('c1')];
  const state={hidden:false,resolution:'1D',unavailable:new Set<string>(['t-lost'])},applied:string[][]=[],projection=projectionFor(canonical,state,applied);
  const payloadIds=()=>dwb3ShapePayload(canonical,projection.visibleIds()).rows.length;
  projection.sync(nativeOf(canonical));
  expect(applied.at(-1)).toEqual(['c1','t-all']);
  expect(payloadIds()).toBe(2);                                    // t-all (trendline) + c1 (channel); hourly-only and unavailable plan nothing
  expect(dwb3ShapePayload(canonical).rows.length).toBe(4);          // the old canonical-only feed painted all four
  state.hidden=true;projection.refresh();                           // Hide all drawings toggled: refresh must repaint the layer
  expect(applied.at(-1)).toEqual([]);expect(payloadIds()).toBe(0);
  state.hidden=false;state.resolution='1h';projection.refresh();    // resolution change brings the hourly-only row in
  expect(applied.at(-1)).toEqual(['c1','t-all','t-hourly']);expect(payloadIds()).toBe(3);
  expect(applied.length).toBe(3);
 });
 it('canonical visible:false still hides, and an omitted visible set keeps the canonical-only behavior',()=>{
  const rows=[marked('a',{visible:false}),marked('b')];
  expect(dwb3ShapePayload(rows).rows).toHaveLength(1);
  expect(dwb3ShapePayload(rows,new Set(['a','b'])).rows).toHaveLength(1);
  expect(dwb3ShapePayload(rows,new Set(['a'])).rows).toHaveLength(0);
 });
});

describe('fix 3: consumer flags belong to one chart',()=>{
 const fieldPaths=(set:ReturnType<typeof createDrawingFieldConsumerSet>)=>drawingEditor(seededChannel('c1') as never,[],undefined,{consumers:set}).fields.map(field=>field.path).filter(path=>path.startsWith('props.lvChannel'));
 it('one chart turning its flags on does not change another chart editor; dispose clears only its own',()=>{
  const a=createDrawingFieldConsumerSet(),b=createDrawingFieldConsumerSet();
  try{
   for(const name of ['channel.levels','channel.extend','channel.background'])a.set(name,true);
   expect(fieldPaths(a).length).toBeGreaterThan(0);expect(fieldPaths(b)).toEqual([]);
   b.set('channel.extend',true);expect(fieldPaths(b).length).toBeGreaterThan(0);expect(fieldPaths(b).length).toBeLessThan(fieldPaths(a).length);
   a.dispose();expect(a.names()).toEqual([]);expect(fieldPaths(b).length).toBeGreaterThan(0);
   expect(()=>b.set('nope.field')).toThrow('Unknown drawing field consumer');
  }finally{a.dispose();b.dispose();}
 });
});

describe('fix 6: the indicator hide overlay reaches the render seam',()=>{
 const settings=():IndicatorInstanceSettings=>({id:'i1',kind:'sma',inputs:{...indicatorDefaults.sma},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('sma')});
 const bars=Array.from({length:40},(_,i)=>({time:1700000000+i*60,open:10+i,high:12+i,low:9+i,close:11+i,volume:i+1}));
 it('hideOverlay empties native output without touching settings or numbers; absent overlay is unchanged',()=>{
  const row=settings(),result=calculateIndicator('sma',bars,row.inputs),before=structuredClone(result),stored=structuredClone(row);
  const shown=renderIndicatorPresentation(row,result,bars,indicatorContextWithOverlay('1D',{indicatorsHidden:false}));
  expect(shown.output.series!.length).toBeGreaterThan(0);
  expect(indicatorContextWithOverlay('1D',undefined)).toEqual({resolution:'1D'});
  const hidden=renderIndicatorPresentation(row,result,bars,indicatorContextWithOverlay('1D',{indicatorsHidden:true}));
  expect(hidden.output).toEqual({series:[],fills:[],priceLines:[]});expect(hidden.display).toEqual([]);
  expect(row).toEqual(stored);expect(result).toEqual(before);
  expect(renderIndicatorPresentation(row,result,bars,{resolution:'1D'})).toEqual(shown);
 });
 it('rejects a malformed overlay flag and unknown context members',()=>{
  const row=settings(),result=calculateIndicator('sma',bars,row.inputs);
  expect(()=>renderIndicatorPresentation(row,result,bars,{resolution:'1D',hideOverlay:'yes'} as never)).toThrow('exact bounded declared resolution');
  expect(()=>renderIndicatorPresentation(row,result,bars,{resolution:'1D',extra:1} as never)).toThrow('exact bounded declared resolution');
 });
});
void dwbBars;
