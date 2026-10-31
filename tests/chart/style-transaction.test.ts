import {it,expect} from 'vitest';
import {commitChartStyle} from '../../src/chart/style-transaction';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {calculateIndicator} from '../../src/domain/indicators';
const bars=[{time:1,open:10,high:16,low:8,close:14,volume:100},{time:2,open:20,high:22,low:6,close:20,volume:100}];
it('style changes recalculate raw native bars exactly once into HA, then invalidate prior script results',()=>{
 let style='candles',value:number|null=null;const calls:string[]=[];commitChartStyle('heikinashi',{read:()=>style,write:value=>{style=value;},apply:()=>{calls.push('apply:'+style);},recompute:()=>{value=calculateIndicator('sma',calculationBarsForStyle(bars,style),{length:2}).series[0].values[1];calls.push('calculate:'+style);},invalidate:()=>{calls.push('invalidate');}});expect(value).toBe(14.5);expect(calls).toEqual(['apply:heikinashi','calculate:heikinashi','invalidate']);expect(bars[1].close).toBe(20);
});
it('failed native style/recalculation restores the prior style and numerical basis without invalidating accepted scripts',()=>{
 for(const failure of ['native','calculate']){let style='candles',value=17,invalidations=0;expect(()=>commitChartStyle('heikinashi',{read:()=>style,write:next=>{style=next;},apply:()=>{if(style==='heikinashi'&&failure==='native')throw new Error('Native style failure');},recompute:()=>{if(style==='heikinashi'&&failure==='calculate')throw new Error('Calculation failure');value=calculateIndicator('sma',calculationBarsForStyle(bars,style),{length:2}).series[0].values[1]!;},invalidate:()=>{invalidations++;}})).toThrow('failure');expect(style).toBe('candles');expect(value).toBe(17);expect(invalidations).toBe(0);}
});
