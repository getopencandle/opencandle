import {expect,it} from 'vitest';
import type {LineLikeSeries} from '@luxalgo/vela';
import {calculateIndicator} from '../../src/domain/indicators';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorInstanceSettings,IndicatorVolumePalette} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {applyIndicatorVolumePalette} from '../../src/chart/indicator-volume-palette';
import {heikinAshiBars} from '../../src/chart/calculation-bars';

const opens=[10,12,9,14],closes=[11,11,10,12],volumes=[100,0,300,200];
const bars=closes.map((close,i)=>({time:1700000000+i*60,open:opens[i],high:Math.max(opens[i],close)+1,low:Math.min(opens[i],close)-1,close,volume:volumes[i]}));
const palette=(mode:IndicatorVolumePalette['mode']='previous-close'):IndicatorVolumePalette=>({schemaVersion:1,mode,upColor:'rgba(0,255,0,.5)',downColor:'#ff000080'});
const settings=(mode:IndicatorVolumePalette['mode']='previous-close'):IndicatorInstanceSettings=>{const row:IndicatorInstanceSettings={...factoryIndicatorDefault('volume'),id:'colored-volume',kind:'volume',inputs:{length:2}};row.presentation!.volumePalette=palette(mode);row.plots.volume.opacity=50;row.plots.volume.trackPrice=true;row.plots.ma.visible=true;return row;};// MA shown explicitly (hidden by default)
const up='rgba(0,255,0,0.25)',down='rgba(255,0,0,0.25098039215686274)';
const plot=(out:ReturnType<typeof renderIndicatorPresentation>,id='Volume')=>out.output.series!.find(row=>row.title===id) as LineLikeSeries;

it('uses literal open-close and previous-close colors, multiplied alpha and independent MA output',()=>{
 const result=calculateIndicator('volume',bars,{length:2}),before=structuredClone(result);
 for(const [mode,colors]of [['open-close',[up,down,up,down]],['previous-close',[up,up,down,up]]] as const){const out=renderIndicatorPresentation(settings(mode),result,bars);expect(plot(out).points.map(point=>point.color)).toEqual(colors);expect(out.display.find(row=>row.id==='volume')).toMatchObject({value:200,color:colors[3]});expect(out.output.priceLines![0]).toMatchObject({price:200,color:colors[3]});expect((out.output.series![1] as LineLikeSeries).points.map(point=>point.value)).toEqual([null,50,150,250]);expect((out.output.series![1] as LineLikeSeries).points.every(point=>point.color===undefined)).toBe(true);}
 expect(result).toEqual(before);
});

it('withholds only points missing required direction, never searches backward and never carries the latest color',()=>{
 const source=bars.map(row=>({...row}));source[1].close=NaN;const row=settings(),result=calculateIndicator('volume',source,row.inputs),out=renderIndicatorPresentation(row,result,source);
 expect(plot(out).points.map(point=>point.value)).toEqual([100,null,null,200]);expect(plot(out).points.map(point=>point.color??null)).toEqual([up,null,null,up]);expect(out.diagnostics).toHaveLength(1);expect(out.diagnostics[0]).toContain('2 supplied point(s)');expect(result.series.map(series=>series.values)).toEqual([[100,0,300,200],[null,50,150,250]]);
 source[3].close=NaN;const last=renderIndicatorPresentation(row,calculateIndicator('volume',source,row.inputs),source);expect(last.display.map(value=>value.id)).toEqual(['ma']);expect(last.output.priceLines).toEqual([]);expect((last.output.series![1] as LineLikeSeries).points.at(-1)?.value).toBe(250);
 const ownOpen=bars.map(value=>({...value}));ownOpen[2].open=NaN;expect(plot(renderIndicatorPresentation(settings('open-close'),result,ownOpen)).points.map(point=>point.value)).toEqual([100,0,null,200]);
});

it('keeps first/tie/zero policies and exact prefix agreement without future reads or offset color drift',()=>{
 const source=bars.map(value=>({...value}));source[0].open=source[0].close;const row=settings(),result=calculateIndicator('volume',source,row.inputs),full=renderIndicatorPresentation(row,result,source);
 for(let length=1;length<=source.length;length++){const prefix=new Proxy(source.slice(0,length),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)&&Number(key)>=length)throw Error('Future row read');return Reflect.get(target,key,receiver);}});const output=renderIndicatorPresentation(row,calculateIndicator('volume',prefix,row.inputs),prefix);expect(plot(output).points).toEqual(plot(full).points.slice(0,length));}
 expect(plot(full).points[0].color).toBe(up);expect(plot(full).points[1]).toMatchObject({value:0,color:up});
 for(const offset of [2,-2]){const output=renderIndicatorPresentation({...row,offset},result,source),values=plot(output).points.map(point=>[point.value,point.color??null]);expect(values).toEqual(offset>0?[[null,null],[null,null],[100,up],[0,up],[300,down],[200,up]]:[[300,down],[200,up]]);expect(output.display.find(value=>value.id==='volume')).toMatchObject({value:200,color:up});expect(output.output.priceLines![0].color).toBe(up);}
});

it('preserves exact uniform output including area and unavailable volume, and respects all hiding controls',()=>{
 const legacy=settings();delete legacy.presentation!.volumePalette;const result=calculateIndicator('volume',bars,legacy.inputs);
 for(const kind of ['columns','area'] as const){legacy.plots.volume.kind=kind;const baseline=renderIndicatorPresentation(legacy,result,bars),uniform={...legacy,presentation:{...legacy.presentation!,volumePalette:palette('uniform')}};expect(renderIndicatorPresentation(uniform,result,bars)).toEqual(baseline);}
 const row=settings();row.visible=false;expect(renderIndicatorPresentation(row,result,bars).output).toEqual({series:[],fills:[],priceLines:[]});row.visible=true;row.presentation!.visibility={schemaVersion:1,mode:'include',intervals:[],ranges:[]};expect(renderIndicatorPresentation(row,result,bars,{resolution:'1m'}).display).toEqual([]);
 expect(renderIndicatorPresentation(settings(),calculateIndicator('volume',[],{length:2}),[]).output.priceLines).toEqual([]);
 expect(()=>applyIndicatorVolumePalette([{value:1}],[],palette(),50)).toThrow(/exact bounded/);
});

it('uses supplied transformed prices without substituting raw prices and leaves transformed bars unchanged',()=>{
 const transformed=heikinAshiBars(bars),before=structuredClone(transformed),row=settings('open-close');
 const out=renderIndicatorPresentation(row,calculateIndicator('volume',transformed,row.inputs),transformed);
 // Literal HA opens 10.5, 10.5, 11, 10.25 and closes 10.5, 11.5, 9.5, 13.
 expect(transformed.map(value=>[value.open,value.close])).toEqual([[10.5,10.5],[10.5,11.5],[11,9.5],[10.25,13]]);expect(plot(out).points.map(point=>point.color)).toEqual([up,up,down,up]);expect(transformed).toEqual(before);
});
