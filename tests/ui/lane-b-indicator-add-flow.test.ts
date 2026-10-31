import {beforeEach,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {stepCatalogActive as step,catalogAcronym} from '../../src/ui/indicator-dialog-model';

// Type, arrow to the row, Enter adds; friendly acronym column. Model and handler evidence only (no DOM).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const stepCatalogActive=(rows:string[],active:string|null,k:string)=>step(rows as any,active as any,k) as string|null;
const key=(name:string)=>({key:name,preventDefault(){}});

it('stepCatalogActive moves within the list without wrapping and supports Home and End',()=>{
 const rows=['a','b','c'];
 expect(stepCatalogActive(rows,null,'ArrowDown')).toBe('a');expect(stepCatalogActive(rows,'a','ArrowDown')).toBe('b');expect(stepCatalogActive(rows,'c','ArrowDown')).toBe('c');
 expect(stepCatalogActive(rows,null,'ArrowUp')).toBe('c');expect(stepCatalogActive(rows,'b','ArrowUp')).toBe('a');expect(stepCatalogActive(rows,'a','ArrowUp')).toBe('a');
 expect(stepCatalogActive(rows,'b','Home')).toBe('a');expect(stepCatalogActive(rows,'a','End')).toBe('c');
 expect(stepCatalogActive([],null,'ArrowDown')).toBeNull();expect(stepCatalogActive(rows,'gone','ArrowDown')).toBe('a');
});
it('catalogAcronym is the friendly short title, not the upper-cased id',()=>{
 expect(catalogAcronym('stochrsi')).toBe('Stoch RSI');expect(catalogAcronym('sma')).toBe('SMA');
});
it('typing then ArrowDown and Enter adds the highlighted indicator and keeps the search box in charge',()=>{
 const ui=dialog();
 const search=()=>find(ui.render(),node=>node.props?.['aria-label']==='Search indicators');
 search().props.onChange({target:{value:'relative'}});
 search().props.onKeyDown(key('ArrowDown'));
 const active=findAll(ui.render(),node=>node.props?.['data-active']==='true');
 expect(active).toHaveLength(1);expect(text(active[0])).toContain('Relative Strength Index');
 expect(search().props['aria-activedescendant']).toBe(active[0].props.id);
 search().props.onKeyDown(key('Enter'));
 expect(ui.port.list().map(row=>row.kind)).toEqual(['rsi']);
});
it('Enter with a search term but no arrow press adds the first match; Enter on an empty list adds nothing',()=>{
 const ui=dialog();
 const search=()=>find(ui.render(),node=>node.props?.['aria-label']==='Search indicators');
 search().props.onChange({target:{value:'zzzz'}});search().props.onKeyDown(key('Enter'));
 expect(ui.port.list()).toHaveLength(0);
 search().props.onChange({target:{value:'bollinger'}});search().props.onKeyDown(key('Enter'));
 expect(ui.port.list().map(row=>row.kind)).toEqual(['bb']);
});
it('the catalog shows the friendly acronym column and a new Volume overlays the price pane',()=>{
 const ui=dialog();
 const add=find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Add Stochastic RSI');
 expect(text(find(add,node=>node.type==='strong'))).toBe('Stoch RSI');
 ui.click('Add Volume');
 expect(ui.port.list()[0].paneId).toBe('price');
});
it('Add puts the indicator on the chart with defaults and leaves the dialog without an open editor, ready for the next Add',()=>{
 const ui=dialog();
 ui.click('Add Simple Moving Average');ui.click('Add Relative Strength Index');
 expect(ui.port.list().map(row=>row.kind)).toEqual(['sma','rsi']);
 const tree=ui.render();
 expect(findAll(tree,node=>node.props?.['aria-label']==='Search indicators')).toHaveLength(1);
 expect(findAll(tree,node=>node.type==='button'&&String(node.props?.['aria-label']??'').startsWith('Add ')).length).toBeGreaterThan(1);
 const statuses=findAll(tree,node=>node.props?.role==='status').map(text).join(' ');
 expect(statuses).toContain('Relative Strength Index added');expect(statuses).not.toContain('settings are open');
 expect(findAll(tree,node=>node.props?.['aria-pressed']===true&&String(node.props?.['aria-label']??'').startsWith('Edit '))).toHaveLength(0);
});
