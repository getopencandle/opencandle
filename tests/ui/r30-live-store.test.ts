// The live dataset store, the App render rule, the bindings that inject live values
// and owned element reuse. SYNTHETIC fixtures and in-memory stores only; no DOM (the hooks are controlled below).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {fixtureDataset} from '../../src/domain/fixtures';
import {LiveQuoteStore,LIVE_QUOTE_STALE_MS,liveQuoteSourceLabel,topOfBookDisplayQuote,type LiveQuote} from '../../src/domain/live-quotes';
import {watchQuoteDatasets} from '../../src/watchlists/live-watch';
import {createLiveDatasetStore,liveChangeNeedsAppRender,LiveBookBinding,WatchQuotesBinding,useLiveQuoteSnapshot} from '../../src/ui/live-dataset-store';
import {createOwnedElementCache,reuseOwnedElement} from '../../src/ui/element-cache';

// Controlled hooks: useMemo recomputes on dependency change, useSyncExternalStore records the subscription and reads the snapshot.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,subscriptions:[] as Array<{subscribe:(fn:()=>void)=>()=>void}>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useMemo:(make:()=>any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||prior.deps.length!==deps.length||prior.deps.some((v:any,k:number)=>!Object.is(v,deps[k])))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},
 useSyncExternalStore:(subscribe:(fn:()=>void)=>()=>void,getSnapshot:()=>any)=>{hooks.cursor++;hooks.subscriptions.push({subscribe});return getSnapshot();}};});
const render=(element:any)=>{hooks.cursor=0;hooks.subscriptions=[];return element.type(element.props);};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.subscriptions=[];vi.useFakeTimers();vi.setSystemTime(1_800_000_000_000);});
afterEach(()=>{vi.useRealTimers();});

const live=(symbol:string,close:number,extra:{state?:string;revision?:string}={})=>{const base=fixtureDataset(symbol,5),id='live:test:'+symbol+':5m';
 return{...base,resolution:'5m',bars:[...base.bars.slice(0,-1),{...base.bars.at(-1)!,close}],provenance:{...base.provenance,datasetId:id,revision:extra.revision??'r1',state:extra.state??'live'}} as any;};
function quote(instrumentId:string,bid:number,ask:number,receivedAt=Date.now()):LiveQuote{return{instrumentId,symbol:instrumentId,providerId:'test-synthetic',feed:'iex',bid,ask,bidSize:3,askSize:4,time:Math.floor(receivedAt/1000),receivedAt,synthetic:true};}

describe('live dataset store',()=>{
 it('replaces its snapshot on change, notifies once, and ignores an updater that returns the prior record',()=>{
  const store=createLiveDatasetStore(),seen:number[]=[];store.subscribe(()=>seen.push(1));
  const empty=store.getSnapshot();expect(store.getSnapshot()).toBe(empty);
  const gme=live('GME',10);store.update(prior=>({...prior,[gme.provenance.datasetId]:gme}));
  expect(store.getSnapshot()).not.toBe(empty);expect(store.getSnapshot()[gme.provenance.datasetId]).toBe(gme);expect(seen).toHaveLength(1);
  const kept=store.getSnapshot();store.update(prior=>prior);expect(store.getSnapshot()).toBe(kept);expect(seen).toHaveLength(1);
  const watch={datasets:[live('SPY',5)],notes:new Map()};store.setWatchFeeds(watch);expect(store.getWatchFeeds()).toBe(watch);expect(seen).toHaveLength(2);
  store.setWatchFeeds(watch);expect(seen).toHaveLength(2);
 });
 it('a listener that throws never stops the others',()=>{
  const store=createLiveDatasetStore(),seen:string[]=[];store.subscribe(()=>{throw new Error('listener');});store.subscribe(()=>seen.push('second'));
  store.update(prior=>({...prior,x:live('GME',1)}));expect(seen).toEqual(['second']);
 });
 it('App renders for the active source, the feed set and a feed identity change; another feed\'s newer snapshot reaches subscribers only',()=>{
  const gme=live('GME',10),spy=live('SPY',5),g=gme.provenance.datasetId,s=spy.provenance.datasetId,prior={[g]:gme,[s]:spy};
  expect(liveChangeNeedsAppRender(prior,prior,g)).toBe(false);
  expect(liveChangeNeedsAppRender(prior,{...prior,[g]:live('GME',11)},g),'active chart tick').toBe(true);
  expect(liveChangeNeedsAppRender(prior,{...prior,[s]:live('SPY',6)},g),'another feed tick').toBe(false);
  expect(liveChangeNeedsAppRender(prior,{...prior,[s]:live('SPY',6)},null),'no active live chart').toBe(false);
  expect(liveChangeNeedsAppRender(prior,{...prior,[s]:live('SPY',5,{state:'delayed'})},g),'state change').toBe(true);
  expect(liveChangeNeedsAppRender(prior,{...prior,[s]:live('SPY',5,{revision:'r2'})},g),'revision change').toBe(true);
  expect(liveChangeNeedsAppRender(prior,{[g]:gme},g),'feed closed').toBe(true);
  expect(liveChangeNeedsAppRender({[g]:gme},prior,g),'feed opened').toBe(true);
  expect(liveChangeNeedsAppRender(prior,{[g]:gme,['other']:spy},g),'same count, other id').toBe(true);
 });
});

