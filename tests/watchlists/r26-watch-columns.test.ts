import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {WATCH_DEFAULT_WIDTHS,watchColumnWidth,createWatchBook,referenceFromDataset,restoreWatchBook} from '../../src/watchlists/model';
import {extendedQuote,relativeVolume,watchCellDisplay,watchQuote} from '../../src/watchlists/quotes';
import {addWatchMembers} from '../../src/watchlists/membership';
import {watchListMenu,watchRowMenu} from '../../src/watchlists/menus';
import {detailSessionState,prepareDetailSnapshot} from '../../src/watchlists/details';

// SYNTHETIC bars only.: extended-hours and relative volume columns, the row alert entry, list export and details.
const ET=(h:number,m=0,d=21)=>Date.UTC(2026,9,d,h+4,m)/1000; // EDT, Wednesday 2026-10-21
const bar=(time:number,close:number,volume=1):Bar=>({time,open:close,high:close+1,low:close-1,close,volume});
function intraday(bars:Bar[],timezone='America/New_York'):BarDataset{const base=fixtureDataset('GME',3);return{...base,resolution:'5',instrument:{...base.instrument,timezone},provenance:{...base.provenance,datasetId:'r26-intraday'},bars};}
function daily(volumes:number[]):BarDataset{const base=fixtureDataset('GME',3);return{...base,resolution:'1D',instrument:{...base.instrument,timezone:'America/New_York'},provenance:{...base.provenance,datasetId:'r26-daily'},bars:volumes.map((volume,index)=>bar(Date.UTC(2026,8,1+index)/1000,10+index,volume))};}

