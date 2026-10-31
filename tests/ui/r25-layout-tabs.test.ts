import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {CoinbaseLiveProvider,type CoinbaseBridge} from '../../src/domain/coinbase-live';
import {clearLiveDatasets,liveDatasetById,unregisterLiveDataset,registerLiveDataset} from '../../src/ui/live-registry';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {duplicateSavedLayout,type LayoutLibrary} from '../../src/ui/layout-library';
import {LAYOUT_TABS_STORAGE_KEY,NEW_TAB_LAYOUT_NAME,closeLayoutTab,closingTabSuccessor,cycleLayoutTab,layoutTabLabel,moveLayoutTab,readLayoutTabs,reconcileLayoutTabs,writeLayoutTabs} from '../../src/ui/layout-tabs';
import {layoutTabsView,type LayoutTabsUi} from '../../src/ui/LayoutTabs';
import {liveTabGrid} from '../../src/ui/layout-tabs-live';

// SYNTHETIC fixtures only (the demo workspace and a mocked Coinbase bridge).

const book=(ids:string[],activeId:string)=>({activeId,entries:ids.map(id=>({id}))}) as unknown as LayoutLibrary;
describe('tab list model',()=>{
 it('keeps the active layout as a tab: replace in place, insert after, append, prune deleted, never empty',()=>{
  expect(reconcileLayoutTabs(['a','b','c'],book(['a','b','c','d'],'d'),'b','replace')).toEqual(['a','d','c']);
  expect(reconcileLayoutTabs(['a','b','c'],book(['a','b','c','d'],'d'),'b','insert')).toEqual(['a','b','d','c']);
  expect(reconcileLayoutTabs(['a','b'],book(['a','b','d'],'d'),null)).toEqual(['a','b','d']);
  expect(reconcileLayoutTabs(['a','x','b','b'],book(['a','b'],'b'),'b')).toEqual(['a','b']);
  expect(reconcileLayoutTabs(['x'],book(['a'],'a'),'x')).toEqual(['a']);
  expect(reconcileLayoutTabs([],book(['a'],'a'))).toEqual(['a']);
 });
 it('reorders, closes and cycles',()=>{
  expect(moveLayoutTab(['a','b','c'],'a','c')).toEqual(['b','c','a']);
  expect(moveLayoutTab(['a','b','c'],'c','a')).toEqual(['c','a','b']);
  expect(moveLayoutTab(['a','b','c'],'a','x')).toEqual(['a','b','c']);
  expect(closingTabSuccessor(['a','b','c'],'b','b')).toBe('c');
  expect(closingTabSuccessor(['a','b','c'],'c','c')).toBe('b');
  expect(closingTabSuccessor(['a','b','c'],'a','b')).toBeNull();
  expect(closeLayoutTab(['a'],'a')).toEqual(['a']);
  expect(closeLayoutTab(['a','b'],'a')).toEqual(['b']);
  expect(cycleLayoutTab(['a','b','c'],'c',1)).toBe('a');
  expect(cycleLayoutTab(['a','b','c'],'a',-1)).toBe('c');
  expect(cycleLayoutTab(['a'],'a',1)).toBeNull();
 });
 it('persists the open tabs and rejects unusable stored values without throwing',()=>{
  const store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
  expect(writeLayoutTabs(storage,['a','b','a'])).toBe(true);expect(JSON.parse(store.get(LAYOUT_TABS_STORAGE_KEY)!)).toEqual({schemaVersion:1,open:['a','b']});
  expect(readLayoutTabs(storage)).toEqual(['a','b']);
  for(const bad of ['{',JSON.stringify({schemaVersion:2,open:['a']}),JSON.stringify({schemaVersion:1,open:[]}),JSON.stringify({schemaVersion:1,open:['a b']})]){store.set(LAYOUT_TABS_STORAGE_KEY,bad);expect(readLayoutTabs(storage)).toBeNull();}
  const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  expect(readLayoutTabs(blocked)).toBeNull();expect(writeLayoutTabs(blocked,['a'])).toBe(false);expect(readLayoutTabs(null)).toBeNull();
 });
});

