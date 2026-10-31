import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {expect,it} from 'vitest';
const require=createRequire(import.meta.url),{createStartupDiagnostics,safeCode}=require('../../electron/startup-diagnostics.cjs');
const buildId='20261015T153000000Z-abcdef012345';
function fixture(options:Record<string,unknown>={}){const writes:{file:string;text:string}[]=[],controller=createStartupDiagnostics({userDataPath:resolve('.cache','SYNTHETIC diagnostics'),ownsProfile:true,buildId,writer:(file:string,text:string)=>writes.push({file,text}),...options});return{controller,writes,last:()=>JSON.parse(writes.at(-1)!.text)};}
it('writes only the fixed local event DTO and trusted build identity',()=>{
 const f=fixture();f.controller.record('child-gone',{type:'GPU',reason:'crashed',exitCode:3221225781,message:'SYNTHETIC private text',stack:'SYNTHETIC stack',url:'https://example.invalid/private',workspace:{secret:'SYNTHETIC'},argv:['SYNTHETIC']});
 expect(f.writes[0].file).toBe(join(resolve('.cache','SYNTHETIC diagnostics'),'startup-status.json'));
 expect(f.last()).toEqual({schemaVersion:1,buildId,startedAt:expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),events:[{sequence:1,event:'child-gone',type:'GPU',reason:'crashed',exitCode:3221225781}]});
 expect(f.writes[0].text).not.toMatch(/private|stack|url|workspace|argv|secret/);
});
it('ignores unknown events and enums without coercion or getter reads',()=>{
 const f=fixture();let reads=0;const hostile={toString(){reads++;throw Error('SYNTHETIC');},valueOf(){reads++;throw Error('SYNTHETIC');}};
 f.controller.record(hostile,{type:'GPU'});f.controller.record('unknown-SYNTHETIC',{reason:'oom'});expect(f.writes).toEqual([]);
 const details={get type(){reads++;return'GPU';},get reason(){reads++;return'crashed';},get exitCode(){reads++;return 5;},get message(){reads++;return'SYNTHETIC secret';}};
 f.controller.record('renderer-gone',details);f.controller.record('child-gone',{type:hostile,reason:'SYNTHETIC unknown reason',exitCode:hostile});
 expect(reads).toBe(0);expect(f.last().events).toEqual([{sequence:1,event:'renderer-gone'},{sequence:2,event:'child-gone'}]);
});
it.each([-2147483648,-1,0,2147483647,2147483648,3221225781,4294967295])('retains exact signed/unsigned32 exit code %s',(code)=>{expect(safeCode(code)).toBe(code);const f=fixture();f.controller.record('quit',{exitCode:code});expect(f.last().events[0].exitCode).toBe(code);});
it.each([undefined,null,'1',1n,NaN,Infinity,-Infinity,1.5,-2147483649,4294967296])('omits invalid exit code %s without coercion',(value)=>{expect(safeCode(value)).toBeNull();const f=fixture();f.controller.record('quit',{exitCode:value});expect(Object.hasOwn(f.last().events[0],'exitCode')).toBe(false);});
it('retains only the last32 events and bounds every serialized write to16KiB',()=>{
 const f=fixture();for(let index=0;index<200;index++)f.controller.record(index%2?'child-gone':'renderer-gone',{type:'Pepper Plugin Broker',reason:'integrity-failure',exitCode:4294967295});
 expect(f.last().events).toHaveLength(32);expect(f.last().events[0].sequence).toBe(169);expect(f.last().events.at(-1).sequence).toBe(200);expect(f.writes.every(write=>Buffer.byteLength(write.text,'utf8')<=16384)).toBe(true);expect(new Set(f.writes.map(write=>JSON.parse(write.text).startedAt)).size).toBe(1);
});
it('requires exact profile ownership and a local absolute directory before writing',()=>{
 for(const options of [{ownsProfile:false},{ownsProfile:undefined},{ownsProfile:'true'},{userDataPath:'relative'}]){const f=fixture(options);f.controller.record('start');expect(f.writes).toEqual([]);}
});
it('uses unknown for malformed build identity and never invokes build getters',()=>{
 for(const value of ['SYNTHETIC-private','20261015T153000000Z-ABCDEF012345','https://example.invalid','a'.repeat(100000),{toString(){throw Error('SYNTHETIC');}}]){const f=fixture({buildId:value});f.controller.record('start');expect(f.last().buildId).toBe('unknown');}
 let reads=0;const writes:string[]=[];const f=createStartupDiagnostics({userDataPath:resolve('.cache','SYNTHETIC'),ownsProfile:true,get buildId(){reads++;return buildId;},writer:(_file:string,text:string)=>writes.push(text)});f.record('start');expect(reads).toBe(0);expect(JSON.parse(writes[0]).buildId).toBe('unknown');
});
it('swallows write failures, keeps the tail, and refuses recursive or borrowed recording',()=>{
 let attempts=0,latest='',f:any;f=createStartupDiagnostics({userDataPath:resolve('.cache','SYNTHETIC'),ownsProfile:true,writer:(_file:string,text:string)=>{attempts++;f.record('startup-failed');if(attempts===1)throw Error('SYNTHETIC private I/O message');latest=text;}});
 expect(Object.isFrozen(f)).toBe(true);expect(()=>f.record('start')).not.toThrow();expect(()=>f.record('ready')).not.toThrow();expect(attempts).toBe(2);expect(JSON.parse(latest).events.map((value:any)=>value.event)).toEqual(['start','ready']);
 const record=f.record;expect(()=>record('quit')).not.toThrow();expect(()=>record.call({},'quit')).not.toThrow();expect(attempts).toBe(2);
});
it('default writer creates only the fixed status leaf and leaves no synthetic fixture files',()=>{
 const folder=mkdtempSync(join(tmpdir(),'lv-startup-SYNTHETIC-'));
 try{const nested=join(folder,'owned'),f=createStartupDiagnostics({userDataPath:nested,ownsProfile:true,buildId});f.record('start');expect(readdirSync(nested)).toEqual(['startup-status.json']);expect(JSON.parse(readFileSync(join(nested,'startup-status.json'),'utf8')).events).toEqual([{sequence:1,event:'start'}]);}finally{if(resolve(folder)!==folder||dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('lv-startup-SYNTHETIC-'))throw Error('Unexpected synthetic diagnostic cleanup path.');rmSync(folder,{recursive:true,force:true});}
});