describe('WatchQuotesBinding',()=>{
 it('injects the watch quote rows (newest live snapshot, then background feeds) and the notes into its child',()=>{
  const store=createLiveDatasetStore(),gmeOld=live('GME',10),universe=[gmeOld],child=createElement('div',{datasets:universe,id:'panel'});
  const element=createElement(WatchQuotesBinding,{store,universe,quotesProp:'quoteDatasets',notesProp:'liveNotes',children:child});
  const first=render(element);expect(first.props.id).toBe('panel');expect(first.props.quoteDatasets).toEqual([gmeOld]);
  const gmeNew=live('GME',12),spy=live('SPY',5),notes=new Map([['US:SPY',{text:'NO LIVE',title:'SYNTHETIC'}]]);
  store.update(prior=>({...prior,[gmeNew.provenance.datasetId]:gmeNew}));store.setWatchFeeds({datasets:[spy],notes});
  const second=render(element);
  expect(second.props.quoteDatasets).toEqual(watchQuoteDatasets(universe,store.getSnapshot(),[spy]));
  expect(second.props.quoteDatasets[0]).toBe(gmeNew);expect(second.props.liveNotes).toBe(notes);expect(second.props.datasets).toBe(universe);
  // Subscribed through useSyncExternalStore to the store (both snapshots).
  let calls=0;const off=hooks.subscriptions[0].subscribe(()=>calls++);store.update(prior=>({...prior,z:spy}));off();expect(calls).toBe(1);
 });
 it('names only the quotes prop when no notes prop is given (the list-alert dialog)',()=>{
  const store=createLiveDatasetStore(),universe=[live('GME',10)];
  const out=render(createElement(WatchQuotesBinding,{store,universe,quotesProp:'datasets',children:createElement('div',{datasets:[]})}));
  expect(out.props.datasets).toEqual(universe);expect('liveNotes' in out.props).toBe(false);
 });
});

describe('LiveBookBinding and useLiveQuoteSnapshot',()=>{
 const action=(instrumentId:string)=>({instrumentId,bid:9.9,ask:10.1,session:'regular',fixture:true,time:1,sequence:1} as any);
 it('dock: book and source follow topOfBookDisplayQuote over the action quote, as App computed them',()=>{
  const store=new LiveQuoteStore(undefined,0),q=quote('US:GME',10,10.2);store.publish(q);
  const dock=render(createElement(LiveBookBinding,{instrumentId:'US:GME',actionQuote:action('US:GME'),mode:'dock',store,children:createElement('section',{id:'dock'})}));
  expect(dock.props.id).toBe('dock');expect(dock.props.book).toEqual(topOfBookDisplayQuote(q,action('US:GME'),Date.now()));expect(dock.props.book.bid).toBe(10);
  expect(dock.props.bookSource).toBe(liveQuoteSourceLabel(q));
  const none=render(createElement(LiveBookBinding,{instrumentId:'US:GME',actionQuote:null,mode:'dock',store,children:createElement('section')}));
  expect(none.props.book).toBeNull();expect(none.props.bookSource).toBeNull();
 });
 it('ticket: the raw live quote; no instrument (replay, a relayed ticket): no book',()=>{
  const store=new LiveQuoteStore(undefined,0),q=quote('US:GME',10,10.2);store.publish(q);
  expect(render(createElement(LiveBookBinding,{instrumentId:'US:GME',mode:'ticket',store,children:createElement('form')})).props.book).toBe(q);
  expect(render(createElement(LiveBookBinding,{instrumentId:null,mode:'ticket',store,children:createElement('form')})).props.book).toBeNull();
  expect(hooks.subscriptions[0].subscribe(()=>{})).toBeTypeOf('function');
 });
 it('reads the instrument asked for at once (F10) and the newest stored quote',()=>{
  const store=new LiveQuoteStore(undefined,0),a=quote('US:GME',10,10.2),b=quote('US:SPY',500,500.1);store.publish(a);store.publish(b);
  const read=(id:string)=>{hooks.cursor=0;return useLiveQuoteSnapshot(id,store);};
  expect(read('US:GME')).toBe(a);expect(read('US:SPY')).toBe(b);
  const a2=quote('US:GME',10.05,10.15);store.publish(a2);expect(read('US:GME')).toBe(a2);
 });
 it('notifies on every published quote and once more when the quote turns stale, then hands a stale copy',()=>{
  const store=new LiveQuoteStore(undefined,0),q=quote('US:GME',10,10.2);store.publish(q);
  hooks.cursor=0;expect(useLiveQuoteSnapshot('US:GME',store)).toBe(q);
  let calls=0;const off=hooks.subscriptions.at(-1)!.subscribe(()=>calls++);
  store.publish(quote('US:GME',10.1,10.3));expect(calls).toBe(1);
  vi.advanceTimersByTime(LIVE_QUOTE_STALE_MS+2);expect(calls).toBe(2);
  hooks.cursor=0;const stale=useLiveQuoteSnapshot('US:GME',store)!;expect(stale).not.toBe(store.get('US:GME'));expect(stale).toEqual(store.get('US:GME'));
  hooks.cursor=0;expect(useLiveQuoteSnapshot('US:GME',store),'the stale form is stable').toBe(stale);
  const dock=render(createElement(LiveBookBinding,{instrumentId:'US:GME',actionQuote:action('US:GME'),mode:'dock',store,children:createElement('section')}));
  expect(dock.props.book,'a stale quote shows no book').toBeNull();
  off();store.publish(quote('US:GME',11,11.2));expect(calls).toBe(2);
 });
});

