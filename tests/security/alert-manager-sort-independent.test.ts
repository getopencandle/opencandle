import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,editLocalAlert,processAlertEvent,setLocalAlertPaused,type AlertEvent,type LocalAlert} from '../../src/domain/alerts';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component/effect bodies with controlled hooks and publication sink.
// Reused fixture plumbing only; sort expectations below are independent literal orders.
// No DOM, keyboard dispatch, WorkspaceAlerts native worker or executable proof.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,pending:[] as (()=>void)[],cleanups:[] as (((()=>void)|undefined))[]}));
vi.mock('react',async()=>{
 const effect=(run:()=>void|(()=>void),deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||deps.length!==old.length||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.pending.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()||undefined;});}};
 const memo=(run:()=>unknown,deps:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.length!==old.deps.length||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:run()};return hooks.cells[i].value;};
 return{...await vi.importActual<any>('react'),useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:effect,useLayoutEffect:effect,useMemo:memo,useCallback:(fn:()=>unknown,deps:unknown[])=>memo(()=>fn,deps)};
});
const dataset=fixtureDataset('GME',5),now=1791979200;
const context=(session:string)=>alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'SYNTHETIC independent sort',sessionId:session,mode:'ordinary',startedAt:now}),dataset);
const live=context('SYNTHETIC current session');
function saved(id:string,name:string,ctx:ReturnType<typeof context>|null=live):LocalAlert{
 return createLocalAlert({id,name,message:'SYNTHETIC local search notification',instrumentId:ctx?.instrumentId??dataset.instrument.id,sourceId:ctx?.sourceId??'close',mode:'ordinary',runId:ctx?.runId??'ordinary',createdAt:now,expiresAt:null,condition:{kind:'greater',value:10},frequency:'every-time',...ctx?{observationBinding:ctx.binding,conditionVersion:2 as const}:{}});
}
const alpha=()=>saved('SYNTHETIC alpha id','SYNTHETIC Alpha'),beta=()=>saved('SYNTHETIC beta id','SYNTHETIC Beta');
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

const names=(ui:ReturnType<typeof setup>)=>ui.rows().map(row=>text(findAll(row,n=>n.type==='strong')[0]));

it('sorts only displayed references and publishes a current full original-order base for a row action',()=>{
 const a=alpha(),b=beta(),base=[b,a],ui=setup(base);expect(names(ui)).toStrictEqual([b.definition.name,a.definition.name]);
 ui.change('Sort alerts by','name');expect(names(ui)).toStrictEqual([a.definition.name,b.definition.name]);expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
 ui.rowButton(a.definition.name,'Pause').props.onClick();expect(ui.publish).toHaveBeenCalledTimes(1);const[next,expected]=ui.publish.mock.calls[0];expect(expected).toBe(base);expect(next.map(row=>row.definition.id)).toStrictEqual([b.definition.id,a.definition.id]);expect(next[0]).toBe(b);expect(next[1].status).toBe('paused');
});

