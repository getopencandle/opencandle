import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {classifyWorkspaceKey,type FocusContext,type WorkspaceKeyEvent} from '../../src/ui/shortcut-dispatch';
import {createWatchClicks,stepWatchSymbol} from '../../src/watchlists/gestures';
import {createWatchBook} from '../../src/watchlists/model';
import {fixtureDataset} from '../../src/domain/fixtures';
import {buildSymbolSearchCandidates,searchSymbols,readRecentSymbols,rememberRecentSymbol,recentSymbolRows,RECENT_SYMBOLS_KEY} from '../../src/ui/symbol-search';
import {ChartTypeMenu,chartTypeGroups} from '../../src/ui/ChartTypeMenu';
import {scrollToLatestVisible,scrollToLatestCenter} from '../../src/ui/ScrollToLatestButton';
import {layoutMenuEntries,layoutMenuRows,layoutMenuView,type LayoutMenuState} from '../../src/ui/layout-menu';
import {isMaximizeChord,layoutTileStyle,SYNC_LABELS} from '../../src/ui/MultiChartGrid';
import {createLayoutLibrary,prepareLayoutSave,duplicateSavedLayout,favoriteSavedLayout} from '../../src/ui/layout-library';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
// Pure models and render helpers run here
// App wiring is pinned against the App text. Not executable UI evidence.
const app=readFileSync('src/ui/App.tsx','utf8'),css=readFileSync('src/ui/styles.css','utf8'),grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
const key=(k:string,extra:Partial<WorkspaceKeyEvent>={}):WorkspaceKeyEvent=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra});
const ctx=(extra:Partial<FocusContext>={}):FocusContext=>({editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false,...extra});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
afterEach(()=>{vi.useRealTimers();});

