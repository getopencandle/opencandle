import {expect,it} from 'vitest';
import type {LineLikeSeries} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {VWAP_BAND_DEFAULTS,type IndicatorResult} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {createVwapPresentationPreparation,consumeVwapPresentation,type VwapPresentationPreparation} from '../../src/chart/vwap-presentation';

// Independent original literal inputs; these tests do not calculate expected
// values with the preparation implementation or claim mounted/native UI.
const ids=['vwap','upper1','lower1','upper2','lower2','upper3','lower3'];
function configuration(all=false):IndicatorInstanceSettings{
 return{id:'SYNTHETIC independent presentation',kind:'vwap',inputs:{...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'close',band1Enabled:all,band2Enabled:all,band3Enabled:all},plots:{vwap:{...defaultPlotStyle('vwap','vwap',0),color:'rgba(10,20,30,0.5)',opacity:40,trackPrice:true}},offset:0,visible:true,presentation:defaultIndicatorPresentation('vwap')};
}
function fixture(count:number,all=false,override?:(settings:IndicatorInstanceSettings)=>void){
 const settings=configuration(all);override?.(settings);
 const bars:Bar[]=[],series:IndicatorResult['series']=(all?ids:['vwap']).map(id=>({id,label:'SYNTHETIC '+id,values:[]}));
 let check=()=>{};
 const context={resolution:'1m'};
 const prep=createVwapPresentationPreparation({settings,context,rows:count,bars,series,assertCurrent:()=>check()});
 const append=(size:number,value:(ordinal:number,plot:number)=>number|null=(i,p)=>i===0?null:100+p)=>{
  const start=bars.length;
  for(let i=start;i<start+size;i++)bars.push({time:1700000000+i*60,open:100,high:100,low:100,close:100,volume:1});
  series.forEach((plot,p)=>{for(let i=start;i<start+size;i++)plot.values.push(value(i,p));});
  prep.append(start,size);
 };
 const result:IndicatorResult={id:'vwap',series,diagnostics:['SYNTHETIC result diagnostic'],policies:['SYNTHETIC numerical policy'],plotDiagnostics:{upper1:['SYNTHETIC upper diagnostic']}};
 const bindings={settings,result,bars,context};
 return{settings,bars,series,context,prep,result,bindings,append,owner(action:()=>void){check=action;}};
}

it('preserves literal129-row all-seven values, distinct fill objects, alpha, endpoints and generic metadata',()=>{
 const f=fixture(129,true);f.append(128);f.append(1);const original=structuredClone(f.result),receipt=f.prep.complete(f.result),actual=consumeVwapPresentation(receipt,f.bindings),plots=actual.output.series as LineLikeSeries[];
 expect(plots).toHaveLength(13);expect(actual.output.fills).toHaveLength(3);
 expect(plots[0].points[0]).toStrictEqual({time:1700000000000,value:null});
 expect(plots[0].points[128]).toStrictEqual({time:1700007680000,value:100});
 expect(plots.slice(0,7).map(plot=>plot.points[128].value)).toEqual([100,101,102,103,104,105,106]);
 expect(plots.slice(7).map(plot=>plot.points[128].value)).toEqual([102,101,104,103,106,105]);
 expect(new Set(plots.map(plot=>plot.points)).size).toBe(13);
 expect(new Set(plots.map(plot=>plot.points[128])).size).toBe(13);
 expect(plots[0].style.color).toBe('rgba(10,20,30,0.2)');
 expect(actual.output.priceLines?.map(line=>line.price)).toEqual([100]);
 expect(actual.display.map(plot=>plot.value)).toEqual([100,101,102,103,104,105,106]);
 // Structural comparison supplements, rather than supplies, the literals above.
 expect(actual).toStrictEqual(renderIndicatorPresentation(f.settings,f.result,f.bars,f.context));
 expect(f.result).toStrictEqual(original);
 expect(()=>consumeVwapPresentation(receipt,f.bindings)).toThrow(/consumed|retired|foreign/i);
});

it.each([1,128,129])('preserves a null final endpoint and has no last-known-value search for %i rows',count=>{
 const f=fixture(count);for(let i=0;i<count;i+=128)f.append(Math.min(128,count-i),ordinal=>ordinal===count-1?null:5);
 const result=consumeVwapPresentation(f.prep.complete(f.result),f.bindings);
 expect(result.output.priceLines).toEqual([]);expect(result.display).toEqual([]);
 expect((result.output.series as LineLikeSeries[])[0].points).toHaveLength(count);
 expect((result.output.series as LineLikeSeries[])[0].points.at(-1)?.value).toBeNull();
});

it('retains a signed-zero endpoint in numerical and native values including its tracking stroke',()=>{
 const f=fixture(1);f.append(1,()=>-0);const result=consumeVwapPresentation(f.prep.complete(f.result),f.bindings);
 expect(Object.is(f.series[0].values[0],-0)).toBe(true);
 expect(Object.is((result.output.series as LineLikeSeries[])[0].points[0].value,-0)).toBe(true);
 expect(Object.is(result.output.priceLines![0].price,-0)).toBe(true);
 expect(Object.is(result.display[0].value,-0)).toBe(true);
});

