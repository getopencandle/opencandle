import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {SHARED_WORKSPACE_KEYS,sharedWorkspaceOf,sharedWorkspaceChanges,applySharedWorkspace,relayLayoutSave,closeNeedsPrompt,relayedPaperRequest,RELAYED_PAPER_REFUSAL} from '../../src/ui/window-mode';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
const nodeRequire=createRequire(import.meta.url);
// Layout windows become first-class. Pure helpers and App wiring (source checks).
// SYNTHETIC data only; no key, no network.
const instrument={id:'SYNTHETIC:R29',symbol:'R29',name:'Synthetic window',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'};
const quote={instrumentId:'SYNTHETIC:R29',bid:99.5,ask:100.5,session:'regular',fixture:true,sequence:1,availableAt:60,observedAt:60};

describe('workspace-wide edits from a layout window',()=>{
 it('main and the renderer take the same field list, which leaves out layouts, watchlists, alerts and imports',()=>{
  expect([...nodeRequire('../../electron/windows.cjs').SHARED_WORKSPACE_KEYS]).toEqual([...SHARED_WORKSPACE_KEYS]);
  for(const key of ['layoutLibrary','grid','watchBook','watchAdvanced','listAlerts','imports','paper','alerts','themeId','appearance'])expect(SHARED_WORKSPACE_KEYS as readonly string[]).not.toContain(key);
 });
 it('sends only the fields that changed since the baseline, and the main window takes exactly those',()=>{
  const loaded=createInitialWorkspace(),baseline=sharedWorkspaceOf(loaded);
  expect(sharedWorkspaceChanges(baseline,loaded)).toBeNull();
  const edited={...loaded,drawingFavorites:['trendline'],chartSettings:{...loaded.chartSettings,templates:[{name:'SYNTHETIC',document:{}} as never]}};
  const changes=sharedWorkspaceChanges(baseline,edited)!;
  expect(Object.keys(changes).sort()).toEqual(['chartSettings','drawingFavorites']);
  const primary={...createInitialWorkspace(),watchBook:'main-window-watchlists' as never};
  const merged=applySharedWorkspace(primary,changes);
  expect(merged.drawingFavorites).toEqual(['trendline']);expect(merged.chartSettings.templates).toHaveLength(1);
  expect(merged.watchBook).toBe('main-window-watchlists');
  expect(applySharedWorkspace(primary,undefined)).toBe(primary);
  expect(()=>applySharedWorkspace(primary,{watchBook:{}})).toThrow('does not take');
  expect(()=>applySharedWorkspace(primary,[1])).toThrow('does not take');
 });
 it('the relayed save carries the changes as plain JSON',async()=>{
  const sent:unknown[]=[],bridge={saveLayoutFromWindow:async(input:unknown)=>{sent.push(input);return{ok:true as const,value:{revision:2,savedAt:'x'}};}};
  const workspace=createInitialWorkspace(),library=workspace.layoutLibrary!,id=library.activeId;
  await relayLayoutSave(bridge,id,library,{drawingFavorites:['ray']});await relayLayoutSave(bridge,id,library,null);
  expect(Object.keys(sent[0] as object).sort()).toEqual(['grid','layoutId','shared']);expect((sent[0] as {shared:unknown}).shared).toEqual({drawingFavorites:['ray']});
  expect(Object.keys(sent[1] as object).sort()).toEqual(['grid','layoutId']);
 });
});

describe('closing a layout window with Autosave off',()=>{
 it('asks only for a layout window with unsaved edits of its own layout and Autosave off',()=>{
  const workspace=createInitialWorkspace(),library=workspace.layoutLibrary!,mode={role:'secondary' as const,windowId:1,layoutId:library.activeId};
  const saved={...library,autosave:false,entries:library.entries.map(row=>({...row,savedAt:row.savedAt||1}))};
  const grid=saved.entries[0].grid,edited={...grid,layout:{...grid.layout,name:grid.layout.name+' edited'}};
  expect(closeNeedsPrompt(mode,saved,edited as never,false)).toBe(true);
  expect(closeNeedsPrompt(mode,saved,edited as never,true)).toBe(false);
  expect(closeNeedsPrompt(mode,{...saved,autosave:true},edited as never,false)).toBe(false);
  expect(closeNeedsPrompt({role:'primary'},saved,edited as never,false)).toBe(false);
  expect(closeNeedsPrompt(mode,saved,grid,false)).toBe(false);
 });
});

describe('Shift+B / Shift+S from a layout window',()=>{
 it('the main window takes a well formed request and refuses anything else',()=>{
  const ok={side:'buy',instrument,quote,quoteSource:{key:'synthetic:R29',state:'ready'},now:60};
  expect(relayedPaperRequest(ok)).toEqual(ok);
  expect(relayedPaperRequest({...ok,quote:null}).quote).toBeNull();
  for(const bad of [null,[],{...ok,side:'short'},{...ok,instrument:{...instrument,tickSize:0}},{...ok,instrument:{...instrument,id:''}},{...ok,quote:{...quote,instrumentId:'OTHER'}},{...ok,quote:{...quote,bid:'1'}},{...ok,quoteSource:{key:'x',state:'odd'}},{...ok,now:-1}])
   expect(()=>relayedPaperRequest(bad)).toThrow(RELAYED_PAPER_REFUSAL);
 });
 it('App wiring: the key relays in a layout window, the main window places or opens its ticket, reset and restore reload the windows',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain("if(secondaryWindow){if(action.kind==='place')relayPaperKey(action.side);return true;}");
  expect(app).toContain('paper:request=>acceptRelayedPaper(request)');
  expect(app).toContain("if(!account.settings.oneClick){setOrderSeed({side:request.side,relay:");
  expect(app).toContain('const result=placePaperPreset(selectedPreset,request.side,context,');
  expect(app).toContain("instrument={orderSeed.relay?.instrument??dataset.instrument}");
  expect(app.match(/refreshLayoutWindows\(\);\}finally\{nextCompound\?\.rollback\(\);finishStorageMutation\(\);\}/g)).toHaveLength(2);// root 1028: compound-alert rollback runs in the same finally
  expect(app).toContain('const relayed={...applySharedWorkspace(expected,request.shared),layoutLibrary:replaceRelayedLayout(');// names it relayed, then folds global drawing edits into next
  expect(app).toContain('next=relayedStore===relayed.globalDrawings?relayed:{...relayed,globalDrawings:relayedStore};');
  expect(app).toContain('relayLayoutSave(window.lv,windowMode.layoutId,next.layoutLibrary!,sharedSent)');
  expect(app).toContain("if(closeNeedsPrompt(windowMode,current.current.layoutLibrary,current.current.grid,discardOnClose.current)){setClosePrompt(true);return Promise.resolve({keepOpen:true});}");
  // Second-symbol indicators load in layout windows too.
  expect(app).not.toContain('if(secondaryWindow)return;\r\n  const SECOND_SYMBOL_FEEDS=8');expect(app).not.toContain('if(secondaryWindow)return;\n  const SECOND_SYMBOL_FEEDS=8');
 });
});
