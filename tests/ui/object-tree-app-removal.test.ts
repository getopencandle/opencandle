import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel,studyMoveTarget} from '../../src/ui/ObjectTreePanel';
import {removeObjectsAsOneStep} from '../../src/ui/object-tree-removal';
import {friendlyError} from '../../src/ui/user-error';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,chartSourceContextKey} from '../../src/chart/source-context';
import {indicatorEditFingerprint} from '../../src/ui/indicator-library';
import {confirmAnalysisPublication} from '../../src/ui/analysis-capture-confirmation';
import {objectTreeHistoryHarness} from './object-tree-history-harness';
import {find,event} from './object-tree-panel-harness';

// Shipped path: the Object tree's multi-select Delete reaches the host through App.applyObjectTreeRemoval.
// This runs the EXACT current App function bodies (extracted from src/ui/App.tsx, the same technique as
// tests/security/analysis-legend-independent.test.ts) with the actual ObjectTreePanel, the actual indicator port,
// drawing manager and createWorkspaceHistory (tests/ui/object-tree-history-harness.ts). The grid capture that
// republishes the saved cell after each native notification is modeled. The wiring itself (the objectTree props the
// mounted App passes) is tests/ui/object-tree-app-wiring.test.ts. Not a mounted DOM or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const start=app.indexOf(' const analysisRenderOwner='),end=app.indexOf(' const closeChartDialog=',start);
const captureLine=app.split(/\r?\n/).find(line=>line.includes('const captureIndicators='));
if(start<0||end<0||!captureLine||!app.includes('function applyObjectTreeRemoval('))throw Error('The exact App Object tree removal extraction boundaries changed.');
const body=stripTypeScriptTypes(captureLine+'\n'+app.slice(start,end),{mode:'strip'});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHistoryHarness>[0]={},wire:{batch?:boolean;legend?:boolean}={batch:true,legend:true}){
 const h=await objectTreeHistoryHarness(options);disposers.push(h.dispose);
 // Lexical state the App closures read: one saved cell, republished after every native notification (modeled grid capture).
 const data=fixtureDataset('GME',3),bars=data.bars,source=sourceContextForDataset(data,bars),gridEpoch=7;
 const workspace:any={chartStyle:'candles',grid:{layout:{activeCellId:'cell-a'},cells:{'cell-a':{indicators:structuredClone(h.port.serialize()),comparisons:[]}}}};
 const current={current:workspace},currentInput={current:{dataset:data,bars,datasets:[data],replay:null} as any},currentReplay={current:null as any};
 const gridGeneration={current:gridEpoch},storageMutation={current:false},workspaceTransaction={current:false};
 const messages:string[]=[],quarantines:unknown[]=[],views:unknown[]=[];
 const chart:any={...h.chart,isInputCurrent:()=>true,reportAnalysisPublicationFailure:(error:unknown)=>{quarantines.push(error);}};
 const activeController={current:chart};
 // PauseCapture() models a grid capture that did not reach the saved cell.
 let capturing=true;const confirm=vi.fn(confirmAnalysisPublication);
 const publish=()=>{if(!capturing)return;const saved=current.current,grid=saved.grid;current.current={...saved,grid:{...grid,cells:{...grid.cells,'cell-a':{...grid.cells['cell-a'],indicators:structuredClone(h.port.serialize())}}}};currentInput.current={...currentInput.current};};
 disposers.push(h.port.subscribe(publish),h.adapter.subscribe(publish));
 const bindings={chart,dataset:data,bars,source,workspace,replay:null,gridEpoch,current,currentInput,currentReplay,activeController,gridGeneration,storageMutation,workspaceTransaction,sourceContextForDataset,chartSourceContextKey,indicatorEditFingerprint,confirmAnalysisPublication:confirm,removeObjectsAsOneStep,studyMoveTarget,assertDialogContext(){},setMessage:(message:unknown)=>messages.push(String(message)),reportFailure:(cause:unknown)=>messages.push(friendlyError(cause)),setIndicatorViews:(next:unknown)=>{views.push(next);}};
 const route=new Function(...Object.keys(bindings),body+'\nreturn {removal:applyObjectTreeRemoval,legend:applyIndicatorLegendAction};')(...Object.values(bindings)) as {removal:(request:any)=>void;legend:(row:any,remove?:boolean)=>void};
 const removal=vi.fn(route.removal),legend=vi.fn(route.legend);
 // The props the Object tree gets from App: onIndicatorAction (legend route) and onRemoveObjects (the batch route).
 const props:any={chart,dataset,get indicators(){return h.port.list();},onError:vi.fn(),onDrawingsChanged:vi.fn(),onIndicatorAction:(row:any,action:string)=>legend(row,action==='remove'),...(wire.batch===false?{}:{onRemoveObjects:(request:any)=>removal(request)})};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.forEach(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const select=(...keys:string[])=>keys.forEach((key,index)=>row(key).props.onClick(event(index?{ctrlKey:true}:{})));
 const del=()=>render().props.onKeyDown(event({key:'Delete'}));
 const ids=()=>h.port.list().map(item=>item.id);
 const drawings=()=>h.nativeRows().map(item=>item.id).sort();
 return {h,props,removal,legend,messages,quarantines,views,gridGeneration,current,row,select,del,ids,drawings,confirm,pauseCapture:()=>{capturing=false;},saved:()=>current.current.grid.cells['cell-a'].indicators.map((item:any)=>item.id)};
}
type Mounted=Awaited<ReturnType<typeof mount>>;
/** One Delete: exactly one history step, undo restores everything, redo reapplies it, and App raised nothing. */
function oneStep(t:Mounted,action:()=>void,check:(phase:'after'|'undone'|'redone')=>void){
 const before=t.h.committed(),steps=t.h.history.status().undo;
 action();
 expect(t.h.history.status().undo).toBe(steps+1);expect(t.messages).toEqual([]);expect(t.quarantines).toEqual([]);expect(t.props.onError).not.toHaveBeenCalled();
 const after=t.h.committed();expect(after).not.toEqual(before);check('after');
 expect(t.h.restore('undo')).toBe(true);expect(t.h.committed()).toEqual(before);expect(t.h.history.status()).toMatchObject({undo:steps,redo:1});check('undone');
 expect(t.h.restore('redo')).toBe(true);expect(t.h.committed()).toEqual(after);expect(t.h.history.status()).toMatchObject({undo:steps+1,redo:0});check('redone');
}

describe('FX-F5 shipped path: Object tree multi-select Delete through App.applyObjectTreeRemoval',()=>{
 it('2 indicators + 1 drawing: ONE undo step, one batch call, saved cell follows native, undo restores all three',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.select('study:'+vol,'study:'+sma,'drawing:line-a');
  oneStep(t,()=>t.del(),phase=>{
   expect(t.ids()).toEqual(phase==='undone'?[vol,sma]:[]);expect(t.drawings()).toEqual(phase==='undone'?['line-a','line-b','line-c']:['line-b','line-c']);
  });
  expect(t.removal).toHaveBeenCalledOnce();expect(t.legend).not.toHaveBeenCalled();
  expect(t.removal.mock.calls[0][0]).toMatchObject({drawingIds:['line-a']});expect(t.removal.mock.calls[0][0].indicators.map((item:any)=>item.id)).toEqual([vol,sma]);
 });
 it('after the accepted batch the App saved cell equals the native indicator list (the App capture check passed, nothing quarantined)',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.select('study:'+vol,'study:'+sma);t.del();
  expect(t.ids()).toEqual([rsi]);expect(t.saved()).toEqual([rsi]);expect(t.messages).toEqual([]);expect(t.quarantines).toEqual([]);expect(t.h.history.status().undo).toBe(1);
 });
 it('2 indicators only (no drawing): ONE undo step',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.select('study:'+vol,'study:'+sma);
  oneStep(t,()=>t.del(),phase=>expect(t.ids()).toEqual(phase==='undone'?[vol,sma,rsi]:[rsi]));
  expect(t.removal).toHaveBeenCalledOnce();
 });
 it('1 indicator + 1 drawing: ONE undo step',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.select('study:'+sma,'drawing:line-b');
  oneStep(t,()=>t.del(),phase=>{expect(t.ids()).toEqual(phase==='undone'?[vol,sma]:[vol]);expect(t.drawings().includes('line-b')).toBe(phase==='undone');});
 });
 it('a single indicator still goes through the legend route (one step), not the batch route',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.select('study:'+vol);
  oneStep(t,()=>t.del(),phase=>expect(t.ids()).toEqual(phase==='undone'?[vol,sma]:[sma]));
  expect(t.legend).toHaveBeenCalledOnce();expect(t.removal).not.toHaveBeenCalled();
 });
 it('control: with the batch route unwired (the app before this change) the same selection is 3 steps',async()=>{
  const t=await mount({indicators:['volume','sma']},{batch:false,legend:true});const [vol,sma]=t.h.ids;
  t.select('study:'+vol,'study:'+sma,'drawing:line-a');t.del();
  expect(t.ids()).toEqual([]);expect(t.drawings()).toEqual(['line-b','line-c']);
  expect(t.h.history.status().undo).toBe(3);expect(t.legend).toHaveBeenCalledTimes(2);expect(t.removal).not.toHaveBeenCalled();
 });
 it('a stale indicator row is refused by the App fingerprint check: nothing removed, no history step, current diagnostic shown',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  const stale=t.h.port.list().map(item=>item.id===vol?{...item,visible:!item.visible}:item);
  const drawn=vi.fn();
  t.props.onRemoveObjects({indicators:stale,drawingIds:['line-a'],removeDrawings:drawn});
  expect(t.ids()).toEqual([vol,sma]);expect(t.drawings()).toEqual(['line-a','line-b','line-c']);expect(drawn).not.toHaveBeenCalled();
  expect(t.h.history.status().undo).toBe(0);expect(t.messages).toHaveLength(1);expect(t.messages[0]).toMatch(/indicator changed/);
 });
 it('a retired render owner (replaced chart tree) is refused before any native read or removal, silently',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.select('study:'+vol,'study:'+sma,'drawing:line-a');t.gridGeneration.current++;t.del();
  expect(t.ids()).toEqual([vol,sma]);expect(t.drawings()).toEqual(['line-a','line-b','line-c']);expect(t.h.history.status().undo).toBe(0);expect(t.messages).toEqual([]);expect(t.quarantines).toEqual([]);
 });
});

