import {describe,expect,it,vi} from 'vitest';
import {describePosition,type AlertPositionLevels} from '../../src/domain/alert-position';
import {captureIndicatorAlertSource,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {alertSourceType,DEFAULT_ALERT_MANAGER_FILTER,filterAlertManagerAlerts} from '../../src/domain/alert-manager-view';
import {DELETED_ALERT_DRAWING_NOTE,invalidDrawingAlertNotes} from '../../src/domain/alert-drawing-status';
import type {AlertScalarSource,AlertSourceSnapshot} from '../../src/domain/alert-observation';
import type {LocalAlert} from '../../src/domain/alerts';
import {dockAlertType,dockListRows} from '../../src/ui/alerts-dock-model';

// SYNTHETIC view fixtures. These checks do not assert source validation, renderer execution or packaged GUI evidence.
const position:AlertPositionLevels={schemaVersion:1,drawingId:'SYNTHETIC-private-drawing',side:'long',entry:100,target:110,stop:95,quantity:20,ticker:'SYN',currency:'USD'};
const line:AlertScalarSource={kind:'drawing',instanceId:'SYNTHETIC-private-line',snapshotId:'SYNTHETIC-line-snapshot',tool:'trendline',anchors:[{time:1704153600,price:10},{time:1704240000,price:11}],settings:{},evaluation:'signed-price-distance',coordinateModel:'linear-time-price'};
const price:AlertScalarSource={kind:'price',field:'close',transformId:'standard'};
function saved(id:string,source?:AlertSourceSnapshot,drawId?:string,instrumentId='SYNTHETIC:ONE'):LocalAlert{
 return {definition:{id,name:'SYNTHETIC alert',message:'SYNTHETIC',instrumentId,sourceId:'close',mode:'ordinary',runId:'ordinary',condition:drawId?{kind:'position',position:{...position,drawingId:drawId}}:{kind:'greater',value:0},frequency:'every-time',createdAt:100,expiresAt:null,...(source?{observationBinding:{source}}:{})},status:'active',revision:1,history:[],lastTriggeredAt:null} as unknown as LocalAlert;
}

describe('readable saved alert descriptions',()=>{
 it('preserves every position level while hiding the internal drawing id',()=>{
  expect(describePosition(position)).toBe('Long entry 100, take profit 110, stop loss 95, quantity 20');
  expect(describePosition({...position,side:'short'}).startsWith('Short entry 100')).toBe(true);
 });
 it('keeps indicator plots and transforms and omits instance ids from saved source labels',()=>{
  const source=captureIndicatorAlertSource({id:'SYNTHETIC-private-indicator',kind:'sma',inputs:{length:2,source:'close'},plots:{},offset:0,visible:true},'sma','standard','SYNTHETIC-snapshot');
  expect(technicalSourceLabel(source)).toBe('SMA / sma (standard)');
  expect(technicalSourceLabel(line)).toBe('trendline');
  expect(technicalSourceLabel({kind:'comparison',snapshotId:'SYNTHETIC-comparison',left:price,right:line})).toBe('CLOSE (standard) compared with trendline');
  expect(source.instanceId).toBe('SYNTHETIC-private-indicator');
 });
 it.each(['left','right'] as const)('classifies a comparison with a drawing on the %s as Drawing in the manager and dock',side=>{
  const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'SYNTHETIC-comparison',left:side==='left'?line:price,right:side==='right'?line:price};
  const alert=saved('SYNTHETIC-alert',source);
  expect(alertSourceType(source)).toBe('drawing');expect(dockAlertType(alert)).toBe('drawing');
  expect(filterAlertManagerAlerts([alert],{...DEFAULT_ALERT_MANAGER_FILTER,sourceType:'drawing'})).toEqual([alert]);
  expect(filterAlertManagerAlerts([alert],{...DEFAULT_ALERT_MANAGER_FILTER,sourceType:'comparison'})).toEqual([]);
 });
 it('keeps comparisons of price sources in Comparison',()=>{
  expect(alertSourceType({kind:'comparison',snapshotId:'SYNTHETIC-price-pair',left:price,right:{kind:'price',field:'open',transformId:'standard'}})).toBe('comparison');
 });
 it('keeps script alerts renderable through the shared type classifier',()=>{
  const source:AlertSourceSnapshot={kind:'script',instanceId:'SYNTHETIC-script',snapshotId:'SYNTHETIC-script-snapshot',title:'SYNTHETIC study',source:'function onBar(ctx) { ctx.plot("SYNTHETIC", ctx.close); }',inputs:{},output:'plot',outputId:'SYNTHETIC',transformId:'standard'};
  const alert=saved('SYNTHETIC-script-alert',source);
  expect(alertSourceType(source)).toBe('indicator');expect(dockAlertType(alert)).toBe('indicator');
  expect(dockListRows([alert],{activeInstrumentId:'SYNTHETIC:ONE',unwatched:new Map(),formatTime:String})[0].type).toBe('Indicator');
 });
});

