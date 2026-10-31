import {describe,expect,it} from 'vitest';
import {seriesMoreMenu,seriesPinToScaleItems,seriesWatchlistItems,seriesMetricsItems,seriesMoveToItems,SERIES_MORE_COMMANDS,SERIES_METRICS_COMMANDS,type SeriesAvailability} from '../../src/ui/series-legend-menu';
import {APP_COMMANDS} from '../../src/ui/command-registry';
import {statusLineParts} from '../../src/chart/status-line-model';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';

// The main series More menu model and the Status line Values switch.
// Pure data, SYNTHETIC wording only.
const all:SeriesAvailability={alert:null,order:null,addIndicator:null,symbolInfo:null,metrics:null,copyPrice:null,paste:null,tableView:null,moveTo:null,pinToScale:null,hide:null,watchlist:null,note:null,settings:null};
const labels=(rows:ReturnType<typeof seriesMoreMenu>)=>rows.map(row=>row.kind==='separator'?'-':row.label);

describe(' main series More menu model',()=>{
 it('lists the fact rows in order with separators, the symbol and price in the wording and the hotkeys LV binds',()=>{
  const rows=seriesMoreMenu({symbol:'GME',price:'25.10',hidden:false,availability:all});
  expect(labels(rows)).toEqual(['Add alert on GME at 25.10…','Add order on GME at 25.10…','Add indicator/strategy on GME…','-','Symbol info…','Metrics','-','Copy price 25.10','Paste','-','Table view','-','Move to','Pin to scale (now right)','Hide','-','Add GME to watchlist','Add text note for GME','-','Settings…']);
  const hot=Object.fromEntries(rows.flatMap(row=>row.kind==='item'&&row.hotkey?[[row.id,row.hotkey]]:[]));
  expect(hot).toEqual({alert:'Alt + A',paste:'Ctrl + V',note:'Alt + N'});
 });
 it('leaves out rows with no runner, keeps busy rows disabled with the reason, and tidies separators',()=>{
  const rows=seriesMoreMenu({symbol:'SPY',price:null,hidden:true,mainScaleSide:'left',availability:{alert:'Wait for the chart.',symbolInfo:null,copyPrice:null,hide:null,settings:null}});
  expect(labels(rows)).toEqual(['Add alert on SPY…','-','Symbol info…','-','Copy price','-','Show','-','Settings…']);
  const alert=rows.find(row=>row.kind==='item'&&row.id==='alert');
  expect(alert).toMatchObject({availability:{state:'unavailable',reason:'Wait for the chart.'}});
  expect(rows.find(row=>row.kind==='item'&&row.id==='copyPrice')).toMatchObject({availability:{state:'unavailable',reason:'There is no price to copy yet.'}});
  expect(labels(seriesMoreMenu({symbol:'SPY',price:'1',hidden:false,mainScaleSide:'left',availability:{pinToScale:null}}))).toEqual(['Pin to scale (now left)']);
 });
 it('names only registry commands, so the menu runs the same handlers as the main menu and Quick search',()=>{
  const ids=new Set(APP_COMMANDS.map(row=>row.id));
  for(const command of [...Object.values(SERIES_MORE_COMMANDS),...Object.values(SERIES_METRICS_COMMANDS)])expect(ids.has(command!)).toBe(true);
  expect(SERIES_MORE_COMMANDS).toMatchObject({alert:'create-alert',symbolInfo:'symbol-info',tableView:'table-view',note:'notes',addIndicator:'indicators'});
 });
 it('builds the submenus: pin to scale, move to, metrics and the watchlist lists with Create new list',()=>{
  expect(seriesPinToScaleItems('right').map(item=>[item.id,item.label,!!item.checked,!!item.disabled])).toEqual([['right','Pinned to right scale',true,false],['left','Pin to new left scale',false,false],['none','No scale (fullscreen)',false,true]]);
  expect(seriesPinToScaleItems('left').map(item=>item.label)).toEqual(['Pin to new right scale','Pinned to left scale','No scale (fullscreen)']);
  expect(seriesMoveToItems().every(item=>item.disabled&&item.title)).toBe(true);
  expect(seriesMetricsItems({news:null,financials:'Busy.'})).toEqual([{id:'financials',label:'Financials',disabled:true,title:'Busy.'},{id:'news',label:'News'}]);
  const items=seriesWatchlistItems([{id:'a',name:'Main',kind:'custom'},{id:'flag:red',name:'Red flagged',kind:'flag'},{id:'b',name:'Tech',kind:'custom'}],id=>id==='b');
  expect(items.map(item=>[item.id,item.label,!!item.checked])).toEqual([['list:a','Main',false],['list:b','Tech',true],['create','Create new list…',false]]);
  expect(seriesWatchlistItems([],()=>false,'Full.').at(-1)).toMatchObject({disabled:true,title:'Full.'});
 });
});

describe(' Status line Values switch',()=>{
 it('statusLineParts reports whether indicator values are drawn (absent means shown)',()=>{
  const run=(indicatorValues?:boolean)=>statusLineParts(defaultChartSettingsDocument().statusLine,{symbol:'GME',interval:'1D'},null,null,[],{legendVisible:true,...(indicatorValues===undefined?{}:{indicatorValues})}).indicators.values;
  expect(run()).toBe(true);expect(run(true)).toBe(true);expect(run(false)).toBe(false);
 });
});
