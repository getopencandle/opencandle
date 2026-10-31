import {expect,it} from 'vitest';
import {calculateIndicator,VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,validateIndicatorPresentation,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import type {Bar} from '../../src/domain/types';
import type {LineLikeSeries} from '@luxalgo/vela';
const bars:Bar[]=[10,20,30].map((close,i)=>({time:1700000000+i*60,open:close,high:close,low:close,close,volume:[1,3,2][i]}));
const settings=():IndicatorInstanceSettings=>({id:'vwap-one',kind:'vwap',inputs:{source:'close',...VWAP_BAND_DEFAULTS,band1Enabled:true,band2Enabled:true,band3Enabled:true},plots:{vwap:{...defaultPlotStyle('vwap','vwap',0),trackPrice:true}},offset:0,visible:true,presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}});
it('uses exact declared interval families to hide all native outputs while retaining numerical values',()=>{
 const saved=settings(),result=calculateIndicator('vwap',bars,saved.inputs),before=structuredClone(result);
 for(const resolution of ['1m','1440m','5s']){const rendered=renderIndicatorPresentation(saved,result,bars,{resolution});expect(rendered.output.series).toHaveLength(13);expect(rendered.output.fills).toHaveLength(3);expect(rendered.output.priceLines).toHaveLength(1);expect(rendered.diagnostics).toEqual([]);}
 for(const resolution of ['1D','1W','3M','12M']){const rendered=renderIndicatorPresentation(saved,result,bars,{resolution});expect(rendered.output).toEqual({series:[],fills:[],priceLines:[]});expect(rendered.diagnostics).toEqual([]);}
 for(const resolution of [null,'1Y','1T','1R','invalid']){const rendered=renderIndicatorPresentation(saved,result,bars,{resolution});expect(rendered.output).toEqual({series:[],fills:[],priceLines:[]});expect(rendered.diagnostics.join(' ')).toContain('withheld');}
 expect(renderIndicatorPresentation(saved,result,bars).diagnostics.join(' ')).toContain('withheld');expect(result).toEqual(before);
});
it('preserves independently hidden boundary lines, paired fill opacity, tracking, offsets and stable identities',()=>{
 const saved=settings();saved.presentation!.hideOnDaily=false;saved.offset=2;saved.plots.upper1={...defaultPlotStyle('vwap','upper1',1),visible:false};saved.presentation!.fills.band1={visible:true,color:'rgba(10,20,30,0.5)',opacity:40};
 const result=calculateIndicator('vwap',bars,saved.inputs),rendered=renderIndicatorPresentation(saved,result,bars);expect(rendered.output.series).toHaveLength(13);expect((rendered.output.series as LineLikeSeries[]).every(plot=>plot.points.length===5)).toBe(true);expect(rendered.output.series![1].visible).toBe(false);expect(rendered.output.fills![0].color).toContain('0.2');expect(rendered.output.priceLines![0].price).toBe(65/3);
 const anchor=rendered.output.series!.find(plot=>plot.id===rendered.output.fills![0].fromSeriesId)! as LineLikeSeries;expect(anchor.display).toEqual({pane:true,priceScale:false,legend:false,dataWindow:false});expect(anchor.points.slice(0,2).map(point=>point.value)).toEqual([null,null]);
 const ids=rendered.output.series!.map(plot=>plot.id);saved.offset=0;expect(renderIndicatorPresentation(saved,result,bars).output.series!.map(plot=>plot.id)).toEqual(ids);expect(result.series[0].values).toEqual([10,17.5,65/3]);
});
it('rejects foreign or malformed hide fields and suppresses only fills with unavailable pair boundaries',()=>{
 const saved=settings();expect(()=>validateIndicatorPresentation('sma',saved.presentation)).toThrow();for(const value of [null,undefined,'true',1])expect(()=>validateIndicatorPresentation('vwap',{...saved.presentation,hideOnDaily:value})).toThrow();
 let reads=0;const context=Object.defineProperty({},'resolution',{enumerable:true,get(){reads++;return'1D';}});expect(()=>renderIndicatorPresentation(saved,calculateIndicator('vwap',bars,saved.inputs),bars,context as any)).toThrow();expect(reads).toBe(0);
 const result=calculateIndicator('vwap',bars,saved.inputs);result.series=result.series.filter(plot=>plot.id!=='upper2');const rendered=renderIndicatorPresentation(saved,result,bars,{resolution:'1m'});expect(rendered.output.fills).toHaveLength(2);expect(rendered.diagnostics.join(' ')).toContain('band2');
});
it('a later overflowing band leaves earlier real native fill anchors intact with a gap at the failed point',()=>{
 const saved=settings();saved.inputs={...saved.inputs,band1Multiplier:100000,band2Enabled:false,band3Enabled:false};saved.presentation!.hideOnDaily=false;
 const input=[10,1e308].map((close,i)=>({time:1700000000+i*60,open:close,high:close,low:close,close,volume:1})),result=calculateIndicator('vwap',input,saved.inputs),rendered=renderIndicatorPresentation(saved,result,input);expect(rendered.output.fills).toHaveLength(1);
 const native=rendered.output.series as LineLikeSeries[];expect(native.find(plot=>plot.id===rendered.output.fills![0].fromSeriesId)!.points.map(point=>point.value)).toEqual([-9990,null]);expect(native.find(plot=>plot.id===rendered.output.fills![0].toSeriesId)!.points.map(point=>point.value)).toEqual([10010,null]);
});
