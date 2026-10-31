import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {afterEach,expect,it,vi} from 'vitest';
import {emptyLiveInputNotice} from '../../src/ui/empty-live-input';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import {publishedSource,response,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {cellSessionDataset} from '../../src/chart/cell-session';
import type {BarDataset} from '../../src/domain/types';

// Actual provider publications + actual GridCell under the existing controlled
// React model. This does not mount a DOM/native chart or establish price authority.
const cleanups:Array<()=>void>=[];
afterEach(()=>{for(const close of cleanups.splice(0).reverse())close();});
async function source(options:Parameters<typeof publishedSource>[0]={}){const value=await publishedSource({bars:[],now:unix('2024-03-11T15:00:00Z'),...options});cleanups.push(()=>value.dispose());return value;}
const notice=(dataset:BarDataset)=>emptyLiveInputNotice(dataset,dataset.bars,'ordinary');

it('shows loading for a real provider whose initial history request is still held',async()=>{
 let release:()=>void=()=>{};
 const f=await source({reply:request=>new Promise(resolve=>{release=()=>resolve(response(request,[]));})});
 try{const actual=f.raw();expect(actual.provenance.state).toBe('loading');expect(notice(actual)).toEqual({kind:'loading',role:'status',message:'Loading live chart data…'});}
 finally{release();await flushMtf();}
});

it('shows a fixed failure for a real failed backfill without exposing its private error text',async()=>{
 const f=await source({reply:async()=>({ok:false,error:{code:'SYNTHETIC_FAILURE',message:'SYNTHETIC secret workspace symbol price stack payload'}})});
 const actual=f.raw();expect(actual.provenance.state).toBe('error');expect(actual.bars).toHaveLength(0);
 expect(notice(actual)).toEqual({kind:'error',role:'alert',message:'Live chart data could not be loaded. Check Data sources or choose another symbol or interval.'});
 expect(JSON.stringify(notice(actual))).not.toMatch(/secret|workspace|price|stack|payload|GME/);
});

it('distinguishes completed empty provider history from an outstanding load',async()=>{
 const f=await source(),actual=f.raw();expect(actual.provenance.state).toBe('ready');expect(actual.bars).toHaveLength(0);
 expect(actual.provenance.notes.join(' ')).toContain('IEX has no recent trades');
 expect(notice(actual)?.kind).toBe('no-data');expect(notice(actual)?.message).toContain('Check Data sources');
});

it('retires the computed no-data notice after a genuine provider trade supplies the current bars',async()=>{
 const f=await source();expect(notice(f.raw())?.kind).toBe('no-data');
 const now=unix('2024-03-11T15:00:01Z');f.setNow(now);
 f.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:now,price:120,high:120,low:120,size:1}],receivedAt:new Date(now*1000).toISOString()});
 await flushMtf();expect(f.raw().bars.length).toBeGreaterThan(0);expect(notice(f.raw())).toBeNull();
});

it('describes the actual empty regular-session selection even when the raw provider has premarket data',async()=>{
 const f=await source({bars:[{time:unix('2024-03-11T12:00:00Z'),open:100,high:101,low:99,close:100,volume:1}]}),raw=f.raw(),regular=f.regular();
 expect(raw.bars).toHaveLength(1);expect(regular.bars).toHaveLength(0);expect(notice(raw)).toBeNull();expect(notice(regular)?.kind).toBe('no-data');
});

it('refuses detached arrays and replay execution instead of describing an unrelated input',async()=>{
 const f=await source(),actual=f.raw();expect(notice(actual)?.kind).toBe('no-data');
 expect(emptyLiveInputNotice(actual,[],'ordinary')).toBeNull();expect(emptyLiveInputNotice(actual,actual.bars,'replay-run')).toBeNull();
});

it('does not classify empty local data as a live provider result',()=>{
 const local=fixtureDataset('GME',0);expect(notice(local)).toBeNull();
});

it('does not invoke provenance-state getters or read provider notes',async()=>{
 const f=await source(),actual=f.raw();let reads=0;
 const provenance={...actual.provenance,get state():'error'{reads++;return'error';},get notes():string[]{reads++;throw Error('SYNTHETIC private');}};
 expect(notice({...actual,provenance})).toBeNull();expect(reads).toBe(0);
});

function gridCell(dataset:BarDataset){
 const state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),node=>typeof node.type==='function'&&node.type.name==='GridCell')[0];parent.dispose();
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC test needs actual GridCell');
 const props={...cell.props,onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),onStatus:vi.fn(),onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const component=cell.type as (input:Record<string,unknown>)=>unknown;
 const ui=mountControlledComponent(()=>component(props));ui.settle();cleanups.push(()=>ui.dispose());
 return{ui,props};
}
function current(tree:unknown){
 const panels=all(tree,node=>node.type===ChartPanel);if(panels.length!==1)throw Error('Expected exactly one original ChartPanel');
 const panel=panels[0],wrappers=all(tree,node=>node.type==='div'&&node.props.children===panel);
 if(wrappers.length!==1)throw Error('Expected the actual visibility wrapper');
 return{panel,wrapper:wrappers[0],notices:all(tree,node=>typeof node.props.className==='string'&&node.props.className.split(' ').includes('lv-empty-live-input'))};
}

