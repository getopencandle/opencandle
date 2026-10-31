import {afterEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,invoke,input,text,all} from '../helpers/alert-dialog-harness';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {nyseAlertFixture} from '../fixtures/nyse-mtf-alert-fixture';
import {unix,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {validateLocalAlerts,type LocalAlert} from '../../src/domain/alerts';
import {sameAlertBinding} from '../../src/domain/alert-observation';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import type {ChartController} from '../../src/chart/adapter';
const owned:{dispose():void}[]=[];afterEach(()=>{for(const item of owned.splice(0).reverse())item.dispose();});

async function form(){
 const f=await nyseAlertFixture();owned.push(f);const view=await f.observe(),choice=f.choice();let alerts:LocalAlert[]=[];
 const props:AlertDialogProps={open:true,onClose:()=>{},alerts,events:[],externallyProcessed:true,instrument:f.producer.regular().instrument,now:unix('2024-03-11T20:00:05Z'),context:view.selectedContext,contexts:view.contexts,sourceChoices:f.choices(),selectedSourceId:choice.id,targetSourceId:'constant',sourceSelectionKey:choice.id,onSourceChange:()=>{},onTargetChange:()=>{},
  onAlertsChange:(next,expected)=>{if(expected!==props.alerts)return false;alerts=next;props.alerts=next;return true;},
  validateCurrentSource:binding=>{const current=f.observer.currentContext(choice.source!,f.producer.regular());if(!current||!sameAlertBinding(binding,current.binding))throw Error('The genuine daily source changed before Save.');},onRequestObservation:vi.fn()};
 const mounted=mountControlledComponent(()=>AlertDialog(props));mounted.settle();
 const field=(label:string)=>mounted.find(node=>node.props['aria-label']===label),change=(label:string,value:string)=>{const control=field(label);invoke(control.props.onChange,input(mounted.nodeFor(control),{target:{value}}));mounted.settle();},click=(label:string)=>{const control=mounted.find(node=>node.type==='button'&&text(node)===label);invoke(control.props.onClick,input(mounted.nodeFor(control)));mounted.settle();},submit=()=>{const control=mounted.find(node=>node.type==='form');invoke(control.props.onSubmit,{preventDefault(){}});mounted.settle();};
 click('Create alert');return{f,props,mounted,field,change,click,submit,alerts:()=>alerts};
}

it('saves a real catalog-captured daily declaration through the actual dialog callbacks',async()=>{
 const ui=await form();expect(ui.field('Technical alert target').props.disabled).toBe(true);expect(ui.mounted.text()).toContain('constant');ui.change('Alert condition','greater');ui.change('Alert level','100');ui.change('Alert frequency','once-per-bar-close');ui.change('Alert name','SYNTHETIC daily 120');ui.submit();
 expect(ui.alerts()).toHaveLength(1);expect(validateLocalAlerts(ui.alerts()).ok).toBe(true);const binding=ui.alerts()[0].definition.observationBinding!;expect(binding.completionPolicy).toBe('nyse-session-observation');expect(binding.source).toEqual(ui.f.choice().source);expect(ui.alerts()[0].definition.frequency).toBe('once-per-bar-close');expect(ui.props.onRequestObservation).toHaveBeenCalledOnce();
});

it('refuses Save when the actual producer retires after the draft capture',async()=>{
 const ui=await form();ui.change('Alert level','100');ui.change('Alert name','SYNTHETIC retained draft');ui.f.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();ui.submit();
 expect(ui.alerts()).toEqual([]);expect(ui.mounted.text()).toContain('genuine daily source changed');expect(ui.field('Alert name').props.value).toBe('SYNTHETIC retained draft');expect(ui.props.onRequestObservation).not.toHaveBeenCalled();
});

it('omits qualified daily sources from comparison operands and forces a constant on selection',async()=>{
 const ui=await form(),price=ui.props.sourceChoices!.find(row=>row.id==='price:close:chart')!,daily=ui.f.choice(),target=vi.fn(),selected=vi.fn();ui.props.selectedSourceId=price.id;ui.props.targetSourceId='price:open:chart';ui.props.onSourceChange=selected;ui.props.onTargetChange=target;ui.mounted.settle();
 const compare=ui.field('Technical alert target');expect(all(compare,node=>node.type==='option'&&node.props.value===daily.id)).toEqual([]);
 ui.change('Technical alert source',daily.id);expect(selected).toHaveBeenCalledWith(daily.id);expect(target).toHaveBeenCalledWith('constant');
});

it('edits saved descriptive settings without silently replacing the frozen daily calculation',async()=>{
 const ui=await form();ui.change('Alert condition','greater');ui.change('Alert level','100');ui.change('Alert name','SYNTHETIC saved daily');ui.submit();const before=structuredClone(ui.alerts()[0].definition.observationBinding);ui.click('Alerts (1)');ui.click('Edit');ui.change('Alert name','SYNTHETIC renamed daily');ui.submit();
 expect(ui.alerts()).toHaveLength(1);expect(ui.alerts()[0].definition.name).toBe('SYNTHETIC renamed daily');expect(ui.alerts()[0].definition.observationBinding).toEqual(before);expect(validateLocalAlerts(ui.alerts()).ok).toBe(true);
});

it('saves the actual qualified source through WorkspaceAlerts capture and its current-source callback',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(unix('2024-03-11T20:00:05Z')*1000);const f=await nyseAlertFixture();owned.push(f);
 // Empty drawing notifications are controlled; the source/context, actual
 // study port, producer witness and Workspace save guard are not replaced.
 const chart={...f.chart,onDrawingsChanged:()=>()=>{}} as ChartController,props:Parameters<typeof WorkspaceAlerts>[0]={open:true,onClose:()=>{},alerts:[] as LocalAlert[],onAlertsChange:(next:LocalAlert[],expected?:LocalAlert[])=>{if(expected!==props.alerts)return false;props.alerts=next;return true;},dataset:f.producer.regular(),bars:f.producer.regular().bars,chart,chartId:'synthetic-workspace',replay:null,enabled:true,createRequest:{sourceId:`indicator:${f.id}:sma`}},parent=mountControlledComponent(()=>WorkspaceAlerts(props));parent.settle();let dialogProps:AlertDialogProps|undefined;
 for(let turn=0;turn<16;turn++){await new Promise<void>(resolve=>setTimeout(resolve,0));await flushMtf();parent.settle();const candidate=parent.find(node=>node.type===AlertDialog).props as unknown as AlertDialogProps;if(candidate.context?.binding.completionPolicy==='nyse-session-observation'&&!candidate.evaluationPending){dialogProps=candidate;break;}}
 expect(dialogProps?.context?.binding.completionPolicy).toBe('nyse-session-observation');if(!dialogProps?.context)throw Error('Actual Workspace daily capture did not become ready.');expect(()=>dialogProps!.validateCurrentSource!(dialogProps!.context!.binding)).not.toThrow();
 const child=mountControlledComponent(()=>AlertDialog(dialogProps!));child.settle();const change=(label:string,value:string)=>{const control=child.find(node=>node.props['aria-label']===label);invoke(control.props.onChange,input(child.nodeFor(control),{target:{value}}));child.settle();};
 const create=child.find(node=>node.type==='button'&&text(node)==='Create alert');invoke(create.props.onClick,input(child.nodeFor(create)));child.settle();change('Alert condition','greater');change('Alert level','100');change('Alert name','SYNTHETIC Workspace daily Save');const form=child.find(node=>node.type==='form');invoke(form.props.onSubmit,{preventDefault(){}});child.settle();expect(props.alerts).toHaveLength(1);expect(props.alerts[0].definition.observationBinding).toEqual(dialogProps.context.binding);expect(validateLocalAlerts(props.alerts).ok).toBe(true);child.dispose();parent.dispose();
});
