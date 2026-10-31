import {afterEach,expect,it,vi} from 'vitest';
import {CompoundAlertBook,compoundAlertBookFor,type CompoundBookHostRefs,type CompoundBookEvent} from '../../src/ui/compound-alert-book';
import {COMPOUND_POLICY,compoundHistory,type CompoundDefinition,type CompoundBatch} from '../../src/domain/compound-alerts';
import {CompoundAlertObserver,compoundSourceContext,type CompoundChartInputPort} from '../../src/ui/compound-alert-observer';
import {encodeCompoundPrivateDocument,parseCompoundPrivateDocument} from '../../src/ui/compound-alert-document';
import {fixtureDataset} from '../../src/domain/fixtures';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {selectAlpacaSyntheticStub,isAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {AlertDeliverySettings} from '../../src/domain/alert-delivery';

// Scalar-domain cases test collection CAS/accounting, not source permission.
// The final case uses the actual private producer + actual SDK/native adapter
// and the real CompoundAlertObserver writing THROUGH the actual book writer.
const cleanup:Array<()=>unknown>=[];
afterEach(()=>{const errors:unknown[]=[];for(const close of cleanup.splice(0).reverse())try{close();}catch(error){errors.push(error);}vi.restoreAllMocks();if(errors.length)throw new AggregateError(errors,'Synthetic compound book cleanup failed.');});
const delivery=Object.freeze({schemaVersion:1 as const,popup:true,desktop:false,sound:null});
function definition(id='SYNTHETIC book'):CompoundDefinition{return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id,name:'Original declaration',message:'Original message',context:{instrumentId:'SYNTHETIC',sourceFamily:'SYNTHETIC feed',interval:'1m',session:'regular',basis:'SYNTHETIC basis'},predicates:[{id:'first',source:{kind:'price',field:'close'},operator:{kind:'greater',value:10}},{id:'second',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC frozen inputs',inputs:{length:2,source:'close'}},operator:{kind:'greater',value:20}}],frequency:'every-time',createdAt:0,expiresAt:null};}
function fixture(){
 const dataset=fixtureDataset('GME',1),chart:CompoundChartInputPort={getStyle:()=>{throw Error('Scalar book test must not ask for native proof.');},isInputExact:()=>{throw Error('No numerical permission.');},isInputCurrent:()=>{throw Error('No numerical permission.');}};
 const refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null as unknown}},activeController:{current:chart as CompoundChartInputPort|null},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null as unknown},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new CompoundAlertBook(refs);return{book,refs,dataset,chart};
}
async function create(f:ReturnType<typeof fixture>,d=definition()){
 const action=f.book.prepareCreate(d,delivery);expect(action.commit()).toBe(true);await flushMtf();return f.book.entry(d.id)!;
}
function prime(entry:NonNullable<ReturnType<CompoundAlertBook['entry']>>,sequence=1){
 const b:CompoundBatch={context:entry.state.definition.context,mode:'ordinary',sequence,observedAt:sequence*60,cutoffTime:sequence*60,barId:'SYNTHETIC bar '+sequence,barTime:(sequence-1)*60,barClosed:true,kind:'observation',samples:entry.state.definition.predicates.map((p,index)=>({predicateId:p.id,value:index,sequence,time:(sequence-1)*60,availableAt:sequence*60,barId:'SYNTHETIC bar '+sequence,confirmed:true}))};
 return entry.store.prime(b);
}
it('keeps one canonical book beside Workspace using the actual financial-ref registry',async()=>{
 const f=fixture(),entry=await create(f);expect(compoundAlertBookFor(f.refs.financial)).toBe(f.book);expect(()=>new CompoundAlertBook(f.refs)).toThrow(/already owns/);
 expect(f.book.entries()).toEqual([entry]);expect(f.book.documentSnapshots()[0].state).toBe(entry.store.current);expect(f.book.usage().bytes).toBeGreaterThan(0);expect(f.book.usage().nodes).toBeGreaterThan(0);expect(f.book.usage().history).toBe(0);
});
it('CAS-refuses a prepared create after a newer collection change without restoring the old version',async()=>{
 const f=fixture(),old=f.book.prepareCreate(definition('old'),delivery),latest=f.book.prepareCreate(definition('new'),delivery);
 expect(latest.commit()).toBe(true);const version=f.book.version;expect(old.commit()).toBe(false);expect(old.rollback()).toBe(false);expect(f.book.version).toBe(version);expect(f.book.entry('old')).toBeNull();expect(f.book.entry('new')).not.toBeNull();await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);
});
it('holds preparation reservations through the actual rollback stack and microtask unwind',async()=>{
 const f=fixture(),action=f.book.prepareCreate(definition(),delivery);expect(f.book.usage().reservedBytes).toBeGreaterThan(0);expect(action.rollback()).toBe(true);expect(f.book.usage().reservedBytes).toBeGreaterThan(0);expect(action.commit()).toBe(false);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);expect(f.book.entries()).toHaveLength(0);
});
it('admits only the current ready ordinary main-window full input without calling chart proof methods',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id);expect(writer.read()?.rows).toBe(f.dataset.bars);
 f.refs.storageMutation.current=true;expect(writer.read()).toBeNull();f.refs.storageMutation.current=false;expect(writer.read()).not.toBeNull();
 f.refs.workspaceTransaction.current=true;expect(writer.read()).toBeNull();f.refs.workspaceTransaction.current=false;
 f.refs.currentReplay.current={};expect(writer.read()).toBeNull();f.refs.currentReplay.current=null;f.refs.currentInput.current.replay={};expect(writer.read()).toBeNull();f.refs.currentInput.current.replay=null;
 f.refs.currentInput.current={...f.refs.currentInput.current,bars:[...f.dataset.bars]};expect(writer.read()).toBeNull();f.refs.currentInput.current={dataset:f.dataset,bars:f.dataset.bars,replay:null};expect(writer.read()).not.toBeNull();
 f.refs.startup.current={phase:'loading'};expect(writer.read()).toBeNull();f.refs.startup.current={phase:'ready'};expect(writer.read()).not.toBeNull();
});
it('expires writers permanently on grid or financial epoch changes even if a caller restores the number',async()=>{
 const f=fixture(),entry=await create(f),grid=f.book.createWriter(entry.id);f.refs.gridGeneration.current++;expect(grid.read()).toBeNull();f.refs.gridGeneration.current--;expect(grid.read()).toBeNull();
 const financial=f.book.createWriter(entry.id);f.refs.financialGeneration.current++;expect(financial.read()).toBeNull();f.refs.financialGeneration.current--;expect(financial.read()).toBeNull();
 const actual=f.book.createWriter(entry.id),paper=f.refs.financial.current.paper;f.refs.financial.current={...f.refs.financial.current,paper:{}};expect(actual.read()).toBeNull();f.refs.financial.current={...f.refs.financial.current,paper};expect(actual.read()).toBeNull();
});
it('does not interpret an accessor ref as a callback-free Root snapshot',()=>{
 const f=fixture(),getter=vi.fn(()=>f.chart),foreign={...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}},activeController:Object.defineProperty({},'current',{get:getter})};
 expect(()=>new CompoundAlertBook(foreign as unknown as CompoundBookHostRefs)).toThrow(/own data refs/);expect(getter).not.toHaveBeenCalled();
 const secondary={...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}},mainWindow:false},book=new CompoundAlertBook(secondary);expect(()=>book.prepareCreate(definition(),delivery)).toThrow(/suspended/);
});
it('refuses a bare true acknowledgment unless the actual canonical store committed next',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=prime(entry),ack=vi.fn(()=>true),version=f.book.version;
 expect(()=>writer.publish(writer.read()!,p.next,ack,null)).toThrow(/canonical store/);expect(ack).toHaveBeenCalledTimes(1);expect(f.book.version).toBe(version);expect(f.book.entry(entry.id)).toBe(entry);expect(entry.store.current).toBe(entry.state);expect(p.rollback()).toBe(true);
});
it('preserves state and version on false acknowledgment and throwing falsy acknowledgments',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=prime(entry),owner=writer.read()!,version=f.book.version;
 const refuse=vi.fn(()=>false);expect(writer.publish(owner,p.next,refuse,null)).toBe(false);expect(refuse).toHaveBeenCalledTimes(1);
 let thrown:unknown=Symbol();try{writer.publish(owner,p.next,()=>{throw 0;},null);}catch(error){thrown=error;}expect(thrown).toBe(0);expect(f.book.entry(entry.id)).toBe(entry);expect(entry.store.current).toBe(entry.state);expect(f.book.version).toBe(version);expect(p.rollback()).toBe(true);
});
it('assigns canonical entry and version before notification and never calls ack twice',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=prime(entry),version=f.book.version,states:unknown[]=[];
 f.book.subscribe(event=>{states.push({book:f.book.entry(entry.id)?.state,domain:entry.store.current,version:f.book.version,event});throw 0;});
 const ack=vi.fn(()=>p.commit());expect(writer.publish(writer.read()!,p.next,ack,null)).toBe(true);expect(ack).toHaveBeenCalledTimes(1);expect(f.book.version).toBe(version+1n);expect(states).toEqual([{book:p.next,domain:p.next,version:version+1n,event:{kind:'observation',version:version+1n,entry:f.book.entry(entry.id),fresh:null}}]);expect(f.book.notificationErrors()).toEqual(['Compound collection notification failed.']);
 const duplicate=vi.fn(()=>true);expect(writer.publish(writer.read()!,p.next,duplicate,null)).toBe(false);expect(duplicate).not.toHaveBeenCalled();
});
it('rejects copied or unknown binding objects before any supplied proxy field is read',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=entry.store.prepare({...primeBatch(entry),samples:entry.state.definition.predicates.map((predicate,index)=>({predicateId:predicate.id,value:100+index,sequence:1,time:0,availableAt:60,barId:'SYNTHETIC positive',confirmed:true}))}),ack=vi.fn(()=>p.commit()),traps=vi.fn(()=>{throw Error('Foreign binding trap.');}),proxy=new Proxy({},{get:traps,getOwnPropertyDescriptor:traps,getPrototypeOf:traps});
 expect(p.notification).not.toBeNull();expect(writer.publish(writer.read()!,p.next,ack,proxy as never)).toBe(false);expect(ack).not.toHaveBeenCalled();expect(traps).not.toHaveBeenCalled();expect(entry.store.current).toBe(entry.state);p.rollback();
});
function primeBatch(entry:NonNullable<ReturnType<CompoundAlertBook['entry']>>):CompoundBatch{return{context:entry.state.definition.context,mode:'ordinary',sequence:1,observedAt:60,cutoffTime:60,barId:'SYNTHETIC positive',barTime:0,barClosed:true,kind:'observation',samples:[]};}
it('edits with fresh canonical state and drops only unreferenced declaration metadata',async()=>{
 const f=fixture(),entry=await create(f),oldWriter=f.book.createWriter(entry.id),changed={...entry.state.definition,name:'Edited',predicates:[...entry.state.definition.predicates,{id:'third',source:{kind:'price' as const,field:'open' as const},operator:{kind:'less' as const,value:3}}]},settings={schemaVersion:1 as const,popup:false,desktop:true,sound:'lv-chime' as const};
 const edit=f.book.prepareEdit(entry.id,entry,changed,settings,10);expect(edit.commit()).toBe(true);const next=f.book.entry(entry.id)!;expect(next.state.revision).toBe(2);expect(next.state.status).toBe('waiting-for-data');expect(next.state.previous).toEqual([null,null,null]);expect(next.declarations).toEqual([{revision:2,definition:next.state.definition}]);expect(next.delivery).toEqual(settings);expect(oldWriter.read()).toBeNull();expect(entry.delivery).toEqual(delivery);
});
it('supports explicit pause resume rearm and removal while old entry writers remain retired',async()=>{
 const f=fixture(),baseline=f.book.usage().bytes,initial=await create(f),old=f.book.createWriter(initial.id);expect(f.book.prepareLifecycle(initial.id,initial,'pause',1).commit()).toBe(true);let entry=f.book.entry(initial.id)!;expect(entry.state.status).toBe('paused');expect(old.read()).toBeNull();
 expect(f.book.prepareLifecycle(entry.id,entry,'resume',2).commit()).toBe(true);entry=f.book.entry(entry.id)!;expect(entry.state.status).toBe('active');expect(f.book.prepareLifecycle(entry.id,entry,'rearm',3).commit()).toBe(true);entry=f.book.entry(entry.id)!;expect(entry.state.revision).toBe(2);expect(entry.declarations).toEqual([{revision:2,definition:entry.state.definition}]);
 const writer=f.book.createWriter(entry.id);expect(f.book.prepareRemove(entry.id,entry).commit()).toBe(true);expect(writer.read()).toBeNull();expect(f.book.entries()).toHaveLength(0);expect(f.book.usage().bytes).toBe(baseline);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);
});
it('keeps retained usage when a book closes and refuses writers without clearing its saved records',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),before=f.book.usage();f.book.close();expect(writer.read()).toBeNull();expect(f.book.usage()).toEqual(before);expect(f.book.documentSnapshots()[0].state).toBe(entry.state);expect(()=>f.book.prepareCreate(definition('new'),delivery)).toThrow(/suspended/);
});
it('advances an explicit lifecycle clock without resetting the declaration or expiring the same writer',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=prime(entry);expect(writer.publish(writer.read()!,p.next,()=>p.commit(),null)).toBe(true);const current=f.book.entry(entry.id)!;
 expect(f.book.prepareLifecycle(entry.id,current,'advance',70).commit()).toBe(true);const next=f.book.entry(entry.id)!;expect(next.generation).toBe(current.generation);expect(next.state.previous).toEqual(current.state.previous);expect(next.state.clock).toBe(70);expect(writer.read()?.store.current).toBe(next.state);
});
it('does not roll back an acknowledged observation when a later listener reenters a newer collection change',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),p=prime(entry);let newer=false;
 f.book.subscribe(event=>{if(event.kind==='observation')newer=f.book.prepareCreate(definition('SYNTHETIC newer'),delivery).commit();});
 expect(writer.publish(writer.read()!,p.next,()=>p.commit(),null)).toBe(true);expect(newer).toBe(true);expect(f.book.entry(entry.id)?.state).toBe(p.next);expect(f.book.entry('SYNTHETIC newer')).not.toBeNull();expect(f.book.version).toBe(3n);
});
it('admits candidate metadata before parsing restore and refuses conservative remaining-headroom exhaustion',async()=>{
 const f=fixture(),actions=[];let failed=false;
 for(let index=0;index<40;index++)try{actions.push(f.book.prepareCreate(definition('candidate'+index),delivery));}catch{failed=true;break;}
 expect(failed).toBe(true);expect(f.book.entries()).toHaveLength(0);expect(f.book.usage().reservedBytes).toBeLessThanOrEqual(20*1024*1024);for(const action of actions)expect(action.rollback()).toBe(true);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);
 const parse=vi.spyOn(JSON,'parse');expect(()=>f.book.prepareAdopt(' '.repeat(400000),1)).toThrow(/budget/);expect(parse).not.toHaveBeenCalled();
});
it('adopts a validated private replacement without delivering saved journal or retaining an old writer',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),events:CompoundBookEvent[]=[];f.book.subscribe(event=>events.push(event));
 const json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),1),adopt=f.book.prepareAdopt(json,2);expect(adopt.commit()).toBe(true);await flushMtf();const restored=f.book.entry(entry.id)!;expect(restored.store).not.toBe(entry.store);expect(restored.state.status).toBe('waiting-for-data');expect(restored.state.previous).toEqual([null,null]);expect(restored.declarations[0].definition).toBe(restored.state.definition);expect(writer.read()).toBeNull();expect(events).toHaveLength(1);expect(events[0].fresh).toBeNull();
});
it('records genuine coherent notifications through the real observer and keeps restored history out of fresh delivery',async()=>{
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);cleanup.push(()=>selectAlpacaSyntheticStub(previous));const time=unix('2024-03-11T19:59:50Z'),p=await publishedSource({now:time,resolution:'15m'});cleanup.push(()=>p.dispose());let dataset=p.regular();const native=await ownedInputStylePipelineFixture({dataset});cleanup.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const f=fixture();f.refs.activeController.current=native.controller as CompoundChartInputPort;f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};
 const context=compoundSourceContext(dataset,dataset.bars)!;expect(context).not.toBeNull();const d={...definition(),context,predicates:[{id:'first',source:{kind:'price' as const,field:'close' as const},operator:{kind:'greater' as const,value:125}},{id:'second',source:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC frozen',inputs:{length:2,source:'close'}},operator:{kind:'greater' as const,value:129}}]};
 let entry=await create(f,d),observer=new CompoundAlertObserver(f.book.createWriter(entry.id));cleanup.push(()=>observer.dispose());const fresh:NonNullable<CompoundBookEvent['fresh']>[]=[];f.book.subscribe(event=>{if(event.fresh)fresh.push(event.fresh);});
 expect((await observer.prepare(time)).commit()).toBe(true);
 const tick=async(value:number,at:number)=>{p.setNow(at);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:at,price:value,high:value,low:value,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();expect((await native.accept(dataset)).accepted).toBe(true);f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};};
 await tick(150,time+1);expect((await observer.prepare(time+1)).commit()).toBe(true);entry=f.book.entry(entry.id)!;expect(entry.journal!.item).toBe(entry.state.history!.item);expect(entry.journal!.binding.declaration).toBe(entry.state.definition);expect(entry.journal!.delivery).toEqual(delivery);expect(fresh.map(n=>n.item.values)).toEqual([[150,140]]);
 const retained=f.book.usage();observer.dispose();await flushMtf();expect(f.book.usage().bytes).toBe(retained.bytes);expect(f.book.usage().history).toBe(1);
 const json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),time+1),adopt=f.book.prepareAdopt(json,time+2);expect(adopt.commit()).toBe(true);await flushMtf();entry=f.book.entry(entry.id)!;expect(entry.journal!.binding.declaration).toBe(entry.state.definition);expect(fresh).toHaveLength(1);
 observer=new CompoundAlertObserver(f.book.createWriter(entry.id));const seed=await observer.prepare(time+2);expect(seed.priming).toBe(true);expect(seed.commit()).toBe(true);expect(fresh).toHaveLength(1);await tick(160,time+3);expect((await observer.prepare(time+3)).commit()).toBe(true);entry=f.book.entry(entry.id)!;
 expect(compoundHistory(entry.state).map(n=>n.values)).toEqual([[150,140],[160,145]]);expect(fresh.map(n=>n.item.values)).toEqual([[150,140],[160,145]]);expect(new Set(compoundHistory(entry.state).map(n=>n.id)).size).toBe(2);expect(entry.state.lastSequence).toBe(4);expect(parseCompoundPrivateDocument(encodeCompoundPrivateDocument(f.book.documentSnapshots(),time+3)).records[0].journal).toHaveLength(2);
 const previousDeclaration=entry.state.definition,oldJournal=entry.journal!,newDelivery:AlertDeliverySettings={schemaVersion:1,popup:false,desktop:true,sound:'lv-chime'};
 observer.dispose();expect(f.book.prepareEdit(entry.id,entry,{...previousDeclaration,name:'Edited declaration'},newDelivery,time+4).commit()).toBe(true);await flushMtf();entry=f.book.entry(entry.id)!;observer=new CompoundAlertObserver(f.book.createWriter(entry.id));expect((await observer.prepare(time+4)).commit()).toBe(true);expect(fresh).toHaveLength(2);
 await tick(170,time+5);expect((await observer.prepare(time+5)).commit()).toBe(true);entry=f.book.entry(entry.id)!;expect(entry.journal!.binding.declaration.name).toBe('Edited declaration');expect(entry.journal!.previous).toBe(oldJournal);expect(entry.journal!.previous!.binding.declaration).toBe(previousDeclaration);expect(entry.journal!.delivery).toEqual(newDelivery);expect(entry.journal!.previous!.delivery).toEqual(delivery);expect(entry.journal!.item.values).toEqual([170,150]);expect(fresh).toHaveLength(3);expect(entry.declarations.map(d=>d.revision)).toEqual([1,2]);
});

