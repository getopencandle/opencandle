import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,editLocalAlert,processAlertEvent,setLocalAlertPaused,type AlertEvent,type LocalAlert} from '../../src/domain/alerts';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component/effect bodies with controlled hooks and publication sink.
// No DOM, keyboard dispatch, WorkspaceAlerts native worker or executable proof.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,pending:[] as (()=>void)[],cleanups:[] as (((()=>void)|undefined))[]}));
vi.mock('react',async()=>{
 const effect=(run:()=>void|(()=>void),deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||deps.length!==old.length||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.pending.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()||undefined;});}};
 const memo=(run:()=>unknown,deps:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.length!==old.deps.length||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:run()};return hooks.cells[i].value;};
 return{...await vi.importActual<any>('react'),useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:effect,useLayoutEffect:effect,useMemo:memo,useCallback:(fn:()=>unknown,deps:unknown[])=>memo(()=>fn,deps)};
});
const dataset=fixtureDataset('GME',5),now=1791979200;
const context=(session:string)=>alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'SYNTHETIC independent search',sessionId:session,mode:'ordinary',startedAt:now}),dataset);
const live=context('SYNTHETIC current session');
function saved(id:string,name:string,ctx:ReturnType<typeof context>|null=live):LocalAlert{
 return createLocalAlert({id,name,message:'SYNTHETIC local search notification',instrumentId:ctx?.instrumentId??dataset.instrument.id,sourceId:ctx?.sourceId??'close',mode:'ordinary',runId:ctx?.runId??'ordinary',createdAt:now,expiresAt:null,condition:{kind:'greater',value:10},frequency:'every-time',...ctx?{observationBinding:ctx.binding,conditionVersion:2 as const}:{}});
}
const alpha=()=>saved('SYNTHETIC alpha id','SYNTHETIC visible alpha'),beta=()=>saved('SYNTHETIC beta id','SYNTHETIC hidden beta');
function event(sequence=1):AlertEvent{return{instrumentId:dataset.instrument.id,sourceId:'close',mode:'ordinary',runId:'ordinary',value:11,time:now+sequence,availableAt:now+sequence,sequence,barId:'SYNTHETIC bar '+sequence,barClosed:false,feedState:'ready'};}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function findAll(tree:any,predicate:(node:any)=>boolean):any[]{if(Array.isArray(tree))return tree.flatMap(child=>findAll(child,predicate));if(!tree?.props)return[];return[...predicate(tree)?[tree]:[],...findAll(tree.props.children,predicate)];}
function setup(initial:LocalAlert[]=[alpha(),beta()],overrides:Partial<AlertDialogProps>={}){
 let accepts=true;const request=vi.fn();let props:AlertDialogProps;
 const publish=vi.fn((next:LocalAlert[],base?:LocalAlert[])=>{if(!accepts||base!==props.alerts)return false;props.alerts=next;return true;});
 props={open:true,onClose:vi.fn(()=>{props.open=false;}),alerts:initial,onAlertsChange:publish,instrument:dataset.instrument,now,context:live,contexts:[live],events:[],externallyProcessed:true,onRequestObservation:request,validateCurrentSource:vi.fn(),...overrides};
 const render=()=>{hooks.cursor=0;return AlertDialog(props);};
 const element=(predicate:(node:any)=>boolean)=>{const values=findAll(render(),predicate);if(!values.length)throw Error('SYNTHETIC actual handler target absent');return values[0];};
 const field=(label:string)=>element(node=>node.props['aria-label']===label);
 const button=(label:string,tree?:any)=>{const values=findAll(tree??render(),node=>node.type==='button'&&text(node)===label);if(!values.length)throw Error('SYNTHETIC button absent: '+label);return values[0];};
 const click=(label:string)=>button(label).props.onClick();
 const change=(label:string,value:string)=>field(label).props.onChange({target:{value}});
 const search=(value:string)=>change('Search alerts',value);
 const rows=()=>findAll(render(),node=>node.type==='article'&&node.props.className==='alert-row');
 const row=(name:string)=>rows().find(node=>findAll(node,child=>child.type==='strong'&&text(child)===name).length>0);
 const rowButton=(name:string,label:string)=>{const target=row(name);if(!target)throw Error('SYNTHETIC row absent: '+name);return button(label,target);};
 const settle=()=>{for(let i=0;i<8;i++){render();const pending=hooks.pending.splice(0);if(!pending.length)return;pending.forEach(run=>run());}throw Error('SYNTHETIC effects did not settle');};
 settle();return{props,publish,request,render,element,field,button,click,change,search,rows,row,rowButton,settle,reject:()=>{accepts=false;},words:()=>text(render()),submit:()=>element(node=>node.type==='form').props.onSubmit({preventDefault(){}})};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.pending=[];hooks.cleanups=[];vi.stubGlobal('document',{activeElement:null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup?.());vi.unstubAllGlobals();vi.restoreAllMocks();});

