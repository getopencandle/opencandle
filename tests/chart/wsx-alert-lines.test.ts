import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ALERT_LABEL_NAME_LIMIT,ALERT_LINE_FALLBACK,ALERT_LINES_LAYER,alertLineRows,type AlertLineCell,type AlertLineSettings} from '../../src/chart/alert-lines-data';
import {planAlertLines} from '../../src/chart/alert-lines-painter';
import {createLocalAlert} from '../../src/domain/alerts';
import {defaultChartSettingsDocument,restoreChartSettingsDocument} from '../../src/chart/chart-settings-document';
import type {AlertCondition,AlertDefinition,LocalAlert} from '../../src/domain/alerts';
// WSX phase 5: alert lines as a non-drawing overlay. Pure rows and a pure paint plan; no executable UI evidence.
const settings=(patch:Partial<AlertLineSettings>={}):AlertLineSettings=>({lines:{visible:true,color:null},activeOnly:true,...patch});
const cell:AlertLineCell={instrumentId:'SYNTHETIC:GME'};
const format=(value:number)=>value.toFixed(2);
function alert(id:string,condition:AlertCondition,patch:Partial<LocalAlert>={},definition:Record<string,unknown>={}):LocalAlert{
 const made=createLocalAlert({id,instrumentId:'SYNTHETIC:GME',sourceId:'close',name:'Alert '+id,message:'m',condition,frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'ordinary',...definition} as AlertDefinition);
 return{...made,...patch} as LocalAlert;
}
const rows=(alerts:LocalAlert[],patch:Partial<AlertLineSettings>={},target=cell)=>alertLineRows({alerts,cell:target,settings:settings(patch),format});
describe('WSX alert line rows',()=>{
 it('draws one line per single-value price alert',()=>{
  for(const kind of ['crossing','crossing-up','crossing-down','greater','less'] as const){
   const result=rows([alert(kind,{kind,value:101.5})]);expect(result).toHaveLength(1);expect(result[0]).toMatchObject({price:101.5,alertId:kind,dashed:false,triggered:false});
  }
 });
 it('draws two lines for inside, outside, entering and exiting, lower then upper',()=>{
  for(const kind of ['inside','outside','entering','exiting'] as const){
   const result=rows([alert(kind,{kind,lower:90,upper:110})]);expect(result.map(row=>row.price)).toEqual([90,110]);expect(result.map(row=>row.slot)).toEqual(['lower','upper']);
  }
 });
 it('draws nothing for moving-up, moving-down and position alerts',()=>{
  expect(rows([alert('up',{kind:'moving-up',amount:1,bars:3}),alert('down',{kind:'moving-down',amount:1,bars:3})])).toEqual([]);
  expect(rows([{...alert('pos',{kind:'crossing',value:5}),definition:{...alert('pos',{kind:'crossing',value:5}).definition,condition:{kind:'position',position:{}}}} as never])).toEqual([]);
 });
 it('draws nothing for indicator, drawing, drawing-boundary and comparison sources',()=>{
  const binding=(source:Record<string,unknown>)=>({schemaVersion:1,datasetKey:JSON.stringify(['SYNTHETIC:GME']),sessionId:'s',replayRunId:null,fixture:true,completionPolicy:'unknown',source});
  for(const source of [{kind:'indicator',instanceId:'i'},{kind:'drawing',instanceId:'d'},{kind:'drawing-boundary',instanceId:'b'},{kind:'comparison',snapshotId:'c'}]){
   const base=alert('x',{kind:'crossing',value:50});const item={...base,definition:{...base.definition,observationBinding:binding(source)}} as LocalAlert;expect(rows([item])).toEqual([]);
  }
 });
 it('draws a price-source observation binding for the cell dataset and skips one for another dataset',()=>{
  const key=JSON.stringify(['SYNTHETIC:GME']);const base=alert('p',{kind:'crossing',value:50});
  const bound={...base,definition:{...base.definition,observationBinding:{schemaVersion:1,datasetKey:key,sessionId:'s',replayRunId:null,fixture:true,completionPolicy:'unknown',source:{kind:'price',field:'close'}}}} as LocalAlert;
  expect(rows([bound],{},{instrumentId:'SYNTHETIC:GME',datasetKey:key})).toHaveLength(1);
  expect(rows([bound],{},{instrumentId:'SYNTHETIC:GME',datasetKey:JSON.stringify(['SYNTHETIC:OTHER'])})).toEqual([]);
  expect(rows([bound],{},{instrumentId:'SYNTHETIC:GME',datasetKey:[JSON.stringify(['SYNTHETIC:OTHER']),key]})).toHaveLength(1);
  expect(rows([bound],{},{instrumentId:'SYNTHETIC:GME',datasetKey:[JSON.stringify(['SYNTHETIC:OTHER'])]})).toEqual([]);
 });
 it('skips replay-mode alerts and alerts on another instrument',()=>{
  const replay=alert('r',{kind:'crossing',value:50});const replayItem={...replay,definition:{...replay.definition,mode:'replay',runId:'replay:1'}} as LocalAlert;
  expect(rows([replayItem])).toEqual([]);
  const other=alert('o',{kind:'crossing',value:50});expect(rows([{...other,definition:{...other.definition,instrumentId:'SYNTHETIC:SPY'}} as LocalAlert])).toEqual([]);
 });
 it('activeOnly hides paused, stopped, expired and waiting-for-data alerts; turning it off shows them',()=>{
  const statuses=['paused','stopped','expired','waiting-for-data'] as const;
  const list=[alert('a',{kind:'crossing',value:1}),...statuses.map(status=>alert(status,{kind:'crossing',value:2},{status}))];
  expect(rows(list).map(row=>row.alertId)).toEqual(['a']);
  expect(rows(list,{activeOnly:false}).map(row=>row.alertId)).toEqual(['a','paused','stopped','expired','waiting-for-data']);
 });
 it('a triggered active alert draws dashed with the triggered suffix; "triggered" means lastTriggeredAt is set',()=>{
  const fresh=rows([alert('t',{kind:'crossing',value:10})])[0];expect(fresh).toMatchObject({dashed:false,triggered:false});expect(fresh.label).not.toContain('triggered');
  const fired=rows([alert('t',{kind:'crossing',value:10},{lastTriggeredAt:123})])[0];expect(fired).toMatchObject({dashed:true,triggered:true});expect(fired.label.endsWith(' triggered')).toBe(true);
 });
 it('draws nothing when the chart setting hides alert lines',()=>{
  expect(rows([alert('v',{kind:'crossing',value:5})],{lines:{visible:false,color:null}})).toEqual([]);
 });
 it('uses the stored color, or null meaning the alert line token',()=>{
  expect(rows([alert('c',{kind:'crossing',value:5})])[0].color).toBeNull();
  expect(rows([alert('c',{kind:'crossing',value:5})],{lines:{visible:true,color:'#112233'}})[0].color).toBe('#112233');
  expect(ALERT_LINE_FALLBACK).toMatch(/^#[0-9a-f]{6}$/i);
 });
 it('labels show the price at series precision and the name truncated to 24 characters',()=>{
  expect(ALERT_LABEL_NAME_LIMIT).toBe(24);
  const short=rows([alert('s',{kind:'crossing',value:101.234567},{},{name:'Breakout'})])[0];expect(short.label).toBe('101.23  Breakout');
  const long=rows([alert('l',{kind:'crossing',value:5},{},{name:'A'.repeat(40)})])[0];expect(long.label).toBe('5.00  '+'A'.repeat(23)+'…');expect(long.label.length).toBe('5.00  '.length+24);
  const exact=rows([alert('e',{kind:'crossing',value:5},{},{name:'B'.repeat(24)})])[0];expect(exact.label).toBe('5.00  '+'B'.repeat(24));
  expect(rows([alert('f',{kind:'crossing',value:5})],{},cell).length).toBe(1);
  const precise=alertLineRows({alerts:[alert('p',{kind:'crossing',value:5})],cell,settings:settings(),format:value=>value.toFixed(4)})[0];expect(precise.label.startsWith('5.0000')).toBe(true);
 });
 it('skips non-finite levels and keeps a stable order',()=>{
  const list=[alert('1',{kind:'crossing',value:3}),alert('2',{kind:'inside',lower:1,upper:2}),alert('3',{kind:'greater',value:4})];
  expect(rows(list).map(row=>row.alertId+':'+row.slot)).toEqual(['1:level','2:lower','2:upper','3:level']);
  const broken=alert('b',{kind:'crossing',value:3});(broken.definition.condition as {value:number}).value=Number.NaN;expect(rows([broken])).toEqual([]);
 });
 it('replay state is never an input: rows depend only on alerts, cell and settings',()=>{
  const list=[alert('1',{kind:'crossing',value:3})];expect(rows(list)).toEqual(rows(list));expect(JSON.stringify(rows(list))).not.toContain('replay');
  expect(Object.keys(rows(list)[0]).sort()).toEqual(['alertId','color','dashed','label','labelVisible','name','price','slot','state','triggerMark','triggered']);
 });
 it('the layer id is separate from any drawing id space',()=>{
  expect(ALERT_LINES_LAYER).toBe('lv-alert-lines');
 });
});
describe('WSX alert line paint plan',()=>{
 const bounds={left:0,right:400,top:10,bottom:210};
 const proj={yOf:(price:number)=>200-price};
 it('plans one full-width line per row at the projected y, clipped to the pane, with dash for triggered',()=>{
  const data=rows([alert('a',{kind:'crossing',value:50}),alert('b',{kind:'inside',lower:20,upper:60},{lastTriggeredAt:5})]);
  const plan=planAlertLines(data,proj,bounds,{color:'#ff0000'});
  expect(plan.map(op=>op.y)).toEqual([150,180,140]);
  expect(plan.map(op=>op.dash.length>0)).toEqual([false,true,true]);
  for(const op of plan){expect(op.x1).toBe(0);expect(op.x2).toBe(400);expect(op.color).toBe('#ff0000');expect(op.label.x).toBeLessThanOrEqual(400);expect(op.label.align).toBe('right');}
 });
 it('skips rows outside the pane or with a non-finite projection and falls back to the token color',()=>{
  const plan=planAlertLines(rows([alert('a',{kind:'crossing',value:500}),alert('b',{kind:'crossing',value:50}),alert('c',{kind:'crossing',value:-50})]),proj,bounds,{});
  expect(plan.map(op=>op.alertId)).toEqual(['b']);expect(plan[0].color).toBe(ALERT_LINE_FALLBACK);
  expect(planAlertLines(rows([alert('n',{kind:'crossing',value:5})]),{yOf:()=>Number.NaN},bounds,{})).toEqual([]);
 });
 it('uses a row color over the option color, and nothing is planned for an empty list',()=>{
  const plan=planAlertLines(rows([alert('a',{kind:'crossing',value:50})],{lines:{visible:true,color:'#00ff00'}}),proj,bounds,{color:'#ff0000'});expect(plan[0].color).toBe('#00ff00');
  expect(planAlertLines([],proj,bounds,{})).toEqual([]);
 });
});
describe('WSX saved charts',()=>{
 it('a chart document saved before the lane (lines visible, no color) with one active price alert paints exactly one line after restore',()=>{
  const saved=JSON.parse(JSON.stringify(defaultChartSettingsDocument()));expect(saved.alerts.lines).toEqual({visible:true,color:null});
  const restored=restoreChartSettingsDocument(JSON.parse(JSON.stringify(saved)));
  const result=alertLineRows({alerts:[alert('only',{kind:'crossing',value:75})],cell,settings:{lines:restored.alerts.lines,activeOnly:restored.alerts.activeOnly},format});
  expect(result).toHaveLength(1);expect(JSON.stringify(restored)).toBe(JSON.stringify(saved));
  const again=alertLineRows({alerts:[alert('only',{kind:'crossing',value:75})],cell,settings:{lines:saved.alerts.lines,activeOnly:saved.alerts.activeOnly},format});
  expect(again).toEqual(result);
 });
 it('the stored alert fields already exist in the document, so this lane adds no chart settings field',()=>{
  const source=readFileSync('src/chart/chart-settings-document.ts','utf8');
  // HideToasts follows the reference default and gains its one-time migration flag; the alert line fields are unchanged.
  expect(source).toContain("alerts:{lines:{visible:true,color:null},activeOnly:true,labelsVisible:true,volume:{enabled:true,level:0.5},hideToasts:true,hideToastsMigrated:true}");
 });
});
// Overlay isolation. The adapter is not wired until R7, so this proves the isolation at the seams that exist today:
// the layer registry, the drawing registry, the import graph, and that alert rows can never be mistaken for drawing rows.
import {drawingTypes,rendererLayers} from '@luxalgo/vela';
import {registerAlertLinesLayer} from '../../src/chart/alert-lines-painter';
describe('WSX alert line overlay isolation',()=>{
 it('registers as a renderer layer, never as a drawing type',()=>{
  registerAlertLinesLayer();registerAlertLinesLayer();
  expect(rendererLayers().filter(layer=>layer.id===ALERT_LINES_LAYER)).toHaveLength(1);
  expect(rendererLayers().find(layer=>layer.id===ALERT_LINES_LAYER)!.placement).toBe('above-data');
  expect(JSON.stringify(drawingTypes().map((type:{type?:string;id?:string})=>type.type??type.id))).not.toContain(ALERT_LINES_LAYER);
 });
 it('neither alert line module imports drawing, object tree, eraser or paint hook code',()=>{
  for(const file of ['src/chart/alert-lines-data.ts','src/chart/alert-lines-painter.ts']){
   const imports=[...readFileSync(file,'utf8').matchAll(/from\s+'([^']+)'/g)].map(match=>match[1]);
   for(const spec of imports)expect(spec,file).not.toMatch(/drawing|object-tree|eraser|lv-paint-hook|layout-port|context-menu/);
  }
 });
 it('alert rows are not drawing rows and computing them leaves a drawing document and its projection untouched',()=>{
  const drawings=[{id:'d1',type:'trendline',paneId:'price',anchors:[{time:1,price:10},{time:2,price:11}],locked:false,hidden:false,lvSyncScope:'s'},{id:'d2',type:'hline',paneId:'price',anchors:[{time:1,price:12}],locked:true,hidden:true}];
  const document={version:1,drawings},before=JSON.stringify(document);
  const project=(rows:Record<string,unknown>[])=>rows.filter(row=>row.hidden!==true).map(row=>row.id);
  const projectionBefore=project(drawings);
  const lines=rows([alert('a',{kind:'crossing',value:11}),alert('b',{kind:'inside',lower:9,upper:13})]);
  expect(lines.length).toBe(3);
  expect(JSON.stringify(document)).toBe(before);expect(project(drawings)).toEqual(projectionBefore);
  for(const row of lines){for(const key of ['type','anchors','paneId','locked','hidden','id','lvSyncScope'])expect(Object.hasOwn(row,key),key).toBe(false);}
  // Hide, lock, remove and the eraser work on document rows by id; none of those ids can come from an alert line.
  const ids=new Set(drawings.map(row=>row.id));for(const row of lines)expect(ids.has(row.alertId)).toBe(false);
 });
});
