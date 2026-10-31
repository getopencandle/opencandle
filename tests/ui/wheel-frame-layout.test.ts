import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterAll,expect,it} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';

// Static SSR executes the actual grid/cell/panel render paths and actual CSS. React passive/layout effects
// do not run: no Electron app, chart construction, feed, account, OS input, saved profile or image is involved.
const dataset=fixtureDataset('GME',8),source=sourceContextForDataset(dataset),base=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),id=base.layout.activeCellId;
const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};
function markup(restoring:boolean){
 const state=structuredClone(base);if(restoring)state.cells[id].frame=structuredClone(frame);
 return renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:[dataset],onChange:()=>{throw Error('Static fixture cannot publish');},onReady:()=>{throw Error('Static fixture cannot mount a chart');},onActiveCell:()=>{throw Error('Static fixture cannot focus a chart');}}));
}
const css=['indicator-legend.css','styles.css','components.css','analysis.css','news.css'].map(name=>readFileSync(resolve('src/ui',name),'utf8')).join('\n'),receipts:unknown[]=[];let browser:Browser|undefined;
afterAll(async()=>{try{await browser?.close();}finally{mkdirSync(resolve('.tmp/codex-wheel-jitter'),{recursive:true});writeFileSync(resolve('.tmp/codex-wheel-jitter',process.env.LV_WHEEL_JITTER_BASELINE==='1'?'baseline-layout.json':'fixed-layout.json'),JSON.stringify({scope:'Isolated headless static actual-component layout only; no app, desktop input, native chart paint, images or network.',headless:true,receipts},null,2)+'\n');}});
for(const height of [640,900])it(`chart geometry remains stable through restoring status at ${height}px`,async()=>{
 browser??=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check']});
 const context=await browser.newContext({viewport:{width:1100,height:1000},offline:true});
 try{
  const page=await context.newPage();let requests=0;await page.route('**/*',route=>{requests++;return route.abort();});
  const measure=async(restoring:boolean)=>{
   await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body><div id="SYNTHETIC-layout-fixture" style="position:relative;width:1000px;height:'+height+'px;display:flex">'+markup(restoring)+'</div></body></html>');
   // SSR runs no effects, so the 400 ms-delayed pending notice cannot appear by itself. Mount the notice element exactly as the
   // cell renders it once shown (same class, role, absolute placement and text) to prove it still never moves the canvas.
   if(restoring)await page.evaluate(()=>{const host=document.querySelector('.chart-canvas')?.closest('div[style*="position:relative"]');if(!host)throw Error('Actual cell surface is missing');const note=document.createElement('output');note.className='lv-notice-fade';note.setAttribute('role','status');note.setAttribute('style','position:absolute;top:8px;left:8px;z-index:2');note.textContent='Restoring saved chart frame...';host.appendChild(note);});
   return page.evaluate(()=>{
    const canvas=document.querySelector('.chart-canvas'),panel=document.querySelector('.chart-panel');if(!canvas||!panel)throw Error('Actual chart component surface is missing');
    const box=canvas.getBoundingClientRect(),outer=panel.getBoundingClientRect(),status=[...document.querySelectorAll('[role="status"]')].find(node=>node.textContent==='Restoring saved chart frame...');
    return{canvas:{x:box.x,y:box.y,width:box.width,height:box.height,bottom:box.bottom},panel:{x:outer.x,y:outer.y,width:outer.width,height:outer.height},restoreText:status?.textContent??null,restoringVisibility:getComputedStyle(canvas).visibility};
   });
  };
  const ready=await measure(false),restoring=await measure(true),complete=await measure(false),shrink=ready.canvas.height-restoring.canvas.height;
  receipts.push({height,ready,restoring,complete,shrink,requests,browserVersion:browser.version()});
  expect(ready.canvas.height).toBeGreaterThan(300);expect(restoring.restoreText).toBe('Restoring saved chart frame...');expect(restoring.restoringVisibility).toBe('hidden');
  expect(restoring.canvas.y).toBe(ready.canvas.y);expect(restoring.canvas.width).toBe(ready.canvas.width);expect(Math.abs(shrink)).toBeLessThanOrEqual(.05);expect(complete.canvas).toEqual(ready.canvas);expect(requests).toBe(0);
 }finally{await context.close();}
});
it('a real wheel-frame publication creates a fresh saved frame even when only its viewport changed',()=>{
 let state=structuredClone(base),range={from:dataset.bars[0].time,to:dataset.bars.at(-1)!.time},published=0;state.cells[id].frame=structuredClone(frame);const saved=state.cells[id],native={getViewport:()=>({...range}),captureHistoricalFrame:()=>structuredClone(frame)},input={bars:dataset.bars,source,style:'candles'};
 const gesture=createGridFrameGesture({read:()=>state,cell:()=>({chart:native as any,input,executionIdentity:'ordinary',fingerprints:{}}),publish(next){published++;state=next;return true;},failed(_ids,message){throw Error(message);}});
 try{expect(gesture.begin(id)).toBe(true);range={from:range.from+100,to:range.to-100};gesture.finish();gesture.flush();expect(published).toBe(1);expect(state.cells[id].frame).toEqual(frame);expect(state.cells[id].frame).not.toBe(saved.frame);expect(state.cells[id].viewport).toEqual(range);}finally{gesture.dispose();}
});