// A batch that fails partway (after indicator removals were accepted and published) still runs App's
// saved==native capture verification, so the partial acceptance is either confirmed or quarantined, never unverified.
describe('BFABC-R5: partial failure of the Object tree batch route',()=>{
 const rows=(t:Mounted)=>t.h.port.list();
 it('a drawing removal failing after the indicators were removed still verifies the saved cell against native',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.props.onRemoveObjects({indicators:rows(t).filter(item=>item.id!==rsi),drawingIds:['line-a'],removeDrawings:()=>{throw Error('Synthetic drawing failure');}});
  expect(t.ids()).toEqual([rsi]);expect(t.saved()).toEqual([rsi]);expect(t.drawings()).toEqual(['line-a','line-b','line-c']);
  expect(t.confirm).toHaveBeenCalledOnce();expect(t.quarantines).toEqual([]);
  expect(t.messages).toHaveLength(1);expect(t.messages[0]).toMatch(/Synthetic drawing failure/);
  expect(t.h.history.status().undo).toBe(1);expect(t.h.restore('undo')).toBe(true);expect(t.ids()).toEqual([vol,sma,rsi]);
 });
 it('a later indicator removal failing still verifies the accepted first removal',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids,remove=t.h.port.remove;
  t.h.port.remove=function(this:unknown,id:string){if(id===sma)throw Error('Synthetic removal failure');return remove.call(this,id);} as typeof remove;
  t.props.onRemoveObjects({indicators:rows(t).filter(item=>item.id!==rsi),drawingIds:[],removeDrawings:vi.fn()});
  expect(t.ids()).toEqual([sma,rsi]);expect(t.saved()).toEqual([sma,rsi]);expect(t.confirm).toHaveBeenCalledOnce();expect(t.quarantines).toEqual([]);
  expect(t.messages).toHaveLength(1);expect(t.messages[0]).toMatch(/Synthetic removal failure/);void vol;
 });
 it('a partial acceptance that never reached the saved cell is quarantined, not left unverified',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [,,rsi]=t.h.ids;
  t.pauseCapture();
  t.props.onRemoveObjects({indicators:rows(t).filter(item=>item.id!==rsi),drawingIds:['line-a'],removeDrawings:()=>{throw Error('Synthetic drawing failure');}});
  expect(t.ids()).toEqual([rsi]);expect(t.saved()).not.toEqual([rsi]);
  expect(t.confirm).toHaveBeenCalledOnce();expect(t.quarantines).toHaveLength(1);
  // Two causes (the drawing failure and the quarantined mismatch) surface as the helper's aggregate diagnostic.
  expect(t.messages).toEqual(['Object tree removal and its workspace publication failed.']);
 });
});

// Hardening follow-up to BFABC-R5: a selected study row that is no longer in the latest indicator list refuses the whole
// batch (as App refuses a stale fingerprint) instead of being silently dropped while the rest is removed.
describe('R5 follow-up: stale selected study rows refuse the Object tree batch',()=>{
 it('a Delete whose selection lists an indicator removed since that render removes nothing and reports it',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.select('study:'+vol,'study:'+sma,'drawing:line-a');
  const stale=t.row('study:'+vol)&&(()=>{hooks.cursor=0;return ObjectTreePanel({...t.props,indicators:t.props.indicators});})();// handlers captured with sma listed
  t.h.port.remove(sma);t.row('study:'+vol);// the panel re-renders: latest indicators no longer list sma
  const steps=t.h.history.status().undo;
  stale.props.onKeyDown(event({key:'Delete'}));
  expect(t.removal).not.toHaveBeenCalled();expect(t.ids()).toEqual([vol,rsi]);expect(t.drawings()).toEqual(['line-a','line-b','line-c']);
  expect(t.h.history.status().undo).toBe(steps);expect(t.props.onError).toHaveBeenCalledOnce();expect(String(t.props.onError.mock.calls[0][0])).toMatch(/indicator changed/);
 });
});