it('pause and delete of a matching row publish the complete collection and retain the hidden row by reference',()=>{
 const first=alpha(),hidden=beta(),base=[first,hidden],ui=setup(base);ui.search('visible alpha');
 expect(ui.rows()).toHaveLength(1);expect(text(ui.field('Matching alerts'))).toBe('1 of 2 alerts');expect(ui.words()).toContain('Alerts (2)');
 ui.rowButton(first.definition.name,'Pause').props.onClick();expect(ui.publish).toHaveBeenCalledTimes(1);
 const [paused,expected]=ui.publish.mock.calls[0];expect(expected).toBe(base);expect(paused).toHaveLength(2);expect(paused[1]).toBe(hidden);expect(paused[0].status).toBe('paused');
 ui.rowButton(first.definition.name,'Delete').props.onClick();ui.click('Confirm delete');expect(ui.publish).toHaveBeenCalledTimes(2);
 expect(ui.publish.mock.calls[1][1]).toBe(paused);expect(ui.props.alerts).toStrictEqual([hidden]);expect(ui.props.alerts[0]).toBe(hidden);expect(ui.rows()).toHaveLength(0);expect(text(ui.field('Matching alerts'))).toBe('0 of 1 alerts');
});

it('an edit uses latest hidden observations and preserves their exact record instead of the displayed subset',()=>{
 const first=alpha(),hidden=beta(),ui=setup([first,hidden]);ui.search('visible alpha');ui.rowButton(first.definition.name,'Edit').props.onClick();
 ui.change('Alert name','SYNTHETIC revised visible alpha');const updatedHidden={...hidden,missedDataGaps:7},latest=[first,updatedHidden];ui.props.alerts=latest;ui.render();ui.submit();
 expect(ui.publish).toHaveBeenCalledTimes(1);const[next,base]=ui.publish.mock.calls[0];expect(base).toBe(latest);expect(next).toHaveLength(2);expect(next[1]).toBe(updatedHidden);expect(next[0].revision).toBe(2);expect(next[0].definition.name).toBe('SYNTHETIC revised visible alpha');expect(ui.rows()).toHaveLength(1);
});

it.each(['Edit','Delete'])('a retained %s callback cannot act after its row is hidden by a new query',action=>{
 const first=alpha(),ui=setup([first,beta()]);ui.search('visible alpha');const stale=ui.rowButton(first.definition.name,action).props.onClick;
 ui.search('hidden beta');ui.render();stale();expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(findAll(ui.render(),n=>n.type==='form')).toHaveLength(0);expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');expect(ui.rows()).toHaveLength(1);
});

it('an invalidated confirmation cannot delete its old row or dismiss a newer row confirmation, even after the old row reappears',()=>{
 const first=alpha(),second=beta(),ui=setup([first,second]);ui.search('visible alpha');ui.rowButton(first.definition.name,'Delete').props.onClick();const oldConfirm=ui.button('Confirm delete').props.onClick;
 ui.search('hidden beta');ui.rowButton(second.definition.name,'Delete').props.onClick();oldConfirm();expect(ui.publish).not.toHaveBeenCalled();expect(ui.words()).toContain('Delete this alert and its local trigger history?');
 ui.search('visible alpha');oldConfirm();expect(ui.publish).not.toHaveBeenCalled();expect(ui.props.alerts).toStrictEqual([first,second]);expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');
});

