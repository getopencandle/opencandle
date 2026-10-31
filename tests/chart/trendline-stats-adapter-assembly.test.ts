import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {createTrendlineStatisticsSource} from '../../src/chart/trendline-stats-source';
import {captureTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
import {drawingEditor,isTrendlineStatsPath} from '../../src/chart/drawing-port';
import {drawingVisibility} from '../../src/chart/drawing-visibility';
import {templateAdapterHarness} from './drawing-template-adapter-harness';
import {statsRecord} from './trendline-stats-painter-harness';

/** Actual adapter installer/editor assembly with controlled installer diagnostics.
 * Native identity binding and source bridge are real; mounted paint is tested elsewhere. */
async function fixture(fail=false){
 const f=await templateAdapterHarness([statsRecord({priceRange:true,alwaysShow:true})]);
 try{
 const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n'),start=text.indexOf('  if(rendererHolder.current&&statsSource){'),end=text.indexOf('  const analysisInventory=',start),editorStart=text.indexOf('    getDrawingEditor:'),editorEnd=text.indexOf('\n',editorStart);
 if([start,end,editorStart,editorEnd].some(value=>value<0))throw Error('Review actual statistics adapter assembly boundary.');
 let host:any,rows:any[]=[];const painter={diagnostics:vi.fn(()=>rows.map(row=>({...row}))),invalidate:vi.fn(),dispose:vi.fn()};
 const installTrendlineStatistics=vi.fn((_renderer,_chart,actual)=>{host=actual;if(fail)throw Error('SYNTHETIC installer rejection');return painter;});
 const renderer={scene:{timezone:'UTC'}},bars=[1000,1060,1240].map(time=>({time,open:100,high:200,low:100,close:150,volume:10}));
 let epoch={};const source={resolution:'1m'},statsSource=createTrendlineStatisticsSource({renderer,readBasis:()=>({epoch,source,bars,style:'candles',temporal:true,disposed:false})});
 const code=`const {renderer,chart,document,statsSource,installTrendlineStatistics,captureTrendlineStatisticsNativeOwner,drawingEditor,isTrendlineStatsPath,drawingVisibility,bars,source}=injected;
 const rendererHolder={current:renderer},currentBars=bars,currentSource=source,drawingCoordinateContext=()=>({timeCoordinatesAvailable:true});let statsPainter=null;let dwb3LayerRegistered=false;const dwb3Consumers=(()=>{const own=new Set();return {set(name,installed=true){if(installed)own.add(name);else own.delete(name);},has:name=>own.has(name),names:()=>[...own].sort(),dispose(){own.clear();}};})();/* DWB3 per-chart field consumers (batch-1019b); shape layer off in this extraction */
 ${text.slice(start,end)}
 const controller={${text.slice(editorStart,editorEnd)}};return{controller,statsEditorStatus,painter:()=>statsPainter};`;
 const api=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({renderer,chart:{drawings:{ctrl:f.native.controller,all:()=>f.native.controller.all()}},document:f.document,statsSource,installTrendlineStatistics,captureTrendlineStatisticsNativeOwner,drawingEditor,isTrendlineStatsPath,drawingVisibility,bars,source});
 return{f,api,host,painter,statsSource,notices:(value:any[])=>{rows=value;},retire:()=>{epoch={};},cleanup:()=>{statsSource.dispose();f.native.dispose();}};
 }catch(error){f.native.dispose();throw error;}
}

it('actual installer passes the canonical document, stable lazy source and exact native owner binder',async()=>{
 const x=await fixture();try{expect(x.host.document).toBe(x.f.document);const first=x.host.captureSource();expect(x.host.captureSource()).toBe(first);expect(first.readGrid().state).toBe('available');
  const canonical=x.f.document.all()[0],projected=x.f.projection()[0],owner=x.f.document.captureReadOnlyOwner(),assert=x.host.captureNativeOwner(canonical,projected,owner,()=>first.assertCurrent());assert();
  x.retire();expect(assert).toThrow();expect(()=>first.assertCurrent()).toThrow();expect(x.host.captureSource().identity).not.toBe(first.identity);
 }finally{x.cleanup();}
});
it('actual editor shows canonical settings despite native omission and bounds current owned notices',async()=>{
 const x=await fixture();try{const id=x.f.rows[0].id,editor=x.api.controller.getDrawingEditor(id);expect(editor.values['props.lvTrendlineStats.priceRange']).toBe(true);expect(x.f.native.controller.all()[0].props?.lvTrendlineStats).toBeUndefined();
  x.notices([{message:'Synthetic grid unavailable '+'.'.repeat(3000)}]);const unavailable=x.api.controller.getDrawingEditor(id);expect(unavailable.statsDiagnostic).toHaveLength(2000);expect(unavailable.fields.some((field:any)=>isTrendlineStatsPath(field.path))).toBe(true);
  x.notices([]);expect(x.api.controller.getDrawingEditor(id).statsDiagnostic).toBeUndefined();expect(x.f.state().analysisUnavailable).toBe('');
 }finally{x.cleanup();}
});
it('diagnostic reporting does not quarantine analysis or make an unowned persistent copy',async()=>{
 const x=await fixture();try{x.notices([{message:'Synthetic current-owner notice'}]);x.host.reportUnavailable('Synthetic prior notice');expect(x.api.controller.getDrawingEditor(x.f.rows[0].id).statsDiagnostic).toBe('Synthetic current-owner notice');x.notices([]);expect(x.api.controller.getDrawingEditor(x.f.rows[0].id).statsDiagnostic).toBeUndefined();expect(x.f.state().analysisUnavailable).toBe('');}finally{x.cleanup();}
});
it('installer failure keeps ordinary settings usable and makes statistics explicitly unavailable',async()=>{
 const x=await fixture(true);try{const editor=x.api.controller.getDrawingEditor(x.f.rows[0].id);expect(x.api.painter()).toBeNull();expect(editor.statsDiagnostic).toContain('could not start');expect(editor.fields.some((field:any)=>isTrendlineStatsPath(field.path))).toBe(false);expect(editor.fields.some((field:any)=>field.path==='style.lineColor')).toBe(true);expect(x.f.document.all()[0].props).toHaveProperty('lvTrendlineStats');expect(x.f.state().analysisUnavailable).toBe('');}finally{x.cleanup();}
});
it('opaque future metadata diagnostic takes precedence over unrelated painter notices',async()=>{
 const x=await fixture();try{const saved=x.f.document.serialize() as any;saved.drawings[0].props.lvTrendlineStats={schemaVersion:99,future:'SYNTHETIC'};x.f.document.load(saved);x.notices([{message:'Other statistics source unavailable'}]);const editor=x.api.controller.getDrawingEditor(x.f.rows[0].id);expect(editor.statsDiagnostic).toContain('Unknown or invalid props.lvTrendlineStats');expect(editor.fields.some((field:any)=>isTrendlineStatsPath(field.path))).toBe(false);}finally{x.cleanup();}
});
