import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {activeWatchList,addWatchList,createWatchBook,exportWatchText,importWatchText,insertWatchSection,referenceFromDataset,selectWatchList} from '../../src/watchlists/model';
import {averageDailyVolume,dailyYearRange,watchCellTone,watchMarketStatus,watchQuote,type WatchQuote} from '../../src/watchlists/quotes';
import {moveWatchRows} from '../../src/watchlists/interactions';
import {prepareDetailSnapshot} from '../../src/watchlists/details';

// SYNTHETIC bars only.: change colours, market-status dots, multi-row moves, one-line TXT sections, details fields.
const DAY=86400;
const ET=(h:number,m=0,d=21)=>Date.UTC(2026,9,d,h+4,m)/1000; // EDT, Wednesday 2026-10-21
const bar=(time:number,close:number,volume=100):Bar=>({time,open:close-0.5,high:close+1,low:close-1,close,volume});
function daily(count:number,close:(index:number)=>number=index=>10+index,volume:(index:number)=>number=()=>100):BarDataset{
 const base=fixtureDataset('GME',3),start=Date.UTC(2025,0,1)/1000;
 return{...base,resolution:'1D',instrument:{...base.instrument,timezone:'America/New_York'},provenance:{...base.provenance,datasetId:'r34-daily'},bars:Array.from({length:count},(_,index)=>bar(start+index*DAY,close(index),volume(index)))};
}
const quote=(extra:Partial<WatchQuote>):WatchQuote=>({last:10,change:null,changePercent:null,changePercentState:'missing',volume:null,extended:null,extendedChange:null,extendedChangePercent:null,extendedSession:null,relativeVolume:null,asOf:null,dataset:null,description:'GME',reason:'',dailyBasis:true,...extra});
let ids=0;const id=()=>'r'+(++ids);

it('change cells are toned up or down by sign; zero, missing, zero-base and other columns stay neutral',()=>{
 const up=quote({change:1.5,changePercent:2,changePercentState:'value',extendedChange:0.2,extendedChangePercent:0.1});
 expect(['change','changePercent','extendedChange','extendedChangePercent'].map(column=>watchCellTone(column as never,up))).toEqual(['up','up','up','up']);
 const down=quote({change:-1,changePercent:-3,changePercentState:'value',extendedChange:-0.1,extendedChangePercent:-0.4});
 expect(watchCellTone('change',down)).toBe('down');expect(watchCellTone('extendedChangePercent',down)).toBe('down');
 expect(watchCellTone('change',quote({change:0}))).toBeNull();expect(watchCellTone('change',quote({change:null}))).toBeNull();
 expect(watchCellTone('changePercent',quote({change:2,changePercent:5,changePercentState:'zero-base'}))).toBeNull();
 for(const column of ['last','volume','relativeVolume','bid','ask','extended','symbol'] as const)expect(watchCellTone(column,quote({last:5,volume:9,relativeVolume:2,extended:3}))).toBeNull();
});

it('the market-status dot reads the LV New York calendar; crypto is always open and other markets have no dot',()=>{
 const ny=daily(2),state=(time:number)=>watchMarketStatus(ny,time)?.state;
 expect(state(ET(10))).toBe('open');expect(state(ET(8))).toBe('pre');expect(state(ET(17))).toBe('post');expect(state(ET(22))).toBe('closed');
 expect(watchMarketStatus(ny,ET(12,0,24))).toEqual({state:'closed',title:'Market closed (weekend), OpenCandle calendar'}); // Saturday
 expect(watchMarketStatus(ny,Date.UTC(2026,11,25,15)/1000)?.title).toBe('Market closed (exchange holiday), OpenCandle calendar');
 expect(watchMarketStatus(ny,ET(10))?.title).toBe('Market open, OpenCandle calendar');
 expect(watchMarketStatus({...ny,instrument:{...ny.instrument,assetClass:'crypto',timezone:'UTC'}},ET(22))?.state).toBe('open');
 expect(watchMarketStatus({...ny,instrument:{...ny.instrument,timezone:'Europe/London'}},ET(10))).toBeNull();
 expect(watchMarketStatus(null,ET(10))).toBeNull();
});

it('a multi-row move keeps list order, lands before the drop row, and is a no-op on a moved row',()=>{
 let book=createWatchBook(['A','B','C','D','E']);const list=()=>activeWatchList(book),idsOf=()=>list().rows.map(row=>row.kind==='symbol'?row.reference.symbol:'#'+row.name);
 const [a,b,c,d,e]=list().rows.map(row=>row.id);
 book=moveWatchRows(book,list().id,[d!,b!],a!);expect(idsOf()).toEqual(['B','D','A','C','E']);
 book=moveWatchRows(book,list().id,[b!,d!],null);expect(idsOf()).toEqual(['A','C','E','B','D']);
 expect(moveWatchRows(book,list().id,[a!,c!],c!)).toBe(book);
 expect(()=>moveWatchRows(book,list().id,['missing',a!],null)).toThrow('Moved row is missing.');
 // A heading in the selection keeps the one-row behaviour: the heading carries its members.
 book=insertWatchSection(book,list().id,'s1','Tech',b!);book=moveWatchRows(book,list().id,['s1',e!],a!);expect(idsOf()).toEqual(['#Tech','B','D','A','C','E']);
 void e;
});

