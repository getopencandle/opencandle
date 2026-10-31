import {afterAll,beforeAll,expect,it} from 'vitest';
import {chromium,type Browser,type Page} from 'playwright';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {statusLineParts} from '../../src/chart/status-line-model';
import {statusLineLead,statusLineValues} from '../../src/ui/indicator-legend-view';
import {chartHeaderChange} from '../../src/ui/data-window-model';
import {headingRoom,HEADING_NARROW_WIDTH,HEADING_TINY_WIDTH} from '../../src/ui/CellSeriesHeading';

// Owner report (0.8.1): in grid layouts the chart legend cut off the change percent. The heading markup comes from the same
// status-line functions CellSeriesHeading renders, styled by the shipped CSS, laid out by headless Chromium (no app window).
// The user-visible check: the change span, with its "%", lies wholly inside the heading's visible box at every grid width.
const CSS=['src/ui/styles.css','src/ui/components.css','src/ui/cell-series-heading.css'].map(file=>readFileSync(file,'utf8')).join('\n');
let browser:Browser,page:Page;
beforeAll(async()=>{
 try{browser=await chromium.launch({headless:true});}
 catch{browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});}
 page=await browser.newPage({viewport:{width:2000,height:900}});
},60000);
afterAll(async()=>{await browser?.close();});

const settings={logo:true,title:{visible:true,source:'name' as const},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:true,transparency:50}};
function headingHtml(close:number,previous:number){
 const bar={time:2,open:previous,high:Math.max(close,previous)+1,low:Math.min(close,previous)-1,close,volume:1},prior={...bar,time:1,close:previous};
 const status=statusLineParts(settings,{symbol:'SOL-USD',name:'Solana (Coinbase public feed)',exchange:'Coinbase',interval:'5m'},bar,prior,[],{legendVisible:true});
 return renderToStaticMarkup(React.createElement(React.Fragment,null,
  React.createElement('div',null,...statusLineLead(status,React.createElement('b',{className:'synthetic-badge'},'LIVE'))),
  React.createElement('div',{className:'ohlc'},...statusLineValues(status,chartHeaderChange(bar,prior)))));
}
/** One grid cell: the workspace (the lv-chart container) at `workspace` px, the heading capped like the placement hook does. */
async function measure(workspace:number,dataWidth:number,html:string){
 await page.setContent('<!doctype html><html><head><style>'+CSS+'</style></head><body style="margin:0"><div class="chart-workspace" style="width:'+workspace+'px;height:600px"><div style="position:relative;width:'+(dataWidth+60)+'px;height:400px"><div class="chart-heading lv-cell-series-heading" data-lv-heading-room="'+headingRoom(dataWidth)+'" style="visibility:visible;left:6px;top:4px;max-width:'+Math.max(0,dataWidth-40)+'px">'+html+'</div></div></div></body></html>');
 return page.evaluate(()=>{
  const heading=document.querySelector('.chart-heading') as HTMLElement,change=heading.querySelector('[data-status-part=barChange]') as HTMLElement,title=heading.querySelector('[data-status-part=title]') as HTMLElement;
  const box=heading.getBoundingClientRect(),own=change.getBoundingClientRect(),row=(change.parentElement as HTMLElement).getBoundingClientRect();
  return{display:getComputedStyle(change).display,text:change.textContent,changeLeft:own.left,changeRight:own.right,changeTop:own.top,changeBottom:own.bottom,rowRight:row.right,headingLeft:box.left,headingRight:box.right,headingBottom:box.top+heading.clientHeight,clipped:change.scrollWidth>change.clientWidth+0.5,titleTruncated:title.scrollWidth>title.clientWidth+0.5};
 });
}

it('the room classes cover a 16-chart grid cell (tiny) and a 4-chart cell (narrow)',()=>{
 expect(headingRoom(300)).toBe('tiny');expect(headingRoom(HEADING_TINY_WIDTH+1)).toBe('narrow');expect(headingRoom(HEADING_NARROW_WIDTH+1)).toBe('wide');
});
for(const workspace of [1800,800])for(const dataWidth of [180,240,300,380,450,600,700,900]){
 it(`the change percent is fully visible: workspace ${workspace}px, plot ${dataWidth}px`,async()=>{
  for(const [close,previous] of [[210.37,205.12],[67850.25,69990.5],[0.4321,0.4567]] as const){
   const html=headingHtml(close,previous),fact=await measure(workspace,dataWidth,html);
   expect(fact.display,'change hidden').not.toBe('none');
   expect(fact.text).toMatch(/\(-?\d+\.\d\d%\)$/);
   expect(fact.clipped,'change clipped inside its own box').toBe(false);
   expect(fact.changeLeft).toBeGreaterThanOrEqual(fact.headingLeft-0.5);
   expect(fact.changeRight,`"${fact.text}" runs past the legend edge`).toBeLessThanOrEqual(fact.headingRight+0.5);
   expect(fact.changeRight).toBeLessThanOrEqual(fact.rowRight+0.5);
   expect(fact.changeBottom,'change below the visible heading').toBeLessThanOrEqual(fact.headingBottom+0.5);
  }
 },30000);
}
it('in a narrow one-row cell the symbol title truncates first, the change keeps its full text',async()=>{
 const fact=await measure(1800,300,headingHtml(67850.25,69990.5));
 expect(fact.titleTruncated).toBe(true);
 expect(fact.text).toBe('-2140.25 (-3.06%)');
});
