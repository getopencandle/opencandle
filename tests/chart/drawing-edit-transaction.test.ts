import {expect,it,vi} from 'vitest';
import {commitDrawingEdit,DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
it('publishes an accepted drawing once after its mutation and identifies a later notification failure',()=>{
 const calls:string[]=[],rollback=vi.fn(),host={begin:()=>{calls.push('hold');},apply:()=>{calls.push('apply');},rollback,end:()=>{calls.push('publish');}};
 expect(commitDrawingEdit(host)).toEqual({accepted:true});expect(calls).toEqual(['hold','apply','publish']);expect(rollback).not.toHaveBeenCalled();
 host.end=()=>{throw Error('observer');};try{commitDrawingEdit(host);throw Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(DrawingEditRecoveryError);expect((error as DrawingEditRecoveryError).accepted).toBe(true);expect(String(error)).toContain('drawing changed');}expect(rollback).not.toHaveBeenCalled();
});
it('allows retry only after a failed mutation restores and releases successfully',()=>{
 const error=Error('native'),calls:string[]=[],host={begin:()=>{calls.push('hold');},apply:()=>{calls.push('apply');throw error;},rollback:()=>{calls.push('restore');},end:()=>{calls.push('release');}};
 expect(()=>commitDrawingEdit(host)).toThrow(error);expect(calls).toEqual(['hold','apply','restore','release']);
 host.rollback=()=>{throw Error('restore');};try{commitDrawingEdit(host);}catch(cause){expect(cause).toBeInstanceOf(DrawingEditRecoveryError);expect((cause as DrawingEditRecoveryError).accepted).toBe(false);expect((cause as DrawingEditRecoveryError).causes).toHaveLength(2);}
});
it('does not mutate after failed acquisition and retains both native and release failures',()=>{
 const apply=vi.fn(),rollback=vi.fn(),end=vi.fn();expect(()=>commitDrawingEdit({begin:()=>{throw Error('hold');},apply,rollback,end})).toThrow('hold');expect(apply).not.toHaveBeenCalled();expect(end).not.toHaveBeenCalled();
 try{commitDrawingEdit({begin(){},apply(){throw Error('native');},rollback,end(){throw Error('release');}});}catch(error){expect(error).toBeInstanceOf(DrawingEditRecoveryError);expect((error as DrawingEditRecoveryError).accepted).toBe(false);expect((error as DrawingEditRecoveryError).causes.map(String)).toEqual(['Error: native','Error: release']);}
});
