import {describe,expect,it} from 'vitest';
import type {BarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {bindBarsPatternMember,placementMember,resampleBarsPattern,type ResampleResult} from '../../src/chart/lv-types/bars-pattern-source';
import type {BarDataset} from '../../src/domain/types';
import {daily,dailyBars,dataset,minuteBars} from '../helpers/barspat-fixture';

// Coverage is path-independent: for a fixed stored span and fixed loaded data, any chain of timeframe switches (up to 3 hops)
// that ends at a target gives the same JSON result as the direct switch to that target. SYNTHETIC data only.
const chart={datasetId:'syn-1d',resolution:'1D'};
const TARGETS=['1D','1W','1M','240m','1m'];
function original():BarsPatternMember{
 const placed=placementMember(dailyBars(2,9).map(({volume:_v,...bar})=>bar),100);if(!placed.ok)throw Error(placed.message);
 return bindBarsPatternMember(placed.member,[daily()],chart)!;
}
const configs:Array<[string,()=>BarDataset[]]>=[
 ['daily and full 1m',()=>[daily(),dataset('p-1m','1m',minuteBars(0,30))]],
 ['daily and 1m starting Monday (late)',()=>[daily(),dataset('p-1m-late','1m',minuteBars(7,30))]],
 ['daily and 1m ending before the last day (early)',()=>[daily(),dataset('p-1m-early','1m',minuteBars(0,6))]],
 ['daily only',()=>[daily()]],
];
describe('partial coverage is path-independent',()=>{
 for(const [name,make] of configs){
  it(name+': every chain up to 3 hops equals the direct switch',()=>{
   const datasets=make(),context={datasets,chart},start=original();
   const direct=new Map<string,string>();
   for(const target of TARGETS)direct.set(target,JSON.stringify(resampleBarsPattern(start,context,{target})));
   let checked=0;
   const walk=(member:BarsPatternMember,hops:number)=>{
    if(hops===3)return;
    for(const target of TARGETS){
     const result:ResampleResult=resampleBarsPattern(member,context,{target});
     if(hops>0){expect(JSON.stringify(result),`... -> ${target}`).toBe(direct.get(target));checked++;}
     if(result.ok)walk(result.member,hops+1);
    }
   };
   walk(start,0);
   expect(checked).toBeGreaterThan(20);
  });
 }
});
