import {describe,expect,it} from 'vitest';
import {drawingMoveTargets,moveDrawingRows,commitDrawingPaneMove} from '../../src/chart/drawing-pane-move';
import {forexPipSize} from '../../src/domain/pip-size';
import {calculateChangeInPips} from '../../src/domain/trendline-statistics';
import {validateTrendlineMarkers} from '../../src/chart/trendline-stats-data';
import {defaultDrawingUtility,hideMenu,selectHideMode,toggleHide,hideActive,positionsHidden,validateDrawingUtility} from '../../src/chart/drawing-utility-state';

describe(' Move to pane (.OBJECT.MOVE_TO_PANE)',()=>{
 it('offers the adjacent existing panes only',()=>{
  expect(drawingMoveTargets(['price','p1','p2'],'price')).toEqual({above:null,below:'p1'});
  expect(drawingMoveTargets(['price','p1','p2'],'p1')).toEqual({above:'price',below:'p2'});
  expect(drawingMoveTargets(['price'],'price')).toEqual({above:null,below:null});
  expect(drawingMoveTargets(['price'],'gone')).toEqual({above:null,below:null});
 });
 it('moves pane and binding, keeps anchors, refuses locked or unknown rows, rolls back on failure',()=>{
  const doc={version:1,drawings:[{id:'a',type:'hline',paneId:'price',anchors:[{time:1,price:5}],lvPaneOwners:[{kind:'built',id:'x'}]},{id:'b',type:'hline',paneId:'price',locked:true,anchors:[]}]};
  const binding={schemaVersion:1 as const,target:{kind:'owners' as const,owners:[{kind:'built' as const,id:'rsi'}]}};
  const moved=moveDrawingRows(doc,['a'],'p1',binding);
  expect((moved.drawings as Record<string,unknown>[])[0]).toEqual({id:'a',type:'hline',paneId:'p1',anchors:[{time:1,price:5}],lvPaneBinding:binding});
  expect(()=>moveDrawingRows(doc,['b'],'p1',binding)).toThrow(/Unlock/);expect(()=>moveDrawingRows(doc,['zz'],'p1',binding)).toThrow();
  let stored:Record<string,unknown>=doc,notified=0,fail=true;
  expect(()=>commitDrawingPaneMove({read:()=>stored,write:next=>{stored=next;},project:()=>{if(fail){fail=false;throw Error('x');}},notify:()=>notified++},['a'],'p1',binding)).toThrow('x');
  expect(stored).toBe(doc);expect(notified).toBe(0);
  expect(commitDrawingPaneMove({read:()=>stored,write:next=>{stored=next;},project:()=>{},notify:()=>notified++},['a'],'p1',binding)).toBe(true);expect(notified).toBe(1);
 });
});
describe(' Change in pips (.TREND.TRENDLINE.CHANGE_IN_PIPS_STATS)',()=>{
 it('derives forex pip sizes only',()=>{
  expect(forexPipSize({symbol:'EURUSD',assetClass:'forex'})).toBe(0.0001);expect(forexPipSize({symbol:'FX:USDJPY',assetClass:'forex'})).toBe(0.01);
  expect(forexPipSize({symbol:'EUR/USD',assetClass:'forex'})).toBe(0.0001);expect(forexPipSize({symbol:'GME',assetClass:'stock'})).toBeNull();expect(forexPipSize(null)).toBeNull();
  const pips=calculateChangeInPips([{time:0,price:1.1},{time:1,price:1.1025}],0.0001);expect(pips.state).toBe('available');if(pips.state==='available')expect(pips.value).toBeCloseTo(25,6);
 });
 it('the markers member takes an optional pips flag; five-key members still read',()=>{
  const base={schemaVersion:1,middlePoint:false,priceLabels:false,distance:false,angle:false};
  expect(validateTrendlineMarkers(base)).toEqual(base);expect(validateTrendlineMarkers({...base,pips:true})).toEqual({...base,pips:true});
  expect(()=>validateTrendlineMarkers({...base,pips:'yes'})).toThrow();expect(()=>validateTrendlineMarkers({...base,other:true})).toThrow();
 });
});
describe(' Hide positions and orders (.UTILITY.HIDE_POSITIONS_AND_ORDERS)',()=>{
 it('is a hide mode of its own; Hide all includes it; the field is additive',()=>{
  const u=defaultDrawingUtility();expect(hideMenu(u).map(row=>row.id)).toEqual(['hide-drawings','hide-indicators','hide-positions','hide-all']);
  const p=selectHideMode(u,'positions');expect(positionsHidden(p)).toBe(true);expect(p.drawingsHidden).toBe(false);expect(hideActive(p)).toBe(true);
  expect(positionsHidden(toggleHide(p))).toBe(false);
  const all=selectHideMode(u,'all');expect([all.drawingsHidden,all.indicatorsHidden,positionsHidden(all)]).toEqual([true,true,true]);
  expect(validateDrawingUtility(u)).toEqual(u);expect(validateDrawingUtility(p)).toEqual(p);expect(()=>validateDrawingUtility({...u,positionsHidden:1})).toThrow();
 });
});
