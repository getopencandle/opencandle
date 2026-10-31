import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {studyMoveTarget} from '../../src/ui/ObjectTreePanel';
import {removeObjectsAsOneStep} from '../../src/ui/object-tree-removal';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,chartSourceContextKey} from '../../src/chart/source-context';
import {indicatorEditFingerprint} from '../../src/ui/indicator-library';
import {confirmAnalysisPublication} from '../../src/ui/analysis-capture-confirmation';
import {studyOnPricePane,finishNewPaneAbove,canPlacePaneAbovePrice} from '../../src/chart/pane-actions';
import {finishIndicatorMove,INDICATOR_LIFT_FAILED,INDICATOR_MOVE_UNSAVED} from '../../src/ui/indicator-move-route';
import {objectTreeHistoryHarness} from './object-tree-history-harness';

// When the new-pane-above lift runs but the pane does not end on top, App.applyIndicatorMove must not
// throw before confirmAnalysisCapture. Runs the EXACT current App function bodies (extracted from src/ui/App.tsx, the
// technique of tests/ui/object-tree-app-removal.test.ts) over the actual indicator port of the OTDW history harness.
// The renderer clamp is modeled by a move target that lands the new pane below price, and the reorder hook is a
// no-op or throws, so the read-back fails. SYNTHETIC fixtures. Not a mounted DOM or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],()=>{}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const start=app.indexOf(' const analysisRenderOwner='),end=app.indexOf(' const closeChartDialog=',start);
const captureLine=app.split(/\r?\n/).find(line=>line.includes('const captureIndicators='));
if(start<0||end<0||!captureLine||!app.includes('function applyIndicatorMove('))throw Error('The exact App indicator move extraction boundaries changed.');
const body=stripTypeScriptTypes(captureLine+'\n'+app.slice(start,end),{mode:'strip'});

async function mount(reorder:'noop'|'throw'|'works'){
 const h=await objectTreeHistoryHarness({indicators:['sma']});disposers.push(h.dispose);
 const reorderPanes=vi.fn((_next:string[])=>{if(reorder==='throw')throw new Error('Synthetic reorder failure.');});
 if(reorder!=='works')(h.chart.chart as any).orchestrator={reorderPanes};else{const real=(h.chart.chart as any).orchestrator.reorderPanes;reorderPanes.mockImplementation((next:string[])=>real(next));(h.chart.chart as any).orchestrator={reorderPanes};}
 const data=fixtureDataset('GME',3),bars=data.bars,source=sourceContextForDataset(data,bars),gridEpoch=7;
 const workspace:any={chartStyle:'candles',grid:{layout:{activeCellId:'cell-a'},cells:{'cell-a':{indicators:structuredClone(h.port.serialize()),comparisons:[]}}}};
 const current={current:workspace},currentInput={current:{dataset:data,bars,datasets:[data],replay:null} as any},currentReplay={current:null as any};
 const gridGeneration={current:gridEpoch},storageMutation={current:false},workspaceTransaction={current:false};
 const messages:string[]=[],order:string[]=[];
 const chart:any={...h.chart,isInputCurrent:()=>true,reportAnalysisPublicationFailure:()=>{}};
 const publish=()=>{const saved=current.current,grid=saved.grid;current.current={...saved,grid:{...grid,cells:{...grid.cells,'cell-a':{...grid.cells['cell-a'],indicators:structuredClone(h.port.serialize())}}}};currentInput.current={...currentInput.current};};
 disposers.push(h.port.subscribe(publish));
 const confirm=vi.fn((...args:Parameters<typeof confirmAnalysisPublication>)=>{order.push('confirm');return confirmAnalysisPublication(...args);});
 // The renderer clamp (Vela 0.8.4 insertPaneOrder): "before price" lands the new pane directly below price.
 const clamped=reorder==='works'?studyMoveTarget:(host:any,id:string,where:'above'|'below')=>{const target=studyMoveTarget(host,id,where);return where==='above'&&(target as any)?.newPane?.before==='price'?{newPane:{after:'price'}}:target;};
 const lift=vi.fn((...args:Parameters<typeof finishNewPaneAbove>)=>{order.push('lift');return finishNewPaneAbove(...args);});
 const bindings={chart,dataset:data,bars,source,workspace,replay:null,gridEpoch,current,currentInput,currentReplay,activeController:{current:chart},gridGeneration,storageMutation,workspaceTransaction,sourceContextForDataset,chartSourceContextKey,indicatorEditFingerprint,confirmAnalysisPublication:confirm,removeObjectsAsOneStep,studyMoveTarget:clamped,studyOnPricePane,canPlacePaneAbovePrice,finishNewPaneAbove:lift,finishIndicatorMove,assertDialogContext(){},setMessage:(message:unknown)=>{order.push('message');messages.push(String(message));},setIndicatorViews:()=>{}};
 const route=new Function(...Object.keys(bindings),body+'\nreturn {move:applyIndicatorMove};')(...Object.values(bindings)) as {move:(row:any,where:'above'|'below')=>void};
 const saved=()=>current.current.grid.cells['cell-a'].indicators;
 return{h,route,messages,order,confirm,reorderPanes,saved,panes:()=>h.indicatorHost.order()};
}

