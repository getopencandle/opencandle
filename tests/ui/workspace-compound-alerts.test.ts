import {afterEach,expect,it,vi} from 'vitest';
import {mountControlledComponent} from '../helpers/alert-dialog-harness';
import {CompoundAlertRuntime,WorkspaceCompoundAlerts,type WorkspaceCompoundAlertsProps,type CompoundRuntimeControl} from '../../src/ui/WorkspaceCompoundAlerts';
import {CompoundAlertObserver,compoundSourceContext,type CompoundChartInputPort} from '../../src/ui/compound-alert-observer';
import {CompoundAlertBook} from '../../src/ui/compound-alert-book';
import {COMPOUND_POLICY,compoundHistory,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual private producer + native SDK + book + observer. Forwarding spies only
// delay genuine prepare results; no row, receipt or ready state is fabricated.
const closes:Array<()=>unknown>=[];
afterEach(async()=>{const errors:unknown[]=[];vi.restoreAllMocks();for(const close of closes.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.useRealTimers();await flushMtf();if(errors.length)throw new AggregateError(errors,'Synthetic compound runtime cleanup failed.');});
const baseTime=unix('2024-03-11T19:59:50Z');
async function setup(crossing=false){
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(previous));
 const p=await publishedSource({now:baseTime,resolution:'15m'});closes.push(()=>p.dispose());let dataset=p.regular();
 const native=await ownedInputStylePipelineFixture({dataset});closes.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null as unknown}},activeController:{current:native.controller as CompoundChartInputPort|null},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null as unknown},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new CompoundAlertBook(refs);closes.push(()=>book.close());let now=baseTime,held=false;
 const diagnostics:Array<[string,string|null]>=[],control:CompoundRuntimeControl={enabled:true,suspended:false,isHeld:()=>held,readActionTime:()=>now,onDiagnostic:(id,message)=>diagnostics.push([id,message])};
 const definition=(id='SYNTHETIC runtime'):CompoundDefinition=>({kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id,name:'SYNTHETIC coherent AND',message:'SYNTHETIC only',context:compoundSourceContext(dataset,dataset.bars)!,predicates:[{id:'price',source:{kind:'price',field:'close'},operator:{kind:crossing?'crossing-up':'greater',value:crossing?140:125}},{id:'average',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC inputs',inputs:{length:2,source:'close'}},operator:{kind:'greater',value:129}}],frequency:'every-time',createdAt:0,expiresAt:null});
 const create=(id?:string)=>{const d=definition(id);expect(book.prepareCreate(d,{schemaVersion:1,popup:true,desktop:false,sound:null}).commit()).toBe(true);return book.entry(d.id)!;};
 const entry=create(),runtime=new CompoundAlertRuntime(book,()=>control,()=>refs.financialGeneration.current===0&&refs.gridGeneration.current===0);closes.push(()=>runtime.dispose());
 const update=async(value:number)=>{now++;p.setNow(now);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:now,price:value,high:value,low:value,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();expect((await native.accept(dataset)).accepted).toBe(true);refs.currentInput.current={dataset,bars:dataset.bars,replay:null};};
 return{book,refs,p,native,runtime,entry,control,diagnostics,create,now:()=>now,setHeld(value:boolean){held=value;refs.storageMutation.current=value;runtime.refreshControl();},update};
}
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});closes.unshift(release);return{promise,release};}
it('primes and then records the real price150/SMA140 coherent observation through the canonical book',async()=>{
 const f=await setup();await f.runtime.tick();expect(f.book.entry(f.entry.id)!.state.previous).toEqual([130,130]);expect(compoundHistory(f.book.entry(f.entry.id)!.state)).toEqual([]);
 await f.update(150);await f.runtime.tick();expect(compoundHistory(f.book.entry(f.entry.id)!.state).map(row=>row.values)).toEqual([[150,140]]);expect(f.diagnostics.at(-1)).toEqual([f.entry.id,null]);
});
it('keeps one genuine prepare in flight across repeated ticks and multiple declarations',async()=>{
 const f=await setup(),other=f.create('SYNTHETIC second'),wait=gate(),entered=gate(),original=CompoundAlertObserver.prototype.prepare;let active=0,max=0,calls=0;
 vi.spyOn(CompoundAlertObserver.prototype,'prepare').mockImplementation(async function(this:CompoundAlertObserver,time:number){active++;max=Math.max(max,active);try{const value=await original.call(this,time);if(++calls===1){entered.release();await wait.promise;}return value;}finally{active--;}});
 const first=f.runtime.tick();await entered.promise;await f.runtime.tick();expect(calls).toBe(1);wait.release();await first;expect(max).toBe(1);expect(calls).toBe(2);expect(f.book.entry(other.id)!.state.previous).toEqual([130,130]);
});
it('cancels a pending observation during a transient hold without clearing accepted baselines',async()=>{
 const f=await setup();await f.runtime.tick();const before=f.book.entry(f.entry.id)!.state.previous;await f.update(150);
 const wait=gate(),entered=gate(),original=CompoundAlertObserver.prototype.prepare;
 vi.spyOn(CompoundAlertObserver.prototype,'prepare').mockImplementation(async function(this:CompoundAlertObserver,time:number){const value=await original.call(this,time);entered.release();await wait.promise;return value;});
 const pending=f.runtime.tick();await entered.promise;f.setHeld(true);wait.release();await pending;expect(f.book.entry(f.entry.id)!.state.previous).toBe(before);expect(compoundHistory(f.book.entry(f.entry.id)!.state)).toEqual([]);
 vi.restoreAllMocks();f.setHeld(false);await f.runtime.tick();expect(compoundHistory(f.book.entry(f.entry.id)!.state).map(row=>row.values)).toEqual([[150,140]]);
});
it('retires a paused generation and primes its resumed observer instead of reusing an old crossing',async()=>{
 const f=await setup();await f.runtime.tick();const old=f.book.entry(f.entry.id)!;
 expect(f.book.prepareLifecycle(old.id,old,'pause',f.now()).commit()).toBe(true);await f.update(150);await f.runtime.tick();expect(compoundHistory(f.book.entry(old.id)!.state)).toEqual([]);
 const paused=f.book.entry(old.id)!;expect(f.book.prepareLifecycle(old.id,paused,'resume',f.now()).commit()).toBe(true);await f.runtime.tick();expect(f.book.entry(old.id)!.generation).not.toBe(old.generation);expect(f.book.entry(old.id)!.state.previous).toEqual([150,140]);expect(compoundHistory(f.book.entry(old.id)!.state)).toEqual([]);
});
it('cannot publish a delayed old generation after remove and same-id replacement',async()=>{
 const f=await setup(),wait=gate(),entered=gate(),original=CompoundAlertObserver.prototype.prepare;
 vi.spyOn(CompoundAlertObserver.prototype,'prepare').mockImplementation(async function(this:CompoundAlertObserver,time:number){const value=await original.call(this,time);entered.release();await wait.promise;return value;});
 const pending=f.runtime.tick();await entered.promise;expect(f.book.prepareRemove(f.entry.id,f.book.entry(f.entry.id)!).commit()).toBe(true);const replacement=f.create(f.entry.id);wait.release();await pending;expect(f.book.entry(f.entry.id)).toBe(replacement);expect(replacement.state.previous).toEqual([null,null]);expect(replacement.state.history).toBeNull();
});
it('disposes every source observer and suppresses late diagnostics after host cleanup',async()=>{
 const f=await setup(),wait=gate(),entered=gate(),original=CompoundAlertObserver.prototype.prepare,dispose=vi.spyOn(CompoundAlertObserver.prototype,'dispose');
 vi.spyOn(CompoundAlertObserver.prototype,'prepare').mockImplementation(async function(this:CompoundAlertObserver,time:number){const value=await original.call(this,time);entered.release();await wait.promise;return value;});
 const pending=f.runtime.tick();await entered.promise;f.runtime.dispose();const size=f.diagnostics.length;wait.release();await pending;await f.runtime.tick();expect(dispose).toHaveBeenCalledTimes(1);expect(f.diagnostics).toHaveLength(size);expect(f.book.entry(f.entry.id)!.state.previous).toEqual([null,null]);
});
it('refreshes an expired scalar-alert-ref writer while preserving the actual crossing baseline',async()=>{
 const f=await setup(true);await f.runtime.tick();const before=f.book.entry(f.entry.id)!.state.previous,dispose=vi.spyOn(CompoundAlertObserver.prototype,'dispose'),cancel=vi.spyOn(CompoundAlertObserver.prototype,'cancelPendingForWorkspace');
 f.refs.financial.current={...f.refs.financial.current,alerts:[]};await f.update(150);await f.runtime.tick();expect(dispose).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalled();expect(before).toEqual([130,130]);expect(compoundHistory(f.book.entry(f.entry.id)!.state).map(row=>row.values)).toEqual([[150,140]]);
});
it('refuses an old in-flight financial owner before an idle refresh can publish the fresh crossing',async()=>{
 const f=await setup(true);await f.runtime.tick();await f.update(150);const wait=gate(),entered=gate(),original=CompoundAlertObserver.prototype.prepare;
 vi.spyOn(CompoundAlertObserver.prototype,'prepare').mockImplementation(async function(this:CompoundAlertObserver,time:number){const value=await original.call(this,time);entered.release();await wait.promise;return value;});
 const pending=f.runtime.tick();await entered.promise;f.refs.financial.current={...f.refs.financial.current,alerts:[]};wait.release();await pending;expect(compoundHistory(f.book.entry(f.entry.id)!.state)).toEqual([]);expect(f.book.entry(f.entry.id)!.state.previous).toEqual([130,130]);vi.restoreAllMocks();await f.runtime.tick();expect(compoundHistory(f.book.entry(f.entry.id)!.state).map(row=>row.values)).toEqual([[150,140]]);
});
it('never refreshes an expired writer across actual epochs while rendered epoch props are stale',async()=>{
 const f=await setup(true);await f.runtime.tick();await f.update(150);f.refs.financial.current={...f.refs.financial.current,alerts:[]};f.refs.financialGeneration.current++;const create=vi.spyOn(f.book,'createWriter');await f.runtime.tick();expect(create).not.toHaveBeenCalled();expect(compoundHistory(f.book.entry(f.entry.id)!.state)).toEqual([]);expect(f.book.entry(f.entry.id)!.state.previous).toEqual([130,130]);
});

