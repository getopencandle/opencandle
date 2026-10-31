import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {createWatchAdvancedState,prepareWatchAdvancedInput,queryWatchAdvancedEvents,queryWatchAdvancedNews} from '../../src/watchlists/advanced';
import {parseCalendarJson} from '../../src/domain/calendar';
import {parseNews} from '../../src/analysis-news/news';
// Pre-existing leak found in the calendar review: totals under a historical cutoff must not reveal later revisions or articles.
const day=86400,start=Date.UTC(2026,6,1)/1000,now=Date.UTC(2026,9,14,16)/1000,cut=Date.UTC(2026,9,10)/1000;
function dataset(symbol:string):BarDataset{const value=fixtureDataset(symbol,1);value.instrument={...value.instrument,id:'TEST:'+symbol,symbol,exchange:'TEST',name:'Synthetic '+symbol};value.provenance={...value.provenance,providerId:'unit-test',providerName:'Synthetic supplied input',datasetId:'test:'+symbol,revision:'1',session:'regular',asOf:now};value.bars=[{time:start,open:10,high:10,low:10,close:10,volume:1}];return value;}
function request(asOf:number|null){const source=dataset('A'),state=createWatchAdvancedState();state.settings.asOf=asOf;return prepareWatchAdvancedInput({list:{id:'watch',name:'Synthetic watchlist',favorite:false,sort:null,rows:[{id:'row',kind:'symbol',reference:{exchange:'TEST',symbol:'A',synthetic:true,datasetId:'test:A',dailyDatasetId:null}}]},datasets:[source],settings:state.settings,data:state.data,now});}
describe('Advanced View counts respect the historical availability cutoff',()=>{
 it('event revision totals count only revisions published by the cutoff; latest view keeps the full total',()=>{
  const imported=parseCalendarJson(JSON.stringify([{id:'e',revision:1,kind:'earnings',title:'Earnings',date:'2026-10-20',symbol:'TEST:A',publishedAt:cut-day},{id:'e',revision:2,kind:'earnings',title:'Earnings revised',date:'2026-10-21',symbol:'TEST:A',publishedAt:cut+day},{id:'later',revision:1,kind:'earnings',title:'Announced later',date:'2026-10-22',symbol:'TEST:A',publishedAt:cut+2*day}]),{fixture:true,documentId:'events',now});
  expect(imported.diagnostics).toEqual(expect.any(Array));expect(imported.ok,imported.diagnostics.join(' ')).toBe(true);
  const latest=queryWatchAdvancedEvents(request(null),[imported.document!],'earnings');expect(latest.supplied).toBe(3);
  const historical=queryWatchAdvancedEvents(request(cut),[imported.document!],'earnings');expect(historical.supplied).toBe(1);expect(historical.rows.map(row=>row.event.revision)).toEqual([1]);expect(historical.diagnostics.join(' ')).toMatch(/published by the availability cutoff/);
 });
 it('news totals, unavailable counts and filter choices exclude articles published after the cutoff',()=>{
  const document=parseNews({schemaVersion:1,label:'Synthetic news',kind:'synthetic',items:[{id:'before',title:'Before',provider:'early-provider',publishedAt:'2026-10-09T15:00:00Z',instruments:['TEST:A']},{id:'after',title:'After',provider:'late-provider',publishedAt:'2026-10-12T15:00:00Z',instruments:['TEST:A']}]},'news','2026-10-13T00:00:00Z');
  const latest=queryWatchAdvancedNews(request(null),[document]);expect(latest.supplied).toBe(2);expect(latest.choices.provider).toEqual(['early-provider','late-provider']);
  const historical=queryWatchAdvancedNews(request(cut),[document]);expect(historical.supplied).toBe(1);expect(historical.rows.map(row=>row.id)).toEqual(['before']);expect(historical.choices.provider).toEqual(['early-provider']);
 });
});
