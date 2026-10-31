import {afterEach,expect,it,vi} from 'vitest';
import {all,invoke,mountControlledComponent,text,type ModelElement} from '../helpers/alert-dialog-harness';
import {CompoundAlertDialogBoundary,type CompoundAlertDialogBoundaryProps} from '../../src/ui/CompoundAlertDialogBoundary';
import {CompoundConditionEditor} from '../../src/ui/CompoundConditionEditor';
import {encodeCompoundPrivateDocument} from '../../src/ui/compound-alert-document';
import {CompoundAlertBook} from '../../src/ui/compound-alert-book';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {DEFAULT_ALERT_MANAGER_FILTER,DEFAULT_ALERT_MANAGER_SORT} from '../../src/domain/alert-manager-view';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {selectAlpacaSyntheticStub,isAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

// Existing controlled React/ref/callback model. Expand only this packet's two
// stateless presentation children, never nested hook components/Modal. This is
// not browser key dispatch/focus, full App, native observation or GUI evidence.
const closes:Array<()=>unknown>=[];
afterEach(()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{close();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.useRealTimers();if(errors.length)throw new AggregateError(errors,'Synthetic manager cleanup failed.');});
function expand(value:unknown):unknown{
 if(Array.isArray(value))return value.map(expand);if(!value||typeof value!=='object'||!('type'in value)||!('props'in value))return value;
 const node=value as ModelElement;
 if(typeof node.type==='function'&&['FirstAddedCondition','CompoundManagerRow'].includes(node.type.name))return expand(Reflect.apply(node.type,undefined,[node.props]));
 return{...node,props:{...node.props,children:expand(node.props.children)}};
}
async function fixture(){
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(previous));const now=unix('2024-03-11T19:59:50Z'),producer=await publishedSource({now,resolution:'15m'});closes.push(()=>producer.dispose());const dataset=producer.regular();
 const noNative=()=>{throw Error('This declaration-editor test must not acquire native/source observation permission.');};
 const refs={financial:{current:{paper:{},paperBook:null,alerts:[]}},currentInput:{current:{dataset,bars:dataset.bars,replay:null}},activeController:{current:{getStyle:noNative,isInputExact:noNative,isInputCurrent:noNative}},financialGeneration:{current:0},gridGeneration:{current:0},storageMutation:{current:false},workspaceTransaction:{current:false},currentReplay:{current:null},startup:{current:{phase:'ready'}},mainWindow:true};
 const book=new CompoundAlertBook(refs),clock={now};
 const props:CompoundAlertDialogBoundaryProps={controller:{book,readActionTime:()=>clock.now},tab:'Create',scalarDraft:{name:'SYNTHETIC new alert',message:'SYNTHETIC message',kind:'greater',value:'407',lower:'3',upper:'7',amount:'1',bars:'1',percent:false,frequency:'every-time',expirationEnabled:false,expiresAt:''},sourceChoices:[{id:'actual-price-choice',label:'Close',source:{kind:'price',field:'close',transformId:'standard'}}],selectedSourceId:'actual-price-choice',managerAuthority:{token:{},assertCurrent:vi.fn()},requestKey:{},allowCreate:true,filter:{...DEFAULT_ALERT_MANAGER_FILTER},sort:{...DEFAULT_ALERT_MANAGER_SORT},onSaved:vi.fn()};
 const live={props},ui=mountControlledComponent(()=>expand(CompoundAlertDialogBoundary(live.props)));closes.push(()=>ui.dispose());ui.settle();
 const button=(label:string)=>ui.find(node=>node.type==='button'&&text(node)===label),click=(label:string)=>{invoke(button(label).props.onClick);ui.settle();},field=(label:string)=>ui.find(node=>node.props['aria-label']===label),fill=(label:string,value:string)=>{invoke(field(label).props.onChange,{target:{value}});ui.settle();};
 const add=()=>{click('Add condition');fill('Added condition source','price:close');fill('Added condition operator','less');fill('Added condition value','3');click('Add');};
 const submit=()=>{invoke(ui.find(node=>node.type==='form'&&node.props.className==='lv-compound-editor-fields').props.onSubmit,{preventDefault:vi.fn(),stopPropagation:vi.fn()});ui.settle();};
 const existing=async()=>{const context=book.describeCurrentSource()!;const d:CompoundDefinition={kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'SYNTHETIC original',name:'Original',message:'Original message',context,predicates:[{id:'first',source:{kind:'price',field:'close'},operator:{kind:'greater',value:10}},{id:'second',source:{kind:'price',field:'open'},operator:{kind:'less',value:20}}],frequency:'every-time',createdAt:now-100,expiresAt:null};expect(book.prepareCreate(d,{schemaVersion:1,popup:true,desktop:false,sound:null}).commit()).toBe(true);await flushMtf();live.props={...live.props,tab:'Alerts'};ui.settle();return book.entry(d.id)!;};
 return{book,refs,producer,dataset,clock,live,ui,button,click,field,fill,add,submit,existing};
}

