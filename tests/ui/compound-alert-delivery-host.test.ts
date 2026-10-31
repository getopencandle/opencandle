import {afterEach,expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {CompoundAlertDeliveryHost,CompoundDeliveryRuntime,type CompoundAlertDeliveryHostProps,type CompoundDeliveryPorts} from '../../src/ui/CompoundAlertDeliveryHost';
import type {CompoundAlertBook,CompoundBookEntry,CompoundBookEvent} from '../../src/ui/compound-alert-book';
import type {CompoundJournalNode} from '../../src/ui/compound-alert-document';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {type AlertDeliverySettings,type DesktopNotificationPort,ALERT_POPUP_AUTOHIDE_MS} from '../../src/domain/alert-delivery';

// Transport/component tests only: the event source and OS/audio ports are
// controlled. These cases do not claim canonical-book/source/numerical authority
// or actual browser/OS output. Runtime tests separately use the real book.
const closes:Array<()=>void>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.useRealTimers();await flushMtf();if(errors.length)throw new AggregateError(errors,'Synthetic compound delivery cleanup failed.');});
const microtasks=async()=>{for(let index=0;index<80;index++)await Promise.resolve();};
function definition(name='Original synthetic declaration'):CompoundDefinition{return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'compound-SYNTHETIC',name,message:'Original synthetic message',context:{instrumentId:'SYNTHETIC GME',sourceFamily:'live:alpaca-stub:GME:1m',interval:'1m',session:'regular',basis:'SYNTHETIC basis'},predicates:[{id:'price',source:{kind:'price',field:'close'},operator:{kind:'greater',value:125}},{id:'average',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'frozen SYNTHETIC',inputs:{length:2,source:'close'}},operator:{kind:'greater',value:129}}],frequency:'every-time',createdAt:0,expiresAt:null};}
const defaultDelivery:AlertDeliverySettings={schemaVersion:1,popup:true,desktop:true,sound:null};
function channel(){
 let generation={},version=0n,rows=[{id:'compound-SYNTHETIC',generation}] as unknown as CompoundBookEntry[];const listeners=new Set<(event:CompoundBookEvent)=>void>();
 const book={entry:(id:string)=>rows.find(row=>row.id===id)??null,entries:()=>rows,subscribe:(listener:(event:CompoundBookEvent)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}} as unknown as CompoundAlertBook;
 const emit=(kind:CompoundBookEvent['kind'],fresh:CompoundJournalNode|null=null)=>{const event={kind,version:++version,entry:kind==='observation'?rows[0]??null:null,fresh};for(const listener of [...listeners])listener(event);};
 const fire=(sequence=1,delivery=defaultDelivery,d=definition())=>{const node:CompoundJournalNode={item:{id:'SYNTHETIC-'+sequence,alertId:d.id,revision:1,sequence,at:1000+sequence,barId:'SYNTHETIC bar',values:[150,140],local:true},binding:{id:'SYNTHETIC binding',revision:1,restriction:'restricted-live',declaration:d,provenance:{providerId:'alpaca-stub',datasetId:d.context.sourceFamily,revision:'SYNTHETIC revision',resolution:'1m',basis:d.context.basis}},delivery,previous:null,size:sequence};emit('observation',node);return node;};
 return{book,fire,emit,listeners,remove(){rows=[];emit('remove');},replace(){generation={};rows=[{id:'compound-SYNTHETIC',generation}] as unknown as CompoundBookEntry[];emit('edit');},adopt(){emit('adopt');}};
}
function runtime(options:Partial<CompoundDeliveryPorts>={}){
 const c=channel(),popup=vi.fn(),notice=vi.fn(),play=vi.fn(async()=>{}),show=vi.fn<DesktopNotificationPort['show']>(async()=>{}),ports:CompoundDeliveryPorts={soundPlayer:{play},desktopPort:{permission:()=> 'granted',show},popup,notice,...options};
 const owner=new CompoundDeliveryRuntime(c.book,()=>ports);closes.push(()=>owner.dispose());return{...c,owner,ports,popup,notice,play,show};
}
it('never redelivers initial, adopted or non-fresh history and releases its subscription',async()=>{
 const f=runtime();f.emit('adopt');f.emit('observation');await microtasks();expect(f.popup).not.toHaveBeenCalled();expect(f.show).not.toHaveBeenCalled();expect(f.play).not.toHaveBeenCalled();f.owner.dispose();expect(f.listeners.size).toBe(0);f.fire();await microtasks();expect(f.popup).not.toHaveBeenCalled();
});
it('uses the original revision declaration, delivery and provenance rather than a newer current name',async()=>{
 const f=runtime();f.fire(1,{schemaVersion:1,popup:true,desktop:true,sound:'lv-rise'},definition('Frozen original name'));await microtasks();
 const item=f.popup.mock.calls[0][0][0];expect(item.view.title).toBe('SYNTHETIC Alert: Frozen original name');expect(item.view.conditions).toEqual([{label:'Close: Greater than 125',value:'150'},{label:'SMA (2, Close): Greater than 129',value:'140'}]);expect(f.show.mock.calls).toEqual([['SYNTHETIC Alert: Frozen original name','Original synthetic message\nClose: Greater than 125 = 150\nSMA (2, Close): Greater than 129 = 140','SYNTHETIC-1']]);expect(f.play).toHaveBeenCalledWith('lv-rise');
});
it('caps each popup/desktop batch at20 independently and keeps the latest selected sound',async()=>{
 const f=runtime();for(let index=1;index<=25;index++)f.fire(index,{schemaVersion:1,popup:true,desktop:false,sound:index===1?'lv-chime':null});for(let index=26;index<=50;index++)f.fire(index,{schemaVersion:1,popup:false,desktop:true,sound:null});await microtasks();
 expect(f.popup.mock.calls[0][0].map((item:{view:{id:string}})=>item.view.id)).toEqual(Array.from({length:20},(_,index)=>'SYNTHETIC-'+(index+6)));expect(f.popup.mock.calls[0][1]).toBe(5);expect(f.show.mock.calls.map(args=>args[2])).toEqual(Array.from({length:20},(_,index)=>'SYNTHETIC-'+(index+31)));expect(f.play.mock.calls).toEqual([['lv-chime']]);expect(f.notice.mock.calls.flat().join(' ')).toContain('5 additional desktop notifications');
});
it('does not show a desktop notification after removal while permission is pending',async()=>{
 let allow!:(value:'granted')=>void;const permission=new Promise<'granted'>(resolve=>{allow=resolve;}),show=vi.fn(),request=vi.fn(()=>permission);
 const f=runtime({desktopPort:{permission:()=> 'default',request,show}});f.fire(1,{schemaVersion:1,popup:false,desktop:true,sound:null});await microtasks();expect(request).toHaveBeenCalledTimes(1);f.remove();allow('granted');await microtasks();expect(show).not.toHaveBeenCalled();
});
it('cancels pending delivery on adoption even if a controlled transport reuses the generation object',async()=>{
 let allow!:(value:'granted')=>void;const permission=new Promise<'granted'>(resolve=>{allow=resolve;}),show=vi.fn(),f=runtime({desktopPort:{permission:()=> 'default',request:()=>permission,show}});
 f.fire(1,{schemaVersion:1,popup:false,desktop:true,sound:null});await microtasks();f.adopt();allow('granted');await microtasks();expect(show).not.toHaveBeenCalled();
});
it('stops later desktop calls after an awaited show and same-id replacement or disposal',async()=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),show=vi.fn(()=>held),f=runtime({desktopPort:{permission:()=> 'granted',show}});
 f.fire(1);f.fire(2);await microtasks();expect(show).toHaveBeenCalledTimes(1);f.replace();f.owner.dispose();release();await microtasks();expect(show).toHaveBeenCalledTimes(1);expect(f.notice).not.toHaveBeenCalled();
});
it('reports denied permission and sound failure honestly while retaining popups',async()=>{
 const show=vi.fn(),f=runtime({soundPlayer:{play:async()=>{throw 0;}},desktopPort:{permission:()=> 'denied',show}});f.fire(1,{schemaVersion:1,popup:true,desktop:true,sound:'lv-chime'});await microtasks();expect(f.popup.mock.calls[0][0]).toHaveLength(1);expect(show).not.toHaveBeenCalled();expect(f.notice.mock.calls.flat().join(' ')).toContain('Alert sound was not played: 0');expect(f.notice.mock.calls.flat().join(' ')).toContain('permission is denied');
});
it('reports unavailable and refusing desktop output without claiming delivery',async()=>{
 const f=runtime({desktopPort:null});f.fire();await microtasks();expect(f.notice.mock.calls.flat().join(' ')).toContain('Desktop notifications are unavailable');
 const second=runtime({desktopPort:{permission:()=> 'granted',show:async()=>{throw false;}}});second.fire();await microtasks();expect(second.notice.mock.calls.flat().join(' ')).toContain('was not shown: false');
});
it('does not request permission after the permission reader itself removes its declaration',async()=>{
 let f:ReturnType<typeof runtime>;const request=vi.fn(async()=> 'granted' as const),show=vi.fn();f=runtime({desktopPort:{permission:()=>{f.remove();return 'default';},request,show}});f.fire();await microtasks();expect(request).not.toHaveBeenCalled();expect(show).not.toHaveBeenCalled();
});
it('checks actual epoch refs after permission even before a component effect can clean up',async()=>{
 let allow!:(value:'granted')=>void;const permission=new Promise<'granted'>(resolve=>{allow=resolve;}),f=channel(),show=vi.fn(),financialGenerationRef={current:0},props:CompoundAlertDeliveryHostProps={book:f.book,financialGeneration:0,gridGeneration:0,financialGenerationRef,gridGenerationRef:{current:0},desktopPort:{permission:()=> 'default',request:()=>permission,show},soundPlayer:{play:async()=>{}}},ui=mountControlledComponent(()=>CompoundAlertDeliveryHost(props));ui.settle();f.fire();await microtasks();financialGenerationRef.current=1;allow('granted');await microtasks();expect(show).not.toHaveBeenCalled();ui.dispose();expect(f.listeners.size).toBe(0);
});
it('bounds mounted popups to5 and auto-hides without editing any journal item',async()=>{
 vi.useFakeTimers();const f=channel(),show=vi.fn(),props:CompoundAlertDeliveryHostProps={book:f.book,financialGeneration:0,gridGeneration:0,financialGenerationRef:{current:0},gridGenerationRef:{current:0},desktopPort:{permission:()=> 'granted',show},soundPlayer:{play:async()=>{}}},ui=mountControlledComponent(()=>CompoundAlertDeliveryHost(props));ui.settle();
 const nodes=()=>all(ui.render(),node=>typeof node.props['data-compound-notification-id']==='string');const items=[];for(let index=1;index<=7;index++)items.push(f.fire(index));await vi.advanceTimersByTimeAsync(0);ui.settle();expect(nodes()).toHaveLength(5);expect(nodes().map(node=>node.props['data-compound-notification-id'])).toEqual(['SYNTHETIC-3','SYNTHETIC-4','SYNTHETIC-5','SYNTHETIC-6','SYNTHETIC-7']);expect(text(ui.render())).toContain('2 earlier compound alert popups');
 await vi.advanceTimersByTimeAsync(ALERT_POPUP_AUTOHIDE_MS);ui.settle();expect(nodes()).toHaveLength(0);expect(items.map(item=>item.item.values)).toEqual(Array.from({length:7},()=>[150,140]));ui.dispose();expect(f.listeners.size).toBe(0);
});

