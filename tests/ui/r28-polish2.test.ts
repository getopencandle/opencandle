import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {StreamStatusLine,describeStreamStatus,streamStatusAttributes} from '../../src/ui/LiveDataSettings';
import {heldQuoteFor} from '../../src/ui/use-live-quote';
import type {AlpacaStatus} from '../../src/domain/alpaca-live';
import type {LiveQuote} from '../../src/domain/live-quotes';

// Data sources quote state, and the F9, F10 and F11 fixes. Synthetic statuses and quotes only.
const NOW=Date.UTC(2026,9,21,14,0); // a regular session
const status=(extra:Partial<AlpacaStatus>={},counters:Record<string,number>={}):AlpacaStatus=>({schemaVersion:1,state:'ready',symbols:['AAPL'],feed:'iex',attempt:0,lastMessageAt:NOW,liveMessages:true,lastError:null,counters:{received:5,dropped:0,rejected:0,reconnects:0,quotesDropped:0,...counters},...extra});
const quote=(bid:number):LiveQuote=>({bid,ask:bid+0.01,bidSize:1,askSize:1,at:1} as unknown as LiveQuote);
const app=()=>readFileSync('src/ui/App.tsx','utf8');

describe('Data sources: stream quote state',()=>{
 it('says when quotes are reduced or paused, and stays silent at full level',()=>{
  expect(describeStreamStatus(status({quoteLevel:'shown'}),NOW)).toContain('Quotes reduced to on-screen symbols');
  expect(describeStreamStatus(status({quoteLevel:'none'}),NOW)).toContain('Quotes paused (high traffic)');
  expect(describeStreamStatus(status({quoteLevel:'all'}),NOW)).not.toMatch(/Quotes/);
  expect(describeStreamStatus(status(),NOW)).not.toMatch(/Quotes/);
  expect(describeStreamStatus(status({quoteLevel:'none',state:'connecting'}),NOW)).not.toMatch(/Quotes/);
 });
 it('exposes data-quote-level, data-dropped and data-quotes-dropped on the status element',()=>{
  const html=renderToStaticMarkup(React.createElement(StreamStatusLine,{status:status({quoteLevel:'none'},{dropped:7,quotesDropped:3})}));
  expect(html).toContain('data-quote-level="none"');expect(html).toContain('data-dropped="7"');expect(html).toContain('data-quotes-dropped="3"');
  expect(streamStatusAttributes(status())['data-quote-level']).toBe('all');
  expect(streamStatusAttributes(null)).toEqual({});
 });
});
describe(' F10: useLiveQuote after the instrument changes',()=>{
 const store={get:(id:string)=>id==='B'?quote(2):null} as never;
 it('never returns the previous instrument held quote',()=>{
  expect(heldQuoteFor({id:'A',quote:quote(1)},'B',store)?.bid).toBe(2);
  expect(heldQuoteFor({id:'A',quote:quote(1)},'C',store)).toBeNull();
  expect(heldQuoteFor({id:'A',quote:quote(1)},null,store)).toBeNull();
  expect(heldQuoteFor({id:'B',quote:quote(5)},'B',store)?.bid).toBe(5);
 });
});
describe(' F9 and F11 wiring (source checks)',()=>{
 it('F9: the grid cell does not re-bind the price scale host on quote availability',()=>{
  const text=readFileSync('src/ui/MultiChartGrid.tsx','utf8'),line=text.split(/\r?\n/).find(row=>row.includes('chart.priceScale.bindHost('))!;
  expect(line).not.toContain('liveQuote!==null]');
  expect(line).toContain('get bidAsk()');
  expect(line).toMatch(/\[chart,dataset\.instrument\.currency,prePostOk\]\);$/);
 });
 it('F11: a staged snapshot is dropped when a transition is refused or throws',()=>{
  const text=app();
  expect(text).toMatch(/function replayTransition\([^\n]*finally\{replaySnapshotStage\.current=null;\}\}/);
  expect(text).toMatch(/function replayStartFrom\([^\n]*finally\{replaySnapshotStage\.current=null;\}\}/);
  expect(text).toMatch(/replayFail\(error\);\}finally\{replaySnapshotStage\.current=null;\}\r?\n \}/);
 });
});
