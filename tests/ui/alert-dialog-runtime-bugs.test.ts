import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {setup,focusDocument,ModelNode,mountControlledComponent,all,text,invoke,input,type ModelElement} from '../helpers/alert-dialog-harness';
import {AlertDeliveryHost} from '../../src/ui/alert-delivery-host';
import {createLocalAlert,processAlertEvent,type LocalAlert} from '../../src/domain/alerts';

// Packaged-flow findings F4, F5, F6 and the Alerts part of F1 (iface2 mapping).
// Actual AlertDialog / AlertDeliveryHost callbacks under the shared controlled hook and node model.
// A keydown reaches the dialog only while focus is inside it (bubbling model). No browser DOM,
// GUI or package claim.

function escapeKey(ui:ReturnType<typeof setup>){
 const control=ui.find(node=>node.props.role==='dialog'),dialog=ui.nodeFor(control);
 if(!dialog.contains(focusDocument.activeElement))return false;// keydown on body never reaches the dialog
 invoke(control.props.onKeyDown,input(dialog,{key:'Escape',target:focusDocument.activeElement}));ui.settle();return true;
}
const dialogNode=(ui:ReturnType<typeof setup>)=>ui.nodeFor(ui.find(node=>node.props.role==='dialog'));

it('F4: Escape on the Create tab discards the draft and keeps focus inside, so a second Escape closes the dialog',()=>{
 const ui=setup();ui.callButton('Create alert');ui.change('Alert name','SYNTHETIC draft');ui.nodeFor(ui.field('Alert name')).focus();
 expect(escapeKey(ui)).toBe(true);
 expect(ui.text()).toContain('Alert edit cancelled. Saved alerts are unchanged.');expect(ui.publish).not.toHaveBeenCalled();
 // Boolean comparisons: the model nodes are not printable DOM elements in a failure message.
 expect(focusDocument.activeElement===focusDocument.body).toBe(false);expect(dialogNode(ui).contains(focusDocument.activeElement)).toBe(true);
 expect(focusDocument.activeElement===ui.nodeFor(ui.field('Search alerts'))).toBe(true);
 expect(escapeKey(ui)).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
});
it('F4: the Create footer Cancel also leaves keyboard focus inside the dialog',()=>{
 const ui=setup();ui.callButton('Create alert');ui.callButton('Cancel');
 expect(dialogNode(ui).contains(focusDocument.activeElement)).toBe(true);expect(escapeKey(ui)).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
});
it('F4: a cancelled Create draft does not steal focus the user already moved elsewhere in the dialog',()=>{
 const ui=setup();ui.callButton('Create alert');ui.nodeFor(ui.field('Alert name')).focus();
 const control=ui.find(node=>node.props.role==='dialog'),dialog=ui.nodeFor(control);
 // A focus move during the keydown (before the effect) wins over the fallback.
 invoke(control.props.onKeyDown,input(dialog,{key:'Escape',target:focusDocument.activeElement}));const close=ui.nodeFor(ui.button('×'));close.focus();ui.settle();
 expect(focusDocument.activeElement===close).toBe(true);
});

/** React re-renders (and commits new handlers) only when a state value actually changed. */
function committedTree(ui:ReturnType<typeof setup>){
 let tree=ui.settle() as unknown;
 return {
  get tree(){return tree;},
  act(work:()=>void){const before=ui.owner.cells.slice();work();if(ui.owner.cells.length!==before.length||ui.owner.cells.some((cell,index)=>!Object.is(cell,before[index])))tree=ui.settle();},
  control(name:string,id?:string){const root=id?all(tree,node=>node.type==='article'&&node.props['data-alert-id']===id)[0]:tree;const found=all(root,node=>node.type==='button'&&text(node)===name);expect(found).toHaveLength(1);return found[0] as ModelElement;},
 };
}
it('F5: a row click right after the Alerts tab republishes the list is accepted (no settle wait)',()=>{
 const ui=setup(),view=committedTree(ui);
 view.act(()=>invoke(view.control('Alerts (3)').props.onClick,input(ui.nodeFor(view.control('Alerts (3)')))));
 view.act(()=>invoke(view.control('Pause','a').props.onClick));ui.settle();
 expect(ui.text()).not.toContain('This alert list changed');
 expect(ui.publish).toHaveBeenCalledOnce();expect(ui.props.alerts.find(row=>row.definition.id==='a')!.status).toBe('paused');
});
it('F5: a control retained from before a genuine list change is still refused',()=>{
 const ui=setup(),view=committedTree(ui),stale=view.control('Pause','a');
 ui.props.alerts=ui.props.alerts.filter(row=>row.definition.id!=='c');view.act(()=>{});ui.settle();
 invoke(stale.props.onClick);ui.settle();
 expect(ui.text()).toContain('This alert list changed. Use its current controls.');expect(ui.publish).not.toHaveBeenCalled();
 expect(ui.props.alerts.find(row=>row.definition.id==='a')!.status).toBe('active');
});
it('F1 (Alerts): closing the alert dialog returns focus to its header opener',()=>{
 const opener=new ModelNode();opener.tag='button';opener.props={'aria-label':'Alerts'};focusDocument.body.children.push(opener);opener.parent=focusDocument.body;focusDocument.activeElement=opener;
 const ui=setup();expect(dialogNode(ui).contains(focusDocument.activeElement)).toBe(true);
 ui.callButton('×');expect(ui.props.onClose).toHaveBeenCalledOnce();expect(focusDocument.activeElement===opener).toBe(true);
});

const fired=(id:string):LocalAlert=>{
 const alert=createLocalAlert({id,instrumentId:'SYNTHETIC:GME',sourceId:'close',name:'SYNTHETIC '+id,message:'SYNTHETIC crossed',condition:{kind:'greater',value:10},frequency:'every-time',createdAt:1000,expiresAt:null,mode:'ordinary',runId:'ordinary'});
 const result=processAlertEvent(alert,{instrumentId:'SYNTHETIC:GME',sourceId:'close',value:11,time:1001,availableAt:1001,sequence:1,barId:'SYNTHETIC bar 1',barClosed:false,feedState:'ready',mode:'ordinary',runId:'ordinary'});
 expect(result.notification).not.toBeNull();return result.alert;
};
it('F6: alert popups sit below the modal shade (never over a dialog footer Close button) and above every other layer',()=>{
 const base=createLocalAlert({id:'p',instrumentId:'SYNTHETIC:GME',sourceId:'close',name:'SYNTHETIC p',message:'SYNTHETIC crossed',condition:{kind:'greater',value:10},frequency:'every-time',createdAt:1000,expiresAt:null,mode:'ordinary',runId:'ordinary'});
 const props={alerts:[base],soundPlayer:{play:vi.fn(async()=>undefined)},desktopPort:null};
 const view=mountControlledComponent(()=>AlertDeliveryHost(props));view.settle();props.alerts=[fired('p')];const tree=view.settle();
 const layer=all(tree,node=>node.type==='section'&&node.props['aria-label']==='Alert notifications')[0];expect(all(layer,node=>node.type==='article')).toHaveLength(1);
 const css=readFileSync('src/ui/styles.css','utf8')+readFileSync('src/ui/components.css','utf8'),shade=Number(/\.modal-shade\{[^}]*z-index:(\d+)/.exec(css)![1]);
 const others=[...css.matchAll(/z-index:(\d+)/g)].map(match=>Number(match[1])).filter(value=>value<shade);
 const z=(layer.props.style as {zIndex:number}).zIndex;
 expect(z).toBeLessThan(shade);expect(z).toBeGreaterThan(Math.max(...others));
});
