import {describe,expect,it,vi} from 'vitest';
import {APP_COMMANDS,MAIN_MENU_LAYOUT,commandMenuRows,type CommandRuns} from '../../src/ui/command-registry';
import {keyboardShortcutRows} from '../../src/ui/keyboard-shortcuts';
import {classifyWorkspaceKey,handleWorkspaceKey,type FocusContext} from '../../src/ui/shortcut-dispatch';
import {symbolEntryFromKey,buildSymbolSearchCandidates} from '../../src/ui/symbol-search';
import {QUICK_SEARCH_RECENT_KEY,quickSearchIndex,quickSearchScore,quickSearchView,readQuickSearchRecent,rememberQuickSearch,stepQuickSearch,type QuickSearchSources} from '../../src/ui/quick-search-model';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {chartMenuEntries,copyPriceText} from '../../src/ui/ChartContextMenu';
import {createCursorTimeLockStore,CURSOR_LOCK_LABEL,CURSOR_UNLOCK_LABEL} from '../../src/ui/cursor-time-lock';
import {copyPlainText} from '../../src/ui/text-clipboard';
import {buildTableView} from '../../src/ui/table-view-model';
import {ALERT_SOUND_OFF,alertSoundGain,createAlertSoundPlayer,type AlertAudioContextLike} from '../../src/ui/alert-sound';
import {paperLineSegment} from '../../src/ui/PaperChartLines';
import {factoryAppearance,factoryPriceScale,findRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {settingsDefaults} from '../../src/chart/chart-settings';
import {runNavigation,NAV_ZOOM_FACTOR,NAV_PAN_FRACTION} from '../../src/ui/ChartNavigationButtons';
import {lockedLineGeometry} from '../../src/ui/LockedTimeLine';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';

const ctx:FocusContext={editable:false,composing:false,dialogOpen:false,menuOpen:false,dropdownOpen:false,chartFocus:true,loaded:true,placementActive:false,toolArmed:false,selectedDrawings:0,hasSelection:false};
const key=(k:string,mods:Partial<{ctrlKey:boolean;altKey:boolean;shiftKey:boolean;metaKey:boolean;repeat:boolean}>={})=>({key:k,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,code:/^[a-z]$/i.test(k)?'Key'+k.toUpperCase():undefined,...mods});

describe(' command registry',()=>{
 it('names each command once, and every hotkey it cites is a generated shortcut row',()=>{
  expect(new Set(APP_COMMANDS.map(row=>row.id)).size).toBe(APP_COMMANDS.length);
  const actions=new Set(keyboardShortcutRows().map(row=>row.action));
  for(const row of APP_COMMANDS)if(row.shortcut)expect(actions.has(row.shortcut),row.id+' cites '+row.shortcut).toBe(true);
 });
 it('builds the main menu from the registry: missing runners leave, separators never lead or trail',()=>{
  const run=()=>{},runs:CommandRuns=Object.fromEntries(MAIN_MENU_LAYOUT.filter(id=>id!=='separator'&&id!=='quit').map(id=>[id,{run}]));
  const rows=commandMenuRows(MAIN_MENU_LAYOUT,runs);
  expect(rows.map(row=>row==='separator'?'-':row.label)).toEqual(['About OpenCandle','-','-','Import data','Export workspace','Export bars','Export image','-','Data sources','Local storage','-','Wick mode']);
  expect(commandMenuRows(MAIN_MENU_LAYOUT,{...runs,quit:{run}}).map(row=>row==='separator'?'-':row.label).slice(-2)).toEqual(['-','Quit OpenCandle']);
  expect(commandMenuRows(['separator','about','separator'],{about:{run,disabled:true}})).toEqual([{id:'about',label:'About OpenCandle',disabled:true,onSelect:run}]);
 });
});

describe(' keys',()=>{
 it('Ctrl+K is Quick search, Alt+S copies and Ctrl+Alt+S saves the chart image, Ctrl+S still saves the layout',()=>{
  expect(classifyWorkspaceKey(key('k',{ctrlKey:true}),ctx)).toEqual({command:'quick-search'});
  expect(classifyWorkspaceKey(key('K',{metaKey:true}),ctx)).toEqual({command:'quick-search'});
  expect(classifyWorkspaceKey(key('k',{ctrlKey:true,repeat:true}),ctx)).toEqual({command:'none'});
  expect(classifyWorkspaceKey(key('s',{altKey:true}),ctx)).toEqual({command:'snapshot',mode:'copy'});
  expect(classifyWorkspaceKey(key('s',{ctrlKey:true,altKey:true}),ctx)).toEqual({command:'snapshot',mode:'save'});
  expect(classifyWorkspaceKey(key('s',{ctrlKey:true}),ctx)).toEqual({command:'save'});
  expect(classifyWorkspaceKey(key('s',{altKey:true}),{...ctx,loaded:false})).toEqual({command:'none'});
  expect(classifyWorkspaceKey(key('k',{ctrlKey:true}),{...ctx,editable:true})).toEqual({command:'none'});
  expect(symbolEntryFromKey(key('k',{ctrlKey:true}),false)).toBeNull();
  const rows=keyboardShortcutRows(),keys=(action:string)=>rows.find(row=>row.action===action)?.keys;
  expect(keys('Quick search')).toEqual(['Ctrl+K']);expect(keys('Copy the chart image')).toEqual(['Alt+S','Ctrl+Shift+S']);expect(keys('Save the chart image')).toEqual(['Ctrl+Alt+S']);
  const event={...key('s',{altKey:true}),preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()},snapshot=vi.fn();
  expect(handleWorkspaceKey(event,ctx,{save(){},undo(){},redo(){},openLayouts(){},intervalEntry(){},fullscreen(){},indicators(){},disarmTool(){},clearSelection(){},snapshot})).toBe('handled');expect(snapshot).toHaveBeenCalledWith('copy');
 });
});

const sources=(over:Partial<QuickSearchSources>={}):QuickSearchSources=>({runs:{indicators:{run(){}},'copy-image':{run(){}},'chart-settings':{run(){}},'export-image':{run(){},disabled:true}},shortcuts:keyboardShortcutRows(),indicators:[{id:'rsi',name:'Relative Strength Index',acronym:'RSI'},{id:'sma',name:'Simple Moving Average',acronym:'SMA'}],drawings:DRAWING_TOOL_CATALOG,intervals:['1m','5m','60m','1D'],currentInterval:'5m',chartTypes:[{value:'candles',label:'Candles'},{value:'line',label:'Line'}],currentChartType:'candles',layouts:[{id:'a',name:'GME day',active:true},{id:'b',name:'SPY swing',active:false}],...over});
describe(' Quick search model',()=>{
 it('indexes every source and leaves out commands the window cannot run',()=>{
  const index=quickSearchIndex(sources()),ids=new Set(index.map(row=>row.id));
  for(const id of ['command:indicators','command:copy-image','indicator:rsi','drawing:tool:trendline','interval:60m','chart-type:line','layout:b','settings:tab:canvas'])expect(ids.has(id),id).toBe(true);
  expect(ids.has('command:export-image')).toBe(false);expect(ids.has('command:about')).toBe(false);
  expect(index.find(row=>row.id==='command:copy-image')?.hotkey).toBe('Alt+S, Ctrl+Shift+S');
  expect(index.find(row=>row.id==='interval:60m')?.label).toBe('1 hour');
  expect(index.filter(row=>row.category==='Drawings').length).toBeGreaterThan(20);
  expect(index.find(row=>row.id==='settings:canvas.navButtons')).toMatchObject({label:'Navigation',detail:'Chart settings · Canvas · Buttons',run:{kind:'settings',tab:'canvas'}});
 });
 it('finds by label words, acronyms and keywords, grouped in category order',()=>{
  const index=quickSearchIndex(sources()),view=(query:string,filter:'All'|'Indicators'='All')=>quickSearchView(index,{query,filter,recent:[],candidates:[]});
  expect(view('rsi').items[0]?.id).toBe('indicator:rsi');expect(view('rsi').sections.map(section=>section.title).at(-1)).toBe('Symbols');
  expect(view('trend line').sections.map(section=>section.title)).toContain('Drawings');
  expect(view('snapshot').items.map(row=>row.id)).toContain('command:copy-image');
  expect(view('navigation buttons').items[0]?.id).toBe('settings:canvas.navButtons');expect(view('vertical grid').items[0]?.id).toBe('settings:canvas.vertGridLines');
  expect(view('zzzz').items.map(row=>row.run.kind)).toEqual(['symbol-search']);expect(view('zzzz','Indicators').empty).toBe('no-match');
  expect(view('moving','Indicators').items.map(row=>row.id)).toEqual(['indicator:sma']);
  expect(quickSearchScore({label:'Candles',keywords:[]},'candles')).toBeGreaterThan(quickSearchScore({label:'Hollow candles',keywords:[]},'candles'));
 });
 it('shows openable symbols plus a Symbol search row; recents come first and survive blocked storage',()=>{
  const candidates=buildSymbolSearchCandidates([fixtureDataset('GME',3),fixtureDataset('SPY',3)],[]).map(row=>({...row,openable:true,unavailableReason:null})),index=quickSearchIndex(sources());
  const typed=quickSearchView(index,{query:'gme',filter:'All',recent:[],candidates});
  expect(typed.sections[0]!.title).toBe('Symbols');expect(typed.sections[0]!.items[0]!.label).toBe('GME');expect(typed.sections[0]!.items.at(-1)!.run).toEqual({kind:'symbol-search',query:'gme'});
  const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
  rememberQuickSearch(storage,typed.sections[0]!.items[0]!);rememberQuickSearch(storage,index.find(row=>row.id==='indicator:rsi')!);
  expect(readQuickSearchRecent(storage)).toEqual(['indicator:rsi','symbol:GME']);
  const empty=quickSearchView(index,{query:'',filter:'All',recent:readQuickSearchRecent(storage),candidates});
  expect(empty.sections.map(section=>section.title)).toEqual(['Recent','Actions']);expect(empty.sections[0]!.items.map(row=>row.label)).toEqual(['Relative Strength Index','GME']);
  store.set(QUICK_SEARCH_RECENT_KEY,'{bad');expect(readQuickSearchRecent(storage)).toEqual([]);
  expect(readQuickSearchRecent({getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}})).toEqual([]);
  expect(()=>rememberQuickSearch({getItem:()=>null,setItem:()=>{throw new Error('blocked');}},{recentKey:'indicator:rsi'})).not.toThrow();
 });
 it('steps the highlight with wraparound and page keys',()=>{
  expect(stepQuickSearch(0,0,'ArrowDown')).toBeNull();expect(stepQuickSearch(3,2,'ArrowDown')).toBe(0);expect(stepQuickSearch(3,0,'ArrowUp')).toBe(2);
  expect(stepQuickSearch(20,0,'PageDown')).toBe(8);expect(stepQuickSearch(20,3,'PageUp')).toBe(0);expect(stepQuickSearch(5,1,'End')).toBe(4);expect(stepQuickSearch(5,3,'Home')).toBe(0);
 });
});

