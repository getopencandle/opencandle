import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {activeWatchList,addWatchList,createWatchBook,exportWatchText,importWatchText,insertWatchSection,marketKey,referenceFromDataset,restoreWatchBook,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {watchCellDisplay,watchQuote} from '../../src/watchlists/quotes';

// SYNTHETIC inputs only. Wording and the TXT section format are our own choice.
let serial=0;const id=()=>'c'+(++serial);
function daily(symbol:string,closes:number[],volumes?:number[]):BarDataset{
 const base=fixtureDataset(symbol,closes.length);
 return{...base,resolution:'1D',instrument:{...base.instrument,exchange:'TEST',id:'TEST:'+symbol},provenance:{...base.provenance,providerId:'wl-test',providerName:'Synthetic test provider',datasetId:'wl:'+symbol,fixture:true,session:'regular'},bars:closes.map((close,index)=>({time:1767225600+index*86400,open:close,high:close,low:close,close,volume:volumes?.[index]??100+index}))};
}
const ref=(dataset:BarDataset):WatchReference=>({...referenceFromDataset(dataset),exchange:dataset.instrument.exchange});
const quoteOf=(dataset:BarDataset)=>watchQuote({...ref(dataset),synthetic:true},[dataset]);

describe('Change % states (leaf: Missing/zero reference denominator distinct)',()=>{
 it('a zero previous close is distinct from missing data',()=>{
  const zero=quoteOf(daily('ZERO',[0,5])),missing=quoteOf(daily('ONE',[5]));
  expect(zero.changePercent).toBeNull();expect(zero.change).toBe(5);expect(zero.changePercentState).toBe('zero-base');
  expect(missing.changePercentState).toBe('missing');expect(quoteOf(daily('OK',[4,5])).changePercentState).toBe('value');
  const shownZero=watchCellDisplay('changePercent',zero),shownMissing=watchCellDisplay('changePercent',missing);
  expect(shownZero.text).toBe('n/a');expect(shownZero.title).toContain('Previous close is zero');
  expect(shownMissing.text).toBe('N/A');expect(shownMissing.title.startsWith('Unavailable.')).toBe(true);expect(shownMissing.title).not.toContain('Previous close is zero');
 });
 it('numeric oracle: 4 to 5 is 25 percent and change is 1',()=>{const q=quoteOf(daily('OK',[4,5]));expect(q.change).toBe(1);expect(q.changePercent).toBe(25);expect(watchCellDisplay('changePercent',q).text).toBe('+25%');});
});

describe('Last, Change and Volume cells (leaves: timestamp and basis, daily basis, covered volume)',()=>{
 it('Last names its price, close time and source resolution',()=>{
  const q=quoteOf(daily('LAST',[10,11]));const shown=watchCellDisplay('last',q);
  expect(shown.text).toBe('11');expect(shown.title).toBe('Last 11 at 2026-01-02T00:00:00.000Z, from Synthetic test provider, 1D');
  expect(shown.title).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
 });
 it('Last from an intraday primary names that resolution while change uses only the daily companion', ()=>{
  const dailySource=daily('INTRA',[100,110]),minute={...daily('INTRA',[111,112,113]),resolution:'1m',provenance:{...dailySource.provenance,datasetId:'wl:INTRA:1m'}};
  const reference={...ref(minute),synthetic:true,dailyDatasetId:dailySource.provenance.datasetId};
  const q=watchQuote(reference,[minute,dailySource]);
  expect(q.last).toBe(113);expect(q.change).toBe(10);expect(q.changePercent).toBeCloseTo(10,12);expect(watchCellDisplay('last',q).title).toContain(', 1m');
  const alone=watchQuote({...reference,dailyDatasetId:null},[minute]);expect(alone.change).toBeNull();expect(alone.changePercentState).toBe('missing');expect(watchCellDisplay('change',alone).title).toContain('Unavailable.');expect(alone.reason).toContain('Daily change and volume are unavailable without a compatible daily snapshot');
 });
 it('Volume names its daily bar date and session; an intraday-only source stays blank with a reason',()=>{
  const q=quoteOf(daily('VOL',[10,11],[500,750]));const shown=watchCellDisplay('volume',q);
  expect(shown.text).toBe('750');expect(shown.title).toBe('Daily volume 750 on 2026-01-02, regular session, from Synthetic test provider');
  const minute={...daily('VOL',[1,2]),resolution:'1m'},blank=watchCellDisplay('volume',quoteOf(minute));expect(blank.text).toBe('N/A');expect(blank.title).toContain('Unavailable.');
 });
});

describe('TXT export keeps sections (leaf: TXT including sections; LV-defined line format)',()=>{
 const references=(names:string[])=>names.map(symbol=>({exchange:'NYSE',symbol,datasetId:null,dailyDatasetId:null,synthetic:false}));
 function sectioned():WatchBook{let book=addWatchList(createWatchBook([]),'L','Tech');book=addWatchMembers(book,'L',references(['AAA','BBB']),id).book;book=insertWatchSection(book,'L','s1','Growth',null);book=addWatchMembers(book,'L',references(['CCC']),id).book;book=insertWatchSection(book,'L','s2','Value',null);book=addWatchMembers(book,'L',references(['DDD','EEE']),id).book;return book;}
 it('writes a ### line per section followed by its symbols and a list without sections is byte-identical to the old format',()=>{
  const book=sectioned();expect(exportWatchText(book,'sections')).toBe('NYSE:AAA,NYSE:BBB\n###Growth\nNYSE:CCC\n###Value\nNYSE:DDD,NYSE:EEE');
  expect(exportWatchText(book,true)).toBe('NYSE:AAA,NYSE:BBB,NYSE:CCC,NYSE:DDD,NYSE:EEE');
  const plain=addWatchMembers(addWatchList(createWatchBook([]),'P','Plain'),'P',references(['AAA','BBB']),id).book;for(const mode of [false,true,'sections'] as const)expect(exportWatchText(plain,mode)).toBe('NYSE:AAA,NYSE:BBB');expect(()=>exportWatchText(book)).toThrow('flattening');
 });
 it('import recreates the sections and the symbols in order (round trip)',()=>{
  const text=exportWatchText(sectioned(),'sections'),next=importWatchText(createWatchBook([]),text,'N','Imported',id),rows=activeWatchList(next).rows;
  expect(rows.map(row=>row.kind==='section'?'#'+row.name:marketKey((row as any).reference))).toEqual(['NYSE:AAA','NYSE:BBB','#Growth','NYSE:CCC','#Value','NYSE:DDD','NYSE:EEE']);
  expect(exportWatchText(next,'sections')).toBe(text);expect(restoreWatchBook(next)).toEqual(next);
 });
 it('keeps empty sections, a leading section, CRLF input and rejects blank section names and a stray comma list that is not a symbol',()=>{
  const next=importWatchText(createWatchBook([]),'###Empty\r\n###Full\r\nNYSE:AAA','N','Imported',id);expect(activeWatchList(next).rows.map(row=>row.kind)).toEqual(['section','section','symbol']);
  expect(()=>importWatchText(createWatchBook([]),'###\nNYSE:AAA','N','Imported',id)).toThrow(/section name/i);
  expect(()=>importWatchText(createWatchBook([]),'###A\nnot a symbol','N','Imported',id)).toThrow(/EXCHANGE:TICKER/);
  expect(importWatchText(createWatchBook([]),'NYSE:AAA,NYSE:BBB','N','Imported',id).lists.at(-1)!.rows).toHaveLength(2);
 });
});

describe('Plus adds at the bottom (leaf: Plus then symbol search appends at bottom)',()=>{
 const one=(symbol:string)=>({exchange:'NYSE',symbol,datasetId:null,dailyDatasetId:null,synthetic:false});
 it('appends as the last row of the list, or the last row of the selected section',()=>{
  let book=addWatchList(createWatchBook([]),'L','L');book=addWatchMembers(book,'L',[one('AAA')],id).book;book=insertWatchSection(book,'L','s1','One',null);book=addWatchMembers(book,'L',[one('BBB')],id).book;book=insertWatchSection(book,'L','s2','Two',null);book=addWatchMembers(book,'L',[one('CCC')],id).book;
  const names=(b:WatchBook)=>activeWatchList({...b,activeId:'L'}).rows.map(row=>row.kind==='section'?'#'+row.name:(row as any).reference.symbol);
  expect(names(addWatchMembers(book,'L',[one('ZZZ')],id).book)).toEqual(['AAA','#One','BBB','#Two','CCC','ZZZ']);
  expect(names(addWatchMembers(book,'L',[one('ZZZ')],id,{sectionId:'s1'}).book)).toEqual(['AAA','#One','BBB','ZZZ','#Two','CCC']);
  expect(names(addWatchMembers(book,'L',[one('ZZZ')],id,{sectionId:'s2'}).book)).toEqual(['AAA','#One','BBB','#Two','CCC','ZZZ']);
  expect(()=>addWatchMembers(book,'L',[one('ZZZ')],id,{sectionId:'missing'})).toThrow();
  expect(addWatchMembers(book,'L',[one('BBB')],id,{sectionId:'s1'}).skipped).toHaveLength(1);
 });
});

describe('closed view (LIVE-CB 3.4 contract)',()=>{
 it('the Last tooltip names the time of the last bar of the dataset it is given, so a closed view never shows a forming bar time',()=>{
  const closed=daily('LIVE',[10,11]),chartView={...closed,bars:[...closed.bars,{time:closed.bars.at(-1)!.time+86400,open:12,high:12,low:12,close:12,volume:1}]};
  expect(watchCellDisplay('last',quoteOf(closed)).title).toContain('at 2026-01-02T00:00:00.000Z');
  expect(watchCellDisplay('last',quoteOf(chartView)).title).toContain('at 2026-01-03T00:00:00.000Z');
 });
});

describe('section names on a TXT round trip',()=>{
 it('keep their surrounding spaces',()=>{
  const book=importWatchText(createWatchBook([]),'###  Padded name  \nNYSE:AAA','N','Imported',id),section=activeWatchList(book).rows.find(row=>row.kind==='section')!;
  expect((section as any).name).toBe('  Padded name  ');const text=exportWatchText(book,'sections');expect(text).toBe('###  Padded name  \nNYSE:AAA');
  expect((activeWatchList(importWatchText(createWatchBook([]),text,'M','Again',id)).rows[0] as any).name).toBe('  Padded name  ');
  expect(()=>importWatchText(createWatchBook([]),'###   \nNYSE:AAA','N','Imported',id)).toThrow(/section name/i);
 });
});
