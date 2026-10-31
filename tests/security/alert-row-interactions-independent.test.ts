import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,editLocalAlert,processAlertEvent,type LocalAlert} from '../../src/domain/alerts';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component/action/effect bodies with synthetic hooks and event targets.
// This is not browser focus, accessibility, pointer dispatch, or executable proof.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,pending:[] as (()=>void)[],cleanups:[] as (((()=>void)|undefined))[]}));
vi.mock('react',async()=>{
 const effect=(run:()=>void|(()=>void),deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||deps.length!==old.length||deps.some((value,index)=>!Object.is(value,old[index]))){hooks.cells[i]=deps;hooks.pending.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()||undefined;});}};
 const memo=(run:()=>unknown,deps:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.length!==old.deps.length||deps.some((value,index)=>!Object.is(value,old.deps[index])))hooks.cells[i]={deps,value:run()};return hooks.cells[i].value;};
 return{...await vi.importActual<any>('react'),useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:effect,useLayoutEffect:effect,useMemo:memo,useCallback:(fn:()=>unknown,deps:unknown[])=>memo(()=>fn,deps)};
});
const dataset=fixtureDataset('GME',5),now=1791979200;
function saved(id:string):LocalAlert{return createLocalAlert({id,name:'SYNTHETIC '+id,message:'SYNTHETIC local only',instrumentId:dataset.instrument.id,sourceId:'close',mode:'ordinary',runId:'ordinary',createdAt:now,expiresAt:null,condition:{kind:'greater',value:10},frequency:'every-time'});}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean):any[]{if(Array.isArray(tree))return tree.flatMap(child=>all(child,predicate));if(!tree?.props)return[];return[...predicate(tree)?[tree]:[],...all(tree.props.children,predicate)];}
const documentListeners=new Map<string,Set<(event:any)=>void>>();
class SyntheticElement {
 isConnected=true;offsetParent:object|null={};tagName='ARTICLE';className='';role='';editable=false;parentElement:SyntheticElement|null=null;onFocus:(()=>void)|undefined;
 closest(selector:string):SyntheticElement|null{const tag=this.tagName.toLowerCase();if(selector.split(',').some(part=>{const value=part.trim();return value===tag||value.startsWith(tag+'[')||value.includes('contenteditable')&&this.editable||value.includes('role=')&&this.role&&value.includes(this.role)||this.className&&value==='.'+this.className;}))return this;return this.parentElement?.closest(selector)??null;}
 contains(target:unknown):boolean{return target===this||(target instanceof SyntheticElement&&target.parentElement===this);}
 focus(){(document as any).activeElement=this;this.onFocus?.();}
 querySelectorAll(){return[];}
 querySelector(){return null;}
 getAttribute(name:string){return name==='role'?this.role:null;}
}
function event(target=new SyntheticElement(),extra:Record<string,unknown>={}){return{target,currentTarget:target,button:0,key:'',shiftKey:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra};}
function setup(initial:LocalAlert[]=[saved('A'),saved('B')]){
 let accepts=true,onPublish:(()=>void)|undefined;const request=vi.fn();let props:AlertDialogProps;
 const publish=vi.fn((next:LocalAlert[],base?:LocalAlert[])=>{if(publish.mock.calls.length>3)throw Error('SYNTHETIC bounded publication reentry');onPublish?.();if(!accepts||base!==props.alerts)return false;props.alerts=next;return true;});
 props={open:true,onClose:vi.fn(()=>{props.open=false;}),alerts:initial,onAlertsChange:publish,instrument:dataset.instrument,now,events:[],externallyProcessed:true,onRequestObservation:request};
 const render=()=>{hooks.cursor=0;return AlertDialog(props);};
 const find=(predicate:(node:any)=>boolean,tree=render())=>{const found=all(tree,predicate)[0];if(!found)throw Error('SYNTHETIC independent handler target absent');return found;};
 const row=(id:string)=>find(node=>node.type==='article'&&all(node,child=>child.type==='strong'&&text(child)==='SYNTHETIC '+id).length>0);
 const button=(label:string,tree=render())=>find(node=>node.type==='button'&&text(node)===label,tree);
 const rowButton=(id:string,label:string)=>button(label,row(id));
 const confirmation=()=>find(node=>node.props.role==='alertdialog'&&node.props['aria-label']==='Delete local alert');
 const confirmButton=(label:string)=>button(label,confirmation());
 const hasConfirmation=()=>all(render(),node=>node.props.role==='alertdialog'&&node.props['aria-label']==='Delete local alert').length===1;
 const settle=()=>{for(let i=0;i<10;i++){render();const pending=hooks.pending.splice(0);if(!pending.length)return;pending.forEach(run=>run());}throw Error('SYNTHETIC effects did not settle');};
 settle();return{props,publish,request,render,row,button,rowButton,confirmation,confirmButton,hasConfirmation,settle,words:()=>text(render()),reject(){accepts=false;},duringPublish(action:()=>void){onPublish=action;},find};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.pending=[];hooks.cleanups=[];documentListeners.clear();vi.stubGlobal('Element',SyntheticElement);vi.stubGlobal('HTMLElement',SyntheticElement);vi.stubGlobal('document',{activeElement:null,addEventListener(name:string,handler:(event:any)=>void){let values=documentListeners.get(name);if(!values){values=new Set();documentListeners.set(name,values);}values.add(handler);},removeEventListener(name:string,handler:(event:any)=>void){documentListeners.get(name)?.delete(handler);}});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup?.());vi.unstubAllGlobals();vi.restoreAllMocks();});