import {CompoundAlertBook as ActualCompoundAlertBook} from '../../src/ui/compound-alert-book';
import {CompoundAlertObserver,compoundSourceContext,type CompoundChartInputPort} from '../../src/ui/compound-alert-observer';
import {encodeCompoundPrivateDocument} from '../../src/ui/compound-alert-document';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

it('refuses queued desktop continuation after actual adoption commits before its deferred book notice',async()=>{
 // Actual producer/native/book/observer journal; only the OS permission/output
 // ports are controlled. The real BookV4 adoption notification is deferred.
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(previous));const time=unix('2024-03-11T19:59:50Z'),p=await publishedSource({now:time,resolution:'15m'});closes.push(()=>p.dispose());let dataset=p.regular();
 const native=await ownedInputStylePipelineFixture({dataset});closes.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null}},activeController:{current:native.controller as CompoundChartInputPort|null},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new ActualCompoundAlertBook(refs);closes.push(()=>book.close());const d={...definition(),context:compoundSourceContext(dataset,dataset.bars)!};expect(book.prepareCreate(d,{...defaultDelivery,popup:false}).commit()).toBe(true);const observer=new CompoundAlertObserver(book.createWriter(d.id));closes.push(()=>observer.dispose());expect((await observer.prepare(time)).commit()).toBe(true);
 let allow!:(value:'granted')=>void,entered!:()=>void;const permission=new Promise<'granted'>(resolve=>{allow=resolve;}),requested=new Promise<void>(resolve=>{entered=resolve;}),order:string[]=[],show=vi.fn();void permission.then(()=>{order.push('permission-settled');});
 const delivery=new CompoundDeliveryRuntime(book,()=>({soundPlayer:{play:async()=>{}},desktopPort:{permission:()=> 'default',request:()=>{entered();return permission;},show},popup:()=>{},notice:()=>{}}));closes.push(()=>delivery.dispose());const unsubscribe=book.subscribe(event=>{if(event.kind==='adopt')order.push('adopt-notice');});closes.push(unsubscribe);
 p.setNow(time+1);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+1,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();expect((await native.accept(dataset)).accepted).toBe(true);refs.currentInput.current={dataset,bars:dataset.bars,replay:null};expect((await observer.prepare(time+1)).commit()).toBe(true);expect(book.entry(d.id)!.journal!.item.values).toEqual([150,140]);await requested;
 const json=encodeCompoundPrivateDocument(book.documentSnapshots(),time+1),oldGeneration=book.entry(d.id)!.generation;allow('granted');const action=book.prepareAdopt(json,time+2);expect(action.commit()).toBe(true);observer.dispose();order.push('adopt-commit');expect(book.entry(d.id)!.generation).not.toBe(oldGeneration);expect(order).toEqual(['adopt-commit']);await microtasks();expect(order).toEqual(['adopt-commit','permission-settled','adopt-notice']);expect(show).not.toHaveBeenCalled();expect(book.entry(d.id)!.journal!.item.values).toEqual([150,140]);
});
