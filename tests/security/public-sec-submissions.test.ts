import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SecCompanyFacts,validateSubmissions}=require('../../electron/public-sec.cjs');
const cik='0000000123',url='https://data.sec.gov/submissions/CIK'+cik+'.json';
const synthetic={cik:'0000000123',name:'SYNTHETIC filings schema fixture',filings:{recent:{accessionNumber:['synthetic-a','synthetic-b'],filingDate:['2026-01-01','2025-12-31'],form:['10-K','8-K'],primaryDocument:['synthetic-a.htm','synthetic-b.htm'],acceptanceDateTime:['2026-01-01T12:00:00Z','2025-12-31T12:00:00Z'],size:[100,200],extra:[null,'preserved']},files:[{name:'CIK0000000123-submissions-001.json',filingCount:25,filingFrom:'2024-01-01',filingTo:'2024-12-31'}]},extra:'preserved'};
function response(){const result=new Response(JSON.stringify(synthetic),{headers:{'content-type':'application/json'}});Object.defineProperty(result,'url',{value:url});return result;}
describe('SEC submissions boundary (synthetic transport only)',()=>{
  it('uses fixed submissions URL, preserves aligned columns/history metadata and makes no history request',async()=>{
    const fetchImpl=vi.fn(async()=>response());const client=new SecCompanyFacts({fetchImpl});try{const result=await client.run({requestId:'submissions',cik:'123'},'submissions');expect(result.ok).toBe(true);expect(fetchImpl.mock.calls.length).toBe(1);expect(result.value).toMatchObject({cik,entityName:synthetic.name,recentCount:2,historyFetched:false,historyFiles:synthetic.filings.files,data:synthetic,provenance:{sourceUrl:url}});}finally{client.close();}
  });
  it('rejects misaligned columns, wrong identity, malformed history names and arbitrary capability/renderer URLs',async()=>{
    for(const mutate of [(data:any)=>data.cik='456',(data:any)=>data.filings.recent.form.pop(),(data:any)=>data.filings.recent.extra[0]={html:'bad'},(data:any)=>data.filings.files[0].name='../private.json',(data:any)=>data.filings.files[0].filingCount=-1]){const data=structuredClone(synthetic);mutate(data);expect(()=>validateSubmissions(data,cik)).toThrow();}
    const fetchImpl=vi.fn(async()=>response());const client=new SecCompanyFacts({fetchImpl});try{expect(await client.run({requestId:'arbitrary',cik:'123'},'https://private/')).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});expect(await client.run({requestId:'injected',cik:'123',url:'https://private/'},'submissions')).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});expect(fetchImpl).not.toHaveBeenCalled();}finally{client.close();}
  });
  it('shares active capacity/rate/cancellation with companyfacts rather than multiplying request limits',async()=>{
    let resolveResponse!:(value:Response)=>void;let now=1000;const fetchImpl=vi.fn(()=>new Promise<Response>(resolve=>{resolveResponse=resolve;}));const client=new SecCompanyFacts({fetchImpl,now:()=>now});try{const pending=client.run({requestId:'filings',cik:'123'},'submissions');expect(await client.run({requestId:'facts',cik:'123'})).toMatchObject({ok:false,error:{code:'BUSY'}});expect(client.cancel('filings')).toBe(true);expect(await pending).toMatchObject({ok:false,error:{code:'CANCELLED'}});resolveResponse(response());await new Promise(resolve=>setTimeout(resolve,0));expect(await client.run({requestId:'facts-later',cik:'123'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});expect(fetchImpl).toHaveBeenCalledOnce();now+=1000;}finally{client.close();}
  });
});
