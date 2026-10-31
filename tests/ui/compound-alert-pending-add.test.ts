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
async function fixture(resolution='15m'){
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(previous));const now=unix('2024-03-11T19:59:50Z'),producer=await publishedSource({now,resolution});closes.push(()=>producer.dispose());const dataset=producer.regular();
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

// Controlled actual Boundary callbacks and timer ownership over a real synthetic
// provider/session constructor and canonical Book. No native values/admission,
// browser focus, actual App scheduling or GUI availability is claimed here.
function added(f:Awaited<ReturnType<typeof fixture>>){return all(f.ui.settle(),node=>node.props['aria-label']==='Added condition source');}
function timers(f:Awaited<ReturnType<typeof fixture>>,ms:number){vi.advanceTimersByTime(ms);f.ui.settle();}
it('waits through a genuine Root storage hold and opens once only after strict current context returns',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;expect(f.book.describeCurrentSource()).toBeNull();f.click('Add condition');expect(added(f)).toHaveLength(0);expect(text(f.ui.settle())).toContain('Preparing the current live');expect(vi.getTimerCount()).toBe(1);
 timers(f,300);expect(added(f)).toHaveLength(0);f.refs.storageMutation.current=false;timers(f,50);expect(added(f)).toHaveLength(1);expect(f.field('Added condition source').props.value).toBe('');expect(f.field('Added condition value').props.value).toBe('');expect(f.book.entries()).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);
});
it('waits through a real provider revision gap while Root retains its old genuine session snapshot',async()=>{
 const f=await fixture();vi.useFakeTimers();const time=f.clock.now+1;f.producer.setNow(time);f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();
 expect(f.book.describeCurrentSource()).toBeNull();f.click('Add condition');expect(added(f)).toHaveLength(0);timers(f,100);const current=f.producer.regular();f.refs.currentInput.current={dataset:current,bars:current.bars,replay:null};expect(f.book.describeCurrentSource()).not.toBeNull();f.ui.settle();timers(f,50);expect(added(f)).toHaveLength(1);expect(f.book.entries()).toHaveLength(0);
});
it('coalesces repeated Add clicks into one timer and one unchanged two-second deadline',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.workspaceTransaction.current=true;f.click('Add condition');timers(f,1000);for(let i=0;i<12;i++)f.click('Add condition');expect(vi.getTimerCount()).toBe(1);timers(f,999);expect(text(f.ui.settle())).toContain('Preparing the current live');timers(f,1);expect(vi.getTimerCount()).toBe(0);expect(text(f.ui.settle())).toContain('try Add condition again');expect(added(f)).toHaveLength(0);
 f.refs.workspaceTransaction.current=false;timers(f,200);expect(added(f)).toHaveLength(0);f.click('Add condition');expect(added(f)).toHaveLength(1);
});
it('cancels pending preparation explicitly without late opening or book publication',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');f.click('Cancel preparing condition');expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(added(f)).toHaveLength(0);expect(f.book.entries()).toHaveLength(0);
});
it.each(['tab','allowCreate','request','authority','selectedSource','scalarDraft'] as const)('retires pending Add when its exact %s owner changes',async(kind)=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');
 const p=f.live.props;f.live.props=kind==='tab'?{...p,tab:'Alerts'}:kind==='allowCreate'?{...p,allowCreate:false}:kind==='request'?{...p,requestKey:{}}:kind==='authority'?{...p,managerAuthority:{token:{},assertCurrent:vi.fn()}}:kind==='selectedSource'?{...p,selectedSourceId:'another-source'}:{...p,scalarDraft:{...p.scalarDraft,value:'408'}};
 f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(added(f)).toHaveLength(0);expect(f.book.entries()).toHaveLength(0);
});
it('clears the owned timer on actual controlled unmount and never writes after disposal',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');f.ui.dispose();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;vi.advanceTimersByTime(3000);expect(f.book.entries()).toHaveLength(0);
});
it('rechecks the intent after a forwarding source description reenters a different request owner',async()=>{
 const f=await fixture();vi.useFakeTimers();const actual=f.book.describeCurrentSource.bind(f.book);vi.spyOn(f.book,'describeCurrentSource').mockImplementation(()=>{const context=actual();f.live.props={...f.live.props,requestKey:{}};f.ui.settle();return context;});f.click('Add condition');expect(added(f)).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);expect(f.book.entries()).toHaveLength(0);
});
it('does not retry a permanent seed failure after genuine context succeeded',async()=>{
 const f=await fixture();vi.useFakeTimers();const describe=vi.spyOn(f.book,'describeCurrentSource');f.live.props={...f.live.props,selectedSourceId:'not-in-the-real-catalog'};f.ui.settle();f.click('Add condition');expect(describe).toHaveBeenCalledTimes(1);expect(text(f.ui.settle())).toContain('Choose a supported raw price');expect(vi.getTimerCount()).toBe(0);timers(f,3000);expect(describe).toHaveBeenCalledTimes(1);expect(added(f)).toHaveLength(0);
});
it('leaves a genuine unsupported interval refused at the deadline without any substitute context',async()=>{
 const f=await fixture('30m');vi.useFakeTimers();expect(f.book.describeCurrentSource()).toBeNull();f.click('Add condition');timers(f,2000);expect(added(f)).toHaveLength(0);expect(text(f.ui.settle())).toContain('try Add condition again');expect(vi.getTimerCount()).toBe(0);expect(f.book.entries()).toHaveLength(0);
});
it('keeps saved-entry Edit immediate during a Root hold without describing or granting a new source',async()=>{
 const f=await fixture();await f.existing();vi.useFakeTimers();f.refs.storageMutation.current=true;const describe=vi.spyOn(f.book,'describeCurrentSource');f.click('Edit all-conditions alert');expect(f.field('All-conditions alert name').props.value).toBe('Original');expect(describe).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('does not extend the deadline when the actual description callback advances time before returning genuine context',async()=>{
 const f=await fixture();vi.useFakeTimers();const actual=f.book.describeCurrentSource.bind(f.book);vi.spyOn(f.book,'describeCurrentSource').mockImplementation(()=>{const context=actual();vi.setSystemTime(Date.now()+2001);return context;});f.click('Add condition');expect(added(f)).toHaveLength(0);expect(text(f.ui.settle())).toContain('try Add condition again');expect(vi.getTimerCount()).toBe(0);
});
it('hands off a same-owner source-description rerender to the latest runner without stranding the intent',async()=>{
 const f=await fixture();vi.useFakeTimers();const actual=f.book.describeCurrentSource.bind(f.book);let first=true;vi.spyOn(f.book,'describeCurrentSource').mockImplementation(()=>{const context=actual();if(first){first=false;f.ui.settle();}return context;});f.click('Add condition');expect(added(f)).toHaveLength(0);expect(vi.getTimerCount()).toBe(1);timers(f,50);expect(added(f)).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
it('cancels an intent on actual book replacement without opening on either collection',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');const replacement=new CompoundAlertBook({...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}}});closes.push(()=>replacement.close());f.live.props={...f.live.props,controller:{book:replacement,readActionTime:()=>f.clock.now}};f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(added(f)).toHaveLength(0);expect(f.book.entries()).toHaveLength(0);expect(replacement.entries()).toHaveLength(0);
});
it('retires a pending intent on genuine data-only adoption even when the book identity stays unchanged',async()=>{
 const f=await fixture(),json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),f.clock.now);vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');const action=f.book.prepareAdopt(json,f.clock.now);expect(action.commit()).toBe(true);await flushMtf();f.ui.settle();expect(vi.getTimerCount()).toBe(0);f.refs.storageMutation.current=false;timers(f,3000);expect(added(f)).toHaveLength(0);expect(f.book.entries()).toHaveLength(0);
});
it('preserves pending intent across harmless controller wrappers and refreshed catalog arrays',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');f.live.props={...f.live.props,controller:{book:f.book,readActionTime:()=>f.clock.now},sourceChoices:[...f.live.props.sourceChoices]};f.ui.settle();expect(vi.getTimerCount()).toBe(1);f.refs.storageMutation.current=false;timers(f,50);expect(added(f)).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
it('bounds source-description work to forty calls even when the wall clock moves backward',async()=>{
 const f=await fixture();vi.useFakeTimers();f.refs.storageMutation.current=true;const describe=vi.spyOn(f.book,'describeCurrentSource');f.click('Add condition');vi.setSystemTime(Date.now()-100000);timers(f,2000);expect(describe).toHaveBeenCalledTimes(40);expect(vi.getTimerCount()).toBe(0);expect(added(f)).toHaveLength(0);expect(text(f.ui.settle())).toContain('try Add condition again');
});
it('does not let an old book adoption subscriber cancel the replacement book intent before passive cleanup',async()=>{
 const f=await fixture(),json=encodeCompoundPrivateDocument(f.book.documentSnapshots(),f.clock.now);vi.useFakeTimers();f.refs.storageMutation.current=true;f.click('Add condition');const replacement=new CompoundAlertBook({...f.refs,financial:{current:{paper:{},paperBook:null,alerts:[]}}});closes.push(()=>replacement.close());
 f.live.props={...f.live.props,controller:{book:replacement,readActionTime:()=>f.clock.now}};f.ui.render();invoke(f.button('Cancel preparing condition').props.onClick);invoke(f.button('Add condition').props.onClick);expect(vi.getTimerCount()).toBe(1);
 expect(f.book.prepareAdopt(json,f.clock.now).commit()).toBe(true);await flushMtf();f.ui.settle();expect(vi.getTimerCount()).toBe(1);f.refs.storageMutation.current=false;timers(f,50);expect(added(f)).toHaveLength(1);expect(replacement.entries()).toHaveLength(0);
});
