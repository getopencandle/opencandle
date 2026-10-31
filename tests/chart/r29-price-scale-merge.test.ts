import {afterEach,describe,expect,it,vi} from 'vitest';
import {priceScaleMenuEntries,type PriceScaleMenuContext,type PriceScaleMenuItem,type PriceScaleSubmenu} from '../../src/chart/price-scale-menu';
import {defaultPriceScaleSettings,type PaneScaleView,type PriceScaleSettings} from '../../src/chart/price-scale-state';
import {priceScaleHarness} from './price-scale-harness';

// "Merge all scales into one"
// left / On the right) is enabled. The menu counts a pane's stacked indicator scale columns; merging pins them back to the
// pane scale through the host callback, then moves the main scale to the chosen side. The package NativeRenderer runs;
// host, document and the indicator scale lists are SYNTHETIC stand-ins. No GUI claim.
const pane=(patch:Partial<PaneScaleView>={}):PaneScaleView=>({paneId:'price',kind:'price',mode:'regular',auto:true,invert:false,...patch});
const context=(patch:Partial<PriceScaleMenuContext>={}):PriceScaleMenuContext=>({pane:pane(),settings:defaultPriceScaleSettings(),ratio:0.6,scaleCount:2,host:{appearance:true,openSettings:true,mainSide:true,merge:true},mainSide:'right',...patch});
const merge=(entries:ReturnType<typeof priceScaleMenuEntries>)=>(entries.find(row=>row.kind==='submenu'&&row.id==='merge') as PriceScaleSubmenu|undefined)?.items as PriceScaleMenuItem[]|undefined;
const element=()=>({className:'',style:{} as Record<string,string>,attributes:{} as Record<string,string>,children:[] as unknown[],dataset:{} as Record<string,string>,textContent:'' as string|null,
 setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},remove(){}});
afterEach(()=>{vi.unstubAllGlobals();});

describe('Merge all scales into one: menu model',()=>{
 it('both rows are enabled on the price pane with a merge-capable, bound host',()=>{
  const items=merge(priceScaleMenuEntries(context()))!;
  expect(items.map(row=>[row.id,row.label,row.disabled])).toEqual([['mergeLeft','On the left',undefined],['mergeRight','On the right',undefined]]);
 });
 it('a host without merge keeps both rows disabled with the reason',()=>{
  const items=merge(priceScaleMenuEntries(context({host:{appearance:true,openSettings:true,mainSide:true}})))!;
  expect(items.map(row=>row.disabled)).toEqual(['This chart cannot merge its price scales.','This chart cannot merge its price scales.']);
 });
 it('a study pane merges on the right only; the left needs the main scale',()=>{
  const items=merge(priceScaleMenuEntries(context({pane:pane({paneId:'s1',kind:'study'})})))!;
  expect(items[0].disabled).toMatch(/Only the main price scale can merge on the left/);expect(items[1].disabled).toBeUndefined();
 });
 it('a side change needs the renderer API and the saved settings binding; the current side does not',()=>{
  expect(merge(priceScaleMenuEntries(context({mainSide:undefined})))!.map(row=>row.disabled)).toEqual(['This chart renderer cannot move the price scale.',undefined]);
  expect(merge(priceScaleMenuEntries(context({host:{appearance:true,openSettings:true,merge:true}})))!.map(row=>row.disabled)).toEqual(['This chart is not connected to its saved workspace settings.',undefined]);
  expect(merge(priceScaleMenuEntries(context({mainSide:'left',host:{appearance:true,openSettings:true,merge:true}})))!.map(row=>row.disabled)).toEqual([undefined,'This chart is not connected to its saved workspace settings.']);
 });
 it('one scale keeps the single Move row',()=>{
  expect(merge(priceScaleMenuEntries(context({scaleCount:1})))).toBeUndefined();
 });
});

function harness(stacked:{right:string[];left:string[]},refuse=false){
 vi.stubGlobal('document',{createElement:()=>element()});
 const merged:string[][]=[];
 const h=priceScaleHarness({mergeScales:ids=>{if(refuse)throw Error('Refused by the indicator port.');merged.push([...ids]);stacked.right=stacked.right.filter(id=>!ids.includes(id));stacked.left=stacked.left.filter(id=>!ids.includes(id));}});
 h.renderer.wrapper={clientWidth:0,clientHeight:0,appendChild(){}};h.renderer.plot=element();
 h.renderer.scene.ownScaleIndicatorsForPane=(paneId:string)=>paneId==='price'?stacked.right.map(id=>({id})):[];
 h.renderer.scene.lvLeftScaleIndicatorsForPane=(paneId:string)=>paneId==='price'?stacked.left.map(id=>({id})):[];
 const commits:PriceScaleSettings[]=[];h.port.bindHost({commitSettings:value=>{commits.push(value);return true;}});
 return {h,merged,commits};
}

describe('Merge all scales into one: port',()=>{
 it('counts the stacked indicator columns of the pane (one right, one left: three scales)',()=>{
  const {h}=harness({right:['r1'],left:['l1']});
  expect(merge(h.port.menuEntries())!.map(row=>row.disabled)).toEqual([undefined,undefined]);
 });
 it('On the left pins every stacked scale back to the pane scale, then moves the main scale left (one settings change)',()=>{
  const {h,merged,commits}=harness({right:['r1','r2'],left:['l1']});
  expect(h.port.execute('mergeLeft')).toEqual({ok:true});
  expect(merged).toEqual([['r1','r2','l1']]);expect(commits.map(row=>row.mainSide)).toEqual(['left']);expect(h.renderer.lvMainScaleSide()).toBe('left');
  // Now a single scale: the menu shows the single Move row again.
  expect(merge(h.port.menuEntries())).toBeUndefined();
 });
 it('On the right on the right side merges without a settings change',()=>{
  const {h,merged,commits}=harness({right:['r1'],left:[]});
  expect(h.port.execute('mergeRight')).toEqual({ok:true});
  expect(merged).toEqual([['r1']]);expect(commits).toEqual([]);expect(h.renderer.lvMainScaleSide()).toBe('right');
 });
 it('a refusal from the indicator port moves nothing and reports the reason',()=>{
  const {h,commits}=harness({right:['r1'],left:[]},true);
  expect(h.port.execute('mergeLeft')).toEqual({ok:false,message:'Refused by the indicator port.'});
  expect(commits).toEqual([]);expect(h.renderer.lvMainScaleSide()).toBe('right');
 });
});
