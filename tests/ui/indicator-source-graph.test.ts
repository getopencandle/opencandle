import {beforeEach,expect,it,vi} from 'vitest';
import {encodeIndicatorSource,parseIndicatorSource,validateIndicatorSourceGraph,INDICATOR_SOURCE_MAX_DEPTH} from '../../src/domain/indicator-source';
import {calculateIndicator} from '../../src/domain/indicators';
import {validateFrozenIndicatorInputs,validateIndicatorSnapshots} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,instantiateIndicatorTemplate,restoreIndicatorTemplates,saveIndicatorTemplate} from '../../src/ui/indicator-templates';
import {indicatorInstanceLabels} from '../../src/ui/indicator-dialog-model';
import {makeHarness,realChart,valuesOf,findAll} from './indicator-real-port-harness';
import type {IndicatorId} from '../../src/domain/indicators';

// Evidence for indicator-on-indicator Source inputs through the REAL port and
// the ACTUAL settings handlers (minimal native host), with literal hand-computed oracles. No DOM/GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

// Closes 1,2,4,8,16 (flat bars). SMA(2) = [null,1.5,3,6,12]; SMA(2) of that = [null,null,2.25,4.5,9];
// EMA(3) (alpha 0.5) of SMA(2), SMA-seeded since reference-COMPARE6-1028 (reference EMA 9 on ARM 1D starts on bar 8 at the SMA 9)
// seed mean(1.5,3,6) = 3.5 on bar 3, then 0.5 x 12 + 0.5 x 3.5 = 7.75 (was the first-value seed: [null,1.5,2.25,4.125,8.0625]).
const bars=[1,2,4,8,16].map((close,i)=>({time:Date.UTC(2024,0,2+i),open:close,high:close,low:close,close,volume:10}));
const add=(port:any,kind:IndicatorId,inputs:Record<string,unknown>={})=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,{...factory.inputs,...inputs},factory) as string;};
const plot=(port:any,id:string,name:string)=>valuesOf(port,id).find(series=>series.id===name)?.values;

it('IND.SOURCE.ELIGIBLE: the Source editor offers price sources plus other instances\' plots with stable identity; selecting one calculates from that plot (literal oracle)',()=>{
 const ui=dialog({seed:['sma','sma','rsi'],initialSelected:1,bars}),[base,dependent,rsi]=ui.ids;
 ui.port.update(base,{inputs:{length:2}});ui.port.update(dependent,{inputs:{length:2}});
 const options=()=>findAll(ui.sField('Source'),node=>node.type==='option').map(node=>node.props.value as string);
 const ref=encodeIndicatorSource(base,'sma');expect(options().slice(0,7)).toEqual(['open','high','low','close','hl2','hlc3','ohlc4']);
 expect(options()).toContain(ref);expect(options()).toContain(encodeIndicatorSource(rsi,'rsi'));expect(options().some(value=>parseIndicatorSource(value)?.instance===dependent)).toBe(false);
 const label=findAll(ui.sField('Source'),node=>node.type==='option'&&node.props.value===ref)[0];expect(label.props.children).toBe(ui.labels().get(base)+': SMA');
 ui.sEdit('Source',ref);ui.sSubmit();expect(ui.port.list()[1].inputs.source).toBe(ref);expect(plot(ui.port,dependent,'sma')).toEqual([null,null,2.25,4.5,9]);
 ui.port.update(base,{inputs:{length:3}});expect(options()).toContain(ref);// the choice identity does not change when the source is edited
 expect(indicatorInstanceLabels(ui.port.list()).get(dependent)).toBe('SMA 2 SMA:sma');
 // A dependent of this instance is never offered as its own source (that would be a cycle).
 ui.click('Edit '+ui.labels().get(base));expect(options().some(value=>parseIndicatorSource(value)?.instance===dependent)).toBe(false);expect(options()).toContain(encodeIndicatorSource(rsi,'rsi'));
 ui.port.update(base,{inputs:{length:2}});const ema=add(ui.port,'ema',{length:3,source:ref});expect(plot(ui.port,ema,'ema')).toEqual([null,null,null,3.5,7.75]);
});

