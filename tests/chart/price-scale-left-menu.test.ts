import {afterEach,describe,expect,it,vi} from 'vitest';
import {priceScaleMenuEntries,type PriceScaleMenuContext,type PriceScaleMenuItem} from '../../src/chart/price-scale-menu';
import {defaultPriceScaleSettings,type PaneScaleView,type PriceScaleSettings} from '../../src/chart/price-scale-state';
import {installPriceScalePort} from '../../src/chart/price-scale-port';
import type {PricePlusViewProps} from '../../src/chart/price-scale-plus';
import {PricePlusView} from '../../src/chart/price-scale-plus-view';
import {event,priceScaleHarness} from './price-scale-harness';

// the single-scale row of the price scale menu
// follows the recorded facts variantWhenSingleScale ("Move scale to left" with the scale on the right, "Move
// scale to right" with it on the left), and the port moves the main scale through the patched renderer
// (LV-VELA-SCALE-LEFT-1). The package NativeRenderer runs; host, document and window are SYNTHETIC stand-ins. No GUI claim.
const pane=(patch:Partial<PaneScaleView>={}):PaneScaleView=>({paneId:'price',kind:'price',mode:'regular',auto:true,invert:false,...patch});
const context=(patch:Partial<PriceScaleMenuContext>={}):PriceScaleMenuContext=>({pane:pane(),settings:defaultPriceScaleSettings(),ratio:0.6,scaleCount:1,host:{appearance:true,openSettings:true,mainSide:true},mainSide:'right',...patch});
const row=(entries:ReturnType<typeof priceScaleMenuEntries>)=>entries.find((item):item is PriceScaleMenuItem=>item.kind==='item'&&item.factId==='menu.merge');
const element=()=>({className:'',style:{} as Record<string,string>,attributes:{} as Record<string,string>,children:[] as unknown[],dataset:{} as Record<string,string>,textContent:'' as string|null,
 setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},remove(){}});
afterEach(()=>{vi.unstubAllGlobals();});

/** The harness renderer with the stand-ins the left gutter needs (an unsized wrapper, a plot, a document for its canvases). */
function leftHarness(){
 vi.stubGlobal('document',{createElement:()=>element()});
 const h=priceScaleHarness();h.renderer.wrapper={clientWidth:0,clientHeight:0,appendChild(){}};const plot=element();h.renderer.plot=plot;
 const commits:PriceScaleSettings[]=[];let accept=true;
 const bind=()=>h.port.bindHost({commitSettings:value=>{commits.push(value);return accept;}});
 return{h,plot,commits,bind,refuse(){accept=false;}};
}

describe('price scale menu: Move scale to left / right',()=>{
 it('side right shows "Move scale to left" enabled; side left shows "Move scale to right"',()=>{
  expect(row(priceScaleMenuEntries(context()))).toEqual({kind:'item',id:'moveLeft',factId:'menu.merge',label:'Move scale to left',role:'menuitem'});
  expect(row(priceScaleMenuEntries(context({mainSide:'left'})))).toEqual({kind:'item',id:'moveRight',factId:'menu.merge',label:'Move scale to right',role:'menuitem'});
 });
 it('a study pane keeps the row disabled with the OpenCandle reason',()=>{
  expect(row(priceScaleMenuEntries(context({pane:pane({paneId:'s1',kind:'study'})})))).toMatchObject({id:'moveLeft',label:'Move scale to left',disabled:'OpenCandle can move only the main price scale.'});
 });
 it('a renderer without the API and an unbound host are each disabled with their reason',()=>{
  // mainSide absent: the renderer has no lvSetMainScaleSide. host.mainSide false or absent: no commitSettings binding.
  expect(row(priceScaleMenuEntries(context({mainSide:undefined})))).toMatchObject({id:'moveLeft',disabled:'This chart renderer cannot move the price scale.'});
  expect(row(priceScaleMenuEntries(context({mainSide:undefined,host:{appearance:true,openSettings:true}})))).toMatchObject({id:'moveLeft',disabled:'This chart renderer cannot move the price scale.'});
  expect(row(priceScaleMenuEntries(context({host:{appearance:true,openSettings:true,mainSide:false}})))).toMatchObject({id:'moveLeft',disabled:'This chart is not connected to its saved workspace settings.'});
  expect(row(priceScaleMenuEntries(context({host:{appearance:true,openSettings:true}})))).toMatchObject({id:'moveLeft',disabled:'This chart is not connected to its saved workspace settings.'});
 });
 it('the merge submenu with several scales is unchanged',()=>{
  const sub=priceScaleMenuEntries(context({scaleCount:2})).find(item=>item.kind==='submenu'&&item.id==='merge');
  expect(sub).toMatchObject({label:'Merge all scales into one',items:[{id:'mergeLeft',label:'On the left'},{id:'mergeRight',label:'On the right'}]});
 });
});