it('TXT import reads ###Name entries between commas as sections; a ### line keeps its whole name as before',()=>{
 const one=importWatchText(createWatchBook([]),'###Core,NYSE:GME,AMEX:SPY,###Warrants,NYSE:GME.WS,','one','One line',id);
 const rows=activeWatchList(selectWatchList(one,'one')).rows.map(row=>row.kind==='section'?'#'+row.name:row.reference.exchange+':'+row.reference.symbol);
 expect(rows).toEqual(['#Core','NYSE:GME','AMEX:SPY','#Warrants','NYSE:GME.WS']);
 const mid=importWatchText(createWatchBook([]),'NYSE:GME,###Later,AMEX:SPY','mid','Mid',id);
 expect(activeWatchList(selectWatchList(mid,'mid')).rows.map(row=>row.kind)).toEqual(['symbol','section','symbol']);
 const legacy=importWatchText(createWatchBook([]),'###Tech, growth\nNYSE:GME','old','Old',id);
 expect(activeWatchList(selectWatchList(legacy,'old')).rows.map(row=>row.kind==='section'?row.name:row.reference.symbol)).toEqual(['Tech, growth','GME']);
 expect(()=>importWatchText(createWatchBook([]),'NYSE:GME,###,AMEX:SPY','bad','Bad',id)).toThrow('Enter a section name after ###');
 for(const text of ['NYSE:GME,###SECTION','###A,###B,NYSE:GME'])expect(()=>importWatchText(createWatchBook([]),text,'cut','Cut',id)).toThrow('needs at least one ticker after it');
});

it('TXT export on one line writes ###Name entries, round-trips, and refuses a section name with a comma',()=>{
 const source=importWatchText(createWatchBook([]),'###Core,NYSE:GME,AMEX:SPY,###Warrants,NYSE:GME.WS','src','Src',id),book=selectWatchList(source,'src');
 const text=exportWatchText(book,'inline');expect(text).toBe('###Core,NYSE:GME,AMEX:SPY,###Warrants,NYSE:GME.WS');
 expect(exportWatchText(book,'sections')).toBe('###Core\nNYSE:GME,AMEX:SPY\n###Warrants\nNYSE:GME.WS');
 const again=importWatchText(createWatchBook([]),text,'back','Back',id);expect(exportWatchText(selectWatchList(again,'back'),'inline')).toBe(text);
 const comma=selectWatchList(insertWatchSection(addWatchList(createWatchBook([]),'c','C'),'c','s','A, B',null),'c');
 expect(()=>exportWatchText(comma,'inline')).toThrow('has a comma in its name');
 expect(exportWatchText(createWatchBook(['GME','SPY']),'inline')).toBe(exportWatchText(createWatchBook(['GME','SPY']),true));
});

it('daily statistics: previous close, open, 52-week range with a full year only, and the 30 earlier days volume mean',()=>{
 const year=daily(400,index=>index===10?500:index===390?2:20+index%7,index=>index<369?1000:index<399?300:9000),last=year.bars.at(-1)!;
 expect(dailyYearRange(year,last)).toEqual({low:1,high:27}); // index 390 low 1; index 10 (500) is older than 365 days
 expect(dailyYearRange(daily(300),daily(300).bars.at(-1))).toBeNull();
 expect(averageDailyVolume(year,last,30)).toBe(300);expect(averageDailyVolume(daily(20),daily(20).bars.at(-1),30)).toBeNull();
 const reference=referenceFromDataset(year),q=watchQuote(reference,[year]);
 expect(q).toMatchObject({previousClose:year.bars.at(-2)!.close,open:last.open,yearLow:1,yearHigh:27,averageVolume30:300});
});

it('details carry the headline, the new daily fields and live bid and ask when the quote has them',()=>{
 const set=daily(400,index=>index===399?30:20),reference=referenceFromDataset(set),q=watchQuote(reference,[set]);
 const view=prepareDetailSnapshot(reference,{...q,bid:29.9,ask:30.1},ET(10)).snapshot,value=(block:'summary'|'daily',label:string)=>view.blocks[block].find(row=>row.label===label)?.value;
 expect(view.headline).toEqual({last:30,change:10,changePercent:50,tone:'up',session:'Regular session open, OpenCandle calendar'});
 expect(value('daily','Previous close')).toBe(20);expect(value('daily','Open')).toBe(29.5);expect(value('daily','52-week range')).toBe('19.00 to 31.00');
 expect(value('daily','Average volume (30 earlier days)')).toBe(100);expect(value('summary','Bid')).toBe(29.9);expect(value('summary','Ask')).toBe(30.1);
 const flatSet=daily(400,()=>20),flatReference=referenceFromDataset(flatSet),flat=prepareDetailSnapshot(flatReference,watchQuote(flatReference,[flatSet]),ET(10)).snapshot;
 expect(flat.headline).toMatchObject({last:20,change:0,tone:null});
 expect(prepareDetailSnapshot(reference,q,ET(10)).snapshot.blocks.summary.find(row=>row.label==='Bid')?.value).toBeNull();
});
