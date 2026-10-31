import {beforeAll,describe,expect,it} from 'vitest';
import {moveStudyToNewPane,placePaneAbovePrice,studyOnPricePane,finishNewPaneAbove,canPlacePaneAbovePrice} from '../../src/chart/pane-actions';
import {studyMoveTarget} from '../../src/ui/ObjectTreePanel';
import {realVelaChart} from '../helpers/real-vela-chart';
import {velaChrome,type VelaChrome} from './scalex-harness';

// "New pane above" on a price-pane indicator must land above the price pane although Vela 0.8.4
// insertPaneOrder clamps a new pane to index 1. Runs the pinned EngineOrchestrator and PanesControl code over a
// SYNTHETIC renderer stand-in that records calls; no canvas, DOM or GUI claim.
let chrome:VelaChrome;
beforeAll(async()=>{chrome=await velaChrome();});

function chart(){
 const records=new Map<string,any>(),calls:string[]=[];
 const model=(paneId:string)=>({paneId,title:'t',ownScale:false,series:[],fills:[],backgrounds:[],priceLines:[],overlay:false});
 const add=(id:string,paneId:string)=>records.set(id,{id,title:id,model:model(paneId),renderHandle:{id}});
 add('vol','price');add('rsi','pane-rsi');add('macd','pane-macd');
 const renderer:any={capabilities:{paneManagement:true},setIndicatorPane(handle:{id:string},paneId:string,opts:any){const row=records.get(handle.id).model;row.paneId=paneId;row.ownScale=opts?.ownScale===true;calls.push('set:'+handle.id+':'+paneId);},ensurePane(){},removePane(id:string){calls.push('remove:'+id);},orderPanes(order:string[]){calls.push('order:'+order.join(','));}};
 const orchestrator:any=Object.create(chrome.EngineOrchestrator.prototype);
 Object.assign(orchestrator,{renderer,registry:{all:()=>[...records.values()],get:(id:string)=>records.get(id)},paneOrder:['price','pane-rsi','pane-macd'],collapsedPanes:new Set(),maximizedPaneId:null,events:{emit(){}}});
 const panes=new chrome.PanesControl(orchestrator);
 return{chart:{panes,orchestrator} as any,orchestrator,calls,records};
}
const order=(c:ReturnType<typeof chart>)=>c.chart.panes.list().map((row:any)=>row.id);

describe('FX-F4 the existing move target is clamped below price',()=>{
 it('studyMoveTarget before:price lands the new pane at index 1, below the price pane (the defect)',()=>{
  const c=chart(),target=studyMoveTarget({chart:c.chart},'vol','above');
  expect(target).toEqual({newPane:{before:'price'}});
  c.chart.panes.moveIndicator('vol',target);
  expect(order(c)).toEqual(['price','pane-vol','pane-rsi','pane-macd']);
 });
});

describe('placePaneAbovePrice (after the indicator port own move)',()=>{
 it('lifts the clamped pane to the top, and refuses for a price-pane indicator',()=>{
  const c=chart();c.chart.panes.moveIndicator('vol',studyMoveTarget({chart:c.chart},'vol','above'));
  expect(order(c)[0]).toBe('price');
  expect(placePaneAbovePrice(c.chart,'vol')).toEqual({ok:true,paneId:'pane-vol'});expect(order(c)).toEqual(['pane-vol','price','pane-rsi','pane-macd']);
  expect(placePaneAbovePrice(chart().chart,'vol')).toMatchObject({ok:false,message:expect.stringMatching(/unavailable/i)});
 });
});

