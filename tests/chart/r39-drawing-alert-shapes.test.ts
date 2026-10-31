import {describe,expect,it} from 'vitest';
import {prepareDrawingAlertGrid,prepareDrawingBoundaryGrid,validateDrawingBoundarySnapshot,evaluateDrawingBoundary} from '../../src/chart/drawing-alert-geometry';
import {evaluateDrawingAlertShape,validateDrawingAlertShape,drawingAlertKey,drawingAlertName,type DrawingAlertShapeSnapshot} from '../../src/chart/drawing-alert-shapes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';

// Version 2 drawing alert geometry. SYNTHETIC rows and drawings only.
const day=1704153600;
const data=fixtureDataset('GME',500);data.bars=[10,11,12,13,14,15].map((value,index)=>({time:day+index*86400,open:value,high:value+1,low:value-1,close:value,volume:100}));
const t=(index:number)=>(day+index*86400)*1000;
function grid(scale='linear'){const prepared=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:scale as never});if(!prepared.ok)throw new Error(prepared.diagnostics.join(' '));return prepared.grid;}
function shape(record:Record<string,unknown>,scale='linear'):DrawingAlertShapeSnapshot{const captured=grid(scale).captureShape({id:'d1',paneId:'price',...record});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));return captured.snapshot;}
const channel=(snapshot:DrawingAlertShapeSnapshot,x:number)=>{const value=evaluateDrawingAlertShape(snapshot,x);return value.ok&&value.shape==='channel'?[value.lower,value.upper]:null;};

describe('channels',()=>{
 it('a parallel channel is its base line and the base line shifted by the third anchor, over the base span',()=>{
  const snapshot=shape({type:'parallelchannel',anchors:[{time:t(1),price:10},{time:t(3),price:14},{time:t(2),price:17}]});
  expect(snapshot.shape).toBe('channel');expect(snapshot.name).toBe('Parallel channel');
  expect(channel(snapshot,2)).toEqual([12,17]);expect(channel(snapshot,1)).toEqual([10,15]);
  expect(channel(snapshot,4)).toBeNull();expect(channel(snapshot,0.5)).toBeNull();
  const extended=shape({type:'parallelchannel',anchors:[{time:t(1),price:10},{time:t(3),price:14},{time:t(2),price:17}],props:{lvChannel:{schemaVersion:1,levels:[0.5,0.25,0.75,1.25].map(ratio=>({enabled:false,ratio,color:'#38c0fd',opacity:100,width:1,style:'dashed'})),extendLeft:false,extendRight:true,background:{enabled:true,color:'#38c0fd',opacity:10}}}});
  expect(channel(extended,5)).toEqual([18,23]);expect(channel(extended,0)).toBeNull();
 });
 it('a rectangle is its two prices over its time span, extended when its Extend settings say so',()=>{
  const box=shape({type:'box',anchors:[{time:t(4),price:20},{time:t(1),price:12}]});
  expect(channel(box,2.5)).toEqual([12,20]);expect(channel(box,0)).toBeNull();expect(channel(box,5)).toBeNull();
  const right=shape({type:'box',anchors:[{time:t(1),price:20},{time:t(2),price:12}],props:{lvBoxExtend:{schemaVersion:1,left:false,right:true}}});
  expect(channel(right,5)).toEqual([12,20]);
  expect(grid().captureShape({id:'b',type:'box',anchors:[{time:t(1),price:20},{time:t(1),price:12}]}).ok).toBe(false);
 });
 it('flat top/bottom and disjoint channels follow the renderer: a flat side, and the overlap of two lines',()=>{
  const flat=shape({type:'flattopbottom',anchors:[{time:t(0),price:10},{time:t(4),price:14},{time:t(2),price:20}]});
  expect(channel(flat,2)).toEqual([12,20]);
  const disjoint=shape({type:'disjointchannel',anchors:[{time:t(0),price:20},{time:t(4),price:24},{time:t(2),price:10},{time:t(5),price:13}]});
  expect(channel(disjoint,3)).toEqual([11,23]);expect(channel(disjoint,1)).toBeNull();expect(channel(disjoint,5)).toBeNull();
  expect(grid().captureShape({id:'x',type:'disjointchannel',anchors:[{time:t(0),price:20},{time:t(1),price:24},{time:t(3),price:10},{time:t(5),price:13}]}).ok).toBe(false);
 });
 it('a pitchfork channel runs between its two tines, parallel to the median, from the later tine anchor on',()=>{
  const fork=shape({type:'pitchfork',anchors:[{time:t(0),price:10},{time:t(2),price:16},{time:t(2),price:12}]});
  // median from (0,10) through (2,14): slope 2 per bar; tines through (2,16) and (2,12)
  expect(channel(fork,4)).toEqual([16,20]);expect(channel(fork,1)).toBeNull();
  const schiff=shape({type:'schiffpitchfork',anchors:[{time:t(0),price:10},{time:t(2),price:16},{time:t(2),price:12}]});
  // median origin (0,13) through (2,14): slope 0.5
  expect(channel(schiff,4)).toEqual([13,17]);
  const inside=shape({type:'insidepitchfork',anchors:[{time:t(0),price:10},{time:t(2),price:16},{time:t(4),price:12}]});
  // direction = (4,12) - (1,13): dx 3, dy -1; tines start at x 2 and 4, the channel from 4
  const at=channel(inside,5)!;expect(at[0]).toBeCloseTo(11.666666,5);expect(at[1]).toBeCloseTo(15,5);
  expect(grid().captureShape({id:'v',type:'pitchfork',anchors:[{time:t(2),price:10},{time:t(1),price:16},{time:t(3),price:12}]}).ok).toBe(false);
 });
});

