import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,type LocalAlert,type AlertNotification} from '../../src/domain/alerts';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual handlers, refs and effects on synthetic DOM focus targets. No browser,
// OS keyboard dispatch, renderer worker, native file dialog or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,pending:[] as (()=>void)[],cleanups:[] as (undefined|(()=>void))[]}));
vi.mock('react',async()=>({...await vi.importActual<any>('react'),
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(run:()=>void|(()=>void),deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||old.length!==deps.length||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.pending.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()||undefined;});}}
}));
const dataset=fixtureDataset('GME',5),now=1791979200;
function notification(id:string,alertId:string,at:number,sequence:number,mode:'ordinary'|'replay'='ordinary'):AlertNotification{return{id,alertId,name:'SYNTHETIC recorded '+id,message:'SYNTHETIC retained notification',value:10,at,sequence,barId:'SYNTHETIC bar '+sequence,mode,runId:mode==='ordinary'?'ordinary':'SYNTHETIC replay',local:true};}
function saved(id:string,name=id,history:AlertNotification[]=[]):LocalAlert{const last=history.at(-1),mode=last?.mode??'ordinary';return{...createLocalAlert({id,name:'SYNTHETIC '+name,message:'SYNTHETIC navigation only',instrumentId:dataset.instrument.id,sourceId:'close',mode,runId:mode==='ordinary'?'ordinary':'SYNTHETIC replay',createdAt:now,expiresAt:null,condition:{kind:'greater',value:1000},frequency:'every-time'}),history,...last?{lastTime:last.at,lastSequence:last.sequence,lastTriggeredAt:last.at,lastTriggeredBar:last.barId,lastValue:last.value}:{}};}
const initial=()=>[saved('c','C',[notification('c-old','c',now+1,1)]),saved('a','A',[notification('a-new','a',now+2,2)]),saved('b','B',[notification('b-tie','b',now+2,2,'replay')])];
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(node:any,match:(node:any)=>boolean):any[]{if(Array.isArray(node))return node.flatMap(child=>all(child,match));if(!node?.props)return[];return[...match(node)?[node]:[],...all(node.props.children,match)];}
function input(node:NodeTarget,extra:Record<string,unknown>={}){return{target:node,currentTarget:node,key:'',button:0,repeat:false,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,defaultPrevented:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra};}
interface FocusDocument {activeElement:NodeTarget|null;body:NodeTarget;addEventListener:ReturnType<typeof vi.fn>;removeEventListener:ReturnType<typeof vi.fn>;}
let focusDocument:FocusDocument;
class NodeTarget {
 isConnected=true;parent:NodeTarget|null=null;children:NodeTarget[]=[];props:any={};tag='div';afterFocus:(()=>void)|undefined;
 get offsetParent():NodeTarget|null{return this.isConnected?this.parent:null;}
 get tabIndex(){return this.props.tabIndex??(['button','input','select','textarea'].includes(this.tag)?0:-1);}
 getAttribute(name:string){return this.props[name]??null;}
 contains(value:unknown):boolean{return value===this||this.children.some(child=>child.contains(value));}
 closest(selector:string):NodeTarget|null{const match=selector.split(',').some(part=>{const s=part.trim();if(s===this.tag)return true;const role=/^\[role="([^"]+)"\]$/.exec(s);if(role)return this.props.role===role[1];if(s.startsWith('[contenteditable]'))return this.props.contentEditable===true;if(s==='[hidden]')return !!this.props.hidden;if(s==='[aria-hidden="true"]')return this.props['aria-hidden']==='true';if(s==='[inert]')return !!this.props.inert;return false;});return match?this:this.parent?.closest(selector)??null;}
 querySelectorAll(selector:string):NodeTarget[]{const nodes=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);if(selector==='*')return nodes;if(selector.includes('role="menuitem"'))return nodes.filter(node=>node.tag==='button'&&node.props.role==='menuitem'&&!node.props.disabled);if(selector==='button')return nodes.filter(node=>node.tag==='button');const label=/^\[aria-label="([^"]+)"\]$/.exec(selector);if(label)return nodes.filter(node=>node.props['aria-label']===label[1]);if(selector==='.alert-row[data-alert-id]')return nodes.filter(node=>node.props['data-alert-id']);return nodes.filter(node=>node.tabIndex===0&&!node.props.disabled&&!node.props.hidden);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 focus(){const previous=focusDocument.activeElement;if(previous!==this)previous?.props.onBlur?.({...input(previous),relatedTarget:this});focusDocument.activeElement=this;this.props.onFocus?.({...input(this),relatedTarget:previous});this.afterFocus?.();}
}
function ref(element:any,node:any){const value=element?.props.ref;if(typeof value==='function')value(node);else if(value)value.current=node;}
function setup(rows=initial()){
 let tree:any,refs=new Map<string,{element:any;node:NodeTarget}>();const nodes=new Map<string,NodeTarget>();let props:AlertDialogProps;
 const publish=vi.fn((next:LocalAlert[])=>{props.alerts=next;return true;}),request=vi.fn();
 props={open:true,onClose:vi.fn(()=>{props.open=false;}),alerts:rows,onAlertsChange:publish,onRequestObservation:request,instrument:dataset.instrument,now,events:[],externallyProcessed:true};
 const render=()=>{
  hooks.cursor=0;tree=AlertDialog(props);const next=new Map<string,{element:any;node:NodeTarget}>(),seen=new Set<string>();
  const mount=(element:any,parent:NodeTarget|null,path:string)=>{if(Array.isArray(element)){element.forEach((child,i)=>mount(child,parent,path+'.'+i));return;}if(!element?.props)return;if(typeof element.type!=='string'){mount(element.props.children,parent,path+'.fragment');return;}
   const key=element.props['data-alert-id']?'manager:'+element.props['data-alert-id']:element.props['data-alert-history-id']?'history:'+element.props['data-alert-history-id']:path;
   let node=nodes.get(key);if(!node){node=new NodeTarget();nodes.set(key,node);}node.props=element.props;node.tag=element.type;node.parent=parent;node.children=[];node.isConnected=true;if(parent)parent.children.push(node);seen.add(key);next.set(key,{element,node});mount(element.props.children,node,key+'.children');
  };
  mount(tree,null,'root');for(const [key,old]of refs){if(!seen.has(key)){old.node.isConnected=false;if(focusDocument.activeElement===old.node)focusDocument.activeElement=focusDocument.body;}if(next.get(key)?.element.props.ref!==old.element.props.ref)ref(old.element,null);}
  for(const [key,value]of next)if(refs.get(key)?.element.props.ref!==value.element.props.ref)ref(value.element,value.node);refs=next;return tree;
 };
 const find=(match:(node:any)=>boolean)=>{const value=all(render(),match)[0];if(!value)throw Error('SYNTHETIC list test target absent');return value;};
 const field=(label:string)=>find(node=>node.props['aria-label']===label),button=(label:string)=>find(node=>node.type==='button'&&text(node)===label);
 const row=(id:string,history=false)=>find(node=>node.props[history?'data-alert-history-id':'data-alert-id']===id);
 const dom=(id:string,history=false)=>{render();return nodes.get((history?'history:':'manager:')+id)!;};
 const key=(id:string,key:string,extra:Record<string,unknown>={},history=false)=>{const element=row(id,history),node=dom(id,history),event=input(node,{key,...extra});element.props.onKeyDown(event);return event;};
 const settle=()=>{for(let i=0;i<12;i++){render();const jobs=hooks.pending.splice(0);if(!jobs.length)return;jobs.forEach(run=>run());}throw Error('SYNTHETIC list effects exceeded settlement');};
 settle();return{props,publish,request,render,field,button,row,dom,key,settle,words:()=>text(render()),history:()=>{button('History ('+props.alerts.reduce((sum,row)=>sum+row.history.length,0)+')').props.onClick();render();},change:(label:string,value:string)=>field(label).props.onChange({target:{value}}),rows:(history=false)=>all(render(),node=>node.props[history?'data-alert-history-id':'data-alert-id']!==undefined)};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.pending=[];hooks.cleanups=[];const body=new NodeTarget();focusDocument={activeElement:body,body,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('document',focusDocument);});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup?.());vi.unstubAllGlobals();vi.restoreAllMocks();});

