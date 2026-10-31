import {afterEach,it,expect,vi} from 'vitest';
import {captureScriptCsvJobProof,stageScriptCsvJobResult,acceptScriptCsvJobProof} from '../../src/chart/script-csv-job-proof';
import {createDatasetRequestResolver,resolveScriptRequests} from '../../src/ui/script-requests';
import {resolvedScriptRequestReceipt,bindScriptRequestJobReceipt} from '../../src/ui/script-request-export-proof';
import {scriptDepsHarness,dependencyDataset,DEP,settle,H,T0} from '../fixtures/r43-script-deps';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {rawLiveSessionSource} from '../../src/domain/live-session-source';
const held:Array<ReturnType<typeof scriptDepsHarness>>=[];afterEach(()=>{for(const h of held.splice(0).reverse())h.dispose();vi.unstubAllGlobals();});
const harness=(options:Parameters<typeof scriptDepsHarness>[0]={})=>{const h=scriptDepsHarness(options);held.push(h);return h;};
it('does not accept a copied response with a borrowed genuine dependency token',async()=>{
 const h=harness();h.start();await h.ready();const completed=h.completion!,copy=structuredClone(completed.result),proof=captureScriptCsvJobProof(h.context().csvJobOwner,h.binding,h.data.bars);stageScriptCsvJobResult(copy,proof,completed.dependencyReceipt);h.port.update(h.binding.id,copy);acceptScriptCsvJobProof(proof);expect(()=>h.csv()).toThrow('accepted export permission');
});
it('refuses a structural fake receipt while preserving normal accepted script calculation',async()=>{
 const h=harness();h.start();await h.ready();const result=h.completion!.result,proof=captureScriptCsvJobProof(h.context().csvJobOwner,h.binding,h.data.bars);expect(()=>stageScriptCsvJobResult(result,proof,{})).not.toThrow();h.port.update(h.binding.id,result);acceptScriptCsvJobProof(proof);expect(()=>h.csv()).toThrow('accepted export permission');
});
it('detects transitive consumed-row corrections at the same timestamps and counts',async()=>{
 const h=harness();h.start();await h.ready();const current=h.capture();h.payloads.at(-1).requests.dep[1].close=9999;expect(current.assertCurrent).toThrow('accepted export permission');expect(()=>h.csv()).toThrow('accepted export permission');
});
it('detects request-map replacement instead of continuing to prove detached original rows',async()=>{
 const h=harness();h.start();await h.ready();h.payloads.at(-1).requests.dep=structuredClone(h.payloads.at(-1).requests.dep);expect(()=>h.csv()).toThrow('accepted export permission');
});
it('does not acquire a receipt from accessors or coercible consumed values',()=>{
 const data=dependencyDataset(),primary=dependencyDataset('synthetic','60m'),declarations=[DEP],base={datasetId:primary.provenance.datasetId,resolution:'60m'},resolver=createDatasetRequestResolver({datasets:[data,primary]});
 for(const mode of ['getter','coercion']){const resolved=resolveScriptRequests(declarations,[{time:T0+23*H,open:10,high:11,low:9,close:10,volume:1}],base,resolver),receipt=resolvedScriptRequestReceipt(resolved);let calls=0;const row=resolved.rows.dep[0]!;if(mode==='getter')Object.defineProperty(row,'close',{get(){calls++;return 999;},enumerable:true});else row.close={valueOf(){calls++;return 999;}} as unknown as number;
  const result={declarations:{requests:declarations}};expect(bindScriptRequestJobReceipt(result,receipt,{source:'Synthetic',inputs:null,identity:'Synthetic',bars:[]})).toBeNull();expect(calls).toBe(0);
 }
 let invoked=0;const malformed={...base,source:{datasetId:base.datasetId,revision:'1',label:{toString(){invoked++;return 'Synthetic';}},fixture:true,resolution:'60m',basisIdentity:'not canonical'}} as any;
 const resolved=resolveScriptRequests(declarations,[{time:T0+23*H,open:10,high:11,low:9,close:10,volume:1}],malformed,resolver);expect(resolved.rows.dep[0]?.close).toBe(1000);expect(resolvedScriptRequestReceipt(resolved)).toBeNull();expect(invoked).toBe(0);
});
it('actual live provider and dataset denials win over misleading synthetic labels and flags',async()=>{
 const data=dependencyDataset('live');data.provenance.fixture=true;data.provenance.providerName='SYNTHETIC safe local history';const h=harness({dataset:data});h.start();await h.ready();expect(()=>h.csv()).toThrow('cannot be exported');
});
it('retains live-provider denial when an identifier misleadingly has a local prefix',async()=>{
 const data=dependencyDataset('live');data.provenance.datasetId='local:misleading-live-provider';const h=harness({dataset:data});h.start();await h.ready();expect(()=>h.csv()).toThrow('cannot be exported');
});
it('aborted and retired jobs cannot install dependency authority from a late response',async()=>{
 const h=harness({defer:true});h.start();await settle();expect(h.pending).toHaveLength(1);h.setBindings([]);h.finish();await settle();expect(h.port.list()).toEqual([]);
});
it('source-owner changes before acceptance refuse the late exact response',async()=>{
 const h=harness({defer:true});h.start();await settle();h.retire();h.finish();await settle();expect(h.port.list()).toEqual([]);
});
it('a reentrant removal during completion cannot leave an exportable native result',async()=>{
 const h=harness();h.onResult(()=>h.setBindings([]));h.start();await settle();expect(h.port.list()).toEqual([]);
});
it('native rollback restores only the same genuine accepted request result and permission pair',async()=>{
 const h=harness();h.start();await h.ready();const original=h.csv(),checkpoint=h.port.captureAcceptedResults(),lease=h.runtime.prepareBindings([]);lease.pauseAndCapture();lease.stage();h.port.restoreAcceptedResults(checkpoint);lease.rollback();lease.resume(false);h.runtime.update(h.context());expect(h.csv()).toBe(original);
});
it('failed native replacement recovers the original accepted dependency proof',async()=>{
 const h=harness();h.start();await h.ready();const original=h.csv(),replacement=structuredClone(h.completion!.result);replacement.plots[0].values[3].value=999;h.failEmission();expect(()=>h.port.update(h.binding.id,replacement)).toThrow('Synthetic native emission failed');expect(h.csv()).toBe(original);
});
it('removal and invalidation retire dependency authority and foreign checkpoints remain rejected',async()=>{
 const h=harness();h.start();await h.ready();const captured=h.capture();h.port.invalidateResults();expect(captured.assertCurrent).toThrow();expect(()=>h.csv()).toThrow();expect(()=>h.port.restoreAcceptedResults({count:1})).toThrow('Foreign');h.setBindings([]);expect(h.port.list()).toEqual([]);
});
it('same-id reattachment cannot reuse an earlier pending response or its proof',async()=>{
 const h=harness({defer:true});h.start();await settle();h.setBindings([]);h.setBindings([h.binding]);await settle();expect(h.pending).toHaveLength(2);h.finish();await settle();expect(h.port.list()).toEqual([]);h.finish();await h.ready();expect(h.csv()).toContain('1100');
});
it('cannot promote registered live raw ancestry by relabeling a session view before real aggregation',async()=>{
 const raw=dependencyDataset('live','60m');raw.instrument={...raw.instrument,assetClass:'stock',timezone:'America/New_York',exchange:'NYSE'};Object.assign(raw.provenance,{timezone:'America/New_York',session:'all'});
 const view=cellSessionDataset(raw,{session:'extended'});expect(rawLiveSessionSource(view)).toBe(raw);
 Object.assign(view.provenance,{providerId:'local-import',providerName:'Synthetic disguised local import',datasetId:'local:relabeled-session-view'});expect(()=>rawLiveSessionSource(view)).toThrow('raw source');
 const h=harness({dataset:view});h.start();await h.ready();expect(h.port.list()[0].plotDescriptors).toHaveLength(1);expect(()=>h.csv()).toThrow('accepted export permission');
});
