import {afterEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {seasonalityUsesLiveDailyHistory} from '../../src/chart/indicator-port';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {ownedSourceFixture} from '../fixtures/seasonality-live-owned-source';
import {publishedSource} from '../fixtures/qualified-nyse-mtf-source';
import {makeHarness,find,text} from './indicator-real-port-harness';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const close=effect();if(typeof close==='function')hooks.effects.push(close);}}
};});
const {scopes,renderIn}=makeHarness(hooks),cleanups:(()=>void)[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const close of [...hooks.effects.splice(0).reverse(),...cleanups.splice(0).reverse()])try{close();}catch(error){failures.push(error);}scopes.clear();vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'Unsupported-style source UI cleanup failed.');});

// Actual provider and owned adapter/port. The unsupported native capture stays
// null; this is component-handler/descriptive evidence, never numerical or GUI.
it.each(['renko','range'] as const)('genuine %s source retains daily-policy help and locked local declarations without a numeric frame',async style=>{
 const producer=await publishedSource();cleanups.push(()=>producer.dispose());const f=await ownedSourceFixture({dataset:producer.raw()});cleanups.push(()=>f.dispose());f.port.remove(f.id);f.style(style);const id=f.port.add('seasonality',factoryIndicatorDefault('seasonality').inputs,factoryIndicatorDefault('seasonality'));
 expect(f.host.capture()).toBeNull();expect(seasonalityUsesLiveDailyHistory(f.port,id)).toBe(true);expect(f.port.captureReadout!(id).state).toBe('unavailable');expect(f.port.list().find(row=>row.id===id)!.diagnostics.join(' ')).toContain('Use Candles or Heikin Ashi.');const before=f.port.serialize(),library=createIndicatorLibrary(),closed=vi.fn(),apply=vi.fn(()=>true),chart={indicators:f.port,chart:f.chart,getCalculationBars:()=>f.raw()} as any;
 const render=()=>renderIn('unsupported-settings',()=>IndicatorSettings({row:f.port.list().find(row=>row.id===id)!,chart,library,assertCurrent(){if(!f.port.list().some(row=>row.id===id))throw Error('Owned C retired.');},getLibrary:()=>library,onLibraryChange:()=>true,onApply:apply,onMove:()=>true,label:'Seasonality',instances:f.port.list(),onCloseEditor:closed} as any));
 for(const label of ['Declared local source calendar','Declared local source session','Declared daily/monthly date labels','Local observations closed through (UTC)'])expect(find(render(),node=>node.props?.['aria-label']===label).props.disabled).toBe(true);
 expect(text(render())).toContain('Live history is requested from 2015.');expect(find(render(),node=>node.props?.['aria-label']==='Starting year').props.disabled).not.toBe(true);
 find(render(),node=>node.props?.['aria-label']==='Declared local source calendar').props.onChange({target:{value:'utc-continuous'}});expect(f.port.serialize()).toEqual(before);find(render(),node=>node.type==='button'&&text(node)==='Cancel').props.onClick();expect(closed).toHaveBeenCalledOnce();expect(apply).not.toHaveBeenCalled();expect(f.port.serialize()).toEqual(before);
});
