import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {MultiSelectionBar} from '../../src/ui/multi-selection-bar';
import {placeBarNearDrawing} from '../../src/ui/drawing-edit-bar-position';
import {chartMenuEntries} from '../../src/ui/ChartContextMenu';
import {bulkPropertyBar} from '../../src/chart/drawing-template-batch';
import {dwRecord} from './dwutil-object-harness';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

// SYNTHETIC. Gaps 6, 22 and the drawing-follows-the-view behavior of the bar. Server markup and pure helpers only.
const bar={width:300,height:36},view={width:1000,height:700};
describe('gap 6: the bar starts near the drawing',()=>{
 it('sits just above the drawing, centered on it',()=>{
  expect(placeBarNearDrawing({left:400,top:300,right:600,bottom:400},bar,view)).toEqual({left:350,top:256});
 });
 it('drops below the drawing when there is no room above',()=>{
  expect(placeBarNearDrawing({left:400,top:10,right:600,bottom:60},bar,view)).toEqual({left:350,top:68});
 });
 it('stays inside the chart at the edges and when the drawing is off screen',()=>{
  expect(placeBarNearDrawing({left:-50,top:300,right:20,bottom:340},bar,view).left).toBe(0);
  expect(placeBarNearDrawing({left:950,top:300,right:990,bottom:340},bar,view).left).toBe(700);
  const gone=placeBarNearDrawing({left:5000,top:-900,right:5100,bottom:-800},bar,view);
  expect(gone.left).toBe(700);expect(gone.top).toBeGreaterThanOrEqual(0);
 });
 it('a near box places the bar when no position is given',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingEditBar,{onSettings:()=>{},onLock:()=>{},onDuplicate:()=>{},onDelete:()=>{},near:{box:{left:400,top:300,right:600,bottom:400},viewport:view}}));
  expect(html).toContain('left:350px');expect(html).toContain('top:256px');
 });
 it('an explicit position wins over the near box',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingEditBar,{onSettings:()=>{},onLock:()=>{},onDuplicate:()=>{},onDelete:()=>{},position:{left:5,top:6},near:{box:{left:400,top:300,right:600,bottom:400},viewport:view}}));
  expect(html).toContain('left:5px');expect(html).not.toContain('left:350px');
 });
});
const snap=(ids:string[])=>({entity:{kind:'drawing',ids,fingerprints:{}},point:{price:1,unit:'price',pane:{kind:'price'}},controller:{contextMenu:{isCurrent:()=>true}}}) as unknown as ChartMenuSnapshot;
const yes=()=>true;
describe('gap 22: drawing menu',()=>{
 const all:ChartContextActions={'drawing-settings':yes,'drawing-alert':yes,'drawing-clone':yes,'drawing-copy':yes,'drawing-lock':yes,'drawing-hide':yes,'drawing-front':yes,'drawing-forward':yes,'drawing-backward':yes,'drawing-back':yes,'drawing-remove':yes,'drawing-template':yes,'drawing-visibility':yes};
 it('offers Template and Visibility on intervals for one drawing, right after Settings',()=>{
  const labels=chartMenuEntries(snap(['a']),all).map(row=>row.label);
  expect(labels).toContain('Template');expect(labels).toContain('Visibility on intervals…');
  expect(labels.indexOf('Template')).toBeLessThan(labels.indexOf('Add alert'));
 });
 it('leaves them out for several drawings and when no handler exists',()=>{
  expect(chartMenuEntries(snap(['a','b']),all).map(row=>row.label)).not.toContain('Template');
  expect(chartMenuEntries(snap(['a']),{'drawing-settings':yes}).map(row=>row.label)).not.toContain('Template');
 });
});
describe('gap 22: multi-selection bar uses icon buttons',()=>{
 const rows=[dwRecord('a',100),dwRecord('b',110)] as unknown as Record<string,unknown>[];
 const chart={bulkPropertyBar:(selected:Record<string,unknown>[])=>bulkPropertyBar(selected as never),drawingManager:{},getDrawingEditor:()=>({anchors:[]}),getSourceBars:()=>[]} as never;
 it('shows color, width and style as labelled icon buttons, not text',()=>{
  const html=renderToStaticMarkup(React.createElement(MultiSelectionBar,{chart,ids:['a','b'],rows,onChanged:()=>{},onMessage:()=>{}}));
  for(const name of ['Line tool colors','Line tool widths','Style'])expect(html).toContain('aria-label="'+name+'"');
  expect(html).not.toContain('>Line tool colors<');expect(html).toContain('drawing-edit-icon');
 });
});
import {readFileSync} from 'node:fs';
import {COORDINATE_LABELS} from '../../src/ui/drawing-dialog-model';
describe('gap 21: coordinates wording',()=>{
 // The time axis is now a Date and a Time field; the bar wording stays for the bar range only.
 it('names the coordinate fields like the price field and the dialog uses them',()=>{
  expect(COORDINATE_LABELS).toEqual({bar:'Bar #',price:'Price',date:'Date',time:'Time'});
  const source=readFileSync('src/ui/DrawingDialog.tsx','utf8');
  expect(source).toContain('{COORDINATE_LABELS.date}');expect(source).toContain('{COORDINATE_LABELS.time}');expect(source).not.toContain('>Bar position<');
 });
});