it('IND.SOURCE.CYCLE: self references, direct and indirect cycles and over-deep chains are rejected with a diagnostic; committed state is kept',()=>{
 const chart=realChart(bars),a=add(chart.port,'sma',{length:2}),b=add(chart.port,'ema',{length:2,source:encodeIndicatorSource(a,'sma')}),c=add(chart.port,'rsi',{length:2,source:encodeIndicatorSource(b,'ema')});
 const before=chart.port.serialize();
 expect(()=>chart.port.update(a,{inputs:{source:encodeIndicatorSource(a,'sma')}})).toThrow(/its own plot/);
 expect(()=>chart.port.update(a,{inputs:{source:encodeIndicatorSource(b,'ema')}})).toThrow(/cycle/);
 expect(()=>chart.port.update(a,{inputs:{source:encodeIndicatorSource(c,'rsi')}})).toThrow(/cycle/);
 expect(chart.port.serialize()).toEqual(before);expect(chart.port.sourceChoices(a).map(choice=>choice.instanceId)).toEqual([]);
 const rows=Array.from({length:INDICATOR_SOURCE_MAX_DEPTH+2},(_,i)=>({id:'n'+i,inputs:i?{source:encodeIndicatorSource('n'+(i-1),'sma')}:{}}));
 expect(()=>validateIndicatorSourceGraph(rows.slice(0,INDICATOR_SOURCE_MAX_DEPTH+1),{allowMissing:false})).not.toThrow();expect(()=>validateIndicatorSourceGraph(rows,{allowMissing:false})).toThrow(/limited to 8/);
 expect(()=>validateIndicatorSnapshots(chart.port.serialize().map((row,i)=>i===0?{...row,inputs:{...row.inputs,source:encodeIndicatorSource(c,'rsi')}}:row))).toThrow(/cycle/);
 for(const bad of ['lv-plot:["a"]','lv-plot:["a","b","c"]','lv-plot: ["a","b"]','plot:a:b'])expect(()=>chart.port.update(a,{inputs:{source:bad}})).toThrow(/Unsupported input option/);
 expect(()=>chart.port.update(add(chart.port,'atr'),{inputs:{source:encodeIndicatorSource(a,'sma')} as any})).toThrow(/Unsupported indicator input/);
 expect(()=>validateFrozenIndicatorInputs('ema',chart.port.list()[1].inputs,'ema')).toThrow(/Alerts cannot capture/);
});

it('IND.SOURCE.REMOVED: removing the source makes the dependent explicitly unavailable without switching its source; restoring the source recovers it',()=>{
 const ui=dialog({seed:['sma','ema'],initialSelected:1,bars}),[base,dependent]=ui.ids,ref=encodeIndicatorSource(base,'sma');
 ui.port.update(base,{inputs:{length:2}});ui.port.update(dependent,{inputs:{length:3,source:ref}});const good=valuesOf(ui.port,dependent),saved=ui.port.serialize();
 ui.click('Remove '+ui.labels().get(base));
 const row=ui.port.list()[0];expect(row.id).toBe(dependent);expect(row.inputs.source).toBe(ref);expect(valuesOf(ui.port,dependent)).toEqual([]);expect(row.diagnostics[0]).toMatch(/source indicator was removed.*no price source was substituted/);
 expect(ui.text()).toContain('Unavailable: The source indicator was removed.');expect(findAll(ui.sField('Source'),node=>node.type==='option'&&node.props.value===ref)[0].props.children).toBe('Unavailable indicator source');
 expect(()=>ui.port.update(dependent,{inputs:{length:4}})).toThrow(/source indicator was removed/);expect(ui.port.list()[0].inputs.length).toBe(3);// no edit is accepted against a missing source
 const restarted=realChart(bars);restarted.port.restore(JSON.parse(JSON.stringify(ui.port.serialize())));expect(restarted.port.list()[0].inputs.source).toBe(ref);expect(valuesOf(restarted.port,dependent)).toEqual([]);
 ui.port.restore(saved);expect(valuesOf(ui.port,dependent)).toEqual(good);expect(good[0].values).toEqual([null,null,null,3.5,7.75]);
});

