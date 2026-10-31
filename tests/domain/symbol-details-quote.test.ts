import {expect,it} from 'vitest';
import {detailCoverage,detailKeyStatsWithFundamentals,detailMarketStatus,detailRanges} from '../../src/domain/symbol-details-quote';
import {detailSessionState,type DetailSnapshot,type DetailStat} from '../../src/watchlists/details';
import type {SymbolFundamentalsSummary} from '../../src/ui/symbol-details-fundamentals';

// SYNTHETIC data only.
const market={exchange:'SYNTHETIC',symbol:'GME',synthetic:true};
function snapshot(extra:Partial<DetailSnapshot>={}):DetailSnapshot{return{symbol:'GME',exchange:'SYNTHETIC',synthetic:true,description:'Synthetic instrument',headline:{last:15,change:1,changePercent:7.1,tone:'up',session:null},
 blocks:{summary:[],daily:[{label:'Daily snapshot low',value:10},{label:'Daily snapshot high',value:20}],identity:[{label:'Currency',value:'USD'},{label:'Exchange timezone',value:'America/New_York'}],source:[]},diagnostic:'',disclaimer:'',
 keyStats:[{label:'52-week high',value:40,reason:null},{label:'52-week low',value:5,reason:null},{label:'Market capitalization',value:null,reason:'x'},{label:'Price to earnings ratio (TTM)',value:null,reason:'x'},{label:'Basic EPS (TTM)',value:null,reason:'x'},{label:'Revenue (FY)',value:null,reason:'x'},{label:'Volume',value:100,reason:null}],...extra};}
const field=(id:string,label:string,value:number|null,unit:string|null)=>({id,label,value,unit,period:null,filed:null,form:null,accession:null,missingReason:value===null?'Not reported.':null});
function summary(fields=[field('eps_diluted','Diluted EPS (FY)',2.5,'USD/shares'),field('revenue','Revenue (FY)',null,'USD')],patch:Partial<SymbolFundamentalsSummary>={}):SymbolFundamentalsSummary{
 return{schemaVersion:1,market,availability:'available',reason:null,source:{kind:'synthetic',label:'Synthetic fixture',retrievedAt:null,sourceUrl:null,sha256:null},entity:{name:'Synthetic Co',cik:'0000000001'},asOf:null,fields,...patch};}

