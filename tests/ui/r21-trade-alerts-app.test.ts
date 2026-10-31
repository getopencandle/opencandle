import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost as MultiChartGrid} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount,submitPaperOrder} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {PaperOrderTicket} from '../../src/ui/PaperOrderTicket';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
// The Paper trading button opens only the bottom Trading panel; the floating dialog is reached from the panel (Open floating).
const openPaperDialog=(ui:{button:(label:string)=>any;render:()=>any})=>{ui.button('Paper trading').props.onClick();find(ui.render(),(node:any)=>node.type===PaperTradingDock).props.onOpenTicket(null);};
import {PaperChartLines} from '../../src/ui/PaperChartLines';
import type {PaperPreset} from '../../src/domain/paper-presets';
// App wiring (root section of Actual App closures on the controlled hook
// harness of tests/ui/startup-recovery-app.test.ts (setup and contextTarget copied). SYNTHETIC data, virtual money only.
// The price scale + order rows place at the clicked level when one-click is on and a preset is
// selected; otherwise they open the ticket as before. Chart line actions confirm while one-click is off.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const saved=(data:any,revision=7)=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-14T14:00:00Z',data,storage:{directory:'Synthetic R21 profile',backend:'json-atomic'}}});
const preset:PaperPreset={schemaVersion:1,id:'r21-preset',name:'SYNTHETIC five',side:'buy',input:{quantity:{kind:'units',value:'5'},type:'market',limit:null,stop:null,validity:{kind:'day'},entryOutsideRth:false,takeProfitOutsideRth:false,exits:null}};
function workspace(oneClick:boolean){const paper=createPaperAccount({initialBalance:100000,oneClick});return prepareWorkspaceJSON({...createInitialWorkspace(),paper,alerts:[],paperBook:{schemaVersion:1,activeId:paper.id,inactive:[],presets:[preset]}});}
function setup(response:Promise<any>){const bridge={loadWorkspace:vi.fn(()=>response),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:input.expectedRevision+1,savedAt:'2026-10-14T14:00:01Z'}})),resetWorkspace:vi.fn(),exportWorkspace:vi.fn(),executeScript:vi.fn()};vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];boot();const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};return{bridge,render,button,grid:()=>find(render(),node=>node.type===MultiChartGrid)};}
function contextTarget(ui:ReturnType<typeof setup>,price:number){
 const first=ui.grid().props,data=first.datasets.find((row:any)=>row.provenance.datasetId===first.activeDatasetId),controller={goToDate:vi.fn(()=>({ok:true,withinHistory:true})),getStyle:()=>first.state.cells[first.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,first.activeBars)};
 first.onReady(controller);const grid=ui.grid().props,snapshot={token:{},treeOwner:{},cellId:grid.state.layout.activeCellId,controller,instrument:{...data.instrument},input:{bars:grid.activeBars,source:sourceContextForDataset(data,grid.activeBars),style:grid.state.cells[grid.state.layout.activeCellId].style},executionIdentity:grid.activeExecutionIdentity,entity:{kind:'chart'},client:null,local:null,point:{price,logical:1,barIndex:1,barTime:grid.activeBars[1].time,unit:'price',pane:{kind:'price'}}};
 let live=true;const release=vi.fn(()=>{live=false;}),lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release};return{grid,data,snapshot,controller,lease};
}
const lastClose=(ui:ReturnType<typeof setup>)=>ui.grid().props.activeBars.at(-1).close as number;
function selectPreset(ui:ReturnType<typeof setup>){openPaperDialog(ui);const panel=find(ui.render(),node=>node.type===PaperPanel).props;panel.paperManager.onSelectPreset('r21-preset');ui.render();}
const paperOf=(ui:ReturnType<typeof setup>)=>find(ui.render(),(node:any)=>node.type===PaperChartLines)?.props.account??null;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('one-click on with a selected preset: a + menu limit row places at the clicked level at once and opens no ticket',async()=>{
 const ui=setup(Promise.resolve(saved(workspace(true))));await flush();selectPreset(ui);
 const price=Math.round((lastClose(ui)*0.9)*100)/100,target=contextTarget(ui,price);
 await expect(target.grid.contextActions['paper-ticket'](target.snapshot,target.lease,{order:{side:'buy',orderType:'limit'}})).resolves.toEqual({ok:true});
 const account=paperOf(ui);expect(account).not.toBeNull();
 const order=account.orders.find((row:any)=>row.type==='limit');
 expect(order).toMatchObject({side:'buy',type:'limit',limitPrice:price,quantity:5,status:'working'});
 expect(find(ui.render(),node=>node.type===PaperPanel)?.props.contextRequest??null).toBeNull();
 expect(text(ui.render())).toContain('placed with one click');
 expect(target.lease.release).toHaveBeenCalled();
});
it('one-click on without a preset, or one-click off: the + menu row opens the clicked-price ticket and places nothing',async()=>{
 for(const oneClick of [true,false]){
  hooks.cells=[];hooks.cursor=0;hooks.effects=[];
  const ui=setup(Promise.resolve(saved(workspace(oneClick))));await flush();
  if(!oneClick)selectPreset(ui);
  const target=contextTarget(ui,21);
  await expect(target.grid.contextActions['paper-ticket'](target.snapshot,target.lease,{order:{side:'sell',orderType:'stop'}})).resolves.toEqual({ok:true});
  // With no preset the row opens the compact order ticket on its tab at the clicked price; with a preset the
  // clicked-price Paper trading panel keeps the preset path. Neither places anything.
  if(oneClick){const ticket=find(ui.render(),node=>node.type===PaperOrderTicket).props;expect(ticket).toMatchObject({side:'sell',tab:'stop'});expect(typeof ticket.price).toBe('string');expect(ticket.account.orders).toEqual([]);}
  else{const panel=find(ui.render(),node=>node.type===PaperPanel).props;
  expect(panel.contextRequest).toMatchObject({action:'paper-ticket',order:{side:'sell',orderType:'stop'}});
  expect(panel.account.orders).toEqual([]);}
  vi.unstubAllGlobals();
 }
});
it('a refused one-click placement reports why and leaves the account unchanged',async()=>{
 const ui=setup(Promise.resolve(saved(workspace(true))));await flush();selectPreset(ui);
 // The chart quantity box overrides the preset quantity; far more than the virtual balance can buy is refused by the engine.
 find(ui.render(),(node:any)=>typeof node.props?.onQuantity==='function').props.onQuantity('100000000');ui.render();
 const target=contextTarget(ui,Math.round(lastClose(ui)*0.9*100)/100);
 const refused=await target.grid.contextActions['paper-ticket'](target.snapshot,target.lease,{order:{side:'buy',orderType:'limit'}});
 expect(refused.ok).toBe(false);
 expect(paperOf(ui).orders).toEqual([]);
 expect(find(ui.render(),node=>node.type===PaperPanel)?.props.contextRequest??null).toBeNull();
});
it('chart order lines confirm while one-click is off and act at once while it is on',async()=>{
 for(const oneClick of [false,true]){
  hooks.cells=[];hooks.cursor=0;hooks.effects=[];
  const ui=setup(Promise.resolve(saved(workspace(oneClick))));await flush();
  const lines=find(ui.render(),(node:any)=>node.type===PaperChartLines).props;
  expect(lines.confirmActions).toBe(!oneClick);
  expect(typeof lines.onNotice).toBe('function');
  vi.unstubAllGlobals();
 }
});
void submitPaperOrder;
