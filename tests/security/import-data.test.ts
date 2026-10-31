import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm,open} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {importDataInput,titles,limits,readLocalText}=require('../../electron/import-data.cjs');
describe('native local JSON data import boundary (no actual dialog pass)',()=>{
  it('accepts only exact known kind without renderer paths, formats or prototype input',()=>{
    for(const kind of ['fundamentals','calendar','news','scripts','watchlist','watchlist-advanced','screener','indicator-templates','workspace','heatmap-metadata']){expect(importDataInput({kind})).toBe(kind);expect(titles[kind]).toContain('JSON');}
    expect(titles.scripts).toContain('CandleScript library');
    expect(titles.watchlist).toContain('TXT');
    expect(titles.screener).toContain('saved screens');
    expect(titles['indicator-templates']).toBe('Import local indicator templates (JSON)');expect(limits['indicator-templates']).toBe(8*1024*1024);
    for(const input of [{kind:'indicator-templates',path:'C:\\private'},{kind:'indicator-templates',format:'txt'},{kind:'indicator-templates',maxBytes:64*1024*1024},{kind:'indicator-templates',execute:true}])expect(()=>importDataInput(input)).toThrow();
    for(const input of [{kind:'screener',url:'https://example.com'},{kind:'screener',execute:true},{kind:'screener',path:'C:\\private'},{kind:'screener',maxBytes:128*1024*1024}])expect(()=>importDataInput(input)).toThrow();
    for(const input of [{kind:'unknown'},{kind:'news',path:'C:\\private'},{kind:'calendar',format:'exe'},{kind:'scripts',execute:true},{kind:'scripts',source:'() => 1'},Object.create({kind:'news'})])expect(()=>importDataInput(input)).toThrow();
  });
  it('watchlist analysis fixes JSON10MiB, fatal UTF-8 and exact kind without renderer-controlled options',async()=>{
    const kind='watchlist-advanced',bound=10*1024*1024;
    expect(titles[kind]).toBe('Import local watchlist analysis (JSON)');expect(limits[kind]).toBe(bound);
    for(const extra of [{path:'C:\\private'},{url:'https://example.com'},{maxBytes:64*1024*1024},{format:'txt'},{execute:true}])expect(()=>importDataInput({kind,...extra})).toThrow();
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-watchlist-analysis-transport-'));
    try{
      const filename=path.join(directory,'SYNTHETIC-watchlist-analysis.json');await writeFile(filename,'\u00e9'.repeat(bound/2));
      const result=await readLocalText(filename,['.json'],limits[kind]);expect(result.bytes).toBe(bound);expect(result.fileName).toBe('SYNTHETIC-watchlist-analysis.json');expect(result.filePath).toBeUndefined();
      const handle=await open(filename,'r+');try{await handle.truncate(bound+1);}finally{await handle.close();}await expect(readLocalText(filename,['.json'],limits[kind])).rejects.toThrow('10 MiB');
      await writeFile(filename,Buffer.from([0xc3,0x28]));await expect(readLocalText(filename,['.json'],limits[kind])).rejects.toThrow('UTF-8');
      const txt=path.join(directory,'SYNTHETIC-watchlist-analysis.txt');await writeFile(txt,'{}');await expect(readLocalText(txt,['.json'],limits[kind])).rejects.toThrow('supported');
    }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe watchlist analysis fixture cleanup path.');await rm(directory,{recursive:true,force:true});}
  });
  it('workspace chooser fixes JSON64MiB and never accepts renderer path, limit, revision or execute options',async()=>{
    expect(titles.workspace).toBe('Import local workspace export (JSON)');expect(limits.workspace).toBe(64*1024*1024);
    for(const extra of [{path:'C:\\private'},{url:'https://example.com'},{maxBytes:128*1024*1024},{format:'txt'},{expectedRevision:1},{execute:true}])expect(()=>importDataInput({kind:'workspace',...extra})).toThrow();
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-workspace-transport-'));
    try{
      const filename=path.join(directory,'SYNTHETIC-workspace.json'),bound=limits.workspace;
      await writeFile(filename,'\u00e9'.repeat(bound/2));const result=await readLocalText(filename,['.json'],bound);expect(result.bytes).toBe(bound);expect(result.fileName).toBe('SYNTHETIC-workspace.json');expect(result.filePath).toBeUndefined();
      const handle=await open(filename,'r+');try{await handle.truncate(bound+1);}finally{await handle.close();}await expect(readLocalText(filename,['.json'],bound)).rejects.toThrow('64 MiB');
      await writeFile(filename,Buffer.from([0xff]));await expect(readLocalText(filename,['.json'],bound)).rejects.toThrow('UTF-8');
      const txt=path.join(directory,'SYNTHETIC-workspace.txt');await writeFile(txt,'{}');await expect(readLocalText(txt,['.json'],bound)).rejects.toThrow('supported');
    }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe workspace fixture cleanup path.');await rm(directory,{recursive:true,force:true});}
  });
  it('enforces the template picker 8MiB bound and JSON-only fatal UTF-8 decoding',async()=>{
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-template-transport-'));
    try{
      const filename=path.join(directory,'SYNTHETIC-templates.json'),bound=limits['indicator-templates'];
      await writeFile(filename,'\u00e9'.repeat(bound/2));const result=await readLocalText(filename,['.json'],bound);expect(result.bytes).toBe(bound);expect(result.fileName).toBe('SYNTHETIC-templates.json');expect(result.filePath).toBeUndefined();
      await writeFile(filename,'\u00e9'.repeat(bound/2)+'x');await expect(readLocalText(filename,['.json'],bound)).rejects.toThrow('8 MiB');
      await writeFile(filename,Buffer.from([0xc3,0x28]));await expect(readLocalText(filename,['.json'],bound)).rejects.toThrow('UTF-8');
      const txt=path.join(directory,'SYNTHETIC-templates.txt');await writeFile(txt,'{}');await expect(readLocalText(txt,['.json'],bound)).rejects.toThrow('supported');
    }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe template fixture cleanup path.');await rm(directory,{recursive:true,force:true});}
  });
  it('bounds watchlist TXT/JSON to2MiB UTF-8 and rejects invalid bytes without returning renderer paths',async()=>{
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-watchlist-transport-'));
    try{
      const text='SYNTHETIC:GME,SYNTHETIC:SPY',txt=path.join(directory,'SYNTHETIC-watchlist.txt');await writeFile(txt,text);
      expect(await readLocalText(txt,['.txt','.json'],2*1024*1024)).toEqual({fileName:'SYNTHETIC-watchlist.txt',format:'txt',text,bytes:Buffer.byteLength(text)});
      const json=path.join(directory,'SYNTHETIC-watchlist.json');await writeFile(json,'{"fixture":"Synthetic transport only"}');expect((await readLocalText(json,['.txt','.json'],2*1024*1024)).format).toBe('json');
      await writeFile(txt,'é'.repeat(1024*1024));expect((await readLocalText(txt,['.txt','.json'],2*1024*1024)).bytes).toBe(2*1024*1024);
      await writeFile(txt,'é'.repeat(1024*1024)+'x');await expect(readLocalText(txt,['.txt','.json'],2*1024*1024)).rejects.toThrow('2 MiB');
      await writeFile(txt,Buffer.from([0xc3,0x28]));await expect(readLocalText(txt,['.txt','.json'],2*1024*1024)).rejects.toThrow('UTF-8');
      for(const bound of [0,-1,NaN,65*1024*1024])await expect(readLocalText(txt,['.txt','.json'],bound)).rejects.toThrow('byte limit');
      expect(()=>importDataInput({kind:'watchlist',maxBytes:64*1024*1024})).toThrow();
    }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe watchlist fixture cleanup path.');await rm(directory,{recursive:true,force:true});}
  });
  it('reads only selected allowed UTF-8 formats under64MiB, rejects invalid bytes/oversize and releases every handle',async()=>{
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-import-data-'));
    try{
      const json=path.join(directory,'SYNTHETIC-news.json');const text='{"fixture":"Synthetic only","text":"é"}';await writeFile(json,text,'utf8');
      const result=await readLocalText(json,['.json']);expect(result).toEqual({fileName:'SYNTHETIC-news.json',format:'json',text,bytes:Buffer.byteLength(text)});expect(result.filePath).toBeUndefined();
      const csv=path.join(directory,'SYNTHETIC-bars.csv');await writeFile(csv,'Synthetic,close\nexample,2');await expect(readLocalText(csv,['.json'])).rejects.toThrow('supported');expect((await readLocalText(csv,['.csv','.json'])).format).toBe('csv');
      const invalid=path.join(directory,'SYNTHETIC-invalid.json');await writeFile(invalid,Buffer.from([0xff]));await expect(readLocalText(invalid,['.json'])).rejects.toThrow('UTF-8');
      const oversized=path.join(directory,'SYNTHETIC-oversized.json');const handle=await open(oversized,'w');try{await handle.truncate(64*1024*1024+1);}finally{await handle.close();}await expect(readLocalText(oversized,['.json'])).rejects.toThrow('64 MiB');
    }finally{
      const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe synthetic-test cleanup path.');await rm(directory,{recursive:true,force:true});
    }
  });
});
