import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {focusDocument,input,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {LocalAlert} from '../../src/domain/alerts';
import {sourceContextForDataset} from '../../src/chart/source-context';

// The selected condition source lives in WorkspaceAlerts, which
// stays mounted, so discarding a Create draft (Escape or the footer Cancel) or closing the dialog must also discard the
// edited source. Actual WorkspaceAlerts (catalog, observer, interval tick) feeding the actual AlertDialog under the shared
// controlled hook and node model (same harness as tests/ui/bugfix-f-alert-autosave-panel.test.ts). No browser DOM or GUI claim.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
const intervals:Array<()=>void>=[];
beforeEach(()=>{observers.length=0;intervals.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.stubGlobal('setInterval',(callback:()=>void)=>{intervals.push(callback);return intervals.length;});vi.stubGlobal('clearInterval',()=>{});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});

function setup(){
 const clock=1791979200;vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1704153600,open:9,high:10,low:8,close:9,volume:100}];
 const props:any={open:true,onClose:vi.fn(),alerts:[] as LocalAlert[],dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,enabled:true,suspended:false,backgroundSave:false,assertContextCurrent:vi.fn(),onContextComplete:vi.fn()};
 props.onAlertsChange=vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;});
 props.chart={getSourceContext:()=>sourceContextForDataset(dataset,props.bars),getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 let child:AlertDialogProps|null=null;
 const view=mountControlledComponent(()=>{const element=WorkspaceAlerts(props) as unknown as {props:AlertDialogProps};child=element.props;return AlertDialog(element.props);});
 const pump=()=>{for(let pass=0;pass<16;pass++){const writes=view.owner.writes;view.render();for(const effect of view.owner.pending.splice(0))effect();if(view.owner.writes===writes)return;}throw Error('Synthetic state kept changing');};
 const settle=async()=>{for(let pass=0;pass<8;pass++){pump();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();await vi.advanceTimersByTimeAsync(0);for(let i=0;i<10;i++)await Promise.resolve();}pump();};
 const button=(name:string)=>view.find(node=>node.type==='button'&&(text(node.props.children)===name||node.props['aria-label']===name));
 const sourceSelect=()=>view.find(node=>node.type==='select'&&node.props['aria-label']==='Technical alert source');
 const openCreate=async()=>{(button('Create alert').props.onClick as ()=>void)();await ui.settle();};
 const chooseSource=async(id:string)=>{(sourceSelect().props.onChange as (event:{target:{value:string}})=>void)({target:{value:id}});await ui.settle();};
 const escape=async()=>{const dialog=view.find(node=>node.props.role==='dialog');(dialog.props.onKeyDown as (event:unknown)=>void)(input(view.nodeFor(dialog),{key:'Escape'}));await ui.settle();};
 const ui={props,view,settle,button,sourceSelect,openCreate,chooseSource,escape,child:()=>child!};
 return ui;
}

it('Escape and Cancel on Create discard the selected source',async()=>{
 const ui=setup();await ui.settle();
 expect(ui.child().context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();
 // Escape on the Create tab.
 await ui.openCreate();
 expect(ui.sourceSelect().props.value).toBe('price:close:chart');
 await ui.chooseSource('price:high:chart');
 expect(ui.sourceSelect().props.value,'the edit took effect').toBe('price:high:chart');
 await ui.escape();
 expect(ui.view.text()).toContain('Alert edit cancelled. Saved alerts are unchanged.');
 await ui.openCreate();
 expect(ui.sourceSelect().props.value,'Escape discarded the edited source').toBe('price:close:chart');
 // The footer Cancel button.
 await ui.chooseSource('price:low:chart');
 expect(ui.sourceSelect().props.value).toBe('price:low:chart');
 (ui.button('Cancel').props.onClick as ()=>void)();await ui.settle();
 await ui.openCreate();
 expect(ui.sourceSelect().props.value,'Cancel discarded the edited source').toBe('price:close:chart');
 expect(ui.props.alerts).toEqual([]);
});

it('closing the alert dialog discards the selected source',async()=>{
 const ui=setup();await ui.settle();
 await ui.openCreate();await ui.chooseSource('price:high:chart');
 expect(ui.sourceSelect().props.value).toBe('price:high:chart');
 ui.props.open=false;await ui.settle();
 ui.props.open=true;await ui.settle();
 await ui.openCreate();
 expect(ui.sourceSelect().props.value,'a closed dialog does not keep the edited source').toBe('price:close:chart');
 expect(ui.child().context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();
});

it('a create request that names a source still preselects it',async()=>{
 const ui=setup();await ui.settle();
 ui.props.createRequest={sourceId:'price:open:chart'};await ui.settle();
 expect(ui.sourceSelect().props.value).toBe('price:open:chart');
});

it('the Create form heading is spaced from the content above it',async()=>{
 // Release 6 tour: "Create alert on GME" touched the line above it. The form now has its own top margin and the heading is a block.
 const ui=setup();await ui.settle();await ui.openCreate();
 const form=ui.view.find(node=>node.type==='form');
 // The title lives once, in the dialog header; the form no longer repeats it and the manager tabs are hidden.
 expect((form.props.children as any[]).find(child=>child?.type==='strong'&&child.props.className==='alert-form-title')).toBeUndefined();
 expect(text(ui.view.find(node=>node.type==='h2'))).toBe('Create alert on GME');
 expect(ui.view.find(node=>node.type==='nav').props.hidden).toBe(true);
 const css=text(ui.view.find(node=>node.type==='style').props.children);
 expect(css).toMatch(/\.lv-alert-dialog \.alert-form\{[^}]*margin-top:\s*[1-9]\d*px/);
});
