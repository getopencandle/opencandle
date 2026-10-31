import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {bindPaneButtons,paneActions,paneLayoutRows,runPaneAction,PANE_CLUSTER_PILL} from '../../src/chart/pane-actions';
import {fakeDocument,velaChrome,type VelaChrome} from './scalex-harness';

// SCALEX pane actions through the pinned @luxalgo/vela 0.8.4 PanesControl and EngineOrchestrator pane
// methods (movePane, collapsePane, maximizePane, removePaneAndIndicators) over a real NativeRenderer, and pane button
// visibility on the renderer's own PaneControls class. SYNTHETIC registry records; the
// orchestrator's removeIndicator is a recorded stand-in (it tears down live indicator runtimes). No GUI claim.
let chrome:VelaChrome;
beforeAll(async()=>{chrome=await velaChrome();});
afterEach(()=>{vi.unstubAllGlobals();});

function chart(){
 const renderer=new NativeRenderer() as any;renderer.scheduler={invalidate(){},cancel(){}};
 const records=new Map<string,any>();
 const add=(id:string,paneId:string)=>records.set(id,{id,title:id,model:{paneId,title:id,ownScale:false},renderHandle:{id}});
 add('vol','price');add('rsi','pane-rsi');add('macd','pane-macd');add('atr','pane-atr');
 for(const [index,id] of ['price','pane-rsi','pane-macd','pane-atr'].entries()){const pane=renderer.scene.ensurePane(id,index?'study':'price',index,1);pane.bounds={top:index*100,height:100};}
 const orchestrator=Object.create(chrome.EngineOrchestrator.prototype);
 Object.assign(orchestrator,{renderer,registry:{all:()=>[...records.values()],get:(id:string)=>records.get(id)},paneOrder:['price','pane-rsi','pane-macd','pane-atr'],collapsedPanes:new Set(),maximizedPaneId:null,events:{emit(){}}});
 const removed:string[]=[];orchestrator.removeIndicator=(id:string)=>{removed.push(id);records.delete(id);orchestrator.forgetPane('pane-'+id);};
 const panes=new chrome.PanesControl(orchestrator);
 return{chart:{panes} as any,orchestrator,renderer,removed,records};
}
const order=(c:ReturnType<typeof chart>)=>c.chart.panes.list().map((row:any)=>row.id);

