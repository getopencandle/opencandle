import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,validateIndicatorSettings,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {Bar} from '../../src/domain/types';
import type {LineLikeSeries} from '@luxalgo/vela';

const rows=():Bar[]=>[10,20,15].map((close,i)=>({time:1700000000+i*60,open:10,high:25,low:5,close,volume:[3,0,9][i]}));
const settings=():IndicatorInstanceSettings=>({id:'independent-synthetic-volume',kind:'volume',inputs:{length:2},offset:0,visible:true,plots:{volume:{...defaultPlotStyle('volume','volume',0),opacity:50,trackPrice:true}},presentation:{...defaultIndicatorPresentation('volume'),volumePalette:{schemaVersion:1,mode:'previous-close',upColor:'rgba(1,2,3,0.0000000001)',downColor:'rgba(40,50,60,0.5)'}}});
const alpha=(color:string)=>Number(color.slice(color.lastIndexOf(',')+1,-1));

it('a tiny positive intrinsic directional alpha remains positive after multiplying plot opacity',()=>{
 const bars=rows(),saved=settings(),rendered=renderIndicatorPresentation(saved,calculateIndicator('volume',bars,saved.inputs),bars),volume=rendered.output.series![0] as LineLikeSeries;
 expect(alpha(volume.points[0].color!)).toBe(0.00000000005);
 expect(volume.points.map(point=>point.value)).toEqual([3,0,9]);
 expect(alpha(volume.points[2].color!)).toBe(0.25);
});

it('an unavailable immediately preceding close never borrows an earlier price or latest color',()=>{
 const bars=rows();bars[1].close=NaN;const saved=settings(),result=calculateIndicator('volume',bars,saved.inputs),before=structuredClone(result),rendered=renderIndicatorPresentation(saved,result,bars),native=rendered.output.series as LineLikeSeries[];
 expect(native[0].points.map(point=>point.value)).toEqual([3,null,null]);
 expect(native[0].points.slice(1).every(point=>!Object.hasOwn(point,'color'))).toBe(true);
 expect(rendered.display.find(plot=>plot.id==='volume')).toBeUndefined();expect(rendered.output.priceLines).toEqual([]);
 expect(native[1].points.map(point=>point.value)).toEqual([null,1.5,4.5]);expect(result).toEqual(before);
});

it('offset clipping cannot change the latest supplied direction or read a future bar',()=>{
 let futureReads=0;const source=new Proxy(rows(),{get(target,key,receiver){if(key==='3'){futureReads++;throw Error('future synthetic row');}return Reflect.get(target,key,receiver);}});
 const saved=settings();saved.offset=-100;const result=calculateIndicator('volume',source,saved.inputs),rendered=renderIndicatorPresentation(saved,result,source);
 expect((rendered.output.series![0] as LineLikeSeries).points).toEqual([]);expect(rendered.display.find(plot=>plot.id==='volume')).toMatchObject({value:9,color:'rgba(40,50,60,0.25)'});
 expect(rendered.output.priceLines![0]).toMatchObject({price:9,color:'rgba(40,50,60,0.25)'});expect(futureReads).toBe(0);
});

it('dormant directional area rejects while an explicit uniform area preserves legacy rendering exactly',()=>{
 const bars=rows(),saved=settings();saved.visible=false;saved.plots.volume.kind='area';expect(()=>validateIndicatorSettings(saved)).toThrow(/area/);
 saved.visible=true;saved.presentation!.volumePalette!.mode='uniform';const explicit=renderIndicatorPresentation(saved,calculateIndicator('volume',bars,saved.inputs),bars);delete saved.presentation!.volumePalette;
 expect(renderIndicatorPresentation(saved,calculateIndicator('volume',bars,saved.inputs),bars)).toEqual(explicit);
});
