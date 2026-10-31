import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {focusDocument,input,invoke,mountControlledComponent,text,type ModelNode} from '../helpers/alert-dialog-harness';
import {Modal} from '../../src/ui/Modal';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {buildContextPriceRequestData} from '../../src/ui/context-price-request';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';

// Probe 'focus': the shared dialog focus retention moved focus
// for good to a neighbor when the focused control was only briefly disabled. In AlertDialog the contextual 'Create local
// alert' (the last control) is disabled while a background autosave suspends the alert context or an evaluation tick is
// pending; focus went to the previous control, Cancel, and stayed there, so Enter discarded the clicked-price draft.
// Actual Modal / AlertDialog handlers under the shared controlled hook and node model; Chromium's focus fixup (a focused
// control that becomes disabled loses focus to the body) is applied explicitly and MutationObserver delivery is driven by
// the test. No browser DOM, focus engine, GUI or package claim.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});
type View=ReturnType<typeof mountControlledComponent>;
/** A commit: Chromium moves focus off a control that became disabled, then observers run and deferred checks settle. */
function commit(view:View){view.settle();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();vi.advanceTimersByTime(0);}
const dialogNode=(view:View)=>view.nodeFor(view.find(node=>node.props.role==='dialog'));
const control=(view:View,name:string)=>view.nodeFor(view.find(node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name)));
const isActive=(node:ModelNode)=>focusDocument.activeElement===node;
function press(view:View,key:string){const element=view.find(node=>node.props.role==='dialog'),dialog=view.nodeFor(element),target=focusDocument.activeElement;if(!target||!dialog.contains(target))return false;invoke(element.props.onKeyDown,input(target,{key,target,currentTarget:dialog}));view.settle();return true;}

function synthetic(){
 const state={disabled:false},onClose=vi.fn();
 const view=mountControlledComponent(()=>Modal({title:'Synthetic',onClose,children:React.createElement('div',null,
  React.createElement('input',{'aria-label':'Name'}),
  React.createElement('button',{type:'button','aria-label':'Cancel draft','data-lv-destructive':'true'},'Cancel'),
  React.createElement('button',{type:'button','aria-label':'Create',disabled:state.disabled},'Create'))}));
 view.settle();return{view,state,onClose};
}

it('BD-R4: a briefly disabled control parks focus on the dialog and gets it back once re-enabled (never the neighbor)',()=>{
 const {view,state,onClose}=synthetic(),create=control(view,'Create'),cancel=control(view,'Cancel draft');
 create.focus();state.disabled=true;commit(view);
 expect(isActive(cancel),'never the destructive neighbor').toBe(false);
 expect(isActive(dialogNode(view)),'the dialog element holds focus meanwhile').toBe(true);
 vi.advanceTimersByTime(400);expect(isActive(dialogNode(view))).toBe(true);
 state.disabled=false;commit(view);vi.advanceTimersByTime(60);
 expect(isActive(create),'the same control once usable again').toBe(true);
 expect(press(view,'Escape')).toBe(true);expect(onClose).toHaveBeenCalledOnce();
});

it('BD-R4: a control that stays disabled hands focus to a non-destructive neighbor after the bound, never to Cancel or Close',()=>{
 const {view,state}=synthetic(),create=control(view,'Create');
 create.focus();state.disabled=true;commit(view);expect(isActive(dialogNode(view))).toBe(true);
 vi.advanceTimersByTime(2100);
 const name=view.nodeFor(view.find(node=>node.props['aria-label']==='Name'));
 expect(isActive(name)).toBe(true);// skips 'Cancel draft' (marked) and 'Close Synthetic' (the header dismiss control)
 // With no safe neighbor at all the dialog element keeps focus (one dialog at a time: the first one is closed).
 view.dispose();focusDocument.activeElement=focusDocument.body;
 const lone={disabled:false};
 const only=mountControlledComponent(()=>Modal({title:'Lone',onClose:vi.fn(),children:React.createElement('div',null,
  React.createElement('button',{type:'button','aria-label':'Discard changes'},'Discard changes'),React.createElement('button',{type:'button','aria-label':'Apply',disabled:lone.disabled},'Apply'))}));
 only.settle();control(only,'Apply').focus();lone.disabled=true;commit(only);vi.advanceTimersByTime(2100);
 expect(isActive(dialogNode(only))).toBe(true);
});

const dataset=fixtureDataset('GME',5),instrument=dataset.instrument,now=1791979200;
function contextualAlert(){
 const contextRequest=buildContextPriceRequestData({id:'click',action:'price-alert',price:100.005,instrument,chartId:'chart',sourceKey:'supplied-synthetic-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null});
 const observation=alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'chart',sessionId:'session',mode:'ordinary',startedAt:now}),dataset);
 const props:AlertDialogProps={open:true,onClose:vi.fn(),alerts:[],onAlertsChange:vi.fn(),instrument,now,context:observation,externallyProcessed:true,validateCurrentSource:vi.fn(),contextRequest,assertContextCurrent:vi.fn(),onContextComplete:vi.fn(),onRequestObservation:vi.fn()} as AlertDialogProps;
 const view=mountControlledComponent(()=>AlertDialog(props));view.settle();
 return{view,props,observation};
}

it('BD-R4 alert: "Create local alert" disabled while a background save suspends the alert context keeps focus off Cancel and gets it back',()=>{
 const ui=contextualAlert(),create=control(ui.view,'Create'),cancel=control(ui.view,'Cancel');
 expect(create.disabled).toBe(false);create.focus();
 // App suspends WorkspaceAlerts during the autosave (storageBusy): the alert context is withdrawn for the write.
 ui.props.context=undefined;commit(ui.view);expect(create.disabled).toBe(true);
 expect(isActive(cancel),'probe: focus used to land on Cancel, where Enter discards the draft').toBe(false);
 expect(isActive(dialogNode(ui.view))).toBe(true);
 expect(press(ui.view,'Enter')).toBe(true);// Enter on the dialog element activates nothing
 expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();
 ui.props.context=ui.observation;commit(ui.view);vi.advanceTimersByTime(60);
 expect(create.disabled).toBe(false);expect(isActive(create)).toBe(true);
 expect(isActive(cancel)).toBe(false);expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();
});

it('BD-R4 alert: if the context stays away, focus moves to a form control, never to Cancel or the close button',()=>{
 const ui=contextualAlert(),create=control(ui.view,'Create');
 create.focus();ui.props.context=undefined;commit(ui.view);vi.advanceTimersByTime(2100);
 const active=focusDocument.activeElement!;
 expect(active===control(ui.view,'Cancel')||active===control(ui.view,'Close')).toBe(false);// The create-flow X is labelled Close
 expect(dialogNode(ui.view).contains(active)).toBe(true);expect(active.disabled).toBe(false);
 expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.props.onContextComplete).not.toHaveBeenCalled();
});