it('uses displayed manager order for four arrows and Space, clamps ends and publishes nothing',()=>{
 const ui=setup(),before=structuredClone(ui.props.alerts);ui.dom('c').focus();ui.key('c','ArrowDown');expect(document.activeElement).toBe(ui.dom('a'));ui.key('a','ArrowRight');expect(document.activeElement).toBe(ui.dom('b'));ui.key('b','ArrowDown');expect(document.activeElement).toBe(ui.dom('b'));ui.key('b','ArrowLeft');expect(document.activeElement).toBe(ui.dom('a'));ui.key('a','ArrowUp');expect(document.activeElement).toBe(ui.dom('c'));ui.key('c','ArrowUp');expect(document.activeElement).toBe(ui.dom('c'));ui.key('c',' ');expect(document.activeElement).toBe(ui.dom('a'));ui.key('a',' ',{shiftKey:true});expect(document.activeElement).toBe(ui.dom('c'));expect(ui.props.alerts).toEqual(before);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});
it('uses current filtered/sorted order rather than saved source ordinals',()=>{
 const ui=setup();ui.change('Sort alerts by','name');expect(ui.rows().map(row=>row.props['data-alert-id'])).toEqual(['a','b','c']);ui.dom('a').focus();ui.key('a','ArrowDown');expect(document.activeElement).toBe(ui.dom('b'));ui.change('Search alerts','SYNTHETIC B');expect(ui.rows()).toHaveLength(1);ui.dom('b').focus();const event=ui.key('b','ArrowDown');expect(document.activeElement).toBe(ui.dom('b'));expect(event.preventDefault).toHaveBeenCalledTimes(1);expect(event.stopPropagation).toHaveBeenCalledTimes(1);
});
it('navigates full History in literal descending time/sequence/stable tie order with recorded identities',()=>{
 const ui=setup();ui.change('Search alerts','SYNTHETIC C');ui.change('Sort alerts by','name');ui.history();expect(ui.rows(true).map(row=>row.key)).toEqual(['a-new','b-tie','c-old']);const first=ui.row('a-new',true);expect(first.type).toBe('tr');expect(first.props.tabIndex).toBe(0);expect(first.props['aria-label']).toContain('SYNTHETIC recorded a-new');expect(ui.row('b-tie',true).props['aria-label']).toContain('replay');ui.dom('a-new',true).focus();ui.key('a-new','ArrowDown',{},true);expect(document.activeElement).toBe(ui.dom('b-tie',true));ui.key('b-tie',' ',{},true);expect(document.activeElement).toBe(ui.dom('c-old',true));ui.key('c-old',' ',{shiftKey:true},true);expect(document.activeElement).toBe(ui.dom('b-tie',true));expect(ui.publish).not.toHaveBeenCalled();
});
it.each([false,true])('consumes repeated Space without moving; permits repeated arrows (History=%s)',history=>{
 const ui=setup();if(history)ui.history();const id=history?'a-new':'c',next=history?'b-tie':'a';ui.dom(id,history).focus();const event=ui.key(id,' ',{repeat:true},history);expect(document.activeElement).toBe(ui.dom(id,history));expect(event.preventDefault).toHaveBeenCalledTimes(1);expect(event.stopPropagation).toHaveBeenCalledTimes(1);ui.key(id,'ArrowDown',{repeat:true},history);expect(document.activeElement).toBe(ui.dom(next,history));
});
it.each([{ctrlKey:true},{metaKey:true},{altKey:true},{defaultPrevented:true},{nativeEvent:{isComposing:true}}])('ignores modified/prevented/composing arrow without focus or event consumption (%j)',extra=>{
 const ui=setup();ui.dom('c').focus();const event=ui.key('c','ArrowDown',extra);expect(document.activeElement).toBe(ui.dom('c'));expect(event.preventDefault).not.toHaveBeenCalled();expect(event.stopPropagation).not.toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});
