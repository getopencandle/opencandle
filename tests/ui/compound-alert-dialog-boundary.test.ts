import {afterEach,expect,it,vi} from 'vitest';
import {all,invoke,mountControlledComponent,text,type ModelElement} from '../helpers/alert-dialog-harness';
import {CompoundAlertDialogBoundary,type CompoundAlertDialogBoundaryProps} from '../../src/ui/CompoundAlertDialogBoundary';
import {CompoundConditionEditor} from '../../src/ui/CompoundConditionEditor';
import {CompoundAlertBook} from '../../src/ui/compound-alert-book';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {DEFAULT_ALERT_MANAGER_FILTER,DEFAULT_ALERT_MANAGER_SORT} from '../../src/domain/alert-manager-view';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {selectAlpacaSyntheticStub,isAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

// Existing controlled React/ref/callback model. Expand only this packet's two
// stateless presentation children, never nested hook components/Modal. This is
// not browser key dispatch/focus, full App, native observation or GUI evidence.
const closes:Array<()=>unknown>=[];
afterEach(()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Synthetic manager cleanup failed.');});
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
it('starts Add condition with a genuine descriptive context and no inferred second source or value',async()=>{
 const f=await fixture();f.click('Add condition');expect(f.field('Added condition source').props.value).toBe('');expect(f.field('Added condition operator').props.value).toBe('');expect(f.field('Added condition value').props.value).toBe('');expect(f.book.entries()).toHaveLength(0);f.click('Cancel');expect(all(f.ui.settle(),node=>node.props['aria-label']==='Added condition source')).toHaveLength(0);expect(f.book.entries()).toHaveLength(0);expect(f.live.props.scalarDraft.value).toBe('407');
});
it('adds a complete second condition then saves exactly one canonical book declaration',async()=>{
 const f=await fixture();f.add();const editor=f.ui.find(node=>node.type===CompoundConditionEditor),conditions=editor.props.conditions as readonly {kind:string;value:string}[];expect(conditions).toHaveLength(2);expect(conditions[0]).toMatchObject({kind:'greater',value:'407'});expect(conditions[1]).toMatchObject({kind:'less',value:'3'});expect(f.book.entries()).toHaveLength(0);
 f.submit();expect(f.book.entries()).toHaveLength(1);const definition=f.book.entries()[0].state.definition;expect(definition.predicates.map(row=>row.operator)).toEqual([{kind:'greater',value:407},{kind:'less',value:3}]);expect(definition.createdAt).toBe(f.clock.now);expect(f.live.props.onSaved).toHaveBeenCalledTimes(1);
});
it('keeps edited text through fresh controller wrappers and runtime clock advances then uses the fresh entry on Save',async()=>{
 const f=await fixture(),original=await f.existing();f.click('Edit all-conditions alert');f.fill('All-conditions alert name','Edited while live');
 expect(f.book.prepareLifecycle(original.id,f.book.entry(original.id)!,'advance',f.clock.now).commit()).toBe(true);f.clock.now++;f.live.props={...f.live.props,controller:{book:f.book,readActionTime:()=>f.clock.now},sourceChoices:[...f.live.props.sourceChoices]};f.ui.settle();expect(f.field('All-conditions alert name').props.value).toBe('Edited while live');
 f.submit();const next=f.book.entry(original.id)!;expect(next.state.definition.name).toBe('Edited while live');expect(next.state.definition.createdAt).toBe(original.state.definition.createdAt);expect(next.state.armedAt).toBe(f.clock.now);expect(next.state.revision).toBe(2);
});
it('keeps condition replacement controlled by exact draft-array identity without partial row publication',async()=>{
 const f=await fixture();f.add();const node=f.ui.find(value=>value.type===CompoundConditionEditor),base=node.props.conditions as readonly {id:string;sourceId:string;kind:'greater';value:string;lower:string;upper:string}[],next=Object.freeze(base.map((row,index)=>Object.freeze({...row,value:index?'8':row.value}))),change=node.props.onChange as(next:unknown,expected:unknown)=>boolean;
 expect(change(next,[])).toBe(false);expect(change(next,base)).toBe(true);expect(change(next,base)).toBe(false);f.ui.settle();expect(f.ui.find(value=>value.type===CompoundConditionEditor).props.conditions).toBe(next);expect(f.book.entries()).toHaveLength(0);
});
it('does not lose the draft or publish when a real storage hold blocks the financial Save',async()=>{
 const f=await fixture();f.add();f.fill('All-conditions alert name','Keep this draft');f.refs.storageMutation.current=true;f.submit();expect(f.book.entries()).toHaveLength(0);expect(f.field('All-conditions alert name').props.value).toBe('Keep this draft');expect(text(f.ui.settle())).toContain('draft is retained');f.refs.storageMutation.current=false;f.submit();expect(f.book.entries()[0].state.definition.name).toBe('Keep this draft');
});
it('refuses a stale editor when its actual entry generation changes during the action clock callback',async()=>{
 const f=await fixture(),original=await f.existing();f.click('Edit all-conditions alert');f.fill('All-conditions alert name','Must not overwrite');f.live.props={...f.live.props,controller:{book:f.book,readActionTime:()=>{const current=f.book.entry(original.id)!;expect(f.book.prepareLifecycle(original.id,current,'pause',f.clock.now).commit()).toBe(true);return f.clock.now;}}};f.ui.settle();f.submit();expect(f.book.entry(original.id)!.state.definition.name).toBe('Original');expect(f.book.entry(original.id)!.state.status).toBe('paused');
});
it('keeps compound rows and actions in the same manager filters without a scalar-alert adapter',async()=>{
 const f=await fixture(),entry=await f.existing();expect(text(f.ui.settle())).toContain('Original');f.live.props={...f.live.props,filter:{...f.live.props.filter,query:'absent'}};f.ui.settle();expect(text(f.ui.settle())).not.toContain('Original message');f.live.props={...f.live.props,filter:{...f.live.props.filter,query:''}};f.ui.settle();f.click('Pause');expect(f.book.entry(entry.id)!.state.status).toBe('paused');f.click('Resume');expect(f.book.entry(entry.id)!.state.status).toBe('active');f.click('Delete all-conditions alert');f.click('Delete alert');expect(f.book.entry(entry.id)).toBeNull();
});
it('contains incomplete channel and expiration input in the dialog rather than crashing or inventing defaults',async()=>{
 const f=await fixture();f.click('Add condition');f.fill('Added condition source','price:close');f.fill('Added condition operator','inside');f.fill('Added condition lower bound','7');f.fill('Added condition upper bound','3');f.click('Add');expect(f.book.entries()).toHaveLength(0);expect(text(f.ui.settle())).toContain('lower bound');f.fill('Added condition upper bound','7');f.click('Add');
 invoke(f.field('All-conditions expiration enabled').props.onChange,{target:{checked:true}});expect(()=>f.ui.settle()).not.toThrow();f.submit();expect(f.book.entries()).toHaveLength(0);expect(f.field('All-conditions alert name').props.value).toBe('SYNTHETIC new alert');
});