describe('SCALEX pane actions on the pinned pane controller',()=>{
 it('the price pane offers only maximize; study panes get move limits at the top and bottom',()=>{
  const c=chart();
  expect(paneActions(c.chart,'price').filter(row=>!row.disabled).map(row=>row.id)).toEqual(['maximize']);
  expect(paneActions(c.chart,'pane-rsi').map(row=>[row.id,!!row.disabled])).toEqual([['moveUp',true],['moveDown',false],['collapse',false],['maximize',false],['merge',false],['remove',false]]);
  expect(paneActions(c.chart,'pane-atr').find(row=>row.id==='moveDown')?.disabled).toMatch(/bottom/);
  expect(paneActions(c.chart,'nope').every(row=>row.disabled)).toBe(true);
 });
 it('move up and down reorder the panes and the saved layout rows follow',()=>{
  const c=chart();
  expect(runPaneAction(c.chart,'pane-macd','moveUp')).toEqual({ok:true});expect(order(c)).toEqual(['price','pane-macd','pane-rsi','pane-atr']);
  expect(runPaneAction(c.chart,'pane-macd','moveDown')).toEqual({ok:true});expect(order(c)).toEqual(['price','pane-rsi','pane-macd','pane-atr']);
  expect(runPaneAction(c.chart,'pane-rsi','moveUp')).toMatchObject({ok:false});expect(order(c)[0]).toBe('price');
  expect(paneLayoutRows(c.chart)).toEqual([{id:'price',order:0,collapsed:false,maximized:false},{id:'pane-rsi',order:1,collapsed:false,maximized:false},{id:'pane-macd',order:2,collapsed:false,maximized:false},{id:'pane-atr',order:3,collapsed:false,maximized:false}]);
 });
 it('collapse/expand and maximize/restore toggle and swap the offered action',()=>{
  const c=chart();
  expect(runPaneAction(c.chart,'pane-rsi','collapse')).toEqual({ok:true});expect(c.renderer.scene.panes.get('pane-rsi').collapsed).toBe(true);
  expect(paneActions(c.chart,'pane-rsi').map(row=>row.id)).toContain('expand');
  expect(runPaneAction(c.chart,'pane-rsi','expand')).toEqual({ok:true});expect(c.renderer.scene.panes.get('pane-rsi').collapsed).toBe(false);
  expect(runPaneAction(c.chart,'pane-macd','maximize')).toEqual({ok:true});expect(c.renderer.maximizedPaneId).toBe('pane-macd');
  expect(paneActions(c.chart,'pane-macd').map(row=>row.id)).toContain('restore');
  expect(runPaneAction(c.chart,'pane-macd','restore')).toEqual({ok:true});expect(c.renderer.maximizedPaneId).toBeNull();
  expect(runPaneAction(c.chart,'pane-rsi','expand')).toMatchObject({ok:false,message:/not available/});
 });
 it('remove takes the pane and its indicators; the price pane refuses',()=>{
  const c=chart();
  expect(runPaneAction(c.chart,'pane-atr','remove')).toEqual({ok:true});expect(c.removed).toEqual(['atr']);expect(order(c)).toEqual(['price','pane-rsi','pane-macd']);
  expect(runPaneAction(c.chart,'price','remove')).toMatchObject({ok:false,message:/price pane/});
 });
 it('a renderer without pane management refuses every action with its reason',()=>{
  const c=chart();c.renderer.capabilities={...c.renderer.capabilities,paneManagement:false};
  expect(paneActions(c.chart,'pane-rsi').every(row=>row.disabled==='This chart renderer cannot manage panes.')).toBe(true);
  expect(runPaneAction(c.chart,'pane-rsi','moveDown')).toMatchObject({ok:false});
 });
});

describe('SCALEX pane buttons visibility',()=>{
 function controls(){
  const doc=fakeDocument();vi.stubGlobal('document',doc);
  const views=[{id:'price',kind:'price',index:0,count:3,top:0,height:300,collapsed:false,maximized:false},{id:'a',kind:'study',index:1,count:3,top:303,height:100,collapsed:false,maximized:false},{id:'b',kind:'study',index:2,count:3,top:406,height:100,collapsed:true,maximized:false}];
  const instance=new chrome.PaneControls(doc.createElement('div'),{},{panes:()=>views,rightAxis:()=>64,onMove(){},onToggleCollapse(){},onToggleMaximize(){}});
  const renderer={paneControls:instance};
  const shown=()=>Object.fromEntries([...instance.clusters].map(([id,cluster]:any)=>[id,cluster.style.display]));
  return{instance,renderer,shown};
 }
 it('mouse over (default): only the hovered pane and state chips show',()=>{
  const {instance,renderer,shown}=controls(),bound=bindPaneButtons(renderer)!;
  expect(bound.mode()).toBe('mouseover');instance.setHoverPane('a');
  expect(shown()).toEqual({price:'none',a:'flex',b:'flex'});
 });
 it('always: every pane shows its full cluster; never: only the collapsed pane keeps its expand chip',()=>{
  const {instance,renderer,shown}=controls(),bound=bindPaneButtons(renderer)!;
  bound.set('always');expect(shown()).toEqual({price:'flex',a:'flex',b:'flex'});
  expect(instance.clusters.get('price').style.background).toBe(PANE_CLUSTER_PILL);
  bound.set('never');instance.setHoverPane('a');expect(shown()).toEqual({price:'none',a:'none',b:'flex'});
  const chip=[...instance.clusters.get('b').children].map((child:any)=>[child.dataset.role,child.style.visibility]);
  expect(chip.filter(([,visible])=>visible==='visible').map(([role])=>role)).toEqual(['collapse']);
  expect(()=>bound.set('hidden' as never)).toThrow();
  bound.dispose();expect(Object.hasOwn(instance,'reposition')).toBe(false);
 });
 it('a renderer without pane controls is reported (null)',()=>{expect(bindPaneButtons({paneControls:null})).toBeNull();});
});
