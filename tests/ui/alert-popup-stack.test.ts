import {afterEach,expect,it,vi} from 'vitest';
// Existing controlled hook owner MUST be installed before component imports.
import {all,invoke,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import React,{type ReactPortal} from 'react';
import {AlertPopupRack} from '../../src/ui/AlertPopupRack';
import {popupTarget,STACKED_POPUP_STYLE} from '../../src/ui/alert-popup-target';
import {AlertDeliveryHost,type AlertDeliveryHostProps} from '../../src/ui/alert-delivery-host';
import {CompoundAlertDeliveryHost,type CompoundAlertDeliveryHostProps} from '../../src/ui/CompoundAlertDeliveryHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,processAlertEvent,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {ALERT_POPUP_AUTOHIDE_MS} from '../../src/domain/alert-delivery';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import type {CompoundAlertBook,CompoundBookEvent} from '../../src/ui/compound-alert-book';
import type {CompoundJournalNode} from '../../src/ui/compound-alert-document';

// Controlled component/ReactDOM portal-carrier tests. Fake nodeType containers
// let actual createPortal construct its real carrier; no DOM layout, browser,
// native source permission, numerical execution, sound or OS IO is claimed.
const disposals:Array<()=>void>=[];
afterEach(()=>{const errors:unknown[]=[];for(const dispose of disposals.splice(0).reverse())try{dispose();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.useRealTimers();if(errors.length)throw new AggregateError(errors,'Synthetic popup host cleanup failed.');});
type Portal=ReactPortal&{readonly $$typeof:symbol;readonly containerInfo:HTMLElement};
const container=()=>({nodeType:1}) as HTMLElement;
const content=(node:unknown):unknown=>node&&typeof node==='object'&&'$$typeof'in node&&(node as {$$typeof:unknown}).$$typeof===Symbol.for('react.portal')?(node as Portal).children:node;
const articles=(node:unknown)=>all(content(node),n=>n.type==='article');
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const d:AlertDefinition={id:'SYNTHETIC scalar',name:'SYNTHETIC scalar',message:'Separate scalar body',instrumentId:'SYNTHETIC GME',sourceId:'close',condition:{kind:'greater',value:10},frequency:'every-time',createdAt:1000,expiresAt:null,mode:'ordinary',runId:'ordinary',delivery:{schemaVersion:1,popup:true,desktop:false,sound:null}};
function fire(alert:LocalAlert,n:number){const result=processAlertEvent(alert,{instrumentId:d.instrumentId,sourceId:'close',value:20+n,time:1000+n,availableAt:1000+n,sequence:n,barId:'SYNTHETIC '+n,barClosed:false,feedState:'ready',mode:'ordinary',runId:'ordinary'});expect(result.notification).not.toBeNull();return result.alert;}
function scalar(popupHost?:HTMLElement|null){const props:AlertDeliveryHostProps={alerts:[createLocalAlert(d)],popupHost,autoHide:false,desktopPort:null,soundPlayer:{play:vi.fn(async()=>{})}},ui=mountControlledComponent(()=>AlertDeliveryHost(props));disposals.push(ui.dispose);ui.settle();return{props,ui,trigger(){props.alerts=[fire(props.alerts[0],props.alerts[0].history.length+1)];ui.settle();}};}
function channel(){
 const generation={},listeners=new Set<(event:CompoundBookEvent)=>void>(),entry={id:'SYNTHETIC compound',generation};let version=0n;
 const book={entry:(id:string)=>id===entry.id?entry:null,entries:()=>[entry],subscribe:(fn:(event:CompoundBookEvent)=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}} as unknown as CompoundAlertBook;
 const definition:CompoundDefinition={kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:entry.id,name:'SYNTHETIC compound',message:'Separate complete vector',context:{instrumentId:'SYNTHETIC GME',sourceFamily:'live:alpaca-stub:GME:1m',interval:'1m',session:'regular',basis:'SYNTHETIC basis'},predicates:[{id:'close',source:{kind:'price',field:'close'},operator:{kind:'greater',value:10}},{id:'open',source:{kind:'price',field:'open'},operator:{kind:'greater',value:10}}],frequency:'every-time',createdAt:0,expiresAt:null};
 const fire=()=>{const fresh:CompoundJournalNode={item:{id:'SYNTHETIC notification',alertId:entry.id,revision:1,sequence:1,at:1001,barId:'SYNTHETIC current',values:[20,19],local:true},binding:{id:'SYNTHETIC binding',revision:1,restriction:'restricted-live',declaration:definition,provenance:{providerId:'alpaca-stub',datasetId:definition.context.sourceFamily,revision:'SYNTHETIC revision',resolution:'1m',basis:definition.context.basis}},delivery:{schemaVersion:1,popup:true,desktop:false,sound:null},previous:null,size:1};for(const listener of listeners)listener({kind:'observation',version:++version,entry:entry as never,fresh});};
 return{book,fire,listeners};
}
function compound(popupHost?:HTMLElement|null){const source=channel(),props:{-readonly [K in keyof CompoundAlertDeliveryHostProps]:CompoundAlertDeliveryHostProps[K]}={book:source.book,popupHost,autoHide:false,desktopPort:null,soundPlayer:{play:vi.fn(async()=>{})},financialGeneration:0,gridGeneration:0,financialGenerationRef:{current:0},gridGenerationRef:{current:0}},ui=mountControlledComponent(()=>CompoundAlertDeliveryHost(props));disposals.push(ui.dispose);ui.settle();return{...source,props,ui};}

it('preserves standalone identity, waits on explicit null and creates an actual portal only for an actual target',()=>{
 const node=React.createElement('section',null,'Original popup');expect(popupTarget(node,undefined)).toBe(node);expect(popupTarget(node,null)).toBeNull();const host=container(),portal=popupTarget(node,host) as Portal;expect(portal.$$typeof).toBe(Symbol.for('react.portal'));expect(portal.containerInfo).toBe(host);expect(portal.children).toBe(node);expect(()=>popupTarget(node,{} as HTMLElement)).toThrow();
});
it('keeps exact trusted child keys and props, leaves foreign children alone, and injects the same mounted rack',()=>{
 const foreign=React.createElement('aside',{key:'foreign'},'Other UI'),left=React.createElement(CompoundAlertDeliveryHost,{key:'compound',book:{} as CompoundAlertBook,financialGeneration:0,gridGeneration:0,financialGenerationRef:{current:0},gridGenerationRef:{current:0}}),right=React.createElement(WorkspaceAlerts,{key:'grid:epoch',open:false,onClose:()=>{},alerts:[],onAlertsChange:()=>{},dataset:fixtureDataset('GME',2),replay:null,enabled:false}),children=[left,right,foreign];
 const ui=mountControlledComponent(()=>AlertPopupRack({children}));disposals.push(ui.dispose);ui.settle();const tree=ui.render(),clones=all(tree,n=>n.type===CompoundAlertDeliveryHost||n.type===WorkspaceAlerts),rack=ui.find(n=>n.props.className==='lv-alert-popup-rack');
 expect(clones.map(n=>(n as unknown as React.ReactElement).key)).toEqual(['compound','grid:epoch']);expect(clones[0].props.book).toBe(left.props.book);expect(clones[0].props.popupHost).toBe(ui.nodeFor(rack));expect(clones[1].props.popupHost).toBe(clones[0].props.popupHost);expect(all(tree,n=>n.type==='aside')[0]).toBe(foreign);expect(rack.props.style).toMatchObject({display:'flex',flexDirection:'column',gap:8,overflow:'auto',zIndex:99});
});
it('retains the original standalone fixed popup when the optional target is absent',()=>{
 const f=scalar();f.trigger();const tree=f.ui.render(),section=all(tree,n=>n.type==='section')[0];expect(section.props.style).toMatchObject({position:'fixed',right:16,bottom:16,zIndex:99});expect(articles(tree)).toHaveLength(1);
});
it('keeps scalar deliveries while a rack is pending and moves only their portal without redelivery or history changes',()=>{
 const f=scalar(null);f.trigger();expect(f.ui.render()).toBeNull();const original=f.props.alerts[0],a=container(),b=container();f.props.popupHost=a;f.ui.settle();let portal=f.ui.render() as Portal;expect(portal.containerInfo).toBe(a);expect(articles(portal)).toHaveLength(1);expect(all(content(portal),n=>n.type==='section')[0].props.style).toBe(STACKED_POPUP_STYLE);const id=articles(portal)[0].props['data-alert-notification-id'];f.props.popupHost=b;f.ui.settle();portal=f.ui.render() as Portal;expect(portal.containerInfo).toBe(b);expect(articles(portal).map(n=>n.props['data-alert-notification-id'])).toEqual([id]);expect(f.props.alerts[0]).toBe(original);invoke(all(content(portal),n=>n.type==='button'&&String(n.props['aria-label']).startsWith('Dismiss alert popup'))[0].props.onClick);f.ui.settle();expect(f.ui.render()).toBeNull();expect(original.history).toHaveLength(1);expect(f.props.soundPlayer!.play).not.toHaveBeenCalled();
});
it('keeps scalar auto-hide timing active while its explicit popup target is null',()=>{
 vi.useFakeTimers();const f=scalar(null);f.props.autoHide=true;f.trigger();vi.advanceTimersByTime(ALERT_POPUP_AUTOHIDE_MS+1);f.props.popupHost=container();f.ui.settle();expect(f.ui.render()).toBeNull();expect(f.props.alerts[0].history).toHaveLength(1);
});
it('keeps a fresh compound vector through pending and replacement targets with no resubscribe or history replay',async()=>{
 const f=compound(null);f.fire();await flush();f.ui.settle();expect(f.ui.render()).toBeNull();expect(f.listeners.size).toBe(1);const a=container(),b=container();f.props.popupHost=a;f.ui.settle();let portal=f.ui.render() as Portal;expect(portal.containerInfo).toBe(a);expect(articles(portal)).toHaveLength(1);expect(text(content(portal))).toContain('Close: Greater than 10 = 20');expect(text(content(portal))).toContain('Open: Greater than 10 = 19');f.props.popupHost=b;f.ui.settle();portal=f.ui.render() as Portal;expect(portal.containerInfo).toBe(b);expect(articles(portal)).toHaveLength(1);expect(f.listeners.size).toBe(1);invoke(all(content(portal),n=>n.type==='button'&&String(n.props['aria-label']).startsWith('Dismiss SYNTHETIC'))[0].props.onClick);f.ui.settle();expect(f.ui.render()).toBeNull();f.ui.dispose();expect(f.listeners.size).toBe(0);expect(f.props.soundPlayer!.play).not.toHaveBeenCalled();
});
it('keeps compound auto-hide timing active while its explicit popup target is null',async()=>{
 vi.useFakeTimers();const f=compound(null);f.props.autoHide=true;f.fire();await flush();f.ui.settle();vi.advanceTimersByTime(ALERT_POPUP_AUTOHIDE_MS+1);f.props.popupHost=container();f.ui.settle();expect(f.ui.render()).toBeNull();expect(f.listeners.size).toBe(1);
});

it('presents both notification kinds into one rack target and dismisses only the selected host popup',async()=>{
 const target=container(),left=scalar(target),right=compound(target);left.trigger();right.fire();await flush();right.ui.settle();expect((left.ui.render() as Portal).containerInfo).toBe(target);expect((right.ui.render() as Portal).containerInfo).toBe(target);expect(articles(left.ui.render())).toHaveLength(1);expect(articles(right.ui.render())).toHaveLength(1);invoke(all(content(left.ui.render()),n=>n.type==='button'&&String(n.props['aria-label']).startsWith('Dismiss alert popup'))[0].props.onClick);left.ui.settle();expect(left.ui.render()).toBeNull();expect(articles(right.ui.render())).toHaveLength(1);expect(left.props.alerts[0].history).toHaveLength(1);expect(right.listeners.size).toBe(1);
});