it('a forged receipt or foreign method receiver cannot consume the genuine preparation',()=>{
 const f=fixture(1);f.append(1,()=>12);
 expect(()=>f.prep.complete.call({} as VwapPresentationPreparation,f.result)).toThrow(/receiver/i);
 const receipt=f.prep.complete(f.result);
 expect(()=>consumeVwapPresentation({...receipt},f.bindings)).toThrow(/foreign/i);
 expect(()=>f.prep.retire.call({} as VwapPresentationPreparation)).toThrow(/receiver/i);
 expect(consumeVwapPresentation(receipt,f.bindings).display[0].value).toBe(12);
});

it.each(['settings','result','bars','resolution'] as const)('rejects changed %s receipt bindings and does not revive the rejected preparation',key=>{
 const f=fixture(1);f.append(1,()=>12);const receipt=f.prep.complete(f.result),bindings={...f.bindings};
 if(key==='settings')bindings.settings=structuredClone(f.settings);
 if(key==='result')bindings.result=structuredClone(f.result);
 if(key==='bars')bindings.bars=[...f.bars];
 if(key==='resolution')bindings.context={resolution:'1D'};
 expect(()=>consumeVwapPresentation(receipt,bindings)).toThrow(/bindings/i);
 expect(()=>consumeVwapPresentation(receipt,f.bindings)).toThrow(/retired|foreign/i);
});

it('source retirement inside an owner callback permanently revokes a complete receipt',()=>{
 const f=fixture(1);f.append(1,()=>12);const receipt=f.prep.complete(f.result);
 f.owner(()=>f.prep.retire());expect(()=>consumeVwapPresentation(receipt,f.bindings)).toThrow(/retired/i);
 f.owner(()=>{});expect(()=>consumeVwapPresentation(receipt,f.bindings)).toThrow(/retired|foreign/i);
});

it('nested append from the retained owner cannot survive even when that callback catches the inner error',()=>{
 const f=fixture(1);let entered=false;
 f.owner(()=>{if(!entered){entered=true;try{f.prep.append(0,1);}catch{/* Outer operation must still refuse. */}}});
 expect(()=>f.append(1,()=>12)).toThrow(/retired|reentered/i);
 f.owner(()=>{});expect(()=>f.prep.complete(f.result)).toThrow(/phase|retired/i);
});

it('a late nonfinite point revokes the unpublished partial candidate without changing numerical input',()=>{
 const f=fixture(129);f.append(128,()=>12);
 expect(()=>f.append(1,()=>Infinity)).toThrow(/numerical/i);
 expect(f.series[0].values[128]).toBe(Infinity);
 expect(()=>f.prep.complete(f.result)).toThrow(/phase|retired/i);
});

it('retiring after successful consumption does not clear output arrays handed to native publication',()=>{
 const f=fixture(1,true);f.append(1,(_,p)=>100+p);const result=consumeVwapPresentation(f.prep.complete(f.result),f.bindings),copy=structuredClone(result);
 f.prep.retire();f.prep.retire();expect(result).toStrictEqual(copy);expect((result.output.series as LineLikeSeries[])[0].points).toHaveLength(1);
});

it.each(['invisible','daily','unknown-resolution'] as const)('retains generic %s policy, including its early-return numerical validation boundary',mode=>{
 const f=fixture(1,true,settings=>{if(mode==='invisible')settings.visible=false;else settings.presentation!.hideOnDaily=true;});
 // Context identity is private but its scalar must be captured at creation, so
 // daily/unknown cases construct their own exact source bindings below.
 if(mode!=='invisible'){
  f.prep.retire();f.context.resolution=mode==='daily'?'1D':'1T';
  const prep=createVwapPresentationPreparation({settings:f.settings,context:f.context,rows:1,bars:f.bars,series:f.series,assertCurrent(){}});
  f.bars.push({time:NaN,open:1,high:1,low:1,close:1,volume:1});f.series.forEach(plot=>plot.values.push(Infinity));prep.append(0,1);
  const result=consumeVwapPresentation(prep.complete(f.result),f.bindings);
  expect(result).toStrictEqual(renderIndicatorPresentation(f.settings,f.result,f.bars,f.context));expect(result.output.series).toEqual([]);
 }else{
  f.append(1,()=>Infinity);const result=consumeVwapPresentation(f.prep.complete(f.result),f.bindings);
  expect(result).toStrictEqual(renderIndicatorPresentation(f.settings,f.result,f.bars,f.context));expect(result.output.series).toEqual([]);
 }
});

it('enforces the unchanged full-batch quota before accessing private plot values',()=>{
 const settings=configuration(true);let reads=0;
 const plot=Object.defineProperty({id:'vwap',label:'SYNTHETIC quota'},'values',{enumerable:true,get(){reads++;throw Error('SYNTHETIC values read');}});
 expect(()=>createVwapPresentationPreparation({settings,rows:100000,bars:[],series:[plot] as IndicatorResult['series'],assertCurrent(){}})).toThrow(/limit|budget/i);
 expect(reads).toBe(0);
});
