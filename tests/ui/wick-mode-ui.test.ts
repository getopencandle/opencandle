import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {duplicateSavedLayout} from '../../src/ui/layout-library';
import {layoutTabsView} from '../../src/ui/LayoutTabs';
import {APP_PREFERENCE_DEFAULTS,APP_PREFERENCE_LABELS,appPreferencesOf,restoreAppPreferences,wickPreferencesOf,withWickPreferences,WICK_PREFERENCE_DEFAULTS} from '../../src/ui/app-preferences';
import {AppPreferencesSection} from '../../src/ui/AppPreferencesSection';
import {WICK_LABELS,WICK_THEME_TOKENS,isWickStripWindow,validWickSnapshot,wickStripSnapshot,wickTabTitle,wickTheme} from '../../src/ui/wick-mode';
import {WickStripTabs,applyWickTheme} from '../../src/ui/WickStrip';
import {APP_COMMANDS,MAIN_MENU_LAYOUT,appCommand,commandMenuRows} from '../../src/ui/command-registry';
import {keyboardShortcutRows,LISTENER_ONLY_KEYS} from '../../src/ui/keyboard-shortcuts';
const nodeRequire=createRequire(import.meta.url);

// The renderer side of Wick mode. SYNTHETIC fixtures only (the initial workspace).
const em=/—/;
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function tabsFixture(){
 const state=createInitialWorkspace();let n=0;
 const second=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Swing',100,()=>'tab-'+(++n));
 return{library:second.library,grid:state.grid!,open:[second.library.entries[0].id,second.entry.id],activeId:second.library.activeId,otherId:second.entry.id};
}

describe('Wick mode preferences',()=>{
 it('factory: on top, no collapse on leaving, and nothing written to the workspace',()=>{
  expect(WICK_PREFERENCE_DEFAULTS).toEqual({alwaysOnTop:true,collapseOnBlur:false});
  expect(APP_PREFERENCE_DEFAULTS).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange'});
  expect(wickPreferencesOf(appPreferencesOf({}))).toEqual({alwaysOnTop:true,collapseOnBlur:false});
  expect(withWickPreferences({...APP_PREFERENCE_DEFAULTS},{alwaysOnTop:true,collapseOnBlur:false})).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange'});
 });
 it('only a changed choice is written, and both survive a workspace save and load',()=>{
  const changed=withWickPreferences({...APP_PREFERENCE_DEFAULTS},{alwaysOnTop:false,collapseOnBlur:true});
  expect(changed).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange',wickAlwaysOnTop:false,wickOnLeave:true});
  expect(withWickPreferences(changed,{alwaysOnTop:true,collapseOnBlur:false})).toEqual({keepRunningInTray:true,defaultChartTimezone:'exchange'});
  const saved={...createInitialWorkspace(),appPreferences:changed};
  const restored=restoreWorkspace(JSON.parse(JSON.stringify(saved)),createInitialWorkspace());
  expect(restored.appPreferences).toEqual(changed);expect(wickPreferencesOf(appPreferencesOf(restored))).toEqual({alwaysOnTop:false,collapseOnBlur:true});
 });
 it('an older saved value (two fields) still loads; a wrong Wick value or an unknown field is refused',()=>{
  expect(restoreAppPreferences({keepRunningInTray:false,defaultChartTimezone:'exchange'})).toEqual({keepRunningInTray:false,defaultChartTimezone:'exchange'});
  for(const bad of [{keepRunningInTray:true,defaultChartTimezone:'exchange',wickOnLeave:'yes'},{keepRunningInTray:true,defaultChartTimezone:'exchange',wickAlwaysOnTop:1},{keepRunningInTray:true,defaultChartTimezone:'exchange',wick:true},{wickOnLeave:true,defaultChartTimezone:'exchange'}])expect(()=>restoreAppPreferences(bad)).toThrow();
 });
 it('Settings > General shows the two rows only where Wick mode is offered, and each row changes only its choice',()=>{
  const without=renderToStaticMarkup(React.createElement(AppPreferencesSection,{preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,onChange:()=>undefined,at:new Date(Date.UTC(2026,9,30,12))}));
  expect(without).not.toContain(APP_PREFERENCE_LABELS.wickOnLeave);
  const html=renderToStaticMarkup(React.createElement(AppPreferencesSection,{preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,wickAvailable:true,onChange:()=>undefined,at:new Date(Date.UTC(2026,9,30,12))}));
  expect(html).toContain('Keep Wick mode on top of other windows');expect(html).toContain('Switch to Wick mode when I leave OpenCandle');expect(html).not.toMatch(em);
  const changes:unknown[]=[];const tree=AppPreferencesSection({preferences:{...APP_PREFERENCE_DEFAULTS},trayAvailable:true,wickAvailable:true,onChange:value=>changes.push(value)}) as any;
  const box=(label:string)=>find(tree,node=>node.type==='label'&&JSON.stringify(node.props.children).includes(label))?.props.children.find((child:any)=>child?.type==='input');
  box(APP_PREFERENCE_LABELS.wickAlwaysOnTop).props.onChange({target:{checked:false}});
  box(APP_PREFERENCE_LABELS.wickOnLeave).props.onChange({target:{checked:true}});
  expect(changes).toEqual([{keepRunningInTray:true,defaultChartTimezone:'exchange',wickAlwaysOnTop:false},{keepRunningInTray:true,defaultChartTimezone:'exchange',wickOnLeave:true}]);
 });
});

