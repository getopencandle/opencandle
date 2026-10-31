import {expect,it} from 'vitest';
import {createFinancialPublicationGuard} from '../../src/ui/financial-publication';
import {measureWorkspaceJSON,prepareWorkspaceJSON,WORKSPACE_JSON_LIMITS} from '../../src/ui/workspace-json';
import {createPaperAccount,type PaperAccount} from '../../src/domain/paper';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {ownedCallbacks} from '../../src/ui/owned-callbacks';
import {fixtureDataset} from '../../src/domain/fixtures';
import {writeFileSync} from 'node:fs';

it('matches independent native JSON byte counts across escaping, omitted fields and normalized maps',()=>{
 const value={a:'😀é\u0000\n"\\\ud800',b:[0,-0,1e-25,true,null],missing:undefined,map:Object.assign(Object.create(null),{name:'x'})};
 const expected=Buffer.byteLength(JSON.stringify(value),'utf8');
 // Root + four scheduled own fields + five array elements + one map field.
 expect(measureWorkspaceJSON(value).bytes).toBe(expected);expect(measureWorkspaceJSON(value).nodes).toBe(11);expect(measureWorkspaceJSON(value).depth).toBe(2);
 expect(prepareWorkspaceJSON(value)).toEqual({a:value.a,b:value.b,map:{name:'x'}});
});
it('measuring keeps the serializer hostile-input rejection without calling getters',()=>{
 let reads=0;const getter={get bad(){reads++;return 1;}};
 for(const value of [getter,{a:[undefined]},{a:new Array(2)},{a:NaN},{password:'never-log-me'}]){expect(()=>measureWorkspaceJSON(value)).toThrow();expect(()=>prepareWorkspaceJSON(value)).toThrow();}
 expect(reads).toBe(0);
});
it('joins account and alert object boundaries exactly at 32 MiB, including empty base objects',()=>{
 const guard=createFinancialPublicationGuard(),paper=createPaperAccount(),alerts:any[]=[],workspace={padding:''};
 const overhead=Buffer.byteLength(JSON.stringify({...workspace,paper,alerts}),'utf8');workspace.padding='x'.repeat(WORKSPACE_JSON_LIMITS.bytes-overhead);
 expect(Buffer.byteLength(JSON.stringify({...workspace,paper,alerts}),'utf8')).toBe(WORKSPACE_JSON_LIMITS.bytes);
 expect(()=>guard(workspace,alerts,paper)).not.toThrow();expect(()=>guard({...workspace,padding:workspace.padding+'x'},alerts,paper)).toThrow('Workspace storage is full');
 expect(()=>guard({},alerts,paper)).not.toThrow();expect(()=>guard({omitted:undefined},alerts,paper)).not.toThrow();
});
it('account recovery bounds apply in ordinary and isolated replay modes',()=>{
 const guard=createFinancialPublicationGuard(),account={padding:''} as unknown as PaperAccount,overhead=Buffer.byteLength(JSON.stringify(account),'utf8');
 (account as any).padding='x'.repeat(20*1024*1024-overhead);
 expect(()=>guard({},[],account)).not.toThrow();expect(()=>guard({},[],{...account,padding:(account as any).padding+'x'} as PaperAccount,true)).toThrow('20 MiB');
 const largeWorkspace={padding:'x'.repeat(16*1024*1024)};
 expect(()=>guard(largeWorkspace,[],account,true)).not.toThrow();expect(()=>guard(largeWorkspace,[],account)).toThrow('Workspace storage is full');
});
it('cache identities invalidate for new workspace and alert collections while every account is measured',()=>{
 const guard=createFinancialPublicationGuard(),workspace=createInitialWorkspace(),paper=createPaperAccount(),alerts:any[]=[];
 expect(()=>guard(workspace,alerts,paper)).not.toThrow();expect(()=>guard({...workspace,secret:'unavailable'},alerts,paper)).toThrow('credential');
 expect(()=>guard(workspace,[{secret:'unavailable'}] as any,paper)).toThrow('credential');
 expect(()=>guard(workspace,alerts,{...paper,secret:'unavailable'} as any)).toThrow('credential');
 expect(()=>guard({...workspace,paper},alerts,paper)).toThrow('ownership');
});
it('owned callback wrappers preserve publication rejection and reject retired tree calls',()=>{
 let current=true;const owner={publish:(value:boolean)=>value},callbacks=ownedCallbacks(()=>owner,()=>current);
 expect(callbacks.publish(true)).toBe(true);expect(callbacks.publish(false)).toBe(false);current=false;expect(callbacks.publish(true)).toBe(false);
});
it('bounds cold and cached capacity checking on a 100000-bar synthetic workspace',()=>{
 const guard=createFinancialPublicationGuard(),workspace={...createInitialWorkspace(),imports:[fixtureDataset('GME',100000)]},alerts:any[]=[],paper=createPaperAccount();
 const started=performance.now();guard(workspace,alerts,paper);const coldMs=performance.now()-started;
 const warmStart=performance.now();for(let i=0;i<100;i++)guard(workspace,alerts,{...paper,clock:i});const cached100Ms=performance.now()-warmStart;
 const report={schemaVersion:1,recordedAt:new Date().toISOString(),workload:'100000 synthetic bars; immutable workspace+alerts cached; one fresh small account per check',coldMs,cached100Ms,targets:{coldMs:1000,cached100Ms:100},interfaceTested:false,scope:'Bounded JSON capacity walk only. No chart rendering, native input, IPC or disk persistence.'};
 writeFileSync('reports/performance-financial-publication.json',JSON.stringify(report,null,2)+'\n');expect(coldMs).toBeLessThan(1000);expect(cached100Ms).toBeLessThan(100);
});
