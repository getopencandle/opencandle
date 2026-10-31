import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {mountControlledComponent,all,text} from '../helpers/alert-dialog-harness';
import {ScriptTablesPanel,type ScriptTablesSource,type ScriptTablesPanelProps} from '../../src/ui/ScriptTablesPanel';
import {logicalScriptFixture} from '../fixtures/script-derived-position';
import {settle} from '../fixtures/script-presentation';
import {assertScriptTables,readScriptTables} from '../../src/chart/script-presentation-proof';
const SOURCE="({onBar(ctx){if(ctx.index===0){ctx.state.a=ctx.table.new();ctx.table.cell(ctx.state.a,0,0,{text:'SYNTHETIC FIRST',tooltip:'Synthetic tooltip'});ctx.state.b=ctx.table.new();ctx.table.cell(ctx.state.b,0,0,{text:'<b>SYNTHETIC SECOND</b>'});}}})";
const owned:Array<{close():Promise<void>}>=[],mounted:Array<{dispose():void}>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const ui of mounted.splice(0).reverse())try{ui.dispose();}catch(error){failures.push(error);}for(const owner of owned.splice(0).reverse())try{await owner.close();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'Synthetic asynchronous table inventory cleanup failed.');});
/** Original installed SDK data registry, verbatim in memory; no replacement native class or numerical receipt.
 * The existing fixture still owns its records Map/worker/adapter host/native arrays. Only the synchronous add fixture
 * is replaced with the actual core.addNativeIndicator -> await readyPromise -> startNativeIndicator path.
 */
