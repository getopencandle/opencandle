import {expect,it,vi} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {vwapIndicatorNativeHarness} from './vwap-indicator-native-harness';

const observed=vi.hoisted(()=>({renderRows:[] as number[],holdConversion:false,resumes:[] as Array<()=>void>}));
vi.mock('../../src/chart/indicator-presentation',async original=>{
 const actual=await original<typeof import('../../src/chart/indicator-presentation')>();
 return {...actual,renderIndicatorPresentation(...args:Parameters<typeof actual.renderIndicatorPresentation>){observed.renderRows.push(args[2].length);return actual.renderIndicatorPresentation(...args);}};
});
vi.mock('../../src/chart/vwap-indicator-run',async original=>{
 const actual=await original<typeof import('../../src/chart/vwap-indicator-run')>();
 return {...actual,startVwapIndicatorRun(host:Parameters<typeof actual.startVwapIndicatorRun>[0]){
  return actual.startVwapIndicatorRun({...host,...(observed.holdConversion?{schedule(resume:()=>void){observed.resumes.push(resume);return()=>{};}}:{})});
 }};
});
const rows=():Bar[]=>Array.from({length:129},(_,index)=>({time:1700000000+index*60,open:100,high:100,low:100,close:100,volume:index===0?0:1}));
async function finish(h:Awaited<ReturnType<typeof vwapIndicatorNativeHarness>>,wait=true){
 for(let attempt=0;attempt<500;attempt++){
  const worker=h.ports.find(value=>value.request&&!value.terminated);
  if(worker){worker.finish();if(wait)await h.port.waitForVwap();return;}
  await new Promise(resolve=>setTimeout(resolve,1));
 }
 throw Error('Synthetic VWAP worker did not receive its bounded source.');
}

it('prepares all7 zero-offset points within conversion without a final full-history render',async()=>{
 const input=rows(),h=await vwapIndicatorNativeHarness(input);observed.renderRows=[];
 try{
  const id=h.port.add('vwap',{...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'close',band1Enabled:true,band2Enabled:true,band3Enabled:true}),nativeId=h.port.list()[0].rendererId;
  expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);expect(h.port.values(id).series).toEqual([]);expect(()=>h.port.assertVwapReady()).toThrow(/pending/);
  await finish(h);h.port.assertVwapReady();const output=h.native.scene.indicators.get(nativeId),values=[100,101,99,102,98,103,97];
  expect(h.port.values(id).series.map(plot=>plot.values)).toEqual(values.map(value=>[null,...Array(128).fill(value)]));
  expect(output.series).toHaveLength(13);expect(output.fills).toHaveLength(3);expect(new Set(output.series.map((plot:any)=>plot.points)).size).toBe(13);
  for(let ordinal=0;ordinal<7;ordinal++)expect(output.series[ordinal].points).toEqual(input.map((row,index)=>({time:row.time*1000,value:index===0?null:values[ordinal]})));
  for(let pair=0;pair<3;pair++){
   const fill=output.fills[pair],lower=output.series.find((plot:any)=>plot.id===fill.fromSeriesId),upper=output.series.find((plot:any)=>plot.id===fill.toSeriesId);
   expect(lower.points.map((point:any)=>point.value)).toEqual([null,...Array(128).fill(99-pair)]);expect(upper.points.map((point:any)=>point.value)).toEqual([null,...Array(128).fill(101+pair)]);
   expect(lower.points[1]).not.toBe(output.series[2+pair*2].points[1]);expect(upper.points[1]).not.toBe(output.series[1+pair*2].points[1]);
  }
  // Work-placement assertion, not a wall-clock test: only bounded metadata preparation is allowed here.
  expect(observed.renderRows.every(count=>count===0)).toBe(true);expect(observed.renderRows).toHaveLength(1);
 }finally{h.dispose();}
});

it('keeps the nonzero-offset version2 full-history fallback unchanged',async()=>{
 const h=await vwapIndicatorNativeHarness(rows());observed.renderRows=[];
 try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'}, {offset:1}),nativeId=h.port.list()[0].rendererId;
  await finish(h);expect(observed.renderRows).toEqual([129]);expect(h.native.scene.indicators.get(nativeId).series[0].points.map((point:any)=>point.value)).toEqual([null,null,...Array(128).fill(100)]);expect(h.port.values(id).series[0].values).toEqual([null,...Array(128).fill(100)]);
 }finally{h.dispose();}
});

it('keeps explicit version1 on the original synchronous presentation path',async()=>{
 const h=await vwapIndicatorNativeHarness(rows());observed.renderRows=[];
 try{
  const id=h.port.add('vwap',{kernelVersion:1,source:'close'});expect(observed.renderRows).toEqual([129]);expect(h.ports).toEqual([]);expect(h.port.values(id).series[0].values).toEqual([null,...Array(128).fill(100)]);h.port.assertVwapReady();
 }finally{h.dispose();}
});

for(const replacement of ['source','settings','resolution'] as const)it(`retires an actual partial native candidate on ${replacement} replacement`,async()=>{
 const h=await vwapIndicatorNativeHarness(rows());observed.holdConversion=true;observed.resumes=[];
 try{
  const id=h.port.add('vwap',{...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'close',band1Enabled:false,band2Enabled:false,band3Enabled:false},replacement==='resolution'?{presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}}:undefined),nativeId=h.port.list()[0].rendererId;
  await finish(h,false);for(let attempt=0;!observed.resumes.length&&attempt<500;attempt++)await new Promise(resolve=>setTimeout(resolve,1));
  expect(observed.resumes).toHaveLength(1);expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);expect(h.port.values(id).series).toEqual([]);
  const stale=observed.resumes[0],waiting=h.port.waitForVwap(),rejected=expect(waiting).rejects.toThrow(/replaced/);observed.holdConversion=false;
  if(replacement==='source')h.replace(rows().map(row=>({...row,open:200,high:200,low:200,close:200})));
  if(replacement==='settings')h.port.update(id,{plots:{vwap:{...defaultPlotStyle('vwap','vwap',0),color:'#ff0000',trackPrice:true}}});
  if(replacement==='resolution')h.setResolution('1D');
  await rejected;stale();expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);expect(h.port.values(id).series).toEqual([]);
  await finish(h);h.port.assertVwapReady();expect(h.quarantines).toEqual([]);
  expect(h.port.values(id).series[0].values).toEqual([null,...Array(128).fill(replacement==='source'?200:100)]);
  const native=h.native.scene.indicators.get(nativeId);if(replacement==='resolution')expect(native.series).toEqual([]);else{expect(native.series[0].points).toHaveLength(129);if(replacement==='settings'){expect(native.series[0].style.color).toBe('#ff0000');expect(native.priceLines[0].price).toBe(100);}}
 }finally{observed.holdConversion=false;observed.resumes=[];h.dispose();}
});
