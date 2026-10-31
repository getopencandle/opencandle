import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {StrategyDialog} from '../../src/ui/StrategyDialog';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {scriptExecutionIdentity} from '../../src/ui/script-input';

// App-level regression for an effect-ordering bug. React runs child effects before the
// parent's, so a strategy result the script owner delivers in the same commit that changed the bindings (adding a strategy)
// must not be wiped by an App effect keyed on that change. Actual App closures under controlled hooks (the startup-recovery
// harness): effects queued by a render run only when the test flushes them, after the result is delivered, which is the
// order React uses. SYNTHETIC workspace, bars and strategy results; no DOM or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps??[];hooks.effects.push(fn);}}};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const strategy=(id:string,name:string)=>({id,documentId:id+'-document',version:1,name,source:`({onBar(ctx){/* ${name} synthetic */}})`,pane:'price' as const,visible:true,plots:{}});
/** The saved library holds the two strategy documents (the chooser lists bindings whose document is a strategy). */
function saved(){const initial=createInitialWorkspace(),docs=[strategy('strat-a','Synthetic A strategy'),strategy('strat-b','Synthetic B strategy')].map(row=>({id:row.documentId,name:row.name,source:row.source,pane:row.pane,kind:'strategy' as const,history:[]}));
 return{ok:true,value:{schemaVersion:1,revision:7,savedAt:'2026-10-28T14:00:00Z',data:prepareWorkspaceJSON({...initial,scriptLibrary:{...initial.scriptLibrary,documents:[...initial.scriptLibrary.documents,...docs]},paper:createPaperAccount({initialBalance:321}),alerts:[]}),storage:{directory:'Synthetic strat-gui profile',backend:'json-atomic'}}};}

function setup(){
 const bridge={loadWorkspace:vi.fn(async()=>saved()),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:input.expectedRevision+1,savedAt:'2026-10-28T14:00:01Z'}})),executeScript:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];boot();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 /** React's post-commit pass: every effect the last renders queued, in order. Effects for absent DOM ports may throw. */
 const runEffects=()=>{for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const tester=()=>{const found=find(render(),node=>node.type===StrategyDialog);if(found)return found.props;button('Strategy tester').props.onClick();return find(render(),node=>node.type===StrategyDialog).props;};
 return{render,grid,button,runEffects,tester};
}
function resultFor(ui:ReturnType<typeof setup>,binding:ReturnType<typeof strategy>,label:string){
 const grid=ui.grid(),data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId),source=sourceContextForDataset(data,grid.activeBars);
 return{bindingId:binding.id,result:{plots:[],orders:[],alerts:[],diagnostics:[],provenance:{kind:'synthetic',label}},bars:grid.activeBars.map((bar:any)=>({...bar})),barIds:grid.activeBars.map((_:any,index:number)=>'synthetic:'+index),sourceCode:binding.source,identity:scriptExecutionIdentity(source,'candles','ordinary'),fixture:true};
}
/** Adds `bindings` to the active cell through the grid's own change route and renders, so App queues its post-commit effects. */
function addBindings(ui:ReturnType<typeof setup>,bindings:any[]){const before=ui.grid(),next=structuredClone(before.state),id=next.layout.activeCellId;next.cells[id].scriptBindings=bindings;expect(before.onChange(next)).toBe(true);ui.render();return id;}

beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('a strategy result delivered in the same commit as the bindings change survives the parent effects (single strategy)',async()=>{
 const ui=setup();await flush();ui.runEffects();
 const binding=strategy('strat-a','Synthetic A strategy'),id=addBindings(ui,[binding]);
 expect(hooks.effects.length).toBeGreaterThan(0);// the bindings change queued App effects for this commit
 ui.grid().onScriptResult(resultFor(ui,binding,'Synthetic A result'),id);// child effect: the script owner delivers first
 ui.runEffects();ui.render();ui.runEffects();// then the parent's effects of the same commit
 const execution=ui.tester().execution;
 expect(execution).not.toBeNull();expect(execution.result.provenance.label).toBe('Synthetic A result');
 expect(text(ui.render())).not.toContain('Add a strategy to see results');
});

it('with two strategies the chooser replays each kept run, and a later bindings commit keeps the shown report',async()=>{
 const ui=setup();await flush();ui.runEffects();
 const a=strategy('strat-a','Synthetic A strategy'),b=strategy('strat-b','Synthetic B strategy'),id=addBindings(ui,[a,b]);
 ui.grid().onScriptResult(resultFor(ui,a,'Synthetic A result'),id);ui.grid().onScriptResult(resultFor(ui,b,'Synthetic B result'),id);ui.runEffects();
 const first=ui.tester();expect(first.strategies.map((row:any)=>row.id)).toEqual(['strat-a','strat-b']);
 expect(first.execution.result.provenance.label).toBe('Synthetic A result');
 first.onSelectStrategy('strat-b');ui.runEffects();expect(ui.tester().execution.result.provenance.label).toBe('Synthetic B result');expect(ui.tester().selectedStrategy).toBe('strat-b');
 ui.tester().onSelectStrategy('strat-a');ui.runEffects();expect(ui.tester().execution.result.provenance.label).toBe('Synthetic A result');
 // Renaming B is a bindings-only commit; the A report shown must not be cleared by it.
 addBindings(ui,[a,{...b,name:'Synthetic B renamed'}]);ui.runEffects();ui.render();ui.runEffects();
 expect(ui.tester().execution?.result.provenance.label).toBe('Synthetic A result');
});

it('no App effect clears the strategy report (the STRAT-DIAG source shape stays fixed)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 const effects=[...app.matchAll(/useEffect\(\(\)=>\{/g)].map(match=>{let depth=0,at=match.index!+'useEffect('.length;for(;at<app.length;at++){const c=app[at];if(c==='('||c==='{'||c==='[')depth++;else if(c===')'||c==='}'||c===']'){if(depth===0)break;depth--;}}return app.slice(match.index!,at);});
 expect(effects.length).toBeGreaterThan(10);
 expect(effects.filter(body=>body.includes('setStrategyExecution(null)'))).toEqual([]);
 expect(app).not.toContain('strategySources');
 const exec=app.slice(app.indexOf('function scriptExecution('),app.indexOf('function scriptExecution(')+400);
 expect(exec.indexOf('forgetStrategyRunsOnInput(')).toBeGreaterThan(0);expect(exec.indexOf('forgetStrategyRunsOnInput(')).toBeLessThan(exec.indexOf('rememberStrategyRun('));
});
