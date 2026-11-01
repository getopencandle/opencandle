import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {performance} from 'node:perf_hooks';
import {buildTableView,tableViewModel,tableViewTimeText} from '../../src/ui/table-view-model';
import {formatDataWindowDate,formatDataWindowTime,type DataWindowIndicatorInput} from '../../src/ui/data-window-model';

vi.mock('../../src/ui/Modal',()=>({Modal:({children}:{children:React.ReactNode})=>React.createElement('div',null,children)}));

// SYNTHETIC 1-minute bars and studies.
const T=1761955200;// 2025-11-01 00:00 UTC
const bars=Array.from({length:5000},(_,i)=>({time:T+i*60,open:100+i%7,high:101+i%7,low:99,close:100.5+i%3,volume:1000+i}));
const series={symbol:'BTC-USD',exchange:'COINBASE',interval:'1',description:'',tickSize:0.01};
// 13 plot columns: 20 columns with the 7 bar columns.
const indicators:DataWindowIndicatorInput[]=Array.from({length:4},(_,s)=>({id:'s'+s,kind:'rsi',visible:true,offset:0,precision:'auto',plots:Array.from({length:s===3?4:3},(_,p)=>({id:'p'+p,label:'P'+p,color:'#2962ff',dataWindow:true,values:bars.map((_,i)=>i*0.37+s)}))})) as never;

describe('Table view with 5,000 rows',()=>{
 it('builds 5,000 rows x 20 columns quickly',()=>{
  buildTableView({series,bars:bars.slice(0,50),timezone:'America/New_York',indicators,limit:50});// warm the formatters
  const started=performance.now(),view=buildTableView({series,bars,timezone:'America/New_York',indicators,limit:5000}),elapsed=performance.now()-started;
  expect(view.rows).toHaveLength(5000);expect(view.columns).toHaveLength(20);expect(view.rows[0].cells).toHaveLength(20);
  // Was about 2 s per build (an Intl formatter built for every date), on every chart update while the dialog was open.
  expect(elapsed).toBeLessThan(1500);
 });
 it('formats each bar time exactly as the data window does, across zone offset changes and quarter-hour zones',()=>{
  const times=[...Array.from({length:600},(_,i)=>1762063200-18000+i*60),/* New York DST end 2025-11-02 */...Array.from({length:300},(_,i)=>1743868800+i*60+17),/* Adelaide DST end */...Array.from({length:200},(_,i)=>1700000000+i*37)];
  for(const zone of ['America/New_York','Australia/Adelaide','Asia/Kathmandu','Asia/Kolkata','UTC','exchange']){
   const text=tableViewTimeText(zone,true),dateOnly=tableViewTimeText(zone,false);
   for(const time of times){
    expect(text(time)).toBe(formatDataWindowDate(time,zone)+' '+formatDataWindowTime(time,zone));
    expect(dateOnly(time)).toBe(formatDataWindowDate(time,zone));
   }
  }
 });
 it('draws only the rows on screen, with spacer height for the rest, and builds rows on demand',()=>{
  const model=tableViewModel({series,bars,timezone:'UTC',indicators,limit:5000});
  expect(model.count).toBe(5000);expect(model.row(4999).time).toBe(bars[0].time);expect(model.row(0)).toBe(model.row(0));
  return import('../../src/ui/TableViewDialog').then(({TableViewDialog})=>{
   const html=renderToStaticMarkup(React.createElement(TableViewDialog,{series,bars,timezone:'UTC',indicators,synthetic:false,onClose:()=>{}}));
   const drawn=(html.match(/<tr aria-rowindex=/g)??[]).length-1;// minus the header row
   expect(drawn).toBeGreaterThan(10);expect(drawn).toBeLessThan(100);// of the first page of 200
   expect(html).toContain('aria-rowcount="201"');expect(html).toMatch(/<tr aria-hidden="true" style="height:\d+px"/);
   expect(html).toContain('Newest 200 of 5000 bars');
  });
 });
});
