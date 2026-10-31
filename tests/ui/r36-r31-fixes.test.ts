import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ChartContextMenu,chartMenuEntries} from '../../src/ui/ChartContextMenu';
import {PriceScaleMenuView,placePriceScaleMenu} from '../../src/chart/price-scale-menu-view';
import {legendMoreMenuView} from '../../src/ui/indicator-legend-view';
import {CHART_EVENT_STYLE} from '../../src/domain/chart-events';
import type {ChartContextActions,ChartMenuSnapshot,RootChartMenuAction} from '../../src/chart/context-menu';

// (packaged r31 holds). 1: the chart context menu (608 px, 14 rows) opened at the click and ran off the bottom
// of a 921 px window, so "Add alert at <price>" was off screen (alerts receipt 20261023T101420049Z). The same estimate-only
// placement was used by the price and time scale menus, and the legend More menus had none. 2: the navigation cluster
// covered the split/dividend marker strip (elementFromPoint at the marker = "Zoom out", receipt 20261023T102243251Z).
// The real menu components are rendered as element trees (controlled hooks, no DOM); their ref receives a measured node.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const useState=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];};
 const useRef=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];};
 const useMemo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 const useEffect=()=>{};
 const mocked={useState,useRef,useMemo,useEffect,useCallback:(fn:any,deps:any[])=>useMemo(()=>fn,deps)};
 return{...actual,...mocked,default:{...actual.default,...mocked}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const VIEW={innerWidth:1424,innerHeight:921};
/** A laid-out menu element: natural size, current box (from its style or the given rect), the receipt's 1424 x 921 window. */
function measured(size:{width:number;height:number},rect?:{left:number;top:number},parent?:{left:number;top:number;right:number;bottom:number}){
 const style:Record<string,string>&{setProperty?:any;getPropertyValue?:any;removeProperty?:any}={} as any;
 const custom=new Map<string,string>();
 style.setProperty=(name:string,value:string)=>custom.set(name,value);style.getPropertyValue=(name:string)=>custom.get(name)??'';style.removeProperty=(name:string)=>custom.delete(name);
 const px=(value:string|undefined)=>value?Number.parseFloat(value):0;
 const box=()=>{const left=rect?rect.left+px(style.marginLeft):px(style.left),top=rect?rect.top+px(style.marginTop):px(style.top);return{left,top,right:left+size.width,bottom:top+size.height,width:size.width,height:size.height};};
 return{style,offsetWidth:size.width,offsetHeight:size.height,clientHeight:size.height,scrollHeight:size.height,ownerDocument:{defaultView:VIEW},
  getBoundingClientRect:box,parentElement:parent?{getBoundingClientRect:()=>parent}:null,querySelectorAll:()=>[]} as any;
}
/** The element's box after its ref ran (an object ref is just filled in: the pre-fix component placed nothing). */
function mountRef(element:any,node:any,fallback:{left:number;top:number}){
 const ref=element.props.ref;
 if(typeof ref==='function')ref(node);else if(ref&&typeof ref==='object')ref.current=node;
 const left=node.style.left!==undefined?Number.parseFloat(node.style.left):fallback.left,top=node.style.top!==undefined?Number.parseFloat(node.style.top):fallback.top;
 return{left,top};
}

const ALL:RootChartMenuAction[]=['theme','indicator','reset-view','chart-type-focus','objects','interval','date','source-csv','png-save','png-copy','note','copy-price','cursor-lock','table-view','price-alert','paper-ticket'];
function snapshot(client:{x:number;y:number}):ChartMenuSnapshot{
 return{entity:{kind:'chart'},point:{price:23.37,unit:'price',pane:{kind:'price'},logical:null,barIndex:null,barTime:null},instrument:{symbol:'GME',tickSize:0.01},input:{bars:[{time:1,open:22,high:22,low:22,close:22,volume:1}],source:{},style:'candles'},client,
  controller:{contextMenu:{isCurrent:()=>true,handoff:(value:unknown)=>({snapshot:value,isCurrent:()=>true,isOwnerCurrent:()=>true,release(){}})}}} as unknown as ChartMenuSnapshot;
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;vi.stubGlobal('window',VIEW);vi.stubGlobal('document',{activeElement:null,addEventListener(){},removeEventListener(){}});});

