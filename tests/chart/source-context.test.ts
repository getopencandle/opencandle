import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,sourceContextForInput,sameChartSourceBasis,validateChartSourceBasisIdentity,chartSourceContextKey} from '../../src/chart/source-context';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {chartInputCommitted} from '../../src/chart/input-visibility';
it('same immutable bars cannot identify another provider, venue, currency, session, adjustment, coverage or timezone basis',()=>{
 const original=fixtureDataset('GME',3),source=sourceContextForDataset(original),mutations=[
  (d:typeof original)=>{d.provenance.providerId='other';},(d:typeof original)=>{d.provenance.coverage='other venue';},(d:typeof original)=>{d.provenance.session='extended';},(d:typeof original)=>{d.provenance.adjustment='split-adjusted';},(d:typeof original)=>{d.instrument.currency='EUR';},(d:typeof original)=>{d.instrument.exchange='OTHER';},(d:typeof original)=>{d.provenance.timezone='America/New_York';},(d:typeof original)=>{d.instrument.timezone='America/New_York';},(d:typeof original)=>{d.instrument.tickSize=0.05;},(d:typeof original)=>{d.instrument.lotSize=100;},(d:typeof original)=>{d.instrument.name='Updated company';}];
 for(const mutate of mutations){const changed=structuredClone(original);changed.bars=original.bars;mutate(changed);const desired=sourceContextForDataset(changed);expect(desired.inputIdentity).toBe(source.inputIdentity);expect(desired.basisIdentity).not.toBe(source.basisIdentity);expect(sameChartSourceBasis(source,desired,true)).toBe(false);expect(chartInputCommitted({bars:original.bars,source,style:'candles'},{bars:original.bars,source:desired,style:'candles'})).toBe(false);}
});
it('a status heartbeat does not invalidate calculation basis, while revision and supplied prefix retain separate identity',()=>{
 const original=fixtureDataset('GME',3),source=sourceContextForDataset(original),heartbeat={...original,provenance:{...original.provenance,state:'stale' as const,asOf:original.provenance.asOf+1}};expect(sameChartSourceBasis(source,sourceContextForDataset(heartbeat),true)).toBe(true);expect(chartSourceContextKey(sourceContextForDataset(heartbeat))).toBe(chartSourceContextKey(source));
 const revision=sourceContextForDataset({...original,provenance:{...original.provenance,revision:'2'}});expect(revision.basisIdentity).toBe(source.basisIdentity);expect(sameChartSourceBasis(source,revision,true)).toBe(false);const prefix=original.bars.slice(0,1);expect(sourceContextForDataset(original,prefix).inputIdentity).toBe(barInputIdentity(prefix));expect(sourceContextForInput({...source,inputIdentity:'forged'},prefix).inputIdentity).not.toBe('forged');
});
it('a changed human source attribution fails display matching without invalidating the numeric basis',()=>{
 const dataset=fixtureDataset('GME',3),before=sourceContextForDataset(dataset),after=sourceContextForDataset({...dataset,provenance:{...dataset.provenance,providerName:'Corrected attribution'}});expect(after.basisIdentity).toBe(before.basisIdentity);expect(after.inputIdentity).toBe(before.inputIdentity);expect(sameChartSourceBasis(before,after,true)).toBe(false);expect(chartInputCommitted({bars:dataset.bars,source:before,style:'candles'},{bars:dataset.bars,source:after,style:'candles'})).toBe(false);
});
it('missing or malformed source metadata is rejected without truncation, default invention or accessor execution',()=>{
 const original=fixtureDataset('GME',3);for(const patch of [{providerId:''},{coverage:''},{providerId:'x'.repeat(4097)}])expect(()=>sourceContextForDataset({...original,provenance:{...original.provenance,...patch}})).toThrow('chart source');
 expect(()=>sourceContextForDataset({...original,instrument:{...original.instrument,tickSize:0}})).toThrow('tick');let reads=0;const metadata={...original.provenance};Object.defineProperty(metadata,'coverage',{get:()=>{reads++;return 'hidden';},enumerable:true});expect(()=>sourceContextForDataset({...original,provenance:metadata})).toThrow('plain');expect(reads).toBe(0);
 const unknown={datasetId:'probe',revision:'1',fixture:true,label:'Synthetic'};expect(sameChartSourceBasis(unknown,unknown,true)).toBe(false);expect(sameChartSourceBasis(unknown,unknown)).toBe(true);
});
it('portable saved basis validation enforces the exact tuple version, shape, canonical resolution and primitive bounds',()=>{
 const valid=sourceContextForDataset(fixtureDataset('GME',3)).basisIdentity!,tuple=JSON.parse(valid);expect(validateChartSourceBasisIdentity(valid)).toBe(valid);
 for(const mutate of [(row:unknown[])=>{row[0]=2;},(row:unknown[])=>{row.pop();},(row:unknown[])=>{row[15]=0;},(row:unknown[])=>{row[17]='true';},(row:unknown[])=>{row[1]='';},(row:unknown[])=>{row[10]='1h';},(row:unknown[])=>{row[10]='unparsed:1h';}]){const changed=structuredClone(tuple);mutate(changed);expect(()=>validateChartSourceBasisIdentity(JSON.stringify(changed))).toThrow();}
 expect(()=>validateChartSourceBasisIdentity(JSON.stringify(tuple,null,2))).toThrow('Noncanonical');expect(()=>validateChartSourceBasisIdentity('x'.repeat(100001))).toThrow('oversized');const unknown=structuredClone(tuple);unknown[10]='unparsed:future-event-grid';expect(validateChartSourceBasisIdentity(JSON.stringify(unknown))).toBe(JSON.stringify(unknown));
});