describe('Wick mode tab strip snapshot',()=>{
 it('the strip shows the open tabs in order, the active one with its ticker, price and change, others as in the main strip',()=>{
  const f=tabsFixture();
  const snapshot=wickStripSnapshot({library:f.library,grid:f.grid,open:f.open,quote:{symbol:'GME',changePercent:-0.754,last:23.82,priceText:'23.82'},theme:{'--lv-bg-raised':'#1f1f1f'}})!;
  expect(snapshot.tabs.map(tab=>tab.id)).toEqual(f.open);
  expect(snapshot.tabs[0]).toMatchObject({active:true,symbol:'GME',price:'23.82',change:'-0.75%',tone:'down'});
  expect(snapshot.tabs[1]).toMatchObject({active:false,name:'Swing'});expect(snapshot.tabs[1].price).toBeUndefined();
  expect(snapshot.theme).toEqual({'--lv-bg-raised':'#1f1f1f'});
  // What main accepts.
  const {wickSnapshotInput}=nodeRequire('../../electron/wick.cjs');expect(wickSnapshotInput(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  expect(wickStripSnapshot({library:{...f.library,activeId:'gone'},grid:f.grid,open:f.open,theme:{}}),'no active tab').toBeNull();
 });
 it('takes only the fixed theme tokens with colour values',()=>{
  const values:Record<string,string>={'--lv-bg-raised':' #2c3141 ','--lv-text-primary':'rgb(227, 230, 238)','--lv-accent':'url(https://x)','--lv-hover':'var(--x)'};
  expect(wickTheme(token=>values[token])).toEqual({'--lv-bg-raised':'#2c3141','--lv-text-primary':'rgb(227, 230, 238)'});
  const {THEME_TOKENS}=nodeRequire('../../electron/wick.cjs');expect([...WICK_THEME_TOKENS]).toEqual([...THEME_TOKENS]);
 });
 it('the strip page knows itself by ?window=wick; a layout window or the main window is not it',()=>{
  expect(isWickStripWindow('?window=wick')).toBe(true);
  for(const search of ['','?window=1&layout=a','?wick=1',null])expect(isWickStripWindow(search)).toBe(false);
 });
 it('the strip page checks what it gets again',()=>{
  expect(validWickSnapshot(null)).toBeNull();expect(validWickSnapshot({tabs:[]})).toBeNull();expect(validWickSnapshot({tabs:[{id:'a b',symbol:'',name:'',active:true}]})).toBeNull();
  expect(validWickSnapshot({tabs:[{id:'a',symbol:'GME',name:'x\u0007y',active:true,tone:'sideways'}],theme:{'--lv-bg-raised':'#000','--evil':'#fff'}})).toEqual({tabs:[{id:'a',symbol:'GME',name:'xy',active:true}],theme:{'--lv-bg-raised':'#000'}});
 });
});

describe('Wick mode strip page',()=>{
 const snapshot={tabs:[{id:'a',symbol:'GME',name:'Main',active:true,price:'23.82',change:'-0.75%',tone:'down' as const},{id:'b',symbol:'SPY',name:'Index',active:false}],theme:{}};
 it('draws the tabs in the main tab styles, with an expand button and a draggable gap',()=>{
  const html=renderToStaticMarkup(React.createElement(WickStripTabs,{snapshot,onSelect:()=>undefined,onRestore:()=>undefined}));
  expect(html).toContain('class="lv-layout-tab" data-active="true"');expect(html).toContain('<span class="lv-layout-tab-symbol">GME</span><span class="lv-layout-tab-price">23.82</span><span class="lv-layout-tab-change" data-tone="down">-0.75%</span>');
  expect(html).toContain('<span class="lv-layout-tab-name">Index</span>');expect(html).toContain('class="lv-wick-grip"');expect(html).toContain('aria-label="Open OpenCandle"');
  expect(html).not.toMatch(em);expect(html).not.toContain('tab-1');
  expect(renderToStaticMarkup(React.createElement(WickStripTabs,{snapshot:null,onSelect:()=>undefined,onRestore:()=>undefined}))).toContain(WICK_LABELS.waiting);
 });
 it('a tab click selects it, a double-click and the expand button restore',()=>{
  const onSelect=vi.fn(),onRestore=vi.fn(),tree=WickStripTabs({snapshot,onSelect,onRestore}) as any;
  find(tree,node=>node.props?.role==='tab'&&node.props['aria-selected']===false).props.onClick();expect(onSelect).toHaveBeenCalledWith(snapshot.tabs[1]);
  find(tree,node=>node.props?.['aria-label']==='Open OpenCandle').props.onClick();tree.props.onDoubleClick();expect(onRestore).toHaveBeenCalledTimes(2);
  expect(wickTabTitle(snapshot.tabs[0])).toBe('GME 23.82 -0.75% · Main · Click to open OpenCandle');
  expect(wickTabTitle(snapshot.tabs[1])).toBe('SPY · Index · Click to show this tab');
 });
 it('applies the theme colours on the root and drops tokens the theme leaves out',()=>{
  const set=vi.fn(),remove=vi.fn();applyWickTheme({style:{setProperty:set,removeProperty:remove}},{'--lv-bg-raised':'#123456'});
  expect(set).toHaveBeenCalledWith('--lv-bg-raised','#123456');expect(remove).toHaveBeenCalledWith('--lv-accent');
 });
 it('the strip CSS drags on the empty part only and uses theme tokens, no fixed colours',()=>{
  const css=readFileSync('src/ui/wick-strip.css','utf8');
  expect(css).toMatch(/\.lv-wick\{[^}]*-webkit-app-region:drag/);expect(css).toMatch(/\.lv-wick \.lv-layout-tab,\.lv-wick button\{-webkit-app-region:no-drag/);
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
 });
});

describe('Wick mode entry points',()=>{
 it('the tab strip offers a Wick mode button only when given one',()=>{
  const f=tabsFixture(),onWick=vi.fn(),base={library:f.library,grid:f.grid,open:f.open,ui:{},onUi:()=>{},onSwitch:()=>{},onClose:()=>{},onRename:()=>{},onMove:()=>{}};
  expect(find(layoutTabsView(base),node=>node.props?.['aria-label']==='Wick mode')).toBeNull();
  const button=find(layoutTabsView({...base,onWick}),node=>node.props?.['aria-label']==='Wick mode');
  expect(button.props.title).toBe(WICK_LABELS.buttonTitle);button.props.onClick();expect(onWick).toHaveBeenCalledOnce();
 });
 it('the command registry, the main menu and Ctrl+Shift+M',()=>{
  expect(appCommand('wick-mode')).toMatchObject({label:'Wick mode',group:'General',shortcut:'Wick mode'});
  expect(APP_COMMANDS.filter(row=>row.id==='wick-mode')).toHaveLength(1);
  const run=()=>{};
  expect(commandMenuRows(MAIN_MENU_LAYOUT,{'local-storage':{run},'wick-mode':{run},quit:{run}}).map(row=>row==='separator'?'-':row.label)).toEqual(['Local storage','-','Wick mode','-','Quit OpenCandle']);
  expect(commandMenuRows(MAIN_MENU_LAYOUT,{'local-storage':{run}}).map(row=>row==='separator'?'-':row.label),'browser preview: neither row').toEqual(['Local storage']);
  expect(keyboardShortcutRows().find(row=>row.action==='Wick mode')).toEqual({group:'General',action:'Wick mode',keys:['Ctrl+Shift+M']});
  const row=LISTENER_ONLY_KEYS.find(item=>item.action==='Wick mode')!;expect(readFileSync(row.file,'utf8')).toContain(row.source);
 });
 it('no visible Wick mode text has an em dash or an internal id',()=>{
  const {WICK_MENU_LABELS}=nodeRequire('../../electron/wick.cjs');
  const visible=[...Object.values(WICK_LABELS),...Object.values(WICK_MENU_LABELS) as string[],APP_PREFERENCE_LABELS.wickAlwaysOnTop,APP_PREFERENCE_LABELS.wickOnLeave,APP_PREFERENCE_LABELS.wickNote,appCommand('wick-mode').label];
  for(const text of visible){expect(text).not.toMatch(em);expect(text).not.toMatch(/WICK-MODE|[A-Z]+-\d{3,4}\b|lv:wick/);}
 });
});