it.each(['error','no-data'] as const)('renders the real %s notice outside the hidden chart and suppresses its misleading generic pending status',async kind=>{
 const f=await source(kind==='error'?{reply:async()=>({ok:false,error:{code:'SYNTHETIC_FAILURE',message:'SYNTHETIC private'}})}:{}),{ui}=gridCell(f.regular()),tree=ui.render(),view=current(tree);
 expect(view.notices).toHaveLength(1);expect(view.notices[0].props.role).toBe(kind==='error'?'alert':'status');
 expect(text(view.notices[0])).toContain(kind==='error'?'could not be loaded':'No live bars');
 expect(all(view.wrapper,node=>node===view.notices[0])).toHaveLength(0);
 expect((view.wrapper.props.style as {visibility:string}).visibility).toBe('hidden');
 expect((tree as {props:{style:{visibility?:string}}}).props.style.visibility).not.toBe('hidden');
 expect(view.panel.props.bars).toBe(f.regular().bars);expect(view.panel.props.source).not.toHaveProperty('state');
});

it('removes only the computed notice and forwards genuine recovered input to the unchanged ChartPanel',async()=>{
 const f=await source(),{ui,props}=gridCell(f.regular());expect(current(ui.render()).notices).toHaveLength(1);
 const now=unix('2024-03-11T15:00:01Z');f.setNow(now);f.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:now,price:120,high:120,low:120,size:1}],receivedAt:new Date(now*1000).toISOString()});await flushMtf();
 const actual=cellSessionDataset(f.raw(),{session:'regular'});Object.assign(props,{dataset:actual,datasets:[actual],bars:actual.bars});ui.settle();
 const view=current(ui.render());expect(actual.bars.length).toBeGreaterThan(0);expect(view.notices).toHaveLength(0);expect(view.panel.props.bars).toBe(actual.bars);expect(props.onReady).not.toHaveBeenCalled();
});

it('keeps an actual cell quarantine error and Reopen action instead of overwriting it with empty-source metadata',async()=>{
 const f=await source(),{ui}=gridCell(f.regular());const panel=current(ui.render()).panel;
 (panel.props.onUnavailable as (message:string)=>void)('SYNTHETIC actual native refusal');ui.settle();
 const tree=ui.render();expect(current(tree).notices).toHaveLength(0);
 expect(all(tree,node=>node.props.role==='alert').map(text).join(' ')).toContain('SYNTHETIC actual native refusal');
 expect(all(tree,node=>node.type==='button'&&text(node)==='Reopen chart')).toHaveLength(1);
});

import {sourceContextForDataset} from '../../src/chart/source-context';
import {validateHistoricalFrame} from '../../src/chart/historical-frame';
it.each(['error','no-data'] as const)('replaces a saved-frame restoring status with the actual empty-live %s notice',async kind=>{
 const f=await source(kind==='error'?{reply:async()=>({ok:false,error:{code:'SYNTHETIC_FAILURE',message:'SYNTHETIC private'}})}:{}),actual=f.regular(),basis=sourceContextForDataset(actual,actual.bars);
 const frame=validateHistoricalFrame({schemaVersion:1,basis:{basisIdentity:basis.basisIdentity,revision:basis.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});
 const state=createMultiChartState(actual,{appearance:defaultTheme.appearance});state.cells[state.layout.activeCellId].frame=frame;
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[actual],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),node=>typeof node.type==='function'&&node.type.name==='GridCell')[0];parent.dispose();
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture needs actual saved-frame GridCell');
 const component=cell.type as (input:Record<string,unknown>)=>unknown;
 const props={...cell.props,onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),onStatus:vi.fn(),onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const ui=mountControlledComponent(()=>component(props));cleanups.push(()=>ui.dispose());ui.settle();const tree=ui.render(),view=current(tree);
 expect(view.notices).toHaveLength(1);expect(view.notices[0].props.role).toBe(kind==='error'?'alert':'status');
 expect(text(view.notices[0])).toContain(kind==='error'?'could not be loaded':'No live bars');
 expect(all(tree,node=>node.type==='output'&&text(node).includes('Restoring saved chart frame'))).toHaveLength(0);
 expect(all(view.wrapper,node=>node===view.notices[0])).toHaveLength(0);expect(props.onReady).not.toHaveBeenCalled();
});
