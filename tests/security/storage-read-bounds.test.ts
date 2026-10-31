import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

// Actual storage module with a small synthetic byte limit and in-memory fd.
// No files are created and no Electron, native dialog or OS race is exercised.
const source=readFileSync('electron/storage.cjs','utf8');
const require=createRequire(import.meta.url),validation=require('../../electron/validation.cjs');
const dataLimit=64,readLimit=dataLimit+1024;
const record={schemaVersion:1,revision:7,savedAt:'SYNTHETIC timestamp',data:{label:'SYNTHETIC bounded read'}};
const encoded=()=>Buffer.from(JSON.stringify(record));
function fixture(bytes=encoded(),options:{size?:number;regular?:boolean;piece?:number;openError?:unknown;statError?:unknown;readError?:unknown;closeError?:unknown}={}){
 let position=0;
 const handle={
  stat:vi.fn(async()=>{if('statError' in options)throw options.statError;return{size:options.size??bytes.length,isFile:()=>options.regular!==false};}),
  read:vi.fn(async(buffer:Buffer,offset:number,length:number,readPosition:null)=>{
   expect(offset).toBe(0);expect(readPosition).toBeNull();expect(length).toBeGreaterThan(0);expect(length).toBeLessThanOrEqual(Math.min(64*1024,readLimit-position+1));
   if('readError' in options)throw options.readError;
   const count=Math.min(length,options.piece??length,bytes.length-position);
   bytes.copy(buffer,offset,position,position+count);position+=count;return{buffer,bytesRead:count};
  }),
  close:vi.fn(async()=>{if('closeError' in options)throw options.closeError;})
 };
 const fs={open:vi.fn(async(_file:string,_flags:string)=>{if('openError' in options)throw options.openError;position=0;return handle;}),rename:vi.fn(),mkdir:vi.fn(),unlink:vi.fn()};
 const module={exports:{} as any};
 runInNewContext(source,{module,require:(name:string)=>{if(name==='node:fs/promises')return fs;if(name==='node:path')return path;if(name==='./validation.cjs')return{...validation,MAX_JSON_BYTES:dataLimit};throw Error('Unexpected synthetic dependency '+name);},Buffer,TextDecoder,JSON,process,setTimeout});
 return{store:new module.exports.WorkspaceStore('SYNTHETIC profile'),handle,fs,position:()=>position};
}

