import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {captureFibTrendLineNativeOwner} from '../../src/chart/fib-trend-line-owner';
import {captureNativeInlineLayoutOwner} from '../../src/chart/native-inline-layout-owner';
import {drawingEditor,isTrendlineStatsPath} from '../../src/chart/drawing-port';
import {FIB_TREND_LINE_PREFIX} from '../../src/chart/fib-trend-line-data';
import {fibLevelColor} from '../../src/ui/fib-level-colors';

/** Current installer and editor bodies, genuine document/native/layout owners,
 * controlled installation outcome. Does not establish packaged window behavior. */
async function fixture(fail=false){
 const f=await fibBaselineHarness();try{f.sync([fibBaselineRecord()]);
 const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const start=text.indexOf('  if(rendererHolder.current){\n    try{fibTrendLine=installFibTrendLine'),end=text.indexOf('  if(rendererHolder.current)statsSource=',start),statusStart=text.indexOf('  const statsEditorStatus='),statusEnd=text.indexOf('  const analysisInventory=',statusStart);
 if([start,end,statusStart,statusEnd].some(value=>value<0))throw Error('Review actual Fibonacci adapter assembly boundary.');
 let host:any,notices:any[]=[];const painter={diagnostics:()=>notices,invalidate:vi.fn(),dispose:vi.fn()};
 const installFibTrendLine=vi.fn((_renderer,_chart,actual)=>{host=actual;if(fail)throw Error('SYNTHETIC baseline installer refused');return painter;});
 const code=`const {renderer,chart,document,installFibTrendLine,captureFibTrendLineNativeOwner,captureNativeInlineLayoutOwner,drawingEditor,isTrendlineStatsPath,FIB_TREND_LINE_PREFIX}=injected;
 const rendererHolder={current:renderer};let fibTrendLine=null,statsPainter=null,currentSource={},currentBars=[],requestedStyle='candles',statsSourceEpoch={},currentExecutionIdentity='ordinary',disposed=false,analysisUnavailable='';
 ${text.slice(start,end)}
 ${text.slice(statusStart,statusEnd)}
 return {editor:()=>statsEditorStatus(drawingEditor(document.all()[0],[])),painter:()=>fibTrendLine,
 mutate:(key)=>{if(key==='source')currentSource={};else if(key==='input')currentBars=[];else if(key==='style')requestedStyle='line';else if(key==='epoch')statsSourceEpoch={};else if(key==='execution')currentExecutionIdentity='replay';else if(key==='disposed')disposed=true;else if(key==='unavailable')analysisUnavailable='SYNTHETIC unavailable';}};`;
 const api=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({renderer:f.renderer,chart:{drawings:{ctrl:f.core.controller}},document:f.document,installFibTrendLine,captureFibTrendLineNativeOwner,captureNativeInlineLayoutOwner,drawingEditor,isTrendlineStatsPath,FIB_TREND_LINE_PREFIX});
 return{f,api,host,painter,installFibTrendLine,notices:(rows:any[])=>{notices=rows;}};
 }catch(error){f.cleanup();throw error;}
}
it('actual adapter delegates to genuine native and layout owners before any later load and keeps source checks lazy',async()=>{
 const x=await fixture();try{expect(x.installFibTrendLine).toHaveBeenCalledTimes(1);expect(x.host.document).toBe(x.f.document);const source=x.host.captureOwner();source();const canonical=x.f.document.all()[0],projected=x.f.core.controller.all()[0],owner=x.f.document.captureReadOnlyOwner();
  const native=x.host.captureNativeOwner(canonical,projected,owner,source),layout=x.host.captureLayoutOwner('price',source);native();layout();x.api.mutate('epoch');expect(source).toThrow();expect(native).toThrow();expect(layout).toThrow();
 }finally{x.f.cleanup();}
});
it.each(['source','input','style','epoch','execution','disposed','unavailable'])('actual adapter baseline source proof retires on %s',async key=>{
 const x=await fixture();try{const proof=x.host.captureOwner();proof();x.api.mutate(key);expect(proof).toThrow();}finally{x.f.cleanup();}
});
it('installer failure hides baseline and common-color actions while preserving individual level controls and saved data',async()=>{
 const x=await fixture(true);try{const before=x.f.document.serialize(),editor=x.api.editor();expect(x.api.painter()).toBeNull();expect(editor.fibTrendLineDiagnostic).toContain('could not start');expect(editor.fields.some((field:any)=>field.path.startsWith(FIB_TREND_LINE_PREFIX))).toBe(false);expect(editor.levels).toHaveLength(2);expect(fibLevelColor(editor,editor.values)).toBeUndefined();expect(x.f.document.serialize()).toEqual(before);}finally{x.f.cleanup();}
});
it('current baseline notices are bounded and clear without replacing an unsupported-data diagnostic',async()=>{
 const x=await fixture();try{x.notices([{message:'SYNTHETIC baseline notice '+'.'.repeat(3000)}]);expect(x.api.editor().fibTrendLineDiagnostic).toHaveLength(2000);x.notices([]);expect(x.api.editor().fibTrendLineDiagnostic).toBeUndefined();const row=fibBaselineRecord();row.props!.lvFibTrendLine={schemaVersion:9};x.f.sync([row]);x.notices([{message:'SYNTHETIC unrelated notice'}]);expect(x.api.editor().fibTrendLineDiagnostic).toContain('Unsupported Fibonacci trend line');}finally{x.f.cleanup();}
});