it('IND.SOURCE.HIDDEN: hiding the source never changes the dependent, and edits to a hidden source still propagate',()=>{
 const ui=dialog({seed:['sma','sma'],bars}),[base,dependent]=ui.ids;ui.port.update(base,{inputs:{length:2}});ui.port.update(dependent,{inputs:{length:2,source:encodeIndicatorSource(base,'sma')}});
 const before=valuesOf(ui.port,dependent);ui.click('Hide '+ui.labels().get(base));expect(ui.port.list()[0].visible).toBe(false);expect(valuesOf(ui.port,dependent)).toEqual(before);
 ui.port.update(base,{inputs:{length:1}});expect(plot(ui.port,dependent,'sma')).toEqual([null,1.5,3,6,12]);// SMA(2) of closes, recalculated while the source is hidden
 ui.click('Show '+ui.labels().get(base));expect(plot(ui.port,dependent,'sma')).toEqual([null,1.5,3,6,12]);
});

it('IND.SOURCE.MOVED: pane moves of the source or the dependent keep numerical identity; a restart in reverse order resolves the same values',()=>{
 const ui=dialog({seed:['rsi','sma'],initialSelected:0,bars}),[rsi,dependent]=ui.ids;ui.port.update(rsi,{inputs:{length:2}});ui.port.update(dependent,{inputs:{length:2,source:encodeIndicatorSource(rsi,'rsi')}});
 const expected=calculateIndicator('sma',bars.map(bar=>({...bar,time:bar.time/1000})),{length:2,source:encodeIndicatorSource(rsi,'rsi')},{sourceValues:calculateIndicator('rsi',bars.map(bar=>({...bar,time:bar.time/1000})),{length:2}).series[0].values}).series[0].values;
 const before=plot(ui.port,dependent,'sma');expect(before).toEqual(expected);
 ui.sClick('Placement');ui.sClick('Move to price pane');expect(ui.port.list()[0].paneId).toBe('price');expect(plot(ui.port,dependent,'sma')).toEqual(before);
 ui.sClick('Move to new pane');expect(plot(ui.port,dependent,'sma')).toEqual(before);ui.port.move(dependent,{newPane:true});expect(plot(ui.port,dependent,'sma')).toEqual(before);
 const restarted=realChart(bars);restarted.port.restore(JSON.parse(JSON.stringify([...ui.port.serialize()].reverse())));expect(plot(restarted.port,dependent,'sma')).toEqual(before);
});

it('IND.SOURCE + templates: references inside a template are remapped to fresh identities; references outside it or cycles are refused',()=>{
 const chart=realChart(bars),base=add(chart.port,'sma',{length:2}),dependent=add(chart.port,'ema',{length:3,source:encodeIndicatorSource(base,'sma')});
 const content={indicators:chart.port.serialize(),scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
 const library=saveIndicatorTemplate(createIndicatorTemplates(),'Chain',content,()=> 'chain');let n=0;
 const fresh=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(library))).records[0],()=> 'f'+ ++n);
 expect(fresh.indicators.map(row=>row.id)).toEqual(['f1','f2']);expect(fresh.indicators[1].inputs.source).toBe(encodeIndicatorSource('f1','sma'));
 const target=realChart(bars);target.port.restore(fresh.indicators);expect(plot(target.port,'f2','ema')).toEqual(plot(chart.port,dependent,'ema'));
 expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Orphan',{...content,indicators:[content.indicators[1]]},()=> 'o')).toThrow(/not present/);
 const cyclic=structuredClone(content);cyclic.indicators[0].inputs.source=encodeIndicatorSource(dependent,'ema');expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Cycle',cyclic,()=> 'c')).toThrow(/cycle/);
});

