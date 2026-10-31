import {beforeEach,expect,it,vi} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {makeHarness,realChart,valuesOf,expected,findAll,domainBars} from './indicator-real-port-harness';
import {parseIndicatorSource} from '../../src/domain/indicator-source';

// L1 lane evidence for IND.<kind>.INPUT.* leaves: each input editor of the ACTUAL settings handlers,
// wired to the REAL indicator port. Model + component-handler evidence only; no DOM/focus/GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

// Review F2 (2026-10-16): each row lists the exact invalid vectors it drives, by category:
// low/high = outside the LV bounds, fraction = non-integer for an integer input, empty = cleared field,
// unsupported = a value outside the option list, text = non-numeric text. accepted = values that must be
// ACCEPTED (Bollinger Bands StdDev is a decimal input, so fractions are valid there).
type Vector={category:'low'|'high'|'fraction'|'empty'|'unsupported'|'text';value:string};
type Row={leaf:string;kind:IndicatorId;title:string;key:string;def:string|number;valid:string;parsed:string|number;invalid:Vector[];accepted?:{value:string;parsed:number}[];options?:string[]};
const SOURCES=['open','high','low','close','hl2','hlc3','ohlc4'];
const int=(low:string,high:string,fraction:string,...extra:Vector[]):Vector[]=>[{category:'low',value:low},{category:'high',value:high},{category:'fraction',value:fraction},{category:'empty',value:''},...extra];
const pick=(...unsupported:string[]):Vector[]=>[...unsupported.map(value=>({category:'unsupported' as const,value})),{category:'empty',value:''}];
// Defaults are the requirement records' stated defaults (LV factory values); option lists are LV's.
const rows:Row[]=[
 {leaf:'IND.SMA.INPUT.LENGTH',kind:'sma',title:'Length',key:'length',def:9,valid:'20',parsed:20,invalid:int('0','100001','1.5')},
 {leaf:'IND.SMA.INPUT.SOURCE',kind:'sma',title:'Source',key:'source',def:'close',valid:'hl2',parsed:'hl2',invalid:pick('hlcc4','Close'),options:SOURCES},
 {leaf:'IND.EMA.INPUT.LENGTH',kind:'ema',title:'Length',key:'length',def:9,valid:'21',parsed:21,invalid:int('0','100001','9.5',{category:'low',value:'-5'},{category:'text',value:'abc'})},
 {leaf:'IND.EMA.INPUT.SOURCE',kind:'ema',title:'Source',key:'source',def:'close',valid:'high',parsed:'high',invalid:pick('volume'),options:SOURCES},
 {leaf:'IND.RSI.INPUT.LENGTH',kind:'rsi',title:'Length',key:'length',def:14,valid:'7',parsed:7,invalid:int('0','100001','14.5')},
 {leaf:'IND.RSI.INPUT.SOURCE',kind:'rsi',title:'Source',key:'source',def:'close',valid:'open',parsed:'open',invalid:pick('hlcc4'),options:SOURCES},
 {leaf:'IND.MACD.INPUT.FAST',kind:'macd',title:'Fast length',key:'fast',def:12,valid:'5',parsed:5,invalid:int('0','100001','12.5')},
 {leaf:'IND.MACD.INPUT.SLOW',kind:'macd',title:'Slow length',key:'slow',def:26,valid:'30',parsed:30,invalid:int('-1','100001','26.5')},
 {leaf:'IND.MACD.INPUT.SIGNAL',kind:'macd',title:'Signal length',key:'signal',def:9,valid:'4',parsed:4,invalid:int('0','100001','9.5')},
 {leaf:'IND.MACD.INPUT.SOURCE',kind:'macd',title:'Source',key:'source',def:'close',valid:'hlc3',parsed:'hlc3',invalid:pick('median'),options:SOURCES},
 {leaf:'IND.MACD.INPUT.OSC_MA',kind:'macd',title:'Oscillator MA type',key:'oscillatorType',def:'EMA',valid:'SMA',parsed:'SMA',invalid:pick('WMA','ema'),options:['SMA','EMA']},
 {leaf:'IND.MACD.INPUT.SIGNAL_MA',kind:'macd',title:'Signal MA type',key:'signalType',def:'EMA',valid:'SMA',parsed:'SMA',invalid:pick('RMA'),options:['SMA','EMA']},
 {leaf:'IND.BB.INPUT.LENGTH',kind:'bb',title:'Length',key:'length',def:20,valid:'10',parsed:10,invalid:int('0','100001','2.2')},
 {leaf:'IND.BB.INPUT.BASIS_MA',kind:'bb',title:'Basis MA type',key:'basisType',def:'SMA',valid:'WMA',parsed:'WMA',invalid:pick('HMA'),options:['SMA','EMA','RMA','WMA','VWMA']},
 {leaf:'IND.BB.INPUT.SOURCE',kind:'bb',title:'Source',key:'source',def:'close',valid:'ohlc4',parsed:'ohlc4',invalid:pick('hlcc4'),options:SOURCES},
 {leaf:'IND.BB.INPUT.STDDEV',kind:'bb',title:'Standard deviations',key:'multiplier',def:2,valid:'1.5',parsed:1.5,invalid:[{category:'low',value:'-0.1'},{category:'high',value:'100001'},{category:'empty',value:''}],accepted:[{value:'0.25',parsed:0.25},{value:'0',parsed:0}]},
 {leaf:'IND.VWAP.INPUT.ANCHOR',kind:'vwap',title:'Anchor period',key:'anchor',def:'Session',valid:'Month',parsed:'Month',invalid:pick('Auto','session'),options:['Session','Week','Month','Quarter','Year','Decade','Century','Dividends','Splits','Earnings']},
 {leaf:'IND.STOCH.INPUT.K',kind:'stochastic',title:'Length',key:'length',def:14,valid:'9',parsed:9,invalid:int('0','100001','14.5')},
 // reference's default %K smoothing is 1 (14/1/3), so new instances default to 1 and the valid edit is 5.
 {leaf:'IND.STOCH.INPUT.K_SMOOTH',kind:'stochastic',title:'K smoothing',key:'smoothK',def:1,valid:'5',parsed:5,invalid:int('0','100001','3.5')},
 {leaf:'IND.STOCH.INPUT.D',kind:'stochastic',title:'D length',key:'smoothD',def:3,valid:'5',parsed:5,invalid:int('-3','100001','3.5')},
 {leaf:'IND.ATR.INPUT.LENGTH',kind:'atr',title:'Length',key:'length',def:14,valid:'10',parsed:10,invalid:int('0','1e6','14.5')},
 {leaf:'IND.ATR.INPUT.SMOOTHING',kind:'atr',title:'Smoothing',key:'smoothing',def:'RMA',valid:'SMA',parsed:'SMA',invalid:pick('VWMA','rma'),options:['RMA','SMA','EMA','WMA']},
];

