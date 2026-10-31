import {describe,it,expect} from 'vitest';
import {createNewsState,emptyNewsQuery,parseNews,queryNews,restoreNewsState,type NewsQuery} from '../../src/analysis-news/news';
import {documentCoverage,focusSymbolQuery,formatUtc,moveNewsSelection,newsFieldOptions,newsOptionIndex,resetNewsView,sameNewsQuery} from '../../src/analysis-news/news-view';
// Synthetic fixture written for these tests. Expected sets below were derived by hand from
// the literal records, not by running queryNews.
const at='2024-03-10T00:00:00Z';
const A=parseNews({schemaVersion:1,label:'Synthetic filter fixture A',kind:'synthetic',items:[
 {id:'a1',title:'Alpha one',provider:'P1',publishedAt:'2024-03-01T10:00:00Z',instruments:['GME'],markets:['stocks'],formats:['Flash']},
 {id:'a2',title:'Beta two',provider:'P2',publishedAt:'2024-03-02T23:30:00-05:00',instruments:['SPY'],markets:['ETFs'],countries:['US']},
 {id:'a3',title:'Gamma three',provider:'P1',publishedAt:'2024-03-03T00:00:00Z',markets:['stocks']},
 {id:'a4',title:'Delta four <b>bold</b>',summary:'<p>Contains <a href="javascript:alert(1)">bad</a> keyword zeta</p>',provider:'P3',publishedAt:'2024-03-04T12:00:00Z',instruments:['GME','SPY'],formats:['Important']},
]},'A',at);
const B=parseNews({schemaVersion:1,label:'Synthetic filter fixture B',kind:'synthetic',items:[
 {id:'b1',title:'Epsilon five',provider:'P2',publishedAt:'2024-03-05T09:00:00Z',instruments:[],markets:['crypto']},
 {id:'a1',title:'Alpha duplicate id in another document',provider:'P1',publishedAt:'2024-03-01T10:00:00Z',instruments:['GME']},
]},'B',at);
const docs=[A,B];
const ids=(q:NewsQuery,watch:string[]=[])=>{const r=queryNews(docs,q,watch);return {rows:r.rows.map(x=>x.documentId+':'+x.id),unavailable:r.unavailable,total:r.total};};
const q=(edit:(q:NewsQuery)=>void)=>{const x=emptyNewsQuery();edit(x);return x;};
describe('literal filter results',()=>{
 it('instrument filter: OR inside the field, missing metadata counted separately, deterministic ties',()=>{expect(ids(q(x=>{x.values.instruments=['GME'];}))).toEqual({rows:['A:a4','A:a1','B:a1'],unavailable:1,total:6});});
 it('instrument AND provider',()=>{expect(ids(q(x=>{x.values.instruments=['GME'];x.values.provider=['P1'];}))).toEqual({rows:['A:a1','B:a1'],unavailable:1,total:6});});
 it('market stocks OR ETFs (market hidden control values need the field visible)',()=>{expect(ids(q(x=>{x.visible.push('markets');x.values.markets=['stocks','ETFs'];}))).toEqual({rows:['A:a2','A:a3','A:a1'],unavailable:2,total:6});});
 it('inclusive UTC day range uses the normalized instant, not the supplied offset day',()=>{expect(ids(q(x=>{x.from='2024-03-03';x.to='2024-03-03';})).rows).toEqual(['A:a2','A:a3']);});
 it('search matches displayed text and instruments, never hidden markup or link targets',()=>{
  expect(ids(q(x=>{x.search='zeta';})).rows).toEqual(['A:a4']);
  expect(ids(q(x=>{x.search='bold';})).rows).toEqual(['A:a4']);
  expect(ids(q(x=>{x.search='alert';})).rows).toEqual([]);
  expect(ids(q(x=>{x.search='<b>';})).rows).toEqual([]);
  expect(ids(q(x=>{x.search='spy';})).rows).toEqual(['A:a4','A:a2']);
 });
 it('single current watchlist',()=>{expect(ids(q(x=>{x.watchlist=true;}),['SPY'])).toEqual({rows:['A:a4','A:a2'],unavailable:1,total:6});});
 it('oldest-first ordering with document then item tie-breaks',()=>{expect(ids(q(x=>{x.order='oldest';})).rows).toEqual(['A:a1','B:a1','A:a3','A:a2','A:a4','B:b1']);});
 it('empty supplied content differs from no supplied content',()=>{expect(queryNews([],emptyNewsQuery(),[])).toMatchObject({coverage:'unavailable',total:0,rows:[]});expect(queryNews([{...A,items:[]}],emptyNewsQuery(),[])).toMatchObject({coverage:'supplied',total:0,rows:[]});});
});
describe('view model',()=>{
 it('list navigation keys, including the initial Down and clamping',()=>{
  expect(moveNewsSelection(-1,5,'ArrowDown')).toBe(0);expect(moveNewsSelection(-1,5,'ArrowUp')).toBe(0);expect(moveNewsSelection(-1,5,'End')).toBe(4);
  expect(moveNewsSelection(0,5,'ArrowDown')).toBe(1);expect(moveNewsSelection(0,5,'ArrowUp')).toBe(0);expect(moveNewsSelection(4,5,'ArrowDown')).toBe(4);
  expect(moveNewsSelection(2,25,'PageDown')).toBe(12);expect(moveNewsSelection(12,25,'PageUp')).toBe(2);expect(moveNewsSelection(20,25,'PageDown')).toBe(24);
  expect(moveNewsSelection(3,25,' ')).toBe(13);expect(moveNewsSelection(13,25,' ',true)).toBe(3);
  expect(moveNewsSelection(7,25,'Home')).toBe(0);expect(moveNewsSelection(7,25,'End')).toBe(24);
  expect(moveNewsSelection(0,0,'ArrowDown')).toBeNull();expect(moveNewsSelection(0,5,'a')).toBeNull();expect(moveNewsSelection(0,5,'Enter')).toBeNull();
 });
 it('compares drafts semantically and resets every predicate while keeping controls',()=>{
  const a=q(x=>{x.values.instruments=['GME','SPY'];}),b=q(x=>{x.values.instruments=['SPY','GME'];});expect(sameNewsQuery(a,b)).toBe(true);expect(sameNewsQuery(a,q(()=>{}))).toBe(false);expect(sameNewsQuery(q(x=>{x.search='x';}),q(()=>{}))).toBe(false);
  const dirty=q(x=>{x.search='zeta';x.from='2024-01-01';x.to='2024-12-31';x.order='oldest';x.watchlist=true;x.visible.push('markets');x.values.markets=['stocks'];x.values.instruments=['GME'];});
  const reset=resetNewsView(dirty);expect(reset).toEqual({...emptyNewsQuery(),visible:['instruments','provider','markets']});expect(dirty.values.instruments).toEqual(['GME']);
 });
 it('focuses the chart symbol without disturbing other fields',()=>{const base=q(x=>{x.visible=['provider'];x.values.provider=['P1'];});const f=focusSymbolQuery(base,'GME');expect(f.visible).toEqual(['provider','instruments']);expect(f.values).toMatchObject({instruments:['GME'],provider:['P1']});expect(ids(f).rows).toEqual(['A:a1','B:a1']);expect(()=>focusSymbolQuery(base,' ')).toThrow();});
 it('filter menus list supplied counts and keep stale selected values visible',()=>{
  const index=newsOptionIndex(docs);
  expect(newsFieldOptions(index,'instruments',['TSLA'])).toEqual([{value:'GME',count:3,supplied:true,selected:false},{value:'SPY',count:2,supplied:true,selected:false},{value:'TSLA',count:0,supplied:false,selected:true}]);
  expect(newsFieldOptions(index,'provider',[]).map(o=>[o.value,o.count])).toEqual([['P1',3],['P2',2],['P3',1]]);
  expect(newsFieldOptions(index,'instruments',[],'sp').map(o=>o.value)).toEqual(['SPY']);
  expect(newsFieldOptions(index,'economics',[])).toEqual([]);
 });
 it('discloses per-document coverage and formats UTC without changing it',()=>{expect(documentCoverage(A)).toEqual({items:4,first:'2024-03-01T10:00:00.000Z',last:'2024-03-04T12:00:00.000Z',providers:3});expect(documentCoverage({...B,items:[]})).toEqual({items:0,first:null,last:null,providers:0});expect(formatUtc('2024-03-03T04:30:00.000Z')).toBe('2024-03-03 04:30:00 UTC');expect(formatUtc('not iso')).toBe('not iso');});
});
describe('persistence round trip',()=>{
 it('a saved flow survives JSON export/restore with identical results and stored raw content',()=>{
  const state=createNewsState();state.documents=[A,B];state.flows[0].query=q(x=>{x.values.instruments=['GME'];x.values.provider=['P1'];x.search='alpha';x.from='2024-03-01';x.order='oldest';});
  const restored=restoreNewsState(JSON.parse(JSON.stringify(state)));
  expect(sameNewsQuery(restored.flows[0].query,state.flows[0].query)).toBe(true);
  expect(queryNews(restored.documents,restored.flows[0].query,[]).rows.map(r=>r.documentId+':'+r.id)).toEqual(['A:a1','B:a1']);
  expect(restored.documents[0].items[3].summary).toBe(A.items[3].summary);
  expect(()=>restoreNewsState({...JSON.parse(JSON.stringify(state)),flows:[{...state.flows[0],query:{...state.flows[0].query,from:'2024-02-30'}}]})).toThrow();
 });
});
