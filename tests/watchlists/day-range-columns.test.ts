import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {WATCH_COLUMNS,WATCH_DAY_RANGE_COLUMNS,activeWatchList,createWatchBook,referenceFromDataset,restoreWatchBook,setWatchSort,showWatchColumns,watchColumnWidth,WATCH_DEFAULT_WIDTHS} from '../../src/watchlists/model';
import {dayRangeStats,orderedWatchRows,watchCellDisplay,watchCellTone,watchQuote} from '../../src/watchlists/quotes';
import {WATCH_COLUMN_LABELS,watchColumnMenu} from '../../src/watchlists/menus';
import {addWatchMembers} from '../../src/watchlists/membership';

// SYNTHETIC daily bars with hand-computed oracles for the day-range columns.
const DAY=86400,T0=Date.UTC(2026,7,1)/1000;
const bar=(index:number,open:number,high:number,low:number,close:number):Bar=>({time:T0+index*DAY,open,high,low,close,volume:1000});
function daily(symbol:string,bars:Bar[]):BarDataset{const base=fixtureDataset(symbol,3);return{...base,resolution:'1D',instrument:{...base.instrument,timezone:'America/New_York'},provenance:{...base.provenance,datasetId:'dr-daily-'+symbol},bars};}
// Bar 0 has a 100-wide range and falls outside the 14 completed bars; bars 1..14 have ranges 1..14 (mean 7.5); bar 14 is the
// prior day (10 to 24). `today` is bar 15.
const history=()=>[bar(0,10,110,10,10),...Array.from({length:14},(_,i)=>bar(i+1,10,10+(i+1),10,10+(i+1)/2))];
const quoteOf=(today:Bar,symbol='AAA')=>{const source=daily(symbol,[...history(),today]);return watchQuote(referenceFromDataset(source),[source]);};
const NEW=['adr','adrUsed','rangePosition','vsPriorDay','vsOpen'] as const;