function inactiveHost(){
 const dataset=fixtureDataset('GME',1),refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null}},activeController:{current:null},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new CompoundAlertBook(refs);closes.push(()=>book.close());const props:WorkspaceCompoundAlertsProps={book,enabled:false,financialGeneration:0,gridGeneration:0,financialGenerationRef:refs.financialGeneration,gridGenerationRef:refs.gridGeneration,readActionTime:()=>1000};return{book,refs,props};
}
it('owns exactly one 1s interval and removes it together with the book subscription on unmount',async()=>{
 vi.useFakeTimers();const f=inactiveHost(),tick=vi.spyOn(CompoundAlertRuntime.prototype,'tick'),dispose=vi.spyOn(CompoundAlertRuntime.prototype,'dispose'),ui=mountControlledComponent(()=>WorkspaceCompoundAlerts(f.props));ui.settle();expect(tick).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1000);expect(tick).toHaveBeenCalledTimes(2);ui.dispose();expect(dispose).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(5000);expect(tick).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
it('retires the previous epoch host before installing a replacement interval',async()=>{
 vi.useFakeTimers();const f=inactiveHost(),dispose=vi.spyOn(CompoundAlertRuntime.prototype,'dispose'),tick=vi.spyOn(CompoundAlertRuntime.prototype,'tick'),ui=mountControlledComponent(()=>WorkspaceCompoundAlerts(f.props));ui.settle();f.refs.gridGeneration.current++;const next={...f.props,gridGeneration:1};Object.assign(f.props,next);ui.settle();expect(dispose).toHaveBeenCalledTimes(1);expect(tick).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(1);ui.dispose();expect(dispose).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});

it('edge-notifies a genuine staged-input refusal once, clears on native acceptance and reports its return',async()=>{
 const f=await setup();
 const stage=async(value:number,at:number)=>{f.p.setNow(at);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:at,price:value,high:value,low:value,size:1}],receivedAt:''});await flushMtf();const dataset=f.p.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};};
 // Actual producer source advances, while the real native chart still has its
 // prior accepted input. No readiness, source receipt or result is fabricated.
 await stage(150,baseTime+1);await f.runtime.tick();expect(f.diagnostics).toHaveLength(1);const message=f.diagnostics[0][1];expect(typeof message).toBe('string');expect(message!.length).toBeGreaterThan(0);expect(f.diagnostics[0][0]).toBe(f.entry.id);expect(f.book.entry(f.entry.id)!.state.previous).toEqual([null,null]);
 await f.runtime.tick();expect(f.diagnostics).toEqual([[f.entry.id,message]]);
 await f.update(150);await f.runtime.tick();expect(f.book.entry(f.entry.id)!.state.previous).toEqual([150,140]);expect(f.diagnostics).toEqual([[f.entry.id,message],[f.entry.id,null]]);
 await stage(160,baseTime+2);await f.runtime.tick();expect(f.diagnostics).toEqual([[f.entry.id,message],[f.entry.id,null],[f.entry.id,message]]);
 f.runtime.dispose();expect(f.diagnostics).toEqual([[f.entry.id,message],[f.entry.id,null],[f.entry.id,message],[f.entry.id,null]]);
});
