import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';
import type {LineLikeSeries} from '@luxalgo/vela';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {indicatorColorOpacity} from '../../src/chart/indicator-opacity';
import {assertIndicatorBatchBudget,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
const bars:Bar[]=[{time:1700000000,open:3,high:3,low:3,close:3,volume:1},{time:1700086400,open:9,high:9,low:9,close:9,volume:1}];
const settings=(offset=0):IndicatorInstanceSettings=>({id:'independent-sma',kind:'sma',inputs:{length:1,source:'close'},plots:{sma:defaultPlotStyle('sma','sma',0)},offset,visible:true});
it('accounts for real dense positive-offset output before admitting the aggregate batch',()=>{
 const single=settings(5),result=calculateIndicator('sma',bars,single.inputs),rendered=renderIndicatorPresentation(single,result,bars),points=(rendered.output.series![0] as LineLikeSeries).points;
 expect(points.map(point=>point.value)).toEqual([null,null,null,null,null,3,9]);
 //16*(100001 points *2 coordinates +1 original numeric value) >2m slots.
 const large=Array.from({length:16},(_,index)=>({...settings(100000),id:'bounded-'+index}));expect(()=>assertIndicatorBatchBudget(large,1)).toThrow(/limit/i);
});
it('multiplies existing CSS alpha by opacity and preserves saved colors without rewriting',()=>{
 expect(indicatorColorOpacity('#ff000080',50)).toBe('rgba(255,0,0,0.25098039215686274)');expect(indicatorColorOpacity('rgba(20,40,60,0.4)',25)).toBe('rgba(20,40,60,0.1)');expect(indicatorColorOpacity('transparent',50)).toBe('rgba(0,0,0,0)');expect(indicatorColorOpacity('#AbC',100)).toBe('#AbC');
});
it('never tracks a previous finite value when the actual endpoint is unavailable',()=>{
 const saved=settings(),style=saved.plots.sma;style.trackPrice=true;
 const result={id:'sma',series:[{id:'sma',label:'SMA',values:[3,null]}],diagnostics:[],policies:[]};
 expect(renderIndicatorPresentation(saved,result,bars).output.priceLines).toEqual([]);
});
