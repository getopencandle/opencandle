import React from 'react';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {DrawingEditBar,MoreSlot} from '../../src/ui/drawing-edit-bar';

// A click on a selection bar button only cleared the selection. Model of the
// browser event path, no DOM: a press bubbles from the button through its ancestors' onPointerDown handlers to the
// document, where the pinned renderer's selection popup listens (bubble phase, vela dist/chunk-UNUVPQFW.js:16172 and
// onOutside :15953 -> onPopupDismissed :17055 -> clearSelection -> 'drawing:selected' []), and App unmounts the bar on an
// empty selection (App.tsx:417, :762). The click is delivered only to a bar that is still mounted. SYNTHETIC; not
// executable UI evidence.

/** App.tsx:762 before the fix, verbatim structure: no handler stops the press. */
function PreFixBar(props:{onSettings:()=>void;onLock:()=>void;onDuplicate:()=>void;onDelete:()=>void}){
 const h=React.createElement;return h('div',{className:'drawing-edit-bar'},h('button',{onClick:props.onSettings,'aria-label':'Settings'},'Settings'),h('button',{onClick:props.onLock,'aria-label':'Lock / unlock'},'Lock / unlock'),h('button',{onClick:props.onDuplicate,'aria-label':'Duplicate'},'Duplicate'),h('button',{onClick:props.onDelete,'aria-label':'Delete'},'Delete'));
}
type Bar=(props:{onSettings:()=>void;onLock:()=>void;onDuplicate:()=>void;onDelete:()=>void})=>React.ReactElement<any>;

/** A bar control by accessible name. Duplicate lives in the More menu: its slot element exposes the same handler, clicked as the menu item would. */
function named(children:React.ReactElement<any>[],label:string):{props:{onPointerDown?:(e:unknown)=>void;onClick:()=>void}}|undefined{
 const direct=children.find(child=>child.props['aria-label']===label);if(direct)return direct;
 const more=children.find(child=>child.type===MoreSlot);
 if(label==='Duplicate'&&more)return{props:{onClick:more.props.onDuplicate}};
 return undefined;
}
function pressAndClick(Component:Bar,label:string){
 const handlers={onSettings:vi.fn(),onLock:vi.fn(),onDuplicate:vi.fn(),onDelete:vi.fn()};
 let selected:string|null='drawing-1';
 // The renderer popup's document pointerdown listener: a press outside its chrome dismisses it and clears the selection.
 const documentPointerDown=()=>{selected=null;};
 const render=()=>selected?Component(handlers):null;
 const root=render()! as React.ReactElement<any>;
 const children=React.Children.toArray(root.props.children) as React.ReactElement<any>[];
 const button=named(children,label)!;
 let stopped=false;const event={stopPropagation:()=>{stopped=true;},preventDefault:()=>{}};
 for(const node of [button,root]){node.props.onPointerDown?.(event);if(stopped)break;}
 if(!stopped)documentPointerDown();
 // The click follows the release; it reaches the button only if the bar is still rendered.
 const after=render() as React.ReactElement<any>|null;
 if(after){const target=named(React.Children.toArray(after.props.children) as React.ReactElement<any>[],label)!;target.props.onClick();}
 return {handlers,selected,mounted:!!after};
}

describe('Bugfix K SELBAR: a press on the selection bar does not dismiss the selection',()=>{
 it('pre-fix bar (App.tsx:762): the press clears the selection, the bar unmounts and Settings/Delete never run (defect reproduced)',()=>{
  const settings=pressAndClick(PreFixBar,'Settings'),remove=pressAndClick(PreFixBar,'Delete');
  expect(settings.selected).toBeNull();expect(settings.mounted).toBe(false);expect(settings.handlers.onSettings).not.toHaveBeenCalled();
  expect(remove.handlers.onDelete).not.toHaveBeenCalled();
 });
 for(const [label,key] of [['Settings','onSettings'],['Lock / unlock','onLock'],['Duplicate','onDuplicate'],['Delete','onDelete']] as const)
  it(label+': the press stays inside the bar, the selection survives and the click runs its action once',()=>{
   const result=pressAndClick(DrawingEditBar,label);
   expect(result.selected).toBe('drawing-1');expect(result.mounted).toBe(true);
   expect(result.handlers[key]).toHaveBeenCalledTimes(1);
   for(const other of ['onSettings','onLock','onDuplicate','onDelete'] as const)if(other!==key)expect(result.handlers[other]).not.toHaveBeenCalled();
  });
 it('keeps the bar markup the flows and CSS select (.drawing-edit-bar, named buttons)',()=>{
  const root=DrawingEditBar({onSettings:()=>{},onLock:()=>{},onDuplicate:()=>{},onDelete:()=>{}}) as React.ReactElement<any>;
  expect(root.props.className).toBe('drawing-edit-bar');
  const kids=React.Children.toArray(root.props.children) as React.ReactElement<any>[];
  expect(kids.filter(child=>typeof child.props['aria-label']==='string').map(child=>child.props['aria-label'])).toEqual(['Settings','Lock / unlock','Delete']);
  expect(kids.some(child=>child.type===MoreSlot)).toBe(true);
 });
 it('App wiring: the selection bar is the DrawingEditBar component and no plain drawing-edit-bar div remains',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  // The Bars pattern chip rides in the bar through `extra` (attribute order is free).
  expect(app).toMatch(/<DrawingEditBar [^\n]*onSettings=/);expect(app).not.toContain('<div className="drawing-edit-bar">');
  expect(app).not.toContain('lv-bars-pattern-chip-host');
 });
 it('extra controls (Bars pattern chip) render first inside the bar, so a press on them stops at the bar too',()=>{
  const chip=React.createElement('span',{className:'lv-bars-pattern-chip'},'chip');
  const root=DrawingEditBar({onSettings:()=>{},onLock:()=>{},onDuplicate:()=>{},onDelete:()=>{},extra:chip}) as React.ReactElement<any>;
  const children=React.Children.toArray(root.props.children) as React.ReactElement<any>[];
  expect(children[0].props.className).toBe('lv-bars-pattern-chip');expect(children.slice(1).filter(child=>typeof child.props['aria-label']==='string').map(child=>child.props['aria-label'])).toEqual(['Settings','Lock / unlock','Delete']);
  let stopped=false;root.props.onPointerDown({stopPropagation:()=>{stopped=true;}});expect(stopped).toBe(true);
 });
});
