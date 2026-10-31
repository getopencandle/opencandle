import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),{WorkspaceStore}=require('../../electron/storage.cjs');
// Actual atomic JSON store on a bounded synthetic workspace directory; no
// Electron IPC, native dialog, real user profile or executable UI evidence.
async function fixture(run:(directory:string)=>Promise<void>){const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-revision-boundary-'));try{await run(directory);}finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe synthetic revision fixture cleanup');await rm(directory,{recursive:true,force:true});}}
const record=(revision:number)=>({schemaVersion:1,revision,savedAt:'2026-10-14T14:00:00Z',data:{label:'Synthetic local revision boundary'}});
it('save and reset reject exhausted revisions before any write and preserve exact committed bytes and metadata',async()=>{
 await fixture(async directory=>{const file=path.join(directory,'workspace.json'),original=JSON.stringify(record(Number.MAX_SAFE_INTEGER));await writeFile(file,original);const store=new WorkspaceStore(directory);expect((await store.load()).revision).toBe(Number.MAX_SAFE_INTEGER);
  await expect(store.save({schemaVersion:1,expectedRevision:Number.MAX_SAFE_INTEGER,data:{label:'Synthetic rejected change'}})).rejects.toMatchObject({code:'REVISION_EXHAUSTED'});await expect(store.reset(Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({code:'REVISION_EXHAUSTED'});
  expect(await readFile(file,'utf8')).toBe(original);expect(await readdir(directory)).toEqual(['workspace.json']);expect((await store.load()).data).toEqual(record(Number.MAX_SAFE_INTEGER).data);
 });
});
it('the final representable revision commits once, later queued operations reject without undoing or corrupting it',async()=>{
 await fixture(async directory=>{const file=path.join(directory,'workspace.json');await writeFile(file,JSON.stringify(record(Number.MAX_SAFE_INTEGER-1)));const store=new WorkspaceStore(directory),save=store.save({schemaVersion:1,expectedRevision:Number.MAX_SAFE_INTEGER-1,data:{label:'Synthetic final safe commit'}}),rejected=store.reset(Number.MAX_SAFE_INTEGER);
  await expect(save).resolves.toMatchObject({revision:Number.MAX_SAFE_INTEGER});await expect(rejected).rejects.toMatchObject({code:'REVISION_EXHAUSTED'});expect(await store.load()).toMatchObject({revision:Number.MAX_SAFE_INTEGER,data:{label:'Synthetic final safe commit'}});expect(await readdir(directory)).toEqual(['workspace.json']);
 });
});