it('same-view Delete A to B cannot be cleared or published by retained A confirmation controls',()=>{
 const ui=setup();ui.rowButton('A','Delete').props.onClick();const cancelA=ui.confirmButton('Cancel').props.onClick,confirmA=ui.confirmButton('Confirm delete').props.onClick;
 ui.rowButton('B','Delete').props.onClick();cancelA();confirmA();
 expect(ui.hasConfirmation()).toBe(true);expect(ui.publish).not.toHaveBeenCalled();
 ui.confirmButton('Confirm delete').props.onClick();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['A']);
});
it('same-row reopen and A to B to A never revive an older confirmation identity',()=>{
 const ui=setup();ui.rowButton('A','Delete').props.onClick();const oldCancel=ui.confirmButton('Cancel').props.onClick,oldConfirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.rowButton('A','Delete').props.onClick();oldCancel();expect(ui.hasConfirmation()).toBe(true);oldConfirm();expect(ui.publish).not.toHaveBeenCalled();
 ui.rowButton('B','Delete').props.onClick();ui.rowButton('A','Delete').props.onClick();oldCancel();oldConfirm();expect(ui.hasConfirmation()).toBe(true);expect(ui.publish).not.toHaveBeenCalled();
 ui.confirmButton('Cancel').props.onClick();expect(ui.hasConfirmation()).toBe(false);
});
it('the exact current confirmation can be cancelled after its saved target revision becomes invalid',()=>{
 const ui=setup();ui.rowButton('A','Delete').props.onClick();const cancel=ui.confirmButton('Cancel').props.onClick,confirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.props.alerts=[editLocalAlert(ui.props.alerts[0],{message:'SYNTHETIC external revision'},now+1),ui.props.alerts[1]];ui.render();
 confirm();expect(ui.publish).not.toHaveBeenCalled();cancel();expect(ui.hasConfirmation()).toBe(false);
});
it('confirmation consumption precedes reentrant publication and uses the complete current collection',()=>{
 const ui=setup(),base=ui.props.alerts;ui.rowButton('A','Delete').props.onClick();const confirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.duringPublish(()=>confirm());confirm();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.publish.mock.calls[0][1]).toBe(base);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['B']);expect(ui.request).not.toHaveBeenCalled();
});
it('rejected Delete preserves saved rows/history and cannot replay its consumed confirmation',()=>{
 const ui=setup(),base=ui.props.alerts;ui.reject();ui.rowButton('A','Delete').props.onClick();const confirm=ui.confirmButton('Confirm delete').props.onClick;
 confirm();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.props.alerts).toBe(base);expect(ui.words()).toContain('rejected');confirm();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.request).not.toHaveBeenCalled();
});
it('confirmation handlers from a closed manager cannot cancel or confirm a new opening',()=>{
 const ui=setup();ui.rowButton('A','Delete').props.onClick();const cancel=ui.confirmButton('Cancel').props.onClick,confirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.props.open=false;ui.settle();ui.props.open=true;ui.settle();ui.rowButton('B','Delete').props.onClick();cancel();confirm();
 expect(ui.hasConfirmation()).toBe(true);expect(ui.publish).not.toHaveBeenCalled();
});

