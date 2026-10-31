import {describe,it,expect} from 'vitest';
import {scriptBarIds} from '../../src/ui/script-input';
describe('stable script history identities',()=>{
 const bars=[{time:1,open:1,high:2,low:1,close:2,volume:1},{time:2,open:2,high:3,low:2,close:3,volume:1}];
 it('is stable across jobs and replay prefix lengths',async()=>{const full=await scriptBarIds('dataset:1:candles:run-1',bars);expect(await scriptBarIds('dataset:1:candles:run-1',bars)).toEqual(full);expect(await scriptBarIds('dataset:1:candles:run-1',bars.slice(0,1))).toEqual(full.slice(0,1));expect(full.every(id=>id.length<=128)).toBe(true);});
 it('separates dataset revisions, transforms and replay runs',async()=>{const base=await scriptBarIds('dataset:1:candles:run-1',bars);for(const identity of ['dataset:2:candles:run-1','dataset:1:heikinashi:run-1','dataset:1:candles:run-2'])expect(await scriptBarIds(identity,bars)).not.toEqual(base);});
 it('does not reuse a corrected bar identity even if imported revision metadata was unchanged',async()=>{const first=await scriptBarIds('same-revision',bars),changed=await scriptBarIds('same-revision',[{...bars[0],close:1.5},bars[1]]);expect(changed[0]).not.toBe(first[0]);expect(changed[1]).toBe(first[1]);});
});