it.each(rows)('$leaf: default/options shown, invalid values keep committed state, Cancel discards, Apply recalculates only this instance, restart keeps it',row=>{
 const ui=dialog({seed:[row.kind,row.kind],initialSelected:0}),[one,two]=ui.ids,beforeOne=valuesOf(ui.port,one),beforeTwo=valuesOf(ui.port,two);
 const field=ui.sField(row.title);expect(field.props.value).toBe(String(row.def));expect(ui.port.list()[0].inputs[row.key]).toBe(row.def);
 if(row.options){expect(field.type).toBe('select');const values=findAll(field,node=>node.type==='option').map(node=>node.props.value as string);expect(values.slice(0,row.options.length)).toEqual(row.options);
  // Phase 2: a Source select also lists the sibling instance's plots (indicator-on-indicator), never its own.
  const extra=values.slice(row.options.length);if(row.key==='source'){expect(extra.length).toBeGreaterThan(0);expect(extra.every(value=>parseIndicatorSource(value)?.instance===two)).toBe(true);}else expect(extra).toEqual([]);}
 else{expect(field.type).toBe('input');expect(field.props.type).toBe('number');}
 const update=vi.spyOn(ui.port,'update');
 for(const {value:bad} of row.invalid){
  ui.sEdit(row.title,bad);expect(ui.sAlert()).not.toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);expect(ui.sButton('Apply and close').props.disabled).toBe(true);
  ui.sSubmit();expect(update).not.toHaveBeenCalled();expect(ui.port.list()[0].inputs[row.key]).toBe(row.def);ui.sClick('Discard draft and reload');expect(ui.sAlert()).toBe('');
 }
 for(const accepted of row.accepted??[]){ui.sEdit(row.title,accepted.value);expect(ui.sAlert()).toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(false);ui.sClick('Discard draft and reload');}
 expect(valuesOf(ui.port,one)).toEqual(beforeOne);
 ui.sEdit(row.title,row.valid);expect(ui.sAlert()).toBe('');expect(ui.sText()).toContain('Unapplied changes.');expect(valuesOf(ui.port,one)).toEqual(beforeOne);
 ui.sClick('Cancel');expect(ui.selected()).toBeNull();expect(ui.port.list()[0].inputs[row.key]).toBe(row.def);expect(update).not.toHaveBeenCalled();
 ui.click('Edit '+ui.labels().get(one));expect(ui.sField(row.title).props.value).toBe(String(row.def));ui.sEdit(row.title,row.valid);ui.sSubmit();expect(update).toHaveBeenCalledTimes(1);
 const live=ui.port.list();expect(live[0].inputs[row.key]).toBe(row.parsed);expect(valuesOf(ui.port,one)).toEqual(expected(row.kind,live[0].inputs));expect(valuesOf(ui.port,one)).not.toEqual(beforeOne);
 expect(live[1].inputs[row.key]).toBe(row.def);expect(valuesOf(ui.port,two)).toEqual(beforeTwo);
 expect(ui.sField(row.title).props.value).toBe(String(row.parsed));expect(ui.sText()).toContain('No unapplied changes.');
 ui.sSubmit();expect(update).toHaveBeenCalledTimes(2);expect(valuesOf(ui.port,one)).toEqual(expected(row.kind,live[0].inputs));// repeated Apply is idempotent
 const restarted=realChart();restarted.port.restore(JSON.parse(JSON.stringify(ui.port.serialize())));expect(restarted.port.list()[0].inputs[row.key]).toBe(row.parsed);expect(valuesOf(restarted.port,one)).toEqual(valuesOf(ui.port,one));expect(valuesOf(restarted.port,two)).toEqual(beforeTwo);
});

// Source routing oracle: a source choice must equal the same calculation on bars whose close is the
// independently computed source value (hand-written formulas, not the production sourceValues helper).
const literalSource:Record<string,(bar:typeof domainBars[number])=>number>={open:bar=>bar.open,high:bar=>bar.high,low:bar=>bar.low,close:bar=>bar.close,hl2:bar=>(bar.high+bar.low)/2,hlc3:bar=>(bar.high+bar.low+bar.close)/3,ohlc4:bar=>(bar.open+bar.high+bar.low+bar.close)/4};
it.each(['sma','ema','rsi','macd','bb'] as const)('%s Source input routes each option to the matching price series',kind=>{
 for(const [source,value] of Object.entries(literalSource)){
  const reference=domainBars.map(bar=>({...bar,close:value(bar)}));
  expect(calculateIndicator(kind,domainBars,{source}).series).toEqual(calculateIndicator(kind,reference,{source:'close'}).series);
 }
 const flat=calculateIndicator('sma',[{time:1,open:1,high:8,low:2,close:3,volume:1}],{source:'hlc3',length:1}).series[0].values;expect(flat).toEqual([13/3]);
});