function menu(ui:ReturnType<typeof setup>){return ui.find(node=>node.props.role==='menu');}
function menuButton(ui:ReturnType<typeof setup>,label:string){return ui.button(label,menu(ui));}
function openMore(ui:ReturnType<typeof setup>,id:string){const row=ui.row(id),button=ui.find(node=>node.type==='button'&&node.props['aria-label']==='More alert actions for SYNTHETIC '+id,row),target=new SyntheticElement();target.tagName='BUTTON';button.props.onClick(event(target));}
function menuCount(ui:ReturnType<typeof setup>){return all(ui.render(),node=>node.props.role==='menu').length;}

it('menu A to B to A retires both old command and old Escape closures',()=>{
 const ui=setup();openMore(ui,'A');const pause=menuButton(ui,'Pause').props.onClick,escape=menu(ui).props.onKeyDown;
 openMore(ui,'B');openMore(ui,'A');pause(event());escape(event(undefined,{key:'Escape'}));
 expect(ui.publish).not.toHaveBeenCalled();expect(menuCount(ui)).toBe(1);expect(menu(ui).props['aria-label']).toBe('Actions for SYNTHETIC A');
});
it('menu dismissal and same-row reopen never revive the consumed command',()=>{
 const ui=setup();openMore(ui,'A');const pause=menuButton(ui,'Pause').props.onClick;
 menu(ui).props.onKeyDown(event(undefined,{key:'Escape'}));expect(menuCount(ui)).toBe(0);openMore(ui,'A');pause(event());
 expect(ui.publish).not.toHaveBeenCalled();expect(menuCount(ui)).toBe(1);menuButton(ui,'Pause').props.onClick(event());expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.props.alerts[0].status).toBe('paused');
});
it.each(['paused','stopped','expired'] as const)('same-revision transition to %s retires an observed old Pause menu',status=>{
 const ui=setup();openMore(ui,'A');const pause=menuButton(ui,'Pause').props.onClick,revision=ui.props.alerts[0].revision;
 ui.props.alerts=[{...ui.props.alerts[0],status},ui.props.alerts[1]];ui.render();expect(ui.props.alerts[0].revision).toBe(revision);pause(event());
 expect(ui.publish).not.toHaveBeenCalled();expect(menuCount(ui)).toBe(0);expect(ui.props.alerts[0].status).toBe(status);
});
it.each(['stopped','expired'] as const)('%s menu item is disabled and direct invocation still refuses',status=>{
 const ui=setup([{...saved('A'),status},saved('B')]);openMore(ui,'A');const pause=menuButton(ui,'Pause');expect(pause.props.disabled).toBe(true);pause.props.onClick(event());expect(ui.publish).not.toHaveBeenCalled();
});
it('history appended after menu opening is preserved by the latest full-array Pause action',()=>{
 const ui=setup();openMore(ui,'A');const pause=menuButton(ui,'Pause').props.onClick,initial=ui.props.alerts[0];
 const latest=processAlertEvent(initial,{instrumentId:dataset.instrument.id,sourceId:'close',mode:'ordinary',runId:'ordinary',value:11,time:now+1,availableAt:now+1,sequence:1,barId:'SYNTHETIC row observation',barClosed:false,feedState:'ready'}).alert;
 expect(latest.history).toHaveLength(1);expect(latest.revision).toBe(initial.revision);expect(latest.status).toBe('active');const base=[latest,ui.props.alerts[1]];ui.props.alerts=base;ui.render();pause(event());
 expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.publish.mock.calls[0][1]).toBe(base);expect(ui.props.alerts[0].history).toStrictEqual(latest.history);expect(ui.props.alerts[0].status).toBe('paused');expect(ui.props.alerts[1]).toBe(base[1]);expect(ui.request).not.toHaveBeenCalled();
});
it('a consumed Pause cannot be replayed during its publication callback',()=>{
 const ui=setup();openMore(ui,'A');const pause=menuButton(ui,'Pause').props.onClick;ui.duringPublish(()=>pause(event()));pause(event());
 expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.props.alerts[0].status).toBe('paused');expect(menuCount(ui)).toBe(0);
});
it('primary row double-click opens saved-session editing without publishing and Cancel leaves rows unchanged',()=>{
 const ui=setup(),base=ui.props.alerts,target=new SyntheticElement();const doubleClick=ui.row('A').props.onDoubleClick;
 doubleClick(event(target));expect(ui.find(node=>node.props['aria-label']==='Alert name').props.value).toBe('SYNTHETIC A');expect(ui.publish).not.toHaveBeenCalled();
 doubleClick(event(target));expect(ui.publish).not.toHaveBeenCalled();ui.button('Cancel').props.onClick();expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();
});
it.each(['BUTTON','A','INPUT','SELECT','TEXTAREA','LABEL','SUMMARY','editable','menu','confirmation','secondary'])('row double-click from %s cannot invoke Edit',kind=>{
 const ui=setup(),row=new SyntheticElement(),target=new SyntheticElement();target.parentElement=row;
 if(kind==='editable')target.editable=true;else if(kind==='menu')target.role='menu';else if(kind==='confirmation'){target.className='alert-delete';target.role='alertdialog';}else target.tagName=kind==='secondary'?'P':kind;
 ui.row('A').props.onDoubleClick(event(target,{currentTarget:row,button:kind==='secondary'?2:0}));
 expect(all(ui.render(),node=>node.props['aria-label']==='Alert name')).toHaveLength(0);expect(ui.publish).not.toHaveBeenCalled();
});
it('menu Escape and composition preserve an existing Delete confirmation and never close the manager',()=>{
 const ui=setup();ui.rowButton('B','Delete').props.onClick();openMore(ui,'A');
 const composing=event(undefined,{key:'Escape',nativeEvent:{isComposing:true}});menu(ui).props.onKeyDown(composing);expect(menuCount(ui)).toBe(1);expect(composing.preventDefault).toHaveBeenCalled();expect(composing.stopPropagation).toHaveBeenCalled();
 const escape=event(undefined,{key:'Escape'});menu(ui).props.onKeyDown(escape);expect(escape.stopPropagation).toHaveBeenCalled();expect(menuCount(ui)).toBe(0);expect(ui.hasConfirmation()).toBe(true);expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});
