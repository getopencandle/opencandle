// The one typed list of workspace commands. The main menu and Quick search (Ctrl+K) both
// read it, so a command is named once: its id, its label and the words it is found by. App supplies what each id runs
// (CommandRuns); a command with no runner in a window is neither offered in the palette nor shown in the menu.
// Hotkeys are never written here: `shortcut` names a row of the generated Keyboard shortcuts list (keyboard-shortcuts.ts),
// and the palette reads the keys from that list, so a binding change shows up without editing this file.
// Grouping, labels and keywords are our own choice.

export type AppCommandId=
 |'about'|'import-data'|'export-workspace'|'export-bars'|'export-image'|'copy-image'|'data-sources'|'local-storage'|'quit'
 |'symbol-search'|'compare'|'symbol-info'|'indicators'|'indicator-templates'|'create-alert'|'replay'|'undo'|'redo'
 |'save-layout'|'open-layouts'|'chart-settings'|'app-settings'|'fullscreen'|'go-to-date'|'change-interval'|'keyboard-shortcuts'
 |'watchlist'|'object-tree'|'data-window'|'alerts-panel'|'paper-trading'|'screener'|'script-editor'|'calendar'|'news'
 |'fundamentals'|'heatmap'|'portfolio'|'markets'|'strategy'|'notes'|'add-to-watchlist'|'reset-chart-view'|'reset-time-scale'|'table-view'
 |'drawing-manager'|'wick-mode';

export type CommandGroup='General'|'Chart'|'Panels'|'Data';
export interface AppCommand{
 readonly id:AppCommandId;readonly label:string;readonly group:CommandGroup;
 /** Other words the palette matches (never shown). */
 readonly keywords?:readonly string[];
 /** The `action` of a generated Keyboard shortcuts row; the palette shows that row's keys. */
 readonly shortcut?:string;
}
const command=(id:AppCommandId,label:string,group:CommandGroup,keywords:readonly string[]=[],shortcut?:string):AppCommand=>Object.freeze({id,label,group,keywords:Object.freeze([...keywords]),...(shortcut?{shortcut}:{})});

