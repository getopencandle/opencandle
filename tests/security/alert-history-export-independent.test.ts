import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,editLocalAlert,processAlertEvent,setLocalAlertPaused,type AlertEvent,type LocalAlert} from '../../src/domain/alerts';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual export handler with controlled hooks and an in-memory desktop bridge.
// CSV text stays only in memory; no files, downloads, snapshots or dialogs.
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

type Reply={ok:true}|{ok:false;error:{code:string;message:string}};
function deferred(){let resolve!:(value:Reply)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<Reply>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function triggered(id:string,name:string,sequence=1){return processAlertEvent(saved(id,name,null),event(sequence)).alert;}
function history(ui:ReturnType<typeof setup>){const count=ui.props.alerts.reduce((sum,row)=>sum+row.history.length,0);ui.click(`History (${count})`);return ui.button('Export alert history CSV');}
function message(ui:ReturnType<typeof setup>){return text(ui.element(node=>node.type==='output'&&node.props.role==='status'));}
function bridge(send:Function){vi.stubGlobal('window',{lv:{exportData:send}});}

it('exports click-time retained history from every alert using trigger data, independently of search and sort',async()=>{
 const original=triggered('SYNTHETIC exported alpha','SYNTHETIC original Alpha'),a=editLocalAlert(original,{name:'SYNTHETIC renamed Alpha',message:'SYNTHETIC new message'},now+2),b=triggered('SYNTHETIC exported beta','SYNTHETIC original Beta',2),base=[a,b],pending=deferred(),send=vi.fn((_payload:{text:string;suggestedName:string;format:string})=>pending.promise);bridge(send);const ui=setup(base);
 ui.search('renamed Alpha');ui.change('Sort alerts by','name');ui.change('Alert sort direction','desc');const action=history(ui).props.onClick,result=action();expect(send).toHaveBeenCalledTimes(1);
 const payload=send.mock.calls[0][0];expect(payload.suggestedName).toBe('OpenCandle-local-alert-history.csv');expect(payload.format).toBe('csv');expect(payload.text.startsWith('\uFEFF"notification_id","alert_id","observed_at_unix_seconds"')).toBe(true);expect(payload.text).toContain('"SYNTHETIC original Alpha"');expect(payload.text).toContain('"SYNTHETIC original Beta"');expect(payload.text).not.toContain('SYNTHETIC renamed Alpha');expect(payload.text).not.toContain('SYNTHETIC new message');expect(payload.text.indexOf('"SYNTHETIC original Beta"')).toBeLessThan(payload.text.indexOf('"SYNTHETIC original Alpha"'));expect(payload.text).toContain('"legacy-unknown","unknown",,"unknown"');
 const captured=payload.text;ui.props.alerts=[...base,triggered('SYNTHETIC later','SYNTHETIC later notification',3)];ui.render();expect(send.mock.calls[0][0].text).toBe(captured);pending.resolve({ok:true});await result;expect(message(ui)).toBe('Alert history saved locally.');expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(ui.props.alerts[0]).toBe(a);expect(ui.props.alerts[1]).toBe(b);
});

it('coalesces retained duplicate clicks only while its exact export is in flight and permits retry after Cancel',async()=>{
 const first=deferred(),second=deferred(),send=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);bridge(send);const ui=setup([triggered('SYNTHETIC duplicate export','SYNTHETIC Alpha')]),action=history(ui).props.onClick;
 const one=action();expect(ui.button('Export alert history CSV').props.disabled).toBe(true);await action();expect(send).toHaveBeenCalledTimes(1);first.resolve({ok:false,error:{code:'CANCELLED',message:'SYNTHETIC raw cancellation'}});await one;expect(message(ui)).toBe('Alert history export cancelled.');expect(ui.button('Export alert history CSV').props.disabled).toBe(false);
 const two=ui.button('Export alert history CSV').props.onClick();expect(send).toHaveBeenCalledTimes(2);second.resolve({ok:true});await two;expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it('sets the busy identity before synchronous bridge reentry',async()=>{
 let action!:()=>Promise<void>,nested:Promise<void>|undefined;const send=vi.fn(()=>{nested=action();return Promise.resolve({ok:true});});bridge(send);const ui=setup([triggered('SYNTHETIC reentry','SYNTHETIC Alpha')]);action=history(ui).props.onClick;
 await action();await nested;expect(send).toHaveBeenCalledTimes(1);expect(message(ui)).toBe('Alert history saved locally.');expect(ui.button('Export alert history CSV').props.disabled).toBe(false);expect(ui.publish).not.toHaveBeenCalled();
});

it('late completion from a prior tab cannot replace feedback or clear a newer export busy identity',async()=>{
 const first=deferred(),second=deferred(),send=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);bridge(send);const ui=setup([triggered('SYNTHETIC tab export','SYNTHETIC Alpha')]),old=history(ui).props.onClick,one=old();
 ui.click('Alerts (1)');history(ui);const two=ui.button('Export alert history CSV').props.onClick();expect(send).toHaveBeenCalledTimes(2);first.resolve({ok:false,error:{code:'CANCELLED',message:'SYNTHETIC old cancellation'}});await one;expect(message(ui)).not.toContain('cancelled');expect(ui.button('Export alert history CSV').props.disabled).toBe(true);await old();expect(send).toHaveBeenCalledTimes(2);second.resolve({ok:true});await two;expect(message(ui)).toBe('Alert history saved locally.');
});

it('close and reopen permanently retires an old callback and hides its rejected promise feedback',async()=>{
 const pending=deferred(),send=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ok:true});bridge(send);const ui=setup([triggered('SYNTHETIC close export','SYNTHETIC Alpha')]),old=history(ui).props.onClick,result=old();
 ui.click('Close');ui.settle();ui.props.open=true;ui.settle();history(ui);await old();expect(send).toHaveBeenCalledTimes(1);pending.reject(new Error('SYNTHETIC stale export error'));await result;expect(message(ui)).not.toContain('SYNTHETIC stale export error');await ui.button('Export alert history CSV').props.onClick();expect(send).toHaveBeenCalledTimes(2);expect(message(ui)).toBe('Alert history saved locally.');expect(ui.publish).not.toHaveBeenCalled();
});

