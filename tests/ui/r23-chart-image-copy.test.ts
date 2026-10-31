import {describe,expect,it,vi} from 'vitest';
import {CHART_IMAGE_COPIED,CHART_IMAGE_COPY_NEEDS_DESKTOP,copyChartImage} from '../../src/ui/chart-image-copy';
import {LIVE_EXPORT_NOTICE} from '../../src/domain/live-provider';
import {chartMenuEntries} from '../../src/ui/ChartContextMenu';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

// Copy chart image. A tiny synthetic PNG data URL stands in for the renderer composite;
// nothing is captured from a screen and nothing is written to disk.
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ok=()=>({ok:true as const,dataUrl:PNG});

describe('copyChartImage',()=>{
 it('reports success only after the bridge says the clipboard was written',async()=>{
  let finish:(value:any)=>void=()=>{};const bridge={copyChartImage:vi.fn(()=>new Promise<any>(resolve=>{finish=resolve;}))};
  const pending=copyChartImage({render:ok,datasetId:'lv-synthetic-v1:GME',bridge});let settled=false;void pending.then(()=>{settled=true;});
  await Promise.resolve();expect(bridge.copyChartImage).toHaveBeenCalledWith({pngDataUrl:PNG});expect(settled).toBe(false);
  finish({ok:true,value:{bytes:70,width:1,height:1}});
  expect(await pending).toEqual({ok:true,message:CHART_IMAGE_COPIED});
 });
 it('a refused or failed clipboard write is never a success',async()=>{
  expect(await copyChartImage({render:ok,datasetId:'x',bridge:{copyChartImage:async()=>({ok:false as const,error:{code:'OPERATION_FAILED',message:'Local operation failed.'}})}})).toEqual({ok:false,message:'Local operation failed.'});
  expect(await copyChartImage({render:ok,datasetId:'x',bridge:{copyChartImage:async()=>{throw new Error('bridge gone');}}})).toEqual({ok:false,message:'bridge gone'});
  expect((await copyChartImage({render:ok,datasetId:'x',bridge:{copyChartImage:async()=>undefined as any}})).ok).toBe(false);
 });
 it('without the desktop bridge and on a render failure nothing is sent',async()=>{
  const bridge={copyChartImage:vi.fn(async()=>({ok:true as const,value:{bytes:1,width:1,height:1}}))};
  expect(await copyChartImage({render:ok,datasetId:'x',bridge:undefined})).toEqual({ok:false,message:CHART_IMAGE_COPY_NEEDS_DESKTOP});
  expect(await copyChartImage({render:()=>({ok:false,diagnostic:{message:'The renderer has no usable chart export surface.'}}),datasetId:'x',bridge})).toEqual({ok:false,message:'The renderer has no usable chart export surface.'});
  expect(await copyChartImage({render:()=>{throw new Error('no canvas');},datasetId:'x',bridge})).toEqual({ok:false,message:'no canvas'});
  expect(bridge.copyChartImage).not.toHaveBeenCalled();
 });
 // approved 2026-10-29: live chart screenshots allowed for personal use.
 it('a live chart copies like a demo chart',async()=>{
  for(const datasetId of ['live:alpaca-iex:GME:5m','fred:DGS10']){const bridge={copyChartImage:vi.fn(async()=>({ok:true as const,value:{bytes:1,width:1,height:1}}))};
   expect(await copyChartImage({render:ok,datasetId,bridge})).toEqual({ok:true,message:CHART_IMAGE_COPIED});expect(bridge.copyChartImage).toHaveBeenCalledWith({pngDataUrl:PNG});}
  expect(LIVE_EXPORT_NOTICE).toMatch(/personal display only/);
 });
});

describe('the chart menu row',()=>{
 const snapshot={entity:{kind:'chart'},point:{price:99.5,unit:'price',pane:{kind:'price'}},instrument:{symbol:'GME',tickSize:0.01},input:{bars:[]},controller:{contextMenu:{isCurrent:()=>true}}} as unknown as ChartMenuSnapshot;
 it('Copy chart image sits just before Save chart image when its handler exists, and is absent otherwise',()=>{
  const actions:ChartContextActions={'source-csv':()=>true,'png-copy':()=>true,'png-save':()=>true};
  expect(chartMenuEntries(snapshot,actions).map(row=>row.label)).toEqual(['Export chart data (CSV)','Copy chart image','Save chart image']);
  expect(chartMenuEntries(snapshot,{'png-save':()=>true}).map(row=>row.label)).toEqual(['Save chart image']);
 });
});
