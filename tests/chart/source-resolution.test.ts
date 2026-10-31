import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {uniqueSuppliedDataset} from '../../src/chart/source-resolution';
it('linked source resolution refuses ambiguity and respects exact instrument/synthetic identity',()=>{
 const a=fixtureDataset('GME',3),b=structuredClone(a);b.provenance.datasetId='second';expect(()=>uniqueSuppliedDataset([a,b],'GME','1D')).toThrow('Multiple supplied sources');
 b.instrument.id='OTHER:GME';expect(uniqueSuppliedDataset([a,b],'GME','1D',{instrumentId:a.instrument.id,fixture:true})).toBe(a);
 expect(()=>uniqueSuppliedDataset([b],'GME','1D',{instrumentId:a.instrument.id,fixture:true})).toThrow('No supplied');
});
