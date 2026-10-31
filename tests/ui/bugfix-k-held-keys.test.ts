import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createHeldKeyGate,heldKeyCommand,HELD_KEY_BLOCKING,HELD_KEY_PLACE,HELD_KEY_STALE,HELD_KEY_TIMEOUT,type HeldKeyCommand} from '../../src/ui/held-key-gate';
// IFACE8R-F1 (src/ui/App.tsx:495 returned from the keydown handler
// whenever workspaceTransaction or storageMutation was set (except Ctrl+S during the background save), so Ctrl+Z/Ctrl+Y,
// Alt+T/F/Shift+R/H/J/V/C, Escape and "." pressed during the routine autosave were dropped with no message. The gate
// queues them behind the write (hold state and owner re-checked before each key) or refuses them visibly.
// Pure module + App source pin; no DOM or package.
const key=(k:string,mods:Partial<{ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean}>={})=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...mods});
type Hold='idle'|'background'|'blocking';
function harness(onRun:(command:HeldKeyCommand,set:(value:Hold)=>void)=>void=()=>{}){
 let state:Hold='background',owner=1,clock=0;const waiters:Array<()=>void>=[],retries:Array<()=>void>=[],ran:HeldKeyCommand[]=[],messages:string[]=[];
 const set=(value:Hold)=>{state=value;};
 // App's finishStorageMutation runs every waiter in one microtask loop (App.tsx:553); the harness runs them in one loop too.
 const gate=createHeldKeyGate({state:()=>state,afterWrite:run=>{waiters.push(run);return()=>{};},capture:()=>{const at=owner;return()=>owner===at;},run:command=>{ran.push(command);onRun(command,set);},report:message=>messages.push(message),retry:run=>{retries.push(run);},now:()=>clock,maxWaitMs:1000});
 return{gate,ran,messages,set,retries,replace:()=>{owner++;},finishWrite:()=>{state='idle';for(const run of waiters.splice(0))run();},tick:(ms:number)=>{clock+=ms;for(const run of retries.splice(0))run();}};
}
const undoOpensHistory=(command:HeldKeyCommand,set:(value:Hold)=>void)=>{if(command.kind==='undo')set('blocking');};
it('IFACE8R-F1: the App keyboard commands are recognised; other keys are not',()=>{
 expect(heldKeyCommand(key('z',{ctrlKey:true}))).toEqual({kind:'undo'});
 expect(heldKeyCommand(key('Z',{ctrlKey:true,shiftKey:true}))).toEqual({kind:'redo'});
 expect(heldKeyCommand(key('y',{metaKey:true}))).toEqual({kind:'redo'});
 expect(heldKeyCommand(key('t',{altKey:true}))).toEqual({kind:'arm',tool:'trendline'});
 expect(heldKeyCommand(key('f',{altKey:true}))).toEqual({kind:'arm',tool:'fibretracement'});
 expect(heldKeyCommand(key('R',{altKey:true,shiftKey:true}))).toEqual({kind:'arm',tool:'box'});
 expect(heldKeyCommand(key('h',{altKey:true}))).toEqual({kind:'place',tool:'hline'});
 expect(heldKeyCommand(key('Escape'))).toEqual({kind:'disarm'});
 expect(heldKeyCommand(key('.'))).toEqual({kind:'layouts'});
 for(const other of [key('s',{ctrlKey:true}),key('a'),key('ArrowLeft'),key('t'),key('z',{ctrlKey:true,altKey:true})])expect(heldKeyCommand(other)).toBeNull();
});
it('IFACE8R-F1: during the background autosave keys are queued and applied in order after the write',()=>{
 const h=harness();
 expect(h.gate.accept({kind:'arm',tool:'trendline'})).toBe(true);expect(h.gate.accept({kind:'undo'})).toBe(true);
 expect(h.ran).toEqual([]);expect(h.gate.pending()).toBe(2);
 h.finishWrite();
 expect(h.ran).toEqual([{kind:'arm',tool:'trendline'},{kind:'undo'}]);expect(h.messages).toEqual([]);
 expect(h.gate.accept({kind:'redo'}),'no hold and nothing queued: the caller handles the key at once').toBe(false);
});
it('IFACE8R-F1: a queued key whose owner was replaced during the save is refused visibly, not applied',()=>{
 const h=harness();h.gate.accept({kind:'undo'});h.replace();h.finishWrite();
 expect(h.ran).toEqual([]);expect(h.messages).toEqual([HELD_KEY_STALE]);
});
it('IFACE8R-F1: a blocking transaction and crosshair placement are refused visibly, never dropped silently',()=>{
 const h=harness();h.set('blocking');
 expect(h.gate.accept({kind:'undo'})).toBe(true);expect(h.messages).toEqual([HELD_KEY_BLOCKING]);
 h.set('background');expect(h.gate.accept({kind:'place',tool:'vline'})).toBe(true);expect(h.messages.at(-1)).toBe(HELD_KEY_PLACE);
 h.finishWrite();expect(h.ran).toEqual([]);
});
it('BKR-1: a queued Ctrl+Z that opens a history transaction holds the next queued keys until it ends; none is dropped',()=>{
 const h=harness(undoOpensHistory);
 h.gate.accept({kind:'undo'});h.gate.accept({kind:'arm',tool:'trendline'});h.gate.accept({kind:'disarm'});
 h.finishWrite();
 expect(h.ran,'the arm key waits while the undo transaction holds').toEqual([{kind:'undo'}]);expect(h.gate.pending()).toBe(2);expect(h.messages).toEqual([]);
 h.tick(50);expect(h.ran).toHaveLength(1);
 h.set('idle');h.tick(50);
 expect(h.ran).toEqual([{kind:'undo'},{kind:'arm',tool:'trendline'},{kind:'disarm'}]);expect(h.messages).toEqual([]);
});
it('BKR-1: a key pressed while earlier keys still wait goes behind them, not first',()=>{
 const h=harness(undoOpensHistory);
 h.gate.accept({kind:'undo'});h.gate.accept({kind:'redo'});h.finishWrite();
 h.set('idle');expect(h.gate.accept({kind:'layouts'}),'the gate keeps order while it still holds keys').toBe(true);
 expect(h.ran).toEqual([{kind:'undo'},{kind:'redo'},{kind:'layouts'}]);
});
it('BKR-1: a hold that never ends refuses the waiting keys visibly once, never silently',()=>{
 const h=harness(undoOpensHistory);
 h.gate.accept({kind:'undo'});h.gate.accept({kind:'redo'});h.finishWrite();
 for(let i=0;i<30&&h.retries.length;i++)h.tick(50);
 expect(h.ran).toEqual([{kind:'undo'}]);expect(h.messages).toEqual([HELD_KEY_TIMEOUT]);expect(h.gate.pending()).toBe(0);
});
it('BKR-1: a new background write started between queued keys is waited out through its own write end',()=>{
 const h=harness((command,set)=>{if(command.kind==='arm')set('background');});
 h.gate.accept({kind:'arm',tool:'box'});h.gate.accept({kind:'undo'});h.finishWrite();
 expect(h.ran).toEqual([{kind:'arm',tool:'box'}]);h.finishWrite();
 expect(h.ran).toEqual([{kind:'arm',tool:'box'},{kind:'undo'}]);
});
it('BKR-3: Escape during a blocking transaction stays silent (as before); other keys are refused visibly',()=>{
 const h=harness();h.set('blocking');
 expect(h.gate.accept({kind:'disarm'})).toBe(true);expect(h.messages).toEqual([]);
 h.gate.accept({kind:'redo'});expect(h.messages).toEqual([HELD_KEY_BLOCKING]);
});
// Pending the reserved App.tsx diff in. Un-skip when the diff lands.
it('IFACE8R-F1 wiring: the App keydown handler routes held keys through the gate instead of returning silently',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toContain("import {createHeldKeyGate,heldKeyCommand,type HeldKeyCommand} from './held-key-gate';");
 expect(app).not.toContain("if((workspaceTransaction.current||storageMutation.current)&&!(backgroundSave.current&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'))return;");
 expect(app).toMatch(/heldKeys\.current!\.accept\(held\)/);
 // The owner check covers the workspace chart grid as well as the active chart and the grid generation.
 expect(app).toContain('gridAt=current.current.grid');expect(app).toContain('current.current.grid===gridAt');
 // A key pressed while queued keys still wait goes behind them.
 expect(app).toContain('heldKeys.current!.pending()>0');
});