describe('price scale port: moving the main scale through the renderer',()=>{
 it('unbound: the row is disabled with the binding reason and refuses',()=>{
  const {h}=leftHarness();
  expect(row(h.port.menuEntries())).toMatchObject({id:'moveLeft',disabled:'This chart is not connected to its saved workspace settings.'});
  expect(h.port.execute('moveLeft').ok).toBe(false);expect(h.renderer.lvMainScaleSide()).toBe('right');
 });
 it("execute('moveLeft') commits mainSide:'left' and then moves the renderer; moveRight goes back",()=>{
  const {h,commits,bind}=leftHarness();bind();
  const spy=vi.spyOn(h.renderer,'lvSetMainScaleSide');
  expect(row(h.port.menuEntries())).toEqual({kind:'item',id:'moveLeft',factId:'menu.merge',label:'Move scale to left',role:'menuitem'});
  expect(h.port.execute('moveLeft')).toEqual({ok:true});
  expect(commits.at(-1)!.mainSide).toBe('left');expect(h.port.settings().mainSide).toBe('left');
  expect(spy).toHaveBeenLastCalledWith('left');expect(h.renderer.lvMainScaleSide()).toBe('left');expect(h.renderer.rightAxisW).toBe(0);
  expect(row(h.port.menuEntries())).toMatchObject({id:'moveRight',label:'Move scale to right'});
  expect(h.port.execute('moveRight')).toEqual({ok:true});
  expect(Object.hasOwn(commits.at(-1)!,'mainSide')).toBe(false);expect(h.renderer.lvMainScaleSide()).toBe('right');expect(h.renderer.rightAxisW).toBe(64);
  expect(commits).toHaveLength(2);
 });
 it('a refusing commitSettings leaves the settings and the renderer unchanged',()=>{
  const {h,bind,refuse}=leftHarness();bind();refuse();
  const before=JSON.stringify(h.port.settings());
  expect(h.port.execute('moveLeft').ok).toBe(false);
  expect(JSON.stringify(h.port.settings())).toBe(before);expect(h.renderer.lvMainScaleSide()).toBe('right');
 });
 it('applySettings with and without the key moves the renderer both ways (load, undo, redo)',()=>{
  const {h}=leftHarness();
  h.port.applySettings({...defaultPriceScaleSettings(),mainSide:'left'});expect(h.renderer.lvMainScaleSide()).toBe('left');
  h.port.applySettings(defaultPriceScaleSettings());expect(h.renderer.lvMainScaleSide()).toBe('right');
  h.port.applySettings({...defaultPriceScaleSettings(),mainSide:'right'});expect(h.renderer.lvMainScaleSide()).toBe('right');
 });
 it('a renderer without the API keeps the right side and shows the disabled reason',()=>{
  const {h,bind}=leftHarness();h.port.dispose();
  const renderer=h.renderer;Object.defineProperty(renderer,'lvSetMainScaleSide',{value:undefined,configurable:true});
  const port=installPriceScalePort({renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container});
  port.bindHost({commitSettings:()=>true});void bind;
  expect(()=>port.applySettings({...defaultPriceScaleSettings(),mainSide:'left'})).not.toThrow();
  expect(row(port.menuEntries())).toMatchObject({id:'moveLeft',disabled:'This chart renderer cannot move the price scale.'});
  expect(port.execute('moveLeft').ok).toBe(false);
  port.dispose();
 });
 it("axisPaneAt: x=-10 on the price pane is 'price' while left; the blank right slot is null",()=>{
  const {h,bind}=leftHarness();bind();
  // Input element rect left 10, top 20 (harness); data width 800.
  expect(h.port.axisPaneAt(10-10,120)).toBeNull();expect(h.port.axisPaneAt(10+810,120)).toBe('price');
  h.port.execute('moveLeft');
  expect(h.port.axisPaneAt(10-10,120)).toBe('price');expect(h.port.axisPaneAt(10-64,120)).toBe('price');expect(h.port.axisPaneAt(10-65,120)).toBeNull();
  expect(h.port.axisPaneAt(10+810,120)).toBeNull();expect(h.port.axisPaneAt(10+400,120)).toBeNull();
  const menu=h.container.dispatch('contextmenu',event({clientX:0,clientY:120}));expect(menu.defaultPrevented).toBe(true);expect(h.port.isMenuOpen()).toBe(true);
 });
 it('the plus button sits inside the plot next to the left column and opens its menu to the right; the currency label moves to -64px',()=>{
  const {h,bind,plot}=leftHarness();h.port.dispose();
  const renders:Array<PricePlusViewProps|null>=[];
  const container=Object.assign(h.container,{getBoundingClientRect:()=>({left:4,top:20,width:900,height:628})});
  h.doc.createElement=()=>element();
  const port=installPriceScalePort({renderer:h.renderer,features:h.features as any,onViewportChanged:()=>()=>{},container,tickSize:()=>0.25,plusMount:()=>({render:props=>{renders.push(props);},contains:()=>false,dispose(){}})});
  const commits:unknown[]=[];port.bindHost({commitSettings:value=>{commits.push(value);return true;},data:{prePost:false,bidAsk:false,currency:'USD'}});void bind;
  port.setChrome({currencyUnit:'always'});
  const label=()=>(plot.children as any[]).find(child=>child.className==='lv-scale-currency');
  expect(label().style).toMatchObject({left:'800px',width:'64px'});
  container.dispatch('pointermove',event({clientX:10+810,clientY:121}));
  // base = input rect left (10) - container rect left (4) = 6.
  expect(renders.at(-1)).toMatchObject({left:6+800-14,side:'right'});
  expect(port.execute('moveLeft')).toEqual({ok:true});
  expect(label().style).toMatchObject({left:'-64px',width:'64px'});
  container.dispatch('pointermove',event({clientX:10-20,clientY:121}));
  expect(renders.at(-1)).toMatchObject({left:6,side:'left'});
  port.dispose();
 });
 it('the plus menu opens to the right of the button on a left scale',()=>{
  const base:PricePlusViewProps={left:100,top:50,text:'1.00',items:[{id:'hline',label:'Draw horizontal line at 1.00'}] as never,status:'',onOpen(){},onActivate(){}};
  const menuOf=(props:PricePlusViewProps)=>(PricePlusView(props) as any).props.children[1].props.style;
  expect(menuOf(base).right).toBe('calc(100% - 100px + 4px)');expect(menuOf(base).left).toBeUndefined();
  const left=menuOf({...base,side:'left'});expect(left.right).toBeUndefined();expect(left.left).toBe(100+14+4);
 });
});
