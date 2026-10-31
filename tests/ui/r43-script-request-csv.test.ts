import {afterEach,it,expect,vi} from 'vitest';
import {csvRows} from '../../src/domain/data';
import {aggregateInterval} from '../../src/domain/intervals';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {createDatasetRequestResolver} from '../../src/ui/script-requests';
import {scriptDepsHarness,dependencyDataset,DEP,H,T0} from '../fixtures/r43-script-deps';
const held:Array<ReturnType<typeof scriptDepsHarness>>=[];afterEach(()=>{for(const h of held.splice(0).reverse())h.dispose();vi.unstubAllGlobals();});
const harness=(options:Parameters<typeof scriptDepsHarness>[0]={})=>{const h=scriptDepsHarness(options);held.push(h);return h;};
it('exports actual restricted-worker requested values with null warmup and exact UTC source alignment',async()=>{
 const h=harness({worker:true});h.start();await h.ready();const rows=csvRows(h.csv());expect(rows[0].slice(0,6)).toEqual(['time','open','high','low','close','volume']);expect(rows[0]).toHaveLength(21);expect(rows[0].at(-1)).toBe('Synthetic requested study: Requested close');expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['','1000','1000','1100']);expect(rows.slice(1).map(row=>Number(row[0]))).toEqual([T0,T0+23*H,T0+24*H,T0+47*H]);expect(h.payloads.at(-1).requests.dep.map((row:any)=>row?.close??null)).toEqual([null,1000,1000,1100]);
});
it('permits known original synthetic dependency data without promoting a human label into authority',async()=>{
 const h=harness({dataset:dependencyDataset('synthetic')});h.start();await h.ready();expect(csvRows(h.csv()).slice(1).map(row=>row.at(-1))).toEqual(['','1000','1000','1100']);
});
it('retains the known actual original when fresh local aggregation replaces provider metadata',async()=>{
 const h=harness({dataset:dependencyDataset('local','60m')});h.start();await h.ready();expect(csvRows(h.csv()).slice(1).map(row=>row.at(-1))).toEqual(['','123','123','147']);
});
it('refuses live originals even when fresh aggregation emits local-looking derived provenance',async()=>{
 const h=harness({dataset:dependencyDataset('live','60m')});h.start();await h.ready();expect(h.port.list()[0].plotDescriptors).toHaveLength(1);expect(()=>h.csv()).toThrow('cannot be exported');
});
it('does not promote a detached stored derived snapshot into known original-source permission',async()=>{
 const derived=aggregateInterval(dependencyDataset('local','60m'),'1D');expect(derived.ok).toBe(true);if(!derived.ok)throw Error('Synthetic aggregation refused');const h=harness({dataset:derived.dataset});h.start();await h.ready();expect(()=>h.csv()).toThrow('accepted export permission');
});
it('keeps accepted local receipts after loader replacement and never loads, resolves or executes during export',async()=>{
 const local=dependencyDataset('local'),loader=vi.fn(()=>({state:'ready' as const,message:null,dataset:local})),h=harness({loader});h.start();await h.ready();const before={load:loader.mock.calls.length,resolve:h.resolverCount,execute:h.executeCount};loader.mockImplementation(()=>{throw Error('Export fetched current history');});Object.assign(local.provenance,{providerId:'alpaca-iex',datasetId:'live:replacement-policy'});const fetch=vi.fn(()=>{throw Error('Export fetched');});vi.stubGlobal('fetch',fetch);
 expect(csvRows(h.csv()).at(-1)?.at(-1)).toBe('1100');expect({load:loader.mock.calls.length,resolve:h.resolverCount,execute:h.executeCount}).toEqual(before);expect(fetch).not.toHaveBeenCalled();
});
it('keeps unknown provider and custom structural resolver results calculable while refusing their export',async()=>{
 for(const options of [{dataset:dependencyDataset('unknown')},{resolver:()=>({bars:dependencyDataset().bars,resolution:'1D',label:'Local permitted synthetic data',fixture:true})}]){const h=harness(options);h.start();await h.ready();expect(h.port.list()[0].plotDescriptors).toHaveLength(1);expect(()=>h.csv()).toThrow('accepted export permission');}
});
it('refuses a mixed declaration set when even one consumed dependency has unknown permission',async()=>{
 const local=dependencyDataset(),unknown=dependencyDataset('unknown');unknown.instrument={...unknown.instrument,id:'synthetic-unknown-QQQ',symbol:'QQQ'};unknown.provenance.datasetId='unknown:QQQ';const declarations=[DEP,{id:'other',symbol:'QQQ',interval:'1D'}],resolver=createDatasetRequestResolver({datasets:[local,unknown]});const h=harness({declarations,resolver});h.start();await h.ready();expect(()=>h.csv()).toThrow('accepted export permission');
});
it('retains hidden numeric script plots in the accepted model export',async()=>{
 const h=harness();h.start();await h.ready();h.port.replaceStyles(h.binding.id,{requested:{...defaultPlotStyle('sma','requested',0),visible:false,legend:false,dataWindow:false}});expect(csvRows(h.csv()).at(-1)?.at(-1)).toBe('1100');
});
it('requires final response declarations to match the actual consumed request set',async()=>{
 const h=harness({finalRequests:[{...DEP,interval:'60m'}]});h.start();await h.ready();expect(h.port.list()[0].plotDescriptors).toHaveLength(1);expect(()=>h.csv()).toThrow('accepted export permission');
});
