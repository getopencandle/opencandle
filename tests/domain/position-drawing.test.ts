import {describe,expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {isPositionDrawing,LV_SHORT_POSITION_TYPE,POSITION_DRAWING_TYPES} from '../../src/domain/position-drawing';
import {capturePositionDrawing,type AlertPositionLevels} from '../../src/domain/alert-position';
import {followPositionDrawings} from '../../src/domain/alert-position-follow';
import {createLocalAlert,type AlertDefinition} from '../../src/domain/alerts';
import {LV_SHORT_POSITION} from '../../src/chart/lv-drawing-types';
import {coordinateAxes} from '../../src/chart/drawing-coordinates';
import {drawingEditor,patchDrawingCoordinates} from '../../src/chart/drawing-port';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';

// SYNTHETIC Long/Short fixtures. The Short position tool (lvshortposition) must behave exactly like the
// native position tool wherever OpenCandle reads position drawings.
const instrument={id:'SYNTHETIC:GME',symbol:'GME',currency:'USD'};
const record=(type:string,id:string,entry:number,stop:number,target:number)=>({id,type,paneId:'price',anchors:[{time:1_700_000_000_000,price:entry},{time:1_700_086_400_000,price:stop},{time:1_700_086_400_000,price:target}],style:{lineColor:'#38c0fd',lineWidth:1,lineStyle:'solid'},props:{riskPercent:1,accountBalance:10000}});
const definition=(position:AlertPositionLevels):AlertDefinition=>({id:`alert-${position.drawingId}`,instrumentId:instrument.id,sourceId:'close',name:'SYNTHETIC position',message:'SYNTHETIC plan',condition:{kind:'position',position},frequency:'every-time',createdAt:100,expiresAt:null,mode:'ordinary',runId:'ordinary'});

describe('isPositionDrawing: one helper for the native and the Short position tool',()=>{
 it('recognizes exactly the two position types and matches the registered OpenCandle id',()=>{
  expect(POSITION_DRAWING_TYPES).toEqual(['position','lvshortposition']);expect(LV_SHORT_POSITION_TYPE).toBe(LV_SHORT_POSITION);
  for(const type of ['position','lvshortposition'])expect(isPositionDrawing(type)).toBe(true);
  for(const type of ['datepricerange','lvpricerange','Position',' position',undefined,null,3])expect(isPositionDrawing(type)).toBe(false);
 });
 it('position alerts capture a Short position drawing with the same levels and quantity as a native one',()=>{
  const native=capturePositionDrawing(record('position','p1',100,104,92),instrument),short=capturePositionDrawing(record(LV_SHORT_POSITION,'p1',100,104,92),instrument);
  expect(short).toEqual(native);expect(short).toEqual({ok:true,position:{schemaVersion:1,drawingId:'p1',side:'short',entry:100,target:92,stop:104,quantity:25,ticker:'GME',currency:'USD'}});
  expect(capturePositionDrawing(record('lvpricerange','p1',100,104,92),instrument)).toMatchObject({ok:false});
 });
 it('alert follow restarts a position alert when its Short position drawing moves',()=>{
  const captured=capturePositionDrawing(record(LV_SHORT_POSITION,'s1',100,104,92),instrument);if(!captured.ok)throw Error(captured.diagnostics.join(' '));
  const alerts=[createLocalAlert(definition(captured.position))],context={chartId:undefined,instrument};
  expect(followPositionDrawings(alerts,[record(LV_SHORT_POSITION,'s1',100,104,92)],context,300).restarted).toEqual([]);
  const moved=followPositionDrawings(alerts,[record(LV_SHORT_POSITION,'s1',100,104,90)],context,300);
  expect(moved.restarted).toEqual(['alert-s1']);expect(moved.alerts[0]!.definition.condition.position).toMatchObject({side:'short',target:90});
 });
 it('the alert source catalog offers a Short position drawing as a Long/Short position source, like a native one',()=>{
  // Minimal committed chart host (same shape as tests/domain/technical-alert-ui-contract.test.ts host()).
  const dataset=fixtureDataset('GME',500);dataset.bars=[8,9,10].map((value,index)=>({time:1704153600+index*86400,open:value,high:value+1,low:value-1,close:value,volume:100}));const bars=dataset.bars,source=sourceContextForDataset(dataset,bars);
  const drawings=[record(LV_SHORT_POSITION,'s1',10,12,6),record('position','p1',8,6,12)];
  const controller={getSourceContext:()=>source,getStyle:()=>'candles',getDataWindow:()=>({pending:false,source,series:{count:bars.length,firstTime:bars[0]!.time,lastTime:bars.at(-1)!.time,style:'candles'}}),indicators:{serialize:()=>[]},drawingCatalog:()=>[{type:LV_SHORT_POSITION,label:'Short position'}],saveDrawings:()=>({version:1,drawings:structuredClone(drawings)}),getChartOptions:()=>({scale:'linear'})} as unknown as ChartController;
  let id=0;const choices=new TechnicalAlertCatalog(()=>String(++id)).capture(controller,dataset,bars,[]);
  const short=choices.find(row=>row.id==='position:s1'),native=choices.find(row=>row.id==='position:p1');
  expect(short?.label?.startsWith('Short position: Short entry 10')).toBe(true);expect(short?.label).not.toContain('[s1]');expect(short?.position).toMatchObject({side:'short',entry:10,stop:12,target:6,drawingId:'s1'});
  expect(native?.position).toMatchObject({side:'long',drawingId:'p1'});expect(choices.find(row=>row.id==='drawing:s1')).toBeUndefined();
 });
 it('coordinate editing: entry, stop and target are editable and a single price edit keeps the sides opposite',()=>{
  for(const index of [0,1,2])expect(coordinateAxes(LV_SHORT_POSITION,index)).toEqual(coordinateAxes('position',index));expect(coordinateAxes(LV_SHORT_POSITION,3)).toBeNull();
  const bars=[0,1,2,3].map(index=>({time:1_700_000_000+index*86_400,open:100,high:101,low:99,close:100,volume:1}));
  const doc=createDrawing(LV_SHORT_POSITION as any,{paneId:'price',anchors:[{time:1_700_000_000_000,price:100},{time:1_700_086_400_000,price:104},{time:1_700_086_400_000,price:92}]})!.serialize() as SerializedDrawing;
  const editor=drawingEditor(doc,bars as any);expect(editor.anchors.every(anchor=>anchor.editablePrice&&anchor.editableTime&&anchor.coordinateDiagnostic===null)).toBe(true);
  // Dragging the stop below the entry flips the target above it (native constrainHandleDrag), as for a native position.
  const nativeDoc={...structuredClone(doc),type:'position'} as SerializedDrawing;
  const edits=[{},{price:97},{}];
  const short=patchDrawingCoordinates(doc,bars as any,edits),native=patchDrawingCoordinates(nativeDoc,bars as any,edits);
  expect(short.anchors.map(anchor=>anchor.price)).toEqual(native.anchors.map(anchor=>anchor.price));expect(short.anchors.map(anchor=>anchor.price)).toEqual([100,97,108]);expect(short.type).toBe(LV_SHORT_POSITION);
 });
});
void vi;
