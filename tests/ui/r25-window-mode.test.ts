import {describe,expect,it,vi} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {duplicateSavedLayout} from '../../src/ui/layout-library';
import {projectGrid} from '../../src/ui/workspace-grid';
import {windowTabSuccessor,withoutElsewhere} from '../../src/ui/layout-tabs';
import {layoutTabsView} from '../../src/ui/LayoutTabs';
import {ONLY_TAB_WINDOW_MESSAGE,PRIMARY_ONLY_DIALOGS,relayLayoutSave,replaceRelayedLayout,secondaryMenu,secondaryWorkspace,windowModeOf} from '../../src/ui/window-mode';
// pure helpers. SYNTHETIC demo workspace only.

function twoLayouts(){
 const state=createInitialWorkspace();let n=0;
 const copy=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Second monitor',100,()=>'r25m-'+(++n));
 return{state:{...state,layoutLibrary:copy.library},mainId:state.layoutLibrary!.activeId,otherId:copy.entry.id};
}
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}

describe(' window mode',()=>{
 it('reads the layout window role from the query main builds; anything else is the main window',()=>{
  expect(windowModeOf('?window=3&layout=r25m-1')).toEqual({role:'secondary',windowId:3,layoutId:'r25m-1'});
  expect(windowModeOf('?window=1&layout='+encodeURIComponent('a:b.c_d-e'))).toEqual({role:'secondary',windowId:1,layoutId:'a:b.c_d-e'});
  for(const search of ['','?window=0&layout=a','?window=1','?layout=a','?window=x&layout=a','?window=1&layout=a%20b',undefined,7])expect(windowModeOf(search)).toEqual({role:'primary'});
 });
 it('keeps only About and the chart exports in the layout window main menu, and refuses the main-window dialogs',()=>{
  const items=[{label:'About OpenCandle'},'separator' as const,{label:'Import data'},{label:'Export workspace'},{label:'Export bars'},{label:'Export image'},'separator' as const,{label:'Data sources'},{label:'Local storage'},{label:'Quit OpenCandle'}];
  expect(secondaryMenu(items).map(row=>row.label)).toEqual(['About OpenCandle','Export bars','Export image']);
  for(const dialog of ['alerts','paper','order','layouts','storage','import','restore-workspace','screener','notes'])expect(PRIMARY_ONLY_DIALOGS.has(dialog)).toBe(true);
  for(const dialog of ['indicators','chart-settings','symbol-search','compare','about'])expect(PRIMARY_ONLY_DIALOGS.has(dialog)).toBe(false);
 });
 it('opens the window layout of the saved workspace, or null when it is no longer saved',()=>{
  const {state,otherId,mainId}=twoLayouts();
  const shown=secondaryWorkspace(state,otherId,projectGrid)!;
  expect(shown.layoutLibrary!.activeId).toBe(otherId);expect(shown.grid!.layout.id).toBe(otherId);expect(state.layoutLibrary!.activeId).toBe(mainId);
  expect(secondaryWorkspace(state,mainId,projectGrid)).toBe(state);
  expect(secondaryWorkspace(state,'missing',projectGrid)).toBeNull();
 });
 it('replaces a relayed layout with a new revision and its saved name, and never the main window layout',()=>{
  const {state,otherId,mainId}=twoLayouts(),book=state.layoutLibrary!,old=book.entries.find(row=>row.id===otherId)!;
  const grid=structuredClone(old.grid);grid.layout.name='Renamed elsewhere';
  const next=replaceRelayedLayout(book,otherId,grid,5000),entry=next.entries.find(row=>row.id===otherId)!;
  expect(entry.revision).toBe(old.revision+1);expect(entry.savedAt).toBe(5000);expect(entry.grid.layout.name).toBe(old.name);expect(entry.grid).not.toBe(grid);
  expect(next.entries.find(row=>row.id===mainId)).toBe(book.entries.find(row=>row.id===mainId));
  expect(()=>replaceRelayedLayout(book,mainId,structuredClone(book.entries[0].grid),5000)).toThrow('open in the main window');
  expect(()=>replaceRelayedLayout(book,'missing',grid,5000)).toThrow('no longer saved');
  expect(()=>replaceRelayedLayout(book,otherId,{...grid,layout:{...grid.layout,id:mainId}},5000)).toThrow('different layout');
 });
 it('relays the layout grid as plain JSON data',async()=>{
  const {state,otherId}=twoLayouts(),bridge={saveLayoutFromWindow:vi.fn(async()=>({ok:true as const,value:{revision:3,savedAt:'2026-10-22T00:00:00Z'}}))};
  const library={...state.layoutLibrary!,activeId:otherId};
  await expect(relayLayoutSave(bridge,otherId,library)).resolves.toMatchObject({ok:true,value:{revision:3}});
  const sent=bridge.saveLayoutFromWindow.mock.calls[0] as any;expect(sent[0].layoutId).toBe(otherId);expect(sent[0].grid).toEqual(JSON.parse(JSON.stringify(library.entries.find(row=>row.id===otherId)!.grid)));
  await expect(relayLayoutSave({},otherId,library)).rejects.toThrow('desktop app');
 });
});

describe(' tab strip',()=>{
 it('drops layouts open in other windows but keeps the active one, and hands the active tab to its neighbour first',()=>{
  expect(withoutElsewhere(['a','b','c'],['b'],'a')).toEqual(['a','c']);
  expect(withoutElsewhere(['a','b'],['a','b'],'a')).toEqual(['a']);
  expect(withoutElsewhere(['b'],['b'],'a')).toEqual(['a']);
  expect(windowTabSuccessor(['a','b','c'],'c','a')).toBeNull();
  expect(windowTabSuccessor(['a','b','c'],'b','b')).toBe('c');
  expect(windowTabSuccessor(['a','b'],'b','b')).toBe('a');
  expect(()=>windowTabSuccessor(['a'],'a','a')).toThrow(ONLY_TAB_WINDOW_MESSAGE);
 });
 it('offers Open layout in new window on each tab when the desktop app supports it, never on the only tab',()=>{
  const {state,mainId,otherId}=twoLayouts(),library=state.layoutLibrary!,grid=library.entries[0].grid,onNewWindow=vi.fn();
  const render=(open:string[],withWindow=true)=>layoutTabsView({library,grid,open,ui:{},onUi:vi.fn(),onSwitch:vi.fn(),onClose:vi.fn(),onRename:vi.fn(),onMove:vi.fn(),...(withWindow?{onNewWindow}:{})});
  const buttons=(tree:any)=>findAll(tree,node=>node.props?.className==='lv-layout-tab-window');
  const two=buttons(render([mainId,otherId]));expect(two.map(node=>node.props['aria-label'])).toEqual(['Open '+library.entries[0].name+' in new window','Open Second monitor in new window']);
  expect(two[0].props.title).toBe('Open layout in new window');two[1].props.onClick();expect(onNewWindow).toHaveBeenCalledWith(otherId);
  expect(buttons(render([mainId]))).toHaveLength(0);
  expect(buttons(render([mainId,otherId],false))).toHaveLength(0);
 });
});