describe(' chart context menu stays on screen (reference placement)',()=>{
 it('the receipt case: a 608 px menu opened at 432 of a 921 px window is moved fully inside, Add alert row included',()=>{
  const value=snapshot({x:700,y:432}),actions=Object.fromEntries(ALL.map(action=>[action,()=>true])) as ChartContextActions;
  const entries=chartMenuEntries(value,actions);
  expect(entries.some(row=>row.label==='Add alert at 23.37')).toBe(true);
  hooks.cursor=0;const tree=ChartContextMenu({snapshot:value,actions,onClose:()=>undefined,focusTarget:()=>null});
  const menu=find(tree,node=>node.props?.role==='menu'&&node.props['aria-label']==='Chart context menu');
  expect(menu).toBeTruthy();
  expect(text(menu)).toContain('Add alert at 23.37');
  const at=mountRef(menu,measured({width:260,height:608}),{left:menu.props.style.left,top:menu.props.style.top});
  // Before the fix: top 432, bottom 1040 (off screen by 119 px).
  expect(at.top).toBeGreaterThanOrEqual(4);
  expect(at.top+608).toBeLessThanOrEqual(VIEW.innerHeight-4);
  expect(at.left+260).toBeLessThanOrEqual(VIEW.innerWidth-4);
 });
 it('flips up when there is room above, flips left at the right edge, and keeps the scroll fallback when taller than the window',async()=>{
  const {placeMenu}=await import('../../src/ui/menu-placement');
  // Room above: the menu's bottom sits at the click (reference).
  expect(placeMenu({x:300,y:800},{width:260,height:300},{width:1424,height:921})).toEqual({left:300,top:500,maxHeight:913});
  // Fits below: unchanged.
  expect(placeMenu({x:300,y:100},{width:260,height:300},{width:1424,height:921}).top).toBe(100);
  // No room on the right: its right edge sits at the click.
  expect(placeMenu({x:1300,y:100},{width:260,height:300},{width:1424,height:921}).left).toBe(1040);
  // Taller than the window: pinned to the top margin, cut to the window and scrolling.
  expect(placeMenu({x:300,y:432},{width:260,height:1200},{width:1424,height:921})).toEqual({left:300,top:4,maxHeight:913});
  const node=measured({width:260,height:1200});
  const {fitFixedMenu}=await import('../../src/ui/menu-placement');
  fitFixedMenu(node,{x:300,y:432});
  expect([node.style.top,node.style.maxHeight,node.style.overflowY]).toEqual(['4px','913px','auto']);
 });
 it('the Trade submenu is placed beside its row and kept inside the window',()=>{
  const value=snapshot({x:700,y:432}),actions=Object.fromEntries(ALL.map(action=>[action,()=>true])) as ChartContextActions;
  hooks.cursor=0;let tree=ChartContextMenu({snapshot:value,actions,onClose:()=>undefined,focusTarget:()=>null});
  const trade=find(tree,node=>node.type==='button'&&text(node).startsWith('Trade at'));
  // The row sits low in the window: its submenu (3 rows) must not run off the bottom.
  const row={getBoundingClientRect:()=>({left:700,right:960,top:880,bottom:920,width:260,height:40})};
  trade.props.ref.current=row; // the row's own object ref, as React fills it
  trade.props.onClick();
  hooks.cursor=0;tree=ChartContextMenu({snapshot:value,actions,onClose:()=>undefined,focusTarget:()=>null});
  const sub=find(tree,node=>node.props?.role==='menu'&&node.props['aria-label']==='Trade');
  const at=mountRef(sub,measured({width:260,height:132}),{left:sub.props.style.left,top:sub.props.style.top});
  expect(at.top+132).toBeLessThanOrEqual(VIEW.innerHeight-4);
  expect(at.left).toBe(962);
 });
});

describe(' price and time scale menus use the same placement',()=>{
 it('a scale menu opened near the bottom (time axis) flips up from the click instead of running off screen',()=>{
  const client={x:700,y:880},estimate=placePriceScaleMenu(client,{width:VIEW.innerWidth,height:VIEW.innerHeight},3);
  const view=PriceScaleMenuView({entries:[],client,kind:'time',left:estimate.left,top:estimate.top,openSubmenu:null,focusKey:null,status:'',onActivate:()=>undefined,onSubmenu:()=>undefined,onFocusKey:()=>undefined,onKeyDown:()=>undefined} as any) as any;
  // The real menu is taller than the row-count estimate (status line, separators): 500 px measured.
  const at=mountRef(view,measured({width:280,height:500}),estimate);
  expect(at.top+500).toBeLessThanOrEqual(VIEW.innerHeight-4);
  expect(at.top).toBe(880-500);
 });
 it('both ports hand the click point to the view',()=>{
  for(const file of ['src/chart/price-scale-port.ts','src/chart/time-scale-port.ts'])expect(readFileSync(file,'utf8')).toMatch(/left:position\.left,top:position\.top,client:menu\.client,/);
 });
});

