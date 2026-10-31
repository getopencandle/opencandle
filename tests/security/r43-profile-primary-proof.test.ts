import {afterEach,it,expect,vi} from 'vitest';
import {assertCurrentProfilePrimarySource,profileSourceContext,profileLowerTimeframe,profileFinerLookup,setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {validateIndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {fixtures,publish} from '../fixtures/r43-profile-source';
afterEach(()=>setProfileDatasets([]));
it('copying or serializing a private primary token never grants finer-data authority',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]);
 for(const forged of [{...context.profileSource!},JSON.parse(JSON.stringify(context.profileSource))]){expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,forged)).toBeNull();expect(()=>validateIndicatorPresentationContext({resolution:'1D',profileSource:forged})).toThrow('exact owned capability');}
});
it('a primary source or array correction retires the prior frame instead of retargeting its capability',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]);primary.instrument.currency='EUR';expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,context.profileSource)).toBeNull();expect(()=>assertCurrentProfilePrimarySource(context.profileSource!)).toThrow('retired or changed');
});
it('metadata accessors are refused without invocation and without borrowing an unchanged instrument ID',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]);let reads=0;Object.defineProperty(fine,'provenance',{get(){reads++;return primary.provenance;},enumerable:true,configurable:true});expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,context.profileSource)).toBeNull();expect(reads).toBe(0);
 const source=sourceContextForDataset(primary);Object.defineProperty(source,'basisIdentity',{get(){reads++;return 'SYNTHETIC';},enumerable:true,configurable:true});expect(()=>profileSourceContext(source,primary.bars)).toThrow('plain own source');expect(reads).toBe(0);
 const frame=sourceContextForDataset(primary),owned=profileSourceContext(frame,primary.bars);Object.defineProperty(frame,'basisIdentity',{get(){reads++;return 'SYNTHETIC';},enumerable:true,configurable:true});expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,owned.profileSource)).toBeNull();expect(reads).toBe(0);
});
it('mutating the caller-owned list cannot publish a new finer dataset into an existing private universe',()=>{
 const {primary,fine}=fixtures(),callerList=[primary],context=publish(primary,callerList);callerList.push(fine);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,context.profileSource)).toBeNull();
 const next=publish(primary,callerList);expect(profileLowerTimeframe(primary.instrument.id,'1D',undefined,next.profileSource)?.bars).toBe(fine.bars);
});
it('a resolver that replaces the source set during its reply cannot reuse retired ownership',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]),lookup=profileFinerLookup(primary.provenance.datasetId,'1D',undefined,()=>{setProfileDatasets([primary]);return{bars:fine.bars,resolution:'60m',label:'SYNTHETIC retired history',fixture:true};},undefined,context.profileSource)!;
 expect(lookup('60m').state).toBe('unavailable');
});
it('unproved legacy requests do not invoke a resolver and copied row arrays cannot become loaded ownership',()=>{
 const {primary,fine}=fixtures(),resolver=vi.fn(()=>({bars:fine.bars,resolution:'60m',label:'SYNTHETIC',fixture:true}));setProfileDatasets([primary,fine]);expect(profileFinerLookup(primary.provenance.datasetId,'1D',undefined,resolver)!('60m').state).toBe('unavailable');expect(resolver).not.toHaveBeenCalled();
 const context=profileSourceContext(sourceContextForDataset(primary),primary.bars),lookup=profileFinerLookup(primary.provenance.datasetId,'1D',undefined,()=>({bars:fine.bars.map(row=>({...row})),resolution:'60m',label:'SYNTHETIC copied rows',fixture:true}),undefined,context.profileSource)!;expect(lookup('60m').state).toBe('unavailable');
});
it('fixture status cannot be rewritten by a legacy resolver even when its row reference is otherwise known',()=>{
 const {primary,fine}=fixtures(),context=publish(primary,[primary,fine]),lookup=profileFinerLookup(primary.provenance.datasetId,'1D',undefined,()=>({bars:fine.bars,resolution:'60m',label:'SYNTHETIC false status',fixture:false}),undefined,context.profileSource)!;expect(lookup('60m').state).toBe('unavailable');
});
it('unproved aggregated or frozen replay primaries cannot acquire legacy external-history authority',()=>{
 const {primary,fine}=fixtures();(primary as any).derivation={sourceKey:'SYNTHETIC unproved'};expect(publish(primary,[primary,fine]).profileSource).toBeUndefined();delete (primary as any).derivation;
 primary.provenance.revision+='|replay-snapshot:2:3';expect(publish(primary,[primary,fine]).profileSource).toBeUndefined();
});