function menuSnapshot(point:Partial<ChartMenuSnapshot['point']>={}){return{cellId:'cell-1',entity:{kind:'chart'},instrument:{symbol:'GME',tickSize:0.01},point:{price:23.456,logical:4,barIndex:4,barTime:1_700_000_000,unit:'price',pane:'price',...point},controller:{contextMenu:{isCurrent:()=>true}},input:{bars:[]}} as unknown as ChartMenuSnapshot;}
describe(' chart menu rows',()=>{
 const actions:ChartContextActions={'copy-price':()=>true,'cursor-lock':()=>true,'table-view':()=>true};
 it('Copy price shows the clicked price at the symbol tick; no row on an indicator pane or without a handler',()=>{
  expect(copyPriceText(menuSnapshot())).toBe('23.46');
  const labels=(snapshot:ChartMenuSnapshot,own=actions,store=createCursorTimeLockStore())=>chartMenuEntries(snapshot,own,null,undefined,store).map(row=>row.label);
  expect(labels(menuSnapshot())).toEqual(['Copy price 23.46',CURSOR_LOCK_LABEL,'Table view']);
  expect(labels(menuSnapshot({unit:'indicator'}))).not.toContain('Copy price 23.46');
  expect(labels(menuSnapshot({price:null,barTime:null}))).toEqual(['Table view']);
  expect(labels(menuSnapshot(),{})).toEqual([]);
 });
 it('the lock row toggles to Unlock for the locked chart only',()=>{
  const store=createCursorTimeLockStore(),listener=vi.fn();store.subscribe(listener);
  expect(store.toggle('cell-1',1_700_000_000)).toEqual({cellId:'cell-1',time:1_700_000_000});expect(listener).toHaveBeenCalledTimes(1);
  expect(chartMenuEntries(menuSnapshot(),actions,null,undefined,store).map(row=>row.label)).toContain(CURSOR_UNLOCK_LABEL);
  expect(chartMenuEntries({...menuSnapshot(),cellId:'cell-2'} as ChartMenuSnapshot,actions,null,undefined,store).map(row=>row.label)).toContain(CURSOR_LOCK_LABEL);
  expect(store.toggle('cell-1',null)).toBeNull();expect(store.get()).toBeNull();
  expect(()=>store.toggle('cell-1',null)).toThrow('Point at a bar');
  expect(lockedLineGeometry(1,{left:10,top:20,width:100,height:50},60.4)).toEqual({x:60,top:20,height:50});expect(lockedLineGeometry(1,{left:10,top:20,width:100,height:50},200)).toBeNull();
 });
 it('copies text through the document copy command, then the Clipboard API, and says when neither worked',async()=>{
  const area={value:'',setAttribute(){},style:{},select:vi.fn()} as unknown as HTMLTextAreaElement;
  const body={appendChild:vi.fn(),removeChild:vi.fn()};
  expect(await copyPlainText('23.46',{document:{createElement:()=>area,body,execCommand:()=>true}})).toEqual({ok:true,message:'Copied 23.46.'});expect(area.value).toBe('23.46');expect(body.removeChild).toHaveBeenCalledWith(area);
  const writeText=vi.fn(async()=>{});
  expect(await copyPlainText('1.5',{document:{createElement:()=>area,body,execCommand:()=>false},navigator:{clipboard:{writeText}}})).toMatchObject({ok:true});expect(writeText).toHaveBeenCalledWith('1.5');
  expect(await copyPlainText('1.5',{document:null,navigator:{clipboard:{writeText:async()=>{throw new Error('denied');}}}})).toEqual({ok:false,message:'The price could not be copied to the clipboard.'});
 });
});

