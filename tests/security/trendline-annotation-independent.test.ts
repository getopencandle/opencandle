import {expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {annotationNativeHarness,annotationRecord} from '../chart/trendline-annotation-native-harness';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {captureNativeDrawingProjection} from '../../src/chart/drawing-native-projection';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';

it('an exact model cannot keep Trendline suppression authority after its tool type changes inside native projection',async()=>{
 const f=await annotationNativeHarness(),helper=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);let changed=false;
 try{
  f.project(()=>{if(!changed){changed=true;Object.defineProperty(f.controller.drawings[0],'type',{value:'ray',writable:true,configurable:true,enumerable:true});}});
  expect(()=>f.sync([annotationRecord(false)])).toThrow(/type|claim|changed/i);expect(changed).toBe(true);
  expect(f.top.commands.filter(command=>['fillText','strokeText'].includes(command.op))).toEqual([]);
 }finally{helper.dispose();f.dispose();}
});

it('partial installation refuses and preserves a competing method acquired during an earlier wrapper write',async()=>{
 const f=await annotationNativeHarness(),foreign=function(){return 'Independent competing slice owner';};let injected=false,helper:ReturnType<typeof installTrendlineAnnotation>|undefined,error:unknown;
 const original=f.controller,proxy=new Proxy(original,{defineProperty(target,key,descriptor){if(key==='render'&&!injected){injected=true;Reflect.defineProperty(target,'prepareSlices',{value:foreign,writable:true,configurable:true});}return Reflect.defineProperty(target,key,descriptor);}});
 f.renderer.userDrawings=proxy;
 try{
  try{helper=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);}catch(cause){error=cause;}
  expect(injected).toBe(true);expect(error).toBeInstanceOf(Error);expect(original.prepareSlices).toBe(foreign);expect(Object.hasOwn(original,'render')).toBe(false);
 }finally{helper?.dispose();f.dispose();}
});

it('owned native text removal clears recognized fields while preserving opaque text siblings',async()=>{
 const f=await nativeDrawingHarness(),document=new LosslessDrawingDocument(),record=annotationRecord(false);(record.text as any).futureText={opaque:'SYNTHETIC retained future metadata'};
 try{
  document.load({version:1,drawings:[record]});f.controller.fromJSON({version:1,drawings:[record]});f.controller.onIntent({kind:'edit',doc:{...f.controller.store.get(record.id).serialize(),text:null}});
  const projection=captureNativeDrawingProjection({ctrl:f.controller},document,()=>{});document.mergeRenderable(projection.rows,new Set(['trendline']),false,new Set(),projection.authority);
  expect(document.all()[0].text).toEqual({futureText:{opaque:'SYNTHETIC retained future metadata'}});
 }finally{f.dispose();}
});

it('opaque-only Trendline text is retained byte-exact while matching the equivalent omitted native text',()=>{
 const canonical=annotationRecord(false),native=structuredClone(canonical);canonical.text={futureText:{opaque:'SYNTHETIC metadata',nested:[0,false,'']}} as any;delete native.text;
 const bytes=JSON.stringify(canonical);expect(()=>assertNativeDrawingMatchesCanonical(canonical,native)).not.toThrow();expect(JSON.stringify(canonical)).toBe(bytes);
});
it.each([{}, {value:''}, {color:'#123456'}, {lvAnnotation:{schemaVersion:2,enabled:false}}, {lvAnnotation:{schemaVersion:1,enabled:false,unknown:true}}])('opaque equivalence cannot discard known, empty or unknown-version native text %#',text=>{
 const canonical=annotationRecord(false),native=structuredClone(canonical);canonical.text=text as any;delete native.text;expect(()=>assertNativeDrawingMatchesCanonical(canonical,native)).toThrow(/differs|changed/);
});
it('opaque Trendline text never hides a real style mismatch',()=>{
 const canonical=annotationRecord(false),native=structuredClone(canonical);canonical.text={futureText:{opaque:'SYNTHETIC'}} as any;delete native.text;native.style={...native.style,lineColor:'#ff00ff'};expect(()=>assertNativeDrawingMatchesCanonical(canonical,native)).toThrow(/differs|changed/);
});
it('opaque-only text equivalence grants no authority to another drawing type',()=>{
 const canonical={...annotationRecord(false),type:'ray'},native=structuredClone(canonical);canonical.text={futureText:{opaque:'SYNTHETIC'}} as any;delete native.text;expect(()=>assertNativeDrawingMatchesCanonical(canonical as any,native as any)).toThrow(/differs|changed/);
});