it('Clear filters preserves sort and Reset sort preserves raw search while restoring the complete default',()=>{
 const a=alpha(),b=beta(),ui=setup([b,a]);ui.change('Sort alerts by','name');ui.change('Alert sort direction','desc');ui.search('Alpha');expect(names(ui)).toStrictEqual([a.definition.name]);
 ui.click('Clear filters');expect(names(ui)).toStrictEqual([b.definition.name,a.definition.name]);expect(ui.field('Sort alerts by').props.value).toBe('name');expect(ui.field('Alert sort direction').props.value).toBe('desc');
 ui.search('Alpha');ui.click('Reset sort');expect(ui.field('Search alerts').props.value).toBe('Alpha');expect(ui.field('Sort alerts by').props.value).toBe('original');expect(ui.field('Alert sort direction').props.value).toBe('asc');expect(ui.field('Alert sort direction').props.disabled).toBe(true);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it('retains sort across tabs and resets it only on actual close/reopen without reordering saved alerts',()=>{
 const a=alpha(),b=beta(),base=[b,a],ui=setup(base);ui.change('Sort alerts by','name');ui.change('Alert sort direction','desc');ui.search('SYNTHETIC');ui.click('History (0)');ui.click('Alerts (2)');expect(ui.field('Sort alerts by').props.value).toBe('name');expect(ui.field('Alert sort direction').props.value).toBe('desc');
 ui.click('Close');ui.settle();ui.props.open=true;ui.settle();expect(ui.field('Sort alerts by').props.value).toBe('original');expect(ui.field('Alert sort direction').props.value).toBe('asc');expect(ui.field('Search alerts').props.value).toBe('');expect(names(ui)).toStrictEqual([b.definition.name,a.definition.name]);expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();
});

it('retires old sort and row controls after an explicit same-order sort intent',()=>{
 const a=alpha(),b=beta(),ui=setup([a,b]);const priorSort=ui.field('Sort alerts by').props.onChange,priorPause=ui.rowButton(a.definition.name,'Pause').props.onClick;
 ui.change('Sort alerts by','name');expect(names(ui)).toStrictEqual([a.definition.name,b.definition.name]);priorSort({target:{value:'created'}});priorPause();expect(ui.field('Sort alerts by').props.value).toBe('name');expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it.each(['Edit','Delete','Pause'])('does not revive a retained %s callback after sort order changes and returns',action=>{
 const a=alpha(),b=beta(),ui=setup([b,a]);const old=ui.rowButton(a.definition.name,action).props.onClick;ui.change('Sort alerts by','name');expect(names(ui)).toStrictEqual([a.definition.name,b.definition.name]);ui.click('Reset sort');expect(names(ui)).toStrictEqual([b.definition.name,a.definition.name]);old();expect(ui.publish).not.toHaveBeenCalled();expect(findAll(ui.render(),n=>n.type==='form')).toHaveLength(0);expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');
});

it('old confirmation and Cancel cannot delete a row or dismiss a newer confirmation after sorting',()=>{
 const a=alpha(),b=beta(),ui=setup([b,a]);ui.rowButton(a.definition.name,'Delete').props.onClick();const confirm=ui.button('Confirm delete').props.onClick,cancel=ui.button('Cancel').props.onClick;
 ui.change('Sort alerts by','name');expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');ui.rowButton(b.definition.name,'Delete').props.onClick();confirm();cancel();expect(ui.publish).not.toHaveBeenCalled();expect(ui.words()).toContain('Delete this alert and its local trigger history?');ui.click('Cancel');expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');
});

it('observation-driven reordering retires a confirmation while its current Cancel can dismiss it',()=>{
 const a=saved('SYNTHETIC trigger a','SYNTHETIC Alpha',null),b=saved('SYNTHETIC trigger b','SYNTHETIC Beta',null),ui=setup([a,b]);ui.change('Sort alerts by','triggered');ui.rowButton(a.definition.name,'Delete').props.onClick();const confirm=ui.button('Confirm delete').props.onClick;
 const observed=processAlertEvent(b,event()).alert;expect(observed.lastTriggeredAt).toBe(now+1);expect(observed.revision).toBe(b.revision);ui.props.alerts=[a,observed];expect(names(ui)).toStrictEqual([b.definition.name,a.definition.name]);confirm();expect(ui.publish).not.toHaveBeenCalled();ui.click('Cancel');expect(ui.words()).not.toContain('Delete this alert and its local trigger history?');expect(ui.props.alerts[1]).toBe(observed);
});

it('real trigger history with unchanged sorted order preserves current Pause authority and the complete latest base',()=>{
 const a=saved('SYNTHETIC trigger same a','SYNTHETIC Alpha',null),b=beta(),ui=setup([a,b]);ui.change('Sort alerts by','name');const pause=ui.rowButton(a.definition.name,'Pause').props.onClick;
 const observed=processAlertEvent(a,event()).alert;expect(observed.history).toHaveLength(1);const latest=[observed,b];ui.props.alerts=latest;expect(names(ui)).toStrictEqual([a.definition.name,b.definition.name]);pause();expect(ui.publish).toHaveBeenCalledTimes(1);const[next,expected]=ui.publish.mock.calls[0];expect(expected).toBe(latest);expect(next[0].history).toStrictEqual(observed.history);expect(next[1]).toBe(b);
});

it('rearm refuses after its external source validator changes sort with the same visible records',()=>{
 const a=saved('SYNTHETIC prior source','SYNTHETIC Alpha',context('SYNTHETIC prior')),b=beta(),ui=setup([b,a]);ui.props.validateCurrentSource=()=>{ui.change('Sort alerts by','name');ui.render();};ui.button('Restart').props.onClick();expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(names(ui)).toStrictEqual([a.definition.name,b.definition.name]);expect(ui.props.alerts).toStrictEqual([b,a]);
});

it('a malformed dormant direction has an explicit zero-match error and Reset sort repairs it without clearing query',()=>{
 const a=alpha(),b=beta(),base=[b,a],ui=setup(base);ui.search('Alpha');ui.change('Sort alerts by','name');ui.change('Alert sort direction','SYNTHETIC invalid direction');expect(ui.rows()).toHaveLength(0);expect(text(ui.field('Matching alerts'))).toBe('0 of 2 alerts');expect(ui.words()).toMatch(/sort|direction/i);ui.click('Reset sort');expect(ui.field('Search alerts').props.value).toBe('Alpha');expect(ui.field('Sort alerts by').props.value).toBe('original');expect(ui.field('Alert sort direction').props.value).toBe('asc');expect(names(ui)).toStrictEqual([a.definition.name]);expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it('keeps hidden alerts in genuine local observation and expiry while the displayed order is sorted',()=>{
 const a=saved('SYNTHETIC observed alpha','SYNTHETIC Alpha',null),hidden=saved('SYNTHETIC observed hidden','SYNTHETIC Beta',null),expired=createLocalAlert({...hidden.definition,id:'SYNTHETIC expiry',name:'SYNTHETIC expiry',expiresAt:now+1}),ui=setup([hidden,a,expired],{context:undefined,contexts:[],externallyProcessed:false});
 ui.change('Sort alerts by','name');ui.search('Alpha');ui.props.events=[event(2)];ui.props.now=now+2;ui.settle();expect(names(ui)).toStrictEqual([a.definition.name]);expect(ui.props.alerts.map(row=>row.definition.id)).toStrictEqual([hidden.definition.id,a.definition.id,expired.definition.id]);expect(ui.props.alerts[0].history).toHaveLength(1);expect(ui.props.alerts[1].history).toHaveLength(1);expect(ui.props.alerts[2].status).toBe('expired');expect(ui.request).not.toHaveBeenCalled();
});
