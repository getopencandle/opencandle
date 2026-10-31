import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ChartContextMenu,chartMenuEntries,tradeMenuKey,tradeSubmenuEntries} from '../../src/ui/ChartContextMenu';
import {pricePlusMenu} from '../../src/chart/price-scale-plus';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

// The chart menu "Trade at X" row opens a submenu with the price scale + menu order rows
// (same side rule, same request) plus the plain ticket. Controlled React hooks; no DOM, no launch. Virtual money only.
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
function all(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>all(child,test,out));else if(node?.props){if(test(node))out.push(node);all(node.props.children,test,out);}return out;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const bars=(close:number)=>[{time:1,open:close,high:close,low:close,close,volume:1}];
function snapshot(price=99.5,last:number|null=98):ChartMenuSnapshot{
 return{entity:{kind:'chart'},point:{price,unit:'price',pane:{kind:'price'},logical:null,barIndex:null,barTime:null},instrument:{symbol:'GME',tickSize:0.01},input:{bars:last===null?[]:bars(last),source:{},style:'candles'},client:{x:10,y:10},controller:{contextMenu:{isCurrent:()=>true,handoff:(value:unknown)=>({snapshot:value,isCurrent:()=>true,isOwnerCurrent:()=>true,release(){}})}}} as unknown as ChartMenuSnapshot;
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;vi.stubGlobal('window',{innerWidth:1200,innerHeight:800});vi.stubGlobal('document',{activeElement:null,addEventListener(){},removeEventListener(){}});});

describe('Trade submenu rows',()=>{
 it('above the last price offers a sell limit and a buy stop, then the plain ticket (the + menu rule)',()=>{
  const rows=tradeSubmenuEntries(snapshot(99.5,98));
  expect(rows.map(row=>row.label)).toEqual(['Paper sell limit GME at 99.50','Paper buy stop GME at 99.50','Order ticket at 99.50…','Open DOM at 99.50']);// The paper DOM pane opens at the clicked price
  expect(rows.map(row=>row.order??null)).toEqual([{side:'sell',orderType:'limit'},{side:'buy',orderType:'stop'},null,null]);
  // Same wording and side rule as the price scale + menu at that price.
  const plus=pricePlusMenu({price:99.5,text:'99.50',last:98,symbol:'GME',host:true,line:true}).filter(row=>row.id!=='alert'&&row.id!=='hline').map(row=>row.label);
  expect(rows.slice(0,2).map(row=>row.label)).toEqual(plus);
 });
 it('at or below the last price offers a buy limit and a sell stop; no bars reads as above',()=>{
  expect(tradeSubmenuEntries(snapshot(99.5,101)).map(row=>row.order??null)).toEqual([{side:'buy',orderType:'limit'},{side:'sell',orderType:'stop'},null,null]);
  expect(tradeSubmenuEntries(snapshot(99.5,99.5)).map(row=>row.order??null)).toEqual([{side:'buy',orderType:'limit'},{side:'sell',orderType:'stop'},null,null]);
  expect(tradeSubmenuEntries(snapshot(99.5,null)).map(row=>row.order??null)).toEqual([{side:'sell',orderType:'limit'},{side:'buy',orderType:'stop'},null,null]);
 });
 it('the Trade row keeps its place and label and says it opens a submenu',()=>{
  const row=chartMenuEntries(snapshot(),{'paper-ticket':()=>true})[0];
  expect(row).toMatchObject({action:'paper-ticket',label:'Trade at 99.50',submenu:true});
 });
 it('keyboard: Right or Enter on Trade opens it, Left or Escape inside closes only the submenu',()=>{
  expect(tradeMenuKey('ArrowRight',{onTrade:true,inSubmenu:false})).toBe('open');
  expect(tradeMenuKey('Enter',{onTrade:true,inSubmenu:false})).toBe('open');
  expect(tradeMenuKey(' ',{onTrade:true,inSubmenu:false})).toBe('open');
  expect(tradeMenuKey('ArrowLeft',{onTrade:false,inSubmenu:true})).toBe('close');
  expect(tradeMenuKey('Escape',{onTrade:false,inSubmenu:true})).toBe('close');
  expect(tradeMenuKey('Escape',{onTrade:true,inSubmenu:false})).toBeNull();
  expect(tradeMenuKey('ArrowRight',{onTrade:false,inSubmenu:false})).toBeNull();
 });
});

describe('Trade submenu in the rendered menu',()=>{
 function mount(){
  const calls:Array<unknown>=[];const closed:unknown[]=[];
  const actions:ChartContextActions={'paper-ticket':(_s,_l,options)=>{calls.push(options??null);return true;}};
  const value=snapshot(99.5,101);
  const render=()=>{hooks.cursor=0;return ChartContextMenu({snapshot:value,actions,onClose:item=>closed.push(item),focusTarget:()=>({isConnected:true,focus(){}}) as unknown as HTMLElement});};
  return{calls,closed,render};
 }
 it('clicking Trade opens the submenu and places nothing; a row sends its side and type, the ticket row sends none',async()=>{
  const ui=mount();let tree=ui.render();
  const trade=find(tree,node=>node.type==='button'&&text(node).startsWith('Trade at 99.50'));
  expect(trade.props['aria-haspopup']).toBe('menu');expect(trade.props['aria-expanded']).toBe(false);
  expect(find(tree,node=>node.props?.role==='menu'&&node.props['aria-label']==='Trade')).toBeNull();
  trade.props.onClick();expect(ui.calls).toEqual([]);
  tree=ui.render();
  expect(find(tree,node=>node.type==='button'&&text(node).startsWith('Trade at')).props['aria-expanded']).toBe(true);
  const sub=find(tree,node=>node.props?.role==='menu'&&node.props['aria-label']==='Trade');
  const items=all(sub,node=>node.type==='button'&&node.props.role==='menuitem');
  expect(items.map(text)).toEqual(['Paper buy limit GME at 99.50','Paper sell stop GME at 99.50','Order ticket at 99.50…','Open DOM at 99.50']);
  await items[1].props.onClick();
  expect(ui.calls).toEqual([{order:{side:'sell',orderType:'stop'}}]);
 });
 it('the Order ticket row opens the plain clicked-price ticket',async()=>{
  const ui=mount();ui.render();find(ui.render(),node=>node.type==='button'&&text(node).startsWith('Trade at')).props.onClick();
  const sub=find(ui.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Trade');
  await all(sub,node=>node.type==='button')[2].props.onClick();
  expect(ui.calls).toEqual([null]);
 });
 it('the submenu wording has no dash punctuation or internal id',()=>{
  const source=readFileSync('src/ui/ChartContextMenu.tsx','utf8');expect(source).not.toMatch(/[–—]/);
  for(const row of tradeSubmenuEntries(snapshot()))expect(row.label).not.toMatch(/[–—]|\bPAPER\.|\bWS\./);
 });
});
