import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {createLocalAlert,type LocalAlert} from '../../src/domain/alerts';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component handlers/effects with controlled hook and focus targets.
// These checks do not dispatch browser events or establish executable UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,pending:[] as (()=>void)[],cleanups:[] as (undefined|(()=>void))[]}));
vi.mock('react',async()=>({
 ...await vi.importActual<any>('react'),
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(run:()=>void|(()=>void),deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||old.length!==deps.length||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.pending.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()||undefined;});}}
}));
const dataset=fixtureDataset('GME',5),now=1791979200;
function saved(id:string):LocalAlert{return createLocalAlert({id,name:'SYNTHETIC '+id,message:'SYNTHETIC row interaction',instrumentId:dataset.instrument.id,sourceId:'close',mode:'ordinary',runId:'ordinary',createdAt:now,expiresAt:null,condition:{kind:'greater',value:1000},frequency:'every-time'});}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(node:any,predicate:(node:any)=>boolean):any[]{if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));if(!node?.props)return[];return[...predicate(node)?[node]:[],...all(node.props.children,predicate)];}
const listeners=new Map<string,Set<(event:any)=>void>>();
class FocusTarget {
 isConnected=true;offsetParent:object|null={};parent:FocusTarget|null=null;children:FocusTarget[]=[];role='';tag='ARTICLE';tabIndex=0;disabled=false;label='';onFocus:(()=>void)|undefined;
 contains(value:unknown):boolean{return value===this||value instanceof FocusTarget&&!!this.children.some(child=>child.contains(value));}
 closest(selector:string):FocusTarget|null {if(selector==='[hidden],[aria-hidden="true"]')return null;if(selector.split(',').some(part=>part.trim()===this.tag.toLowerCase()||this.role&&part.includes(`[role="${this.role}"]`)))return this;return this.parent?.closest(selector)??null;}
 focus(){(document as any).activeElement=this;this.onFocus?.();}
 querySelectorAll(selector:string):FocusTarget[]{const descendants=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);if(selector==='*')return descendants;if(selector.includes('role="menuitem"'))return descendants.filter(node=>node.tag==='BUTTON'&&node.role==='menuitem'&&!node.disabled);if(selector==='button')return descendants.filter(node=>node.tag==='BUTTON');if(selector.startsWith('[aria-label='))return descendants.filter(node=>selector===`[aria-label="${node.label}"]`);if(selector==='.alert-row[data-alert-id]')return[];return descendants.filter(node=>!node.disabled&&node.tabIndex!==-1);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 getAttribute(name:string){return name==='role'?this.role:null;}
 add(...children:FocusTarget[]){for(const child of children){child.parent=this;this.children.push(child);}return this;}
}
function event(target=new FocusTarget(),extra:Record<string,unknown>={}){return{target,currentTarget:target,button:0,key:'',shiftKey:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra};}
function bindRef(element:any,node:any){const ref=element.props.ref;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}
function setup(initial=[saved('A'),saved('B')]){
 let props:AlertDialogProps;const request=vi.fn();
 const publish=vi.fn((next:LocalAlert[],base?:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;});
 props={open:true,onClose:vi.fn(()=>{props.open=false;}),alerts:initial,onAlertsChange:publish,instrument:dataset.instrument,now,events:[],externallyProcessed:true,onRequestObservation:request};
 const render=()=>{hooks.cursor=0;return AlertDialog(props);};
 const find=(predicate:(node:any)=>boolean,tree=render())=>{const value=all(tree,predicate)[0];if(!value)throw Error('SYNTHETIC row test target absent');return value;};
 const row=(id:string)=>find(node=>node.type==='article'&&node.props['data-alert-id']===id);
 const button=(label:string,tree=render())=>find(node=>node.type==='button'&&text(node)===label,tree);
 const menu=()=>find(node=>node.props.role==='menu');
 const flush=()=>{for(let n=0;n<8;n++){render();const work=hooks.pending.splice(0);if(!work.length)return;work.forEach(run=>run());}throw Error('SYNTHETIC effect settlement exceeded');};
 const more=(id:string,trigger=new FocusTarget())=>find(node=>node.props['aria-label']===`More alert actions for SYNTHETIC ${id}`).props.onClick(event(trigger));
 const field=(label:string)=>find(node=>node.props['aria-label']===label);
 flush();return{props,publish,request,render,find,row,button,menu,flush,more,field,words:()=>text(render())};
}
function attachedMenu(ui:ReturnType<typeof setup>,trigger=new FocusTarget()){
 const root=new FocusTarget(),search=new FocusTarget();search.tag='INPUT';search.label='Search alerts';root.add(search,trigger);
 bindRef(ui.find(node=>node.props.role==='dialog'),root);bindRef(ui.field('Search alerts'),search);
 trigger.focus();ui.more('A',trigger);const view=ui.menu(),menu=new FocusTarget();menu.role='menu';menu.tabIndex=-1;
 const items=all(view,node=>node.props.role==='menuitem').map(node=>{const value=new FocusTarget();value.tag='BUTTON';value.role='menuitem';value.tabIndex=-1;value.disabled=!!node.props.disabled;return value;});
 menu.add(...items);root.add(menu);bindRef(view,menu);ui.flush();return{root,search,trigger,menu,items,view};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.pending=[];hooks.cleanups=[];listeners.clear();vi.stubGlobal('document',{activeElement:null,body:new FocusTarget(),addEventListener(name:string,listener:(event:any)=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(listener);},removeEventListener(name:string,listener:(event:any)=>void){listeners.get(name)?.delete(listener);}});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup?.());vi.restoreAllMocks();vi.unstubAllGlobals();});