it('status-driven hidden then reappearing membership permanently retires old Edit/Delete/Rearm actions without a definition revision change',()=>{
 const first=saved('SYNTHETIC old-source alpha','SYNTHETIC visible alpha',context('SYNTHETIC retired session')),other=beta(),ui=setup([first,other]);
 ui.search('visible alpha');ui.change('Alert status filter','active');const edit=ui.rowButton(first.definition.name,'Edit').props.onClick,remove=ui.rowButton(first.definition.name,'Delete').props.onClick,rearm=ui.button('Restart').props.onClick;
 const paused=setLocalAlertPaused(first,true);expect(paused.revision).toBe(first.revision);ui.props.alerts=[paused,other];ui.render();expect(ui.rows()).toHaveLength(0);
 ui.props.alerts=[first,other];ui.render();expect(ui.rows()).toHaveLength(1);edit();remove();rearm();expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(findAll(ui.render(),n=>n.type==='form')).toHaveLength(0);expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');
});

it('a still-visible row action remains usable after a real history-only update with the same revision',()=>{
 const first=saved('SYNTHETIC legacy alpha','SYNTHETIC visible alpha',null),other=beta(),ui=setup([first,other]);ui.search('visible alpha');const pause=ui.rowButton(first.definition.name,'Pause').props.onClick;
 const observed=processAlertEvent(first,event()).alert;expect(observed.history).toHaveLength(1);expect(observed.revision).toBe(first.revision);ui.props.alerts=[observed,other];ui.render();pause();
 expect(ui.publish).toHaveBeenCalledTimes(1);const next=ui.publish.mock.calls[0][0];expect(next[0].history).toStrictEqual(observed.history);expect(next[0].status).toBe('paused');expect(next[1]).toBe(other);
});

it('rearm checks the view again after the external source validator changes which row is visible',()=>{
 const first=saved('SYNTHETIC retired alpha','SYNTHETIC visible alpha',context('SYNTHETIC prior session')),ui=setup([first,beta()]);ui.search('visible alpha');
 ui.props.validateCurrentSource=()=>{ui.search('hidden beta');ui.render();};ui.button('Restart').props.onClick();
 expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(ui.props.alerts).toHaveLength(2);expect(ui.rows()).toHaveLength(1);expect(text(ui.rows()[0])).toContain('SYNTHETIC hidden beta');
});

it('invalid raw query retains all 257 units, renders an explicit zero-match error view and Clear changes no alert state',()=>{
 const initial=[alpha(),beta()],ui=setup(initial),before=structuredClone(initial),raw='x'.repeat(257);ui.search(raw);
 expect(ui.field('Search alerts').props.value).toBe(raw);expect(ui.field('Search alerts').props.maxLength).toBeUndefined();expect(ui.rows()).toHaveLength(0);expect(text(ui.field('Matching alerts'))).toBe('0 of 2 alerts');expect(findAll(ui.render(),n=>n.props.role==='alert').some(node=>/256|limit|search/i.test(text(node)))).toBe(true);
 expect(ui.props.alerts).toBe(initial);expect(ui.props.alerts).toStrictEqual(before);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();ui.click('Clear filters');expect(ui.field('Search alerts').props.value).toBe('');expect(ui.rows()).toHaveLength(2);expect(ui.publish).not.toHaveBeenCalled();
});

