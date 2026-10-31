import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BUILT_IN_CHART_MENU_ACTIONS,CHART_MENU_COMMANDS,chartMenuEntries} from '../../src/ui/ChartContextMenu';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';
import {NeedsLiveMenu,needsLiveCellAt,needsLiveMenuRows,LOAD_EXAMPLE,OPEN_DATA_SOURCES} from '../../src/ui/NeedsLiveData';

// The chart menu's added rows (symbol, app commands) and the reduced menu of an empty chart.
function snapshot(entity:unknown={kind:'chart'},point:unknown={price:99.5,barTime:1700000000,unit:'price',pane:{kind:'price'}}){
 return{entity,point,cellId:'cell',instrument:{symbol:'GME',tickSize:0.01},controller:{contextMenu:{isCurrent:()=>true,handoff:()=>({release(){}})}}} as unknown as ChartMenuSnapshot;
}
const yes=()=>true;
const every=(names:readonly string[]):ChartContextActions=>Object.fromEntries(names.map(name=>[name,yes]));
const em=/—/;

describe('chart menu rows',()=>{
 it('offers the app commands through one command action, each row naming its command',()=>{
  const rows=chartMenuEntries(snapshot(),every(['command']));
  expect(rows.map(row=>[row.label,row.item,row.hint])).toEqual([
   ['Compare symbol…','compare',undefined],['Symbol info','symbol-info',undefined],
   ['Bar replay','replay',undefined],['Data window','data-window','Alt + D'],
   ['Hide or show all drawings','hide-drawings','Ctrl + Alt + H']]);
  expect(rows.map(row=>row.item)).toEqual([...CHART_MENU_COMMANDS]);
  expect(chartMenuEntries(snapshot(),{}).some(row=>row.action==='command'),'no host command handler: no command rows').toBe(false);
 });
 it('puts the clicked-price rows first and Settings last, with the existing shortcuts shown',()=>{
  const rows=chartMenuEntries(snapshot(),every(['price-alert','hline','copy-price','copy-symbol','watchlist-add','note','indicator','interval','date','reset-view','objects','png-save','theme','command']));
  expect(rows.map(row=>row.label)).toEqual(['Add alert at 99.50','Draw horizontal line at 99.50','Copy price 99.50','Copy symbol GME','Add GME to watchlist','Compare symbol…','Symbol info','Instrument note','Add indicator','Change interval','Go to date','Bar replay','Data window','Reset chart view','Drawing objects','Hide or show all drawings','Save chart image','Settings…']);
  const hint=(label:string)=>rows.find(row=>row.label===label)?.hint;
  expect([hint('Add alert at 99.50'),hint('Draw horizontal line at 99.50'),hint('Add GME to watchlist'),hint('Instrument note'),hint('Go to date'),hint('Reset chart view'),hint('Save chart image')]).toEqual(['Alt + A','Alt + H','Alt + W','Alt + N','Alt + G','Alt + R','Ctrl + Alt + S']);
  const groups=rows.map(row=>row.group);expect(groups).toEqual([...groups].sort((a,b)=>(a??0)-(b??0)));
  expect(rows.every(row=>!em.test(row.label))).toBe(true);
 });
 it('the menu copies the symbol itself; a host handler of the same name wins',()=>{
  expect(typeof BUILT_IN_CHART_MENU_ACTIONS['copy-symbol']).toBe('function');
  expect(chartMenuEntries({...snapshot(),instrument:{symbol:''}} as unknown as ChartMenuSnapshot,every(['copy-symbol'])).map(row=>row.label)).toEqual([]);
 });
});

describe('the empty chart (needs live data) menu',()=>{
 it('leads with the card actions, then the chart commands when the host runs them',()=>{
  expect(needsLiveMenuRows({symbol:'GME',liveReady:false,example:false},{commands:false}).map(row=>row.label)).toEqual([LOAD_EXAMPLE,OPEN_DATA_SOURCES]);
  expect(needsLiveMenuRows({symbol:'GME',liveReady:true,example:true},{commands:true}).map(row=>[row.id,row.label,row.group])).toEqual([
   ['live','Show live GME',0],['sources',OPEN_DATA_SOURCES,0],['symbol-search','Change symbol…',1],['change-interval','Change interval',1],['open-layouts','Open layouts',1],['chart-settings','Chart settings…',2]]);
 });
 it('finds the empty cell under the pointer from the measured boxes',()=>{
  const boxes={a:{left:0,top:0,width:100,height:50},b:{left:100,top:0,width:100,height:50}};
  expect(needsLiveCellAt(boxes,{left:10,top:20},15,25)).toBe('a');
  expect(needsLiveCellAt(boxes,{left:10,top:20},150,60)).toBe('b');
  expect(needsLiveCellAt(boxes,{left:10,top:20},150,90)).toBeNull();
 });
 it('renders as a chart context menu with separators between groups and shortcut hints',()=>{
  const html=renderToStaticMarkup(React.createElement(NeedsLiveMenu,{rows:needsLiveMenuRows({symbol:'GME',liveReady:false,example:false},{commands:true}),at:{x:10,y:20},onRun(){},onClose(){}}));
  expect(html).toContain('role="menu"');expect(html).toContain('data-lv-context-menu="true"');
  expect(html.match(/role="separator"/g)).toHaveLength(2);
  expect(html).toContain('aria-keyshortcuts=","');expect(em.test(html)).toBe(false);
 });
});
