import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartTypeMenu,favoriteChartTypes,readChartTypeFavorites,CHART_TYPE_FAVORITES_KEY} from '../../src/ui/ChartTypeMenu';
import {chartSettingsSchema} from '../../src/chart/chart-settings';
import {CHART_TYPES} from '../../src/chart/chart-types';
// Chart type favorites (reference rows carry an Add to favorites star; favorites show as header buttons)
// and Symbol tab label fixes. Pure model + static markup; no executable UI evidence.
const types=[{value:'candles',label:'Candles'},{value:'line',label:'Line'},{value:'renko',label:'Renko'},{value:'footprint',label:'Volume footprint',disabled:true,reason:'No data.'}];
function memory(initial?:string){const store=new Map<string,string>();if(initial!==undefined)store.set(CHART_TYPE_FAVORITES_KEY,initial);return{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);},store};}
describe('chart type favorites',()=>{
 it('reads only a clean list of type ids and survives broken or blocked storage',()=>{
  expect(readChartTypeFavorites(memory('["renko","line","renko",3,""]'))).toEqual(['renko','line']);
  expect(readChartTypeFavorites(memory('{oops'))).toEqual([]);expect(readChartTypeFavorites(memory('{"a":1}'))).toEqual([]);
  expect(readChartTypeFavorites({getItem:()=>{throw Error('blocked');}})).toEqual([]);expect(readChartTypeFavorites(null)).toEqual([]);
  // The key is legacy now (read once while the workspace has no list); nothing writes it any more.
 });
 it('lists favorites in menu order and drops unknown or disabled types',()=>{
  expect(favoriteChartTypes(types,['renko','candles','footprint','gone']).map(row=>row.value)).toEqual(['candles','renko']);
 });
 it('every enabled menu row has a favorites star; a disabled row has none',()=>{
  const open=renderToStaticMarkup(React.createElement(ChartTypeMenu,{value:'line',types,onSelect:()=>{},initialOpen:true}));
  expect(open.match(/aria-label="Add to favorites [^"]+"/g)).toEqual(['aria-label="Add to favorites Candles"','aria-label="Add to favorites Line"','aria-label="Add to favorites Renko"']);
  expect(open).not.toContain('Add to favorites Volume footprint');expect(open).toContain('aria-label="Chart type"');
 });
});
describe('Symbol tab labels',()=>{
 const labels=(style:string)=>chartSettingsSchema(style).fields.map((row:{label:string})=>row.label);
 it('HLC area rows start upper case and Line break says Number of lines',()=>{
  expect(labels('hlcarea')).toEqual(expect.arrayContaining(['High line color','Low line thickness','Close line opacity']));
  expect(labels('hlcarea').every(label=>label[0]===label[0].toUpperCase())).toBe(true);
  expect(labels('linebreak')[0]).toBe('Number of lines');
 });
 it('Point & figure uses the reference menu wording',()=>{expect(CHART_TYPES.find(row=>row[0]==='pointfigure')?.[1]).toBe('Point & figure');});
});