describe(' Table view',()=>{
 it('lists bars newest first in Data window formatting with indicator columns honouring the offset',()=>{
  const bars=[{time:1_700_000_000,open:10,high:11,low:9,close:10.5,volume:1500},{time:1_700_086_400,open:10.5,high:12,low:10,close:11.25,volume:2_500_000}];
  const view=buildTableView({series:{symbol:'GME',exchange:'NYSE',interval:'1D',description:'',tickSize:0.01},bars,timezone:'UTC',indicators:[{id:'sma-1',kind:'sma',visible:true,offset:1,precision:'auto',plots:[{id:'sma',label:'SMA',color:'#f00',dataWindow:true,values:[10.25,10.875]}]},{id:'hidden',kind:'rsi',visible:false,offset:0,precision:'auto',plots:[{id:'rsi',label:'RSI',color:'#0f0',dataWindow:true,values:[1,2]}]}]});
  expect(view.columns.map(column=>column.label)).toEqual(['Date','Open','High','Low','Close','Change','Vol','SMA']);
  expect(view.rows.map(row=>row.cells.slice(1))).toEqual([['10.50','12.00','10.00','11.25','+0.75 (+7.14%)','2.50 M','10.25'],['10.00','11.00','9.00','10.50','∅','1.50 K','∅']]);
  expect(buildTableView({series:{symbol:'GME',exchange:'',interval:'5m',description:'',tickSize:0.01},bars,timezone:'UTC',indicators:[],limit:1}).rows).toHaveLength(1);
  expect(buildTableView({series:{symbol:'GME',exchange:'',interval:'5m',description:'',tickSize:0.01},bars,timezone:'UTC',indicators:[]}).columns[0]!.label).toBe('Date and time');
 });
});

