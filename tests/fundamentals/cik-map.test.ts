import {describe,it,expect} from 'vitest';
import {parseTickerFile,lookupCik,loadCikMap,saveCikMap,restoreCikMap} from '../../src/fundamentals/cik-map';
// Rows below are SYNTHETIC (invented tickers and CIKs) except GME/SPY, which are the built-in documented CIKs.
const SEC_SHAPE=JSON.stringify({'0':{cik_str:111,ticker:'ZZTOP',title:'Synthetic Top Co'},'1':{cik_str:'0000000222',ticker:'brk-b',title:'Synthetic Class B'},'2':{cik_str:0,ticker:'BAD',title:'zero cik'},'3':{cik_str:333,ticker:'ZZTOP',title:'duplicate'},'4':'junk'});
const EXCHANGE_SHAPE=JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[444,'Synthetic Four','FOUR','Nasdaq'],[555,'Bad','','x']]});
describe('cik map',()=>{
 it('parses the company_tickers.json shape and counts skipped rows',()=>{
  const {map,skipped}=parseTickerFile(SEC_SHAPE,'2026-10-27T00:00:00Z');
  expect(map.entries).toEqual([{ticker:'ZZTOP',cik:'0000000111',title:'Synthetic Top Co'},{ticker:'BRK-B',cik:'0000000222',title:'Synthetic Class B'}]);
  expect(skipped).toBe(3);
 });
 it('parses the exchange shape',()=>{
  const {map,skipped}=parseTickerFile(EXCHANGE_SHAPE);expect(map.entries).toEqual([{ticker:'FOUR',cik:'0000000444',title:'Synthetic Four'}]);expect(skipped).toBe(1);
 });
 it('rejects non-JSON, wrong shapes and empty results',()=>{
  expect(()=>parseTickerFile('not json')).toThrow(/not valid JSON/);expect(()=>parseTickerFile('[1]')).toThrow(/Expected SEC/);expect(()=>parseTickerFile('{}')).toThrow(/no usable/);
 });
 it('looks up case-insensitively, across class-share separators, and falls back to the built-ins',()=>{
  const {map}=parseTickerFile(SEC_SHAPE);
  expect(lookupCik(map,'zztop')).toMatchObject({cik:'0000000111',source:'ticker-file'});
  expect(lookupCik(map,'BRK.B')?.cik).toBe('0000000222');expect(lookupCik(map,'BRK/B')?.cik).toBe('0000000222');
  expect(lookupCik(map,'GME')).toMatchObject({cik:'0001326380',source:'built-in'});
  expect(lookupCik(map,'NOPE')).toBeNull();expect(lookupCik(null,'SPY')?.cik).toBe('0000884394');expect(lookupCik(null,'ZZTOP')).toBeNull();expect(lookupCik(map,'  ')).toBeNull();
 });
 it('round-trips through storage and tolerates missing or corrupt storage',()=>{
  const {map}=parseTickerFile(SEC_SHAPE,'2026-10-27T00:00:00Z'),store=new Map<string,string>();
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
  expect(saveCikMap(map,storage)).toBe(true);expect(loadCikMap(storage)).toEqual(map);
  saveCikMap(null,storage);expect(loadCikMap(storage)).toBeNull();
  store.set('lv.fundamentals.cik-map.v1','{bad');expect(loadCikMap(storage)).toBeNull();
  expect(saveCikMap(map,{setItem:()=>{throw new Error('quota');},removeItem:()=>{}})).toBe(false);expect(saveCikMap(map,null)).toBe(false);
  expect(()=>restoreCikMap({schemaVersion:1,importedAt:'x',entries:[{ticker:'A',cik:'12',title:''}]})).toThrow(/Invalid saved ticker row/);
 });
});
