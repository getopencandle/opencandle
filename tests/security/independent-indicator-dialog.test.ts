import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import type {ChartController} from '../../src/chart/adapter';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.writes++;hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
it('keeps the catalog usable after StrictMode effect setup cleanup setup replay',()=>{
 const add=vi.fn(()=> 'new'),props={chart:{indicators:{catalog:['sma'],add,list:()=>[]}} as unknown as ChartController,instances:[],library:createIndicatorLibrary(),ownerToken:{},onLibraryChange:vi.fn(),onClose:vi.fn(),onChange:vi.fn()};
 const render=()=>{hooks.cursor=0;return IndicatorDialog(props);};render();const effect=hooks.effects[0],cleanup=effect() as ()=>void;cleanup();effect();
 find(render(),node=>node.props['aria-label']==='Add Simple Moving Average').props.onClick();expect(add).toHaveBeenCalledOnce();
});
it('keeps the settings editor usable after StrictMode effect replay',()=>{
 const row:IndicatorInstanceView={id:'rsi-review',kind:'rsi',...factoryIndicatorDefault('rsi'),rendererId:'native-review',diagnostics:[],policies:[],series:[{id:'rsi',label:'RSI'}],paneId:'pane',informationBars:2,latestInformationTime:1,presentationDiagnostics:[]};
 const library=createIndicatorLibrary(),apply=vi.fn(()=>true),props={row,chart:{indicators:{inputSchema:indicatorInputSchema,list:()=>[row]}} as unknown as ChartController,library,assertCurrent(){},getLibrary:()=>library,onLibraryChange:vi.fn(),onApply:apply,onMove:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return IndicatorSettings(props);};render();const effect=hooks.effects[0],cleanup=effect() as ()=>void;cleanup();effect();render().props.onSubmit({preventDefault(){}});expect(apply).toHaveBeenCalledOnce();
});
it('does not publish selection or refresh after native add reentrantly retires the parent',()=>{
 let active=true;const changed=vi.fn(),add=vi.fn(()=>{active=false;return 'new';}),props={chart:{indicators:{catalog:['sma'],add,list:()=>[]}} as unknown as ChartController,instances:[],library:createIndicatorLibrary(),ownerToken:{},assertOwner(){if(!active)throw Error('Parent retired');},onLibraryChange:vi.fn(),onClose:vi.fn(),onChange:changed};
 hooks.cursor=0;const opening=IndicatorDialog(props),writes=hooks.writes;find(opening,node=>node.props['aria-label']==='Add Simple Moving Average').props.onClick();expect(add).toHaveBeenCalledOnce();expect(changed).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});
