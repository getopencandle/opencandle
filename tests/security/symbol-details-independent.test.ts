import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {referenceFromDataset} from '../../src/watchlists/model';
import {watchQuote} from '../../src/watchlists/quotes';
import {prepareDetailSnapshot,restoreDetailPreferences,defaultDetailPreferences} from '../../src/watchlists/details';
function fixture(){const supplied=fixtureDataset('GME',4),reference=referenceFromDataset(supplied),quote=watchQuote(reference,[supplied]);if(!quote.dataset)throw Error('The independent details fixture requires a resolved source');return{dataset:quote.dataset,reference,quote};}

it('details reject a quote source accessor before executing it',()=>{
 const h=fixture();let reads=0;Object.defineProperty(h.quote,'dataset',{get(){reads++;return h.dataset;},enumerable:true});
 expect(()=>prepareDetailSnapshot(h.reference,h.quote)).toThrow();expect(reads).toBe(0);
});
it('details reject an instrument accessor before reading source metadata',()=>{
 const h=fixture(),instrument=h.dataset.instrument;let reads=0;Object.defineProperty(h.dataset,'instrument',{get(){reads++;return instrument;},enumerable:true});
 expect(()=>prepareDetailSnapshot(h.reference,h.quote)).toThrow();expect(reads).toBe(0);
});
it('details reject an indexed endpoint getter instead of executing it during bounded snapshot preparation',()=>{
 const h=fixture(),ordinal=h.dataset.bars.length-1,last=h.dataset.bars[ordinal];let reads=0;Object.defineProperty(h.dataset.bars,String(ordinal),{get(){reads++;return last;},enumerable:true});
 expect(()=>prepareDetailSnapshot(h.reference,h.quote)).toThrow();expect(reads).toBe(0);
});
it('details read only bounded needed observations, never historical rows or the complete bar array',()=>{
 const h=fixture();let reads=0;Object.defineProperty(h.dataset.bars,'0',{get(){reads++;throw Error('Do not scan unrelated history');},enumerable:true});
 const prepared=prepareDetailSnapshot(h.reference,h.quote);expect(prepared.snapshot.symbol).toBe('GME');prepared.assertSource();expect(reads).toBe(0);
});
it('explicit malformed preferences never become missing-only defaults',()=>{
 for(const value of [null,undefined,{},false,{...defaultDetailPreferences(),schemaVersion:2},{...defaultDetailPreferences(),order:[]},{...defaultDetailPreferences(),hidden:['summary','summary']}])expect(()=>restoreDetailPreferences(value)).toThrow();
 expect(restoreDetailPreferences({...defaultDetailPreferences(),hidden:['summary','daily','identity','source','notes']})).toEqual({...defaultDetailPreferences(),hidden:['summary','daily','identity','source','notes']});
});