describe('moveStudyToNewPane',()=>{
 it('above a price-pane indicator lands the new pane above price',()=>{
  const c=chart(),result=moveStudyToNewPane(c.chart,'vol','above');
  expect(result).toMatchObject({ok:true});
  expect(order(c)).toEqual(['pane-vol','price','pane-rsi','pane-macd']);
  expect(c.chart.panes.list()[0].indicators.map((row:any)=>row.id)).toEqual(['vol']);
  expect((result as {paneId:string}).paneId).toBe('pane-vol');
 });
 it('below a price-pane indicator lands directly under price',()=>{
  const c=chart();expect(moveStudyToNewPane(c.chart,'vol','below')).toMatchObject({ok:true});
  expect(order(c)).toEqual(['price','pane-vol','pane-rsi','pane-macd']);
 });
 it('above and below a study-pane indicator need no reorder',()=>{
  const up=chart();expect(moveStudyToNewPane(up.chart,'macd','above')).toMatchObject({ok:true});expect(order(up)).toEqual(['price','pane-rsi','pane-macd-2']);
  const down=chart();expect(moveStudyToNewPane(down.chart,'rsi','below')).toMatchObject({ok:true});expect(order(down)).toEqual(['price','pane-rsi-2','pane-macd']);
 });
 it('refuses with a reason when the indicator or the renderer is unavailable and changes nothing',()=>{
  const c=chart();expect(moveStudyToNewPane(c.chart,'nope','above')).toMatchObject({ok:false,message:expect.stringMatching(/unavailable/i)});
  c.orchestrator.renderer.capabilities={paneManagement:false};expect(moveStudyToNewPane(c.chart,'vol','above')).toMatchObject({ok:false,message:expect.stringMatching(/cannot manage panes/i)});
  expect(order(c)).toEqual(['price','pane-rsi','pane-macd']);
 });
 it('a chart without the orchestrator reorder hook reports the gap instead of landing below price silently',()=>{
  const c=chart(),bare={panes:c.chart.panes};
  const result=moveStudyToNewPane(bare as any,'vol','above');
  expect(result).toMatchObject({ok:false,message:expect.stringMatching(/above the price pane/i)});
 });
});

describe('host move helpers',()=>{
 it('studyOnPricePane and finishNewPaneAbove complete a host-side New pane above',()=>{
  const c=chart(),host={chart:c.chart};
  expect(studyOnPricePane(host,'vol')).toBe(true);expect(studyOnPricePane(host,'rsi')).toBe(false);expect(studyOnPricePane({},'vol')).toBe(false);
  const was=studyOnPricePane(host,'vol');
  c.chart.panes.moveIndicator('vol',studyMoveTarget(host,'vol','above'));
  expect(finishNewPaneAbove(host,'vol',was)).toEqual({ok:true,paneId:'pane-vol'});expect(order(c)[0]).toBe('pane-vol');
  expect(finishNewPaneAbove(host,'rsi',false)).toMatchObject({ok:true});
  expect(finishNewPaneAbove({},'vol',true)).toMatchObject({ok:false});
 });
});

describe('reorder hook pre-check (call before the port move)',()=>{
 it('passes for a study-pane indicator and for a price-pane indicator on a chart with the hook, refuses without it, and mutates nothing',()=>{
  const c=chart(),host={chart:c.chart},before=order(c).join();
  expect(canPlacePaneAbovePrice(host,'rsi')).toMatchObject({ok:true});expect(canPlacePaneAbovePrice(host,'vol')).toMatchObject({ok:true});
  const bare={chart:{panes:c.chart.panes} as any};
  expect(canPlacePaneAbovePrice(bare,'vol')).toMatchObject({ok:false,message:expect.stringMatching(/above the price pane/i)});
  expect(canPlacePaneAbovePrice(bare,'rsi')).toMatchObject({ok:true});
  expect(order(c).join()).toBe(before);
 });
 it('finds the reorder hook on the package real Vela shape (tests/helpers/real-vela-chart.ts)',async()=>{
  const {nativeDrawingHarness}=await import('./drawing-native-harness'),{annotationNativeHarness}=await import('./trendline-annotation-native-harness');
  const native=await nativeDrawingHarness(),paint=await annotationNativeHarness(),real=await realVelaChart({renderer:paint.renderer,core:native.controller});
  try{
   const own=Object.getOwnPropertyDescriptor(real.chart,'orchestrator')!;
   expect(Object.hasOwn(own,'value')).toBe(true);expect(typeof (own.value as {reorderPanes?:unknown}).reorderPanes).toBe('function');
   // No indicator is registered on this shape, so the pre-check passes (nothing sits on the price pane) and the lift refuses.
   expect(canPlacePaneAbovePrice({chart:real.chart},'absent')).toMatchObject({ok:true});
   expect(placePaneAbovePrice(real.chart,'absent')).toMatchObject({ok:false});
  }finally{native.dispose?.();}
 });
});