describe('gap 12: global shortcuts',()=>{
 it('the classifier names Alt+G, Alt+W, Space and Shift+Space, and / opens Indicators',()=>{
  expect(classifyWorkspaceKey(key('g',{altKey:true}),ctx())).toEqual({command:'go-to-date'});
  expect(classifyWorkspaceKey(key('w',{altKey:true}),ctx())).toEqual({command:'add-to-watchlist'});
  expect(classifyWorkspaceKey(key(' '),ctx())).toEqual({command:'next-symbol'});
  expect(classifyWorkspaceKey(key(' ',{shiftKey:true}),ctx())).toEqual({command:'previous-symbol'});
  expect(classifyWorkspaceKey(key('/'),ctx())).toEqual({command:'indicators'});
 });
 it('they stay out of text fields, dialogs and away from the chart',()=>{
  for(const event of [key('g',{altKey:true}),key('w',{altKey:true}),key(' '),key('/')]){
   expect(classifyWorkspaceKey(event,ctx({editable:true}))).toEqual({command:'none'});
   expect(classifyWorkspaceKey(event,ctx({dialogOpen:true}))).toEqual({command:'none'});
  }
  expect(classifyWorkspaceKey(key(' '),ctx({chartFocus:false}))).toEqual({command:'none'});
  expect(classifyWorkspaceKey(key(' ',{repeat:true}),ctx())).toEqual({command:'none'});
  expect(classifyWorkspaceKey(key('g',{altKey:true,ctrlKey:true}),ctx())).toEqual({command:'none'});
 });
 it('the App listener routes them through the shared classifier',()=>{
  // A late 1028 App change also imports scriptEditorOwnsKey from the same module; the shared classifier import stays required.
  expect(app).toMatch(/import \{classifyWorkspaceKey(?:,[A-Za-z]+)*\} from '\.\/shortcut-dispatch';/);
  expect(app).toMatch(/const routed=classifyWorkspaceKey\(e,/);
  for(const command of ['indicators','go-to-date','add-to-watchlist','next-symbol','previous-symbol'])expect(app).toContain("routed.command==='"+command+"'");
 });
});

describe('gap 5: watchlist speed',()=>{
 it('a single click opens the chart at once',()=>{
  vi.useFakeTimers();const book=createWatchBook(),seen:string[]=[];
  const clicks=createWatchClicks({read:()=>({book,datasets:[],blocked:false}),open:(ref,all)=>seen.push(ref.symbol+':'+all),error:()=>{}});
  clicks.click('initial-row-0');expect(seen).toEqual(['GME:false']);
  clicks.click('initial-row-1',true);clicks.click('initial-row-1',false,2);expect(seen).toEqual(['GME:false']);
 });
 it('Space and Shift+Space step through the active list from the current symbol, wrapping',()=>{
  const book=createWatchBook(['GME','SPY','QQQ']),datasets=['GME','SPY','QQQ'].map(symbol=>fixtureDataset(symbol,20));
  const at=(symbol:string)=>({symbol,exchange:datasets.find(row=>row.instrument.symbol===symbol)!.instrument.exchange});
  expect(stepWatchSymbol(book,datasets,at('GME'),1)?.instrument.symbol).toBe('SPY');
  expect(stepWatchSymbol(book,datasets,at('QQQ'),1)?.instrument.symbol).toBe('GME');
  expect(stepWatchSymbol(book,datasets,at('GME'),-1)?.instrument.symbol).toBe('QQQ');
  expect(stepWatchSymbol(book,datasets,{symbol:'ZZZ',exchange:'X'},1)?.instrument.symbol).toBe('GME');
  expect(stepWatchSymbol(createWatchBook([]),datasets,at('GME'),1)).toBeNull();
 });
 it('Up/Down in the list opens the row it moves to; the help text no longer promises a delay',()=>{
  const panel=readFileSync('src/ui/WatchlistPanel.tsx','utf8');
  expect(panel).toMatch(/const before=selectionRef\.current\[0\];applySelection\(next\);const moved=/);
  expect(panel).not.toContain('after 300 ms');
 });
 it('App steps the chart with stepWatchSymbol',()=>{expect(app).toMatch(/stepWatchSymbol\(current\.current\.watchBook,currentInput\.current\?\.datasets\?\?\[\]/);});
});

describe('gap 13: symbol search',()=>{
 const datasets=['GME','SPY','AAPL'].map(symbol=>fixtureDataset(symbol,20)),rows=buildSymbolSearchCandidates(datasets,[]);
 it('filters by exchange',()=>{
  const exchange=rows[0].exchange;
  expect(searchSymbols(rows,'',{assetClass:'all',source:'all',exchange}).rows.every(row=>row.exchange===exchange)).toBe(true);
  expect(searchSymbols(rows,'',{assetClass:'all',source:'all',exchange:'NOPE'}).total).toBe(0);
 });
 it('remembers recent symbols, newest first, capped, and survives broken storage',()=>{
  const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v)};
  expect(readRecentSymbols(storage)).toEqual([]);
  rememberRecentSymbol(storage,'GME');rememberRecentSymbol(storage,'SPY');rememberRecentSymbol(storage,'gme');
  expect(readRecentSymbols(storage)).toEqual(['GME','SPY']);expect(store.has(RECENT_SYMBOLS_KEY)).toBe(true);
  for(let i=0;i<20;i++)rememberRecentSymbol(storage,'S'+i);expect(readRecentSymbols(storage)).toHaveLength(10);
  const bad={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  expect(readRecentSymbols(bad)).toEqual([]);expect(()=>rememberRecentSymbol(bad,'GME')).not.toThrow();
  store.set(RECENT_SYMBOLS_KEY,'{"x":1}');expect(readRecentSymbols(storage)).toEqual([]);
 });
 it('recent rows follow the recent order and skip unknown symbols',()=>{
  expect(recentSymbolRows(rows,['SPY','NOPE','GME']).map(row=>row.symbol)).toEqual(['SPY','GME']);
 });
 it('the header is a symbol button (no datalist) and live typed rows reach search',()=>{
  expect(app).not.toContain('DEMO_SYMBOLS.map(');
  expect(app).not.toContain('<datalist');expect(app).toContain('<HeaderSymbolButton');
  expect(app).toContain('typedCandidates={(query,rows)=>[...liveTypedCandidates(query,rows,alpacaKeyConfigured,dataset.resolution),...symbolMathCandidates(query,dataset.resolution,symbol=>rows.some(row=>row.symbol===symbol)),...fredCandidates(query)]}');// Typed symbol math rows join the live typed rows; Typed FRED: rows follow them
  expect(app).toContain('recent={readRecentSymbols(recentStorage())}');
 });
});

describe('gap 16: chart type picker',()=>{
 const types=[['candles','Candles'],['bars','Bars'],['line','Line'],['renko','Renko'],['area','Area']].map(([value,label])=>({value,label}));
 it('groups the types in menu order',()=>{expect(chartTypeGroups(types).map(group=>group.map(row=>row.value))).toEqual([['bars','candles'],['line'],['area'],['renko']]);});
 it('is an icon button that opens a grouped radio menu',()=>{
  const closed=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{}}));
  expect(closed).toContain('aria-label="Chart type"');expect(closed).toContain('aria-haspopup="menu"');expect(closed).not.toContain('<select');expect(closed).toContain('title="Line"');
  const open=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{},initialOpen:true}));
  expect(open.match(/role="menuitemradio"/g)).toHaveLength(5);expect(open.match(/role="separator"/g)).toHaveLength(3);
  expect(open).toMatch(/aria-checked="true"[^>]*>.*?Line/);
 });
 it('App uses it in place of the native select',()=>{
  expect(app).not.toContain('<select aria-label="Chart type"');
  expect(app).toMatch(/<ChartTypeMenu value=\{workspace\.chartStyle\} types=\{chartTypes\} onSelect=\{changeChartStyle\}/);
 });
});