it('IND.LIB.LOCAL.TEMPLATE.DEPENDENCY_GRAPH: templates validate the referenced output identity, order sources before dependents and reject atomically',()=>{
 const chart=realChart(bars),base=add(chart.port,'sma',{length:2}),dependent=add(chart.port,'ema',{length:3,source:encodeIndicatorSource(base,'sma')});
 const saved=chart.port.serialize(),reversed={indicators:[saved[1],saved[0]],scripts:[],rememberSymbol:false,rememberInterval:false,source:null};
 const template=saveIndicatorTemplate(createIndicatorTemplates(),'Reversed',reversed,()=> 'reversed').records[0];let n=0;
 const fresh=instantiateIndicatorTemplate(template,()=> 'g'+ ++n);
 expect(fresh.indicators.map(row=>[row.id,row.kind])).toEqual([['g2','sma'],['g1','ema']]);// fresh ids follow template order; the source is placed first
 expect(fresh.indicators[1].inputs.source).toBe(encodeIndicatorSource('g2','sma'));
 const target=realChart(bars);target.port.restore(fresh.indicators);expect(plot(target.port,'g1','ema')).toEqual(plot(chart.port,dependent,'ema'));
 const wrongPlot=structuredClone(reversed);wrongPlot.indicators[0].inputs.source=encodeIndicatorSource(base,'upper');
 let library=createIndicatorTemplates();library=saveIndicatorTemplate(library,'Keep',{...reversed,indicators:[saved[0]]},()=> 'keep');
 expect(()=>saveIndicatorTemplate(library,'Wrong plot',wrongPlot,()=> 'w')).toThrow(/does not produce/);expect(library.records.map(row=>row.id)).toEqual(['keep']);
 expect(()=>restoreIndicatorTemplates({schemaVersion:1,records:[{...library.records[0]},{...template,id:'x',name:'X',indicators:wrongPlot.indicators}]})).toThrow(/does not produce/);
 expect(()=>validateIndicatorSnapshots(wrongPlot.indicators)).toThrow(/does not produce/);
 expect(()=>chart.port.update(dependent,{inputs:{source:encodeIndicatorSource(base,'upper')}})).toThrow(/source plot is unavailable/);expect(chart.port.list()[1].inputs.source).toBe(encodeIndicatorSource(base,'sma'));
});

// Review l1p2-otdw F6: the single-series extended built-ins accept another indicator's plot as Source; others refuse.
it('IND.SOURCE.ELIGIBLE (extended kinds): CCI, Stoch RSI, Momentum, ROC, Envelopes, LSMA, WMA, HMA and SMMA calculate from an SMA plot; Williams %R and MFI refuse',()=>{
 const chart=realChart(bars),base=add(chart.port,'sma',{length:2}),ref=encodeIndicatorSource(base,'sma');// SMA(2) = [null,1.5,3,6,12]
 const mom=chart.port.add('mom',{length:1,source:ref});expect(plot(chart.port,mom,'mom')).toEqual([null,null,1.5,3,6]);// literal differences of the SMA plot
 const wma=chart.port.add('wma',{length:2,source:ref});expect(plot(chart.port,wma,'wma')).toEqual([null,null,2.5,5,10]);// (1x1.5+2x3)/3, (1x3+2x6)/3, (1x6+2x12)/3
 const smma=chart.port.add('smma',{length:2,source:ref});expect(plot(chart.port,smma,'smma')).toEqual([null,null,2.25,4.125,8.0625]);// SMA seed (1.5+3)/2, then (prior+value)/2
 for(const kind of ['cci','stochrsi','roc','env','lsma','hma'] as const){const id=chart.port.add(kind,{source:ref});expect(chart.port.list().find(row=>row.id===id)!.inputs.source).toBe(ref);expect(chart.port.sourceChoices(id).some(choice=>choice.instanceId===base)).toBe(true);expect(chart.port.list().find(row=>row.id===id)!.diagnostics.join(' ')).not.toMatch(/source indicator/);}
 for(const kind of ['willr','mfi'] as const){expect(()=>chart.port.add(kind,{source:ref})).toThrow(/Unsupported/);}
});
