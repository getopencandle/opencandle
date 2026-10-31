import {expect,it,vi} from 'vitest';
import {confirmDrawingPublication} from '../../src/ui/drawing-capture-confirmation';

it('confirms exact persisted drawing metadata and geometry before refreshing',()=>{
 const saved={version:1,drawings:[{id:'a',style:{lineColor:'#12345680'}}],lvDrawingManager:{templates:[{id:'one'}]}},refresh=vi.fn();
 expect(confirmDrawingPublication({assertCurrent(){},readSaved:()=>saved,readNative:()=>structuredClone(saved),refresh})).toBe(true);expect(refresh).toHaveBeenCalledOnce();
});
it('rejected or partial grid publication never receives an accepted confirmation',()=>{
 const refresh=vi.fn();for(const saved of [undefined,{drawings:[]},{drawings:[{id:'a'}],lvDrawingManager:{templates:[]}}])expect(confirmDrawingPublication({assertCurrent(){},readSaved:()=>saved,readNative:()=>({drawings:[{id:'a'}],lvDrawingManager:{templates:[{id:'one'}]}}),refresh})).toBe(false);expect(refresh).not.toHaveBeenCalled();
});
it('ownership is rechecked after native reads and before refreshing replacement state',()=>{
 let active=true;const refresh=vi.fn();expect(()=>confirmDrawingPublication({assertCurrent(){if(!active)throw Error('Owner replaced');},readSaved:()=>({drawings:[]}),readNative:()=>{active=false;return{drawings:[]};},refresh})).toThrow('Owner replaced');expect(refresh).not.toHaveBeenCalled();
});
it('a reentrant saved-state mutation cannot pass a previously matching snapshot',()=>{
 let saved={drawings:[] as {id:string}[]};const refresh=vi.fn();expect(confirmDrawingPublication({assertCurrent(){},readSaved:()=>saved,readNative:()=>{saved={drawings:[{id:'new'}]};return{drawings:[]};},refresh})).toBe(false);expect(refresh).not.toHaveBeenCalled();
});
