import {beforeEach,expect,it,vi} from 'vitest';
import {isProfileIndicator,isPatternIndicator} from '../../src/domain/indicator-selector-catalog';
import {CATALOG_INDICATORS,CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {INDICATOR_KINDS,indicatorDefaults} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {instantiateIndicatorTemplate,saveIndicatorTemplate,createIndicatorTemplates} from '../../src/ui/indicator-templates';
import {indicatorDecorationId} from '../../src/chart/indicator-presentation';
import {makeHarness,realChart,valuesOf,expected,settingsOf,findAll} from './indicator-real-port-harness';

// L1 phase 2: the extended built-ins through the ACTUAL Indicators dialog handlers on the REAL port (minimal native
// host). Value comparisons use the same domain calculator, so they are behavioral, not numerical, evidence; the
// numerical evidence is tests/domain/indicator-catalog-oracles.test.ts.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

it('the Indicators dialog lists all 82 non-profile built-ins and searches the new ones by name or acronym',()=>{
 const ui=dialog(),buttons=findAll(ui.render(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Add '));
 expect(INDICATOR_KINDS).toHaveLength(223);// +12 kinds (Bollinger Bands breach, DI cross signals, MACD divergence, RSI failure swings, Anchored VWAP, Session VWAPs, Opening range breakout, Relative volume, Support and resistance zones, Adaptive trend channel, Auto fib multi-scale, Auto fib range volume profile).// +3 kinds (Sequential 9-13, Hull Suite, KDJ).// +10 kinds (Volatility close-to-close / O-H-L-C / index, MA multiple, EMA cross, SMI ergodic oscillator, Ratio, Correlation - Log, Multi-time period charts, Performance).// +10 kinds (Gaps, Bollinger bars, Moon phases, Rob Booker intraday pivots / Knoxville / missed pivots / reversal / Ziv ghost pivots, Auto fib extension, Auto pitchfork).// +10 Indicators tab kinds (RCI ribbon, 24-hour volume, MA channel, Standard error, MA Hamming, Majority rule, Volatility zero trend, Typical/Average/Median price).// IND-REPLAY-1028: +7 Indicators tab kinds (SMI, RCI, Trend strength, TWAP, ASI, AC, Chaikin volatility).// G1-GAPS: +1 Auto Elliott waves (visual-only).// AUTOTREND: +1 Auto trendlines (Indicators tab, visual-only).//: four chart-data (+1 Seasonality registration, Oct 25) studies added; catalog count only, existing behavior assertions retained.//: +14 Indicators tab kinds.//: +6 Patterns tab chart kinds (flags, pennants, cup and handle).//: +3 Profiles tab kinds (Session, Session HD and Auto anchored volume profile).//: +56 Patterns tab kinds (listed in the Patterns tab, not here; tests/chart/r36-pattern-presentation.test.ts).//: +3 (MA Cross, Volatility stop, Chop zone).//: +3 second-symbol kinds.//: the two volume profiles are listed in the Profiles tab, not here (tests/ui/r24-vp-dialog.test.ts).// Rows are alphabetical by name, ignoring case.
 expect(buttons.map(node=>node.props['aria-label'])).toEqual([...INDICATOR_KINDS].filter(kind=>!isProfileIndicator(kind)&&!isPatternIndicator(kind)).sort((a,b)=>indicatorNames[a].localeCompare(indicatorNames[b],'en',{sensitivity:'base'})).map(kind=>'Add '+indicatorNames[kind]));
 find(ui.render(),'Search indicators').props.onChange({target:{value:'supertrend'}});expect(findAll(ui.render(),node=>String(node.props?.['aria-label']??'').startsWith('Add ')).map(node=>node.props['aria-label'])).toEqual(['Add Supertrend']);
 find(ui.render(),'Search indicators').props.onChange({target:{value:'%r'}});expect(findAll(ui.render(),node=>String(node.props?.['aria-label']??'').startsWith('Add ')).map(node=>node.props['aria-label'])).toEqual(['Add Williams percent range']);
});
const find=(tree:any,label:string)=>findAll(tree,node=>node.props?.['aria-label']===label)[0];

// The kinds run this flow on a longer synthetic fixture (tests/ui/r23-indicator-lifecycle.test.ts).
it.each(CATALOG_INDICATORS.filter(definition=>(CATALOG_INDICATOR_IDS as readonly string[]).includes(definition.id)).map(definition=>[definition.id,definition] as const))('%s: add with documented/flagged defaults, default pane, edit, invalid value, hide/show, remove, restart and template',(kind,definition)=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames[kind]);let rows=ui.port.list();const row=rows[0];
 expect(row.inputs).toEqual(Object.fromEntries(definition.inputs.map(input=>[input.key,input.defval])));expect(settingsOf(row)).toEqual({kind,...factoryIndicatorDefault(kind)});
 expect(row.series.map(series=>series.id)).toEqual(definition.plots.map(plot=>plot.id));expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,row.inputs));
 expect(valuesOf(ui.port,row.id).some(series=>series.values.some(value=>value!==null))).toBe(true);expect(row.diagnostics).toEqual([]);
 if(definition.overlay)expect(row.paneId).toBe('price');else expect(row.paneId).not.toBe('price');
 // Edit the first numeric input through its editor; then an out-of-range value is refused.
 // AO has no inputs; unbounded floats refuse an empty entry instead of a value below min.
 const field=definition.inputs.find(input=>input.type==='int'&&(input.min??1)>=1)??definition.inputs.find(input=>input.type==='float');if(field){
 const next=field.type==='int'?(field.defval as number)+1:+(((field.defval as number)*1.5).toFixed(4));const before=valuesOf(ui.port,row.id);
 ui.sEdit(field.title,String(next));ui.sSubmit();rows=ui.port.list();expect(rows[0].inputs[field.key]).toBe(next);expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,rows[0].inputs));expect(valuesOf(ui.port,row.id)).not.toEqual(before);
 const update=vi.spyOn(ui.port,'update');ui.sEdit(field.title,field.min===undefined?'':String(field.min-1));expect(ui.sAlert()).not.toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);ui.sSubmit();expect(update).not.toHaveBeenCalled();ui.sClick('Discard draft and reload');update.mockRestore();}
 for(const input of definition.inputs.filter(item=>item.type==='bool')){ui.sCheck(input.title,!input.defval);ui.sSubmit();expect(ui.port.list()[0].inputs[input.key]).toBe(!input.defval);expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,ui.port.list()[0].inputs));}
 const edited=valuesOf(ui.port,row.id),native=ui.host.live.get(row.rendererId),emitted=structuredClone(native.emitted);
 ui.click('Hide '+ui.labels().get(row.id));expect(native.visible).toBe(false);ui.click('Show '+ui.labels().get(row.id));expect(native.emitted).toEqual(emitted);expect(valuesOf(ui.port,row.id)).toEqual(edited);
 const saved=JSON.parse(JSON.stringify(ui.port.serialize())),restarted=realChart();restarted.port.restore(saved);expect(restarted.port.list().map(settingsOf)).toEqual(ui.port.list().map(settingsOf));expect(valuesOf(restarted.port,row.id)).toEqual(edited);
 let n=0;const template=saveIndicatorTemplate(createIndicatorTemplates(),'T '+kind,{indicators:saved,scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template'),copy=instantiateIndicatorTemplate(template.records[0],()=> 'copy-'+ ++n),target=realChart();
 target.port.restore(copy.indicators);expect(valuesOf(target.port,'copy-1')).toEqual(edited);
 ui.click('Remove '+ui.labels().get(row.id));expect(ui.port.list()).toEqual([]);expect(ui.host.live.size).toBe(0);
});