function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function strip(options:{autosave?:boolean;dirty?:boolean;ui?:LayoutTabsUi}={}){
 const state=createInitialWorkspace();let n=0;
 const second=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Swing',100,()=>'tab-'+(++n));
 const library={...second.library,autosave:options.autosave??true,entries:second.library.entries.map(row=>({...row,savedAt:100}))};
 const grid=options.dirty?{...state.grid!,layout:{...state.grid!.layout,cells:state.grid!.layout.cells.map(row=>({...row,interval:row.interval+'x'}))}}:library.entries[0].grid;
 const calls={ui:vi.fn(),switch:vi.fn(),close:vi.fn(),rename:vi.fn(),move:vi.fn()};
 const open=[library.entries[0].id,second.entry.id];
 const render=(ui:LayoutTabsUi=options.ui??{})=>layoutTabsView({library,grid,open,ui,onUi:calls.ui,onSwitch:calls.switch,onClose:calls.close,onRename:calls.rename,onMove:calls.move});
 return{library,open,calls,render,activeId:library.activeId,otherId:second.entry.id};
}
const byLabel=(tree:any,label:string)=>find(tree,node=>node.props?.['aria-label']===label);
const tabs=(tree:any)=>findAll(tree,node=>node.props?.role==='tab');
describe('tab strip view',()=>{
 it('shows one tab per open layout with the symbol and layout name, the active tab selected',()=>{
  const ui=strip(),tree=ui.render(),rows=tabs(tree);
  expect(rows).toHaveLength(2);expect(rows[0].props['aria-selected']).toBe(true);expect(rows[1].props['aria-selected']).toBe(false);
  expect(text(rows[1])).toContain('Swing');expect(text(rows[0])).toContain(layoutTabLabel(ui.library.entries[0]).symbol);
  expect(find(tree,node=>node.props?.role==='tablist')).toBeTruthy();
 });
 it('switches by click, opens a new Unnamed tab, closes and renames through the library actions',()=>{
  const ui=strip(),tree=ui.render();
  tabs(tree)[1].props.onClick();expect(ui.calls.switch).toHaveBeenLastCalledWith({kind:'open',id:ui.otherId},undefined);
  byLabel(tree,'New tab').props.onClick();expect(ui.calls.switch).toHaveBeenLastCalledWith({kind:'create',name:NEW_TAB_LAYOUT_NAME},undefined);
  byLabel(tree,'Close tab Swing').props.onClick();expect(ui.calls.close).toHaveBeenCalledWith(ui.otherId);
  const activeName=ui.library.entries[0].name;byLabel(tree,'Close tab '+activeName).props.onClick();expect(ui.calls.switch).toHaveBeenLastCalledWith({kind:'open',id:ui.otherId},ui.activeId);
  tabs(tree)[1].props.onDoubleClick();expect(ui.calls.ui).toHaveBeenLastCalledWith({editing:{id:ui.otherId,name:'Swing'}});
  const editing=ui.render({editing:{id:ui.otherId,name:'Swing 2'}}),input=byLabel(editing,'Layout name');
  input.props.onKeyDown({key:'Enter',preventDefault(){},stopPropagation(){},nativeEvent:{}});expect(ui.calls.rename).toHaveBeenCalledWith(ui.otherId,'Swing 2');
  ui.calls.rename.mockClear();byLabel(ui.render({editing:{id:ui.otherId,name:'Other'}}),'Layout name').props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){},nativeEvent:{}});expect(ui.calls.rename).not.toHaveBeenCalled();
 });
 it('the last tab has no close button',()=>{
  const ui=strip(),tree=layoutTabsView({library:ui.library,grid:ui.library.entries[0].grid,open:[ui.activeId],ui:{},onUi:()=>{},onSwitch:()=>{},onClose:()=>{},onRename:()=>{},onMove:()=>{}});
  expect(findAll(tree,node=>String(node.props?.['aria-label']??'').startsWith('Close tab'))).toHaveLength(0);
 });
 it('drags a tab onto another to reorder',()=>{
  const ui=strip(),cells=findAll(ui.render(),node=>node.props?.className==='lv-layout-tab');
  cells[0].props.onDragStart({dataTransfer:{setData(){},effectAllowed:''}});expect(ui.calls.ui).toHaveBeenLastCalledWith({dragging:ui.activeId});
  const dragging=findAll(ui.render({dragging:ui.activeId}),node=>node.props?.className==='lv-layout-tab');
  const over={preventDefault:vi.fn()};dragging[1].props.onDragOver(over);expect(over.preventDefault).toHaveBeenCalled();
  dragging[1].props.onDrop({preventDefault(){}});expect(ui.calls.move).toHaveBeenCalledWith(ui.activeId,ui.otherId);
 });
 it('asks Save or Discard before switching away from unsaved changes when autosave is off',()=>{
  const ui=strip({autosave:false,dirty:true});tabs(ui.render())[1].props.onClick();
  expect(ui.calls.switch).not.toHaveBeenCalled();expect(ui.calls.ui).toHaveBeenLastCalledWith({decision:{action:{kind:'open',id:ui.otherId}}});
  const prompt=ui.render({decision:{action:{kind:'open',id:ui.otherId}}});expect(text(prompt)).toContain('Save changes to');
  find(prompt,node=>node.type==='button'&&text(node)==='Save and switch').props.onClick();expect(ui.calls.switch).toHaveBeenLastCalledWith({kind:'open',id:ui.otherId,decision:'save'},undefined);
  find(prompt,node=>node.type==='button'&&text(node)==='Discard and switch').props.onClick();expect(ui.calls.switch).toHaveBeenLastCalledWith({kind:'open',id:ui.otherId,decision:'discard'},undefined);
 });
 it('keyboard: arrows move focus, Ctrl+Shift+PageDown moves the tab, handled keys do not reach chart shortcuts',()=>{
  const ui=strip(),tab=tabs(ui.render())[0],event={key:'PageDown',ctrlKey:true,shiftKey:true,metaKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()};
  tab.props.onKeyDown(event);expect(ui.calls.move).toHaveBeenCalledWith(ui.activeId,ui.otherId);expect(event.stopPropagation).toHaveBeenCalled();
 });
});

