import {expect,it} from 'vitest';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPatch,prepareCandidate,runPatch,compat5StepIds,compat6StepIds as compat6CursorStepIds,compat7StepIds,compat8StepIds,compat9StepIds,compat10StepIds,compat11StepIds} from '../../src/chart/apply-vela-compat-patch.mjs';
// LV-VELA-COMPAT-7 appends the nav-clamp step after the COMPAT-6 steps; for this file's reversals the trailing
// group after COMPAT-5 is the COMPAT-6 cursor-kind steps plus that step.
// LV-VELA-COMPAT-8 appends the nineteen scale-left steps after those; they join the same trailing group.
// LV-VELA-COMPAT-9 appends the nine forward steps after those; they join the same trailing group.
// LV-VELA-COMPAT-10 appends the ten scale-group steps after those; they join the same trailing group.
// LV-VELA-COMPAT-11 appends the twelve render-leftover steps after those; they join the same trailing group.
const compat6StepIds=Object.freeze([...compat6CursorStepIds,...compat7StepIds,...compat8StepIds,...compat9StepIds,...compat10StepIds,...compat11StepIds]);
import plan from '../../src/chart/vela-compat-patch-plan.json';

// Synthetic IO only. These independently pinned prior hashes distinguish the
// five changed runtime outputs from the four byte-identical declarations.
const compat2Hashes:Record<string,string>={
 'dist/chunk-UNUVPQFW.js':'f57e1e36beb7e7b94cd6d56785ceef920ec3768c1522e04bc186cc54a707b67e',
 'dist/index.cjs':'375157034d41882241c2578570d4a942cbbd9b119935e6956db1c66d36785cf2',
 'dist/vela.global.js':'68f9318c3455cad36b356edba135f05ba93aec63973251a85df31778acd7fc71',
 'dist/widget.cjs':'275a628694fa04f6cb87b15fa108edb6480df12c6f8a4401276b99ee0eab25bf',
 'dist/workspace.cjs':'3222ad85239d4a889cbca4d30d58d42264397d30f609fe16d994a7283b6b539b',
 'dist/index.d.ts':'155d4d8169446f57b300bad12a334987bb9ab8238b299890ab3771aae28aedbb',
 'dist/index.d.cts':'88b07643e9b34ca729ecfae4fb6cd96bfa6b137c86d70e20d40d86e3cd92dc19',
 'dist/contributions-BY3zSYiZ.d.ts':'153d0d311749b9ed079fbd9a6eedfc06051bf027f9e64efeef1c96a32a751f91',
 'dist/contributions-DOm40g5-.d.cts':'99665eb60512b107b7ca4b96cfbd3f8fc6e68075daabbc07907b6b4cefc029be',
};
type Row=typeof plan.files[number]&{compat2Sha256:string;compat3Sha256:string};
type State='original'|'magnet'|'compat2'|'compat3'|'patched';
const rows=plan.files as Row[],sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const target=(row:Row)=>path.resolve('node_modules/@luxalgo/vela',row.path);
const runtimes=rows.filter(row=>row.magnetSha256),declarations=rows.filter(row=>!row.magnetSha256);
function bytesAt(row:Row,state:State){
 let bytes=prepareCandidate(readFileSync(target(row)),row);
 if(state==='patched')return bytes;
 const undo=[...row.transformations].reverse().filter(step=>state==='original'||state==='magnet'&&step.id!=='magnet'||state==='compat2'&&['paint-clip-cleanup','drawing-paint-hook',...compat5StepIds,...compat6StepIds].includes(step.id)||state==='compat3'&&['drawing-paint-hook',...compat5StepIds,...compat6StepIds].includes(step.id));
 for(const step of undo){const text=bytes.toString('utf8');expect(text.split(step.after)).toHaveLength(2);bytes=Buffer.from(text.replace(step.after,step.before));}
 expect(sha(bytes)).toBe(state==='original'?row.beforeSha256:state==='magnet'?row.magnetSha256:state==='compat3'?row.compat3Sha256:compat2Hashes[row.path]);
 return bytes;
}
function virtualIO(states:(row:Row,index:number)=>State=()=> 'compat2'){
 const installed=new Map(rows.map(row=>[target(row),readFileSync(target(row))]));
 const initial=new Map(rows.map((row,index)=>[target(row),bytesAt(row,states(row,index))]));
 const bytes=new Map([...initial].map(([file,data])=>[file,Buffer.from(data)]));
 const writes:{file:string;sha256:string}[]=[];
 const io={realpathSync,lstatSync,
  readFileSync:(file:string,encoding?:string)=>{const data=bytes.get(file)??readFileSync(file);return encoding?data.toString(encoding as BufferEncoding):Buffer.from(data);},
  writeFileSync:(file:string,data:Buffer)=>{if(!bytes.has(file))throw Error('Synthetic write outside approved inventory');writes.push({file,sha256:sha(data)});bytes.set(file,Buffer.from(data));},
 };
 const assertOriginals=()=>{for(const[file,data]of initial)expect(bytes.get(file)!.equals(data)).toBe(true);};
 const assertInstalledUntouched=()=>{for(const[file,data]of installed)expect(readFileSync(file).equals(data)).toBe(true);};
 return{io,bytes,writes,initial,assertOriginals,assertInstalledUntouched};
}

