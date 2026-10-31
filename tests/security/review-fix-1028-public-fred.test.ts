import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,readdir,rm,mkdir} from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {FredSeries}=require('../../electron/public-fred.cjs');

// Mocked fetch only, no network. SYNTHETIC values.
const DAY=86400000;
const csv=(id:string,rows:string[])=>`observation_date,${id}\n${rows.join('\n')}\n`;
const ok=(body:string,type='text/csv')=>new Response(body,{status:200,headers:{'content-type':type}});
async function make(responses:Array<()=>Response>,fs:unknown=fsp){
 let at=Date.UTC(2026,9,28);const fetchImpl=async()=>{const next=responses.shift();if(!next)throw new TypeError('offline');return next();};
 await mkdir(path.join(process.cwd(),'.tmp'),{recursive:true});const dir=await mkdtemp(path.join(process.cwd(),'.tmp','fred-rf-'));
 return{dir,advance:(ms:number)=>{at+=ms;},store:new FredSeries({fetchImpl,directory:dir,now:()=>at,fs})};
}
describe('any refresh failure falls back to a valid saved copy (item 4)',()=>{
 const failures:Array<[string,()=>Response]>=[
  ['redirect',()=>new Response('',{status:302,headers:{location:'https://example.invalid/'}})],
  ['HTML 200 page',()=>ok('<!doctype html><title>Maintenance</title>','text/plain')],
  ['HTML content type',()=>ok('<p>down</p>','text/html')],
  ['format change',()=>ok(csv('OTHER',['2026-10-05,1']))],
  ['oversize body',()=>new Response('x',{status:200,headers:{'content-type':'text/csv','content-length':String(50*1024*1024)}})],
  ['no values',()=>ok(csv('DGS10',['2026-10-05,.']))],
 ];
 for(const [name,failure] of failures)it(name,async()=>{
  const h=await make([()=>ok(csv('DGS10',['2026-10-05,4.1'])),failure]);
  try{
   await h.store.get({series:'DGS10'});h.advance(DAY+1);
   const stale=await h.store.get({series:'DGS10'});
   expect(stale).toMatchObject({cached:true,stale:true,rows:[[Date.UTC(2026,9,5)/1000,4.1]]});
   expect(stale.notice).toBe('FRED did not send a usable update this time.');expect(stale.notice).not.toMatch(/no series named/);
  }finally{await rm(h.dir,{recursive:true,force:true});}
 });
 it('without a saved copy the coded error still reaches the caller',async()=>{
  const h=await make([()=>ok('<p>down</p>','text/html')]);
  try{await expect(h.store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_NOT_FOUND'});}finally{await rm(h.dir,{recursive:true,force:true});}
 });
});
describe('a transient read error never deletes the saved copy (item 6)',()=>{
 for(const code of ['EBUSY','EPERM','EACCES'])it(code,async()=>{
  let locked=false;const fs={...fsp,readFile:async(...args:Parameters<typeof fsp.readFile>)=>{if(locked)throw Object.assign(new Error('locked'),{code});return fsp.readFile(...args);}};
  const h=await make([()=>ok(csv('DGS10',['2026-10-05,4.1']))],fs);
  try{
   await h.store.get({series:'DGS10'});const before=await readdir(h.dir);expect(before).toHaveLength(1);
   locked=true;h.advance(1000);await expect(h.store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_OFFLINE'});// unreadable now, and offline
   locked=false;expect(await readdir(h.dir)).toEqual(before);
  }finally{await rm(h.dir,{recursive:true,force:true});}
 });
 it('a corrupt copy is still removed',async()=>{
  const h=await make([()=>ok(csv('DGS10',['2026-10-05,4.1']))]);
  try{
   await h.store.get({series:'DGS10'});const [name]=await readdir(h.dir);await fsp.writeFile(path.join(h.dir,name),'{not json');
   h.advance(DAY+1);await expect(h.store.get({series:'DGS10'})).rejects.toMatchObject({code:'FRED_OFFLINE'});expect(await readdir(h.dir)).toEqual([]);
  }finally{await rm(h.dir,{recursive:true,force:true});}
 });
});
