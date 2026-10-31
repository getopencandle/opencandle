import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, readdir, writeFile, mkdir,rename } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const v = require('../../electron/validation.cjs');
const { WorkspaceStore } = require('../../electron/storage.cjs');
describe('privileged IPC input boundary', () => {
  it('rejects credentials, exotic prototypes, cycles, unsafe keys, nonfinite values and invalid revisions', () => {
    const cycle:any = {}; cycle.self = cycle;
    const invalid = [{apiKey:'synthetic-never-store'}, Object.create({x:1}), cycle, JSON.parse('{"__proto__":{"polluted":true}}'), {x:Infinity}, {x:()=>1}];
    for (const data of invalid) expect(() => v.jsonData(data)).toThrow();
    for (const expectedRevision of [-1,0.1,NaN,'0']) expect(() => v.saveInput({schemaVersion:1,expectedRevision,data:{}})).toThrow();
    expect(() => v.saveInput({schemaVersion:1,expectedRevision:0,data:{},filePath:'C:\\private'})).toThrow();
    expect(v.saveInput({schemaVersion:1,expectedRevision:0,data:{label:'Synthetic',bars:[{close:2}]}}).data.label).toBe('Synthetic');
  });
  it('rejects arbitrary origins, encoded traversal, backslashes and null paths', () => {
    const root = path.resolve('dist');
    for (const url of ['https://app/index.html','lv://other/index.html','lv://user@app/index.html','lv://app/%2e%2e%2fprivate','lv://app/%5cprivate','lv://app/%00private']) expect(v.assetPath(url,root)).toBeNull();
    expect(v.assetPath('lv://app/assets/chart.js',root)).toBe(path.join(root,'assets','chart.js'));
    expect(new URL('lv://app/index.html').origin).toBe('null');
    expect(v.isAppURL('lv://app/index.html')).toBe(true);
    for(const url of ['https://app/index.html','lv://app:123/index.html','lv://user@app/index.html','lv://app.evil/index.html','not a URL'])expect(v.isAppURL(url)).toBe(false);
  });
  it('rejects invalid PNG exports and unsafe filenames', () => {
    expect(() => v.pngInput({pngDataUrl:'data:image/png;base64,YQ=='})).toThrow();
    const pngDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
    expect(() => v.pngInput({pngDataUrl,suggestedName:'../../file.png'})).toThrow();
    expect(v.pngInput({pngDataUrl}).bytes.length).toBe(8);
  });
  it('bounds UTF-8 CSV exports and never accepts renderer destination paths',()=>{
    const input={text:'Synthetic,price\nexample,2\n',suggestedName:'LV-SYNTHETIC.csv',format:'csv'};
    expect(v.csvInput(input).bytes.toString('utf8')).toBe(input.text);
    for(const bad of [{...input,path:'C:\\private'},{...input,suggestedName:'../file.csv'},{...input,suggestedName:'a/b.csv'},{...input,format:'exe'},{...input,text:'é'.repeat(10*1024*1024+1)}])expect(()=>v.csvInput(bad)).toThrow();
  });
  it('exports bounded valid JSON objects without credential/prototype keys or extension mismatch',()=>{
    const text='{"fixture":"Synthetic only","kind":"calendar","rows":[]}';const input={text,suggestedName:'LV-SYNTHETIC-calendar.json',format:'json'};
    expect(v.dataExportInput(input).bytes.toString('utf8')).toBe(text);
    for(const invalid of [{...input,text:'{bad'},{...input,text:'[]'},{...input,text:'{"apiKey":"never-store"}'},{...input,text:'{"__proto__":{}}'},{...input,suggestedName:'file.csv'},{...input,filePath:'C:\\private'}])expect(()=>v.dataExportInput(invalid)).toThrow();
  });
  it('exports bounded plain TXT through the same native boundary without executing or accepting paths',()=>{
    const input={text:'SYNTHETIC:GME,SYNTHETIC:SPY\n',suggestedName:'LV-SYNTHETIC-watchlist.txt',format:'txt'};
    expect(v.dataExportInput(input).bytes.toString('utf8')).toBe(input.text);
    for(const invalid of [{...input,path:'C:\\private'},{...input,suggestedName:'file.ps1'},{...input,suggestedName:'../file.txt'},{...input,text:'é'.repeat(10*1024*1024+1)}])expect(()=>v.dataExportInput(invalid)).toThrow();
  });
});
describe('atomic local workspace persistence', () => {
  it('retries transient Windows rename denial atomically and preserves the prior commit on exhaustion',async()=>{
    const parent=path.resolve('.tmp');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'synthetic-storage-retry-'));
    try{
      const baseline=new WorkspaceStore(directory);await baseline.save({expectedRevision:0,data:{label:'Synthetic prior commit'}});
      let attempts=0;
      const transient=new WorkspaceStore(directory,{rename:async(from:string,to:string)=>{attempts++;expect((JSON.parse(await readFile(to,'utf8'))).data.label).toBe('Synthetic prior commit');if(attempts<=2)throw Object.assign(new Error('Synthetic busy file'),{code:attempts===1?'EPERM':'EBUSY'});return rename(from,to);}});
      const saved=await transient.save({expectedRevision:1,data:{label:'Synthetic next commit'}});expect(saved.revision).toBe(2);expect(attempts).toBe(3);expect((await transient.load()).data.label).toBe('Synthetic next commit');expect(await readdir(directory)).toEqual(['workspace.json']);
      const priorBytes=await readFile(path.join(directory,'workspace.json'),'utf8');let failures=0;
      const blocked=new WorkspaceStore(directory,{rename:async()=>{failures++;throw Object.assign(new Error('Synthetic persistent denial'),{code:'EPERM'});}});
      await expect(blocked.save({expectedRevision:2,data:{label:'Synthetic never committed'}})).rejects.toThrow('persistent denial');expect(failures).toBe(6);expect(await readFile(path.join(directory,'workspace.json'),'utf8')).toBe(priorBytes);expect((await blocked.load()).revision).toBe(2);expect(await readdir(directory)).toEqual(['workspace.json']);
      const later=await baseline.save({expectedRevision:2,data:{label:'Synthetic recovery'}});expect(later.revision).toBe(3);
    }finally{const relative=path.relative(parent,path.resolve(directory));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe storage fixture cleanup.');await rm(directory,{recursive:true,force:true});}
  });
  it('serializes competing writes, preserves prior committed revision and leaves no temporary files', async () => {
    await mkdir(path.resolve('.tmp'), {recursive:true});
    const directory=await mkdtemp(path.resolve('.tmp/security-store-'));
    try {
      const store=new WorkspaceStore(directory);
      expect((await store.load()).revision).toBe(0);
      const results=await Promise.allSettled([store.save({expectedRevision:0,data:{label:'Synthetic A'}}),store.save({expectedRevision:0,data:{label:'Synthetic B'}})]);
      expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('rejected');
      if(results[1].status==='rejected') expect(results[1].reason.code).toBe('REVISION_CONFLICT');
      expect((await store.load()).data.label).toBe('Synthetic A');
      await store.save({expectedRevision:1,data:{label:'Synthetic C'}});
      const file=JSON.parse(await readFile(path.join(directory,'workspace.json'),'utf8'));
      expect(file.revision).toBe(2); expect(file.data.label).toBe('Synthetic C');
      expect(await readdir(directory)).toEqual(['workspace.json']);
      const cleared=await store.reset(2);expect(cleared.revision).toBe(3);expect((await store.load()).data).toBeNull();
      await expect(store.save({expectedRevision:2,data:{label:'Synthetic stale'}})).rejects.toThrow('Workspace changed');
      expect(await readFile(path.join(directory,'workspace.json'),'utf8')).not.toContain('Synthetic C');
      await writeFile(path.join(directory,'workspace.json'),'{corrupt');
      await expect(store.save({expectedRevision:3,data:{}})).rejects.toThrow();
      expect(await readFile(path.join(directory,'workspace.json'),'utf8')).toBe('{corrupt');
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
});