it('extends manager selection with ShiftArrow while keeping History ShiftArrow unsupported',()=>{
 const ui=setup(),before=ui.props.alerts,snapshot=structuredClone(before);ui.dom('c').focus();const manager=ui.key('c','ArrowDown',{shiftKey:true});
 expect(document.activeElement).toBe(ui.dom('a'));expect(manager.preventDefault).toHaveBeenCalledTimes(1);expect(manager.stopPropagation).toHaveBeenCalledTimes(1);
 expect(ui.rows().filter(row=>all(row,control=>control.type==='input'&&control.props.type==='checkbox'&&control.props.checked===true).length===1).map(row=>row.props['data-alert-id'])).toEqual(['c','a']);
 ui.history();const origin=ui.dom('a-new',true);origin.focus();const history=ui.key('a-new','ArrowDown',{shiftKey:true},true);
 expect(document.activeElement).toBe(origin);expect(history.preventDefault).not.toHaveBeenCalled();expect(history.stopPropagation).not.toHaveBeenCalled();
 expect(ui.props.alerts).toBe(before);expect(ui.props.alerts).toEqual(snapshot);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});
it('does not intercept nested controls or events whose row does not own activeElement',()=>{
 const ui=setup(),row=ui.row('c'),node=ui.dom('c'),button=new NodeTarget();button.tag='button';button.parent=node;node.focus();const nested=input(node,{key:'ArrowDown',target:button});row.props.onKeyDown(nested);expect(nested.preventDefault).not.toHaveBeenCalled();ui.dom('a').focus();const staleOrigin=input(node,{key:'ArrowDown'});row.props.onKeyDown(staleOrigin);expect(document.activeElement).toBe(ui.dom('a'));expect(staleOrigin.preventDefault).not.toHaveBeenCalled();
});
it('retires old callbacks for same-order sort intent and observed hide/reappear',()=>{
 const ui=setup(),old=ui.row('c').props.onKeyDown,node=ui.dom('c');node.focus();ui.change('Sort alerts by','original');ui.render();const first=input(node,{key:'ArrowDown'});old(first);expect(first.preventDefault).not.toHaveBeenCalled();expect(document.activeElement).toBe(node);ui.change('Search alerts','SYNTHETIC A');ui.render();ui.change('Search alerts','');ui.dom('c').focus();old(input(node,{key:'ArrowDown'}));expect(document.activeElement).toBe(ui.dom('c'));ui.key('c','ArrowDown');expect(document.activeElement).toBe(ui.dom('a'));
});
it('allows history-only/status-only unchanged manager membership, but retires revision replacements',()=>{
 const ui=setup(),old=ui.row('c').props.onKeyDown,node=ui.dom('c');ui.props.alerts=[{...ui.props.alerts[0],status:'paused',missedDataGaps:4},...ui.props.alerts.slice(1)];ui.render();node.focus();old(input(node,{key:'ArrowDown'}));expect(document.activeElement).toBe(ui.dom('a'));ui.props.alerts=[{...ui.props.alerts[0],revision:2},...ui.props.alerts.slice(1)];ui.render();node.focus();old(input(node,{key:'ArrowDown'}));expect(document.activeElement).toBe(node);
});
it('suspends list navigation while a menu or exact Delete confirmation is current',()=>{
 const ui=setup(),node=ui.dom('c');
 ui.field('More alert actions for SYNTHETIC C').props.onClick(input(node));ui.dom('c').focus();expect(ui.key('c','ArrowDown').preventDefault).not.toHaveBeenCalled();expect(document.activeElement).toBe(ui.dom('c'));const menu=ui.render();all(menu,n=>n.props.role==='menu')[0].props.onKeyDown(input(node,{key:'Escape'}));
 const row=ui.row('c'),remove=all(row,n=>n.type==='button'&&text(n)==='Delete')[0];remove.props.onClick();ui.dom('c').focus();expect(ui.key('c',' ').preventDefault).not.toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});