it('keeps inline actions, focuses single-click background, and opens saved editing only on double-click',()=>{
 const ui=setup(),base=ui.props.alerts,row=ui.row('A'),target=new FocusTarget();expect(all(row,node=>node.type==='button').map(text)).toEqual(['Edit','Pause','Delete','More']);
 // A positive pointer case must mount the current row, as the real renderer does.
 bindRef(ui.find(node=>node.props.role==='dialog'),new FocusTarget().add(target));bindRef(row,target);
 row.props.onClick(event(target));expect(document.activeElement).toBe(target);expect(all(ui.render(),node=>node.type==='form')).toHaveLength(0);
 row.props.onDoubleClick(event(target));expect(ui.field('Alert name').props.value).toBe('SYNTHETIC A');expect(ui.publish).not.toHaveBeenCalled();ui.button('Cancel').props.onClick();expect(ui.props.alerts).toBe(base);
});
it.each(['ContextMenu','F10'])('opens the row menu from %s with the current row as trigger',key=>{
 const ui=setup(),target=new FocusTarget(),row=ui.row('A'),input=event(target,{key,shiftKey:key==='F10'});
 bindRef(ui.find(node=>node.props.role==='dialog'),new FocusTarget().add(target));bindRef(row,target);target.onFocus=()=>row.props.onFocus(event(target));target.focus();row.props.onKeyDown(input);
 expect(input.preventDefault).toHaveBeenCalled();expect(ui.menu().props['aria-label']).toBe('Actions for SYNTHETIC A');expect(all(ui.menu(),node=>node.props.role==='menuitem').map(text)).toEqual(['Edit','Pause','Delete']);expect(ui.publish).not.toHaveBeenCalled();
});
it('right-click opens without changing definitions and a menu Pause publishes the entire latest array',()=>{
 const ui=setup(),base=ui.props.alerts,input=event();ui.row('A').props.onContextMenu(input);expect(input.preventDefault).toHaveBeenCalled();expect(ui.props.alerts).toBe(base);
 ui.button('Pause',ui.menu()).props.onClick();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.publish.mock.calls[0][1]).toBe(base);expect(ui.props.alerts[0].status).toBe('paused');expect(ui.props.alerts[1]).toBe(base[1]);expect(ui.request).not.toHaveBeenCalled();
});
it('menu Edit and Delete use existing draft and confirmation routes',()=>{
 const ui=setup(),base=ui.props.alerts;ui.more('A');ui.button('Edit',ui.menu()).props.onClick();expect(ui.field('Alert name').props.value).toBe(base[0].definition.name);ui.button('Cancel').props.onClick();
 ui.more('A');ui.button('Delete',ui.menu()).props.onClick();expect(all(ui.render(),node=>node.props.role==='menu')).toHaveLength(0);expect(ui.words()).toContain('Delete this alert and its local trigger history?');ui.button('Cancel').props.onClick();expect(ui.props.alerts).toBe(base);expect(ui.publish).not.toHaveBeenCalled();
});
it('focuses Edit, wraps enabled menu items and leaves Enter activation to native buttons once',()=>{
 const ui=setup(),view=attachedMenu(ui);expect(document.activeElement).toBe(view.items[0]);
 const key=(value:string)=>ui.menu().props.onKeyDown(event(view.items[0],{key:value}));key('ArrowUp');expect(document.activeElement).toBe(view.items[2]);key('ArrowDown');expect(document.activeElement).toBe(view.items[0]);key('End');expect(document.activeElement).toBe(view.items[2]);key('Home');expect(document.activeElement).toBe(view.items[0]);
 const enter=event(view.items[0],{key:'Enter'});ui.menu().props.onKeyDown(enter);expect(enter.preventDefault).not.toHaveBeenCalled();expect(enter.stopPropagation).toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});
