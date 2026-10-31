import {expect,it,vi} from 'vitest';
import {measureWorkspaceJSON,prepareWorkspaceJSON,WORKSPACE_JSON_LIMITS} from '../../src/ui/workspace-json';
import {createFinancialPublicationGuard} from '../../src/ui/financial-publication';
import {createPaperAccount,type PaperAccount} from '../../src/domain/paper';

// Metrics/quota tests only. Synthetic minimal records test arithmetic and are
// deliberately not represented as validated financial accounts or native UI.
it('counts actual JSON UTF8 for scalar encodings, unusual keys, normalized maps and repeated aliases',()=>{
 const shared={text:'\ud83d\ude00\u00e9\u2028\ud800\udc00\u0000\b\t\n\f\r"\\'},map=Object.assign(Object.create(null),{'\ud83d\ude00':shared});
 for(const value of [{}, {optional:undefined},{'9':9,'2':2,scalars:[-0,1e21,1e-7,0.000001,Number.MIN_VALUE,true,false,null],map},{first:shared,second:shared,optional:undefined}]){
  const expected=Buffer.byteLength(JSON.stringify(value),'utf8'),measured=measureWorkspaceJSON(value);expect(measured.bytes).toBe(expected);expect(Buffer.byteLength(JSON.stringify(prepareWorkspaceJSON(value)),'utf8')).toBe(expected);
 }
 expect(measureWorkspaceJSON({first:shared,second:shared,optional:undefined})).toEqual({bytes:Buffer.byteLength(JSON.stringify({first:shared,second:shared})),nodes:6,depth:2});
});
it('measurement executes neither structured clone nor raw record stringify and preserves frozen input graphs',()=>{
 const original=Object.freeze({rows:Object.freeze([Object.freeze({value:'Synthetic immutable source'})]),optional:undefined});
 const real=JSON.stringify,clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected clone');}),serialize=vi.spyOn(JSON,'stringify').mockImplementation(((value:any,...rest:any[])=>{if(value&&typeof value==='object')throw Error('Unexpected raw record stringify');return (real as any)(value,...rest);}) as typeof JSON.stringify);
 try{expect(()=>measureWorkspaceJSON(original)).not.toThrow();expect(clone).not.toHaveBeenCalled();}finally{clone.mockRestore();serialize.mockRestore();}
 expect(original.rows[0].value).toBe('Synthetic immutable source');expect(Object.hasOwn(original,'optional')).toBe(true);
});
it('measuring and preparation reject the same descriptors, cycles and sparse values without reads',()=>{
 let reads=0;const hidden={},getter={get value(){reads++;return 2;}},cycle:any={};Object.defineProperty(hidden,'value',{value:2,enumerable:false});cycle.self=cycle;
 const extra:any[]=[];extra.push(1);Object.defineProperty(extra,'extra',{value:2,enumerable:true});
 for(const value of [getter,hidden,cycle,{rows:[undefined]},{rows:Array(1)},{rows:extra},{[Symbol('bad')]:1},{API_KEY:undefined},{field:Infinity},{field:new Date(0)},{field:()=>1}]){expect(()=>measureWorkspaceJSON(value)).toThrow();expect(()=>prepareWorkspaceJSON(value)).toThrow();}
 expect(reads).toBe(0);
});
it('joins escaped keys and nonempty alert values at the exact compact workspace byte boundary',()=>{
 const guard=createFinancialPublicationGuard(),paper=createPaperAccount(),alerts:any[]=[{original:'\ud83d\ude00\u0000"\\'}],base={'\u00e9"':false,optional:undefined,padding:''};
 const overhead=Buffer.byteLength(JSON.stringify({...base,paper,alerts}),'utf8');base.padding='\u00e9'.repeat(Math.floor((WORKSPACE_JSON_LIMITS.bytes-overhead)/2))+'x'.repeat((WORKSPACE_JSON_LIMITS.bytes-overhead)%2);
 expect(Buffer.byteLength(JSON.stringify({...base,paper,alerts}),'utf8')).toBe(WORKSPACE_JSON_LIMITS.bytes);expect(()=>guard(base,alerts,paper)).not.toThrow();expect(()=>guard({...base,padding:base.padding+'x'},alerts,paper)).toThrow('Workspace storage is full');
});
it('composes root nodes exactly:999996 array values plus root,array,account,alerts fit1million; one more account field rejects',()=>{
 const guard=createFinancialPublicationGuard(),workspace={rows:Array(999996).fill(null)},alerts:any[]=[],paper={} as PaperAccount;
 expect(measureWorkspaceJSON(workspace).nodes).toBe(999998);expect(()=>guard(workspace,alerts,paper)).not.toThrow();expect(()=>guard(workspace,alerts,{extra:null} as unknown as PaperAccount)).toThrow('Workspace storage is full');
});
it('account recovery depth includes its own root and is isolated from replay workspace storage',()=>{
 const nested=(depth:number)=>{let value:any=1;for(let i=0;i<depth;i++)value={value};return value as PaperAccount;},guard=createFinancialPublicationGuard();
 expect(measureWorkspaceJSON(nested(40)).depth).toBe(40);expect(()=>guard({},[],nested(40),true)).not.toThrow();expect(()=>guard({},[],nested(41),true)).toThrow('depth-40');
 expect(()=>guard({password:'Synthetic rejected base'},[],nested(1),true)).not.toThrow();expect(()=>guard({password:'Synthetic rejected base'},[],nested(1))).toThrow('credential');
});
