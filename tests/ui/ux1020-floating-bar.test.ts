import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {DrawingEditBar,MoreSlot} from '../../src/ui/drawing-edit-bar';
import {friendlyError,errorDetails} from '../../src/ui/user-error';
import {REFERENCE_DRAWING_GROUPS} from '../../src/ui/drawing-toolbar-model';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';

const app=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n');
const noop=()=>{};
describe('UX-1020 task 1: drawing right-click menu is wired',()=>{
 for(const id of ['drawing-clone','drawing-lock','drawing-hide','drawing-front','drawing-back','drawing-remove'])
  it(id+' has a handler',()=>{expect(app).toContain("'"+id+"':drawingContextRun(");expect(app).toContain('...drawingContextHandlers');});
});
describe('UX-1020 task 2: no-chart toolbar hides unavailable tools',()=>{
 it('renders no unavailable leaf and matches the chart-backed group set',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingToolbar,{chart:null,activeTool:null,onSelect:noop,onCursor:noop,onOpenAll:noop}));
  expect(html).not.toContain('Unavailable');
  const hidden=REFERENCE_DRAWING_GROUPS.flatMap(g=>g.sections.flatMap(s=>s.leaves)).filter(l=>l.target.kind==='unavailable');
  for(const leaf of hidden)expect(html).not.toContain('>'+leaf.label+'<');
 });
});
describe('UX-1020 task 3: plain-language errors',()=>{
 it('rewrites internal wording',()=>{
  expect(friendlyError(new Error('Drawing fingerprint mismatch abc123'))).not.toMatch(/fingerprint/i);
  expect(friendlyError(new Error('Chart configuration ownership changed or its frame is unavailable. Reopen the settings.'))).not.toMatch(/frame|ownership/i);
  expect(friendlyError(new TypeError('x is not a function'))).toBe('Something went wrong. Try again.');
 });
 it('passes readable text without the class prefix and keeps raw details',()=>{
  const e=new RangeError('Enter a name of 1 to 200 characters');
  expect(friendlyError(e)).toBe('Enter a name of 1 to 200 characters.');
  expect(errorDetails(e)).toBe('RangeError: Enter a name of 1 to 200 characters');
 });
 it('App no longer prints String(error) statuses',()=>{expect(app).not.toMatch(/setMessage\(String\((error|e|cause)\)\)/);expect(app).toContain('reportFailure(');});
});
describe('UX-1020 task 4: floating drawing toolbar',()=>{
 const props={onSettings:noop,onLock:noop,onDuplicate:noop,onDelete:noop,onHide:noop,onFront:noop,onBack:noop,locked:false,
  properties:{buttons:[{id:'lineColor',path:'style.lineColor',title:'x'},{id:'backgroundColor',path:'style.fillColor',title:'y'},{id:'lineWidth',path:'style.lineWidth',title:'w',options:[1,2,3,4]},{id:'lineStyle',path:'style.lineStyle',title:'s',options:['solid','dashed','dotted']}] as never,read:()=>'#ff0000',apply:noop}};
 it('shows tooltip icon buttons and keeps legacy accessible names',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingEditBar,props));
  for(const name of ['Line color','Background color','Line width','Line style','Settings','Lock / unlock','Delete','More'])expect(html).toContain('aria-label="'+name+'"');
  expect(html).toContain('title="Lock"');
 });
 it('omits background color when the drawing has none',()=>{
  const html=renderToStaticMarkup(React.createElement(DrawingEditBar,{...props,properties:{...props.properties,buttons:(props.properties.buttons as unknown as {id:string}[]).filter(b=>b.id!=='backgroundColor') as never}}));
  expect(html).not.toContain('Background color');
 });
 it('More menu elements carry Duplicate, Hide and order handlers',()=>{
  const root=DrawingEditBar(props) as React.ReactElement<any>;
  const more=(React.Children.toArray(root.props.children) as React.ReactElement<any>[]).find(c=>c.type===MoreSlot)!;
  expect(more.props.onDuplicate).toBe(props.onDuplicate);expect(more.props.onHide).toBe(props.onHide);
 });
 it('App passes the new handlers',()=>{for(const p of ['onHide=','onFront=','onBack=','properties={selectedDrawingProperties}'])expect(app).toContain(p);});
});
