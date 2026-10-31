import {expect,it} from 'vitest';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';

it('prepares without a write and commits one exact undo step with future fields intact',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>(),prior={name:'prior'},before={name:'before',opaque:{absent:undefined,zero:-0}},after={name:'after'};
 history.record(prior,null);
 const prepared=history.prepareRecord(before,null);
 expect(history.status().undo).toBe(1);expect(history.peekUndo()?.workspace).toBe(prior);
 prepared.assertCurrent();prepared.commit();
 expect(history.status().undo).toBe(2);expect(history.peekUndo()?.workspace).toBe(before);
 expect(()=>prepared.commit()).toThrow(/consumed/);
 const restored=history.undo(after,null)!.workspace;
 expect(restored).toBe(before);expect(Object.hasOwn(restored.opaque as object,'absent')).toBe(true);
 expect(Object.is((restored.opaque as any).zero,-0)).toBe(true);
 expect(history.redo(before,null)?.workspace).toBe(after);
 expect(history.undo(after,null)?.workspace).toBe(before);
 expect(history.undo(before,null)?.workspace).toBe(prior);
});

it('rejects an oversized prepared undo step without erasing either history stack',()=>{
 const history=createWorkspaceHistory<any>({steps:3,bytes:250});
 history.record({name:'one'},null);history.record({name:'two'},null);history.undo({name:'three'},null);
 const opening=history.status(),undo=history.peekUndo(),redo=history.peekRedo();
 expect(()=>history.prepareRecord({large:'x'.repeat(300)},null)).toThrow(/undo step/);
 expect(history.status()).toEqual(opening);expect(history.peekUndo()).toBe(undo);expect(history.peekRedo()).toBe(redo);
});

it.each(['record','undo','redo','clear'] as const)('retires preparation before a supported %s mutation attempt',method=>{
 const history=createWorkspaceHistory<any>(),prepared=history.prepareRecord({name:'opening'},null);
 if(method==='clear')history.clear();else history[method]({name:'other'},null);
 expect(()=>prepared.assertCurrent()).toThrow(/changed/);
 expect(()=>prepared.commit()).toThrow(/retired/);
});

it('rejects copied receivers and competing prepared commits without reviving an old owner',()=>{
 const history=createWorkspaceHistory<any>(),first=history.prepareRecord({name:'first'},null),second=history.prepareRecord({name:'second'},null);
 expect(()=>first.commit.call({...first})).toThrow(/Foreign/);
 first.assertCurrent();second.commit();expect(()=>first.commit()).toThrow(/changed/);
 expect(history.status().undo).toBe(1);expect(history.peekUndo()?.workspace).toEqual({name:'second'});
});

it('precomputes bounded trimming while keeping ordinary oversized-record barrier behavior',()=>{
 const history=createWorkspaceHistory<any>({steps:2,bytes:300});
 history.record({value:1},null);history.record({value:2},null);
 const prepared=history.prepareRecord({value:3},null);expect(history.status().dropped).toBe(0);
 prepared.commit();expect(history.status()).toMatchObject({undo:2,redo:0,dropped:1});
 expect(history.undo({value:4},null)?.workspace).toEqual({value:3});
 expect(history.undo({value:3},null)?.workspace).toEqual({value:2});
 history.record({large:'x'.repeat(500)},null);expect(history.peekUndo()).toBeNull();expect(history.peekRedo()).toBeNull();
});

it('does not use a prepared row after serialization reenters a supported history mutation',()=>{
 const history=createWorkspaceHistory<any>();
 const value={toJSON(){history.clear();return {name:'changed during preparation'};}};
 expect(()=>history.prepareRecord({value},null)).toThrow(/changed/);
 expect(history.status().undo).toBe(0);
});

it('a failing supported record attempt retires an older prepared owner',()=>{
 const history=createWorkspaceHistory<any>(),prepared=history.prepareRecord({name:'opening'},null);
 expect(()=>history.record({value:1n},null)).toThrow();
 expect(()=>prepared.commit()).toThrow(/changed/);expect(history.status().undo).toBe(0);
});
