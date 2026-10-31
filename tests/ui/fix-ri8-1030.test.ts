import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {inspectionCoversAlertBars,requireTechnicalChart} from '../../src/ui/technical-alert-catalog';
import {ALERT_NO_SOURCE_TEXT,ALERT_SOURCE_FAILED_TEXT,ALERT_WAIT_TEXT,alertDiagnosticsLine} from '../../src/ui/AlertDialog';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {alertDatasetWithPrefix} from '../../src/domain/alert-observation';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {HANDLE_CLEARANCE,PANE_LEGEND_RESERVE,placeBarInPane} from '../../src/ui/drawing-edit-bar-position';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {ChartController} from '../../src/chart/adapter';

// Alerts on live stock charts (any session), plain alert text, the edit bar clear of the drawing's handles,
// the watchlist X slot / hold / undo toast, and the native save dialog dropping keys. SYNTHETIC GME only, no network.
const em=/—/;

/** A chart that shows `shown` (the live feed with older history on the left) while alerts read `bars`. */
function fakeChart(dataset:BarDataset,bars:readonly Bar[],shown:readonly Bar[]):ChartController{
 const context=sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars);
 return {getAnalysisUnavailable:()=>null,getSourceContext:()=>context,getStyle:()=>'candles',
  getDataWindow:()=>({pending:false,source:context,series:{count:shown.length,firstTime:shown[0]?.time??null,lastTime:shown.at(-1)?.time??null,style:'candles'}})} as unknown as ChartController;
}
/** SYNTHETIC bars: 5m from 04:00 to 19:55 New York (EDT) on five weekdays, or 60 daily bars. */
function synthBars(resolution:'5m'|'1D'):Bar[]{
 const out:Bar[]=[];let price=20;
 const push=(time:number)=>{const open=price;price=Math.max(1,price+Math.sin(time/7777)*0.05);out.push({time,open,high:Math.max(open,price)+0.02,low:Math.min(open,price)-0.02,close:price,volume:1000} as Bar);};
 const monday=Date.UTC(2026,9,19)/1000;
 if(resolution==='5m'){for(let day=0;day<5;day++)for(let minute=4*60;minute<20*60;minute+=5)push(monday+day*86400+(minute+240)*60);}
 else for(let day=0,count=0;count<60;day++){const time=monday-120*86400+day*86400+4*3600,weekday=new Date(time*1000).getUTCDay();if(weekday===0||weekday===6)continue;push(time);count++;}
 return out;
}
function stock(resolution:'5m'|'1D'):BarDataset{const base=alpacaSearchDatasets(true,['GME'],resolution)[0]!;return{...base,bars:synthBars(resolution)};}
function liveFeed(dataset:BarDataset,history:number):{dataset:BarDataset;full:Bar[];alert:Bar[]}{
 const full=dataset.bars.slice(),alert=full.slice(history);
 stampLiveLineage(full,'synthetic:GME:'+dataset.resolution,4);stampLiveLineage(alert,'synthetic:GME:'+dataset.resolution,4);
 return{dataset:{...dataset,bars:alert},full,alert};
}

describe('FIX-RI8 item 1: alerts on live stock charts',()=>{
 it('a live chart that loaded older history still offers its sources (was "No data source")',()=>{
  const base=stock('5m');
  for(const session of [undefined,'regular','extended'] as const){
   const view=cellSessionDataset(base,{session}),{dataset,full,alert}=liveFeed(view,Math.floor(view.bars.length/3));
   expect(alert.length).toBeGreaterThan(20);expect(full.length).toBeGreaterThan(alert.length);
   if(session==='regular')expect(dataset.provenance.session).toBe('regular');
   expect(()=>requireTechnicalChart(fakeChart(dataset,alert,full),dataset,alert)).not.toThrow();
   expect(()=>createTechnicalScriptEvaluator({dataset,sessionOverride:session})).not.toThrow();
  }
 });
 it('daily charts with a session choice (dormant) and the default work too',()=>{
  const daily=stock('1D');
  for(const session of [undefined,'regular','extended'] as const){
   const view=cellSessionDataset(daily,{session}),{dataset,full,alert}=liveFeed(view,Math.floor(view.bars.length/4));
   expect(()=>requireTechnicalChart(fakeChart(dataset,alert,full),dataset,alert)).not.toThrow();
   expect(()=>createTechnicalScriptEvaluator({dataset,sessionOverride:session})).not.toThrow();
  }
 });
 it('the live rule needs the chart to cover the alert bars; a fixed input must still match exactly',()=>{
  const bars=[{time:10},{time:20},{time:30}] as Bar[];
  expect(inspectionCoversAlertBars({count:5,firstTime:0,lastTime:30},bars,true)).toBe(true);
  expect(inspectionCoversAlertBars({count:4,firstTime:10,lastTime:40},bars,true)).toBe(true); // newer live snapshot
  expect(inspectionCoversAlertBars({count:2,firstTime:20,lastTime:30},bars,true)).toBe(false);
  expect(inspectionCoversAlertBars({count:3,firstTime:10,lastTime:20},bars,true)).toBe(false);
  expect(inspectionCoversAlertBars({count:5,firstTime:0,lastTime:30},bars,false)).toBe(false);
  expect(inspectionCoversAlertBars({count:3,firstTime:10,lastTime:30},bars,false)).toBe(true);
  const fixed=stock('5m'),shown=fixed.bars,cut=shown.slice(5),dataset={...fixed,bars:cut};
  expect(()=>requireTechnicalChart(fakeChart(dataset,cut,shown),dataset,cut)).toThrow();
 });
 it('internal error text never reaches the dialog',()=>{
  const prefix='The committed chart inspection disagrees with its information prefix.';
  expect(alertDiagnosticsLine([prefix],true)).toBe(ALERT_NO_SOURCE_TEXT);
  expect(alertDiagnosticsLine([prefix],false)).toBe(ALERT_SOURCE_FAILED_TEXT);
  expect(alertDiagnosticsLine(['The chart source or information prefix is changing. Technical alerts are waiting.'],true)).toBe(ALERT_WAIT_TEXT);
  expect(alertDiagnosticsLine(['The chart has not committed this exact information prefix.','Local source observation is not enabled.'],true)).toBe(ALERT_WAIT_TEXT);
  expect(alertDiagnosticsLine(['2 saved alerts are inactive, paused, or bound to a retired source. Only the supplied active-chart context is observed.'],false)).toBe('Some saved alerts are paused or no longer match this chart.');
  expect(alertDiagnosticsLine(["TypeError: Cannot read properties of undefined (reading 'x')"],true)).toBe(ALERT_NO_SOURCE_TEXT);
  expect(alertDiagnosticsLine(['price: Waiting for the next bar.'],false)).toBe('Waiting for the next bar.');
  for(const text of [ALERT_WAIT_TEXT,ALERT_NO_SOURCE_TEXT,ALERT_SOURCE_FAILED_TEXT])expect(text).not.toMatch(em);
 });
});

