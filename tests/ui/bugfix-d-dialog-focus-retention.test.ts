import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {dispatchDocument,focusDocument,input,invoke,ModelNode,mountControlledComponent,text,type ModelElement} from '../helpers/alert-dialog-harness';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {Modal} from '../../src/ui/Modal';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInstanceLabels} from '../../src/ui/indicator-dialog-model';
import type {ChartController} from '../../src/chart/adapter';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';

// F10 and the blocking-state half of F9: when the focused control of an open dialog goes away
// (row Remove, an editor closing, a control disabled, an inert ancestor) Chromium moves focus to the body, where the
// dialog's Escape and Tab handlers never see a key. Actual Modal / IndicatorDialog handlers under the shared controlled
// hook and node model. A key reaches the dialog only while focus is inside it (bubbling model); a removed focused node
// leaves focus on the body (the harness), and MutationObserver delivery is driven by the test. No browser DOM, focus
// engine, GUI or package claim.

const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
/** The DOM changed: deliver observer callbacks, then run the deferred focus checks. */
function mutate(){for(const entry of observers)if(entry.live)entry.callback();vi.advanceTimersByTime(0);}
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});

type View=ReturnType<typeof mountControlledComponent>;
const dialogElement=(view:View)=>view.find(node=>node.props.role==='dialog');
const dialogNode=(view:View)=>view.nodeFor(dialogElement(view));
const isActive=(node:ModelNode)=>focusDocument.activeElement===node;
/** A key press at the focused element; it reaches the dialog's handler only if focus is inside the dialog. */
function press(view:View,key:string,shiftKey=false){
 const element=dialogElement(view),dialog=view.nodeFor(element),target=focusDocument.activeElement;
 if(!target||!dialog.contains(target))return false;
 invoke(element.props.onKeyDown,input(target,{key,shiftKey,target,currentTarget:dialog}));view.settle();return true;
}

function sma(id:string,length:number):IndicatorInstanceView{
 const base=factoryIndicatorDefault('sma');
 return {id,kind:'sma',...base,inputs:{...base.inputs,length},visible:true,rendererId:'native-'+id,diagnostics:[],policies:[],series:[{id:'sma',label:'SMA'}],paneId:'price',informationBars:500,latestInformationTime:1,presentationDiagnostics:[]} as unknown as IndicatorInstanceView;
}
function keyedRows(node:any):any{
 if(Array.isArray(node))return node.map(keyedRows);
 if(!node||typeof node!=='object'||!node.props)return node;
 const extra=node.key!=null&&String(node.props.className??'').includes('instance-row')?{'data-alert-id':'indicator-row:'+node.key}:{};
 return node.props.children===undefined?React.cloneElement(node,extra):React.cloneElement(node,extra,keyedRows(node.props.children));
}
function indicators(initial:IndicatorInstanceView[]){
 let live=initial.slice();
 const chart={indicators:{catalog:['sma'],add:vi.fn(),list:()=>live,update:vi.fn(),remove:vi.fn((id:string)=>{live=live.filter(row=>row.id!==id);}),inputSchema:()=>[]},getCalculationBars:()=>new Array(500)} as unknown as ChartController;
 const props={chart,instances:live,library:createIndicatorLibrary(),ownerToken:{},onLibraryChange:vi.fn(()=>true),onClose:vi.fn(),onChange:vi.fn(()=>{props.instances=live;return true;})};
 // The parent renders IndicatorDialog, whose root is the shared Modal (expanded here so its DOM and hooks are real).
 // React keeps a keyed row's DOM node; the harness models keyed identity only through data-alert-id, so the keyed
 // instance rows are mapped onto that channel (otherwise a removed row's focused node would be reused positionally).
 const view=mountControlledComponent(()=>{const tree=IndicatorDialog(props) as unknown as ModelElement;return keyedRows(Modal(tree.props as Parameters<typeof Modal>[0]));});
 view.settle();
 const labelOf=(row:IndicatorInstanceView)=>indicatorInstanceLabels(props.instances).get(row.id)!;
 const control=(label:string)=>view.nodeFor(view.find(node=>node.type==='button'&&node.props['aria-label']===label));
 /** Keyboard Remove: focus the row's x control and activate it (Enter / Space dispatch a click on a button). */
 const remove=(row:IndicatorInstanceView)=>{const label='Remove '+labelOf(row),target=control(label);target.focus();invoke(view.find(node=>node.props['aria-label']===label).props.onClick,input(target));view.settle();mutate();};
 return {view,props,chart,labelOf,control,remove};
}

it('F10: removing an instance by keyboard keeps focus in the dialog on the next row, and Escape then closes the dialog',()=>{
 const rows=[sma('a',9),sma('b',20),sma('c',50)],ui=indicators(rows),nextEdit='Edit '+ui.labelOf(rows[2]);
 expect(dialogNode(ui.view).contains(focusDocument.activeElement)).toBe(true);
 ui.remove(rows[1]);
 expect(ui.chart.indicators.remove).toHaveBeenCalledWith('b');expect(ui.view.text()).toContain('Removed ');
 expect(focusDocument.activeElement===focusDocument.body).toBe(false);
 expect(dialogNode(ui.view).contains(focusDocument.activeElement)).toBe(true);
expect(isActive(ui.control(nextEdit))).toBe(true);// the row that took the removed row's place
 expect(press(ui.view,'Escape')).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
});