it('old History handler retires on append while same recorded clone/parent edit retains navigation',()=>{
 const ui=setup();ui.history();const old=ui.row('a-new',true).props.onKeyDown,node=ui.dom('a-new',true);ui.props.alerts=ui.props.alerts.map(row=>({...row,definition:{...row.definition,name:row.definition.name+' edited'},history:row.history.map(item=>({...item}))}));ui.render();node.focus();old(input(node,{key:'ArrowDown'}));expect(document.activeElement).toBe(ui.dom('b-tie',true));ui.props.alerts=[{...ui.props.alerts[0],history:[...ui.props.alerts[0].history,notification('c-new','c',now+3,3)]},...ui.props.alerts.slice(1)];ui.render();node.focus();old(input(node,{key:'ArrowDown'}));expect(document.activeElement).toBe(node);ui.key('a-new','ArrowUp',{},true);expect(document.activeElement).toBe(ui.dom('c-new',true));
});
it('focus callback replacement leaves the newer view/focus untouched and emits no state mutation',()=>{
 const ui=setup();ui.dom('c').focus();const target=ui.dom('a');target.afterFocus=()=>{ui.props.open=false;ui.settle();ui.props.open=true;ui.settle();ui.field('Search alerts');};ui.key('c','ArrowDown');expect(ui.props.open).toBe(true);expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();expect(all(ui.render(),node=>node.props.role==='menu')).toHaveLength(0);
});
it('a removed focused row falls back once to Search, while moved focus is never stolen',()=>{
 const ui=setup();ui.dom('c').focus();ui.props.alerts=ui.props.alerts.slice(1);ui.settle();expect(document.activeElement?.getAttribute('aria-label')).toBe('Search alerts');
 ui.dom('a').focus();ui.props.alerts=ui.props.alerts.slice(1);const moved=new NodeTarget();moved.focus();ui.settle();expect(document.activeElement).toBe(moved);
});
it('duplicate identities disable navigation without merging rows or changing their saved values',()=>{
 const rows=initial();rows[1]={...rows[1],definition:{...rows[1].definition,id:'c'}};const ui=setup(rows),before=structuredClone(rows);expect(ui.rows()).toHaveLength(3);expect(ui.words()).toContain('identities are ambiguous');const node=ui.dom('c');node.focus();expect(ui.key('c','ArrowDown').preventDefault).not.toHaveBeenCalled();expect(ui.props.alerts).toEqual(before);expect(ui.publish).not.toHaveBeenCalled();
});
it('History navigation and append preserve one in-flight CSV request and its captured text',async()=>{
 let resolve!:(value:any)=>void;const exportData=vi.fn((_payload:{text:string})=>new Promise<any>(done=>{resolve=done;}));vi.stubGlobal('window',{lv:{exportData}});const ui=setup();ui.history();ui.button('Export alert history CSV').props.onClick();const text=exportData.mock.calls[0][0].text;ui.dom('a-new',true).focus();ui.key('a-new','ArrowDown',{},true);ui.props.alerts=[{...ui.props.alerts[0],history:[...ui.props.alerts[0].history,notification('c-new','c',now+3,3)]},...ui.props.alerts.slice(1)];ui.render();expect(ui.button('Export alert history CSV').props.disabled).toBe(true);expect(exportData).toHaveBeenCalledTimes(1);expect(exportData.mock.calls[0][0].text).toBe(text);resolve({ok:true,value:{}});for(let i=0;i<8;i++)await Promise.resolve();expect(ui.button('Export alert history CSV').props.disabled).toBe(false);expect(ui.words()).toContain('Alert history saved locally.');expect(ui.publish).not.toHaveBeenCalled();
});