describe('day-range columns',()=>{
 it('are offered with their names, off by default, before Bid and Ask, with default widths',()=>{
  expect(WATCH_DAY_RANGE_COLUMNS).toEqual(NEW);
  for(const column of NEW)expect(WATCH_COLUMNS).toContain(column);
  expect(WATCH_COLUMNS.slice(-2)).toEqual(['bid','ask']);
  expect(NEW.map(column=>WATCH_COLUMN_LABELS[column])).toEqual(['ADR (14)','% of ADR used','Position in range','Vs prior day','Vs open']);
  const book=createWatchBook();expect(book.display.columns).toEqual(['symbol','last','changePercent']);
  for(const column of NEW){expect(book.display.widths[column]).toBeUndefined();expect(watchColumnWidth(book,column)).toBe(WATCH_DEFAULT_WIDTHS[column]);}
  const picker=watchColumnMenu(book,null).flatMap(group=>group.items).filter(item=>item.id.startsWith('column:')).map(item=>item.label);
  for(const column of NEW)expect(picker).toContain(WATCH_COLUMN_LABELS[column]);
 });
 it('the Day range columns preset turns all five on in one step, then reads as done',()=>{
  const book=createWatchBook(),preset=()=>watchColumnMenu(next,null).flatMap(group=>group.items).find(item=>item.id==='preset:day-range')!;
  let next=book;expect(preset()).toMatchObject({label:'Day range columns',disabled:null});
  next=showWatchColumns(book,WATCH_DAY_RANGE_COLUMNS);
  expect(next.display.columns).toEqual(['symbol','last','changePercent',...NEW]);
  expect(preset().disabled).toMatch(/already shown/);
  expect(showWatchColumns(next,WATCH_DAY_RANGE_COLUMNS)).toBe(next);
  // A column already shown keeps its place; the rest are appended.
  const partial=showWatchColumns(showWatchColumns(book,['vsOpen']),WATCH_DAY_RANGE_COLUMNS);
  expect(partial.display.columns).toEqual(['symbol','last','changePercent','vsOpen','adr','adrUsed','rangePosition','vsPriorDay']);
  expect(restoreWatchBook(JSON.parse(JSON.stringify(next))).display.columns).toEqual(next.display.columns);
  expect(()=>showWatchColumns(book,['bogus' as never])).toThrow();
 });
 it('ADR is the mean range of the 14 completed daily bars before the day; the cells read from it',()=>{
  // Today 20 / 24 / 18 / 22.5: range 6, 6 / 7.5 = 80%; (22.5 - 18) / 6 = 75%; inside 10..24; above the open 20.
  const quote=quoteOf(bar(15,20,24,18,22.5));
  expect([quote.adr,quote.adrUsed,quote.rangePosition,quote.vsPriorDay,quote.vsOpen]).toEqual([7.5,80,75,0,1]);
  expect(watchCellDisplay('adr',quote)).toMatchObject({text:'7.5',state:'value'});
  expect(watchCellDisplay('adrUsed',quote)).toMatchObject({text:'80%',state:'value'});
  expect(watchCellDisplay('rangePosition',quote)).toMatchObject({text:'75%',state:'value'});
  expect(watchCellDisplay('vsPriorDay',quote)).toMatchObject({text:'Inside',state:'value'});
  expect(watchCellDisplay('vsPriorDay',quote).title).toContain('10 to 24');
  expect(watchCellDisplay('vsOpen',quote)).toMatchObject({text:'Above',state:'value'});
  expect(watchCellDisplay('adr',quote).title).toContain('14 completed daily bars');
  for(const column of NEW)expect(watchCellTone(column,quote)).toBeNull();
  // The day's own bar never enters ADR: a 42-wide day leaves ADR at 7.5 (42 / 7.5 = 560%).
  const wide=quoteOf(bar(15,20,60,18,28));expect([wide.adr,wide.adrUsed]).toEqual([7.5,560]);
  expect(wide.rangePosition!).toBeCloseTo(1000/42,12);
 });
 it('above and below the prior day range and the open; the bounds count as inside',()=>{
  const above=quoteOf(bar(15,20,30,18,28));expect([above.vsPriorDay,above.vsOpen]).toEqual([1,1]);expect(watchCellDisplay('rangePosition',above).text).toBe('83%');
  const below=quoteOf(bar(15,12,13,8,9));expect([below.vsPriorDay,below.vsOpen]).toEqual([-1,-1]);
  expect(watchCellDisplay('vsPriorDay',below).text).toBe('Below');expect(watchCellDisplay('vsOpen',below).text).toBe('Below');
  expect(quoteOf(bar(15,20,25,18,24)).vsPriorDay).toBe(0);expect(quoteOf(bar(15,9,12,9,10)).vsPriorDay).toBe(0);
 });
 it('a zero-range day: position unavailable, 0% of ADR, at the open',()=>{
  const flat=quoteOf(bar(15,15,15,15,15));
  expect([flat.adrUsed,flat.rangePosition,flat.vsPriorDay,flat.vsOpen]).toEqual([0,null,0,0]);
  const position=watchCellDisplay('rangePosition',flat);expect(position).toMatchObject({text:'N/A',state:'unavailable'});expect(position.title).toContain('no range');
  expect(watchCellDisplay('adrUsed',flat).text).toBe('0%');expect(watchCellDisplay('vsOpen',flat).text).toBe('At open');
  // Fourteen flat completed bars give ADR 0: % of ADR used is unavailable, never a division by zero.
  const zero=daily('ZZZ',Array.from({length:15},(_,i)=>bar(i,5,5,5,5))),q=watchQuote(referenceFromDataset(zero),[zero]);
  expect([q.adr,q.adrUsed]).toEqual([0,null]);expect(watchCellDisplay('adrUsed',q).title).toContain('ADR (14) is zero');
 });
 it('fewer than 14 completed bars, a bad bar, or no daily snapshot shows the normal unavailable cell',()=>{
  const short=daily('SSS',history().slice(2).concat(bar(15,20,24,18,22.5))),q=watchQuote(referenceFromDataset(short),[short]);
  expect(short.bars.length).toBe(14);expect([q.adr,q.adrUsed]).toEqual([null,null]);expect(q.rangePosition).toBe(75);
  expect(watchCellDisplay('adr',q)).toMatchObject({text:'N/A',state:'unavailable'});expect(watchCellDisplay('adr',q).title).toContain('needs 14 completed daily bars');
  const holed=history();holed[5]={...holed[5],high:NaN};const h=daily('HHH',[...holed,bar(15,20,24,18,22.5)]);expect(watchQuote(referenceFromDataset(h),[h]).adr).toBeNull();
  const intraday={...daily('III',[...history(),bar(15,20,24,18,22.5)]),resolution:'5'};
  const none=watchQuote(referenceFromDataset(intraday),[intraday]);
  for(const column of NEW){const shown=watchCellDisplay(column,none);expect(shown).toMatchObject({text:'N/A',state:'unavailable'});expect(shown.title).toContain('Unavailable');}
  const empty=watchQuote({symbol:'GME',exchange:'SYNTHETIC',datasetId:null,dailyDatasetId:null,synthetic:false},[]);
  for(const column of NEW)expect(watchCellDisplay(column,empty).state).toBe('unavailable');
 });
 it('with no bar for today yet (a live companion), every loaded bar is completed',()=>{
  const bars=history(),source=daily('LLL',bars);
  expect(dayRangeStats(source,undefined,bars.at(-1),20,14)).toEqual({adr:7.5,adrUsed:null,rangePosition:null,vsPriorDay:0,vsOpen:null});
  expect(dayRangeStats(source,undefined,bars.at(-1),20,15).adr).toBeCloseTo((100+105)/15,12);
 });
 it('the five columns sort, Vs prior day and Vs open as below, inside/at, above',()=>{
  const a=daily('AAA',[...history(),bar(15,20,30,18,28)]),b=daily('BBB',[...history(),bar(15,12,13,8,9)]),c=daily('CCC',history().slice(2).concat(bar(15,20,24,18,22.5)));
  let book=addWatchMembers(createWatchBook([]),'initial-list',[a,b,c].map(referenceFromDataset),(()=>{let n=0;return()=>'r'+(++n);})()).book;
  const quotes=new Map(activeWatchList(book).rows.flatMap(row=>row.kind==='symbol'?[[row.id,watchQuote(row.reference,[a,b,c])] as const]:[]));
  const order=(column:typeof NEW[number],direction:'asc'|'desc')=>{book=setWatchSort(book,'initial-list',{column,direction});return orderedWatchRows(activeWatchList(book),quotes).map(row=>row.kind==='symbol'?row.reference.symbol:'');};
  // ADR: AAA and BBB 7.5, CCC (bars 2..14, then today) has 13 completed bars: unavailable, sorted last.
  expect(order('adr','asc')).toEqual(['AAA','BBB','CCC']);
  // % of ADR used: AAA 12/7.5 = 160%, BBB 5/7.5 = 66.7%.
  expect(order('adrUsed','asc')).toEqual(['BBB','AAA','CCC']);expect(order('adrUsed','desc')).toEqual(['AAA','BBB','CCC']);
  // Position: AAA 83.3, BBB 20, CCC 75.
  expect(order('rangePosition','asc')).toEqual(['BBB','CCC','AAA']);
  expect(order('vsPriorDay','asc')).toEqual(['BBB','CCC','AAA']);expect(order('vsPriorDay','desc')).toEqual(['AAA','CCC','BBB']);
  expect(order('vsOpen','desc')).toEqual(['AAA','CCC','BBB']);
  expect(restoreWatchBook(JSON.parse(JSON.stringify(book))).lists[0].sort).toEqual({column:'vsOpen',direction:'desc'});
 });
});