describe('FIX-RI8 item 4: the edit bar stays off the drawing handles',()=>{
 const bar={width:296,height:40},pane={width:900,height:600};
 const handles=(box:{left:number;top:number;right:number;bottom:number})=>[[box.left,box.top],[box.right,box.top],[box.left,box.bottom],[box.right,box.bottom]];
 const onHandle=(place:{left:number;top:number},box:{left:number;top:number;right:number;bottom:number})=>handles(box).some(([x,y])=>x>place.left-HANDLE_CLEARANCE&&x<place.left+bar.width+HANDLE_CLEARANCE&&y>place.top-HANDLE_CLEARANCE&&y<place.top+bar.height+HANDLE_CLEARANCE);
 it('above, below (drawing near the legend band) and beside (drawing fills the height)',()=>{
  for(const box of [{left:300,top:300,right:500,bottom:360},{left:300,top:60,right:500,bottom:140},{left:200,top:20,right:400,bottom:590},{left:520,top:10,right:880,bottom:595}]){
   const place=placeBarInPane(box,bar,pane);
   expect(onHandle(place,box)).toBe(false);
   expect(place.top).toBeGreaterThanOrEqual(PANE_LEGEND_RESERVE);expect(place.left+bar.width).toBeLessThanOrEqual(pane.width);
  }
 });
 it('the RI8 case: a trendline under the legend band no longer puts the bar on its lower handle',()=>{
  const box={left:420,top:70,right:640,bottom:180},place=placeBarInPane(box,bar,pane);
  expect(place.top).toBeGreaterThanOrEqual(box.bottom+HANDLE_CLEARANCE);
 });
});

describe('FIX-RI8 items 2 and 3: source pins',()=>{
 const panel=readFileSync('src/ui/WatchlistPanel.tsx','utf8'),css=readFileSync('src/ui/watchlist.css','utf8'),main=readFileSync('electron/main.cjs','utf8');
 it('watchlist X: own slot, held after a removal until the pointer moves to another row, Undo toast',()=>{
  expect(css).toContain('.watchlist-panel-v2 td.wl-remove-host{padding-right:26px}');
  expect(css).toContain('.wl-table[data-wl-remove-hold] .wl-row-remove');
  expect(panel).toContain('if(removeHold.current)return;');
  expect(panel).toContain("onPointerMove={holdPointer} onPointerLeave={releaseHold}");
  expect(panel).toContain('Removed {removed.symbol}. <button type="button" onClick={undoRemove}>Undo</button>');
  expect(panel).toContain("'Put back '+shown.symbol+'.'");
 });
 it('native dialogs drop keys sent to the page and tell the page',()=>{
  expect(main).toContain("contents?.on('before-input-event', swallow)");
  expect(main).toContain("'lv:native-dialog', { open:true }");
  expect(main).toContain('const release = holdWindowInput(parent);');
  expect(main.match(/modalOpenDialog\(mainWindow,/g)?.length).toBe(3);
  expect(main).not.toMatch(/dialog\.showOpenDialog\(mainWindow/);
 });
});

import {hoveredInspection} from '../../src/ui/grid-hover';
describe('FIX-RI8 routed item 3: grid hover check with older history loaded',()=>{
 it('the hovered chart is compared with its own bars (getSourceBars), so loaded history never hides the readout',()=>{
  const full=synthBars('1D'),bar=full[3]!;
  const snapshot={pending:false,source:{},series:{count:full.length,firstTime:full[0]!.time,lastTime:full.at(-1)!.time,style:'candles'},displayed:{index:3,bar,hovered:true},standard:{index:3,bar,hovered:true}};
  expect(hoveredInspection(snapshot as never,full,full,'candles')).toBe(snapshot);
  // Only an inspection of another load (other bars than the controller now holds) shows the last bar.
  expect(hoveredInspection(snapshot as never,full.slice(10),full.slice(10),'candles')).toBeNull();
  const adapter=readFileSync('src/chart/adapter.ts','utf8');
  expect(adapter).toContain('getSourceBars:():Bar[]=>structuredClone(currentBars)');
  expect(adapter).toContain('series:{count:currentBars.length,firstTime:currentBars[0]?.time??null');
 });
});