it('outside pointer dismissal preserves confirmation and the intended outside target',()=>{
 const ui=setup();ui.rowButton('B','Delete').props.onClick();openMore(ui,'A');ui.settle();
 const outside=new SyntheticElement(),input=event(outside);const listeners=[...(documentListeners.get('pointerdown')??documentListeners.get('mousedown')??[])];expect(listeners.length).toBeGreaterThan(0);listeners.forEach(listener=>listener(input));
 expect(menuCount(ui)).toBe(0);expect(ui.hasConfirmation()).toBe(true);expect(input.preventDefault).not.toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('a rejected A publication cannot restore its confirmation over reentrantly opened B',()=>{
 const ui=setup();ui.reject();ui.rowButton('A','Delete').props.onClick();const confirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.duringPublish(()=>ui.rowButton('B','Delete').props.onClick());confirm();
 expect(ui.publish).toHaveBeenCalledTimes(1);expect(all(ui.row('B'),node=>node.props.role==='alertdialog')).toHaveLength(1);expect(all(ui.row('A'),node=>node.props.role==='alertdialog')).toHaveLength(0);
 confirm();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['A','B']);
});
it('a rejected A publication cannot revive A after a newer B confirmation was opened and cancelled',()=>{
 const ui=setup();ui.reject();ui.rowButton('A','Delete').props.onClick();const confirm=ui.confirmButton('Confirm delete').props.onClick;
 ui.duringPublish(()=>{ui.rowButton('B','Delete').props.onClick();ui.confirmButton('Cancel').props.onClick();});confirm();
 expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.hasConfirmation()).toBe(false);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['A','B']);
 confirm();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.hasConfirmation()).toBe(false);
});
it('accepted deletion routes a deterministically detached focused confirmation to Search',()=>{
 const ui=setup(),search=new SyntheticElement(),from=new SyntheticElement();search.tagName='INPUT';from.tagName='BUTTON';
 ui.find(node=>node.props['aria-label']==='Search alerts').props.ref.current=search;(document as any).activeElement=from;
 ui.rowButton('A','Delete').props.onClick();ui.confirmButton('Confirm delete').props.onClick();from.isConnected=false;(document as any).activeElement=null;ui.settle();
 expect(document.activeElement).toBe(search);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['B']);expect(ui.publish).toHaveBeenCalledTimes(1);
});
it('menu focus reentry cannot clear a newer menu opened by the first-item focus callback',()=>{
 const ui=setup();openMore(ui,'A');const first=new SyntheticElement();first.tagName='BUTTON';first.onFocus=()=>openMore(ui,'B');
 const element=Object.assign(new SyntheticElement(),{querySelector:()=>first});element.role='menu';menu(ui).props.ref(element);ui.settle();
 expect(menuCount(ui)).toBe(1);expect(menu(ui).props['aria-label']).toBe('Actions for SYNTHETIC B');expect(ui.publish).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
});
