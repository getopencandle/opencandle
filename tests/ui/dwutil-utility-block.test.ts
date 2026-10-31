// Static markup and element-tree checks of the left-toolbar utility block (react-dom/server; no DOM events, not interface evidence).
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DrawingUtilityBlock,type DrawingUtilityBlockProps} from '../../src/ui/DrawingUtilityBlock';
import {defaultDrawingUtility,freshDrawingUtility} from '../../src/chart/drawing-utility-state';
import {LV_ICONS} from '../../src/ui/icons';

const base=(over:Partial<DrawingUtilityBlockProps>={}):DrawingUtilityBlockProps=>({utility:freshDrawingUtility(),canZoomOut:false,zoomArmed:false,counts:{drawings:2,indicators:1,removeLocked:false},openMenu:null,
 onOpenMenu:vi.fn(),onZoomIn:vi.fn(),onZoomOut:vi.fn(),onToggleLock:vi.fn(),onToggleHide:vi.fn(),onToggleSync:vi.fn(),onSelectLock:vi.fn(),onSelectHide:vi.fn(),onSelectSync:vi.fn(),onRemove:vi.fn(),onToggleRemoveLocked:vi.fn(),...over});
const markup=(over:Partial<DrawingUtilityBlockProps>={})=>renderToStaticMarkup(React.createElement(DrawingUtilityBlock,base(over)));
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const tree=(over:Partial<DrawingUtilityBlockProps>={})=>DrawingUtilityBlock(base(over));
const byLabel=(root:any,label:string)=>findAll(root,n=>n.props['aria-label']===label)[0];

describe(' utility block',()=>{
 it('own classes only, never the drawing group classes',()=>{const html=markup();expect(html).toContain('lv-utility-group');expect(html).toContain('lv-utility-arrow');expect(html).not.toContain('lv-drawing-group');expect(html).not.toContain('lv-drawing-arrow');});
 it('icons come from the registry names through data-lv-icon',()=>{
  const html=markup();for(const id of ['zoom-in','lock-drawings','hide-drawings','sync-drawings','remove-objects'])expect(html).toContain('data-lv-icon="'+id+'"');
  for(const id of ['zoom-in','zoom-out','lock-drawings','lock-drawings-locked','hide-drawings','eye','remove-objects','sync-drawings'])expect(Object.hasOwn(LV_ICONS,id)).toBe(true);
  const on=markup({utility:{...freshDrawingUtility(),drawingsLocked:true,indicatorsLocked:true,drawingsHidden:true,indicatorsHidden:true},canZoomOut:true});
  expect(on).toContain('data-lv-icon="lock-drawings-locked"');expect(on).toContain('data-lv-icon="eye"');expect(on).toContain('data-lv-icon="zoom-out"');
 });
 it('exact tooltips on main buttons and arrows',()=>{
  const html=markup();
  for(const t of ['Zoom in','Lock drawings and indicators','Hide all drawings','Remove objects','Lock options','Hide options','Sync drawings options','Remove options','New drawings are replicated to all charts in the layout and shown when the same ticker is selected'])expect(html).toContain('title="'+t+'"');
  expect(markup({utility:defaultDrawingUtility()})).toContain('title="New drawings will not be synced"');
  expect(markup({utility:{...defaultDrawingUtility(),hideMode:'all',drawingsHidden:true,indicatorsHidden:true}})).toContain('title="Show all drawings and indicators"');
 });
 it('Zoom out only with a non-empty stack',()=>{expect(markup()).not.toContain('Zoom out');expect(markup({canZoomOut:true})).toContain('title="Zoom out"');});
 it('zoom in shows pressed while armed',()=>{expect(markup({zoomArmed:true})).toMatch(/aria-label="Zoom in"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Zoom in"/);});
 it('menus render only when open, with the cited rows and states',()=>{
  expect(markup()).not.toContain('role="menu"');
  const lock=markup({openMenu:'lock'});expect(lock).toContain('>Lock drawings<');expect(lock).toContain('>Lock indicators<');expect(lock).toContain('>Lock all<');
  const hide=markup({openMenu:'hide'});expect(hide).toContain('>Hide all<');expect(hide).toContain('>Hide positions and orders<');
  const sync=markup({openMenu:'sync'});expect(sync).toContain('New drawings sync in layout');expect(sync).toContain('New drawings sync globally');
  const remove=markup({openMenu:'remove'});expect(remove).toContain('>Remove 2 drawings<');expect(remove).toContain('>Remove 1 indicator<');expect(remove).toContain('>Remove 2 drawings &amp; 1 indicator<');expect(remove).toContain('Always remove locked drawings');
  const zero=markup({openMenu:'remove',counts:{drawings:0,indicators:0,removeLocked:false}});expect(zero).toContain('>Remove drawings<');expect(zero).toMatch(/disabled=""[^>]*>Remove drawings</);
 });
 it('handlers: main buttons act, remove main button only opens the menu',()=>{
  const props=base();const root=DrawingUtilityBlock(props);
  byLabel(root,'Lock drawings and indicators').props.onClick();expect(props.onToggleLock).toHaveBeenCalled();
  byLabel(root,'Hide all drawings').props.onClick();expect(props.onToggleHide).toHaveBeenCalled();
  byLabel(root,'Zoom in').props.onClick();expect(props.onZoomIn).toHaveBeenCalled();
  byLabel(root,'Remove objects').props.onClick();expect(props.onOpenMenu).toHaveBeenCalledWith('remove');expect(props.onRemove).not.toHaveBeenCalled();
  byLabel(root,'Lock options').props.onClick();expect(props.onOpenMenu).toHaveBeenCalledWith('lock');
 });
 it('menu row handlers select, remove rows invoke the matching scope, disabled rows do nothing',()=>{
  const props=base({openMenu:'remove'});const root=DrawingUtilityBlock(props);
  const rows=findAll(root,n=>n.props.role==='menuitem'||n.props.role==='menuitemcheckbox');
  expect(rows.length).toBe(4);rows[0].props.onClick();expect(props.onRemove).toHaveBeenLastCalledWith('drawings');rows[1].props.onClick();expect(props.onRemove).toHaveBeenLastCalledWith('indicators');rows[2].props.onClick();expect(props.onRemove).toHaveBeenLastCalledWith('all');
  rows[3].props.onClick();expect(props.onToggleRemoveLocked).toHaveBeenCalled();
  const zero=base({openMenu:'remove',counts:{drawings:0,indicators:0,removeLocked:false}});const zr=findAll(DrawingUtilityBlock(zero),n=>n.props.role==='menuitem');zr[0].props.onClick();expect(zero.onRemove).not.toHaveBeenCalled();
  const lp=base({openMenu:'lock'});const lr=findAll(DrawingUtilityBlock(lp),n=>n.props.role==='menuitemradio');lr[1].props.onClick();expect(lp.onSelectLock).toHaveBeenCalledWith('indicators');
  const sp=base({openMenu:'sync'});findAll(DrawingUtilityBlock(sp),n=>n.props.role==='menuitemradio')[1].props.onClick();expect(sp.onSelectSync).toHaveBeenCalledWith('global');
 });
 it('disabled block disables every control',()=>{const html=markup({disabled:true});expect((html.match(/disabled=""/g)??[]).length).toBeGreaterThanOrEqual(8);});
});