it('upgrades exactly the five COMPAT-2 runtimes, retains four declaration bytes and is idempotent',()=>{
 expect(plan.id).toBe('LV-VELA-COMPAT-11');expect(runtimes).toHaveLength(5);expect(declarations).toHaveLength(4);
 for(const row of rows)expect(row.compat2Sha256).toBe(compat2Hashes[row.path]);
 const h=virtualIO();
 expect(inspectPatch(h.io).map(row=>row.state)).toEqual(rows.map(row=>row.magnetSha256?'compat2':'patched'));
 expect(()=>runPatch('--verify',h.io)).toThrow('has not been applied');
 expect(runPatch('--apply',h.io).files.every(row=>row.state==='patched')).toBe(true);
 expect(h.writes.map(row=>row.file)).toEqual(runtimes.map(target));
 for(const row of rows){expect(sha(h.bytes.get(target(row))!)).toBe(row.afterSha256);if(!row.magnetSha256)expect(h.bytes.get(target(row))!.equals(h.initial.get(target(row))!)).toBe(true);}
 expect(runPatch('--verify',h.io).files.every(row=>row.state==='patched')).toBe(true);
 expect(runPatch('--apply',h.io).files.every(row=>row.state==='patched')).toBe(true);
 expect(h.writes).toHaveLength(5);h.assertInstalledUntouched();
},30_000); // Ten more trailing steps per runtime input took this over the 5 s default (6.9 s alone).

it('admits a mixed original/magnet/COMPAT-2/patched inventory and refuses unknown bytes before writes',()=>{
 const mixed:State[]=['original','magnet','compat2','patched','original','original','patched','original','patched'];
 const h=virtualIO((_row,index)=>mixed[index]);
 expect(inspectPatch(h.io).map(row=>row.state)).toEqual(mixed);
 expect(runPatch('--apply',h.io).files.every(row=>row.state==='patched')).toBe(true);
 expect(h.writes.map(row=>row.file)).toEqual(rows.filter((_row,index)=>mixed[index]!=='patched').map(target));
 h.assertInstalledUntouched();
 const unknown=virtualIO(),file=target(runtimes[2]);unknown.bytes.set(file,Buffer.concat([unknown.bytes.get(file)!,Buffer.from('\nSYNTHETIC unapproved state\n')]));
 const before=new Map([...unknown.bytes].map(([name,data])=>[name,Buffer.from(data)]));
 expect(()=>runPatch('--apply',unknown.io)).toThrow('Unapproved patch target hash');expect(unknown.writes).toEqual([]);
 for(const[name,data]of before)expect(unknown.bytes.get(name)!.equals(data)).toBe(true);
 unknown.assertInstalledUntouched();
},30_000);// COMPAT-6 adds 5 steps per runtime to every bytesAt reversal, so this test, which builds two nine-file synthetic inventories, also needs the longer limit under load.

it('restores exact COMPAT-2 bytes after partial, final-write and final-metadata failures, accounting for every attempt',()=>{
 for(const failure of ['partial','final-write','final-metadata'] as const){
  const h=virtualIO(),forwardCount=failure==='partial'?2:5;let writes=0,metadataFailed=false;
  const attempts:{file:string;sha256:string}[]=[];
  expect(()=>runPatch('--apply',{...h.io,
   writeFileSync:(file:string,data:Buffer)=>{
    writes++;attempts.push({file,sha256:sha(data)});
    if(failure!=='final-metadata'&&writes===forwardCount){h.bytes.set(file,Buffer.from('SYNTHETIC partially written runtime'));throw Error('SYNTHETIC '+failure);}
    h.io.writeFileSync(file,data);
   },
   readFileSync:(file:string,encoding?:string)=>{
    if(failure==='final-metadata'&&writes===5&&!metadataFailed&&file.endsWith(path.sep+'LICENSE')){metadataFailed=true;return Buffer.from('SYNTHETIC final metadata mismatch');}
    return h.io.readFileSync(file,encoding);
   },
  })).toThrow(failure==='final-metadata'?'Pinned Vela input mismatch':'SYNTHETIC '+failure);
  const attempted=runtimes.slice(0,forwardCount);
  expect(attempts).toEqual([...attempted.map(row=>({file:target(row),sha256:row.afterSha256})),...attempted.slice().reverse().map(row=>({file:target(row),sha256:compat2Hashes[row.path]}))]);
  expect(writes).toBe(forwardCount*2);expect(metadataFailed).toBe(failure==='final-metadata');
  h.assertOriginals();h.assertInstalledUntouched();
 }
},30_000);// Three full nine-file synthetic transactions; COMPAT-5 adds 18 steps and COMPAT-6 adds 5 per runtime, so the 5 s default is too tight under load.
