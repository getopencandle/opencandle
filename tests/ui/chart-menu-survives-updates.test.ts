import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ChartContextMenu,CONTEXT_MENU_POLL_MS,CONTEXT_MENU_STALE_GRACE_MS} from '../../src/ui/ChartContextMenu';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

// The chart menu stays open while its parent re-renders it with new props (a layout autosave in a multi-chart grid
// re-renders every cell) and while its target reads as not current for a moment; it closes once the target stays retired.
// Controlled React hooks with effects run after each render; no DOM, no launch. SYNTHETIC values only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as {deps:any[]|undefined;cleanup?:(()=>void)|void}[],pending:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const useState=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];};
 const useRef=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];};
 const useMemo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 const useEffect=(fn:()=>(()=>void)|void,deps?:any[])=>{const index=hooks.cursor++,old=hooks.effects[index];if(old&&deps&&old.deps&&deps.length===old.deps.length&&deps.every((v,i)=>Object.is(v,old.deps![i])))return;hooks.pending.push(()=>{old?.cleanup?.();hooks.effects[index]={deps,cleanup:fn()};});};
 const mocked={useState,useRef,useMemo,useEffect,useCallback:(fn:any,deps:any[])=>useMemo(()=>fn,deps)};
 return{...actual,...mocked,default:{...actual.default,...mocked}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const listeners=new Map<string,Set<(event:unknown)=>void>>();
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.pending=[];listeners.clear();vi.useFakeTimers();vi.stubGlobal('window',{innerWidth:1200,innerHeight:800});
 vi.stubGlobal('document',{activeElement:null,addEventListener(type:string,fn:(event:unknown)=>void){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(fn);},removeEventListener(type:string,fn:(event:unknown)=>void){listeners.get(type)?.delete(fn);}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

function setup(){
 const state={current:true},calls:string[]=[];
 const snapshot={cellId:'cell-2',entity:{kind:'chart'},point:{price:46.71,unit:'price',pane:{kind:'price'},logical:1,barIndex:1,barTime:2},instrument:{symbol:'GME',tickSize:0.01},input:{bars:[{time:1,open:46,high:47,low:45,close:46.5,volume:1},{time:2,open:46.5,high:47,low:46,close:46.7,volume:1}],source:{},style:'candles'},client:{x:40,y:50},
  controller:{contextMenu:{isCurrent:()=>state.current,handoff:(value:unknown)=>({snapshot:value,isCurrent:()=>true,isOwnerCurrent:()=>true,release(){}})},chart:{renderer:{get:()=>undefined}},priceScale:{settings:()=>({mainSide:'right'})}}} as unknown as ChartMenuSnapshot;
 const actions=():ChartContextActions=>({'price-alert':()=>{calls.push('alert');return true;},indicator:()=>{calls.push('indicator');return true;}});
 const closes:string[]=[];
 const render=(props:{actions?:ChartContextActions;onClose?:(value:ChartMenuSnapshot)=>void}={})=>{hooks.cursor=0;const tree=ChartContextMenu({snapshot,actions:props.actions??actions(),onClose:props.onClose??(()=>closes.push('close')),focusTarget:()=>({isConnected:true,focus(){}}) as unknown as HTMLElement});for(const run of hooks.pending.splice(0))run();return tree;};
 const row=(tree:any,label:string)=>find(tree,node=>node.type==='button'&&text(node).startsWith(label));
 return{state,calls,closes,render,row};
}

describe('chart menu across parent re-renders and transient target updates',()=>{
 it('stays open when the parent re-renders it with new props, new actions and a new onClose',async()=>{
  const f=setup();f.render();
  // An autosave re-renders the grid cell: new actions object, new onClose identity, same snapshot.
  const closes:string[]=[];for(let i=0;i<5;i++){f.render({onClose:()=>closes.push('new close')});vi.advanceTimersByTime(300);}
  expect(f.closes).toEqual([]);expect(closes).toEqual([]);
  // The menu still runs a choice after those re-renders (the execution was not disposed by them).
  await f.row(f.render({onClose:()=>closes.push('new close')}),'Add alert at 46.71').props.onClick();
  expect(f.calls).toEqual(['alert']);expect(closes,'the latest onClose runs on a choice').toEqual(['new close']);
 });
 it('stays open while its target reads as not current for a moment (an update in flight)',()=>{
  const f=setup();f.render();
  f.state.current=false;vi.advanceTimersByTime(CONTEXT_MENU_STALE_GRACE_MS-CONTEXT_MENU_POLL_MS);f.state.current=true;vi.advanceTimersByTime(5000);
  expect(f.closes).toEqual([]);
 });
 it('closes once the target stays retired past the grace period, and only once',()=>{
  const f=setup();f.render();
  f.state.current=false;vi.advanceTimersByTime(CONTEXT_MENU_STALE_GRACE_MS-CONTEXT_MENU_POLL_MS);expect(f.closes).toEqual([]);
  vi.advanceTimersByTime(3*CONTEXT_MENU_POLL_MS);expect(f.closes).toEqual(['close']);vi.advanceTimersByTime(2000);expect(f.closes).toEqual(['close']);
 });
 it('a choice made while the target is briefly not current runs once it is current again',async()=>{
  const f=setup();const tree=f.render();
  f.state.current=false;f.row(tree,'Add indicator').props.onClick();expect(f.calls).toEqual([]);
  vi.advanceTimersByTime(CONTEXT_MENU_POLL_MS);expect(f.calls).toEqual([]);
  f.state.current=true;vi.advanceTimersByTime(CONTEXT_MENU_POLL_MS);await vi.advanceTimersByTimeAsync(0);
  expect(f.calls).toEqual(['indicator']);expect(f.closes).toEqual(['close']);
 });
 it('Escape closes the menu even while the target reads as not current',()=>{
  const f=setup();const tree=f.render();f.state.current=false;
  tree.props.onKeyDown({key:'Escape',stopPropagation(){},preventDefault(){},nativeEvent:{isComposing:false}});
  expect(f.closes).toEqual(['close']);
 });
 it('a press outside closes it',()=>{
  const f=setup();f.render();const [press]=[...listeners.get('pointerdown')!];
  press({target:{}});expect(f.closes).toEqual(['close']);
 });
});

describe('chart menu width',()=>{
 it('grows to its longest row up to a cap instead of cutting labels at 260 px',()=>{
  const css=readFileSync('src/ui/chart-commands.css','utf8');
  expect(css).toMatch(/\.lv-popup-menu\.lv-chart-context-menu,\.lv-popup-menu\.lv-chart-context-submenu\{width:max-content;min-width:260px;max-width:min\(460px,calc\(100vw - 8px\)\)\}/);
 });
});
