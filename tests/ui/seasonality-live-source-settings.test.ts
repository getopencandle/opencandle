import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorPortWithPrimarySource,seasonalityUsesLiveDailyHistory} from '../../src/chart/indicator-port';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {makeHarness,nativeHost,find,findAll,text} from './indicator-real-port-harness';
import {publishedSource} from '../fixtures/qualified-nyse-mtf-source';

// Actual provider/source/port membership and actual settings handlers. The
// native host and React hook cells are controlled. A pending constructor host
// intentionally grants NO accepted native frame, result or price permission.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void)=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;effect();}}
};});
const {scopes,renderIn,dialog}=makeHarness(hooks),cleanup:(()=>void)[]=[];
beforeEach(()=>scopes.clear());
afterEach(()=>{const errors:unknown[]=[];for(const close of cleanup.splice(0).reverse())try{close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Synthetic settings cleanup failed.');});
const DECLARATIONS=['Declared local source calendar','Declared local source session','Declared daily/monthly date labels','Local observations closed through (UTC)'];
async function live(){
 const fixture=await publishedSource();cleanup.push(()=>fixture.dispose());const selected=fixture.regular(),native=selected.bars.map(row=>({...row,time:row.time*1000})),host=nativeHost(native);let liveContext=true,library=createIndicatorLibrary();
 const context=sourceContextForDataset(selected,selected.bars),basis={};
 const primaryHost={capture:()=>liveContext?{basis,phase:'pending' as const,context,rows:selected.bars.length,style:'candle',execution:'ordinary',forming:false,assertCurrent(){if(!liveContext)throw Error('Synthetic source retired.');}}:null,accepted:()=>null,subscribeSettled:()=>()=>{}};
 const {port}=createIndicatorPortWithPrimarySource({chart:host.chart as any,primaryHost});cleanup.push(()=>port.dispose());const id=port.add('seasonality',factoryIndicatorDefault('seasonality').inputs,factoryIndicatorDefault('seasonality'));
 const chart={indicators:port,chart:host.chart,getCalculationBars:()=>selected.bars} as any,onClose=vi.fn(),apply=vi.fn((patch:any)=>{port.update(id,patch);return true;});
 const render=()=>renderIn('live-settings',()=>IndicatorSettings({row:port.list().find(row=>row.id===id)!,chart,library,assertCurrent(){if(!port.list().some(row=>row.id===id))throw Error('Synthetic instance retired.');},getLibrary:()=>library,onLibraryChange:(next:any)=>{library=next;return true;},onApply:apply,onMove:()=>true,label:'Seasonality',instances:port.list(),onCloseEditor:onClose} as any));
 const field=(name:string)=>find(render(),node=>node.props?.['aria-label']===name),click=(name:string)=>find(render(),node=>node.type==='button'&&text(node)===name).props.onClick();
 return{port,id,field,click,render,apply,onClose,edit:(name:string,value:string)=>field(name).props.onChange({target:{value}}),check:(name:string,checked:boolean)=>field(name).props.onChange({target:{checked}}),submit:()=>render().props.onSubmit({preventDefault(){}}),retire:()=>{liveContext=false;},get library(){return library;}};
}
it('genuine live source disables only local declarations while years and appearance remain editable',async()=>{
 const ui=await live();expect(seasonalityUsesLiveDailyHistory(ui.port,ui.id)).toBe(true);for(const name of DECLARATIONS)expect(ui.field(name).props.disabled,name).toBe(true);
 for(const name of ['Starting year','Last table year (OpenCandle)','Ignored months'])expect(ui.field(name).props.disabled,name).not.toBe(true);
 expect(text(ui.render())).toContain('Live history is requested from 2015.');expect(text(ui.render())).toContain('supported through 2028');expect(text(ui.render())).toContain('not the instrument\'s listing date');expect(text(ui.render())).toContain('not certified regular-session closes');
 ui.click('Style');for(const name of ['Table width (%)','Table height (%)','Table position','Show monthly projection boxes'])expect(ui.field(name).props.disabled,name).not.toBe(true);
});
it('direct stale local-field handler cannot change the accepted live declarations',async()=>{
 const ui=await live(),before=ui.port.serialize();ui.edit('Declared local source calendar','utc-continuous');expect(ui.field('Declared local source calendar').props.value).toBe('nyse');expect(ui.port.serialize()).toEqual(before);expect(text(ui.render())).toContain('selected live source supplies');
});
it('actual Apply retains requested1900 and local declarations while applying appearance',async()=>{
 const ui=await live(),before={...ui.port.list()[0].inputs};ui.edit('Starting year','1900');ui.click('Style');ui.edit('Table width (%)','55');ui.check('Show monthly projection boxes',false);ui.submit();
 expect(ui.apply).toHaveBeenCalledOnce();expect(ui.port.list()[0].inputs).toMatchObject({startYear:1900,tableWidth:55,projectionGeometry:false,calendar:before.calendar,session:before.session,dateLabels:before.dateLabels,closedThrough:before.closedThrough});
});
it('Cancel discards only the live source year and Style drafts',async()=>{
 const ui=await live(),before=ui.port.serialize();ui.edit('Starting year','1900');ui.click('Style');ui.edit('Table width (%)','55');ui.click('Cancel');expect(ui.onClose).toHaveBeenCalledOnce();expect(ui.apply).not.toHaveBeenCalled();expect(ui.port.serialize()).toEqual(before);
});
it('Save as default retains requested1900 without applying the instance draft',async()=>{
 const ui=await live(),before=ui.port.serialize();ui.edit('Starting year','1900');ui.click('Save as default');expect(ui.library.defaults.seasonality?.inputs.startYear).toBe(1900);expect(ui.port.serialize()).toEqual(before);expect(ui.apply).not.toHaveBeenCalled();
});
it('source retirement re-enables retained local declarations without silently changing the draft',async()=>{
 const ui=await live();ui.edit('Starting year','1900');const before=ui.port.serialize();ui.retire();expect(seasonalityUsesLiveDailyHistory(ui.port,ui.id)).toBe(false);for(const name of DECLARATIONS)expect(ui.field(name).props.disabled,name).not.toBe(true);expect(ui.field('Starting year').props.value).toBe('1900');expect(ui.port.serialize()).toEqual(before);
});
it('copied and proxy ports cannot claim the descriptive live mode or run supplied property traps',async()=>{
 const ui=await live(),trap=vi.fn(()=>{throw Error('Foreign port property read.');});expect(seasonalityUsesLiveDailyHistory({...ui.port},ui.id)).toBe(false);expect(seasonalityUsesLiveDailyHistory(new Proxy(ui.port,{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap}),ui.id)).toBe(false);expect(trap).not.toHaveBeenCalled();expect(seasonalityUsesLiveDailyHistory(ui.port,'missing')).toBe(false);
});
it('ordinary local source preserves editable declarations and the existing source explanation',()=>{
 const ui=dialog({seed:['seasonality'],initialSelected:0});cleanup.push(()=>ui.port.dispose());for(const name of DECLARATIONS)expect(ui.sField(name).props.disabled,name).not.toBe(true);expect(ui.sText()).toContain('original daily or monthly source');expect(ui.sText()).not.toContain('Live history is requested from 2015.');expect(findAll(ui.render(),node=>node.props?.['aria-label']==='Indicator timeframe')).toHaveLength(0);
});