it('a post-market last bar is the extended last, compared with the day\'s regular close',()=>{
 const post=extendedQuote(intraday([bar(ET(15,50),19),bar(ET(15,55),20),bar(ET(16,30),21)]));
 expect(post).toMatchObject({extended:21,change:1,changePercent:5,session:'post'});expect(post.reason).toContain('Post-market');
 const pre=extendedQuote(intraday([bar(ET(15,55),20),bar(ET(9,0,22),18)]));
 expect(pre).toMatchObject({extended:18,change:-2,changePercent:-10,session:'pre'});
 expect(extendedQuote(intraday([bar(ET(16,30),21)]))).toMatchObject({extended:21,change:null,changePercent:null,session:'post'});
});
it('regular hours, overnight, daily data and non-US sessions leave extended values unavailable',()=>{
 expect(extendedQuote(intraday([bar(ET(15,55),20),bar(ET(10),21)]))).toMatchObject({extended:null,session:null});
 expect(extendedQuote(intraday([bar(ET(21),21)])).extended).toBeNull();
 expect(extendedQuote({...intraday([bar(ET(16,30),21)]),resolution:'1D'}).extended).toBeNull();
 expect(extendedQuote(intraday([bar(ET(16,30),21)],'UTC')).extended).toBeNull();
});
it('watch quotes and cells carry extended last, change and change percent with a session label',()=>{
 const primary=intraday([bar(ET(15,55),20),bar(ET(16,30),21)]),reference=referenceFromDataset(primary),quote=watchQuote(reference,[primary]);
 expect([quote.extended,quote.extendedChange,quote.extendedChangePercent,quote.extendedSession]).toEqual([21,1,5,'post']);
 expect(watchCellDisplay('extended',quote)).toMatchObject({state:'value',text:'21'});expect(watchCellDisplay('extended',quote).title).toContain('Post-market');
 expect(watchCellDisplay('extendedChange',quote).text).toBe('+1');expect(watchCellDisplay('extendedChangePercent',quote).text).toBe('+5%');
 expect(watchCellDisplay('relativeVolume',quote).state).toBe('unavailable');
});
it('relative volume is the day volume over the mean of the ten earlier daily bars',()=>{
 const source=daily([...Array(10).fill(10),25]),quote=watchQuote(referenceFromDataset(source),[source]);
 expect(quote.relativeVolume).toBe(2.5);expect(watchCellDisplay('relativeVolume',quote).text).toBe('2.50');
 expect(relativeVolume(daily(Array(10).fill(10)),daily(Array(10).fill(10)).bars.at(-1))).toBeNull();
 const zero=daily([...Array(10).fill(0),5]);expect(relativeVolume(zero,zero.bars.at(-1))).toBeNull();
});
it('a book saved before the new columns restores them at their default width',()=>{
 const book=createWatchBook(['GME']),widths:Record<string,number>={...book.display.widths};delete widths.extendedChange;delete widths.extendedChangePercent;delete widths.relativeVolume;
 const restored=restoreWatchBook({...book,display:{...book.display,widths}});
 expect(restored.display.widths.relativeVolume).toBeUndefined();expect(watchColumnWidth(restored,"relativeVolume")).toBe(WATCH_DEFAULT_WIDTHS.relativeVolume);expect(JSON.stringify(restored.display.widths)).toBe(JSON.stringify(widths));
 expect(()=>restoreWatchBook({...book,display:{...book.display,widths:{...widths,relativeVolume:10}}})).toThrow(/presentation/);
 expect(restoreWatchBook({...book,display:{...book.display,columns:['symbol','extendedChange','relativeVolume']}}).display.columns).toEqual(['symbol','extendedChange','relativeVolume']);
});
it('rows offer Add alert on SYMBOL when connected, and the list menu exports TXT directly',()=>{
 const primary=intraday([bar(ET(10),20)]),reference=referenceFromDataset(primary);let n=0;
 const book=addWatchMembers(createWatchBook([]),'initial-list',[reference],()=>'r'+(++n)).book,row=book.lists[0].rows.at(-1)!.id;
 const items=(symbolAlert?:boolean,datasets:BarDataset[]=[primary])=>watchRowMenu({book,selected:[row],datasets,notes:false,symbolAlert}).flatMap(group=>group.items);
 expect(items(true).find(entry=>entry.id==='symbol-alert')).toMatchObject({label:'Add alert on GME...',disabled:null});
 expect(items(true,[]).find(entry=>entry.id==='symbol-alert')!.disabled).toMatch(/No data source for/);
 expect(items(false).some(entry=>entry.id==='symbol-alert')).toBe(false);
 expect(watchListMenu(book).flatMap(group=>group.items).find(entry=>entry.id==='export')).toMatchObject({label:'Export list as TXT...',disabled:null});
 expect(watchListMenu(createWatchBook([])).flatMap(group=>group.items).find(entry=>entry.id==='export')!.disabled).toBe('This list is empty.');
});
it('details show the LV calendar session state for New York listings and a day range',()=>{
 expect(detailSessionState('America/New_York','stock',ET(10))).toBe('Regular session open, OpenCandle calendar');
 expect(detailSessionState('America/New_York','stock',ET(7))).toBe('Pre-market, OpenCandle calendar');
 expect(detailSessionState('America/New_York','stock',ET(17))).toBe('Post-market, OpenCandle calendar');
 expect(detailSessionState('America/New_York','stock',ET(12,0,24))).toBe('Closed (weekend), OpenCandle calendar');
 expect(detailSessionState('America/New_York','stock',Date.UTC(2026,11,25,17)/1000)).toBe('Closed (exchange holiday), OpenCandle calendar');
 expect(detailSessionState('UTC','stock',ET(10))).toBeNull();expect(detailSessionState('America/New_York','crypto',ET(10))).toBeNull();
 const source=daily([...Array(10).fill(10),25]),reference=referenceFromDataset(source),view=prepareDetailSnapshot(reference,watchQuote(reference,[source]),ET(17)).snapshot;
 const value=(block:'summary'|'daily',label:string)=>view.blocks[block].find(row=>row.label===label)?.value;
 expect(value('summary','Current market status')).toBe('Post-market, OpenCandle calendar');
 expect(value('daily','Day range')).toBe('19.00 to 21.00');expect(value('daily','Relative volume')).toBe(2.5);
});
