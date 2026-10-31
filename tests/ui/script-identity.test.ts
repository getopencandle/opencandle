import {it,expect} from 'vitest';
import {scriptExecutionIdentity,scriptBarIds} from '../../src/ui/script-input';
it('binds execution and bar identifiers to explicit resolution, fixture basis, chart transform and replay run',async()=>{
 const source={datasetId:'local',revision:'1',resolution:'1D',fixture:true,label:'Synthetic test',basisIdentity:'venue-A:regular:raw'},base=scriptExecutionIdentity(source,'candles','ordinary'),identities=[base,scriptExecutionIdentity({...source,resolution:'1W'},'candles','ordinary'),scriptExecutionIdentity({...source,fixture:false},'candles','ordinary'),scriptExecutionIdentity(source,'heikinashi','ordinary'),scriptExecutionIdentity(source,'candles','replay-2'),scriptExecutionIdentity({...source,basisIdentity:'venue-B:regular:raw'},'candles','ordinary'),scriptExecutionIdentity({...source,label:'Corrected provider attribution'},'candles','ordinary')];
 expect(new Set(identities).size).toBe(7);const bar={time:1,open:1,high:2,low:1,close:2,volume:10};const barIds=await Promise.all(identities.map(identity=>scriptBarIds(identity,[bar])));expect(new Set(barIds.flat()).size).toBe(7);
 expect(scriptExecutionIdentity({...source,inputIdentity:'another-prefix'},'candles','ordinary')).toBe(base);
});
