import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,readdir,rm,stat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {FredSeries,parseFredCsv,seriesInput,urlOf}=require('../../electron/public-fred.cjs');

// Mocked fetch only. No network.
const DAY=86400000;
const csv=(id:string,rows:string[])=>`observation_date,${id}\n${rows.join('\n')}\n`;
const ok=(body:string,type='text/csv')=>new Response(body,{status:200,headers:{'content-type':type}});
function harness(responses:Array<()=>Response|Promise<Response>>,extra:Record<string,unknown>={}){
  const calls:string[]=[];let at=Date.UTC(2026,9,28);
  const fetchImpl=async(url:string)=>{calls.push(url);const next=responses.shift();if(!next)throw new TypeError('offline');return next();};
  return{calls,advance:(ms:number)=>{at+=ms;},make:async()=>{await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});const dir=await mkdtemp(path.join(process.cwd(),'.tmp','fred-'));return{dir,store:new FredSeries({fetchImpl,directory:dir,now:()=>at,...extra})};}};
}
describe('FRED CSV parsing',()=>{
  it('skips "." missing values, sorts, dedupes, keeps native weekly dates',()=>{
    expect(parseFredCsv(csv('DGS10',['2026-10-05,4.1','2026-10-06,.','2026-10-07,4.2','2026-10-02,4.0']),'DGS10')).toEqual([[Date.UTC(2026,9,2)/1000,4],[Date.UTC(2026,9,5)/1000,4.1],[Date.UTC(2026,9,7)/1000,4.2]]);
    expect(parseFredCsv('DATE,UNRATE\n2026-09-01,4.3\n','UNRATE')).toHaveLength(1);
  });
  it('keeps negative values (yield gaps) and rejects wrong header, malformed rows',()=>{
    expect(parseFredCsv(csv('T10Y2Y',['2026-10-05,-0.25']),'T10Y2Y')[0][1]).toBe(-0.25);
    expect(()=>parseFredCsv(csv('OTHER',['2026-10-05,1']),'DGS10')).toThrow(/data table/);
    expect(()=>parseFredCsv('<html>nope</html>','DGS10')).toThrow();
    expect(()=>parseFredCsv(csv('DGS10',['10/05/2026,1']),'DGS10')).toThrow(/date/);
  });
  it('validates series ids',()=>{
    expect(seriesInput({series:' dgs10 '})).toBe('DGS10');
    for(const bad of ['../x','A B','','X'.repeat(26),'DGS10&id=2'])expect(()=>seriesInput({series:bad})).toThrow();
    expect(()=>seriesInput({series:'DGS10',url:'http://x'})).toThrow();
    expect(urlOf('DGS10')).toBe('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10');
  });
});
describe('FredSeries on-demand cache',()=>{
  it('fetches one series, caches it, and reopens within a day without a request',async()=>{
    const h=harness([()=>ok(csv('DGS10',['2026-10-05,4.1','2026-10-06,4.2']))]);const {dir,store}=await h.make();
    try{
      const first=await store.get({series:'DGS10'});
      expect(first).toMatchObject({series:'DGS10',cached:false,stale:false});expect(h.calls).toEqual([urlOf('DGS10')]);
      h.advance(DAY-1000);
      expect(await store.get({series:'DGS10'})).toMatchObject({cached:true,stale:false});expect(h.calls).toHaveLength(1);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('refreshes after a day; offline refresh returns the saved copy marked stale',async()=>{
    const h=harness([()=>ok(csv('DGS2',['2026-10-05,3.9'])),()=>ok(csv('DGS2',['2026-10-05,3.9','2026-10-06,4.0']))]);const {dir,store}=await h.make();
    try{
      await store.get({series:'DGS2'});h.advance(DAY+1);
      expect((await store.get({series:'DGS2'})).rows).toHaveLength(2);expect(h.calls).toHaveLength(2);
      h.advance(DAY+1);
      const stale=await store.get({series:'DGS2'});expect(stale).toMatchObject({cached:true,stale:true});expect(stale.notice).toMatch(/could not be reached/);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('reports unknown series and offline with plain coded errors',async()=>{
    const h=harness([()=>new Response('',{status:404}),()=>ok('<html>Not found</html>','text/html'),()=>{throw new TypeError('fetch failed');}]);const {dir,store}=await h.make();
    try{
      await expect(store.get({series:'NOPE1'})).rejects.toMatchObject({code:'FRED_NOT_FOUND'});
      await expect(store.get({series:'NOPE2'})).rejects.toMatchObject({code:'FRED_NOT_FOUND'});
      await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_OFFLINE'});
      expect(await readdir(dir)).toEqual([]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('refuses redirects, oversize bodies and bad input without caching',async()=>{
    const h=harness([()=>new Response('',{status:302,headers:{location:'https://evil.example/'}}),()=>ok('x'.repeat(5*1024*1024))]);const {dir,store}=await h.make();
    try{
      await expect(store.get({series:'DGS10'})).rejects.toMatchObject({code:'REDIRECT_DENIED'});
      await expect(store.get({series:'DGS2'})).rejects.toMatchObject({code:'FRED_TOO_LARGE'});
      await expect(store.get({series:'../etc'})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
      expect(h.calls).toHaveLength(2);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('enforces the total cap with least-recently-used eviction',async()=>{
    const rows=(n:number)=>Array.from({length:n},(_,i)=>`${new Date(Date.UTC(2000,0,1+i)).toISOString().slice(0,10)},${(i%50)+1.5}`);
    const h=harness([()=>ok(csv('AAA',rows(300))),()=>ok(csv('BBB',rows(300))),()=>ok(csv('CCC',rows(300)))],{maxBytes:9000});const {dir,store}=await h.make();
    try{
      await store.get({series:'AAA'});await store.get({series:'BBB'});
      const both=await store.status();expect(both.entries).toBeGreaterThan(0);expect(both.bytes).toBeLessThanOrEqual(9000);
      await store.get({series:'CCC'});
      const status=await store.status();expect(status.bytes).toBeLessThanOrEqual(9000);expect(status.entries).toBeLessThan(3);
      let total=0;for(const n of await readdir(dir))total+=(await stat(path.join(dir,n))).size;expect(total).toBeLessThanOrEqual(9000);
      // the newest write survives eviction
      expect(await store.get({series:'CCC'})).toMatchObject({cached:true});
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('drops a damaged record, reports status and clears',async()=>{
    const h=harness([()=>ok(csv('DGS10',['2026-10-05,4.1'])),()=>ok(csv('DGS10',['2026-10-05,4.1']))]);const {dir,store}=await h.make();
    try{
      await store.get({series:'DGS10'});expect(await store.status()).toMatchObject({entries:1,maxBytes:5*1024*1024});
      const [file]=await readdir(dir);await writeFile(path.join(dir,file),'{broken');
      expect(await store.get({series:'DGS10'})).toMatchObject({cached:false});
      expect(await store.clear()).toMatchObject({entries:0,bytes:0});
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
