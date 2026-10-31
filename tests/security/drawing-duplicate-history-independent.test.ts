import {expect,it} from 'vitest';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';

it('keeps opaque values in the exact prepared history entry and restores both branch values',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>();
 const old={name:'SYNTHETIC old'},before={drawings:[{id:'SYNTHETIC source',opaque:{future:undefined,minusZero:-0}}]},after={drawings:[...before.drawings,{id:'SYNTHETIC copy',opaque:{future:undefined,minusZero:-0}}]};
 history.record(old,null);const opening=history.status(),prepared=history.prepareRecord(before,null);
 expect(history.status()).toEqual(opening);expect(history.peekUndo()?.workspace).toBe(old);
 prepared.commit();const undo=history.undo(after,null)!.workspace;
 expect(undo).toBe(before);expect(Object.hasOwn((undo.drawings as typeof before.drawings)[0].opaque,'future')).toBe(true);
 expect(Object.is((undo.drawings as typeof before.drawings)[0].opaque.minusZero,-0)).toBe(true);
 expect(history.redo(before,null)!.workspace).toBe(after);
 expect(history.undo(after,null)!.workspace).toBe(before);expect(history.undo(before,null)!.workspace).toBe(old);
});

it('precomputes the record so commit calls no workspace getters or serialization hooks',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>(),workspace={payload:{value:'SYNTHETIC accepted'}},prepared=history.prepareRecord(workspace,null);
 let reads=0;Object.defineProperty(workspace,'payload',{configurable:true,enumerable:true,get(){reads++;throw Error('SYNTHETIC forbidden commit read');}});
 prepared.assertCurrent();prepared.commit();expect(reads).toBe(0);expect(history.peekUndo()?.workspace).toBe(workspace);
});

it('rejects an oversized candidate without trimming or clearing either existing stack',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>({steps:4,bytes:300});
 history.record({name:'SYNTHETIC one'},null);history.record({name:'SYNTHETIC two'},null);history.undo({name:'SYNTHETIC three'},null);
 const status=history.status(),past=history.peekUndo(),future=history.peekRedo();
 expect(()=>history.prepareRecord({payload:'x'.repeat(1000)},null)).toThrow();
 expect(history.status()).toEqual(status);expect(history.peekUndo()).toBe(past);expect(history.peekRedo()).toBe(future);
});

it('an empty undo or redo attempt permanently retires a prepared record',()=>{
 for(const method of ['undo','redo'] as const){
  const history=createWorkspaceHistory<Record<string,unknown>>(),prepared=history.prepareRecord({name:'SYNTHETIC before'},null);
  expect(history[method]({name:'SYNTHETIC current'},null)).toBeNull();
  expect(()=>prepared.commit()).toThrow();expect(history.peekUndo()).toBeNull();
  history.clear();expect(()=>prepared.assertCurrent()).toThrow();
 }
});

it('a rejected serialization attempt retires an older lease without replacing its history',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>(),old={name:'SYNTHETIC retained'};
 history.record(old,null);const prepared=history.prepareRecord({name:'SYNTHETIC prepared'},null),status=history.status();
 expect(()=>history.record({payload:1n},null)).toThrow();expect(history.status()).toEqual(status);
 expect(history.peekUndo()?.workspace).toBe(old);expect(()=>prepared.commit()).toThrow();
});

it('serialization reentry may commit the inner prepared record but cannot commit the stale outer one',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>();let entered=false;
 const payload={toJSON(){if(!entered){entered=true;history.prepareRecord({name:'SYNTHETIC inner'},null).commit();}return 'SYNTHETIC outer';}};
 expect(()=>history.prepareRecord({payload},null)).toThrow();
 expect(history.status().undo).toBe(1);expect(history.peekUndo()?.workspace).toEqual({name:'SYNTHETIC inner'});
});

it('borrowed lease calls cannot retire the genuine owner and commit is one-use',()=>{
 const history=createWorkspaceHistory<Record<string,unknown>>(),prepared=history.prepareRecord({name:'SYNTHETIC exact'},null),copy={...prepared};
 expect(()=>prepared.assertCurrent.call(copy)).toThrow();expect(()=>prepared.commit.call(copy)).toThrow();
 prepared.assertCurrent();prepared.commit();expect(history.status().undo).toBe(1);
 expect(()=>prepared.assertCurrent()).toThrow();expect(()=>prepared.commit()).toThrow();expect(history.status().undo).toBe(1);
});