describe(' chart settings rows made live',()=>{
 it('Alert volume, extended trading lines and navigation buttons are live rows now',()=>{
  const s:ChartSettingsSources={appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style:'line',typeSettings:settingsDefaults('line'),timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true}};
  for(const [tab,key] of [['alerts','alerts.alertVolume'],['trading','trading.extendLeftTradingLine'],['canvas','canvas.navButtons']] as const)expect(findRow(tab,s,key)?.availability,key).toEqual({state:'live'});
 });
 it('alert volume: the default level keeps the old gain, unchecked refuses to claim a sound',async()=>{
  expect(alertSoundGain({enabled:true,level:0.5})).toBeCloseTo(0.18);expect(alertSoundGain({enabled:true,level:1})).toBeCloseTo(0.36);expect(alertSoundGain({enabled:false,level:1})).toBe(0);
  const ramps:number[]=[],context={state:'running',currentTime:0,destination:{},createOscillator:()=>({type:'',frequency:{setValueAtTime(){}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime:(value:number)=>{ramps.push(value);}},connect(){}})} as unknown as AlertAudioContextLike;
  await createAlertSoundPlayer(()=>context,()=>({enabled:true,level:0.25})).play('lv-chime');
  expect(Math.max(...ramps)).toBeCloseTo(0.09);
  await expect(createAlertSoundPlayer(()=>context,()=>({enabled:false,level:0.5})).play('lv-chime')).rejects.toThrow(ALERT_SOUND_OFF);
 });
 it('trading lines: off draws only from the label to the scale',()=>{
  expect(paperLineSegment(true,'right')).toBeNull();expect(paperLineSegment(undefined,'left')).toBeNull();
  expect(paperLineSegment(false,'right')).toEqual({right:0,width:64});expect(paperLineSegment(false,'left')).toEqual({left:64,right:0});expect(paperLineSegment(false,'center')).toEqual({left:'50%',right:0});
 });
 it('navigation buttons run one zoom or pan step, or the reset command',()=>{
  const target={zoom:vi.fn(),pan:vi.fn()},reset=vi.fn();
  runNavigation(target,'zoom-in',reset);runNavigation(target,'zoom-out',reset);runNavigation(target,'scroll-left',reset);runNavigation(target,'scroll-right',reset);runNavigation(target,'reset',reset);
  expect(target.zoom.mock.calls).toEqual([[NAV_ZOOM_FACTOR],[1/NAV_ZOOM_FACTOR]]);expect(target.pan.mock.calls).toEqual([[-NAV_PAN_FRACTION],[NAV_PAN_FRACTION]]);expect(reset).toHaveBeenCalledOnce();
  expect(runNavigation({zoom:()=>{throw new Error('no');},pan(){}},'zoom-in',reset)).toBe(false);expect(runNavigation(null,'zoom-in',reset)).toBe(false);
 });
});
