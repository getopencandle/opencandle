import {expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {installDrawingCommandRouter} from '../../src/chart/drawing-command-router';
import {drawingRouterHarness} from '../chart/drawing-command-router-harness';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';

it('native error formatting that retires source cannot send a message to its replacement and preserves the thrown value',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let trapped=0;const messages:string[]=[];
 const cause=new Proxy({message:'SYNTHETIC old refusal'},{getOwnPropertyDescriptor(target,key){if(key==='message'){trapped++;f.retire();}return Reflect.getOwnPropertyDescriptor(target,key);}});
 const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,{...f.host,captureOwner(){throw cause;},captureErrorOwner:f.captureOwner,reportError(message){messages.push(message);}});
 try{let caught:unknown;try{router.duplicate(['SYNTHETIC target']);}catch(error){caught=error;}expect(caught).toBe(cause);expect(trapped).toBe(1);expect(messages).toEqual([]);}finally{router.dispose();f.dispose();}
});

it('a missing-binding refusal can notify its current listener but registration from that callback stops stale fanout',async()=>{
 const f=await duplicateAdapterFixture();try{
  const messages:string[]=[],late:string[]=[];let bound=false;
  f.controller.onDrawingCommandError((message:string)=>{messages.push(message);if(!bound){bound=true;f.controller.bindDrawingWorkspaceHost(f.host);f.controller.onDrawingCommandError((value:string)=>late.push(value));}});
  f.controller.onDrawingCommandError(()=>messages.push('SYNTHETIC stale listener'));
  let caught:unknown;try{f.controller.duplicateDrawings([f.rows[0].id]);}catch(error){caught=error;}
  expect(caught).toBeInstanceOf(Error);expect(messages).toHaveLength(1);expect(messages[0]).toContain('bound workspace');expect(late).toEqual([]);
  expect(f.f.native.controller.all()).toHaveLength(1);expect(f.history.status().undo).toBe(0);expect(f.state().analysisUnavailable).toBe('');
  expect(f.controller.duplicateDrawings([f.rows[0].id]).workspaceAcknowledged).toBe(true);
 }finally{f.dispose();}
});