function originalRegistry(records:Map<string,unknown>){
 const text=readFileSync(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),'utf8'),first=text.indexOf('var IndicatorRegistry = class {'),last=text.indexOf('\n};',first)+3;
 if(first<0||last<first)throw Error('Pinned original registry class boundary missing.');
 const source=text.slice(first,last),Registry=Function(source+';return IndicatorRegistry;')(),registry=new Registry();registry.records=records;
 return{registry,sourceSHA256:createHash('sha256').update(source).digest('hex')};
}
async function fixture(hidden=false){
 const f=await logicalScriptFixture({style:'candles'}),core=f.core,oldAdd=f.chart.addNativeIndicator,oldStart=core.startNativeIndicator;
 const starts=new Set<Promise<unknown>>(),errors:unknown[]=[];let ready=false,closed=false,resolveReady!:()=>void,off:(()=>void)|null=null;
 const gate=new Promise<void>(done=>{resolveReady=done;});
 const release=()=>{if(ready)return;ready=true;resolveReady();};
 const observeStart=function(this:unknown,...args:unknown[]){const task=Reflect.apply(oldStart,this,args) as Promise<unknown>;starts.add(task);task.then(()=>starts.delete(task),error=>{errors.push(error);starts.delete(task);});return task;};
 const actualAdd=(type:string)=>core.addNativeIndicator(type);
 const close=async()=>{if(closed)return;closed=true;const failures:unknown[]=[];
  // Remove before resolving the gate, so a failed test never paints a late owned start into a disposed fixture.
  if(f.chart.addNativeIndicator===actualAdd)f.chart.addNativeIndicator=oldAdd;
  try{f.dispose();}catch(error){failures.push(error);}release();
  const pending=await Promise.allSettled([...starts]);for(const row of pending)if(row.status==='rejected'&&!errors.includes(row.reason))failures.push(row.reason);
  try{await settle();}catch(error){failures.push(error);}try{off?.();}catch(error){failures.push(error);}off=null;
  if(core.startNativeIndicator===observeStart)core.startNativeIndicator=oldStart;
  failures.push(...errors);if(failures.length)throw new AggregateError(failures,'Original asynchronous SDK fixture failed.');
 };
 owned.push({close});
 try{
  const registry=originalRegistry(f.records);
  // Controlled synthetic native context only. All data/numbers/source permission remain the real existing fixture's.
  core.registry=registry.registry;core.config={market:{symbol:'SYNTHETIC',timeframe:'1m'},live:false};core.dataControl={};core.readyPromise=gate;
  core.startNativeIndicator=observeStart;f.chart.addNativeIndicator=actualAdd;
  off=f.chart.on('indicator:error',({error}:any)=>{errors.push(error);});f.binding.visible=!hidden;
  return{f,core,errors,close,release,registrySHA256:registry.sourceSHA256,async nativeReady(){release();await Promise.all([...starts]);await settle();}};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Async native fixture acquisition and cleanup failed.');}throw error;}
}

type TestSource=ScriptTablesSource&{controllerChanged():void};
/** Exact coordinator table source and exact production onReady callback. The controlled surrounding refs supply
 * descriptive grid routing only. Real values/native membership are still the actual SDK/worker/adapter port's.
 */
function coordinator(f:Awaited<ReturnType<typeof fixture>>['f']){
 const sourceRoot=process.env.LV_TABLES_INVENTORY_SOURCE_ROOT??process.cwd(),body=readFileSync(resolve(sourceRoot,'src/ui/MultiChartGrid.tsx'),'utf8'),first=body.indexOf('scriptTables:(()=>{')+'scriptTables:'.length,last=body.indexOf(',setCellSession:',first);if(first<'scriptTables:'.length||last<first)throw Error('Actual table coordinator source boundary missing.');
 const id='SYNTHETIC startup cell',controller={scripts:f.port},cell={scriptBindings:[f.binding]},grid={layout:{activeCellId:id,cells:[{id,symbol:'GME',interval:'1m'}]},cells:{[id]:cell}},scope={latest:{current:{staging:false,state:grid,onReady:vi.fn(),onActiveCell:vi.fn()}},alive:{current:true},holdOwners:{current:{tree:null as unknown,analysis:false}},analysisActive:{current:false},resizePending:{current:false},sourcePending:{current:0},quarantined:{current:new Set<string>()},controllers:{current:new Map<string,typeof controller>()},crosshairWatch:{attach:vi.fn()},registerDrawingWorkspace:vi.fn(),row:{id},coordinator:{scriptTables:null as unknown as TestSource},assertScriptTables},keys=Object.keys(scope);
 const source=Function('scope',stripTypeScriptTypes(`const {${keys.join(',')}}=scope;const tableValue=(${body.slice(first,last)});`,{mode:'transform'})+';return tableValue;')(scope) as TestSource;scope.coordinator.scriptTables=source;
 const callbackStart=body.indexOf('onReady={chart=>{')+'onReady={'.length,callbackEnd=body.indexOf('} onCapture=',callbackStart);if(callbackStart<'onReady={'.length||callbackEnd<callbackStart)throw Error('Actual controller publication callback missing.');
 const ready=Function('scope',stripTypeScriptTypes(`const {${keys.join(',')}}=scope;const value=(${body.slice(callbackStart,callbackEnd)});`,{mode:'transform'})+';return value;')(scope) as (chart:typeof controller|null)=>void;
 return{source,scope,controller,grid,cell,ready};
}
function panel(h:ReturnType<typeof coordinator>){const props:ScriptTablesPanelProps={source:h.source,layoutId:'SYNTHETIC saved layout',revision:h.grid,active:true},ui=mountControlledComponent(()=>ScriptTablesPanel(props));mounted.push(ui);ui.settle();return{props,ui};}
const cells=(tree:unknown)=>all(tree,node=>node.props.role==='cell').map(text);
const EXPECTED=['SYNTHETIC FIRST','<b>SYNTHETIC SECOND</b>'];
async function pending(){const h=await fixture(),f=h.f;f.binding.tablePlacement='bottom';await f.start(SOURCE);return h;}
it('actual asynchronous native result fills a saved panel inventoried before its controller without changing grid or rerunning',async()=>{
 const h=await pending(),f=h.f,c=coordinator(f),p=panel(c),revision=p.props.revision,calls=f.workerCalls(),record=f.record();expect(record.native.started).not.toBe(true);expect(cells(p.ui.render())).toEqual([]);expect(text(p.ui.render())).toContain('Waiting for current script tables');
 c.ready(c.controller);p.ui.settle();await h.nativeReady();expect(record.native.started).toBe(true);expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables.map(row=>row.cells[0].text)).toEqual(EXPECTED);
 expect(cells(p.ui.settle())).toEqual(EXPECTED);expect(all(p.ui.render(),node=>node.props.role==='cell')[0].props.title).toBe('Synthetic tooltip');expect(p.props.revision).toBe(revision);expect(f.workerCalls()).toBe(calls);expect(record.model.tables).toEqual([]);expect(h.errors).toEqual([]);
});
it('late controller publication captures an already completed genuine native result without another port event',async()=>{
 const h=await pending(),f=h.f,c=coordinator(f),p=panel(c),calls=f.workerCalls();await h.nativeReady();expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables).toHaveLength(2);expect(cells(p.ui.settle())).toEqual([]);c.ready(c.controller);expect(cells(p.ui.settle())).toEqual(EXPECTED);expect(f.workerCalls()).toBe(calls);expect(h.errors).toEqual([]);
});
it('controller removal retires old headers and projections before a real replacement controller is admitted',async()=>{
 const a=await pending(),b=await pending();await a.nativeReady();await b.nativeReady();const c=coordinator(a.f);c.ready(c.controller);const inventory=vi.spyOn(c.source,'inventory'),p=panel(c),old=inventory.mock.results.at(-1)!.value[0];expect(cells(p.ui.render())).toEqual(EXPECTED);expect(readScriptTables(c.source.capture(old)!).tables).toHaveLength(2);
 c.ready(null);expect(()=>c.source.capture(old)).toThrow();expect(cells(p.ui.settle())).toEqual([]);const replacement={scripts:b.f.port};c.ready(replacement);expect(cells(p.ui.settle())).toEqual(EXPECTED);const fresh=inventory.mock.results.at(-1)!.value[0],view=c.source.capture(fresh)!;expect(()=>assertScriptTables(view,b.f.port)).not.toThrow();expect(()=>assertScriptTables(view,a.f.port)).toThrow();expect(()=>c.source.capture(old)).toThrow();expect(a.errors).toEqual([]);expect(b.errors).toEqual([]);
});
it('ordinary renders and repeat publication of the same controller do not enumerate or project again',async()=>{
 const h=await pending(),f=h.f,c=coordinator(f),inventory=vi.spyOn(c.source,'inventory'),capture=vi.spyOn(c.source,'capture');c.ready(c.controller);await h.nativeReady();const p=panel(c),headers=inventory.mock.calls.length,reads=capture.mock.calls.length,first=all(p.ui.render(),node=>node.props.role==='cell')[0];
 for(let i=0;i<1000;i++)expect(all(p.ui.render(),node=>node.props.role==='cell')[0]).toBe(first);c.ready(c.controller);p.ui.settle();expect(inventory).toHaveBeenCalledTimes(headers);expect(capture).toHaveBeenCalledTimes(reads);expect(h.errors).toEqual([]);
});
it('a collapsed saved panel resamples actual ownership on reopen and unmount releases the inventory observer',async()=>{
 const h=await pending(),f=h.f,c=coordinator(f),p=panel(c);p.props.active=false;p.ui.settle();c.ready(c.controller);await h.nativeReady();expect(cells(p.ui.render())).toEqual([]);p.props.active=true;expect(cells(p.ui.settle())).toEqual(EXPECTED);p.ui.dispose();expect(()=>c.ready(null)).not.toThrow();expect(h.errors).toEqual([]);
});
it('late old inventory unsubscribe cannot clear the replacement observer or grant a stale header',async()=>{
 const h=await pending(),f=h.f,c=coordinator(f),a=vi.fn(),b=vi.fn(),offA=c.source.subscribeInventory!(a),old=c.source.inventory()[0],offB=c.source.subscribeInventory!(b);expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1);offA();c.ready(c.controller);expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(2);expect(()=>c.source.capture(old)).toThrow();offB();c.ready(null);expect(b).toHaveBeenCalledTimes(2);await h.nativeReady();expect(h.errors).toEqual([]);
});