it('documented style facts: Williams %R bands at -20/-80 with a background, CMF zero line, AO growing/falling palette, SAR crosses',()=>{
 const chart=realChart(),willr=chart.port.add('willr'),cmf=chart.port.add('cmf'),ao=chart.port.add('ao'),psar=chart.port.add('psar');
 const lines=(id:string)=>chart.host.live.get(chart.port.list().find(row=>row.id===id)!.rendererId).emitted;
 expect(lines(willr).priceLines.filter((line:any)=>line.id.includes('guide:')).map((line:any)=>line.price)).toEqual([-20,-80]);expect(lines(willr).fills).toHaveLength(1);
 expect(lines(cmf).priceLines.find((line:any)=>line.id===indicatorDecorationId(cmf,'guide:zero')).price).toBe(0);
 expect(chart.port.list().find(row=>row.id===ao)!.presentation!.histogramPalette).toEqual({nonnegativeRising:'#007f0e',nonnegativeFalling:'#872323',negativeRising:'#007f0e',negativeFalling:'#872323'});// ao.palette.pal.0/1
 const points=lines(ao).series[0].points.filter((point:any)=>point.value!==null);expect(new Set(points.map((point:any)=>point.color)).size).toBe(2);
 expect(factoryIndicatorDefault('psar').plots.sar.kind).toBe('cross');expect(lines(psar).series[0].kind).toBe('cross');
 expect(indicatorDefaults.psar).toEqual({start:0.02,increment:0.02,maximum:0.2});expect(indicatorDefaults.willr).toEqual({length:14,source:'close'});
 expect(CATALOG_INDICATOR_IDS.filter(kind=>CATALOG_INDICATORS.find(row=>row.id===kind)!.sourceSeries)).toEqual(['cci','stochrsi','mom','roc','env','lsma','wma','hma','smma']);
});
