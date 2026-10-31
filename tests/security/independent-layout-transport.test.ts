import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,open,rm} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),{importDataInput,titles,limits,readLocalText}=require('../../electron/import-data.cjs');
it('uses only fixed layouts kind, JSON title and32MiB bound without renderer filesystem capabilities',()=>{
 expect(importDataInput({kind:'layouts'})).toBe('layouts');expect(titles.layouts).toBe('Import local layout (JSON)');expect(limits.layouts).toBe(32*1024*1024);
 for(const extra of [{path:'C:\\private'},{url:'https://example.com'},{maxBytes:64*1024*1024},{format:'txt'},{execute:true},{expectedRevision:1}])expect(()=>importDataInput({kind:'layouts',...extra})).toThrow();
 let reads=0;expect(()=>importDataInput(Object.defineProperty({},'kind',{enumerable:true,get(){reads++;return 'layouts';}}))).toThrow();expect(reads).toBe(0);
});
it('reads exact32MiB UTF-8 layout text, rejects oversized/malformed/wrong-format files and closes handles',async()=>{
 const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-layout-transport-'));
 try{
  const file=path.join(directory,'SYNTHETIC-layout.json'),bound=limits.layouts;
  await writeFile(file,'\u00e9'.repeat(bound/2));const value=await readLocalText(file,['.json'],bound);expect(value.bytes).toBe(bound);expect(value.fileName).toBe('SYNTHETIC-layout.json');expect(Object.keys(value).sort()).toEqual(['bytes','fileName','format','text']);
  const handle=await open(file,'r+');try{await handle.truncate(bound+1);}finally{await handle.close();}await expect(readLocalText(file,['.json'],bound)).rejects.toThrow('32 MiB');
  await writeFile(file,Buffer.from([0xc3,0x28]));await expect(readLocalText(file,['.json'],bound)).rejects.toThrow('UTF-8');
  const txt=path.join(directory,'SYNTHETIC-layout.txt');await writeFile(txt,'{}');await expect(readLocalText(txt,['.json'],bound)).rejects.toThrow('supported');
 }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe layout fixture cleanup path');await rm(directory,{recursive:true,force:true});}
});
