import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SecCompanyFacts,secInput,MAX_BYTES,USER_AGENT}=require('../../electron/public-sec.cjs');
const cik='0000000123';const url='https://data.sec.gov/api/xbrl/companyfacts/CIK'+cik+'.json';
const synthetic={cik:123,entityName:'SYNTHETIC schema fixture',facts:{'us-gaap':{Revenues:{label:'Revenues',description:'Synthetic only',units:{USD:[{start:'2025-01-01',end:'2025-12-31',val:200,filed:'2026-02-10',accn:'synthetic-not-a-filing',form:'10-K',fy:2025,fp:'FY',extra:'preserved'}]}}}},extra:'unknown fields preserved'};
function response(body:unknown=synthetic,status=200,headers:Record<string,string>={}){const result=new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});Object.defineProperty(result,'url',{value:url,configurable:true});return result;}
describe('optional SEC public-data boundary (synthetic transport, no live provider pass)',()=>{
  it('accepts positive CIK only; paths, credentials, headers and alternate endpoints are unavailable',()=>{
    expect(secInput({requestId:'synthetic',cik:'123'}).cik).toBe(cik);
    for(const input of [{requestId:'synthetic',cik:'0'},{requestId:'synthetic',cik:'123/../../'},{requestId:'synthetic',cik:'123',url:'https://private/'},{requestId:'synthetic',cik:'123',apiKey:'never-store'},{requestId:'synthetic',cik:'123',headers:{}}])expect(()=>secInput(input)).toThrow();
  });
  it('fetches one fixed official URL without redirects/credentials and preserves units/filing metadata/provenance',async()=>{
    const fetchImpl=vi.fn(async(_url:string,_options:RequestInit)=>response());const client=new SecCompanyFacts({fetchImpl});
    try{const result=await client.run({requestId:'synthetic',cik:'123'});expect(result.ok).toBe(true);expect(fetchImpl).toHaveBeenCalledOnce();const [target,options]=fetchImpl.mock.calls[0];expect(target).toBe(url);expect(options).toMatchObject({method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'User-Agent':USER_AGENT,Accept:'application/json'}});const headers=options.headers as Record<string,string>;expect(headers.Authorization).toBeUndefined();expect(headers.Cookie).toBeUndefined();expect(result.value.data).toEqual(synthetic);expect(result.value.provenance).toMatchObject({kind:'public-unauthenticated',provider:'SEC EDGAR',sourceUrl:url});expect(result.value.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);expect(result.value.provenance.bytes).toBe(Buffer.byteLength(JSON.stringify(synthetic)));}finally{client.close();}
  });
  it('rejects redirects, alternate origins, status errors, HTML, identity mismatch and invalid observations without retry',async()=>{
    const cases:Array<[()=>Response,string]>=[
      [()=>response('',302,{location:'https://private/'}),'REDIRECT_DENIED'],
      [()=>{const r=response();Object.defineProperty(r,'url',{value:'https://private/',configurable:true});return r;},'SEC_ORIGIN_DENIED'],
      [()=>response('',403),'SEC_ACCESS_DENIED'],[()=>response('',429),'RATE_LIMITED'],[()=>response('',404),'SEC_NOT_FOUND'],[()=>response('',500),'SEC_HTTP_ERROR'],
      [()=>response('<html>no</html>',200,{'content-type':'text/html'}),'SEC_FORMAT_INVALID'],[()=>response('{bad'),'SEC_FORMAT_INVALID'],
      [()=>response({...synthetic,cik:456}),'SEC_SCHEMA_INVALID'],[()=>response({...synthetic,facts:[] }),'SEC_SCHEMA_INVALID'],
      [()=>response({...synthetic,facts:{'us-gaap':{Revenues:{label:'Revenues',units:{USD:[{val:2}]}}}}}),'SEC_SCHEMA_INVALID'],
    ];
    for(const [make,code]of cases){const fetchImpl=vi.fn(async()=>make());const client=new SecCompanyFacts({fetchImpl});try{const result=await client.run({requestId:'synthetic',cik:'123'});expect(result).toMatchObject({ok:false,error:{code}});expect(fetchImpl).toHaveBeenCalledOnce();}finally{client.close();}}
  });
  it('enforces declared and streamed decoded-byte bounds without trusting Content-Length',async()=>{
    const oversized=()=>response({},200,{'content-length':String(MAX_BYTES+1)});
    const streamed=()=>{const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_BYTES));controller.enqueue(new Uint8Array(1));controller.close();}});const r=new Response(stream,{headers:{'content-type':'application/json','content-length':'1'}});Object.defineProperty(r,'url',{value:url});return r;};
    for(const make of [oversized,streamed]){const client=new SecCompanyFacts({fetchImpl:async()=>make()});try{expect(await client.run({requestId:'synthetic',cik:'123'})).toMatchObject({ok:false,error:{code:'SEC_TOO_LARGE'}});}finally{client.close();}}
  });
  it('preserves nullable and missing descriptive metadata without inventing labels',async()=>{
    for(const label of [null,undefined]){const fixture=structuredClone(synthetic) as any;fixture.facts['us-gaap'].Revenues.label=label;fixture.facts['us-gaap'].Revenues.description=null;const client=new SecCompanyFacts({fetchImpl:async()=>response(fixture)});try{const result=await client.run({requestId:'descriptive-metadata',cik:'123'});expect(result.ok).toBe(true);expect(result.value.data.facts['us-gaap'].Revenues.label).toBe(label);expect(result.value.data.facts['us-gaap'].Revenues.description).toBeNull();}finally{client.close();}}
  });
  it('enforces one active request and 1/s spacing, and backs off ten minutes after upstream denial',async()=>{
    let now=1000;let complete!:(value:Response)=>void;const fetchImpl=vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;}));const client=new SecCompanyFacts({fetchImpl,now:()=>now});
    try{const pending=client.run({requestId:'first',cik:'123'});expect(await client.run({requestId:'second',cik:'123'})).toMatchObject({ok:false,error:{code:'BUSY'}});complete(response('',429));expect(await pending).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});now=2000;expect(await client.run({requestId:'third',cik:'123'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});expect(fetchImpl).toHaveBeenCalledOnce();}finally{client.close();}
    const successful=new SecCompanyFacts({fetchImpl:async()=>response(),now:()=>now});try{expect((await successful.run({requestId:'success',cik:'123'})).ok).toBe(true);expect(await successful.run({requestId:'fast',cik:'123'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});now+=1000;expect((await successful.run({requestId:'later',cik:'123'})).ok).toBe(true);}finally{successful.close();}
  });
  it('cancels and times out ignored-abort transport without post-cancel data or later state',async()=>{
    let complete!:(value:Response)=>void;const fetchImpl=vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;}));const client=new SecCompanyFacts({fetchImpl,timeoutMs:25});
    try{const pending=client.run({requestId:'cancelled',cik:'123'});expect(client.cancel('cancelled')).toBe(true);expect(await pending).toMatchObject({ok:false,error:{code:'CANCELLED'}});complete(response());await new Promise(resolve=>setTimeout(resolve,0));expect(client.active.size).toBe(0);expect(client.cancel('unknown')).toBe(false);}finally{client.close();}
    const timed=new SecCompanyFacts({fetchImpl:()=>new Promise(()=>{}),timeoutMs:20});try{expect(await timed.run({requestId:'timeout',cik:'123'})).toMatchObject({ok:false,error:{code:'TIMEOUT'}});expect(timed.active.size).toBe(0);}finally{timed.close();}
    expect(await timed.run({requestId:'closed',cik:'123'})).toMatchObject({ok:false,error:{code:'CLOSED'}});
    let streamCancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){streamCancelled=true;}});const streamed=new Response(stream,{headers:{'content-type':'application/json'}});Object.defineProperty(streamed,'url',{value:url});const reading=new SecCompanyFacts({fetchImpl:async()=>streamed});try{const pending=reading.run({requestId:'stream-cancel',cik:'123'});await new Promise(resolve=>setTimeout(resolve,0));expect(reading.cancel('stream-cancel')).toBe(true);expect(await pending).toMatchObject({ok:false,error:{code:'CANCELLED'}});await new Promise(resolve=>setTimeout(resolve,0));expect(streamCancelled).toBe(true);expect(reading.active.size).toBe(0);}finally{reading.close();}
  });
});
