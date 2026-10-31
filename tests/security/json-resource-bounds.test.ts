import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {jsonData,MAX_JSON_BYTES}=require('../../electron/validation.cjs');
afterEach(()=>vi.restoreAllMocks());

it('rejects a maximum-length sparse array before calling whole-document serialization',()=>{
 const value={rows:new Array(0xffffffff)},serialize=vi.spyOn(JSON,'stringify');
 expect(()=>jsonData(value)).toThrow('Workspace structure exceeds limits.');
 expect(serialize).not.toHaveBeenCalled();expect(value.rows.length).toBe(0xffffffff);
});
it('rejects sparse, accessor and extra-property arrays without invoking a getter',()=>{
 const read=vi.fn(()=>7),accessor=[0];Object.defineProperty(accessor,'0',{get:read});
 const extra=Object.assign([1],{note:'SYNTHETIC omitted array property'});
 const hidden=[1];Object.defineProperty(hidden,'0',{value:1,enumerable:false});
 for(const rows of [new Array(2),[,1],accessor,extra,hidden])expect(()=>jsonData({rows})).toThrow();
 expect(read).not.toHaveBeenCalled();expect(jsonData({rows:[null,0,false,'',[],{}]})).toEqual({rows:[null,0,false,'',[],{}]});
});
it('rejects repeated shared text before materializing an oversized aggregate string',()=>{
 const chunk='x'.repeat(65536),value={rows:Array(512).fill(chunk)},serialize=vi.spyOn(JSON,'stringify');
 // String contents alone equal32MiB. Quotes, commas and the envelope exceed it.
 expect(()=>jsonData(value)).toThrow('Workspace exceeds the 32 MiB limit.');
 expect(serialize).not.toHaveBeenCalled();expect(new Set(value.rows).size).toBe(1);
});
it('accounts for control escaping before serialization instead of raw UTF-8 only',()=>{
 const chunk='\0'.repeat(16384),value={rows:Array(342).fill(chunk)},serialize=vi.spyOn(JSON,'stringify');
 // 342 * 16,384 * 6 escaped bytes already exceed32MiB; input shares one16KiB string.
 expect(()=>jsonData(value)).toThrow('Workspace exceeds the 32 MiB limit.');expect(serialize).not.toHaveBeenCalled();
});
it('accepts exactly32MiB JSON and rejects one extra byte before complete serialization',()=>{
 const padding='x'.repeat(MAX_JSON_BYTES-8),value={x:padding};
 // Literal envelope {"x":""} occupies eight UTF-8 bytes. No files are written.
 const accepted=jsonData(value);expect(accepted.x.length).toBe(MAX_JSON_BYTES-8);expect(accepted.x).toBe(padding);
 const serialize=vi.spyOn(JSON,'stringify');expect(()=>jsonData({x:padding+'x'})).toThrow('Workspace exceeds the 32 MiB limit.');expect(serialize).not.toHaveBeenCalled();
});
it('preserves JSON scalar semantics, repeated acyclic objects and detached results',()=>{
 const common={text:'\b\t\n\f\r\0"\\\u00e9\u20ac\ud83d\ude00\ud800\udc00',numbers:[-0,1e-7,1e21,-3.5]},value={a:common,b:common};
 const result=jsonData(value);expect(result).toEqual({a:{...common,numbers:[0,1e-7,1e21,-3.5]},b:{...common,numbers:[0,1e-7,1e21,-3.5]}});
 expect(Object.is(result.a.numbers[0],-0)).toBe(false);expect(result.a).not.toBe(common);expect(result.a).not.toBe(result.b);
});
it('retains cycle, credential, depth and nonfinite refusal',()=>{
 const cycle:any={};cycle.child=cycle;let deep:any={};for(let i=0;i<81;i++)deep={child:deep};
 for(const value of [cycle,deep,{api_key:'SYNTHETIC never store'},{n:Infinity},{rows:[undefined]}])expect(()=>jsonData(value)).toThrow();
});