it('market status classifies each OpenCandle calendar reading and states when none is known',()=>{
 // 2026-10-27 is a Tuesday. 14:00 UTC = 10:00 New York (regular), 12:00 UTC = 08:00 (pre), 21:00 UTC = 17:00 (post), 03:00 UTC overnight.
 const at=(hour:number)=>detailMarketStatus(detailSessionState('America/New_York','stock',Date.UTC(2026,9,27,hour)/1000));
 expect(at(14).state).toBe('open');expect(at(12).state).toBe('pre');expect(at(21).state).toBe('post');expect(at(3).state).toBe('closed');
 expect(detailMarketStatus(detailSessionState('America/New_York','stock',Date.UTC(2026,9,25,15)/1000))).toMatchObject({state:'closed',label:'Market closed'});
 const none=detailMarketStatus(detailSessionState('Europe/London','stock',Date.UTC(2026,9,27,12)/1000));
 expect(none.state).toBe('unknown');expect(none.label).toBe('Market status not available');expect(at(14).detail).toContain('not an exchange feed');
});
it('ranges place the last close between low and high, clamp outside values, and state missing inputs',()=>{
 const [day,year]=detailRanges(snapshot());
 expect(day).toMatchObject({low:10,high:20,position:50,reason:null});expect(year).toMatchObject({low:5,high:40,position:28.57});
 expect(detailRanges(snapshot({headline:{last:99,change:null,changePercent:null,tone:null,session:null}}))[0].position).toBe(100);
 expect(detailRanges(snapshot({blocks:{...snapshot().blocks,daily:[{label:'Daily snapshot low',value:5},{label:'Daily snapshot high',value:5}]}}))[0].position).toBe(50);
 const missing=detailRanges(snapshot({blocks:{...snapshot().blocks,daily:[]},keyStats:[{label:'52-week high',value:null,reason:'Needs a full year of daily history.'}]}));
 expect(missing[0]).toMatchObject({low:null,position:null,reason:'Needs the daily bar of the day.'});expect(missing[1].reason).toBe('Needs a full year of daily history.');
 expect(detailRanges(snapshot({blocks:{...snapshot().blocks,daily:[{label:'Daily snapshot low',value:30},{label:'Daily snapshot high',value:20}]}}))[0].reason).toContain('above');
 expect(detailRanges(snapshot({headline:undefined}))[0]).toMatchObject({low:10,position:null});
});
it('key stats take reported EPS, derive P/E only in a matching currency, and never fill market cap',()=>{
 const stats=snapshot().keyStats as DetailStat[],get=(rows:DetailStat[]|undefined,label:string)=>rows!.find(row=>row.label===label)!;
 expect(detailKeyStatsWithFundamentals(stats,undefined,15,'USD')).toEqual(stats);
 const filled=detailKeyStatsWithFundamentals(stats,summary(),15,'USD');
 expect(get(filled,'Diluted EPS (FY)').value).toBe('2.5 USD/shares');expect(get(filled,'Price to earnings ratio').value).toBe('6 (last close / Diluted EPS (FY))');
 expect(get(filled,'Revenue (FY)')).toEqual({label:'Revenue (FY)',value:null,reason:'Not reported.'});
 expect(get(filled,'Market capitalization').value).toBeNull();expect(get(filled,'Market capitalization').reason).toContain('shares outstanding');
 expect(get(filled,'Volume')).toEqual(stats.find(row=>row.label==='Volume'));
 expect(get(detailKeyStatsWithFundamentals(stats,summary(),15,'EUR'),'Price to earnings ratio').reason).toContain('currency');
 expect(get(detailKeyStatsWithFundamentals(stats,summary([field('eps_diluted','Diluted EPS (FY)',-1,'USD/shares')]),15,'USD'),'Price to earnings ratio').reason).toContain('negative');
 expect(get(detailKeyStatsWithFundamentals(stats,summary(),null,'USD'),'Price to earnings ratio').reason).toContain('last supplied close');
 const none=detailKeyStatsWithFundamentals(stats,null,15,'USD');expect(get(none,'Basic EPS (TTM)').reason).toContain('Open fundamentals');
 const pending=detailKeyStatsWithFundamentals(stats,summary([],{availability:'not-loaded',reason:'Nothing linked yet.'}),15,'USD');
 expect(get(pending,'Basic EPS (TTM)')).toEqual({label:'Basic EPS (TTM)',value:null,reason:'Nothing linked yet.'});
 expect(detailKeyStatsWithFundamentals(undefined,summary(),15,'USD')).toBeUndefined();
});
it('coverage lists every section without a source as not available and uses the fundamentals entity when present',()=>{
 const rows=detailCoverage(snapshot(),null,'stock'),ids=rows.map(row=>row.id);
 expect(ids).toEqual(['exchange','profile','identifiers','sector','earnings','dividends','technical','seasonals','news','bonds','options']);
 expect(rows[0].value).toBe('Demo (America/New_York)');expect(rows.slice(1).every(row=>row.value===null&&!!row.reason)).toBe(true); // The SYNTHETIC exchange display was renamed display from OpenCandle to Demo (displayExchange)
 const fund=detailCoverage(snapshot(),summary(),'etf');expect(fund.find(row=>row.id==='profile')!.value).toBe('Synthetic Co');
 expect(fund.find(row=>row.id==='identifiers')!.value).toContain('CIK 0000000001');expect(fund.map(row=>row.id)).toContain('etf-holdings');expect(fund.map(row=>row.id)).toContain('etf-expense');
 expect(JSON.stringify(fund)).not.toMatch(/[–—]/);
});