describe('lines, the vertical line and the log scale',()=>{
 it('trend angle and info line are segments; extension flags apply',()=>{
  const angle=shape({type:'trendangle',anchors:[{time:t(0),price:10},{time:t(2),price:14}]});
  expect(evaluateDrawingAlertShape(angle,1)).toEqual({ok:true,shape:'line',price:12});/* The alert follows the segment's line past its end */expect(evaluateDrawingAlertShape(angle,3)).toEqual({ok:true,shape:'line',price:16});
  const info=shape({type:'infoline',anchors:[{time:t(0),price:10},{time:t(2),price:14}],style:{extendRight:true}});
  expect(evaluateDrawingAlertShape(info,3)).toEqual({ok:true,shape:'line',price:16});
  expect(evaluateDrawingBoundary(info,3)).toEqual({ok:true,boundaryPrice:16});
 });
 it('a horizontal line needs no anchor on the grid; a vertical line keeps its time, even beyond the loaded bars',()=>{
  const flat=shape({type:'hline',anchors:[{time:t(40),price:9}]});expect(flat.anchors).toEqual([]);expect(evaluateDrawingAlertShape(flat,-5)).toEqual({ok:true,shape:'line',price:9});
  const vertical=shape({type:'vline',anchors:[{time:t(9),price:1}]});
  expect(vertical.shape).toBe('time');expect(vertical.coordinateModel).toBe('time');expect(vertical.lineTime).toBe(day+9*86400);expect(vertical.name).toBe('Vertical line');
  expect(evaluateDrawingBoundary(vertical,1).ok).toBe(false);
 });
 it('on a logarithmic scale a trend line is straight in log price, while version 1 still refuses it',()=>{
  const line=shape({type:'trendline',anchors:[{time:t(0),price:10},{time:t(2),price:40}]},'logarithmic');
  expect(line.coordinateModel).toBe('logical-bar-log-price');
  const middle=evaluateDrawingAlertShape(line,1);expect(middle.ok&&middle.shape==='line'&&middle.price).toBeCloseTo(20,9);
  const v1=prepareDrawingBoundaryGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'logarithmic'});expect(v1.ok).toBe(false);
  expect(grid('logarithmic').capture({id:'old',type:'trendline',paneId:'price',anchors:[{time:t(0),price:10},{time:t(2),price:40}]}).ok).toBe(false);
  expect(grid('logarithmic').captureShape({id:'neg',type:'trendline',anchors:[{time:t(0),price:-1},{time:t(2),price:40}]}).ok).toBe(false);
 });
 it('an anchor after the last bar sits where the chart paints it (median bar interval); before the first bar stays unavailable',()=>{
  const line=shape({type:'trendline',anchors:[{time:t(4),price:10},{time:t(8),price:18}]});
  expect(line.anchors.map(anchor=>anchor.logical)).toEqual([4,8]);expect(evaluateDrawingAlertShape(line,5)).toEqual({ok:true,shape:'line',price:12});
  expect(grid().captureShape({id:'early',type:'trendline',anchors:[{time:t(-2),price:10},{time:t(2),price:18}]}).ok).toBe(false);
 });
 it('a regression trend and other drawings say why they have no alert',()=>{
  const regression=grid().captureShape({id:'r',type:'regressionchannel',anchors:[{time:t(0),price:1},{time:t(2),price:2}]});expect(regression.ok).toBe(false);if(!regression.ok)expect(regression.diagnostics.join()).toMatch(/Regression trend/);
  expect(grid().captureShape({id:'a',type:'brush',anchors:[{time:t(0),price:1},{time:t(2),price:2}]}).ok).toBe(false);
  expect(grid().captureShape({id:'s',type:'trendline',paneId:'secondary',anchors:[{time:t(0),price:1},{time:t(2),price:2}]}).ok).toBe(false);
 });
});

describe('names, keys and saved geometry',()=>{
 it('names a drawing by its own name, else the tool name; never by id',()=>{
  expect(drawingAlertName({id:'x9',type:'parallelchannel'})).toBe('Parallel channel');
  expect(drawingAlertName({id:'x9',type:'trendline',lvName:'  Support  '})).toBe('Support');
  expect(shape({type:'box',lvName:'Range',anchors:[{time:t(1),price:20},{time:t(2),price:12}]}).name).toBe('Range');
 });
 it('the drawing key changes with geometry, not with colour or lock',()=>{
  const base={id:'k',type:'trendline',anchors:[{time:t(0),price:10},{time:t(2),price:14}],style:{lineColor:'#fff'}};
  expect(drawingAlertKey({...base,style:{lineColor:'#000'},locked:true})).toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,anchors:[{time:t(0),price:10},{time:t(2),price:15}]})).not.toBe(drawingAlertKey(base));
  expect(drawingAlertKey({...base,style:{extendRight:true}})).not.toBe(drawingAlertKey(base));
 });
 it('validates a saved snapshot after JSON, and refuses a forged or reshaped one',()=>{
  const snapshot=shape({type:'parallelchannel',anchors:[{time:t(1),price:10},{time:t(3),price:14},{time:t(2),price:17}]});
  const saved=JSON.parse(JSON.stringify(snapshot));expect(validateDrawingBoundarySnapshot(saved)).toEqual(snapshot);expect(validateDrawingAlertShape(saved)).toEqual(snapshot);
  for(const patch of [{geometryFingerprint:'forged'},{shape:'line'},{lines:[]},{name:''},{lineTime:5},{extra:true},{coordinateModel:'time'}])expect(()=>validateDrawingBoundarySnapshot({...JSON.parse(JSON.stringify(snapshot)),...patch})).toThrow();
  const moved=JSON.parse(JSON.stringify(snapshot));moved.lines[1].from.price=99;expect(()=>validateDrawingAlertShape(moved)).toThrow(/fingerprint/);
 });
});