it('skips disabled stopped-state items and prevents composing Enter from triggering native activation',()=>{
 const ui=setup([{...saved('A'),status:'stopped'},saved('B')]),view=attachedMenu(ui);expect(view.items[1].disabled).toBe(true);
 ui.menu().props.onKeyDown(event(view.items[0],{key:'ArrowDown'}));expect(document.activeElement).toBe(view.items[2]);
 const ime=event(view.items[2],{key:'Enter',nativeEvent:{isComposing:true}});ui.menu().props.onKeyDown(ime);expect(ime.preventDefault).toHaveBeenCalled();expect(ime.stopPropagation).toHaveBeenCalled();expect(ui.publish).not.toHaveBeenCalled();
});
it('Escape removes only its menu, unregisters outside listener and restores its connected trigger',()=>{
 const ui=setup(),gestureListeners=listeners.get('pointerdown')?.size??0;expect(gestureListeners).toBe(1);ui.button('Delete',ui.row('B')).props.onClick();const view=attachedMenu(ui);expect(listeners.get('pointerdown')?.size).toBe(gestureListeners+1);
 ui.menu().props.onKeyDown(event(view.items[0],{key:'Escape'}));view.menu.isConnected=false;view.items.forEach(item=>item.isConnected=false);ui.flush();
 expect(document.activeElement).toBe(view.trigger);expect(all(ui.render(),node=>node.props.role==='menu')).toHaveLength(0);expect(listeners.get('pointerdown')?.size).toBe(gestureListeners);expect(ui.words()).toContain('Delete this alert');expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('Tab uses the invoking trigger as origin and excludes disappearing menu items',()=>{
 const ui=setup(),view=attachedMenu(ui),after=new FocusTarget();after.tag='BUTTON';view.root.add(after);
 ui.menu().props.onKeyDown(event(view.items[0],{key:'Tab'}));expect(document.activeElement).toBe(after);expect(all(ui.render(),node=>node.props.role==='menu')).toHaveLength(0);expect(ui.publish).not.toHaveBeenCalled();
});
it('outside pointer dismissal neither prevents its default nor steals a moved focus',()=>{
 const ui=setup(),view=attachedMenu(ui),outside=new FocusTarget();outside.focus();const input=event(outside);
 for(const listener of listeners.get('pointerdown')??[])listener(input);ui.flush();expect(document.activeElement).toBe(outside);expect(input.preventDefault).not.toHaveBeenCalled();expect(all(ui.render(),node=>node.props.role==='menu')).toHaveLength(0);expect(ui.publish).not.toHaveBeenCalled();expect(view.trigger).not.toBe(document.activeElement);
});
it('accepted deletion moves disconnected confirmation focus to Search without clearing a new opening',()=>{
 const ui=setup(),root=new FocusTarget(),search=new FocusTarget(),cancel=new FocusTarget();search.tag='INPUT';search.label='Search alerts';cancel.tag='BUTTON';root.add(search,cancel);bindRef(ui.find(node=>node.props.role==='dialog'),root);bindRef(ui.field('Search alerts'),search);
 ui.button('Delete',ui.row('A')).props.onClick();cancel.focus();ui.button('Confirm delete').props.onClick();cancel.isConnected=false;(document as any).activeElement=document.body;ui.flush();expect(document.activeElement).toBe(search);expect(ui.props.alerts.map(alert=>alert.definition.id)).toEqual(['B']);expect(ui.publish).toHaveBeenCalledTimes(1);
});
