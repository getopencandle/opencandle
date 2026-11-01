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
import {finishIndicatorMove} from '../../src/ui/indicator-move-route';
import {existingPaneTarget} from '../../src/ui/indicator-move-targets';
import {objectTreeHistoryHarness} from './object-tree-history-harness';

// The EXACT current App.applyIndicatorMove body (extracted from src/ui/App.tsx, the
// technique of tests/ui/r4-indui-move-lift.test.ts) over the actual indicator port of the OTDW history harness, for the
// existing-pane choices. SYNTHETIC fixtures. Not a mounted DOM or packaged executable test.
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

async function mount(){
 const h=await objectTreeHistoryHarness({indicators:['sma','rsi'],drawings:[]});disposers.push(h.dispose);
 const data=fixtureDataset('GME',3),bars=data.bars,source=sourceContextForDataset(data,bars),gridEpoch=7;
 const workspace:any={chartStyle:'candles',grid:{layout:{activeCellId:'cell-a'},cells:{'cell-a':{indicators:structuredClone(h.port.serialize()),comparisons:[]}}}};
 const current={current:workspace},currentInput={current:{dataset:data,bars,datasets:[data],replay:null} as any},currentReplay={current:null as any};
 const messages:string[]=[];
 const chart:any={...h.chart,isInputCurrent:()=>true,reportAnalysisPublicationFailure:()=>{}};
 const publish=()=>{const saved=current.current,grid=saved.grid;current.current={...saved,grid:{...grid,cells:{...grid.cells,'cell-a':{...grid.cells['cell-a'],indicators:structuredClone(h.port.serialize())}}}};currentInput.current={...currentInput.current};};
 disposers.push(h.port.subscribe(publish));
 const lift=vi.fn((...args:Parameters<typeof finishNewPaneAbove>)=>finishNewPaneAbove(...args));
 const bindings={chart,dataset:data,bars,source,workspace,replay:null,gridEpoch,current,currentInput,currentReplay,activeController:{current:chart},gridGeneration:{current:gridEpoch},storageMutation:{current:false},workspaceTransaction:{current:false},sourceContextForDataset,chartSourceContextKey,indicatorEditFingerprint,confirmAnalysisPublication,removeObjectsAsOneStep,studyMoveTarget,studyOnPricePane,canPlacePaneAbovePrice,finishNewPaneAbove:lift,finishIndicatorMove,existingPaneTarget,assertDialogContext(){},setMessage:(message:unknown)=>{messages.push(String(message));},reportFailure:(error:unknown)=>{messages.push(error instanceof Error?error.message:String(error));},setIndicatorViews:()=>{},
  // Anchored VWAP click-to-place state the extracted range wires (anchorPlacementEnd.current=endAnchorPlacement); no placement is active here.
  anchorPlacementRef:{current:null},setAnchorPlacement:()=>{},anchorPlacementEnd:{current:(_cancel:boolean)=>{}}};
 const route=new Function(...Object.keys(bindings),body+'\nreturn {move:applyIndicatorMove};')(...Object.values(bindings)) as {move:(row:any,where:string)=>void};
 const paneOf=(kind:string)=>h.port.list().find(row=>row.kind===kind)!.paneId;
 const saved=()=>current.current.grid.cells['cell-a'].indicators;
 return{h,route,messages,lift,paneOf,saved};
}

describe(' App.applyIndicatorMove existing-pane choices',()=>{
 it('Existing pane below merges the price-pane SMA into the RSI pane and the saved cell is confirmed',async()=>{
  const t=await mount(),sma=t.h.port.list().find(row=>row.kind==='sma')!;
  expect(t.paneOf('sma')).toBe('price');expect(t.paneOf('rsi')).not.toBe('price');
  t.route.move(sma,'existing-below');
  expect(t.messages).toEqual([]);expect(t.paneOf('sma')).toBe(t.paneOf('rsi'));
  expect(t.lift).not.toHaveBeenCalled();
  expect(t.saved()).toEqual(t.h.port.serialize());
 });
 it('Existing pane above moves the RSI into the price pane',async()=>{
  const t=await mount(),rsi=t.h.port.list().find(row=>row.kind==='rsi')!;
  t.route.move(rsi,'existing-above');
  expect(t.messages).toEqual([]);expect(t.paneOf('rsi')).toBe('price');expect(t.saved()).toEqual(t.h.port.serialize());
 });
 it('a choice with no neighbour is refused with its reason and nothing moves',async()=>{
  const t=await mount(),sma=t.h.port.list().find(row=>row.kind==='sma')!,before=structuredClone(t.saved());
  t.route.move(sma,'existing-above');
  expect(t.messages.join(' ')).toMatch(/no pane above/);expect(t.paneOf('sma')).toBe('price');expect(t.saved()).toEqual(before);
 });
});
