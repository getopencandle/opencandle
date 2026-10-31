import {createDrawing,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {statsPainterHarness} from './trendline-stats-painter-harness';
import {installFibTrendLine} from '../../src/chart/fib-trend-line-painter';
import {captureFibTrendLineNativeOwner,captureFibLevelPresentationNativeOwner} from '../../src/chart/fib-trend-line-owner';
import {captureNativeInlineLayoutOwner} from '../../src/chart/native-inline-layout-owner';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import type {DerivedDrawingLens} from '../../src/chart/derived/derived-drawings';
export function fibBaselineRecord():SerializedDrawing{return createDrawing('fibretracement',{id:'SYNTHETIC owned Fib baseline',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true,color:'rgba(20,40,60,0.25)',width:5,style:'dashed'},reverse:false,background:true,levels:[{ratio:.236,color:'#123456',enabled:true,label:'SYNTHETIC first'},{ratio:.618,color:'#abcdef',enabled:true}]}})!.serialize();}
/** extraHost (additive): optional host members such as previewMembers. */
export async function fibBaselineHarness(extraHost:Record<string,unknown>={},options:{lens?:DerivedDrawingLens;hostMap?:boolean}={}){
 const lens=options.lens;
 const f=await statsPainterHarness([],options),baseline=installFibTrendLine(f.renderer,f.chart as unknown as Vela,{...extraHost,...(lens&&options.hostMap!==false?{rendererRowToSource:(row:SerializedDrawing)=>lens.toSourceRow(row)}:{}),document:f.document,captureOwner:()=>f.host.captureOwner(),captureNativeOwner:(canonical,projected,owner,source)=>captureFibTrendLineNativeOwner({ctrl:f.core.controller},canonical,projected,owner,source),capturePresentationNativeOwner:(canonical,projected,owner,source)=>captureFibLevelPresentationNativeOwner({ctrl:f.core.controller},canonical,projected,owner,source),captureLayoutOwner:(pane,source)=>captureNativeInlineLayoutOwner(f.renderer,pane,source)});
 Object.assign(f.interaction.deps,{projector:()=>f.renderer.drawingProjector(),drawings:()=>f.controller.onScreen(),selectedIds:()=>f.controller.selectedIds,hoveredId:()=>f.controller.hoveredId,activeTool:()=>f.controller.activeTool,toolDefaults:()=>({}),changed:()=>f.controller.render(),emit:(intent:unknown)=>f.controller.emit(intent),openSettings:()=>{}});
 const sync=(rows:SerializedDrawing[])=>{f.document.load({version:1,drawings:rows});f.core.controller.fromJSON({version:1,drawings:rows});};
 return{...f,baseline,sync,cleanup(){baseline.dispose();f.cleanup();}};
}
