import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {WATCH_COLUMNS,WATCH_DEFAULT_WIDTHS,createWatchBook,referenceFromDataset,restoreWatchBook,setWatchColumnVisible,watchColumnWidth} from '../../src/watchlists/model';
import {orderedWatchRows,watchCellDisplay,watchQuote,withLiveQuote} from '../../src/watchlists/quotes';
import {WATCH_COLUMN_LABELS} from '../../src/watchlists/menus';
import {paperDomLadder,paperDomCapability} from '../../src/domain/paper-dom';
import {createPaperAccount} from '../../src/domain/paper';
import type {LiveQuote} from '../../src/domain/live-quotes';

// follow-up on: SYNTHETIC fixture bars and a hand-built live quote; nothing is fetched.
const NOW=Date.UTC(2026,9,21,15,0,0);
const data=fixtureDataset('GME',3),live=(bid:number|null,ask:number|null):LiveQuote=>({instrumentId:data.instrument.id,symbol:'GME',providerId:'alpaca-iex',feed:'iex',bid,ask,bidSize:bid===null?null:300,askSize:ask===null?null:100,time:NOW/1000,receivedAt:NOW,synthetic:false});

it('Bid and Ask are later columns: an older saved book restores unchanged and reads their default width',()=>{
 expect(WATCH_COLUMNS.slice(-2)).toEqual(['bid','ask']);expect(WATCH_COLUMN_LABELS.bid).toBe('Bid');expect(WATCH_COLUMN_LABELS.ask).toBe('Ask');
 const book=createWatchBook(),{bid:_b,ask:_a,...older}=book.display.widths as Record<string,number>;
 const restored=restoreWatchBook({...book,display:{...book.display,widths:older}});
 expect(watchColumnWidth(restored,'bid')).toBe(WATCH_DEFAULT_WIDTHS.bid);
 expect(setWatchColumnVisible(restored,'ask',true).display.columns).toContain('ask');
});
it('cells show the live bid and ask with sizes and source, N/A without a fresh live quote, and sort by bid',()=>{
 const reference=referenceFromDataset(data),quote=watchQuote(reference,[data]);
 const quoted=withLiveQuote(quote,live(20.01,20.03),NOW);
 expect(watchCellDisplay('bid',quoted)).toMatchObject({text:'20.01',state:'value'});
 expect(watchCellDisplay('bid',quoted).title).toMatch(/^Bid 20\.01 x 300 at .*IEX quote/);
 expect(watchCellDisplay('ask',withLiveQuote(quote,live(20.01,null),NOW))).toMatchObject({text:'N/A',state:'unavailable'});
 expect(watchCellDisplay('bid',withLiveQuote(quote,live(20.01,20.03),NOW+10*60*1000))).toMatchObject({state:'unavailable'});
 expect(watchCellDisplay('bid',quote).title).toMatch(/live Alpaca/);
 const list={id:'l',name:'l',favorite:false,sort:{column:'bid' as const,direction:'desc' as const},rows:[{id:'a',kind:'symbol' as const,reference},{id:'b',kind:'symbol' as const,reference}]};
 expect(orderedWatchRows(list,new Map([['a',withLiveQuote(quote,live(1,2),NOW)],['b',quoted]])).map(row=>row.id)).toEqual(['b','a']);
});
it('the paper DOM ladder marks the live best bid and ask rows with their sizes when given the display quote',()=>{
 const account=createPaperAccount({id:'p',mode:'paper',name:'synthetic',now:0}),base={instrumentId:data.instrument.id,bid:20.02,ask:20.02,eventTime:1,receivedAt:1,availableAt:1,sequence:1,session:'regular' as const,fixture:false};
 const book={...base,bid:20.01,ask:20.03,bidSize:300,askSize:100};
 const ladder=paperDomLadder(account,data.instrument,book,20.02,9);
 expect(ladder.levels.find(level=>level.bid)).toMatchObject({price:20.01,bidSize:300});
 expect(ladder.levels.find(level=>level.ask)).toMatchObject({price:20.03,askSize:100});
 expect(paperDomCapability(book).sizes).toBe(true);
});
