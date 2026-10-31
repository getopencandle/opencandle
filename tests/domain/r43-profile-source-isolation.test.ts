import {afterEach,it,expect} from 'vitest';
import {profileLowerTimeframe,profileFinerLookup,profileSourceContext,setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {fixtures,publish} from '../fixtures/r43-profile-source';
afterEach(()=>setProfileDatasets([]));
it('a historical primary never selects foreign live finer rows by a shared instrument ID',()=>{
 const {primary,foreign}=fixtures(),list=[primary,foreign],context=publish(primary,list);
 expect(profileLowerTimeframe(primary.instrument.id,'1D',list,context.profileSource)).toBeNull();
});
it('a legacy resolver bars-only response cannot bypass primary/provider ownership',()=>{
 const {primary,foreign}=fixtures(),context=publish(primary,[primary]);
 const lookup=profileFinerLookup(primary.provenance.datasetId,'1D',undefined,()=>({bars:foreign.bars,resolution:'60m',label:'SYNTHETIC foreign',fixture:true}),undefined,context.profileSource)!;
 expect(lookup('60m').state).toBe('unavailable');expect(lookup('60m').bars).toBeNull();
});
it('same-source loaded finer observations keep their real interval and exact row array',()=>{
 const {primary,fine}=fixtures(),list=[primary,fine],context=publish(primary,list),result=profileLowerTimeframe(primary.instrument.id,'1D',list,context.profileSource);
 expect(result?.interval).toBe('60m');expect(result?.bars).toBe(fine.bars);
 const lookup=profileFinerLookup(primary.provenance.datasetId,'1D',undefined,()=>({bars:fine.bars,resolution:'60m',label:'SYNTHETIC matching',fixture:true}),undefined,context.profileSource)!;expect(lookup('60m')).toMatchObject({state:'ready',bars:fine.bars});
});
it('provider, adjustment, session, currency, tick, lot, coverage, fixture and venue are exact cross-interval constraints',()=>{
 const changes=[['provenance','providerId','SYNTHETIC-other'],['provenance','providerName','SYNTHETIC-other'],['provenance','adjustment','split'],['provenance','session','regular'],['provenance','coverage','SYNTHETIC different coverage'],['provenance','fixture',false],['instrument','currency','EUR'],['instrument','tickSize',.05],['instrument','lotSize',10],['instrument','exchange','SYNTHETIC-other'],['instrument','timezone','America/New_York']] as const;
 for(const [owner,key,value]of changes){const {primary,fine}=fixtures();(fine[owner] as any)[key]=value;const list=[primary,fine],context=publish(primary,list);expect(profileLowerTimeframe(primary.instrument.id,'1D',list,context.profileSource),owner+'.'+key).toBeNull();}
});
it('even matching provider metadata cannot mix historical and live channels',()=>{
 const {primary,fine}=fixtures();fine.provenance.datasetId='live:SYNTHETIC-matching-provider:60m';const list=[primary,fine],context=publish(primary,list);expect(profileLowerTimeframe(primary.instrument.id,'1D',list,context.profileSource)).toBeNull();
});
it('source publication or primary bar replacement retires old proof and a fresh owned frame can recover',()=>{
 const {primary,fine}=fixtures(),list=[primary,fine],context=publish(primary,list);setProfileDatasets([...list]);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,context.profileSource)).toBeNull();
 const fresh=profileSourceContext(sourceContextForDataset(primary),primary.bars);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,fresh.profileSource)?.bars).toBe(fine.bars);
 primary.bars=[...primary.bars];expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,fresh.profileSource)).toBeNull();
});
it('ambiguous primary/finer owners, copied proof and instrument-only callers get no authority',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]);expect(profileLowerTimeframe(primary.instrument.id,'1D')).toBeNull();expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,{...context.profileSource!})).toBeNull();
 const ambiguous=publish(primary,[primary,{...primary},fine]);expect(ambiguous.profileSource).toBeUndefined();
 const multiple=publish(primary,[primary,fine,{...fine,provenance:{...fine.provenance,datasetId:'local:SYNTHETIC-other-finer'}}]);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,multiple.profileSource)).toBeNull();
});
it('the proven per-chart requestSource route still reaches its existing resolver unchanged',()=>{
 const {primary,fine}=fixtures();primary.resolution='5m';primary.instrument.assetClass='stock';primary.instrument.timezone='America/New_York';primary.provenance.timezone='America/New_York';
 const source=sourceContextForDataset(cellSessionDataset(primary,{session:'extended'})),calls:any[]=[];
 const lookup=profileFinerLookup(primary.provenance.datasetId,'5m',undefined,(_request,base)=>{calls.push(base);return{bars:fine.bars,resolution:'1m',fixture:true,label:'SYNTHETIC existing request route'};},source)!;
 expect(lookup('1m').state).toBe('ready');expect(calls[0].source).toBe(source);expect(calls[0].sessionOverride).toBe('extended');
});