describe('gap 17: scroll to the latest bar',()=>{
 it('shows only when the last bar is off the right edge',()=>{
  expect(scrollToLatestVisible({from:0,to:1000},1000,60)).toBe(false);
  expect(scrollToLatestVisible({from:0,to:900},1000,60)).toBe(true);
  expect(scrollToLatestVisible(null,1000,60)).toBe(false);
  expect(scrollToLatestVisible({from:0,to:900},null,60)).toBe(false);
 });
 it('centers so the last bar sits a few bars from the right edge, keeping the span',()=>{
  expect(scrollToLatestCenter({from:0,to:600},10000,60)).toBe(10000+3*60-300);
 });
 it('App renders the button for the active chart',()=>{expect(app).toMatch(/<ScrollToLatestButton chart=\{chart\} lastTime=\{last\?\.time\?\?null\}/);});
});

describe('gap 19: multi-chart grid',()=>{
 it('sync options carry proper labels',()=>{expect(SYNC_LABELS).toEqual({symbol:'Symbol',interval:'Interval',crosshair:'Crosshair',time:'Time',dateRange:'Date range',drawings:'Drawings'});expect(grid).not.toContain("name==='dateRange'?'date range':name");});
 it('Alt+Enter maximizes or restores the active chart',()=>{
  expect(isMaximizeChord({key:'Enter',altKey:true,ctrlKey:false,metaKey:false,shiftKey:false})).toBe(true);
  expect(isMaximizeChord({key:'Enter',altKey:false,ctrlKey:false,metaKey:false,shiftKey:false})).toBe(false);
  expect(isMaximizeChord({key:'Enter',altKey:true,ctrlKey:true,metaKey:false,shiftKey:false})).toBe(false);
  expect(grid).toMatch(/onKeyDown=\{event=>\{if\(!isMaximizeChord\(event\)/);
 });
 it('the layout picker is a tile group and the single-chart strip is gone',()=>{
  expect(grid).toMatch(/role="radiogroup" aria-label="Chart layout"/);expect(grid).not.toContain('<select aria-label="Chart layout"');
  expect(layoutTileStyle({columns:3,rows:1})).toMatchObject({gridTemplateColumns:'repeat(3,1fr)',gridTemplateRows:'repeat(1,1fr)'});
  // The strip is no longer hidden by a CSS selector (which would also hide the chart once the strip is absent): it is not rendered on a single chart.
  expect(css).not.toContain('div:only-child>div:first-child{display:none');expect(grid).toContain('<div className="lv-grid-strip" hidden={!gridStripVisible(props.state.layout.cells.length)}');
  expect(app).toContain('[aria-label="Chart layout"] input:checked');
 });
});

describe('gap 20: layout dropdown',()=>{
 const dataset=fixtureDataset('GME',20),gridState=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const saved=prepareLayoutSave(createLayoutLibrary(gridState),gridState,1000);
 const ids=(()=>{let n=0;return()=>'swing-'+(n++);})(),two=duplicateSavedLayout(saved,gridState,gridState,'Swing',2000,ids).library;
 const library={...favoriteSavedLayout(two,'swing-0'),autosave:false};
 const render=(state:LayoutMenuState|null,extra:Partial<Parameters<typeof layoutMenuView>[0]>={})=>{const calls:any[]=[];const tree=layoutMenuView({library,grid:gridState,state,onState:next=>calls.push(['state',next]),onAction:async action=>{calls.push(['action',action]);},onOpenLibrary:()=>calls.push(['library']),onError:message=>calls.push(['error',message]),...extra});return{tree,calls};};
 it('lists other layouts, favorites first',()=>{const entries=layoutMenuEntries(library);expect(entries.map(row=>row.name)).toEqual(['Swing']);});
 // Search, checked current layout, hover star/rename/delete.
 it('rows include the active layout (checked), favorites first, and the search box filters',()=>{
  expect(layoutMenuRows(library,'').map(row=>row.name)[0]).toBe('Swing');expect(layoutMenuRows(library,'').length).toBe(2);expect(layoutMenuRows(library,'swi').map(row=>row.name)).toEqual(['Swing']);expect(layoutMenuRows(library,'zzz')).toEqual([]);
  const {tree,calls}=render({open:true});const active=find(tree,node=>node.props?.['aria-current']==='true');expect(text(active)).toContain('✓');
  const search=find(tree,node=>node.props?.['aria-label']==='Search layouts');search.props.onChange({target:{value:'swi'}});expect(calls).toContainEqual(['state',expect.objectContaining({query:'swi'})]);
  expect(findAll(render({open:true,query:'zzz'}).tree,node=>node.props?.role==='status').length).toBe(1);
 });
 it('row buttons: star sends a favorite action and keeps the menu open, rename targets that row, delete asks first',async()=>{
  const {tree,calls}=render({open:true});await find(tree,node=>node.props?.['aria-label']==='Unfavorite Swing').props.onClick();
  expect(calls).toContainEqual(['action',{kind:'favorite',id:'swing-0'}]);expect(calls.some(call=>call[0]==='state')).toBe(false);
  find(tree,node=>node.props?.['aria-label']==='Rename Swing').props.onClick();expect(calls.find(call=>call[0]==='state')[1]).toMatchObject({naming:{kind:'rename',id:'swing-0',name:'Swing'}});
  find(tree,node=>node.props?.['aria-label']==='Delete Swing').props.onClick();expect(calls.filter(call=>call[0]==='state')[1][1]).toMatchObject({removing:'swing-0'});expect(calls.some(call=>call[0]==='action'&&call[1].kind==='delete')).toBe(false);
  const confirm=render({open:true,removing:'swing-0'});await find(confirm.tree,node=>text(node)==='Delete layout'&&node.type==='button').props.onClick();expect(confirm.calls).toContainEqual(['action',{kind:'delete',id:'swing-0'}]);
  const named=render({open:true,naming:{kind:'rename',name:'Swing 2',id:'swing-0'}});await find(named.tree,node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{}});expect(named.calls).toContainEqual(['action',{kind:'rename',id:'swing-0',name:'Swing 2'}]);
 });
 it('offers Save, Make a copy, Rename, Create new layout, Autosave and Open layout',()=>{
  const {tree}=render({open:true});const labels=findAll(tree,node=>node.props?.role==='menuitem'||node.props?.role==='menuitemcheckbox').map(node=>node.props['aria-label']??text(node));
  expect(labels).toEqual(expect.arrayContaining(['Save layout','Make a copy','Rename','Create new layout','Autosave','Open layouts','Swing']));
 });
 it('Open layout opens the library dialog even while the menu is closed',()=>{const {tree,calls}=render(null);const open=find(tree,node=>node.props?.['aria-label']==='Open layouts');open.props.onClick();expect(calls).toContainEqual(['library']);});
 it('Rename asks for a name inline and sends one rename action',async()=>{
  const first=render({open:true});find(first.tree,node=>node.props?.['aria-label']==='Rename').props.onClick();
  const naming=first.calls.find(call=>call[0]==='state')[1];expect(naming).toMatchObject({open:true,naming:{kind:'rename'}});
  const second=render({...naming,naming:{...naming.naming,name:'Day trading'}});
  await find(second.tree,node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{}});
  expect(second.calls).toContainEqual(['action',{kind:'rename',id:library.activeId,name:'Day trading'}]);
 });
 it('opening another layout with unsaved changes asks first',async()=>{
  const dirty={...gridState,presetId:'two-columns'} as typeof gridState;
  const first=render({open:true},{grid:dirty});await find(first.tree,node=>node.props?.['aria-label']==='Swing').props.onClick();
  expect(first.calls.some(call=>call[0]==='action')).toBe(false);expect(first.calls.find(call=>call[0]==='state')[1]).toMatchObject({decision:{kind:'open',id:'swing-0'}});
 });
 it('App: the name button opens the dropdown; Open layouts stays reachable',()=>{
  expect(app).toMatch(/aria-label="Manage layouts"[^>]*aria-haspopup="menu"/);
  expect(app).toContain('layoutMenuView({library:workspace.layoutLibrary,grid:workspace.grid,state:layoutMenu,');
  expect(app).toContain("onOpenLibrary:()=>{setLayoutMenu(null);setDialog('layouts');}");
 });
});
