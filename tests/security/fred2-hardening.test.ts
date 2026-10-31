import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,readdir,rm,stat,utimes,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {FredSeries,seriesInput,urlOf}=require('../../electron/public-fred.cjs');
const {SECONDARY_CHANNELS}=require('../../electron/windows.cjs');

// Robustness of the FRED reader and its layout-window / package wiring. Mocked fetch only.
const csv=(id:string,rows:string[])=>`observation_date,${id}\n${rows.join('\n')}\n`;
const ok=(body:string,type='text/csv')=>new Response(body,{status:200,headers:{'content-type':type}});
async function make(fetchImpl:(url:string,init:any)=>Promise<Response>,extra:Record<string,unknown>={}){
  await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});
  const dir=await mkdtemp(path.join(process.cwd(),'.tmp','fred2-'));
  return{dir,store:new FredSeries({fetchImpl,directory:dir,...extra})};
}
describe('layout window and package wiring',()=>{
  it('a layout window may read a FRED series but not its cache status or clear',()=>{
    expect(SECONDARY_CHANNELS).toContain('lv:fred:series');
    expect(SECONDARY_CHANNELS).not.toContain('lv:fred:status');expect(SECONDARY_CHANNELS).not.toContain('lv:fred:clear');
  });
  it('main registers the FRED channels and the package check covers them',()=>{
    const main=readFileSync('electron/main.cjs','utf8'),pack=readFileSync('scripts/security-package.mjs','utf8');
    for(const c of ['lv:fred:series','lv:fred:status','lv:fred:clear'])expect(main).toContain("'"+c+"': async");
    expect(pack).toContain("if(Object.hasOwn(manifest.sourceHashes,'electron/public-fred.cjs')){");
    for(const t of ['FRED module reaches only https://fred.stlouisfed.org','FRED requests carry no key, token, cookie or credentials and refuse redirects','FRED cache writes are atomic','layout windows may read a FRED series but never its cache status or clear'])expect(pack).toContain(t);
  });
  it('the FRED module honours the package rules it is checked against',()=>{
    const text=readFileSync('electron/public-fred.cjs','utf8');
    expect([...text.matchAll(/https?:\/\/[^\/'"`\s)]+/g)].map(m=>m[0]).every(o=>o==='https://fred.stlouisfed.org')).toBe(true);
    expect(text).not.toMatch(/api_key|apikey|authorization|x-api-key|cookie|bearer/i);
    expect([...text.matchAll(/require\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map(m=>m[1]).sort()).toEqual(['./validation.cjs','node:crypto','node:fs/promises','node:path']);
  });
});
describe('FRED reader robustness',()=>{
  it('rejects ids that only become valid after Unicode upper-casing',()=>{
    for(const bad of ['ß','ﬁ','dgs10\u0000','DGS10\n\nX','DGS 10','dgs10;'])expect(()=>seriesInput({series:bad})).toThrow();
    expect(seriesInput({series:'dgs10'})).toBe('DGS10');
  });
  it('stops reading a huge streamed body at the cap without a content-length',async()=>{
    let pulled=0;
    const stream=new ReadableStream({pull(c){pulled+=1;c.enqueue(new Uint8Array(1024*1024).fill(65));if(pulled>50)c.close();}});
    const {dir,store}=await make(async()=>new Response(stream,{status:200,headers:{'content-type':'text/csv'}}));
    try{
      await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_TOO_LARGE'});
      expect(pulled).toBeLessThan(10);expect(await readdir(dir)).toEqual([]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('rejects a declared oversize body before reading it',async()=>{
    const {dir,store}=await make(async()=>new Response('x',{status:200,headers:{'content-type':'text/csv','content-length':String(9*1024*1024)}}));
    try{await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_TOO_LARGE'});}finally{await rm(dir,{recursive:true,force:true});}
  });
  it('maps an HTML page to not-found whatever the content type or status says',async()=>{
    const bodies=[()=>ok('<!DOCTYPE html><html><body>Not found</body></html>','text/csv'),()=>ok('<html>x</html>','text/html; charset=utf-8'),()=>new Response('nope',{status:404})];
    const {dir,store}=await make(async()=>bodies.shift()!());
    try{for(const id of ['AAA','BBB','CCC'])await expect(store.get({series:id})).rejects.toMatchObject({code:'FRED_NOT_FOUND'});expect(await readdir(dir)).toEqual([]);}finally{await rm(dir,{recursive:true,force:true});}
  });
  it('times out a request that never answers, even when fetch ignores the abort signal',async()=>{
    const {dir,store}=await make(()=>new Promise<Response>(()=>{}),{timeoutMs:50});
    try{await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_OFFLINE'});}finally{await rm(dir,{recursive:true,force:true});}
  });
  it('times out a body that stalls after the headers',async()=>{
    const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('observation_date,DGS10\n'));}});
    const {dir,store}=await make(async()=>new Response(stream,{status:200,headers:{'content-type':'text/csv'}}),{timeoutMs:50});
    try{await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_OFFLINE'});}finally{await rm(dir,{recursive:true,force:true});}
  });
  it('holds the cache cap under concurrent fetches and leaves no temp files',async()=>{
    const rows=Array.from({length:300},(_,i)=>`${new Date(Date.UTC(2000,0,1+i)).toISOString().slice(0,10)},${(i%50)+1.5}`);
    const {dir,store}=await make(async(url:string)=>ok(csv(url.split('id=')[1],rows)),{maxBytes:9000});
    try{
      await Promise.all(['A1','A2','A3','A4','A5','A6'].map(id=>store.get({series:id})));
      let total=0;const names=await readdir(dir);for(const n of names)total+=(await stat(path.join(dir,n))).size;
      expect(total).toBeLessThanOrEqual(9000);expect(names.every(n=>/^[0-9a-f]{64}\.json$/.test(n))).toBe(true);
      expect((await store.status()).bytes).toBeLessThanOrEqual(9000);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('a failed rename leaves no record and no temp file, and the answer is still returned',async()=>{
    const fsp=require('node:fs/promises');
    const fs={...fsp,rename:async()=>{throw new Error('disk');}};
    const {dir,store}=await make(async()=>ok(csv('DGS10',['2026-10-05,4.1'])),{fs});
    try{
      const r=await store.get({series:'DGS10'});expect(r.rows).toHaveLength(1);expect(r.cacheStored).toBe(false);
      expect(await readdir(dir)).toEqual([]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('the temp file is renamed into place, never written to the record path directly',async()=>{
    const fsp=require('node:fs/promises');const writes:string[]=[];const renames:string[][]=[];
    const fs={...fsp,writeFile:async(f:string,...a:any[])=>{writes.push(f);return fsp.writeFile(f,...a);},rename:async(a:string,b:string)=>{renames.push([a,b]);return fsp.rename(a,b);}};
    const {dir,store}=await make(async()=>ok(csv('DGS10',['2026-10-05,4.1'])),{fs});
    try{
      await store.get({series:'DGS10'});
      expect(writes).toHaveLength(1);expect(writes[0]).toMatch(/\.json\.tmp-/);expect(renames).toEqual([[writes[0],writes[0].replace(/\.tmp-.*$/,'')]]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('sweeps stale temp files from a crash but keeps a fresh one',async()=>{
    const {dir,store}=await make(async()=>ok(csv('DGS10',['2026-10-05,4.1'])));
    try{
      const hash='a'.repeat(64);
      const old=path.join(dir,hash+'.json.tmp-'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12)),fresh=path.join(dir,hash+'.json.tmp-'+'1'.repeat(8)+'-1111-1111-1111-'+'1'.repeat(12));
      await writeFile(old,'x');await writeFile(fresh,'y');
      const longAgo=new Date(Date.now()-3600_000);await utimes(old,longAgo,longAgo);
      await store.get({series:'DGS10'});
      const names=await readdir(dir);
      expect(names).not.toContain(path.basename(old));expect(names).toContain(path.basename(fresh));
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('requests only the fixed origin',async()=>{
    const urls:string[]=[];const {dir,store}=await make(async(url:string)=>{urls.push(url);return ok(csv('DGS10',['2026-10-05,4.1']));});
    try{await store.get({series:'DGS10'});expect(urls).toEqual([urlOf('DGS10')]);expect(new URL(urls[0]).origin).toBe('https://fred.stlouisfed.org');}finally{await rm(dir,{recursive:true,force:true});}
  });
});
