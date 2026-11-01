import {readFileSync} from 'node:fs';
import {beforeEach,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';

// Release 6 tour: the indicator catalog showed the acronym and the name run together ("SMASimple Moving
// Average"). The stylesheet grid targeted .indicator-catalog>button, but each entry is now a row (favorite star + add
// button), so the grid never applied. The row and the add button now carry their own layout. Model evidence of the
// rendered structure and inline layout only; no DOM layout engine, screenshot or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

const css=readFileSync('src/ui/indicator-picker.css','utf8');
const rule=(selector:string)=>{const m=css.split('\n').find(line=>line.startsWith('[data-lv-picker] '+selector+'{'));expect(m,selector).toBeTruthy();return m as string;};

it('catalog entries lay out the acronym and the name as separate columns',()=>{
 const ui=dialog();
 const tree=ui.render();
 const row=find(tree,node=>node.type==='div'&&Array.isArray(node.props.children)&&node.props.children.some((child:any)=>child?.props?.['aria-label']==='Add Simple Moving Average'));
 expect(String(row.props.className)).toContain('indicator-catalog-row');
 // Layout moved from inline styles into indicator-picker.css (no inline styling on rows).
 expect(row.props.style).toBeUndefined();
 expect(rule('.indicator-catalog-row')).toMatch(/display:flex;align-items:center/);expect(rule('.indicator-catalog-row')).toContain('flex-wrap:nowrap');
 const add=find(tree,node=>node.type==='button'&&node.props['aria-label']==='Add Simple Moving Average');
 expect(add.props.style).toBeUndefined();
 expect(rule('.lv-picker-add')).toMatch(/display:flex;align-items:center;gap:12px/);expect(rule('.lv-picker-add')).toContain('min-width:0');
 // The name carries the standard acronym, so this row has no separate short-title column.
 const name=find(add,node=>node.type==='span');
 expect(findAll(add,node=>node.type==='strong')).toEqual([]);
 expect(name.props.className).toBe('indicator-catalog-name');expect(text(name)).toBe('Simple Moving Average (SMA)');
 // A row without a standard acronym keeps the short-title column.
 const stoch=find(tree,node=>node.type==='button'&&node.props['aria-label']==='Add Stochastic Oscillator');
 const acronym=find(stoch,node=>node.type==='strong'),stochName=find(stoch,node=>node.type==='span');
 expect(acronym.props.className).toBe('indicator-catalog-acronym');expect(text(acronym)).toBe('Stoch');
 expect(rule('.indicator-catalog-acronym')).toContain('flex:none');
 expect(stochName.props.className).toBe('indicator-catalog-name');expect(text(stochName)).toBe('Stochastic Oscillator');
 expect(rule('.indicator-catalog-name')).toMatch(/flex:1;min-width:0/);
});
