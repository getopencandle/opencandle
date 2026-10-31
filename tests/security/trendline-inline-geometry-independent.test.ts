import {expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {installOwnedTrendlineInlineGeometry} from '../../src/chart/trendline-inline-geometry';
import {annotationNativeHarness,annotationRecord} from '../chart/trendline-annotation-native-harness';

function measurement(){const state:any={canvas:{id:'SYNTHETIC independent measurement'},font:'14px sans-serif',textAlign:'left',textBaseline:'alphabetic',direction:'ltr',fontKerning:'auto',fontStretch:'normal',fontVariantCaps:'normal',textRendering:'auto',letterSpacing:'0px',wordSpacing:'0px'};
 state.measureText=(text:string)=>({width:text.length*7,actualBoundingBoxLeft:text.length*3.5,actualBoundingBoxRight:text.length*3.5,actualBoundingBoxAscent:10,actualBoundingBoxDescent:2});return state as CanvasRenderingContext2D;}
async function fixture(enabled=true){
 const native=await annotationNativeHarness();Object.assign(native.top.ctx,{direction:'ltr',fontKerning:'auto',fontStretch:'normal',fontVariantCaps:'normal',textRendering:'auto',letterSpacing:'0px',wordSpacing:'0px'});
 const annotation=installTrendlineAnnotation(native.renderer,native.chart as unknown as Vela,native.host),measure=measurement();let epoch=0;
 const host={captureDrawingOwner(){const captured=epoch,source=native.host.captureOwner();return()=>{source();if(captured!==epoch)throw Error('Independent drawing owner retired');};},captureLayoutOwner(){return()=>{};},createMeasurementContext:()=>measure};
 native.sync([annotationRecord(enabled)]);const helper=installOwnedTrendlineInlineGeometry(native.renderer,host);
 return{...native,nativeHost:native.host,annotation,measure,host,helper,retireDrawing:()=>{epoch++;},cleanup(){helper.dispose();annotation.dispose();native.dispose();}};
}

it('measurement method acquisition cannot invoke a returned method after retiring the drawing owner',async()=>{
 const f=await fixture();try{const session=f.helper.open(f.helper.targets()[0].target);let calls=0;
  Object.defineProperty(f.measure,'measureText',{configurable:true,get(){f.retireDrawing();return()=>{calls++;return{width:10,actualBoundingBoxLeft:5,actualBoundingBoxRight:5,actualBoundingBoxAscent:10,actualBoundingBoxDescent:2};};}});
  expect(()=>session.layout('SYNTHETIC retained method')).toThrow();expect(calls).toBe(0);expect(()=>session.assertCurrent()).toThrow();
 }finally{f.cleanup();}
});

it('TextMetrics getter retirement stops subsequent metric callbacks before they run',async()=>{
 const f=await fixture();try{const session=f.helper.open(f.helper.targets()[0].target);let laterReads=0;
  f.measure.measureText=()=>Object.defineProperties({width:10},{actualBoundingBoxLeft:{get(){f.retireDrawing();return 5;}},actualBoundingBoxRight:{get(){laterReads++;return 5;}},actualBoundingBoxAscent:{get(){laterReads++;return 10;}},actualBoundingBoxDescent:{get(){laterReads++;return 2;}}}) as TextMetrics;
  expect(()=>session.layout('SYNTHETIC metric replacement')).toThrow();expect(laterReads).toBe(0);expect(()=>session.assertCurrent()).toThrow();
 }finally{f.cleanup();}
});

it('failed old measurement acquisition preserves the replacement annotation installer',async()=>{
 const f=await fixture(false);let replacement:ReturnType<typeof installTrendlineAnnotation>|undefined;
 try{f.helper.dispose();const host={...f.host,createMeasurementContext(){f.annotation.dispose();replacement=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.nativeHost);return measurement();}};
  expect(()=>installOwnedTrendlineInlineGeometry(f.renderer,host)).toThrow();f.top.commands.length=0;f.render();expect(f.top.commands.filter(command=>command.op==='fillText')).toEqual([]);
  replacement!.dispose();replacement=undefined;f.top.commands.length=0;f.render();expect(f.top.commands.filter(command=>command.op==='fillText')).toHaveLength(2);
 }finally{replacement?.dispose();f.cleanup();}
});

it('finite pane inputs with an overflowing native clip extent cannot yield geometry',async()=>{
 const f=await fixture();let helper:ReturnType<typeof installOwnedTrendlineInlineGeometry>|undefined;
 try{f.helper.dispose();const project=f.controller.deps.projector;
  f.controller.deps.projector=()=>({...Reflect.apply(project,f.controller.deps,[]) as Record<string,unknown>,paneRect:()=>({top:Number.MAX_VALUE,height:Number.MAX_VALUE})});
  helper=installOwnedTrendlineInlineGeometry(f.renderer,{...f.host,createMeasurementContext:measurement});const description=helper.targets()[0];
  expect(description.geometry).toBeUndefined();expect(description.unavailable).toMatch(/finite|pane|clip/i);
 }finally{helper?.dispose();f.cleanup();}
});
