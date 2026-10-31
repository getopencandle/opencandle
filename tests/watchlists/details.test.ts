import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createWatchBook,mergeWatchBook,referenceFromDataset,restoreWatchBook,renameWatchList} from '../../src/watchlists/model';
import type {WatchReference} from '../../src/watchlists/model';
import {watchQuote} from '../../src/watchlists/quotes';
import {defaultDetailPreferences,prepareDetailSnapshot,restoreDetailPreferences} from '../../src/watchlists/details';

function fixture(){
 const primary=fixtureDataset('GME',3);primary.provenance.datasetId='synthetic-details-primary';primary.resolution='5';
 primary.bars=[{time:1704153600,open:9,high:11,low:8,close:10,volume:5},{time:1704240000,open:10,high:21,low:9,close:20,volume:0}];
 const daily=structuredClone(primary);daily.provenance.datasetId='synthetic-details-daily';daily.resolution='1D';
 daily.bars=[{time:1703980800,open:9,high:12,low:8,close:10,volume:7},{time:1704067200,open:10,high:14,low:9,close:10,volume:0}];
 const reference:WatchReference={...referenceFromDataset(primary),dailyDatasetId:daily.provenance.datasetId},quote=watchQuote(reference,[primary,daily]);
 return{primary,daily,reference,quote,prepare:()=>prepareDetailSnapshot(reference,quote)};
}
it('detached details preserve literal zero and explicitly different daily and primary vintages',()=>{
 const h=fixture(),view=h.prepare().snapshot,values=(id:'summary'|'daily')=>Object.fromEntries(view.blocks[id].map(row=>[row.label,row.value]));
 expect(values('summary')['Last close']).toBe(20);expect(values('summary')['Close timestamp (UTC)']).toBe('2024-01-03 00:00');
 expect(values('daily')).toMatchObject({'Daily snapshot change':0,'Daily snapshot change %':0,'Daily snapshot volume':0,'Daily snapshot high':14,'Daily snapshot low':9,'Daily snapshot timestamp (UTC)':'2024-01-01 00:00'});
 expect(values('summary')).toMatchObject({'Bid':null,'Ask':null,'Current market status':null});expect(view.disclaimer).toContain('do not follow chart replay');
});
it('an explicit daily companion is required and an intraday source is never a substitute',()=>{const h=fixture();h.reference.dailyDatasetId=null;const view=prepareDetailSnapshot(h.reference,watchQuote(h.reference,[h.primary,h.daily])).snapshot;expect(view.blocks.daily.every(row=>row.value===null)).toBe(true);});
it('empty bound history retains instrument/source information without a fabricated close',()=>{const h=fixture();h.primary.bars=[];const view=prepareDetailSnapshot(h.reference,watchQuote(h.reference,[h.primary,h.daily])).snapshot;expect(view.blocks.summary.find(row=>row.label==='Last close')!.value).toBeNull();expect(view.blocks.identity.find(row=>row.label==='Ticker')!.value).toBe('GME');});
it('unbound real-market references remain unavailable instead of adopting fixture prices',()=>{const h=fixture(),reference={...h.reference,exchange:'NYSE',synthetic:false,datasetId:null,dailyDatasetId:null},view=prepareDetailSnapshot(reference,watchQuote(reference,[h.primary,h.daily])).snapshot;expect(view.synthetic).toBe(false);expect(view.blocks.summary.every(row=>row.value===null)).toBe(true);});
it.each(['revision','input','endpoint','daily','reference'] as const)('%s change retires prepared input without changing the detached displayed values',change=>{const h=fixture(),prepared=h.prepare();if(change==='revision')h.primary.provenance.revision+='-new';if(change==='input')h.primary.bars=[...h.primary.bars];if(change==='endpoint')h.primary.bars.at(-1)!.close=99;if(change==='daily')h.daily.bars.at(-1)!.high=99;if(change==='reference')h.reference.symbol='SPY';expect(()=>prepared.assertSource()).toThrow();expect(prepared.snapshot.blocks.summary[0].value).toBe(20);});
it('legacy absence stays absent until a preference is deliberately saved',()=>{const initial=createWatchBook();expect(Object.hasOwn(restoreWatchBook(initial),'detailBlocks')).toBe(false);expect(Object.hasOwn(renameWatchList(initial,initial.activeId,'Renamed'),'detailBlocks')).toBe(false);for(const invalid of [undefined,null,false,{}])expect(()=>restoreWatchBook({...initial,detailBlocks:invalid})).toThrow();});
it('explicit ordering and all-hidden preferences survive book JSON restore and unrelated edits',()=>{const prefs=defaultDetailPreferences();prefs.order.reverse();prefs.hidden=[...prefs.order];prefs.collapsed=['notes'];const book=restoreWatchBook({...createWatchBook(),detailBlocks:prefs}),reopened=restoreWatchBook(JSON.parse(JSON.stringify(book)));expect(reopened.detailBlocks).toEqual(prefs);expect(renameWatchList(reopened,reopened.activeId,'New name').detailBlocks).toEqual(prefs);});
it('merging watchlists preserves destination detail preferences',()=>{let id=0;const destination=restoreWatchBook({...createWatchBook(),detailBlocks:{...defaultDetailPreferences(),hidden:['daily']}}),incoming=restoreWatchBook({...createWatchBook(['SPY']),detailBlocks:{...defaultDetailPreferences(),hidden:['notes']}});expect(mergeWatchBook(destination,incoming,()=>String(++id)).detailBlocks).toEqual(destination.detailBlocks);});
it('preferences reject hostile descriptors and bounded-list violations without getter execution',()=>{let reads=0;const prefs=defaultDetailPreferences();Object.defineProperty(prefs,'order',{get(){reads++;return[];}});expect(()=>restoreDetailPreferences(prefs)).toThrow();expect(reads).toBe(0);expect(()=>restoreDetailPreferences({...defaultDetailPreferences(),hidden:Array(100000).fill('summary')})).toThrow();});
