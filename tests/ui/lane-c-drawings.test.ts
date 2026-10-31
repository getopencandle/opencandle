import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {MultiSelectionBar} from '../../src/ui/multi-selection-bar';
import {chartMenuEntries,drawingMenuLabels} from '../../src/ui/ChartContextMenu';
import {drawingMenu} from '../../src/ui/object-tree-model';
import {clampBarPosition,readBarPosition,writeBarPosition,DRAWING_BAR_POSITION_KEY} from '../../src/ui/drawing-edit-bar-position';
import {drawingPreview,templateChoices,applyTemplateToDraft,anchorTimeLabel,levelGridRows,LEVEL_COLUMNS} from '../../src/ui/drawing-dialog-model';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

const css=(name:string)=>readFileSync('src/ui/'+name,'utf8');
const noop=()=>{};
const props={onSettings:noop,onLock:noop,onDuplicate:noop,onDelete:noop};
const yes=()=>true;
const snap=(ids:string[])=>({entity:{kind:'drawing',ids,fingerprints:{}},point:{price:1,unit:'price',pane:{kind:'price'}},controller:{contextMenu:{isCurrent:()=>true,handoff:()=>({release(){}})}}}) as unknown as ChartMenuSnapshot;
const ALL:ChartContextActions={'drawing-settings':yes,'drawing-alert':yes,'drawing-clone':yes,'drawing-copy':yes,'drawing-lock':yes,'drawing-hide':yes,'drawing-front':yes,'drawing-forward':yes,'drawing-backward':yes,'drawing-back':yes,'drawing-remove':yes};

describe('gap 6: one floating drawing bar',()=>{
 it('hides the renderer popup so only the LV bar shows',()=>{expect(css('drawing-toolbar.css')).toMatch(/\.vela-dpop\s*\{[^}]*display:\s*none\s*!important/);});
 it('the bar has a drag handle and an inline position style when placed',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingEditBar,{...props,position:{left:40,top:60}}));
  expect(html).toContain('aria-label="Move drawing toolbar"');expect(html).toContain('left:40px');expect(html).toContain('top:60px');
 });
 it('clamps a position into the viewport and reads back what was saved',()=>{
  expect(clampBarPosition({left:-20,top:900},{width:300,height:40},{width:1000,height:700})).toEqual({left:0,top:660});
  expect(clampBarPosition({left:900,top:10},{width:300,height:40},{width:1000,height:700})).toEqual({left:700,top:10});
  const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v)};
  expect(readBarPosition(storage)).toBeNull();writeBarPosition(storage,{left:12,top:34});
  expect(store.has(DRAWING_BAR_POSITION_KEY)).toBe(true);expect(readBarPosition(storage)).toEqual({left:12,top:34});
  store.set(DRAWING_BAR_POSITION_KEY,'{"left":"x"}');expect(readBarPosition(storage)).toBeNull();
 });
 it('storage that throws never breaks the bar',()=>{
  const bad={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  expect(readBarPosition(bad)).toBeNull();expect(()=>writeBarPosition(bad,{left:1,top:1})).not.toThrow();
 });
});

describe('gap 14: Add alert from a drawing',()=>{
 it('the edit bar offers Add alert only when a handler exists',()=>{
  expect(renderToStaticMarkup(React.createElement(DrawingEditBar,props))).not.toContain('Add alert');
  expect(renderToStaticMarkup(React.createElement(DrawingEditBar,{...props,onAlert:noop}))).toContain('aria-label="Add alert"');
 });
 it('the right-click menu offers Add alert for exactly one drawing',()=>{
  expect(chartMenuEntries(snap(['a']),ALL).map(row=>row.label)).toContain('Add alert');
  expect(chartMenuEntries(snap(['a','b']),ALL).map(row=>row.label)).not.toContain('Add alert');
  expect(chartMenuEntries(snap(['a']),{...ALL,'drawing-alert':undefined}).map(row=>row.label)).not.toContain('Add alert');
 });
});

