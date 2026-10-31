import {expect,it} from 'vitest';
import {calculateIndicator,type IndicatorId,type IndicatorResult} from '../../src/domain/indicators';
import {DOMAIN_INDICATORS,assertIndicatorBatchBudget,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {makeIndicatorIntervalVisibility} from '../../src/chart/indicator-visibility';

const bars=Array.from({length:40},(_,i)=>({time:1700000000+i*60,open:10+i,high:12+i,low:9+i,close:11+i,volume:i+1}));
const settings=(kind:IndicatorId):IndicatorInstanceSettings=>({id:'instance-'+kind,kind,inputs:{...indicatorDefaults[kind]},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const onlyDaily=makeIndicatorIntervalVisibility('include',['1D'],[]);

it('withholds every emitted decoration and owned label while retaining all ten numerical models',()=>{
 for(const kind of DOMAIN_INDICATORS){
  const row=settings(kind),result=calculateIndicator(kind,bars,row.inputs),before=structuredClone(result);
  for(const plot of result.series)row.plots[plot.id]={...defaultPlotStyle(kind,plot.id,0),trackPrice:true};
  row.presentation!.visibility=onlyDaily;const visible=renderIndicatorPresentation(row,result,bars,{resolution:'1D'});expect(visible.output.series!.length,kind).toBeGreaterThan(0);expect(visible.display.length,kind).toBeGreaterThan(0);
  const hidden=renderIndicatorPresentation(row,result,bars,{resolution:'1m'});expect(hidden.output,kind).toEqual({series:[],fills:[],priceLines:[]});expect(hidden.display,kind).toEqual([]);expect(hidden.diagnostics,kind).toEqual([]);expect(hidden.policies.join(' ')).toContain('Calculations');expect(result).toEqual(before);
  expect(renderIndicatorPresentation(row,result,bars,{resolution:'1D'})).toEqual(visible);
 }
});

it('keeps shifted plot identities and sparse gaps when visibility returns',()=>{
 const row=settings('bb');row.offset=2;row.presentation!.visibility=onlyDaily;
 const result:IndicatorResult={id:'bb',series:[{id:'basis',label:'Basis',values:[1,null,3]},{id:'upper',label:'Upper',values:[2,null,4]},{id:'lower',label:'Lower',values:[0,null,2]}],diagnostics:[],policies:[]};
 const first=renderIndicatorPresentation(row,result,bars.slice(0,3),{resolution:'1D'});expect(first.output.fills).toHaveLength(1);expect(first.output.series!.every(series=>'points'in series&&series.points.length===5)).toBe(true);
 expect(renderIndicatorPresentation(row,result,bars.slice(0,3),{resolution:'1m'}).output.series).toEqual([]);
 const restored=renderIndicatorPresentation(row,result,bars.slice(0,3),{resolution:'1D'});expect(restored.output).toEqual(first.output);expect(result.series[0].values).toEqual([1,null,3]);
});

it('combines VWAP daily hiding with interval visibility and diagnoses unavailable source metadata',()=>{
 const row=settings('vwap'),result=calculateIndicator('vwap',bars,row.inputs);row.presentation!.visibility=makeIndicatorIntervalVisibility('include',['1m','1D'],[]);row.presentation!.hideOnDaily=true;
 expect(renderIndicatorPresentation(row,result,bars,{resolution:'1m'}).output.series!.length).toBeGreaterThan(0);
 expect(renderIndicatorPresentation(row,result,bars,{resolution:'1D'}).output.series).toEqual([]);
 expect(renderIndicatorPresentation(row,result,bars,{resolution:'2m'}).output.series).toEqual([]);
 const unknown=renderIndicatorPresentation(row,result,bars,{resolution:null});expect(unknown.output).toEqual({series:[],fills:[],priceLines:[]});expect(unknown.diagnostics.join(' ')).toContain('withheld');
 row.presentation!.visibility=makeIndicatorIntervalVisibility('all',[],[]);row.presentation!.hideOnDaily=false;expect(renderIndicatorPresentation(row,result,bars,{resolution:null}).output.series!.length).toBeGreaterThan(0);
});

it('never lets a hidden rule bypass malformed numerical inputs, retained presentation or batch work bounds',()=>{
 const row=settings('sma');row.presentation!.visibility=makeIndicatorIntervalVisibility('include',[],[]);row.inputs.length=0;
 expect(()=>renderIndicatorPresentation(row,{id:'sma',series:[],diagnostics:[],policies:[]},bars,{resolution:'1m'})).toThrow(/numeric/);
 row.inputs.length=1;row.presentation!.visibility.ranges=[{unit:'minute',min:2,max:1}];row.presentation!.visibility.mode='all';expect(()=>renderIndicatorPresentation(row,{id:'sma',series:[],diagnostics:[],policies:[]},bars)).toThrow(/ordered/);
 row.presentation!.visibility=makeIndicatorIntervalVisibility('include',[],[]);row.inputs={length:1,smoothingType:'WMA',smoothingLength:50000};expect(()=>assertIndicatorBatchBudget([row],100000)).toThrow(/operations/);
 const volume=settings('volume'),missing=bars.map(bar=>({...bar,volume:NaN})),unavailable=calculateIndicator('volume',missing,volume.inputs);expect(unavailable.diagnostics.join(' ')).toMatch(/volume/);volume.presentation!.visibility=makeIndicatorIntervalVisibility('include',[],[]);expect(renderIndicatorPresentation(volume,unavailable,missing,{resolution:'1m'}).output.series).toEqual([]);expect(unavailable.diagnostics.join(' ')).toMatch(/volume/);
});