describe('R2-1: a lift that runs but leaves the pane below price is reported after the saved capture, never thrown before it',()=>{
 for(const mode of ['noop','throw'] as const)it('reorder hook '+mode+': the move is kept, the capture is confirmed, then the lift failure is reported',async()=>{
  const t=await mount(mode),row=t.h.port.list()[0];
  expect(t.panes()).toEqual(['price']);
  t.route.move(row,'above');
  expect(t.reorderPanes).toHaveBeenCalledOnce();
  expect(t.panes()[0]).toBe('price');expect(t.panes().length).toBe(2);
  expect(t.order).toEqual(['lift','confirm','message']);
  expect(t.confirm).toHaveBeenCalledOnce();expect(t.confirm.mock.results[0].value).toBe(true);
  expect(t.saved()).toEqual(t.h.port.serialize());
  expect(t.messages).toHaveLength(1);expect(t.messages[0]).toContain(INDICATOR_LIFT_FAILED);
  expect(t.messages[0]).not.toContain(INDICATOR_MOVE_UNSAVED);
 });
 it('control: a working reorder lifts the pane above price and reports nothing',async()=>{
  const t=await mount('works'),row=t.h.port.list()[0];
  t.route.move(row,'above');
  expect(t.panes()[0]).not.toBe('price');expect(t.panes()[1]).toBe('price');expect(t.order).toEqual(['lift','confirm']);expect(t.messages).toEqual([]);
 });
});

describe('finishIndicatorMove order',()=>{
 it('confirms before reporting, throws only when the capture is unsaved, and skips the lift when not raising',()=>{
  const calls:string[]=[];
  const tail=(ok:boolean,saved:boolean,raise=true)=>finishIndicatorMove({raise,lift:()=>{calls.push('lift');return ok?{ok:true}:{ok:false,message:'Synthetic.'};},confirm:()=>{calls.push('confirm');return saved;},report:message=>calls.push('report:'+message)});
  expect(tail(false,true)).toEqual({lifted:false});expect(calls).toEqual(['lift','confirm','report:'+INDICATOR_LIFT_FAILED+' Synthetic.']);
  calls.length=0;expect(()=>tail(false,false)).toThrow(INDICATOR_MOVE_UNSAVED);expect(calls).toEqual(['lift','confirm']);
  calls.length=0;expect(tail(true,true,false)).toEqual({lifted:false});expect(calls).toEqual(['confirm']);
  calls.length=0;expect(tail(true,true)).toEqual({lifted:true});expect(calls).toEqual(['lift','confirm']);
 });
});