describe('gap 22: drawing menus',()=>{
 it('labels follow the drawing state',()=>{
  const labels=(state:{locked:boolean;hidden:boolean})=>chartMenuEntries(snap(['a']),ALL,null,state).map(row=>row.label);
  expect(labels({locked:true,hidden:true})).toEqual(expect.arrayContaining(['Unlock','Show']));
  expect(labels({locked:false,hidden:false})).toEqual(expect.arrayContaining(['Lock','Hide']));
  expect(labels({locked:false,hidden:false})).not.toContain('Lock / Unlock');
 });
 it('visual order is the full four-step set and Copy is offered',()=>{
  const labels=chartMenuEntries(snap(['a']),ALL).map(row=>row.label);
  expect(labels).toEqual(expect.arrayContaining(['Copy','Bring to front','Bring forward','Send backward','Send to back']));
  expect(labels.indexOf('Bring to front')).toBeLessThan(labels.indexOf('Bring forward'));
  // retarget: the cited order is Bring to front, Send to
  // back, Bring forward, Send backward.
  expect(['Bring to front','Send to back','Bring forward','Send backward'].map(label=>labels.indexOf(label))).toEqual([...['Bring to front','Send to back','Bring forward','Send backward'].map(label=>labels.indexOf(label))].sort((a,b)=>a-b));
 });
 it('reads lock and hidden state from the manager rows',()=>{
  const rows=[{id:'a',locked:true,visible:false},{id:'b',locked:true,visible:true}];
  expect(drawingMenuLabels(rows,['a'])).toEqual({locked:true,hidden:true});
  expect(drawingMenuLabels(rows,['a','b'])).toEqual({locked:true,hidden:false});
  expect(drawingMenuLabels([],['a'])).toEqual({locked:false,hidden:false});
 });
 it('the object tree drawing menu has no dead Move to row',()=>{
  const extra={copy:true,clone:true,order:{front:false,forward:false,backward:false,back:false}};
  expect(drawingMenu({kind:'drawing',locked:false,visible:true,renderable:true},true,extra).map(row=>row.label)).not.toContain('Move to');
 });
 it('the multi-select bar carries Lock, Clone and Delete and no one-tab modal title text',()=>{
  const chart={bulkPropertyBar:()=>({visible:true,buttons:[]}),drawingManager:{},drawings:{}} as never;
  const html=renderToStaticMarkup(React.createElement(MultiSelectionBar,{chart,ids:['a','b'],rows:[{id:'a',locked:false},{id:'b',locked:false}],onChanged:noop,onMessage:noop}));
  for(const name of ['Lock','Clone','Delete'])expect(html).toContain('aria-label="'+name+'"');
  const locked=renderToStaticMarkup(React.createElement(MultiSelectionBar,{chart,ids:['a','b'],rows:[{id:'a',locked:true},{id:'b',locked:true}],onChanged:noop,onMessage:noop}));
  expect(locked).toContain('aria-label="Unlock"');
 });
});

describe('gap 21: drawing settings dialog model',()=>{
 it('preview follows the draft style',()=>{
  expect(drawingPreview({'style.lineColor':'#ff0000','style.lineWidth':3,'style.lineStyle':'dashed','style.fillColor':'#00ff0033'})).toEqual({stroke:'#ff0000',strokeWidth:3,dash:'6 4',fill:'#00ff0033'});
  expect(drawingPreview({})).toEqual({stroke:'currentColor',strokeWidth:1,dash:'',fill:null});
  expect(drawingPreview({'style.lineWidth':Number.NaN,'style.lineStyle':'dotted'})).toMatchObject({strokeWidth:1,dash:'1.5 3'});
 });
 it('templates are limited to the drawing type and apply only known fields to the draft',()=>{
  const list=[{id:'1',name:'Wide',type:'trendline',properties:{'style.lineWidth':4,'nope':1}},{id:'2',name:'Other',type:'rectangle',properties:{}}];
  expect(templateChoices(list,'trendline').map(row=>row.id)).toEqual(['1']);
  const out=applyTemplateToDraft({'style.lineWidth':1,'style.lineColor':'#fff'},{'style.lineWidth':1,'style.lineColor':'#fff'},list[0].properties);
  expect(out).toEqual({values:{'style.lineWidth':4,'style.lineColor':'#fff'},applied:1});
 });
 it('coordinate times read as a date and time in the chart timezone',()=>{
  expect(anchorTimeLabel(1760972400,'UTC')).toBe('2025-10-20 15:00 UTC');
  expect(anchorTimeLabel(1760972400,'America/Phoenix')).toBe('2025-10-20 08:00 America/Phoenix');
  expect(anchorTimeLabel(1760972400,'Not/AZone')).toBe('2025-10-20 15:00 UTC');
  expect(anchorTimeLabel(Number.NaN,'UTC')).toBe('Unavailable');
 });
 it('levels are a grid with plain column titles',()=>{
  expect(LEVEL_COLUMNS).toEqual(['Show','Value','Color','Label']);
  expect(levelGridRows([{ratio:0.5,color:'#abc',enabled:true,label:'half'}],{'levels.0.ratio':0.618})).toEqual([{index:0,ratio:0.618,color:'#abc',enabled:true,label:'half'}]);
 });
 it('the dialog source no longer shows internal wording and offers a template choice',()=>{
  const dialog=css('DrawingDialog.tsx');
  expect(dialog).not.toContain('LV boundary-cadence');expect(dialog).not.toContain('Legacy renderer bands');
  expect(dialog).toContain('aria-label="Template"');expect(dialog).toContain('<svg');expect(dialog).toContain('drawingPreview(');
 });
});
