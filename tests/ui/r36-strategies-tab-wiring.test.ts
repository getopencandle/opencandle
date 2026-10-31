import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {BUILTIN_STRATEGY_SELECTOR_ROWS} from '../../src/domain/builtin-strategies/catalog';

// The Strategies tab lists the built-in strategies and routes a click to the host's add route, over the
// actual IndicatorDialog and the REAL indicator port (the R4 harness). Component-handler evidence only; no DOM, focus,
// GUI or package claim. SYNTHETIC fixtures.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

function selector(extra:Record<string,unknown>={}){
 const ui=dialog({seed:['sma']});Object.assign(ui.props,extra);
 const sidebar=()=>findAll(ui.render(),node=>node.type==='button'&&typeof node.props['data-qa']==='string'&&node.props['data-qa'].startsWith('indicator-sidebar-item-'));
 const item=(id:string)=>find(ui.render(),node=>node.props?.['data-qa']==='indicator-sidebar-item-'+id);
 const tabs=()=>findAll(ui.render(),node=>node.props?.role==='tab');
 const tab=(label:string)=>find(ui.render(),node=>node.props?.role==='tab'&&text(node)===label);
 const entries=()=>findAll(ui.render(),node=>node.props?.['data-selector-entry']).map(node=>node.props['data-selector-entry']);
 const empty=()=>text(find(ui.render(),node=>node.props?.['data-selector-empty']));
 return Object.assign(ui,{sidebar,item,tabs,tab,entries,empty});
}

describe(' Strategies tab built-ins',()=>{
 it('lists the 23 built-ins before saved strategies and a click hands the built-in id to the host',()=>{
  const add=vi.fn(),open=vi.fn(),ui=selector({strategies:BUILTIN_STRATEGY_SELECTOR_ROWS,onAddStrategy:add,scripts:[{id:'s-1',name:'Synthetic cross strategy',kind:'strategy'}],onOpenScript:open});
  ui.tab('Strategies').props.onClick();
  expect(ui.entries()).toEqual([...BUILTIN_STRATEGY_SELECTOR_ROWS.map(row=>row.id),'s-1']);
  find(ui.render(),node=>node.props?.['data-selector-entry']==='builtin-strategy:supertrend').props.onClick();
  expect(add).toHaveBeenCalledWith('builtin-strategy:supertrend');expect(open).not.toHaveBeenCalled();
  expect(text(find(ui.render(),node=>node.props?.['data-selector-entry']==='builtin-strategy:rsi'))).toBe('RSI strategy');
 });
 it('without the host route a built-in row is disabled with a reason',()=>{
  const ui=selector({strategies:BUILTIN_STRATEGY_SELECTOR_ROWS});
  ui.tab('Strategies').props.onClick();
  const entry=find(ui.render(),node=>node.props?.['data-selector-entry']==='builtin-strategy:macd');
  expect(entry.props.disabled).toBe(true);expect(entry.props.title).toMatch(/strateg/i);
  expect(findAll(ui.render(),node=>node.props?.['data-selector-entry']).length).toBe(23);
 });
});
