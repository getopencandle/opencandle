import {describe,expect,it} from 'vitest';
import {createNewsState,emptyNewsQuery,newsItemKey,parseNews,queryNews} from '../../src/analysis-news/news';
import {normalizeSubmissions} from '../../src/analysis-news/filings';
import {emptyNewsLocal,evaluateFlowAlerts,filingsToNewsDocuments,loadNewsLocal,markRead,restoreNewsLocal,saveNewsLocal,setFlowAlert} from '../../src/analysis-news/news-local';
import {parseTickerFile} from '../../src/fundamentals/cik-map';

const at='2024-03-10T00:00:00Z';
const filings=()=>normalizeSubmissions({cik:1326380,name:'GameStop Corp.',filings:{recent:{
 accessionNumber:['0001326380-24-000010','0001326380-24-000005'],filingDate:['2024-03-26','2024-01-05'],form:['10-K','8-K'],primaryDocument:['gme-20240203.htm','gme8k.htm'],
 primaryDocDescription:['Annual report',''],reportDate:['2024-02-03',''],acceptanceDateTime:['2024-03-26T16:05:11.000Z','']},files:[]}},
 {kind:'local-import',retrievedAt:at,sourceUrl:null,sha256:null},'local-filings:t');
const news=(ids:string[])=>parseNews({schemaVersion:1,label:'N',kind:'synthetic',items:ids.map(id=>({id,title:'T '+id,provider:'P',publishedAt:'2024-03-01T10:00:00Z',instruments:['GME']}))},'n1',at);

describe('filings as news items',()=>{
 it('maps submissions rows to SEC Filing items with day precision and no guessed ticker',()=>{
  const [doc]=filingsToNewsDocuments([filings()],null);
  expect(doc.items.map(i=>[i.id,i.provider,i.formats,i.instruments,i.publishedAt])).toEqual([
   ['0001326380-24-000010','SEC',['Filing'],null,'2024-03-26T00:00:00.000Z'],['0001326380-24-000005','SEC',['Filing'],null,'2024-01-05T00:00:00.000Z']]);
  expect(doc.items[0].title).toBe('10-K filing · GameStop Corp.');
  expect(doc.items[0].summary).toContain('Filed 2024-03-26 (day precision)');
  expect(doc.items[1].summary).toContain('Report date unavailable');
 });
 it('uses the imported ticker file for the instrument, so filters and watchlists apply',()=>{
  const {map}=parseTickerFile(JSON.stringify({0:{cik_str:1326380,ticker:'gme',title:'GameStop'}}));
  const docs=filingsToNewsDocuments([filings()],map);
  expect(docs[0].items[0].instruments).toEqual(['GME']);
  const q=emptyNewsQuery();q.visible=['provider','formats'];q.values.provider=['SEC'];q.values.formats=['Filing'];
  expect(queryNews(docs,q,[]).rows).toHaveLength(2);
  q.watchlist=true;expect(queryNews(docs,q,['GME']).rows).toHaveLength(2);expect(queryNews(docs,q,['SPY']).rows).toHaveLength(0);
 });
});

describe('flow alerts and read state',()=>{
 const flowAll=()=>createNewsState().flows;
 it('the first pass only records existing items, later additions alert only for flows with alerts on',()=>{
  let local=setFlowAlert(emptyNewsLocal(),'all-news',true);
  const first=evaluateFlowAlerts(local,[news(['a','b'])],flowAll(),[]);expect(first.added).toEqual([]);local=first.local;expect(local.known).toHaveLength(2);
  const second=evaluateFlowAlerts(local,[news(['a','b','c'])],flowAll(),[]);
  expect(second.added).toEqual([{key:newsItemKey('n1','c'),flowId:'all-news'}]);expect(second.local.pending).toHaveLength(1);
  const off=evaluateFlowAlerts({...local,alertFlowIds:[]},[news(['a','b','c'])],flowAll(),[]);expect(off.added).toEqual([]);
 });
 it('a flow filter decides which new items alert, and reading clears the pending alert',()=>{
  const spy=[{id:'f',name:'Only SPY',query:{...emptyNewsQuery(),values:{...emptyNewsQuery().values,instruments:['SPY']}}}];
  const local=setFlowAlert({...emptyNewsLocal(),known:[]},'f',true);
  expect(evaluateFlowAlerts(local,[news(['a'])],spy,[]).added).toEqual([]);
  const any=[{...spy[0],query:emptyNewsQuery()}],hit=evaluateFlowAlerts({...local,known:[]},[news(['a'])],any,[]);
  expect(hit.added).toHaveLength(1);
  const read=markRead(hit.local,[newsItemKey('n1','a')]);
  expect(read.pending).toEqual([]);expect(read.read).toEqual([newsItemKey('n1','a')]);
 });
 it('new SEC filings alert like news and turning alerts off drops the flow pending items',()=>{
  const {map}=parseTickerFile(JSON.stringify({0:{cik_str:1326380,ticker:'GME',title:'GameStop'}}));
  const local=setFlowAlert({...emptyNewsLocal(),known:[]},'all-news',true);
  const r=evaluateFlowAlerts(local,filingsToNewsDocuments([filings()],map),flowAll(),[]);expect(r.added).toHaveLength(2);
  expect(setFlowAlert(r.local,'all-news',false).pending).toEqual([]);
 });
 it('storage round-trips and bad or missing storage falls back to an empty state',()=>{
  const mem=new Map<string,string>(),store={getItem:(k:string)=>mem.get(k)??null,setItem:(k:string,v:string)=>void mem.set(k,v)};
  const local=markRead({...emptyNewsLocal(),showFilings:true},['k']);expect(saveNewsLocal(local,store)).toBe(true);expect(loadNewsLocal(store)).toEqual(local);
  mem.set('lv.news.local.v1','{bad');expect(loadNewsLocal(store)).toEqual(emptyNewsLocal());expect(saveNewsLocal(local,null)).toBe(false);
  expect(restoreNewsLocal({schemaVersion:2})).toEqual(emptyNewsLocal());
 });
});
