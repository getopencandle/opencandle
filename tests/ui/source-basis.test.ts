import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {linkedDatasetAtInterval} from '../../src/ui/source-basis';
it('never silently changes provider or price basis when resolving a linked interval',()=>{
 const selected=fixtureDataset('GME',3),minute={...selected,resolution:'1m',provenance:{...selected.provenance,datasetId:'minute'}};
 expect(linkedDatasetAtInterval([minute],selected,'1m')).toBe(minute);
 for(const patch of [{providerId:'other'},{adjustment:'split-adjusted'},{session:'extended'},{timezone:'America/New_York'},{coverage:'different venue'}])expect(()=>linkedDatasetAtInterval([{...minute,provenance:{...minute.provenance,...patch} as typeof minute.provenance}],selected,'1m')).toThrow('No supplied');
 expect(()=>linkedDatasetAtInterval([{...minute,instrument:{...minute.instrument,currency:'EUR'}}],selected,'1m')).toThrow('No supplied');
 expect(()=>linkedDatasetAtInterval([minute,{...minute,provenance:{...minute.provenance,datasetId:'second'}}],selected,'1m')).toThrow('Multiple supplied');
});