describe(' legend More menus stay on screen',()=>{
 const rows=[{kind:'item',id:'settings',label:'Settings…',availability:{state:'enabled'}},{kind:'item',id:'remove',label:'Remove',availability:{state:'enabled'}}] as any;
 it('a More menu under a legend row low in the window flips above the row',()=>{
  const view=legendMoreMenuView(rows,{label:'RSI 14',open:null,submenus:{},onItem:()=>undefined,onSubmenu:()=>undefined}) as any;
  const row={left:100,right:340,top:826,bottom:850};
  const node=measured({width:240,height:400},{left:100,top:850},row);
  view.props.ref(node);
  // Flipped: its bottom at the row's top.
  expect(850+Number.parseFloat(node.style.marginTop)).toBe(826-400);
 });
 it('a menu that fits keeps its CSS place (no margins)',()=>{
  const view=legendMoreMenuView(rows,{label:'RSI 14',open:null,submenus:{},onItem:()=>undefined,onSubmenu:()=>undefined}) as any;
  const node=measured({width:240,height:300},{left:100,top:120},{left:100,right:340,top:96,bottom:120});
  view.props.ref(node);
  expect([node.style.marginTop,node.style.marginLeft]).toEqual(['','']);
 });
});

describe(' navigation buttons never cover the event marker strip',()=>{
 it('the cluster is lifted clear of the strip; a centre marker is then outside every button',async()=>{
  const {navigationLift,measureNavigationLift,eventMarkerStrip,NAV_MARKER_CLEARANCE_PX}=await import('../../src/ui/ChartNavigationButtons');
  // A 921 px window: price pane from 80 to 820, time axis below, bottom toolbar 39 px; the CSS place of the 28 px cluster
  // (bottom: --lv-bottom-h + 36px) puts it from 790 to 818, centred at 712.
  const projection={left:52,top:80,width:1320,height:740},base={left:640,right:784,top:790,bottom:818};
  const strip=eventMarkerStrip(projection);
  expect(strip.top).toBe(820-CHART_EVENT_STYLE.size-CHART_EVENT_STYLE.bottomGap);
  const lift=navigationLift(base,projection);
  expect(lift).toBe(818-(strip.top-NAV_MARKER_CLEARANCE_PX));
  const lifted={...base,top:base.top-lift,bottom:base.bottom-lift};
  expect(lifted.bottom).toBeLessThanOrEqual(strip.top-NAV_MARKER_CLEARANCE_PX);
  // The in-view dividend badge at the horizontal centre (x 712, badge 800..816) is no longer under the cluster.
  const badge={x:712,y:strip.top+CHART_EVENT_STYLE.size/2};
  expect(badge.y>=lifted.top&&badge.y<=lifted.bottom).toBe(false);
  // Measured on the lifted element, the lift is stable (no oscillation between frames).
  const node={getBoundingClientRect:()=>lifted};
  expect(measureNavigationLift(node,{zoom(){},pan(){},pricePaneProjection:()=>projection},lift)).toBe(lift);
  // A strip far away (lower panes under the price pane) leaves the CSS place alone.
  expect(navigationLift(base,{left:52,top:80,width:1320,height:500})).toBe(0);
  expect(measureNavigationLift(node,{zoom(){},pan(){}},0)).toBe(0);
 });
 it('only the visible buttons take the pointer: the gaps never, hidden mouse-over buttons never',()=>{
  const css=readFileSync('src/ui/chart-commands.css','utf8');
  expect(css).toMatch(/\.lv-nav-buttons\{[^}]*pointer-events:none/);
  expect(css).toMatch(/\.lv-nav-buttons button\{pointer-events:auto\}/);
  expect(css).toMatch(/\.lv-nav-buttons\[data-visibility="mouseover"\] button\{pointer-events:none\}/);
  // Shown over a chart or the buttons, or with keyboard focus inside (not on any workspace hover or a clicked button's focus).
  expect(css).toMatch(/\.chart-workspace:has\(\[data-chart-tree\]:hover\) \.lv-nav-buttons\[data-visibility="mouseover"\] button,\.lv-nav-buttons\[data-visibility="mouseover"\]:hover button,\.lv-nav-buttons\[data-visibility="mouseover"\]:has\(:focus-visible\) button\{pointer-events:auto\}/);
  expect(css).not.toMatch(/\.chart-workspace:hover \.lv-nav-buttons/);expect(css).not.toMatch(/lv-nav-buttons[^{]*:focus-within/);
 });
 it('the marker overlay stacks above the bottom controls, so badges win hit-testing and tooltips draw over the buttons',async()=>{
  const {CHART_EVENTS_Z_INDEX}=await import('../../src/ui/ChartEventMarkers');
  const css=readFileSync('src/ui/chart-commands.css','utf8')+readFileSync('src/ui/styles.css','utf8');
  const z=(selector:string)=>Number(new RegExp(selector.replace(/[.[\]]/g,m=>'\\'+m)+'\\{[^}]*z-index:(\\d+)').exec(css)?.[1]);
  expect(CHART_EVENTS_Z_INDEX).toBeGreaterThan(z('.lv-nav-buttons'));
  expect(CHART_EVENTS_Z_INDEX).toBeGreaterThan(z('.lv-scroll-latest'));
  expect(readFileSync('src/ui/ChartEventMarkers.tsx','utf8')).toMatch(/pointerEvents: 'none', zIndex: CHART_EVENTS_Z_INDEX/);
 });
});
