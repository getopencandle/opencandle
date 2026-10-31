import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';

/** Source-extracted checks of the actual adapter bodies.
 * They do not establish packaged window behavior. */
const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const line=(needle:string)=>{const start=text.indexOf(needle);if(start<0)throw Error('Review adapter boundary: '+needle);return text.slice(start,text.indexOf('\n',start));};
const run=(code:string)=>new Function('return '+stripTypeScriptTypes('(function(){'+code+'})',{mode:'strip'}))()();

it('unavailable keeps the first quarantine cause and reports it to every observer on later cascades',()=>{
 const body=line('  const unavailable=(message:string)=>');
 const api=run(`let analysisUnavailable='';const availabilitySubscribers=new Set();${body}
  return{unavailable,state:()=>analysisUnavailable,subscribe:(f)=>availabilitySubscribers.add(f)};`);
 const seen:string[]=[];api.subscribe((m:string)=>seen.push(m));api.subscribe(()=>{throw Error('SYNTHETIC observer failure');});
 api.unavailable('Native drawing changed or differs from its canonical record');
 api.unavailable('Fibonacci trend-line source changed.');
 expect(api.state()).toBe('Native drawing changed or differs from its canonical record');
 expect(seen).toEqual(['Native drawing changed or differs from its canonical record','Native drawing changed or differs from its canonical record']);
});

it('Fibonacci source proof reports a quarantined chart as unavailable, and a disposed or changed source as a source change',()=>{
 const start=text.indexOf('      captureOwner(){const source=currentSource,input=currentBars,style=requestedStyle,epoch=statsSourceEpoch,execution=currentExecutionIdentity;');
 if(start<0)throw Error('Review Fibonacci captureOwner boundary.');
 const body=text.slice(start,text.indexOf('\n',start)).trim().replace(/,$/,'');
 const api=run(`let currentSource={},currentBars=[],requestedStyle='candles',statsSourceEpoch={},currentExecutionIdentity='ordinary',disposed=false,analysisUnavailable='';
  const host={${body}};
  return{host,quarantine:()=>{analysisUnavailable='SYNTHETIC cause';},dispose:()=>{disposed=true;},source:()=>{currentSource={};}};`);
 const quarantined=api.host.captureOwner();quarantined();api.quarantine();
 expect(quarantined).toThrow('Fibonacci trend line is unavailable: the chart is quarantined. Reopen the chart.');
 const later=api.host.captureOwner();expect(later).toThrow('quarantined');
 api.dispose();expect(later).toThrow('Fibonacci trend-line source changed.');
 const changed=run(`let currentSource={},currentBars=[],requestedStyle='candles',statsSourceEpoch={},currentExecutionIdentity='ordinary',disposed=false,analysisUnavailable='';
  const host={${body}};return{host,source:()=>{currentSource={};}};`);
 const proof=changed.host.captureOwner();proof();changed.source();expect(proof).toThrow('Fibonacci trend-line source changed.');
});

it('the Fibonacci host exposes the settings live-preview members (renderer copy only), and nothing when no preview is shown',()=>{
 const install=text.indexOf('    try{fibTrendLine=installFibTrendLine(rendererHolder.current,chart,{'),close=text.indexOf('    });}catch{fibTrendLine=null;}',install);
 const start=text.indexOf('      previewMembers:(id:string)=>');
 expect(install).toBeGreaterThan(0);expect(start).toBeGreaterThan(install);expect(start).toBeLessThan(close);
 const body=text.slice(start,text.indexOf('\n',start)).trim().replace(/,$/,'');
 // A stand-in with the createDrawingPreview has/apply contract (src/chart/drawing-preview.ts).
 const api=run(`const previews=new Map();const drawingPreview={has:(id)=>previews.has(id),apply:(row)=>{const p=previews.get(String(row.id));return p?{...row,...structuredClone(p)}:row;}};
  const host={${body}};return{host,show:(id,members)=>previews.set(id,members),clear:(id)=>previews.delete(id)};`);
 expect(api.host.previewMembers('SYNTHETIC-FIB')).toBeUndefined();
 api.show('SYNTHETIC-FIB',{style:{lineWidth:3},anchors:[{time:1,price:2}]});
 const members=api.host.previewMembers('SYNTHETIC-FIB');
 expect(members).toEqual({style:{lineWidth:3},anchors:[{time:1,price:2}]});expect(members).not.toHaveProperty('id');
 members.style.lineWidth=9;expect(api.host.previewMembers('SYNTHETIC-FIB').style.lineWidth).toBe(3);
 expect(api.host.previewMembers('SYNTHETIC-OTHER')).toBeUndefined();
 api.clear('SYNTHETIC-FIB');expect(api.host.previewMembers('SYNTHETIC-FIB')).toBeUndefined();
});

it('the Fibonacci host attests only the Lock all overlay, read live from the same overlay the renderer projection uses',()=>{
 const install=text.indexOf('    try{fibTrendLine=installFibTrendLine(rendererHolder.current,chart,{'),close=text.indexOf('    });}catch{fibTrendLine=null;}',install);
 const start=text.indexOf('      overlayMembers:(_id:string)=>');
 expect(start).toBeGreaterThan(install);expect(start).toBeLessThan(close);
 expect(text).toContain('createDrawingVisibilityProjection({overlay:drawingOverlay,');
 const overlay=line('  const drawingOverlay=()=>');
 const body=text.slice(start,text.indexOf('\n',start)).trim().replace(/,$/,'');
 const api=run(`let drawingUtilityState=null;${overlay}
  const host={${body}};return{host,set:(s)=>{drawingUtilityState=s;}};`);
 expect(api.host.overlayMembers('SYNTHETIC-FIB')).toBeUndefined();
 api.set({drawingsLocked:true,drawingsHidden:false});expect(api.host.overlayMembers('SYNTHETIC-FIB')).toEqual({locked:true});
 // Hide all is not an attested member (a hidden drawing is not painted).
 api.set({drawingsLocked:false,drawingsHidden:true});expect(api.host.overlayMembers('SYNTHETIC-FIB')).toBeUndefined();
 api.set({drawingsLocked:false,drawingsHidden:false});expect(api.host.overlayMembers('SYNTHETIC-FIB')).toBeUndefined();
});