it('unmount prevents a pending export completion from changing retained message state',async()=>{
 const pending=deferred(),send=vi.fn(()=>pending.promise);bridge(send);const ui=setup([triggered('SYNTHETIC unmounted export','SYNTHETIC Alpha')]),result=history(ui).props.onClick();const before=message(ui);hooks.cleanups.forEach(cleanup=>cleanup?.());pending.resolve({ok:false,error:{code:'SYNTHETIC ERROR',message:'SYNTHETIC completion after unmount'}});await result;expect(message(ui)).toBe(before);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});

it('empty history and an unavailable desktop bridge never invoke export or publish',async()=>{
 const send=vi.fn();bridge(send);const ui=setup([alpha()]);const empty=history(ui);expect(empty.props.disabled).toBe(true);await empty.props.onClick();expect(message(ui)).toBe('No local alert triggers to export.');expect(send).not.toHaveBeenCalled();
 ui.props.alerts=[triggered('SYNTHETIC browser export','SYNTHETIC Alpha')];vi.stubGlobal('window',{});const absent=ui.button('Export alert history CSV');expect(absent.props.disabled).toBe(true);await absent.props.onClick();expect(message(ui)).toBe('History export needs the desktop app.');expect(send).not.toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});

it('a current bridge error reports plainly and releases only its own busy state for retry',async()=>{
 const send=vi.fn().mockResolvedValueOnce({ok:false,error:{code:'SYNTHETIC_IO',message:'SYNTHETIC disk unavailable'}}).mockResolvedValueOnce({ok:true});bridge(send);const ui=setup([triggered('SYNTHETIC failure export','SYNTHETIC Alpha')]);await history(ui).props.onClick();expect(message(ui)).toBe('SYNTHETIC disk unavailable');expect(ui.button('Export alert history CSV').props.disabled).toBe(false);await ui.button('Export alert history CSV').props.onClick();expect(send).toHaveBeenCalledTimes(2);expect(message(ui)).toBe('Alert history saved locally.');expect(ui.publish).not.toHaveBeenCalled();
});

it('invalid numeric trigger data is refused before the bridge without changing the complete saved collection',async()=>{
 const row=triggered('SYNTHETIC invalid export','SYNTHETIC Alpha'),bad={...row,history:[{...row.history[0],value:NaN}]},base=[bad],send=vi.fn();bridge(send);const ui=setup(base);await history(ui).props.onClick();expect(send).not.toHaveBeenCalled();expect(message(ui)).toMatch(/invalid number|invalid trigger/i);expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();expect(ui.button('Export alert history CSV').props.disabled).toBe(false);
});