it('reads one regular fd across short chunks and closes before publishing the exact envelope',async()=>{
 const f=fixture(encoded(),{piece:3});await expect(f.store.load()).resolves.toEqual({...record,storage:{directory:'SYNTHETIC profile',backend:'json-atomic'}});
 expect(f.fs.open).toHaveBeenCalledExactlyOnceWith(path.join('SYNTHETIC profile','workspace.json'),'r');expect(f.handle.stat).toHaveBeenCalledTimes(1);expect(f.handle.read.mock.calls.length).toBeGreaterThan(2);expect(f.handle.close).toHaveBeenCalledTimes(1);expect(f.fs.mkdir).not.toHaveBeenCalled();expect(f.fs.unlink).not.toHaveBeenCalled();expect(f.fs.rename).not.toHaveBeenCalled();
});
it('accepts the exact read cap and performs only a one-byte EOF probe after it',async()=>{
 const initial=encoded(),bytes=Buffer.concat([initial,Buffer.alloc(readLimit-initial.length,32)]),f=fixture(bytes);
 await expect(f.store.load()).resolves.toMatchObject({revision:7,data:record.data});expect(f.position()).toBe(readLimit);expect(f.handle.read.mock.calls.at(-1)?.[2]).toBe(1);expect(f.handle.close).toHaveBeenCalledTimes(1);
});
it('rejects growth beyond the initial stat bound before decoding or publishing it',async()=>{
 const f=fixture(Buffer.alloc(readLimit+1,32),{size:1});await expect(f.store.load()).rejects.toMatchObject({code:'STORAGE_INVALID',message:'Saved workspace exceeds limits.'});
 expect(f.position()).toBe(readLimit+1);expect(f.handle.read).toHaveBeenCalledTimes(1);expect(f.handle.close).toHaveBeenCalledTimes(1);expect(f.fs.mkdir).not.toHaveBeenCalled();expect(f.fs.rename).not.toHaveBeenCalled();expect(f.fs.unlink).not.toHaveBeenCalled();
});
it.each([{size:readLimit+1},{regular:false}])('rejects an initially inadmissible file without reading or changing it (%j)',options=>{
 const f=fixture(encoded(),options);return expect(f.store.load()).rejects.toMatchObject({code:'STORAGE_INVALID'}).then(()=>{expect(f.handle.read).not.toHaveBeenCalled();expect(f.handle.close).toHaveBeenCalledTimes(1);expect(f.fs.unlink).not.toHaveBeenCalled();});
});
it('keeps initial ENOENT as revision zero without acquiring or closing a handle',async()=>{
 const f=fixture(encoded(),{openError:Object.assign(new Error('SYNTHETIC absent'),{code:'ENOENT'})});await expect(f.store.load()).resolves.toMatchObject({revision:0,data:null,savedAt:null});expect(f.handle.stat).not.toHaveBeenCalled();expect(f.handle.close).not.toHaveBeenCalled();
});
it('does not reinterpret a post-open read ENOENT as an empty workspace',async()=>{
 const problem=Object.assign(new Error('SYNTHETIC fd failure'),{code:'ENOENT'}),f=fixture(encoded(),{readError:problem});await expect(f.store.load()).rejects.toBe(problem);expect(f.handle.close).toHaveBeenCalledTimes(1);
});
it('maps invalid UTF-8 to STORAGE_INVALID and closes without repairing or deleting data',async()=>{
 const initial=encoded(),index=initial.indexOf(Buffer.from('bounded')),bytes=Buffer.from(initial);bytes[index]=0xff;const f=fixture(bytes);
 await expect(f.store.load()).rejects.toMatchObject({code:'STORAGE_INVALID',message:'Saved workspace must contain valid UTF-8.'});expect(f.handle.close).toHaveBeenCalledTimes(1);expect(f.fs.unlink).not.toHaveBeenCalled();expect(f.fs.rename).not.toHaveBeenCalled();
});
it('preserves JSON parsing failure for malformed content and leading BOM after closing',async()=>{
 for(const bytes of [Buffer.from('{SYNTHETIC malformed'),Buffer.concat([Buffer.from([239,187,191]),encoded()])]){const f=fixture(bytes);await expect(f.store.load()).rejects.toThrow();expect(f.handle.close).toHaveBeenCalledTimes(1);expect(f.fs.unlink).not.toHaveBeenCalled();}
});
it('retains the primary stat/read failure if closing also fails, including thrown undefined',async()=>{
 for(const primary of [undefined,new Error('SYNTHETIC primary')])for(const phase of ['statError','readError']){
  const f=fixture(encoded(),{[phase]:primary,closeError:new Error('SYNTHETIC close failure')});let failed=false,cause:unknown;
  try{await f.store.load();}catch(error){failed=true;cause=error;}expect(failed).toBe(true);expect(cause).toBe(primary);expect(f.handle.close).toHaveBeenCalledTimes(1);
 }
});
it('rejects a close failure after an otherwise valid read rather than reporting a successful load',async()=>{
 const problem=new Error('SYNTHETIC close failure'),f=fixture(encoded(),{closeError:problem});await expect(f.store.load()).rejects.toBe(problem);expect(f.handle.close).toHaveBeenCalledTimes(1);
});
it('failed bounded CAS loading stops both save and reset before any write or unlink',async()=>{
 const f=fixture(Buffer.alloc(readLimit+1,32),{size:0});await expect(f.store.save({expectedRevision:7,data:{synthetic:true}})).rejects.toMatchObject({code:'STORAGE_INVALID'});await expect(f.store.reset(7)).rejects.toMatchObject({code:'STORAGE_INVALID'});
 expect(f.fs.mkdir).not.toHaveBeenCalled();expect(f.fs.rename).not.toHaveBeenCalled();expect(f.fs.unlink).not.toHaveBeenCalled();expect(f.fs.open.mock.calls.every(call=>call[1]==='r')).toBe(true);
});
