import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';

// The Profiles tab of the ACTUAL IndicatorDialog over the REAL indicator port (in-memory native host).
// Component-handler evidence only; no DOM, focus or GUI claim. SYNTHETIC fixture bars.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

describe(' Profiles tab',()=>{
 it('lists the two volume profiles, each adds an instance; the Indicators tab no longer lists them',()=>{
  const ui=dialog();
  expect(findAll(ui.render(),node=>node.type==='button'&&String(node.props['aria-label']??'').includes('volume profile'))).toEqual([]);
  find(ui.render(),node=>node.props?.role==='tab'&&text(node)==='Profiles').props.onClick();
  const entries=findAll(ui.render(),node=>node.props?.['data-selector-entry']);
  // + Auto anchored, Session and Session HD volume profiles; + Auto fib range volume profile.
  expect(entries.map(node=>text(node))).toEqual(['Auto anchored volume profile','Auto fib range volume profile','Periodic volume profile','Session volume profile','Session volume profile HD','Visible range volume profile']);
  expect(entries.every(node=>node.props.disabled===false)).toBe(true);
  find(ui.render(),node=>node.props?.['data-selector-entry']==='vrvp').props.onClick();
  find(ui.render(),node=>node.props?.['data-selector-entry']==='pvp').props.onClick();
  expect(ui.port.list().map(row=>row.kind)).toEqual(['vrvp','pvp']);
  for(const kind of ['svp','svphd','aavp'])find(ui.render(),node=>node.props?.['data-selector-entry']===kind).props.onClick();
  expect(ui.port.list().map(row=>row.kind)).toEqual(['vrvp','pvp','svp','svphd','aavp']);
  expect(ui.port.list()[0].series.map(row=>row.id)).toEqual(['poc','vah','val','devPoc','devVah','devVal']);// developing plots
 });
 it('the settings inputs are the profile inputs, with the fact titles',()=>{
  expect(indicatorInputSchema('vrvp').map(field=>field.title)).toEqual(expect.arrayContaining(['Rows Layout','Row Size','Volume','Value Area Volume','Placement','Width (% of the box)']));
  expect(indicatorInputSchema('pvp').map(field=>field.title)).toContain('Period');
 });
});
