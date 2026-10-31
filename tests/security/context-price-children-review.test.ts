import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {PaperPanel,type PaperPanelProps} from '../../src/ui/PaperPanel';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createContextPriceAuthority} from '../../src/ui/context-price-ownership';
import {createPaperAccount,processPaperQuote} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';

// Actual child handlers with controlled effect scheduling, never GUI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>,cleanups:[] as Array<(()=>void)|undefined>,writes:0}));
vi.mock('react',async()=>({...await vi.importActual<any>('react'),useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(run:()=>void|(()=>void),deps?:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.effects.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()??undefined;});}}}));
const dataset=fixtureDataset('GME',3),instrument=dataset.instrument,now=1791979200;
const quote={instrumentId:instrument.id,bid:99.98,ask:100.02,eventTime:now,receivedAt:now,availableAt:now,sequence:1,fixture:true,session:'unknown' as const};
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function driver<P>(Component:(props:P)=>any,props:P){const render=()=>{hooks.cursor=0;return Component(props);},element=(predicate:(node:any)=>boolean)=>{const found=find(render(),predicate);if(!found)throw Error('Missing reviewer control');return found;},button=(name:string)=>element(node=>node.type==='button'&&text(node)===name),field=(name:string)=>element(node=>node.props['aria-label']===name),flush=()=>{for(let i=0;i<12;i++){render();if(!hooks.effects.length)return;hooks.effects.splice(0).forEach(run=>run());}throw Error('Effect loop');};return{props,render,element,button,field,flush,submit:()=>element(node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()}),change:(name:string,value:string)=>field(name).props.onChange({target:{value}})};}
function paper(){const account=processPaperQuote(createPaperAccount(),quote,now,'ordinary',instrument).account,authority=createContextPriceAuthority(),request=authority.mint({id:'SYNTHETIC-paper-click',action:'paper-ticket',price:99.5,instrument,chartId:'chart',sourceKey:'SYNTHETIC-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:{id:account.id,mode:account.mode,runId:account.runId}},()=>{});const props:PaperPanelProps={account,instrument,quote,quoteSource:{key:request.sourceKey,state:'ready'},now,contextRequest:request,assertContextCurrent:(value,phase)=>authority.assert(value,phase),onContextComplete:vi.fn(value=>{authority.retire(value);}),onAccountChange:vi.fn((next,base)=>{if(base!==props.account)return false;props.account=next;return true;})};const ui=driver(PaperPanel,props);ui.flush();return{...ui,authority,request};}
function alert(){const authority=createContextPriceAuthority(),request=authority.mint({id:'SYNTHETIC-alert-click',action:'price-alert',price:100.005,instrument,chartId:'chart',sourceKey:'SYNTHETIC-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null},()=>{}),context=alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'chart',sessionId:'review-session',mode:'ordinary',startedAt:now}),dataset);const props:AlertDialogProps={open:true,onClose:vi.fn(),alerts:[],onAlertsChange:vi.fn(),instrument,now,context,externallyProcessed:true,validateCurrentSource:vi.fn(),contextRequest:request,assertContextCurrent:(value,phase)=>authority.assert(value,phase),onContextComplete:vi.fn(value=>{authority.retire(value);})};const ui=driver(AlertDialog,props);ui.flush();return{...ui,authority,request};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];hooks.writes=0;vi.stubGlobal('document',{activeElement:null});});afterEach(()=>{hooks.cleanups.forEach(run=>run?.());vi.unstubAllGlobals();});

it.each(['Cancel','Escape'])('inner %s retires captured confirm while keeping the original clicked ticket editable',kind=>{
 const ui=paper();ui.submit();const confirm=ui.button('Confirm').props.onClick;
 if(kind==='Cancel')ui.button('Cancel').props.onClick();else ui.element(node=>node.props.role==='alertdialog').props.onKeyDown({key:'Escape',nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn()});
 const writes=hooks.writes;confirm();expect(hooks.writes).toBe(writes);expect(ui.props.onAccountChange).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();expect(ui.field('Limit price').props.value).toBe('99.50'); // The clicked price seeds at the instrument's display precision (context-price-request contextPriceLabel, tests/domain/context-price-request.test.ts), so 99.5 reads 99.50
 ui.submit();ui.button('Confirm').props.onClick();expect(ui.props.onAccountChange).toHaveBeenCalledOnce();expect(ui.props.onContextComplete).toHaveBeenCalledExactlyOnceWith(ui.request,'saved');
});

it.each(['Cancel','Escape'])('a retained old %s cannot cancel a newly created confirmation',kind=>{
 const ui=paper();ui.submit();const oldCancel=ui.button('Cancel').props.onClick,oldEscape=ui.element(node=>node.props.role==='alertdialog').props.onKeyDown;
 oldCancel();ui.submit();const currentConfirm=ui.button('Confirm').props.onClick,writes=hooks.writes;
 if(kind==='Cancel')oldCancel();else oldEscape({key:'Escape',nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn()});
 expect(hooks.writes).toBe(writes);currentConfirm();expect(ui.props.onAccountChange).toHaveBeenCalledOnce();
});

it('changed draft revokes a preview even if text is later changed back to its original value',()=>{
 const ui=paper();ui.submit();const confirm=ui.button('Confirm').props.onClick;ui.change('Order quantity','2');ui.change('Order quantity','1');const writes=hooks.writes;confirm();expect(ui.props.onAccountChange).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);ui.submit();ui.button('Confirm').props.onClick();expect(ui.props.account.orders[0].quantity).toBe(1);
});

it('an old alert submit closure cannot publish a superseded threshold draft',()=>{
 const ui=alert(),oldSubmit=ui.element(node=>node.type==='form').props.onSubmit;ui.change('Alert level','101.25');ui.render();oldSubmit({preventDefault:vi.fn()});
 const calls=vi.mocked(ui.props.onAlertsChange).mock.calls;expect(calls.length<=1).toBe(true);if(calls.length)expect(calls[0][0][0].definition.condition.value).toBe(101.25);
});

it('failed seed is not replaced by an ordinary alert source or a default-price save',()=>{
 const ui=alert();ui.authority.retire(ui.request);const original=ui.field('Alert level').props.value;ui.submit();expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();expect(ui.field('Alert level').props.value).toBe(original);
});

it('reentrant parent cancellation during rejected alert save causes no late writes or completion',()=>{
 const ui=alert(),cancel=ui.button('Cancel').props.onClick,retainedSubmit=ui.element(node=>node.type==='form').props.onSubmit,original=ui.props.alerts;let writesAfterCancel:number|null=null;
 // Cancel legitimately clears menu/confirmation state. Saving must do nothing afterward.
 vi.mocked(ui.props.onAlertsChange).mockImplementation(()=>{cancel();writesAfterCancel=hooks.writes;return false;});ui.submit();
 expect(writesAfterCancel).not.toBeNull();expect(hooks.writes).toBe(writesAfterCancel);expect(ui.props.onAlertsChange).toHaveBeenCalledOnce();expect(ui.props.alerts).toBe(original);expect(ui.props.alerts).toEqual([]);expect(ui.props.onContextComplete).toHaveBeenCalledExactlyOnceWith(ui.request,'cancelled');expect(ui.props.onClose).not.toHaveBeenCalled();
 retainedSubmit({preventDefault:vi.fn()});expect(hooks.writes).toBe(writesAfterCancel);expect(ui.props.onAlertsChange).toHaveBeenCalledOnce();expect(ui.props.alerts).toBe(original);expect(ui.props.onContextComplete).toHaveBeenCalledExactlyOnceWith(ui.request,'cancelled');expect(ui.props.onClose).not.toHaveBeenCalled();
});
