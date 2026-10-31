import {expect,it} from 'vitest';
import {createHeldKeyGate,type HeldKeyCommand} from '../../src/ui/held-key-gate';
import {missingDrawingTargets} from '../../src/ui/drawing-edit-queue';
// The held-input queue (held-key-gate.ts defer) and the vanished-target refusal (drawing-edit-queue.ts).
// Pure modules; the App wiring is tests/ui/r35-tree-queue-app.test.ts. SYNTHETIC values only.
type Hold='idle'|'background'|'blocking';
function harness(){
 let state:Hold='background';const waiters:Array<()=>void>=[],log:string[]=[],messages:string[]=[];
 const gate=createHeldKeyGate({state:()=>state,afterWrite:run=>{waiters.push(run);return()=>{};},capture:()=>()=>true,run:(command:HeldKeyCommand)=>{log.push('key:'+command.kind);},report:message=>messages.push(message),retry:()=>{}});
 return{gate,log,messages,waiters,set:(value:Hold)=>{state=value;},finishWrite:()=>{state='idle';for(const run of waiters.splice(0))run();}};
}
it('drawing edits and held keys made during the background write run after it, in press order',()=>{
 const h=harness();
 expect(h.gate.defer({run:()=>h.log.push('edit:lock')})).toBe(true);
 expect(h.gate.accept({kind:'undo'})).toBe(true);
 expect(h.gate.defer({run:()=>h.log.push('edit:rename')})).toBe(true);
 expect(h.gate.accept({kind:'redo'})).toBe(true);
 expect(h.log).toEqual([]);expect(h.gate.pending()).toBe(4);
 h.finishWrite();
 expect(h.log).toEqual(['edit:lock','key:undo','edit:rename','key:redo']);expect(h.messages).toEqual([]);
 expect(h.gate.defer({run:()=>h.log.push('late')}),'no hold and nothing queued: the caller runs it now').toBe(false);
});
it('each held entry keeps its place among other work waiting for the write (an indicator change between two edits)',()=>{
 const h=harness();
 h.gate.defer({run:()=>h.log.push('edit:hide')});
 // App's indicatorChartAction registers on the same storage-write waiter list (afterStorageWrite) directly.
 h.waiters.push(()=>h.log.push('indicator:hide'));
 h.gate.accept({kind:'undo'});h.gate.defer({run:()=>h.log.push('edit:lock')});
 h.finishWrite();
 expect(h.log).toEqual(['edit:hide','indicator:hide','key:undo','edit:lock']);
});
it('an edit is not queued during a blocking hold with nothing queued (the caller refuses it as before)',()=>{
 const h=harness();h.set('blocking');
 expect(h.gate.defer({run:()=>h.log.push('edit')})).toBe(false);expect(h.gate.pending()).toBe(0);
});
it('an edit made by an entry running from the queue runs at once instead of moving behind later entries',()=>{
 const h=harness();
 h.gate.defer({run:()=>{h.log.push('first');expect(h.gate.defer({run:()=>h.log.push('nested')})).toBe(false);h.log.push('nested ran inline');}});
 h.gate.defer({run:()=>h.log.push('second')});
 h.finishWrite();
 expect(h.log).toEqual(['first','nested ran inline','second']);
});
it('a failing edit is reported and the rest of the queue still runs',()=>{
 const h=harness();
 h.gate.defer({run:()=>{throw Error('SYNTHETIC failure');}});h.gate.defer({run:()=>h.log.push('after')});
 h.finishWrite();
 expect(h.messages).toEqual(['Error: SYNTHETIC failure']);expect(h.log).toEqual(['after']);
});
it('queued edits do not count toward the held-key limit',()=>{
 const h=harness();for(let i=0;i<20;i++)h.gate.defer({run:()=>{}});
 expect(h.gate.accept({kind:'undo'})).toBe(true);expect(h.messages).toEqual([]);expect(h.gate.pending()).toBe(21);
});
it('missing targets: a plain message for a vanished drawing or group, null while all exist',()=>{
 const manager={list:()=>[{id:'a'},{id:'b'}] as Record<string,unknown>[],state:()=>({groups:[{id:'g1'}]})};
 expect(missingDrawingTargets(manager,{})).toBeNull();
 expect(missingDrawingTargets(manager,{drawings:['a','b'],groups:['g1']})).toBeNull();
 expect(missingDrawingTargets(manager,{drawings:['c']})).toBe('The drawing you changed during the save no longer exists, so that change was not applied.');
 expect(missingDrawingTargets(manager,{drawings:['a','c','d']})).toBe('2 of the 3 drawings you changed during the save no longer exist, so that change was not applied.');
 expect(missingDrawingTargets(manager,{drawings:['c','d']})).toBe('The drawings you changed during the save no longer exist, so that change was not applied.');
 expect(missingDrawingTargets(manager,{groups:['g2']})).toBe('The group you changed during the save no longer exists, so that change was not applied.');
 for(const message of [missingDrawingTargets(manager,{drawings:['c']}),missingDrawingTargets(manager,{groups:['g2']})])expect(message).not.toMatch(/[\u2013\u2014]/);
});
