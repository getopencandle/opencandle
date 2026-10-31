import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {captureInlineDrawingOwner} from '../../src/chart/drawing-inline-owner';
import {captureTrendlineInlineOpening} from '../../src/chart/trendline-inline-publication';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from './drawing-template-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

/** Current adapter assembly and queue bodies, actual canonical/native publisher.
 * DOM port/editor construction is controlled here, separately exercised by native/DOM tests. */
async function setup(failEditor=false){
 const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf('  if(rendererHolder.current){\n    const renderer=rendererHolder.current;'),end=source.indexOf('  if(rendererHolder.current)contextMenus=',start),queueStart=source.indexOf('  queueInlineRefresh=()=>{'),queueEnd=source.indexOf('\n',queueStart);if(start<0||end<0||queueStart<0||queueEnd<0)throw Error('Review current inline adapter test boundaries.');
 const f=await templateAdapterHarness([annotationRecord(true)]);
 const microtasks:Array<()=>void>=[],editor={refresh:vi.fn(),commit:vi.fn(()=>true),dispose:vi.fn()},geometry={dispose:vi.fn()},ports={surface:{},overlayHost:{},assertCurrent:vi.fn(),readViewport:vi.fn(),canEnter:vi.fn(()=>true),repaint:vi.fn()};let editorHost:any,geometryHost:any,installation:()=>void;
 const captureNativeInlineDOMPorts=vi.fn((_renderer,assert)=>{installation=assert;return ports;}),installOwnedTrendlineInlineGeometry=vi.fn((_renderer,host)=>{geometryHost=host;return geometry;}),installTrendlineInlineEditor=vi.fn(host=>{editorHost=host;if(failEditor)throw Error('SYNTHETIC DOM constructor rejection');return editor;});
 const code=`const {document,chart,controller,captureInlineDrawingOwner,captureTrendlineInlineOpening,DrawingEditRecoveryError,captureNativeInlineDOMPorts,installOwnedTrendlineInlineGeometry,installTrendlineInlineEditor,queueMicrotask}=injected;
 let disposed=false,currentSource={},currentBars=[],requestedStyle='candles',analysisUnavailable='',analysisPending=0,marketUpdating=false,queuePending=false,inlineGeometry=null,inlineEditor=null,inlineRefreshTicket=null,queueInlineRefresh=()=>{},diagnostics=[];
 const rendererHolder={current:{}},marketQueue={isPending:()=>queuePending},unavailable=message=>{analysisUnavailable=message;},captureNativeInlineLayoutOwner=()=>()=>{};
 ${source.slice(queueStart,queueEnd)}
 ${source.slice(start,end)}
 return{queueInlineRefresh,retire:()=>{disposed=true;},replaceSource:()=>{currentSource={};},pending:value=>{analysisPending=value?1:0;},replaceEditor:value=>{inlineEditor=value;},diagnostics:()=>diagnostics,unavailable:()=>analysisUnavailable};`;
 try{const factory=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))();const api=factory({document:f.document,chart:{drawings:{ctrl:f.native.controller}},controller:{updateDrawingEdit:f.edit},captureInlineDrawingOwner,captureTrendlineInlineOpening,DrawingEditRecoveryError,captureNativeInlineDOMPorts,installOwnedTrendlineInlineGeometry,installTrendlineInlineEditor,queueMicrotask:(fn:()=>void)=>microtasks.push(fn)});return{f,api,editor,geometry,ports,editorHost,geometryHost,installation:()=>installation!(),drain:()=>{while(microtasks.length)microtasks.shift()!();},queued:()=>microtasks.length};}catch(error){f.native.dispose();throw error;}
}
it('current adapter wires independent installation/source ownership and actual text-only publication',async()=>{
 const x=await setup();try{const source=x.editorHost.captureSourceOwner(),opening=x.editorHost.captureOpening(x.f.rows[0].id),drawing=x.geometryHost.captureDrawingOwner(x.f.rows[0].id,x.f.projection()[0]);source();drawing();expect(opening.commit('SYNTHETIC wired edit')).toEqual({accepted:true,changed:true});expect((x.f.document.all()[0].text as any).value).toBe('SYNTHETIC wired edit');expect(()=>drawing()).toThrow();x.api.replaceSource();expect(source).toThrow();expect(()=>x.installation()).not.toThrow();const fresh=x.editorHost.captureSourceOwner();fresh();expect(x.editorHost.captureOpening(x.f.rows[0].id).initialValue).toBe('SYNTHETIC wired edit');}finally{x.f.native.dispose();}
});
it('current adapter refuses pending entry and opening, while read-only source lifetime stays valid',async()=>{
 const x=await setup();try{const source=x.editorHost.captureSourceOwner();x.api.pending(true);expect(x.editorHost.canEnter()).toBe(false);expect(()=>x.editorHost.captureOpening(x.f.rows[0].id)).toThrow('busy');source();x.api.pending(false);expect(x.editorHost.canEnter()).toBe(true);x.ports.canEnter.mockReturnValueOnce(false);expect(x.editorHost.canEnter()).toBe(false);}finally{x.f.native.dispose();}
});
it('settled paint refresh is deferred, coalesced and cannot refresh a replaced source or editor',async()=>{
 const x=await setup();try{x.api.queueInlineRefresh();x.api.queueInlineRefresh();expect(x.editor.refresh).not.toHaveBeenCalled();x.drain();expect(x.editor.refresh).toHaveBeenCalledTimes(1);x.api.queueInlineRefresh();x.api.replaceSource();x.drain();expect(x.editor.refresh).toHaveBeenCalledTimes(1);x.api.queueInlineRefresh();x.api.replaceEditor({refresh:()=>{throw Error('Replacement must not be touched');}});x.drain();expect(x.editor.refresh).toHaveBeenCalledTimes(1);x.api.replaceEditor(x.editor);x.api.queueInlineRefresh();x.api.retire();x.drain();expect(x.editor.refresh).toHaveBeenCalledTimes(1);}finally{x.f.native.dispose();}
});
it('inline setup failure releases geometry and remains a bounded unavailable feature without destroying the chart',async()=>{
 const x=await setup(true);try{expect(x.geometry.dispose).toHaveBeenCalledOnce();expect(x.api.diagnostics()).toEqual([expect.objectContaining({code:'INLINE_TEXT_UNAVAILABLE',severity:'unavailable'})]);expect(x.api.unavailable()).toBe('');expect(x.f.native.controller.all()).toHaveLength(1);x.api.queueInlineRefresh();expect(x.queued()).toBe(0);}finally{x.f.native.dispose();}
});
it('refresh error diagnostics never attach to a replacement and accepted cleanup failures are visible',async()=>{
 const x=await setup();try{x.editor.refresh.mockImplementationOnce(()=>{x.api.replaceSource();throw Error('SYNTHETIC obsolete refresh');});x.api.queueInlineRefresh();x.drain();expect(x.api.diagnostics()).toEqual([]);x.editorHost.reportError(Error('SYNTHETIC rejected draft'),{accepted:false});expect(x.api.unavailable()).toBe('');expect(x.api.diagnostics()).toHaveLength(1);x.editorHost.reportError(Error('SYNTHETIC accepted cleanup failure'),{accepted:true});expect(x.api.unavailable()).toContain('annotation changed');expect(x.api.diagnostics()).toHaveLength(1);}finally{x.f.native.dispose();}
});
it('refresh and editor diagnostics recheck source after error formatting callbacks',async()=>{
 const x=await setup();try{
  x.editor.refresh.mockImplementationOnce(()=>{throw{toString(){x.api.replaceSource();return'SYNTHETIC old refresh';}};});x.api.queueInlineRefresh();x.drain();expect(x.api.diagnostics()).toEqual([]);
  x.editorHost.reportError({toString(){x.api.replaceSource();return'SYNTHETIC old accepted edit';}},{accepted:true});expect(x.api.diagnostics()).toEqual([]);expect(x.api.unavailable()).toBe('');
 }finally{x.f.native.dispose();}
});
it('throwing error conversion keeps a bounded current-source diagnostic',async()=>{
 const x=await setup(),error={toString(){throw Error('SYNTHETIC formatting failed');}};try{
  x.editor.refresh.mockImplementationOnce(()=>{throw error;});x.api.queueInlineRefresh();expect(x.drain).not.toThrow();expect(x.api.diagnostics()[0].message).toBe('Inline text refresh failed; details are unavailable.');
  x.editorHost.reportError(error,{accepted:true});expect(x.api.unavailable()).toContain('details are unavailable');
 }finally{x.f.native.dispose();}
});
