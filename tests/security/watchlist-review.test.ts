import {it,expect} from 'vitest';
import {createWatchBook,restoreWatchBook,importWatchText,exportWatchText,activeWatchList,resolveWatchSource,rebindWatchRow,referenceFromDataset,WATCH_BYTES} from '../../src/watchlists/model';
import {createRequire} from 'node:module';
const validation=createRequire(import.meta.url)('../../electron/validation.cjs');
import {watchQuote} from '../../src/watchlists/quotes';
import {fixtureDataset} from '../../src/domain/fixtures';
it('rejects malformed saved list/row identities and reference fields without coercion or state mutation',()=>{
 const original=createWatchBook(),before=JSON.stringify(original);
 for(const invalid of [7,{},['list'],'flag:red']){const candidate=structuredClone(original);candidate.lists[0].id=invalid as string;expect(()=>restoreWatchBook(candidate)).toThrow();}
 for(const invalid of [false,{},['row']]){const candidate=structuredClone(original);candidate.lists[0].rows[0].id=invalid as string;expect(()=>restoreWatchBook(candidate)).toThrow();}
 const candidate=structuredClone(original);const row=candidate.lists[0].rows[0];if(row.kind!=='symbol')throw Error();row.reference.datasetId=123 as unknown as string;expect(()=>restoreWatchBook(candidate)).toThrow();
 expect(JSON.stringify(original)).toBe(before);
});
it('imports TXT atomically and never invents a source or fixture label for declared market tokens',()=>{
 const original=createWatchBook([]),before=JSON.stringify(original);let serial=0;
 for(const text of ['NYSE:GME,NYSE:GME','NYSE:GME,','NYSE:GME,<script>','NYSE:GME,###SECTION','GME'])expect(()=>importWatchText(original,text,'imported','Synthetic negative-case tokens',()=>String(++serial))).toThrow();
 const imported=importWatchText(original,'NYSE:GME,NASDAQ:GME','imported','Synthetic unresolved-token test',()=>String(++serial));
 for(const row of activeWatchList(imported).rows){if(row.kind!=='symbol')throw Error();expect(row.reference.synthetic).toBe(false);expect(row.reference.datasetId).toBeNull();expect(resolveWatchSource(row.reference,[fixtureDataset('GME')])).toBeNull();expect(watchQuote(row.reference,[fixtureDataset('GME')]).last).toBeNull();}
 expect(JSON.stringify(original)).toBe(before);
});
it('enforces TXT UTF-8/count and saved-book list/row limits before any mutation',()=>{
 const book=createWatchBook([]),before=JSON.stringify(book);let serial=0;
 expect(()=>importWatchText(book,'é'.repeat(WATCH_BYTES/2+1),'too-big','Synthetic oversize',()=>String(++serial))).toThrow('2 MiB');
 expect(()=>importWatchText(book,Array.from({length:5001},(_,i)=>'LOCAL:T'+i).join(','),'too-many','Synthetic count test',()=>String(++serial))).toThrow('5,000');
 const lists=Array.from({length:101},(_,i)=>({...book.lists[0],id:'list-'+i}));expect(()=>restoreWatchBook({...book,lists})).toThrow();
 const rows=Array.from({length:5001},(_,i)=>({id:'row-'+i,kind:'symbol',reference:{symbol:'T'+i,exchange:'LOCAL',datasetId:null,dailyDatasetId:null,synthetic:false}}));expect(()=>restoreWatchBook({...book,lists:[{...book.lists[0],rows}]})).toThrow();
 expect(JSON.stringify(book)).toBe(before);
});
it('cannot resolve or rebind a different exchange even when ticker/source-ID/fixture-state match',()=>{
 const dataset=fixtureDataset('GME',2);dataset.provenance.datasetId='synthetic-review-provider-source';
 const reference={...referenceFromDataset(dataset),exchange:'NYSE'};
 expect(resolveWatchSource(reference,[dataset])).toBeNull();expect(watchQuote(reference,[dataset]).last).toBeNull();
 const book=importWatchText(createWatchBook([]),'NYSE:GME','nyse','Synthetic exchange negative test',()=> 'market-row');
 expect(()=>rebindWatchRow(book,'nyse','market-row',dataset)).toThrow();
});
it('never turns duplicate exact source candidates into an arbitrary quote',()=>{
 const dataset=fixtureDataset('GME',2);dataset.provenance.datasetId='synthetic-review-duplicate-source';const reference=referenceFromDataset(dataset);
 expect(resolveWatchSource(reference,[dataset,structuredClone(dataset)])).toBeNull();expect(watchQuote(reference,[dataset,structuredClone(dataset)]).last).toBeNull();
});
it('preserves primary Last/time/source when a compatible daily companion supplies separate daily fields',()=>{
 const primary=fixtureDataset('GME',2);primary.resolution='1m';primary.provenance.datasetId='synthetic-review-minute';primary.bars=[{time:120,open:14,high:15,low:13,close:14,volume:10},{time:180,open:14,high:20,low:14,close:19,volume:20}];
 const daily={...structuredClone(primary),resolution:'1D',provenance:{...primary.provenance,datasetId:'synthetic-review-daily'},bars:[{time:10,open:10,high:11,low:9,close:10,volume:100},{time:20,open:10,high:13,low:10,close:12,volume:200}]};
 const reference={...referenceFromDataset(primary),dailyDatasetId:daily.provenance.datasetId},quote=watchQuote(reference,[primary,daily]);
 expect(quote.last).toBe(19);expect(quote.asOf).toBe(180);expect(quote.dataset).toBe(primary);expect(quote.change).toBe(2);expect(quote.changePercent).toBe(20);expect(quote.volume).toBe(200);
 const missing=watchQuote(reference,[primary]);expect(missing.last).toBe(19);expect(missing.change).toBeNull();expect(missing.volume).toBeNull();expect(missing.reason).toMatch(/daily/i);
});
it('canonical watchlist export excludes unknown workspace/credentials/bar payloads and TXT contains only market identifiers',()=>{
 const book=createWatchBook(),input={...book,workspace:{privateLocalNote:'Synthetic negative case'},apiKey:'synthetic-never-store',bars:[{close:99}]};
 const canonical=restoreWatchBook(input),text=JSON.stringify(canonical);
 expect(text).not.toContain('privateLocalNote');expect(text).not.toContain('apiKey');expect(text).not.toContain('bars');
 expect(validation.dataExportInput({text,format:'json',suggestedName:'LV-SYNTHETIC-watchlists.json'}).bytes.toString('utf8')).toBe(text);
 expect(exportWatchText(canonical)).toBe('SYNTHETIC:GME,SYNTHETIC:SPY');
 expect(()=>validation.dataExportInput({text:JSON.stringify(input),format:'json',suggestedName:'LV-SYNTHETIC-watchlists.json'})).toThrow();
 expect(()=>validation.dataExportInput({text:'{"schemaVersion":1,"__proto__":{}}',format:'json',suggestedName:'LV-SYNTHETIC-watchlists.json'})).toThrow();
});