export const APP_COMMANDS:readonly AppCommand[]=Object.freeze([
 command('symbol-search','Symbol search','Chart',['find symbol','ticker','instrument','open symbol']),
 command('compare','Compare or add symbol','Chart',['overlay','second symbol','spread']),
 command('symbol-info','Symbol info','Chart',['instrument details','tick size','session']),
 command('indicators','Indicators','Chart',['add indicator','studies','strategies'],'Indicators'),
 command('indicator-templates','Indicator templates','Chart',['study templates','saved indicators']),
 command('create-alert','Create alert','Chart',['add alert','price alert','notification'],'Create an alert'),
 command('replay','Bar replay','Chart',['replay','playback','history']),
 command('go-to-date','Go to date','Chart',['jump','navigate','calendar date'],'Go to date'),
 command('change-interval','Change interval','Chart',['timeframe','resolution','intervals dialog']),
 command('reset-chart-view','Reset chart view','Chart',['reset scale','auto fit','restore view'],'Reset the chart view'),
 command('reset-time-scale','Reset the time scale','Chart',['scroll to latest','time axis'],'Reset the time scale'),
 command('table-view','Table view','Chart',['bar table','data table','ohlc table','data window']),
 command('notes','Instrument note','Chart',['notes','text note'],'Open notes for the symbol'),
 command('add-to-watchlist','Add the symbol to the watchlist','Chart',['watch','favorite symbol'],'Add the symbol to the watchlist'),
 command('copy-image','Copy chart image','Chart',['snapshot','screenshot','clipboard','picture'],'Copy the chart image'),
 command('export-image','Export image','Data',['save chart image','snapshot','screenshot','png','download image'],'Save the chart image'),
 command('drawing-manager','Manage drawings','Chart',['drawings list','object tree drawings','remove drawings']),
 command('undo','Undo','General',[],'Undo'),
 command('redo','Redo','General',[],'Redo'),
 command('save-layout','Save the layout','General',['save','layout'],'Save the layout'),
 command('open-layouts','Open layouts','General',['layout library','saved layouts','load layout'],'Open layouts'),
 command('chart-settings','Chart settings','General',['settings','appearance','properties','preferences']),
 command('app-settings','Settings','General',['preferences','general','app settings','options','data sources','chart settings']),
 command('fullscreen','Fullscreen','General',['full screen','maximize'],'Fullscreen'),
 // Shrink to the always-on-top row of tabs (desktop main window only).
 command('wick-mode','Wick mode','General',['ticker','mini window','compact','always on top','tab strip','small window','watch quotes'],'Wick mode'),
 command('keyboard-shortcuts','Keyboard shortcuts','General',['hotkeys','keys','help'],'Keyboard shortcuts'),
 command('about','About OpenCandle','General',['version','license','help']),
 command('watchlist','Watchlist','Panels',['symbols list','watch list']),
 command('object-tree','Object tree','Panels',['objects','drawings tree','indicators tree']),
 command('data-window','Data window','Panels',['values','crosshair values','ohlc']),
 command('alerts-panel','Alerts','Panels',['alert manager','alerts list','alert log']),
 command('paper-trading','Paper trading','Panels',['virtual trading','orders','positions','account']),
 command('screener','Stock screener','Panels',['scan','filter stocks']),
 command('script-editor','Script editor','Panels',['script','code','lvscript','pine']),
 command('calendar','Calendar','Panels',['economic calendar','earnings calendar','dividends calendar']),
 command('news','News and filings','Panels',['headlines','sec filings']),
 command('fundamentals','Fundamentals','Panels',['financials','financial statements','metrics']),
 command('heatmap','Heatmap','Panels',['market map','sectors']),
 command('portfolio','Portfolio','Panels',['holdings','transactions','performance']),
 command('markets','Markets','Panels',['gainers','losers','breadth','seasonals']),
 command('strategy','Strategy tester','Panels',['backtest','strategy report']),
 command('import-data','Import data','Data',['csv import','open file','load bars']),
 command('export-workspace','Export workspace','Data',['backup','export settings']),
 command('export-bars','Export bars','Data',['csv','export data']),
 command('data-sources','Data sources','Data',['alpaca','market data','api key','live data']),
 command('local-storage','Local storage','Data',['storage','cache','disk']),
 command('quit','Quit OpenCandle','General',['exit','close app']),
]);
const BY_ID=new Map(APP_COMMANDS.map(row=>[row.id,row]));
export function appCommand(id:AppCommandId):AppCommand{const row=BY_ID.get(id);if(!row)throw new Error('Unknown command: '+id);return row;}

/** The main menu, in order (two separators after About keep the menu as it was). Quit is added only where the app can quit,
 * Wick mode only in the desktop main window. */
export const MAIN_MENU_LAYOUT:readonly (AppCommandId|'separator')[]=Object.freeze(['about','separator','separator','import-data','export-workspace','export-bars','export-image','separator','data-sources','local-storage','separator','wick-mode','separator','quit']);

/** What App runs for each command it offers in this window. `disabled` keeps a menu row visible but unusable. */
export interface CommandRun{run:()=>void;disabled?:boolean}
export type CommandRuns=Partial<Record<AppCommandId,CommandRun>>;
export interface CommandMenuRow{id:AppCommandId;label:string;disabled:boolean;onSelect:()=>void}

/** Menu rows from a layout: rows without a runner are left out, separators never lead, trail or repeat after a gap
 * (except the leading pair the main menu has always had, which shellMenu renders as one divider). */
export function commandMenuRows(layout:readonly (AppCommandId|'separator')[],runs:CommandRuns):(CommandMenuRow|'separator')[]{
 const out:(CommandMenuRow|'separator')[]=[];let pendingSeparators=0;
 for(const entry of layout){
  if(entry==='separator'){if(out.length)pendingSeparators++;continue;}
  const run=runs[entry];if(!run)continue;
  for(;pendingSeparators>0;pendingSeparators--)out.push('separator');
  out.push({id:entry,label:appCommand(entry).label,disabled:!!run.disabled,onSelect:run.run});
 }
 return out;
}