// Genuine provider/session+Book and actual Boundary callbacks under the unchanged
// controlled hook model. No browser focus/native prices/full App scheduling claim.
type Fixture=Awaited<ReturnType<typeof fixture>>;
function timers(f:Fixture,ms:number){vi.advanceTimersByTime(ms);f.ui.settle();}
function formCount(f:Fixture){return all(f.ui.settle(),node=>node.type==='form'&&node.props.className==='lv-compound-editor-fields').length;}
function track(f:Fixture){const clock=vi.fn(()=>f.clock.now),prepare=vi.spyOn(f.book,'prepareCreate');f.live.props={...f.live.props,controller:{book:f.book,readActionTime:clock}};f.ui.settle();return{clock,prepare};}
async function gap(f:Fixture){const time=f.clock.now+1;f.producer.setNow(time);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();expect(f.book.describeCurrentSource()).toBeNull();}
function acceptLatest(f:Fixture){const dataset=f.producer.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};expect(f.book.describeCurrentSource()).not.toBeNull();}
it('waits through an actual Root storage hold then creates one canonical declaration with one fresh clock and action',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();expect(text(f.ui.settle())).toContain('Preparing the current live source before saving');expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(f.book.entries()).toHaveLength(0);expect(vi.getTimerCount()).toBe(1);
 timers(f,200);f.refs.storageMutation.current=false;timers(f,50);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()[0].state.definition.predicates.map(row=>row.operator)).toEqual([{kind:'greater',value:407},{kind:'less',value:3}]);expect(f.live.props.onSaved).toHaveBeenCalledTimes(1);expect(formCount(f)).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('recovers a genuine provider revision gap only after Root accepts the actual new session snapshot',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);await gap(f);f.submit();timers(f,100);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();acceptLatest(f);timers(f,50);expect(f.book.entries()).toHaveLength(1);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('waits before editing an existing entry and preserves original creation time while using the final fresh edit clock',async()=>{
 const f=await fixture(),original=await f.existing();f.click('Edit all-conditions alert');f.fill('All-conditions alert name','Edited after source ready');vi.useFakeTimers();const clock=vi.fn(()=>f.clock.now),prepare=vi.spyOn(f.book,'prepareEdit');f.live.props={...f.live.props,controller:{book:f.book,readActionTime:clock}};f.ui.settle();f.refs.workspaceTransaction.current=true;f.submit();expect(clock).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();f.clock.now+=3;f.refs.workspaceTransaction.current=false;timers(f,50);const next=f.book.entry(original.id)!;expect(next.state.definition.createdAt).toBe(original.state.definition.createdAt);expect(next.state.definition.name).toBe('Edited after source ready');expect(next.state.armedAt).toBe(f.clock.now);expect(next.state.revision).toBe(2);expect(clock).toHaveBeenCalledTimes(1);expect(prepare).toHaveBeenCalledTimes(1);
});
it('coalesces repeated Save calls and bounds null probing under backward wall-clock movement without invoking the action clock',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),describe=vi.spyOn(f.book,'describeCurrentSource');f.refs.storageMutation.current=true;f.submit();timers(f,500);for(let i=0;i<8;i++)f.submit();expect(vi.getTimerCount()).toBe(1);vi.setSystemTime(Date.now()-100000);timers(f,2000);expect(describe).toHaveBeenCalledTimes(39);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);expect(formCount(f)).toBe(1);expect(text(f.ui.settle())).toContain('try saving again');f.refs.storageMutation.current=false;timers(f,100);expect(f.book.entries()).toHaveLength(0);f.submit();expect(f.book.entries()).toHaveLength(1);expect(t.prepare).toHaveBeenCalledTimes(1);
});
it('reserves the fortieth description for the original post-clock check when the thirty-ninth probe becomes genuine',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),describe=vi.spyOn(f.book,'describeCurrentSource');f.refs.storageMutation.current=true;f.submit();timers(f,1850);f.refs.storageMutation.current=false;timers(f,50);expect(describe).toHaveBeenCalledTimes(40);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
it('cancels pending Save explicitly while preserving the editable draft and requiring a new user Save',async()=>{
 const f=await fixture();f.add();f.fill('All-conditions alert name','Keep draft');vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();f.click('Cancel pending save');expect(vi.getTimerCount()).toBe(0);expect(f.field('All-conditions alert name').props.value).toBe('Keep draft');f.refs.storageMutation.current=false;timers(f,3000);expect(t.prepare).not.toHaveBeenCalled();f.submit();expect(f.book.entries()[0].state.definition.name).toBe('Keep draft');
});
it.each(['name','message','conditions','delivery','expiry','frequency'] as const)('retires the full pending Session when its %s draft changes',async(kind)=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();
 if(kind==='name')f.fill('All-conditions alert name','Changed');else if(kind==='message')f.fill('All-conditions alert message','Changed message');else if(kind==='delivery'){invoke(f.field('All-conditions popup').props.onChange,{target:{checked:false}});f.ui.settle();}else if(kind==='expiry'){invoke(f.field('All-conditions expiration enabled').props.onChange,{target:{checked:true}});f.ui.settle();}else if(kind==='frequency')f.fill('All-conditions alert frequency','only-once');else{const editor=f.ui.find(node=>node.type===CompoundConditionEditor),rows=editor.props.conditions as readonly {value:string}[],next=Object.freeze(rows.map((row,index)=>Object.freeze({...row,value:index?'8':row.value})));expect((editor.props.onChange as (next:unknown,expected:unknown)=>boolean)(next,rows)).toBe(true);f.ui.settle();}
 expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(f.book.entries()).toHaveLength(0);
});
it.each(['tab','allowCreate','selectedSource','request','authority','scalarDraft'] as const)('retires pending Save when the captured %s owner changes',async(kind)=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();const p=f.live.props;f.live.props=kind==='tab'?{...p,tab:'Alerts'}:kind==='allowCreate'?{...p,allowCreate:false}:kind==='selectedSource'?{...p,selectedSourceId:'other'}:kind==='request'?{...p,requestKey:{}}:kind==='authority'?{...p,managerAuthority:{token:{},assertCurrent:vi.fn()}}:{...p,scalarDraft:{...p.scalarDraft,value:'408'}};f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();
});
it('refuses a genuine mismatched interval immediately without an action clock or automatic retry',async()=>{
 const f=await fixture();f.add();const other=await publishedSource({now:f.clock.now,resolution:'5m'});closes.push(()=>other.dispose());const dataset=other.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};expect(f.book.describeCurrentSource()?.interval).toBe('5m');vi.useFakeTimers();const t=track(f);f.submit();expect(text(f.ui.settle())).toContain('Select the matching genuine live regular-session source');expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);timers(f,3000);expect(f.book.entries()).toHaveLength(0);
});
it('keeps the original post-clock strict source refusal and never retries a clock-induced provider revision change',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);t.clock.mockImplementation(()=>{const time=f.clock.now+1;f.producer.setNow(time);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:150,high:150,low:150,size:1}],receivedAt:''});return f.clock.now;});f.submit();expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).not.toHaveBeenCalled();expect(text(f.ui.settle())).toContain('draft is retained');expect(vi.getTimerCount()).toBe(0);await flushMtf();acceptLatest(f);timers(f,3000);expect(f.book.entries()).toHaveLength(0);expect(t.clock).toHaveBeenCalledTimes(1);
});
it('rejects full Session replacement inside the fresh action clock before any financial preparation',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);t.clock.mockImplementation(()=>{f.fill('All-conditions alert name','Newer user text');return f.clock.now;});f.submit();expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).not.toHaveBeenCalled();expect(f.field('All-conditions alert name').props.value).toBe('Newer user text');expect(vi.getTimerCount()).toBe(0);expect(f.book.entries()).toHaveLength(0);
});
it('stops on a real financial CAS refusal after one prepared action and never auto-publishes after the hold clears',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const actual=f.book.prepareCreate.bind(f.book),t=track(f);t.prepare.mockImplementation((...args)=>{const action=actual(...args);f.refs.storageMutation.current=true;return action;});f.submit();expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()).toHaveLength(0);
});
it('does not retry a permanent form validation error after matching genuine context was acquired',async()=>{
 const f=await fixture();f.add();f.fill('All-conditions alert name','');vi.useFakeTimers();const t=track(f);f.submit();expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);expect(formCount(f)).toBe(1);timers(f,3000);expect(t.clock).toHaveBeenCalledTimes(1);
});
it('cancels an edited-entry intent when its actual canonical generation changes before source recovery',async()=>{
 const f=await fixture(),original=await f.existing();f.click('Edit all-conditions alert');vi.useFakeTimers();const clock=vi.fn(()=>f.clock.now),prepare=vi.spyOn(f.book,'prepareEdit');f.live.props={...f.live.props,controller:{book:f.book,readActionTime:clock}};f.ui.settle();await gap(f);f.submit();expect(f.book.prepareLifecycle(original.id,f.book.entry(original.id)!,'pause',f.clock.now).commit()).toBe(true);timers(f,50);expect(vi.getTimerCount()).toBe(0);expect(clock).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(f.book.entry(original.id)!.state.status).toBe('paused');
});
it('cancels pending Save on actual adoption and on unmount without later collection mutation',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),f.clock.now);f.refs.storageMutation.current=true;f.submit();expect(f.book.prepareAdopt(json,f.clock.now).commit()).toBe(true);await flushMtf();f.ui.settle();expect(vi.getTimerCount()).toBe(0);expect(formCount(f)).toBe(0);f.ui.dispose();f.refs.storageMutation.current=false;vi.advanceTimersByTime(3000);expect(t.prepare).not.toHaveBeenCalled();expect(f.book.entries()).toHaveLength(0);
});
it('does not let a stale Cancel button or nested-editor event cancel a newer Save intent',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();const oldCancel=f.button('Cancel pending save').props.onClick,oldCapture=f.ui.find(node=>node.type==='div'&&!!node.props.onInputCapture).props.onInputCapture;f.fill('All-conditions alert name','Newer draft');f.submit();invoke(oldCancel);invoke(oldCapture);expect(vi.getTimerCount()).toBe(1);f.refs.storageMutation.current=false;timers(f,50);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()[0].state.definition.name).toBe('Newer draft');
});
it('cancels Save when the current nested-editor boundary receives an unpublished local edit interaction',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();invoke(f.ui.find(node=>node.type==='div'&&!!node.props.onInputCapture).props.onInputCapture);f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(t.prepare).not.toHaveBeenCalled();expect(formCount(f)).toBe(1);
});
it('rejects deadline overrun inside the fresh action clock before the retained final source check or CAS',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),describe=vi.spyOn(f.book,'describeCurrentSource');t.clock.mockImplementation(()=>{vi.setSystemTime(Date.now()+2001);return f.clock.now;});f.submit();expect(t.clock).toHaveBeenCalledTimes(1);expect(describe).toHaveBeenCalledTimes(1);expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);expect(text(f.ui.settle())).toContain('try saving again');
});
it.each(['description','clock','prepare','publication'] as const)('does not reenter Save finalization through its actual forwarding %s callback',async(stage)=>{
 const f=await fixture();f.add();vi.useFakeTimers();const prepare=f.book.prepareCreate.bind(f.book),t=track(f),describe=f.book.describeCurrentSource.bind(f.book);let submit:unknown,created=0;const event={preventDefault:vi.fn(),stopPropagation:vi.fn()},again=()=>invoke(submit,event);closes.push(f.book.subscribe(event=>{if(event.kind==='create'){created++;if(stage==='publication')again();}}));
 const observed=vi.spyOn(f.book,'describeCurrentSource');if(stage==='description')observed.mockImplementation(()=>{again();return describe();});if(stage==='clock')t.clock.mockImplementation(()=>{again();return f.clock.now;});if(stage==='prepare')t.prepare.mockImplementation((...args)=>{again();return prepare(...args);});
 // Capture ONCE and invoke the same current handler without helper rendering;
 // refusal must come from the intent latch, not an unrelated stale-view guard.
 submit=f.ui.find(node=>node.type==='form'&&node.props.className==='lv-compound-editor-fields').props.onSubmit;invoke(submit,event);f.ui.settle();expect(observed).toHaveBeenCalledTimes(2);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(created).toBe(1);expect(f.book.entries()).toHaveLength(1);expect(f.live.props.onSaved).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('keeps a genuine unsupported interval unavailable until the deadline without any action clock or financial preparation',async()=>{
 const f=await fixture();f.add();const other=await publishedSource({now:f.clock.now,resolution:'30m'});closes.push(()=>other.dispose());const dataset=other.regular();f.refs.currentInput.current={dataset,bars:dataset.bars,replay:null};expect(f.book.describeCurrentSource()).toBeNull();vi.useFakeTimers();const t=track(f);f.submit();timers(f,2000);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);expect(formCount(f)).toBe(1);expect(text(f.ui.settle())).toContain('try saving again');
});
it('severs an actively pending Save on controlled unmount without later clock or financial work',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();expect(vi.getTimerCount()).toBe(1);f.ui.dispose();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;vi.advanceTimersByTime(3000);expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(f.book.entries()).toHaveLength(0);
});
it('expires a pending Save when the actual current book is replaced, preserving both canonical collections',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f);f.refs.storageMutation.current=true;f.submit();const replacement=new CompoundAlertBook({...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}}});closes.push(()=>replacement.close());f.live.props={...f.live.props,controller:{book:replacement,readActionTime:()=>f.clock.now}};f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(t.prepare).not.toHaveBeenCalled();expect(f.book.entries()).toHaveLength(0);expect(replacement.entries()).toHaveLength(0);
});
it('hands a harmless same-owner description rerender to the latest runner before any action clock or financial preparation',async()=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),actual=f.book.describeCurrentSource.bind(f.book);let first=true;vi.spyOn(f.book,'describeCurrentSource').mockImplementation(()=>{const context=actual();if(first){first=false;f.ui.settle();}return context;});f.submit();expect(t.clock).not.toHaveBeenCalled();expect(t.prepare).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(1);timers(f,50);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(f.book.entries()).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
it.each(['book','request','authority'] as const)('does not close or notify a replacement %s manager after a genuine canonical commit',async(kind)=>{
 const f=await fixture();f.add();vi.useFakeTimers();const t=track(f),priorSaved=f.live.props.onSaved,nextSaved=vi.fn(),replacement=kind==='book'?new CompoundAlertBook({...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}}}):null;if(replacement)closes.push(()=>replacement.close());let committedEvents=0;
 closes.push(f.book.subscribe(event=>{if(event.kind!=='create')return;committedEvents++;const p=f.live.props;f.live.props=kind==='book'?{...p,controller:{book:replacement!,readActionTime:()=>f.clock.now},onSaved:nextSaved}:kind==='request'?{...p,requestKey:{},onSaved:nextSaved}:{...p,managerAuthority:{token:{},assertCurrent:vi.fn()},onSaved:nextSaved};f.ui.render();}));
 const submit=f.ui.find(node=>node.type==='form'&&node.props.className==='lv-compound-editor-fields').props.onSubmit;invoke(submit,{preventDefault:vi.fn(),stopPropagation:vi.fn()});f.ui.settle();expect(committedEvents).toBe(1);expect(f.book.entries()).toHaveLength(1);expect(t.clock).toHaveBeenCalledTimes(1);expect(t.prepare).toHaveBeenCalledTimes(1);expect(priorSaved).not.toHaveBeenCalled();expect(nextSaved).not.toHaveBeenCalled();expect(text(f.ui.settle())).not.toContain('All-conditions alert saved.');expect(vi.getTimerCount()).toBe(0);if(replacement)expect(replacement.entries()).toHaveLength(0);
});
