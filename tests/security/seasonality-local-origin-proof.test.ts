import {expect,it} from 'vitest';
import {parseCsv} from '../../src/domain/data';
import {captureLocalCandleOrigin,createPreparedLocalCandleDataset,reconstructLocalCandleDataset} from '../../src/domain/local-candle-origin';
import {identifyLocalImport} from '../../src/ui/workspace-intervals';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {fixtureDataset} from '../../src/domain/fixtures';
const TEXT='date,open,high,low,close,volume\n2024-01-02,10,14,6,12,10\n2024-01-03,12,20,8,16,20\n2024-01-04,16,22,12,18,30',zero={externalNumericSlots:0,externalOperations:0};
const original=()=>parseCsv(TEXT).dataset!;
function ready(data:unknown){const source=captureLocalCandleOrigin(data,zero);expect(source).not.toBeNull();return source!;}
it('metadata, SYNTHETIC tags and equal copied numerical rows cannot register an existing arbitrary object',()=>{
 const data=original(),copied=structuredClone(data);expect(captureLocalCandleOrigin(copied,zero)).toBeNull();expect(captureLocalCandleOrigin({...data},zero)).toBeNull();
 const falseParsed={...data,bars:data.bars.map(row=>({...row}))},prepared=createPreparedLocalCandleDataset(falseParsed,falseParsed.instrument,falseParsed.resolution,{...falseParsed.provenance,fixture:true});expect(captureLocalCandleOrigin(prepared,zero)).toBeNull();
});
it('unknown origins reject before invoking any dataset accessor',()=>{let calls=0;const fake=Object.defineProperty({},'provenance',{get(){calls++;throw Error('No getter');}});expect(captureLocalCandleOrigin(fake,zero)).toBeNull();expect(calls).toBe(0);});
it('admission refuses before numerical getters or proof allocation, and a refused query does not retire the original',()=>{
 const data=original(),row=data.bars[0],descriptor=Object.getOwnPropertyDescriptor(row,'close')!;let calls=0;Object.defineProperty(row,'close',{configurable:true,enumerable:true,get(){calls++;throw Error('No getter');}});
 expect(()=>captureLocalCandleOrigin(data,{externalNumericSlots:2000000,externalOperations:0})).toThrow('budget');expect(calls).toBe(0);Object.defineProperty(row,'close',descriptor);const source=ready(data);source.assertCurrent(data);source.dispose();
});
it('exact existing slot/work boundaries admit and one additional slot/work unit refuses without raising ceilings',()=>{
 const data=original(),slots=3*7+1536+16,work=3*1024+16384;
 expect(()=>captureLocalCandleOrigin(data,{externalNumericSlots:2000000-slots+1,externalOperations:0})).toThrow('budget');expect(()=>captureLocalCandleOrigin(data,{externalNumericSlots:0,externalOperations:20000000-work+1})).toThrow('budget');
 const source=captureLocalCandleOrigin(data,{externalNumericSlots:2000000-slots,externalOperations:20000000-work})!;expect(source.sourceNumericSlots).toBe(slots);expect(source.sourceOperations).toBe(work);source.dispose();
});
it('actual independently admitted leases charge fixed metadata and share one terminal numerical retirement',()=>{
 const data=original(),copy=identifyLocalImport(data,'independent-family-metadata'),a=ready(data),b=ready(copy);data.provenance.revision='metadata-retired';expect(()=>a.assertCurrent(data)).toThrow();expect(b.readRows(copy,0,1)[0].close).toBe(12);a.dispose();b.dispose();
 const leases:ReturnType<typeof ready>[]=[],slots=3*7+1536+16,work=3*1024+16384,limit=Math.floor(20000000/work);let reservedSlots=0,reservedWork=0;
 for(let index=0;index<limit;index++){const lease=captureLocalCandleOrigin(copy,{externalNumericSlots:reservedSlots,externalOperations:reservedWork})!;expect(lease).not.toBeNull();reservedSlots+=lease.sourceNumericSlots;reservedWork+=lease.sourceOperations;leases.push(lease);}
 expect(leases).toHaveLength(1027);expect(reservedSlots).toBe(limit*slots);expect(reservedWork).toBe(limit*work);expect(()=>captureLocalCandleOrigin(copy,{externalNumericSlots:reservedSlots,externalOperations:reservedWork})).toThrow('budget');
 const row=copy.bars[0],descriptor=Object.getOwnPropertyDescriptor(row,'close')!;let calls=0;Object.defineProperty(row,'close',{enumerable:true,configurable:true,get(){calls++;throw Error('No getter');}});expect(()=>leases[0].assertCurrent(copy)).toThrow();Object.defineProperty(row,'close',descriptor);
 for(const lease of leases){expect(()=>lease.assertCurrent(copy)).toThrow();lease.dispose();}expect(calls).toBe(0);expect(()=>captureLocalCandleOrigin(copy,zero)).toThrow();
});
it('observed numeric mutation terminally retires all captured controlled copies even after old values return',()=>{
 const originalData=original(),copy=identifyLocalImport(originalData,'same-owned-bars'),a=ready(originalData),b=ready(copy);originalData.bars[0].close=13;expect(()=>a.assertCurrent(originalData)).toThrow();originalData.bars[0].close=12;
 expect(()=>a.assertCurrent(originalData)).toThrow();expect(()=>b.assertCurrent(copy)).toThrow();expect(()=>captureLocalCandleOrigin(originalData,zero)).toThrow();expect(()=>captureLocalCandleOrigin(copy,zero)).toThrow();
 expect(reconstructLocalCandleDataset(originalData)).toBe(originalData);expect(()=>captureLocalCandleOrigin(originalData,zero)).toThrow();
});
it('a source numerical accessor is never invoked and restoring its descriptor cannot resurrect the receipt',()=>{
 const data=original(),source=ready(data),row=data.bars[1],field=Object.getOwnPropertyDescriptor(row,'volume')!;let calls=0;Object.defineProperty(row,'volume',{enumerable:true,configurable:true,get(){calls++;throw Error('No getter');}});
 expect(()=>source.readRows(data,1,1)).toThrow();expect(calls).toBe(0);Object.defineProperty(row,'volume',field);expect(()=>source.assertCurrent(data)).toThrow();
});
it('equal row replacement and later restoration cannot renew a captured original',()=>{
 const data=original(),source=ready(data),old=data.bars[1];data.bars[1]={...old};expect(()=>source.assertCurrent(data)).toThrow();data.bars[1]=old;expect(()=>source.assertCurrent(data)).toThrow();
});
it('in-place count growth and restoration leave the captured source terminally unavailable',()=>{
 const data=original(),source=ready(data);data.bars.push({...data.bars[2],time:1704412800});expect(()=>source.assertCurrent(data)).toThrow();data.bars.pop();expect(()=>source.assertCurrent(data)).toThrow();
});
it('a provenance accessor retires only after genuine owner inspection, never on wrong-original queries',()=>{
 const data=original(),source=ready(data),field=Object.getOwnPropertyDescriptor(data.provenance,'revision')!;let calls=0;Object.defineProperty(data.provenance,'revision',{enumerable:true,configurable:true,get(){calls++;throw Error('No getter');}});
 expect(()=>source.assertCurrent({})).toThrow('another original');expect(calls).toBe(0);Object.defineProperty(data.provenance,'revision',field);source.assertCurrent(data);
 Object.defineProperty(data.provenance,'revision',{enumerable:true,configurable:true,get(){calls++;throw Error('No getter');}});expect(()=>source.assertCurrent(data)).toThrow();expect(calls).toBe(0);Object.defineProperty(data.provenance,'revision',field);expect(()=>source.assertCurrent(data)).toThrow();
});
it('known live raw lineage cannot acquire local construction/restore proof by changing public provenance',()=>{
 const data=original();stampLiveLineage(data.bars,'SYNTHETIC-real-live-lineage',1);expect(()=>captureLocalCandleOrigin(data,zero)).toThrow();const copy={...data,provenance:{...data.provenance,datasetId:'local:relabeled'}};
 expect(reconstructLocalCandleDataset(copy)).toBe(copy);expect(captureLocalCandleOrigin(copy,zero)).toBeNull();
});
it('a genuine registered live session view with local-looking labels is not a local restore constructor input',()=>{
 const raw=fixtureDataset('GME',3);raw.resolution='1m';raw.instrument={...raw.instrument,timezone:'America/New_York'};raw.provenance={...raw.provenance,providerId:'alpaca-stub',datasetId:'live:SYNTHETIC-only',session:'all',timezone:'America/New_York'};const view=cellSessionDataset(raw,{session:'extended'});
 view.provenance={...view.provenance,providerId:'local-import',datasetId:'local:relabeled'};expect(reconstructLocalCandleDataset(view)).toBe(view);expect(captureLocalCandleOrigin(view,zero)).toBeNull();
});
it('restoring a serialized local document creates a new original while old retired views remain unusable',()=>{
 const data=original(),old=ready(data),serialized=JSON.parse(JSON.stringify(data));data.bars[0].close=13;expect(()=>old.assertCurrent(data)).toThrow();
 const restored=reconstructLocalCandleDataset(serialized);expect(restored).not.toBe(serialized);const current=ready(restored);expect(current.readRows(restored,0,1)[0].close).toBe(12);expect(()=>old.assertCurrent(restored)).toThrow();current.dispose();
});
