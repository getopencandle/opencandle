import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {WATCH_COLUMNS,WATCH_DEFAULT_WIDTHS,activeWatchList,createWatchBook,referenceFromDataset,restoreWatchBook,setWatchColumnVisible,setWatchSort,watchColumnWidth} from '../../src/watchlists/model';
import {orderedWatchRows,watchCellDisplay,watchCellTone,watchQuote} from '../../src/watchlists/quotes';
import {WATCH_COLUMN_LABELS,watchColumnMenu} from '../../src/watchlists/menus';
import {addWatchMembers} from '../../src/watchlists/membership';

// SYNTHETIC bars only.: Open, High, Low, Prev close and Day range columns, from the
// same daily snapshot the Chg columns use.
const DAY=86400,T0=Date.UTC(2026,8,1)/1000;
const bar=(index:number,open:number,high:number,low:number,close:number):Bar=>({time:T0+index*DAY,open,high,low,close,volume:100+index});
function daily(symbol:string,bars:Bar[]):BarDataset{const base=fixtureDataset(symbol,3);return{...base,resolution:'1D',instrument:{...base.instrument,timezone:'America/New_York'},provenance:{...base.provenance,datasetId:'r39-daily-'+symbol},bars};}
const NEW=['open','high','low','previousClose','dayRange'] as const;

it('the five columns are offered in the column picker with the reference app names, Bid and Ask stay last, and none is on by default',()=>{
 for(const column of NEW)expect(WATCH_COLUMNS).toContain(column);
 expect(WATCH_COLUMNS.slice(-2)).toEqual(['bid','ask']);
 expect(NEW.map(column=>WATCH_COLUMN_LABELS[column])).toEqual(['Open','High','Low','Prev close','Day range']);
 const book=createWatchBook();expect(book.display.columns).toEqual(['symbol','last','changePercent']);
 // A fresh book keeps the stored widths of the original six columns only (fresh-profile shape).
 for(const column of NEW){expect(book.display.widths[column]).toBeUndefined();expect(watchColumnWidth(book,column)).toBe(WATCH_DEFAULT_WIDTHS[column]);}
 const picker=watchColumnMenu(book,null).flatMap(group=>group.items).filter(item=>item.id.startsWith('column:')).map(item=>item.label);
 for(const label of ['Open','High','Low','Prev close','Day range'])expect(picker).toContain(label);
});
it('a saved book without the new widths restores byte-identically and the columns can be shown and restored',()=>{
 const saved=JSON.parse(JSON.stringify(createWatchBook())),restored=restoreWatchBook(saved);
 expect(JSON.stringify(restored.display)).toBe(JSON.stringify(saved.display));
 expect(JSON.stringify(restoreWatchBook(JSON.parse(JSON.stringify(restored))))).toBe(JSON.stringify(restored));
 let book=restored;for(const column of NEW)book=setWatchColumnVisible(book,column,true);
 expect(book.display.columns).toEqual(['symbol','last','changePercent',...NEW]);
 expect(restoreWatchBook(JSON.parse(JSON.stringify(book))).display.columns).toEqual(book.display.columns);
});
it('the cells read the daily bar of the day and the previous daily close',()=>{
 const source=daily('GME',[bar(0,9,10,8,9.5),bar(1,10,12.5,9.25,11)]),quote=watchQuote(referenceFromDataset(source),[source]);
 expect([quote.open,quote.high,quote.low,quote.previousClose]).toEqual([10,12.5,9.25,9.5]);
 expect(watchCellDisplay('open',quote)).toMatchObject({text:'10',state:'value'});
 expect(watchCellDisplay('high',quote)).toMatchObject({text:'12.5',state:'value'});
 expect(watchCellDisplay('low',quote)).toMatchObject({text:'9.25',state:'value'});
 expect(watchCellDisplay('previousClose',quote)).toMatchObject({text:'9.5',state:'value'});
 const range=watchCellDisplay('dayRange',quote);expect(range).toMatchObject({text:'9.25 to 12.5',state:'value'});expect(range.title).toContain('2026-09-02');
 expect(watchCellDisplay('high',quote).title).toMatch(/daily high/i);
 for(const column of NEW)expect(watchCellTone(column,quote)).toBeNull();
});
it('without a daily snapshot every new cell is unavailable with the quote reason',()=>{
 const intraday={...daily('GME',[bar(0,9,10,8,9.5),bar(1,10,12,9,11)]),resolution:'5',provenance:{...daily('GME',[]).provenance,datasetId:'r39-intraday'}};
 const quote=watchQuote(referenceFromDataset(intraday),[intraday]);
 for(const column of NEW){const shown=watchCellDisplay(column,quote);expect(shown.state).toBe('unavailable');expect(shown.text).toBe('N/A');expect(shown.title).toContain('Unavailable');}
 const empty=watchQuote({symbol:'GME',exchange:'SYNTHETIC',datasetId:null,dailyDatasetId:null,synthetic:false},[]);
 for(const column of NEW)expect(watchCellDisplay(column,empty).state).toBe('unavailable');
});
it('the new columns sort, Day range by the width of the range',()=>{
 const a=daily('AAA',[bar(0,1,1,1,1),bar(1,5,9,4,6)]),b=daily('BBB',[bar(0,1,1,1,1),bar(1,5,7,6,6)]);
 let book=addWatchMembers(createWatchBook([]),'initial-list',[referenceFromDataset(a),referenceFromDataset(b)],(()=>{let n=0;return()=>'r'+(++n);})()).book;
 const quotes=new Map(activeWatchList(book).rows.flatMap(row=>row.kind==='symbol'?[[row.id,watchQuote(row.reference,[a,b])] as const]:[]));
 const order=(column:typeof NEW[number],direction:'asc'|'desc')=>{book=setWatchSort(book,'initial-list',{column,direction});return orderedWatchRows(activeWatchList(book),quotes).map(row=>row.kind==='symbol'?row.reference.symbol:'');};
 expect(order('high','asc')).toEqual(['BBB','AAA']);expect(order('low','asc')).toEqual(['AAA','BBB']);expect(order('dayRange','asc')).toEqual(['BBB','AAA']);expect(order('dayRange','desc')).toEqual(['AAA','BBB']);
 expect(restoreWatchBook(JSON.parse(JSON.stringify(book))).lists[0].sort).toEqual({column:'dayRange',direction:'desc'});
});