describe('owned element reuse',()=>{
 function Panel(_props:Record<string,unknown>){return null;}
 it('keeps the element while every prop is unchanged; a stable handler keeps its identity',()=>{
  const cache=createOwnedElementCache(),onChange=()=>'stable';
  const a=reuseOwnedElement(cache,'slot',createElement(Panel,{value:1,onChange}));
  const b=reuseOwnedElement(cache,'slot',createElement(Panel,{value:1,onChange}));
  expect(b).toBe(a);expect((b as any).props.onChange).toBe(onChange);
  const c=reuseOwnedElement(cache,'slot',createElement(Panel,{value:2,onChange}));expect(c).not.toBe(a);expect((c as any).props.value).toBe(2);
 });
 it('a handler that changes per render is forwarded after one rebuild; a replaced element keeps its own closures',()=>{
  const cache=createOwnedElementCache(),calls:string[]=[];
  const make=(value:number,tag:string)=>createElement(Panel,{value,onSave:()=>calls.push(tag)});
  const first=reuseOwnedElement(cache,'slot',make(1,'r1')) as any;
  const second=reuseOwnedElement(cache,'slot',make(1,'r2')) as any;expect(second).not.toBe(first);
  const third=reuseOwnedElement(cache,'slot',make(1,'r3')) as any;expect(third).toBe(second);
  second.props.onSave();expect(calls).toEqual(['r3']);
  first.props.onSave();expect(calls,'the first element still holds its own closure').toEqual(['r3','r1']);
  const rebuilt=reuseOwnedElement(cache,'slot',make(2,'r4')) as any;expect(rebuilt).not.toBe(second);
  reuseOwnedElement(cache,'slot',make(2,'r5'));
  second.props.onSave();rebuilt.props.onSave();expect(calls,'a replaced element forwards to the last closure of its own time').toEqual(['r3','r1','r3','r5']);
 });
 it('a handler that changes together with another prop, or with a dep, is passed as is (two children can share it)',()=>{
  const cache=createOwnedElementCache(),h1=()=>1,h2=()=>2,h3=()=>3;
  reuseOwnedElement(cache,'s',createElement(Panel,{value:1,onFavoritesChange:h1}),[h1]);
  const withProp=reuseOwnedElement(cache,'s',createElement(Panel,{value:2,onFavoritesChange:h2}),[h2]) as any;expect(withProp.props.onFavoritesChange).toBe(h2);
  const withDep=reuseOwnedElement(cache,'s',createElement(Panel,{value:2,onFavoritesChange:h3}),[h3]) as any;expect(withDep).not.toBe(withProp);expect(withDep.props.onFavoritesChange).toBe(h3);
 });
 it('deps rebuild, data props compare by content, keys are identity, and a falsy value drops the slot',()=>{
  const cache=createOwnedElementCache();
  const a=reuseOwnedElement(cache,'d',createElement(Panel,{recent:['GME']}),[1],['recent']);
  expect(reuseOwnedElement(cache,'d',createElement(Panel,{recent:['GME']}),[1],['recent'])).toBe(a);
  expect(reuseOwnedElement(cache,'d',createElement(Panel,{recent:['GME']}),[2],['recent'])).not.toBe(a);
  const keyed=reuseOwnedElement(cache,'k',createElement(Panel,{key:'one',value:1})) as any;expect(keyed.key).toBe('one');
  expect(reuseOwnedElement(cache,'k',createElement(Panel,{key:'two',value:1}))).not.toBe(keyed);
  expect(reuseOwnedElement(cache,'k',false)).toBe(false);expect(cache.has('k')).toBe(false);
  const reopened=reuseOwnedElement(cache,'k',createElement(Panel,{key:'two',value:1}));expect(reopened).not.toBe(keyed);
 });
});