const t0=1_700_000_000;
function bridge():CoinbaseBridge{
 const status={schemaVersion:1 as const,state:'ready' as const,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 return{fetchCoinbaseCandles:async input=>({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[{time:t0,open:100,high:101,low:99,close:100.5,volume:2},{time:t0+300,open:100.5,high:102,low:100,close:101,volume:3}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-20T00:00:00Z',bytes:1,license:'test'}}}),
  subscribeCoinbase:async()=>({ok:true,value:status}),unsubscribeCoinbase:async()=>({ok:true,value:status}),onCoinbaseEvent:()=>()=>{}};
}
async function liveLayout(){
 const provider=new CoinbaseLiveProvider(bridge()),handle=provider.open('BTC-USD','5m');await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));
 registerLiveDataset(handle.dataset());const opened=patchWorkspace(createInitialWorkspace(),{symbol:'BTC-USD',sourceId:handle.datasetId});
 return{provider,handle,opened,cell:opened.grid.layout.activeCellId};
}
afterEach(()=>clearLiveDatasets());
describe('a tab switch reopens the layout live feeds',()=>{
 const on={coinbase:true,alpacaKey:false},off={coinbase:false,alpacaKey:false};
 it('a live chart whose feed closed when its tab was left comes back connecting and is listed to reopen',async()=>{
  const {provider,handle,opened,cell}=await liveLayout(),id=handle.datasetId;handle.close();unregisterLiveDataset(id);
  const result=liveTabGrid(opened,opened.grid,on);
  expect(result.grid.cells[cell].datasetId).toBe(id);expect(liveDatasetById(id)?.provenance.state).toBe('loading');
  expect(result.reopen).toEqual([{cellId:cell,providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m'}]);
  provider.dispose();
 });
 it('with the source off the chart shows the Disconnected stand-in and nothing reopens',async()=>{
  const {provider,handle,opened}=await liveLayout(),id=handle.datasetId;handle.close();unregisterLiveDataset(id);
  const result=liveTabGrid(opened,opened.grid,off);expect(result.reopen).toEqual([]);expect(liveDatasetById(id)?.provenance.state).toBe('disconnected');
  provider.dispose();
 });
 it('a layout restored from disk uses its saved live reference the first time only',async()=>{
  const {provider,handle,opened,cell}=await liveLayout(),saved=persistableWorkspace(opened) as typeof opened&{liveCharts?:unknown};handle.close();clearLiveDatasets();
  expect(saved.grid.cells[cell].datasetId.startsWith('live:')).toBe(false);
  const first=liveTabGrid(saved,saved.grid,on);expect(first.grid.cells[cell].datasetId).toBe('live:coinbase-public:BTC-USD:5m');expect(first.reopen).toHaveLength(1);
  const again=liveTabGrid(saved,saved.grid,on);expect(again.grid).toBe(saved.grid);expect(again.reopen).toEqual([]);
  provider.dispose();
 });
 it('an open feed shared with the visible tab is reused, never reopened',async()=>{
  const {provider,handle,opened}=await liveLayout();const result=liveTabGrid(opened,opened.grid,on);
  expect(result.grid).toBe(opened.grid);expect(result.reopen).toEqual([]);handle.close();provider.dispose();
 });
});

describe('App wiring (source check)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 it('renders the strip first in the workspace, after every other hook, and reopens feeds after a saved layout opens',()=>{
  // A context provider (renders no DOM) now opens right after <main>, so the strip is still the first rendered child.
  expect(app).toMatch(/inert=\{workspaceBusy\|\|undefined\}>(?:<DetailSourcesProvider value=\{\{[^\n]*\}\}>)?\r?\n  \{layoutTabs\}\r?\n  <header className="topbar">/);
  expect(app.indexOf('const layoutTabs=useLayoutTabs(')).toBeGreaterThan(app.indexOf('const axisTagBoard=useMemo('));
  expect(app).toMatch(/openedLive=liveTabGrid\(expected,openedBook\.grid,/);
  // The reopen loop moved into reopenLiveEntries, which still opens every live feed through attachLive
  // and reopens a saved FRED chart (not a feed) through the FRED cache.
  expect(app).toContain('reopenLiveEntries(openedLive.reopen);');
  expect(app).toContain('for(const entry of entries)if(entry.providerId!==FRED_PROVIDER_ID)attachLive(entry.providerId,entry.symbol,entry.interval);');
 });
});
