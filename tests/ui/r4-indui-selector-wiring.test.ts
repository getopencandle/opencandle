import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {SELECTOR_SIDEBAR,TECHNICALS_TABS,FUNDAMENTALS_TABS,selectorView} from '../../src/domain/indicator-selector-catalog';

// R4 root wiring of the selector (sidebar groups, Technicals and Fundamentals tabs, entries and empty states) into
// the actual IndicatorDialog over the REAL indicator port. Written before the dialog wiring. Component-handler evidence
// only; no DOM, focus, GUI or package claim. SYNTHETIC fixtures.
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

describe('R4 indicator selector sidebar and tabs',()=>{
 it('renders the sidebar groups and items in fact order with Technicals selected and its tab strip',()=>{
  const ui=selector();
  expect(ui.sidebar().map(node=>node.props['data-qa'])).toEqual(SELECTOR_SIDEBAR.flatMap(group=>group.items.filter(row=>row.id!=='purchased').map(row=>row.qaId)));
  expect(ui.sidebar().map(node=>text(node))).toEqual(['My scripts','Technicals','Fundamentals']);
  expect(ui.item('built-ins').props['aria-pressed']).toBe(true);
  expect(ui.tabs().map(node=>text(node))).toEqual(TECHNICALS_TABS.map(row=>row.label));
  expect(ui.tab('Indicators').props['aria-selected']).toBe(true);
  // The Indicators tab keeps the LV All / Favorites strip and the add rows beside the sidebar.
  expect(findAll(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Add Simple Moving Average').length).toBe(1);
  expect(text(ui.render())).not.toContain('Community');
 });
 it('Strategies lists flagged LVScript strategies, and shows the LV empty state without one',()=>{
  const open=vi.fn(),ui=selector({scripts:[{id:'s-1',name:'Synthetic cross strategy',kind:'strategy'},{id:'i-1',name:'Synthetic plot',kind:'indicator'}],onOpenScript:open});
  ui.tab('Strategies').props.onClick();
  expect(ui.entries()).toEqual(['s-1']);
  find(ui.render(),node=>node.props?.['data-selector-entry']==='s-1').props.onClick();expect(open).toHaveBeenCalledWith('s-1');
  const none=selector({scripts:[]});none.tab('Strategies').props.onClick();
  expect(none.entries()).toEqual([]);expect(none.empty()).toMatch(/No strategies yet/);
 });
 it('My scripts lists every LVScript; Purchased is hidden (FIX-FINAL-1030) and its view keeps its empty state',()=>{
  const ui=selector({scripts:[{id:'i-1',name:'Synthetic plot',kind:'indicator'}],onOpenScript:vi.fn()});
  ui.item('my-scripts').props.onClick();expect(ui.tabs()).toEqual([]);expect(ui.entries()).toEqual(['i-1']);
  expect(()=>ui.item('purchased')).toThrow();expect(selectorView({indicators:[],scripts:[]},{item:'purchased',query:''}).empty).toEqual({kind:'empty',text:expect.stringMatching(/no store/)});
 });
 it('Fundamentals shows its tabs and local statement metrics that open the fundamentals view',()=>{
  const open=vi.fn(),ui=selector({onOpenMetric:open});
  ui.item('fundamentals').props.onClick();
  expect(ui.tabs().map(node=>text(node))).toEqual(FUNDAMENTALS_TABS.map(row=>row.label));
  expect(ui.entries().length).toBeGreaterThan(0);
  find(ui.render(),node=>node.props?.['data-selector-entry']===ui.entries()[0]).props.onClick();expect(open).toHaveBeenCalledWith(ui.entries()[0]);
  ui.tab('Forecasts').props.onClick();expect(ui.empty()).toMatch(/estimate source/);
 });
 it('search filters the selected tab and a miss reads as no match',()=>{
  const ui=selector({scripts:[{id:'s-1',name:'Synthetic cross strategy',kind:'strategy'}],onOpenScript:vi.fn()});
  ui.tab('Strategies').props.onClick();
  find(ui.render(),node=>node.props?.['aria-label']==='Search indicators').props.onChange({target:{value:'zzz'}});
  expect(ui.entries()).toEqual([]);expect(ui.empty()).toMatch(/No matching/);
 });
 it('entries without a host route are disabled with a reason, never silently inert',()=>{
  const ui=selector({scripts:[{id:'s-1',name:'Synthetic cross strategy',kind:'strategy'}]});
  ui.tab('Strategies').props.onClick();
  const entry=find(ui.render(),node=>node.props?.['data-selector-entry']==='s-1');
  expect(entry.props.disabled).toBe(true);expect(entry.props.title).toMatch(/\S/);
 });
 it('initialTab opens the selected instance editor on that tab (legend Visibility on intervals)',()=>{
  const ui=dialog({seed:['sma'],initialSelected:0});Object.assign(ui.props,{initialTab:'Visibility'});
  const element=findAll(ui.render(),node=>node.type===IndicatorSettings)[0];
  expect(element.props.initialTab).toBe('Visibility');
 });
});