it('F10: removing the last row moves focus to the previous row; removing the only row falls back to the dialog container',()=>{
 const rows=[sma('a',9),sma('b',20)],ui=indicators(rows),previousEdit='Edit '+ui.labelOf(rows[0]);
 ui.remove(rows[1]);expect(isActive(ui.control(previousEdit))).toBe(true);
 ui.remove(rows[0]);
 const dialog=dialogNode(ui.view);
 expect(isActive(dialog)).toBe(true);// nothing in its place: the dialog itself holds focus (tabIndex -1)
 expect(dialog.props.tabIndex).toBe(-1);
 // Tab and Shift+Tab from the container stay inside the dialog (first and last enabled control).
 const tabbable=dialog.querySelectorAll('input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]').filter(node=>node.offsetParent!==null);
 expect(press(ui.view,'Tab')).toBe(true);expect(isActive(tabbable[0])).toBe(true);
 dialog.focus();expect(press(ui.view,'Tab',true)).toBe(true);expect(isActive(tabbable.at(-1)!)).toBe(true);
 dialog.focus();expect(press(ui.view,'Escape')).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
});

// A later fix refines this: the dialog element holds focus while the same control is awaited (about 2 s), and
// only a control that stays disabled hands focus to the next enabled, non-destructive control.
it('F10: a focused dialog control that becomes disabled keeps focus in the dialog, then hands it to the next enabled control',()=>{
 let disabled=false;const onClose=vi.fn();
 const view=mountControlledComponent(()=>Modal({title:'Synthetic',onClose,children:React.createElement('div',null,
  React.createElement('button',{type:'button','aria-label':'First'},'First'),
  React.createElement('button',{type:'button','aria-label':'Clear',disabled},'Clear'),
  React.createElement('button',{type:'button','aria-label':'After'},'After'))}));
 view.settle();const clear=view.nodeFor(view.find(node=>node.props['aria-label']==='Clear'));clear.focus();
 disabled=true;view.settle();
 focusDocument.activeElement=focusDocument.body;// Chromium focus fixup: a disabled control loses focus to the body
 mutate();
 expect(isActive(dialogNode(view))).toBe(true);// not the body: Escape still reaches the dialog
 vi.advanceTimersByTime(2100);// it stays disabled
 expect(isActive(view.nodeFor(view.find(node=>node.props['aria-label']==='After')))).toBe(true);
 expect(press(view,'Escape')).toBe(true);expect(onClose).toHaveBeenCalledOnce();
});

it('F9: a blocking (inert) workspace state restores focus to the same dialog control when it ends; keys work again',()=>{
 let blocked=false;const onClose=vi.fn();
 const view=mountControlledComponent(()=>React.createElement('main',{className:'workspace',inert:blocked||undefined},Modal({title:'Synthetic layouts',onClose,children:React.createElement('form',null,
  React.createElement('input',{autoFocus:true,'aria-label':'Layout name'}),
  React.createElement('button',{type:'button','aria-label':'Save layout'},'Save layout'))})));
 view.settle();const field=view.nodeFor(view.find(node=>node.props['aria-label']==='Layout name'));field.focus();
 blocked=true;view.settle();
 // Chromium: an inert ancestor drops focus to the body with a focusout whose relatedTarget is null.
 focusDocument.activeElement=focusDocument.body;dispatchDocument('focusout',input(field,{relatedTarget:null}),true);dispatchDocument('focusout',input(field,{relatedTarget:null}),false);mutate();
 expect(focusDocument.activeElement===focusDocument.body).toBe(true);// nothing inside an inert tree can take focus
 vi.advanceTimersByTime(500);expect(focusDocument.activeElement===focusDocument.body).toBe(true);
 blocked=false;view.settle();vi.advanceTimersByTime(100);
 expect(isActive(field)).toBe(true);
 expect(press(view,'Escape')).toBe(true);expect(onClose).toHaveBeenCalledOnce();
});

it('F10: focus the user moves outside the dialog on purpose, or into a nested dialog, is left alone',()=>{
 const onClose=vi.fn(),outside=new ModelNode();outside.tag='button';focusDocument.body.children.push(outside);outside.parent=focusDocument.body;
 const view=mountControlledComponent(()=>Modal({title:'Synthetic',onClose,children:React.createElement('button',{type:'button','aria-label':'Only'},'Only')}));
 view.settle();expect(dialogNode(view).contains(focusDocument.activeElement)).toBe(true);
 outside.focus();mutate();expect(isActive(outside)).toBe(true);
 expect(text(view.render())).toContain('Synthetic');
});

it('F11: an Escape that closes the dialog while the workspace is briefly inert still returns focus to the opener afterwards',()=>{
 // Chromium: focus() on an element under an inert ancestor does nothing. The harness focus is patched to model that.
 const original=ModelNode.prototype.focus;ModelNode.prototype.focus=function(this:ModelNode){if(this.closest('[inert]'))return;original.call(this);};
 try{
  const main=new ModelNode(),opener=new ModelNode(),onClose=vi.fn();main.tag='main';main.parent=focusDocument.body;focusDocument.body.children.push(main);opener.tag='button';opener.parent=main;main.children.push(opener);
  opener.focus();expect(isActive(opener)).toBe(true);
  const view=mountControlledComponent(()=>Modal({title:'Indicators',onClose,children:React.createElement('input',{'aria-label':'Search indicators'})}));
  view.settle();expect(dialogNode(view).contains(focusDocument.activeElement)).toBe(true);
  expect(press(view,'Escape')).toBe(true);expect(onClose).toHaveBeenCalledOnce();
  main.props={inert:true};// a blocking workspace state overlaps the close
  focusDocument.activeElement=focusDocument.body;view.dispose();// the parent unmounts the dialog; its nodes leave the page
  expect(focusDocument.activeElement===focusDocument.body).toBe(true);
  main.props={};vi.advanceTimersByTime(100);
  expect(isActive(opener)).toBe(true);
 }finally{ModelNode.prototype.focus=original;}
});