it('tabs retain the query, close/reopen resets it, and old query/row callbacks cannot revive on reopen',()=>{
 const first=alpha(),ui=setup([first,beta()]);ui.search('visible alpha');const oldSearch=ui.field('Search alerts').props.onChange,oldPause=ui.rowButton(first.definition.name,'Pause').props.onClick;
 ui.click('History (0)');expect(findAll(ui.render(),n=>n.props['aria-label']==='Search alerts')).toHaveLength(0);ui.click('Alerts (2)');expect(ui.field('Search alerts').props.value).toBe('visible alpha');
 ui.click('Close');ui.settle();expect(ui.render()).toBeNull();ui.props.open=true;ui.settle();expect(ui.field('Search alerts').props.value).toBe('');expect(ui.rows()).toHaveLength(2);
 oldSearch({target:{value:'hidden beta'}});oldPause();expect(ui.field('Search alerts').props.value).toBe('');expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it('rejected resume preserves hidden saved records and requests no after-save observation',()=>{
 const first=setLocalAlertPaused(alpha(),true),other=beta(),initial=[first,other],ui=setup(initial);ui.search('visible alpha');ui.reject();ui.rowButton(first.definition.name,'Resume').props.onClick();
 expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.publish.mock.calls[0][1]).toBe(initial);expect(ui.publish.mock.calls[0][0][1]).toBe(other);expect(ui.props.alerts).toBe(initial);expect(ui.request).not.toHaveBeenCalled();expect(ui.words()).toMatch(/rejected/i);
});

it('actual standalone effects evaluate and expire hidden alerts with filters active, and continue expiry while the manager is closed',()=>{
 const visible=saved('SYNTHETIC legacy visible','SYNTHETIC visible alpha',null);visible.definition.condition={kind:'greater',value:100};
 const hidden=saved('SYNTHETIC hidden event','SYNTHETIC hidden beta',null),expiry=createLocalAlert({...hidden.definition,id:'SYNTHETIC expiry',name:'SYNTHETIC hidden expiry',expiresAt:now+1});
 const ui=setup([visible,hidden,expiry],{externallyProcessed:false,context:null,contexts:[]});ui.search('visible alpha');expect(ui.rows()).toHaveLength(1);expect(ui.publish).not.toHaveBeenCalled();ui.props.events=[event(2)];ui.props.now=now+2;ui.settle();
 const next=ui.props.alerts;expect(next).toHaveLength(3);expect(next[0].history).toHaveLength(0);expect(next[1].history).toHaveLength(1);expect(next[1].history[0].value).toBe(11);expect(next[2].status).toBe('expired');expect(ui.rows()).toHaveLength(1);
 const later=createLocalAlert({...hidden.definition,id:'SYNTHETIC later expiry',name:'SYNTHETIC hidden later',expiresAt:now+3});ui.props.alerts=[...next,later];ui.props.events=[];ui.click('Close');ui.props.now=now+4;ui.settle();expect(ui.render()).toBeNull();expect(ui.props.alerts.find(a=>a.definition.id===later.definition.id)?.status).toBe('expired');expect(ui.request).not.toHaveBeenCalled();
});

it('a retained Pause action cannot become Resume when the still-visible current row is paused without a revision change',()=>{
 const first=alpha(),other=beta(),ui=setup([first,other]);ui.search('visible alpha');const oldPause=ui.rowButton(first.definition.name,'Pause').props.onClick;
 const paused=setLocalAlertPaused(first,true);expect(paused.revision).toBe(first.revision);const latest=[paused,other];ui.props.alerts=latest;ui.render();expect(ui.rows()).toHaveLength(1);
 oldPause();expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(ui.props.alerts).toBe(latest);expect(ui.props.alerts[0].status).toBe('paused');
});

it('a retained Resume action cannot pause and erase a newly observed still-visible active baseline',()=>{
 const first=setLocalAlertPaused(saved('SYNTHETIC legacy resumed alpha','SYNTHETIC visible alpha',null),true),other=beta(),ui=setup([first,other]);ui.search('visible alpha');const oldResume=ui.rowButton(first.definition.name,'Resume').props.onClick;
 const current=processAlertEvent(setLocalAlertPaused(first,false),event(2)).alert;expect(current.revision).toBe(first.revision);expect(current.status).toBe('active');expect(current.lastValue).toBe(11);expect(current.history).toHaveLength(1);
 const latest=[current,other];ui.props.alerts=latest;ui.render();oldResume();expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(ui.props.alerts).toBe(latest);expect(ui.props.alerts[0].lastValue).toBe(11);expect(ui.props.alerts[0].history).toStrictEqual(current.history);
});
