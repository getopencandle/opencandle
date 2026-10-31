import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {beginChartTreeSuspension} from '../../src/chart/tree-suspension';
import {acquireNotificationHolds} from '../../src/chart/configuration-edit';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';
// The module is new in; on the base it is absent and the checks below fail by assertion.
const held:Record<string,unknown>=await import('../../src/chart/held-drawing-publication').catch(()=>({}));

// (fail-first): a native drawing gesture made while the routine background autosave holds the chart (drag of a
// drawing or an anchor, inline text editing) was lost. The save holds the chart for its write (adapter.ts suspendTree ->
// tree-suspension.ts); vela's 'drawing:edited' reaches updateDocument -> notifyDrawings, which only marks drawingDirty inside
// the hold, and the hold ends with release(publish=false), which clears it. Nothing ever published the change.
// Source-extracted actual adapter lines (notifyDrawings, updateDocument, holdAnalysisNotifications, suspendTree and the
// controller's held-publication members) with the actual tree suspension, notification holds and drawing publication.
// Native reconciliation, the market queue and the analysis transactions are controlled stand-ins. SYNTHETIC; no GUI claim.
const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const line=(needle:string,optional=false)=>{const start=text.indexOf(needle);if(start<0){if(optional)return'';throw Error('Review adapter boundary: '+needle);}return text.slice(start,text.indexOf('\n',start));};
function fixture(){
 const body=[line('  const heldDrawings=',true),line('  const notifyDrawings='),line('  const updateDocument = () =>'),line('  const holdAnalysisNotifications='),line('  suspendTree=request=>')].join('\n');
 const members=[line('    onHeldDrawingChange:',true),line('    publishHeldDrawings:',true)].filter(Boolean).join('\n');
 const code=`let drawingBatch=0,drawingDirty=false,nativeDrawingReconciliationHold=0,disposed=false,analysisPending=0,diagnostics=[],suspendTree;
  const drawingSubscribers=new Set(),contextMenus=null,reconciled=[];
  const reconcileNativeDrawings=()=>{reconciled.push('reconcile');};const unavailable=message=>{throw Error(message);};
  const controller={isInputCurrent:()=>true};const marketQueue={reserve:()=>({release(){},isCurrent:()=>true})};
  const sameChartSourceBasis=()=>true,barInputIdentity=()=>'synthetic',currentSource={inputIdentity:'synthetic'},requestedStyle='candles';
  const transaction=()=>({release(){}});const indicators={beginExternalTransaction:transaction},scripts={beginExternalTransaction:transaction},comparisons={beginExternalTransaction:transaction};
  const disposeChart=()=>{disposed=true;};
  ${body}
  const api={${members}};
  return{api,notifyDrawings,updateDocument,subscribe:fn=>drawingSubscribers.add(fn),suspend:request=>suspendTree(request),state:()=>({drawingBatch,drawingDirty,analysisPending})};`;
 const factory=new Function('createHeldDrawingPublication','beginChartTreeSuspension','acquireNotificationHolds','publishDrawingSubscribers','return '+stripTypeScriptTypes('(function(){'+code+'})',{mode:'strip'})+'();');
 return factory(held.createHeldDrawingPublication,beginChartTreeSuspension,acquireNotificationHolds,publishDrawingSubscribers) as {api:Record<string,((...args:unknown[])=>unknown)|undefined>;notifyDrawings:()=>void;updateDocument:()=>void;subscribe:(fn:()=>void)=>void;suspend:(request:unknown)=>{resume:()=>void;isCurrent:()=>boolean};state:()=>{drawingBatch:number;drawingDirty:boolean;analysisPending:number}};
}
const scripts=()=>({changed:false,stage(){},pauseAndCapture(){},rollback(){},resume(){},abandon(){}});
const request=()=>({expected:{bars:[],source:{},style:'candles'},scripts:scripts()});

it('a native drawing edit made while the routine autosave holds the chart is published after the hold, not dropped',()=>{
 const f=fixture(),published:string[]=[],signals:string[]=[];f.subscribe(()=>{published.push('drawings');});
 f.api.onHeldDrawingChange?.(()=>{signals.push('held');});
 const lease=f.suspend(request());
 expect(f.state().analysisPending,'the chart is held for the write').toBe(1);
 // vela 'drawing:edited' after a drag of an anchor (or an inline text edit closing) during the write.
 f.updateDocument();
 expect(published,'nothing is published inside the hold').toEqual([]);
 expect(signals.length,'the hold reports the held drawing change at once (so App can queue it in press order)').toBeGreaterThan(0);
 lease.resume();
 expect(f.state()).toEqual({drawingBatch:0,drawingDirty:false,analysisPending:0});
 expect(published,'the release itself still publishes nothing (the storage write is still finishing)').toEqual([]);
 expect(typeof f.api.publishHeldDrawings,'the controller can publish the held change after the write').toBe('function');
 expect(f.api.publishHeldDrawings!()).toBe(true);
 expect(published,'the held change reaches the grid capture once').toEqual(['drawings']);
 expect(f.api.publishHeldDrawings!(),'only once').toBe(false);expect(published).toEqual(['drawings']);
});

it('an ordinary publication after the hold carries the held change, so the queued publication has nothing left to do',()=>{
 const f=fixture(),published:string[]=[];f.subscribe(()=>{published.push('drawings');});
 const lease=f.suspend(request());f.updateDocument();lease.resume();
 f.notifyDrawings();expect(published).toEqual(['drawings']);
 expect(f.api.publishHeldDrawings?.(),'nothing pending after an ordinary publication').toBe(false);expect(published).toEqual(['drawings']);
});

it('no native change during the hold: nothing is signalled or published; a disposed chart publishes nothing',()=>{
 const f=fixture(),published:string[]=[],signals:string[]=[];f.subscribe(()=>{published.push('drawings');});f.api.onHeldDrawingChange?.(()=>{signals.push('held');});
 f.suspend(request()).resume();
 expect(signals).toEqual([]);expect(f.api.publishHeldDrawings?.()).toBe(false);expect(published).toEqual([]);
 const g=fixture(),gPublished:string[]=[];g.subscribe(()=>{gPublished.push('drawings');});
 const lease=g.suspend(request());g.updateDocument();lease.resume();
 // A drawing change outside any routine hold is published at once, as before.
 g.notifyDrawings();expect(gPublished).toEqual(['drawings']);
});

it('the held-publication policy: one remembered change per hold, listeners told each time, failures contained',()=>{
 const create=held.createHeldDrawingPublication as typeof import('../../src/chart/held-drawing-publication').createHeldDrawingPublication|undefined;
 expect(typeof create).toBe('function');
 let live=true;const published:string[]=[],reports:unknown[]=[];
 const p=create!({publish:()=>{published.push('x');},live:()=>live,report:error=>{reports.push(error);}});
 const seen:string[]=[];p.subscribe(()=>{throw Error('SYNTHETIC listener failure');});p.subscribe(()=>{seen.push('told');});
 p.held();expect(p.pending(),'outside a routine hold nothing is remembered').toBe(false);
 const hold=p.hold();p.held();p.held();
 expect(seen).toEqual(['told','told']);expect(reports.length).toBe(2);
 expect(p.flush(),'not while the hold is open').toBe(false);
 hold.release(false);hold.release(true);
 expect(p.flush()).toBe(true);expect(published).toEqual(['x']);expect(p.flush()).toBe(false);
 const second=p.hold();second.release(true);expect(p.pending(),'a change still held at the release is remembered').toBe(true);
 live=false;expect(p.flush(),'a disposed chart publishes nothing').toBe(false);expect(published).toEqual(['x']);
});
