import {it,expect} from 'vitest';
import {createFundamentalsPreferences,createFundamentalsView,linkedDocumentId,pruneFundamentalsLinks,resolveFilingCutoff,restoreFundamentalsPreferences,restoreFundamentalsView,setFundamentalsLink,utcToday} from '../../src/fundamentals/preferences';
const gme={exchange:'NYSE',symbol:'GME',synthetic:false},demo={exchange:'LV',symbol:'GME',synthetic:true};
it('defaults to income, annual, automatic scale and a today (UTC) cutoff',()=>{
 const view=createFundamentalsView();
 expect(view).toEqual({tab:'income',basis:'FY',currency:null,scale:'auto',cutoffMode:'today',cutoffDate:null,revisions:'latest',columns:8,line:null});
 expect(resolveFilingCutoff(view,'2026-10-15')).toBe('2026-10-15');
 expect(resolveFilingCutoff({...view,cutoffMode:'date',cutoffDate:'2024-06-10'},'2026-10-15')).toBe('2024-06-10');
 expect(resolveFilingCutoff({...view,cutoffMode:'none'},'2026-10-15')).toBeNull();
 expect(()=>resolveFilingCutoff({...view,cutoffMode:'date'},'2026-10-15')).toThrow('date');
 // 23:30 at UTC-7 on Oct 14 is already Oct 15 in UTC.
 expect(utcToday(new Date('2026-10-14T23:30:00-07:00'))).toBe('2026-10-15');
});
it('round-trips through JSON and rejects malformed or extra settings',()=>{
 const prefs=setFundamentalsLink({...createFundamentalsPreferences(),view:{...createFundamentalsView(),tab:'statistics',basis:'TTM',currency:'USD',cutoffMode:'date',cutoffDate:'2024-12-31',columns:12}},gme,'sec:0001326380');
 expect(restoreFundamentalsPreferences(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
 const view=createFundamentalsView();
 expect(()=>restoreFundamentalsView({...view,columns:7})).toThrow('option');
 expect(()=>restoreFundamentalsView({...view,cutoffMode:'date'})).toThrow('date');
 expect(()=>restoreFundamentalsView({...view,cutoffDate:'2024-02-30'})).toThrow('calendar');
 expect(()=>restoreFundamentalsView({...view,extra:1})).toThrow('Invalid fundamentals view');
 expect(()=>restoreFundamentalsView(Object.create({tab:'income'}))).toThrow();
 expect(()=>restoreFundamentalsPreferences({...prefs,links:[...prefs.links,{...prefs.links[0]}]})).toThrow('Duplicate');
 expect(()=>restoreFundamentalsPreferences({...prefs,schemaVersion:2})).toThrow();
});
it('links exact market identities only, and unlinks or prunes them explicitly',()=>{
 let prefs=setFundamentalsLink(createFundamentalsPreferences(),gme,'sec:0001326380');
 expect(linkedDocumentId(prefs.links,gme)).toBe('sec:0001326380');
 // The same ticker on a synthetic demo market is a different identity.
 expect(linkedDocumentId(prefs.links,demo)).toBeNull();
 prefs=setFundamentalsLink(prefs,demo,'synthetic-facts');
 prefs=setFundamentalsLink(prefs,gme,'local-facts:x');expect(prefs.links).toHaveLength(2);expect(linkedDocumentId(prefs.links,gme)).toBe('local-facts:x');
 expect(pruneFundamentalsLinks(prefs,['synthetic-facts']).links).toEqual([{...demo,documentId:'synthetic-facts'}]);
 expect(pruneFundamentalsLinks(prefs,['synthetic-facts','local-facts:x'])).toBe(prefs);
 expect(setFundamentalsLink(prefs,gme,null).links).toHaveLength(1);
 expect(()=>setFundamentalsLink(prefs,{...gme,symbol:''},'x')).toThrow('link');
});
