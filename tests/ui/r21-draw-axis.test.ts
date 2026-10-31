import {readFileSync} from 'node:fs';
import React from 'react';
import {describe,expect,it} from 'vitest';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {PRESS_THROUGH_ATTR,barPressHeld,installBarPressTracker,markPressThrough} from '../../src/ui/drawing-edit-bar-press';

// Exe-sweep-tools 20261021T235003169Z on r19b, Anchored volume profile.
// Move: the click that selected the profile opened the drawing bar over the anchor, so the drag pressed the bar, not the
// drawing (anchors unchanged). Delete: the selecting press mounted the bar under the pointer before that press's own
// mousedown was hit-tested, so focus went to the bar's More button and Delete (a chart key) was ignored.
// SYNTHETIC event targets; no DOM, no GUI.
function pressTarget(){
 const map=new Map<string,Set<(event:any)=>void>>();
 return{addEventListener(type:string,listener:(event:any)=>void){(map.get(type)??map.set(type,new Set()).get(type)!).add(listener);},
  removeEventListener(type:string,listener:(event:any)=>void){map.get(type)?.delete(listener);},
  dispatch(type:string,event:any={}){for(const listener of [...map.get(type)??[]])listener(event);},count:(type:string)=>map.get(type)?.size??0};
}
function bar(){const attrs=new Map<string,string>();return{style:{pointerEvents:''},attrs,setAttribute(name:string,value:string){attrs.set(name,value);},removeAttribute(name:string){attrs.delete(name);},hasAttribute:(name:string)=>attrs.has(name)};}
function harness(){
 const target=pressTarget(),nodes:ReturnType<typeof bar>[]=[],queue:Array<()=>void>=[];
 const doc={querySelectorAll:(selector:string)=>{expect(selector).toBe('['+PRESS_THROUGH_ATTR+']');return nodes.filter(node=>node.hasAttribute(PRESS_THROUGH_ATTR));}};
 const tracker=installBarPressTracker(target,doc,run=>queue.push(run));
 return{target,nodes,queue,tracker,flush(){while(queue.length)queue.shift()!();},mount(){const node=bar();nodes.push(node);markPressThrough(node as never);return node;}};
}

describe('the drawing bar never takes the press that opened it',()=>{
 it('a bar mounted while the selecting press is held lets that press through until it ends',()=>{
  const h=harness();
  try{
   h.target.dispatch('pointerdown',{button:0});expect(barPressHeld()).toBe(true);
   const node=h.mount();
   expect(node.style.pointerEvents).toBe('none');expect(node.hasAttribute(PRESS_THROUGH_ATTR)).toBe(true);
   h.target.dispatch('pointerup',{button:0});
   // Still passive until the press's own mouseup and click have been dispatched (one task later).
   expect(node.style.pointerEvents).toBe('none');
   h.flush();
   expect(node.style.pointerEvents).toBe('');expect(node.hasAttribute(PRESS_THROUGH_ATTR)).toBe(false);expect(barPressHeld()).toBe(false);
  }finally{h.tracker.dispose();}
 });
 it('a bar mounted with no press held is interactive at once, and a later press on it is never made passive',()=>{
  const h=harness();
  try{
   const node=h.mount();expect(node.style.pointerEvents).toBe('');expect(node.hasAttribute(PRESS_THROUGH_ATTR)).toBe(false);
   // A press on the bar's own button re-renders the bar; the ref is stable, so it is not re-run and the click lands.
   h.target.dispatch('pointerdown',{button:0});expect(node.style.pointerEvents).toBe('');
  }finally{h.tracker.dispose();}
 });
 it('cancel and window blur end the press; secondary buttons do not start one; dispose removes every listener',()=>{
  const h=harness();
  try{
   h.target.dispatch('pointerdown',{button:2});expect(barPressHeld()).toBe(false);
   h.target.dispatch('pointerdown',{button:0});const a=h.mount();h.target.dispatch('pointercancel',{});h.flush();expect(a.style.pointerEvents).toBe('');
   h.target.dispatch('pointerdown',{button:0});const b=h.mount();h.target.dispatch('blur',{});h.flush();expect(b.style.pointerEvents).toBe('');
   // A new press that starts before the deferred release keeps the bars it mounted passive.
   h.target.dispatch('pointerdown',{button:0});const c=h.mount();h.target.dispatch('pointerup',{});h.target.dispatch('pointerdown',{button:0});h.flush();expect(c.style.pointerEvents).toBe('none');
   h.target.dispatch('pointerup',{});h.flush();expect(c.style.pointerEvents).toBe('');
  }finally{h.tracker.dispose();}
  for(const type of ['pointerdown','pointerup','pointercancel','blur'])expect(h.target.count(type),type).toBe(0);
  expect(barPressHeld()).toBe(false);
 });
 it('the drawing bar root carries the stable press-through ref (one call per mount, not per render)',()=>{
  const props={onSettings:()=>{},onLock:()=>{},onDuplicate:()=>{},onDelete:()=>{}};
  const first=DrawingEditBar(props) as React.ReactElement<any>,second=DrawingEditBar({...props,locked:true}) as React.ReactElement<any>;
  expect(first.props.className).toBe('drawing-edit-bar');
  expect(first.props.ref).toBe(markPressThrough);expect(second.props.ref).toBe(markPressThrough);
 });
 it('one-anchor drawings keep the default bar place (the r19b near-anchor placement covered the profile body)',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('if(!row?.anchors||row.anchors.length<2||!projection)return undefined;');
 });
});