describe('missing drawing display follows current documents without changing saved lifecycle',()=>{
 it('marks either missing comparison operand, reads each symbol once and leaves ordinary price alerts alone',()=>{
  const source:AlertSourceSnapshot={kind:'comparison',snapshotId:'SYNTHETIC-pair',left:line,right:{...line,instanceId:'SYNTHETIC-other-line'}};
  const alerts=[saved('SYNTHETIC-pair-alert',source),saved('SYNTHETIC-position',undefined,position.drawingId),saved('SYNTHETIC-price',price)];
  const before=structuredClone(alerts),reader=vi.fn(()=>[{id:line.instanceId}]);
  const notes=invalidDrawingAlertNotes(alerts,reader);
  expect([...notes]).toEqual([['SYNTHETIC-pair-alert',DELETED_ALERT_DRAWING_NOTE],['SYNTHETIC-position',DELETED_ALERT_DRAWING_NOTE]]);
  expect(reader).toHaveBeenCalledTimes(1);expect(alerts).toEqual(before);
 });
 it('returns to the saved status on Undo, invalidates on Redo and refreshes after layout restore',()=>{
  const alert=saved('SYNTHETIC-position',undefined,position.drawingId),before=structuredClone(alert);
  let rows:unknown[]=[];
  const read=()=>rows;
  const removed=invalidDrawingAlertNotes([alert],read);
  expect(removed.get(alert.definition.id)).toBe(DELETED_ALERT_DRAWING_NOTE);
  rows=[{id:position.drawingId}];const undone=invalidDrawingAlertNotes([alert],read,removed);expect(undone.size).toBe(0);
  rows=[];const redone=invalidDrawingAlertNotes([alert],read,undone);expect(redone.get(alert.definition.id)).toBe(DELETED_ALERT_DRAWING_NOTE);
  rows=[{id:position.drawingId}];const restored=invalidDrawingAlertNotes([alert],read,redone);expect(restored.size).toBe(0);
  expect(invalidDrawingAlertNotes([alert],read,restored)).toBe(restored);expect(alert).toEqual(before);
 });
 it('does not label an unavailable reader or another symbol as a deleted drawing',()=>{
  const alerts=[saved('SYNTHETIC-a',undefined,'SYNTHETIC-drawing','SYNTHETIC:A'),saved('SYNTHETIC-b',undefined,'SYNTHETIC-drawing','SYNTHETIC:B')];
  expect([...invalidDrawingAlertNotes(alerts,symbol=>symbol==='SYNTHETIC:A'?[{id:'SYNTHETIC-drawing'}]:[]).keys()]).toEqual(['SYNTHETIC-b']);
  expect(invalidDrawingAlertNotes(alerts,()=>undefined).size).toBe(0);
  expect(invalidDrawingAlertNotes(alerts,()=>{throw Error('SYNTHETIC unavailable');}).size).toBe(0);
 });
 it('makes Invalid visible in the dock and restores Active without mutating the alert',()=>{
  const alert=saved('SYNTHETIC-position',undefined,position.drawingId),options={activeInstrumentId:'SYNTHETIC:ONE',unwatched:new Map([[alert.definition.id,'SYNTHETIC background note']]),formatTime:String};
  const invalidDrawings=invalidDrawingAlertNotes([alert],()=>[]);
  expect(dockListRows([alert],{...options,invalidDrawings})[0]).toMatchObject({status:'Invalid',note:DELETED_ALERT_DRAWING_NOTE});
  expect(dockListRows([alert],{...options,invalidDrawings:new Map()})[0]).toMatchObject({status:'Active',note:'SYNTHETIC background note'});
  expect(alert.status).toBe('active');
 });
});
