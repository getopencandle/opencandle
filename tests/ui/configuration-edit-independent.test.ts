import {expect,it} from 'vitest';
import {acquireNotificationHolds,createConfigurationEditor,publishConfigurationEdit} from '../../src/chart/configuration-edit';

// Independent contract faults. This does not exercise renderer paint or native input.
function setup(){let value='before',pending=false,current=true;const events:string[]=[],broken:string[]=[];let failAcquireCleanup=false;
 const editor=createConfigurationEditor<string,string,string>({exclusive:async(action,guard)=>{if(guard&&!guard())throw Error('retired');return action({isCurrent:()=>current});},validate:()=>{},capture:()=>value,
 hold:()=>failAcquireCleanup?acquireNotificationHolds([()=>({release:()=>{throw Error('first hold could not release');}}),()=>{throw Error('second hold refused');}]):({release:publish=>{events.push('release:'+publish);}}),
 apply:next=>{events.push('apply');value=next;return next;},restore:before=>{events.push('restore');value=before;},pending:next=>{pending=next;},broken:message=>broken.push(message)});
 return{editor,events,broken,value:()=>value,pending:()=>pending,retire:()=>{current=false;},failAcquire:()=>{failAcquireCleanup=true;}};
}
it('marks incomplete notification acquisition cleanup unavailable even before renderer mutation',async()=>{
 const state=setup();state.failAcquire();await expect(state.editor.prepare('after')).rejects.toThrow();expect(state.value()).toBe('before');expect(state.events).toEqual([]);expect(state.pending()).toBe(false);expect(state.broken.join(' ')).toMatch(/notification|cleanup/i);
});
it('unacknowledged publication rolls back and a consumed lease cannot publish later',async()=>{
 const state=setup(),lease=await state.editor.prepare('after');await expect(publishConfigurationEdit(lease,()=>undefined)).rejects.toThrow('rejected');expect(state.value()).toBe('before');expect(state.events).toEqual(['apply','restore','release:false']);expect(state.pending()).toBe(false);expect(()=>lease.commit()).toThrow();
});
it('retirement inside accepted model publication keeps the accepted value and reports recovery rather than rollback',async()=>{
 const state=setup(),lease=await state.editor.prepare('after');let saved='before';const outcome=await publishConfigurationEdit(lease,value=>{saved=value;state.retire();return true;});expect(saved).toBe('after');expect(state.value()).toBe('after');expect(outcome.publicationErrors).toHaveLength(1);expect(state.events).toEqual(['apply','release:false']);expect(state.pending()).toBe(false);expect(state.broken).toHaveLength(1);
});