it('releases lifecycle preparation metadata after a throwing falsy serializer before any canonical mutation',async()=>{
 const f=fixture(),entry=await create(f),version=f.book.version;const stringify=vi.spyOn(JSON,'stringify').mockImplementation(()=>{throw 0;});let thrown:unknown=Symbol();
 try{f.book.prepareLifecycle(entry.id,entry,'rearm',1);}catch(error){thrown=error;}finally{stringify.mockRestore();}
 expect(thrown).toBe(0);expect(f.book.entry(entry.id)).toBe(entry);expect(entry.store.current).toBe(entry.state);expect(f.book.version).toBe(version);expect(f.book.usage().reservedBytes).toBeGreaterThan(0);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);
});

async function currentSourceFixture(){
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);cleanup.push(()=>selectAlpacaSyntheticStub(previous));const p=await publishedSource({now:unix('2024-03-11T19:59:50Z'),resolution:'15m'});cleanup.push(()=>p.dispose());const dataset=p.regular(),f=fixture();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};return{...f,actual:dataset};
}
it('describes only the actual current privately qualified compound source without native calls',async()=>{
 const f=await currentSourceFixture(),context=f.book.describeCurrentSource();expect(context).toEqual(compoundSourceContext(f.actual,f.actual.bars));expect(context).not.toBeNull();expect(context?.interval).toBe('15m');expect(context?.session).toBe('regular');expect(Object.isFrozen(context)).toBe(true);
});
it('refuses copied current datasets and copied row arrays as descriptive source context',async()=>{
 const f=await currentSourceFixture();f.refs.currentInput.current={dataset:{...f.actual},bars:f.actual.bars,replay:null};expect(f.book.describeCurrentSource()).toBeNull();f.refs.currentInput.current={dataset:f.actual,bars:[...f.actual.bars],replay:null};expect(f.book.describeCurrentSource()).toBeNull();
});
it('withdraws descriptive source context during actual Root holds or replay without minting a substitute',async()=>{
 const f=await currentSourceFixture();expect(f.book.describeCurrentSource()).not.toBeNull();f.refs.storageMutation.current=true;expect(f.book.describeCurrentSource()).toBeNull();f.refs.storageMutation.current=false;f.refs.workspaceTransaction.current=true;expect(f.book.describeCurrentSource()).toBeNull();f.refs.workspaceTransaction.current=false;f.refs.currentReplay.current={};expect(f.book.describeCurrentSource()).toBeNull();f.refs.currentReplay.current=null;expect(f.book.describeCurrentSource()).not.toBeNull();
});
it('adopts under startup and storage holds while real live input refreshes and notifies only after Root assignments',async()=>{
 const f=fixture(),entry=await create(f),json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),1);f.refs.startup.current={phase:'loading'};f.refs.storageMutation.current=true;f.refs.workspaceTransaction.current=true;
 const action=f.book.prepareAdopt(json,2),events:Array<{phase:string;paper:unknown;grid:number;held:boolean;reserved:number;fresh:unknown}>=[];
 f.book.subscribe(event=>events.push({phase:f.refs.startup.current.phase,paper:f.refs.financial.current.paper,grid:f.refs.gridGeneration.current,held:f.refs.storageMutation.current||f.refs.workspaceTransaction.current,reserved:f.book.usage().reservedBytes,fresh:event.fresh}));
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);cleanup.push(()=>selectAlpacaSyntheticStub(previous));const time=unix('2024-03-11T19:59:50Z'),p=await publishedSource({now:time,resolution:'15m'});cleanup.push(()=>p.dispose());let dataset=p.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};
 action.assertCurrent();p.setNow(time+1);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+1,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};f.refs.activeController.current={...f.chart};action.assertCurrent();
 expect(action.commit()).toBe(true);expect(events).toHaveLength(0);expect(f.book.entry(entry.id)?.store).not.toBe(entry.store);expect(f.book.usage().reservedBytes).toBeGreaterThan(0);
 const paper={};f.refs.financial.current={paper,paperBook:null,alerts:[]};f.refs.financialGeneration.current++;f.refs.gridGeneration.current++;f.refs.startup.current={phase:'ready'};f.refs.storageMutation.current=false;f.refs.workspaceTransaction.current=false;
 await flushMtf();expect(events).toHaveLength(1);expect(events[0]).toMatchObject({phase:'ready',paper,grid:1,held:false,fresh:null});expect(events[0].reserved).toBeGreaterThan(0);expect(f.book.usage().reservedBytes).toBe(0);expect(()=>action.assertCurrent()).toThrow(/no longer current/);
});
it('allows secondary-window data-only adoption while every observation and manual action stays disabled',async()=>{
 const f=fixture();await create(f);const json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),1),refs={...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}},mainWindow:false,startup:{current:{phase:'loading'}},storageMutation:{current:true},workspaceTransaction:{current:true}},secondary=new CompoundAlertBook(refs);
 const action=secondary.prepareAdopt(json,2);action.assertCurrent();expect(action.commit()).toBe(true);refs.startup.current={phase:'ready'};refs.storageMutation.current=false;refs.workspaceTransaction.current=false;await flushMtf();
 expect(secondary.entries()).toHaveLength(1);expect(secondary.createWriter(secondary.entries()[0].id).read()).toBeNull();expect(secondary.describeCurrentSource()).toBeNull();expect(()=>secondary.prepareCreate(definition('other'),delivery)).toThrow(/suspended/);
});
it('refuses replacement ownership changes without confusing them with harmless live input changes',async()=>{
 for(const change of ['financial','grid','startup','hold'] as const){
  const f=fixture(),entry=await create(f),json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),1);f.refs.startup.current={phase:'loading'};f.refs.storageMutation.current=true;const action=f.book.prepareAdopt(json,2),version=f.book.version;
  if(change==='financial')f.refs.financial.current={...f.refs.financial.current,paper:{}};if(change==='grid')f.refs.gridGeneration.current++;if(change==='startup')f.refs.startup.current={phase:'loading'};if(change==='hold')f.refs.storageMutation.current=false;
  expect(()=>action.assertCurrent()).toThrow(/no longer current/);expect(action.commit()).toBe(false);expect(f.book.version).toBe(version);expect(f.book.entry(entry.id)).toBe(entry);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);
 }
});
it('keeps review ownership stable for pure samples and clock while exact save ownership advances',async()=>{
 const f=fixture(),entry=await create(f),writer=f.book.createWriter(entry.id),review=f.book.reviewVersion,version=f.book.version,p=prime(entry);expect(writer.publish(writer.read()!,p.next,()=>p.commit(),null)).toBe(true);expect(f.book.version).toBe(version+1n);expect(f.book.reviewVersion).toBe(review);
 const current=f.book.entry(entry.id)!;expect(f.book.prepareLifecycle(entry.id,current,'advance',70).commit()).toBe(true);expect(f.book.reviewVersion).toBe(review);const updated=f.book.entry(entry.id)!;expect(f.book.prepareLifecycle(entry.id,updated,'pause',71).commit()).toBe(true);expect(f.book.reviewVersion).toBe(review+1n);
});
it('keeps genuine removed history charged throughout a reentrant listener and refunds only after owned unwind',async()=>{
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);cleanup.push(()=>selectAlpacaSyntheticStub(previous));const time=unix('2024-03-11T19:59:50Z'),p=await publishedSource({now:time,resolution:'15m'});cleanup.push(()=>p.dispose());let dataset=p.regular();const native=await ownedInputStylePipelineFixture({dataset});cleanup.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const f=fixture();f.refs.activeController.current=native.controller as CompoundChartInputPort;f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};const d={...definition(),context:compoundSourceContext(dataset,dataset.bars)!,predicates:[{id:'first',source:{kind:'price' as const,field:'close' as const},operator:{kind:'greater' as const,value:125}},{id:'second',source:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC frozen',inputs:{length:2,source:'close'}},operator:{kind:'greater' as const,value:129}}]};
 let entry=await create(f,d);const observer=new CompoundAlertObserver(f.book.createWriter(entry.id));cleanup.push(()=>observer.dispose());expect((await observer.prepare(time)).commit()).toBe(true);p.setNow(time+1);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+1,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();expect((await native.accept(dataset)).accepted).toBe(true);f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};expect((await observer.prepare(time+1)).commit()).toBe(true);await flushMtf();entry=f.book.entry(entry.id)!;expect(entry.journal!.item.values).toEqual([150,140]);
 observer.dispose();const charged=f.book.usage(),samples:Array<{history:number;reserved:number;total:number}>=[];let nested=false;
 f.book.subscribe(event=>{if(event.kind==='remove'){const u=f.book.usage();samples.push({history:u.history,reserved:u.reservedBytes,total:u.bytes+u.reservedBytes});nested=f.book.prepareCreate({...definition('replacement'),context:d.context},delivery).commit();}});
 const action=f.book.prepareRemove(entry.id,entry);expect(action.commit()).toBe(true);expect(nested).toBe(true);expect(samples).toHaveLength(1);expect(samples[0].history).toBe(0);expect(samples[0].reserved).toBeGreaterThan(0);expect(samples[0].total).toBeGreaterThanOrEqual(charged.bytes);expect(f.book.usage().reservedBytes).toBeGreaterThan(0);await flushMtf();expect(f.book.usage().reservedBytes).toBe(0);expect(f.book.entry(entry.id)).toBeNull();expect(()=>action.assertCurrent()).toThrow(/no longer current/);
});
