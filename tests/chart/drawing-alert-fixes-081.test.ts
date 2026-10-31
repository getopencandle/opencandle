// OpenCandle 0.8.1: drawing alerts follow the same picture as the drawings (directed rays and pitchfork tines, bar-space
// pitchfork midpoints, log-parallel channels). SYNTHETIC rows and drawings only.
import {describe,expect,it} from 'vitest';
import {prepareDrawingAlertGrid,captureDrawingBoundary} from '../../src/chart/drawing-alert-geometry';
import {evaluateDrawingAlertShape,type DrawingAlertShapeSnapshot} from '../../src/chart/drawing-alert-shapes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';

const day=1704153600;
const data=fixtureDataset('GME',500);data.bars=Array.from({length:12},(_,index)=>{const value=10+index;return{time:day+index*86400,open:value,high:value+1,low:value-1,close:value,volume:100};});
const t=(index:number)=>(day+index*86400)*1000;
function shape(record:Record<string,unknown>,scale='linear'):DrawingAlertShapeSnapshot{
 const prepared=prepareDrawingAlertGrid(data.bars,{source:sourceContextForDataset(data),style:'candles',scale:scale as never});if(!prepared.ok)throw new Error(prepared.diagnostics.join(' '));
 const captured=prepared.grid.captureShape({id:'d1',paneId:'price',...record});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));return captured.snapshot;
}
const at=(snapshot:DrawingAlertShapeSnapshot,x:number)=>{const v=evaluateDrawingAlertShape(snapshot,x);return v.ok?(v.shape==='line'?v.price:v.shape==='channel'?[v.lower,v.upper]:null):null;};

describe('rays',()=>{
 it('a ray drawn right to left alerts to the left of its first point, not to the right',()=>{
  const ray=shape({type:'ray',anchors:[{time:t(6),price:16},{time:t(4),price:14}]});
  expect(at(ray,2)).toBe(12);expect(at(ray,6)).toBe(16);expect(at(ray,7)).toBeNull();
  const forward=shape({type:'ray',anchors:[{time:t(4),price:14},{time:t(6),price:16}]});
  expect(at(forward,9)).toBe(19);expect(at(forward,3)).toBeNull();
 });
 it('the version 1 boundary of a leftward ray is unbounded on the left',()=>{
  const capture=captureDrawingBoundary({id:'r',type:'ray',paneId:'price',anchors:[{time:t(6),price:16},{time:t(4),price:14}]},data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'} as never);
  expect(capture.ok&&capture.snapshot.domain).toEqual({min:null,max:6});
 });
});

describe('pitchforks',()=>{
 it('a pitchfork drawn right to left alerts between its tines to the left',()=>{
  const fork=shape({type:'pitchfork',anchors:[{time:t(10),price:15},{time:t(8),price:18},{time:t(8),price:12}]});
  expect(at(fork,6)).toEqual([12,18]);expect(at(fork,9)).toBeNull();
 });
 it('Modified Schiff takes the bar midpoint of the pivot leg',()=>{
  // Pivot bar 2, P1 bar 6: the bar midpoint is bar 4 (whatever calendar gaps lie between).
  const fork=shape({type:'modifiedschiffpitchfork',anchors:[{time:t(2),price:10},{time:t(6),price:20},{time:t(6),price:12}]});
  // Median from (4, 15) to (6, 16): slope 0.5 per bar, so the tines rise 0.5 per bar from 12 and 20.
  expect(at(fork,8)).toEqual([13,21]);
 });
});

describe('parallel channel on a log scale',()=>{
 it('the upper line is the base line times one constant ratio (one log offset), at both ends',()=>{
  const snapshot=shape({type:'parallelchannel',anchors:[{time:t(1),price:10},{time:t(9),price:40},{time:t(5),price:40}]},'logarithmic');
  const left=at(snapshot,1) as number[],right=at(snapshot,9) as number[];
  expect(left[1]/left[0]).toBeCloseTo(2,9);expect(right[1]/right[0]).toBeCloseTo(2,9);
 });
 it('on a linear scale it is the price offset, as before',()=>{
  const snapshot=shape({type:'parallelchannel',anchors:[{time:t(1),price:10},{time:t(3),price:14},{time:t(2),price:17}]});
  expect(at(snapshot,2)).toEqual([12,17]);
 });
});
