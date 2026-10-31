import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {expect,it} from 'vitest';

const require=createRequire(import.meta.url);
const {createStartupDiagnostics}=require('../../electron/startup-diagnostics.cjs');
const buildId='20261015T170000000Z-abcdef012345';

it('actual local status replacement truncates an older long diagnostic while preserving unrelated synthetic files',()=>{
 const parent=resolve('.cache');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'SYNTHETIC-startup-independent-'));
 try{
  const file=join(directory,'startup-status.json'),other=join(directory,'SYNTHETIC-unrelated.json');
  const retained=Buffer.from('{"synthetic":"untouched local record"}\n');writeFileSync(other,retained);
  writeFileSync(file,'SYNTHETIC previous diagnostic '.repeat(2000));
  const diagnostic=createStartupDiagnostics({userDataPath:directory,ownsProfile:true,buildId});diagnostic.record('start');diagnostic.record('renderer-gone',{type:'renderer',reason:'crashed',exitCode:3221225781});
  const current=readFileSync(file),dto=JSON.parse(current.toString('utf8'));
  expect(current.length).toBeLessThanOrEqual(16384);expect(current.toString()).not.toContain('previous diagnostic');
  expect(dto.events).toEqual([{sequence:1,event:'start'},{sequence:2,event:'renderer-gone',type:'renderer',reason:'crashed',exitCode:3221225781}]);
  expect(readFileSync(other)).toEqual(retained);expect(readdirSync(directory).sort()).toEqual(['SYNTHETIC-unrelated.json','startup-status.json']);
 }finally{if(dirname(resolve(directory))!==parent||!basename(directory).startsWith('SYNTHETIC-startup-independent-'))throw Error('Unexpected synthetic diagnostic cleanup target');rmSync(directory,{recursive:true,force:true});}
});

it('a secondary profile owner cannot erase an existing tail and a new owned session starts a fresh sequence',()=>{
 const parent=resolve('.cache');mkdirSync(parent,{recursive:true});const directory=mkdtempSync(join(parent,'SYNTHETIC-startup-independent-'));
 try{
  const file=join(directory,'startup-status.json'),first=createStartupDiagnostics({userDataPath:directory,ownsProfile:true,buildId});first.record('child-gone',{type:'GPU',reason:'launch-failed',exitCode:-2147483648});
  const original=readFileSync(file);const secondary=createStartupDiagnostics({userDataPath:directory,ownsProfile:false,buildId});secondary.record('start');secondary.record('quit',{exitCode:0});expect(readFileSync(file)).toEqual(original);
  const nextId='20261015T170000001Z-012345abcdef',next=createStartupDiagnostics({userDataPath:directory,ownsProfile:true,buildId:nextId});next.record('start');
  const dto=JSON.parse(readFileSync(file,'utf8'));expect(dto.buildId).toBe(nextId);expect(dto.events).toEqual([{sequence:1,event:'start'}]);expect(dto.events.some((row:{event:string})=>row.event==='child-gone')).toBe(false);
 }finally{if(dirname(resolve(directory))!==parent||!basename(directory).startsWith('SYNTHETIC-startup-independent-'))throw Error('Unexpected synthetic diagnostic cleanup target');rmSync(directory,{recursive:true,force:true});}
});

it('prototype event names and inherited Electron-detail fields provide no diagnostic payload or serialization hooks',()=>{
 const writes:string[]=[],diagnostic=createStartupDiagnostics({userDataPath:resolve('.cache','SYNTHETIC-no-write'),ownsProfile:true,buildId,writer:(_file:string,text:string)=>writes.push(text)});let reads=0;
 const details=Object.create({get type(){reads++;return'GPU';},get reason(){reads++;return'crashed';},get exitCode(){reads++;return 1;},toJSON(){reads++;return'SYNTHETIC private URL and workspace';}});
 for(const event of ['__proto__','constructor','toString'])diagnostic.record(event,details);expect(writes).toEqual([]);
 diagnostic.record('renderer-gone',details);expect(reads).toBe(0);
 expect(JSON.parse(writes[0]).events).toEqual([{sequence:1,event:'renderer-gone'}]);expect(writes[0]).not.toContain('private');
});
