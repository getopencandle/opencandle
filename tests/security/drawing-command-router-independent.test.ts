import {expect,it} from 'vitest';
import {installDrawingCommandRouter} from '../../src/chart/drawing-command-router';
import {drawingRouterHarness} from '../chart/drawing-command-router-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';
import type {Vela} from '@luxalgo/vela';

it('actual router refuses a genuine Promise instead of returning it as a synchronous Duplicate receipt',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{
  f.setDuplicate(ids=>Promise.resolve(f.receipt(ids)) as any);
  expect(()=>f.router.duplicate([row.id])).toThrow(/synchronous|receipt|thenable/i);
  expect(f.native.controller.all()).toEqual([row]);
 }finally{f.dispose();}
});

it('a retained action assertion cannot regain command authority after the host invocation returns',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);let retained:(()=>void)|undefined;
 try{
  f.setDuplicate((ids,assert)=>{retained=assert;assert();return f.receipt(ids);});
  expect(f.router.duplicate([row.id]).workspaceAcknowledged).toBe(true);expect(retained).toBeTypeOf('function');
  expect(()=>retained!()).toThrow(/retired|active|command/i);
  expect(f.router.duplicate([row.id]).workspaceAcknowledged).toBe(true);
 }finally{f.dispose();}
});

it('inherited then accessors are refused without invoking the asynchronous hook',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);let reads=0;
 try{
  const prototype={};Object.defineProperty(prototype,'then',{get(){reads++;throw Error('SYNTHETIC forbidden then getter');}});
  f.setDuplicate(ids=>Object.assign(Object.create(prototype),f.receipt(ids)));
  expect(()=>f.router.duplicate([row.id])).toThrow(/synchronous|receipt|thenable/i);expect(reads).toBe(0);
  expect(f.native.controller.all()).toEqual([row]);
 }finally{f.dispose();}
});

it('partial facade installation that writes then throws restores every owned slot and the original intent callback',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();
 const original=f.paint.controller.intentCb,facade=f.facade,marker=Error('SYNTHETIC installed undo then failed');let attempted=false;
 const proxy=new Proxy(facade,{defineProperty(target,key,descriptor){const success=Reflect.defineProperty(target,key,descriptor);if(key==='undo'&&!attempted){attempted=true;throw marker;}return success;}});
 f.setFacade(proxy);
 try{
  expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,f.host)).toThrow('installed undo then failed');
  expect(attempted).toBe(true);expect(f.paint.controller.intentCb).toBe(original);
  for(const key of ['clone','duplicate','undo','redo','canUndo','canRedo'])expect(Object.hasOwn(facade,key)).toBe(false);
  f.setFacade(facade);const next=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,f.host);next.dispose();
 }finally{f.setFacade(facade);f.dispose();}
});
