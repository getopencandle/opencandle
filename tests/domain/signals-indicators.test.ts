// Hand-computed oracles for Bollinger Bands breach, DI cross signals, MACD divergence and RSI failure swings, plus the
// RSI "Show forming divergences" option. All bars and oscillator values are SYNTHETIC fixtures made up for these tests (no
// market data). Expected bars are worked out in the comments from the rules in the definitions.
import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {SIGNALS_INDICATOR_IDS,bollingerBreach,bollingerSeries,diCrossEvents,rsiFailureSwings} from '../../src/domain/indicators-ext/signals-catalog';
import {oscillatorDivergence,oscillatorFormingDivergence,rsiDivergence} from '../../src/domain/rsi-divergence';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,indicatorInputSchema,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {filterIndicatorCatalog} from '../../src/ui/indicator-dialog-model';
import {exportEntry} from '../../src/ui/all-indicators-export';
import type {Bar} from '../../src/domain/types';

const DAY=86400,D0=19700*DAY,N=null;
const bars=(closes:readonly number[])=>closes.map((c,i):Bar=>({time:D0+i*DAY,open:c,high:c+0.5,low:c-0.5,close:c,volume:100}));
const calc=(kind:string,rows:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind as never,rows,inputs as never);expect(result.diagnostics,kind).toEqual([]);return result;};
const plot=(result:ReturnType<typeof calc>,id:string)=>result.series.find(row=>row.id===id)!.values;
const near=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const ones=(values:readonly (number|null)[])=>values.flatMap((v,i)=>v===1?[i]:[]);
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'a1',kind:kind as never,inputs:{...(indicatorDefaults as Record<string,Record<string,unknown>>)[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as never)});
const wave=(count:number)=>Array.from({length:count},(_,i)=>100+10*Math.sin(i/7)+4*Math.sin(i/2.1)+i*0.05);
const ohlc=(closes:readonly number[])=>closes.map((c,i):Bar=>({time:D0+i*DAY,open:c-0.3*Math.sin(i),high:c+1+Math.abs(Math.sin(i*1.3)),low:c-1-Math.abs(Math.cos(i*0.7)),close:c,volume:100+i}));

describe('signal built-ins: catalog shape (SYNTHETIC)',()=>{
 it('the four kinds are registered with provenance, OpenCandle-defined unknowns, alert operands and plain player text',()=>{
  expect([...SIGNALS_INDICATOR_IDS]).toEqual(['bbbreach','dicross','macddiv','rsifs']);
  for(const kind of SIGNALS_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.overlay).toBe(kind==='bbbreach');expect(definition.pattern).toBe('chart');expect(definition.provenance.length).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
   for(const id of definition.linePlots!)expect(definition.plots.map(row=>row.id)).toContain(id);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   const visible=[definition.name,definition.acronym,...definition.plots.map(row=>row.label),...definition.inputs.map(row=>row.title),...definition.policies,...definition.unknownDefaults!].join(' ');
   expect(visible).not.toMatch(new RegExp(String.fromCharCode(0x2014)+'|TradingView'));
  }
  expect(catalogDefinition('bbbreach')!.name).toBe('Bollinger Bands breach');expect(catalogDefinition('dicross')!.name).toBe('DI cross signals');
  expect(catalogDefinition('macddiv')!.name).toBe('MACD divergence');expect(catalogDefinition('rsifs')!.name).toBe('RSI failure swings');
 });
 it('search keywords find each kind',()=>{
  const catalog=[...INDICATOR_KINDS],rows=(query:string)=>filterIndicatorCatalog(catalog,'All',[],query).rows;
  for(const query of ['bollinger','breach','re-entry'])expect(rows(query),query).toContain('bbbreach');
  for(const query of ['DMI','+DI','extreme point'])expect(rows(query),query).toContain('dicross');
  for(const query of ['MACD','divergence','hidden divergence'])expect(rows(query),query).toContain('macddiv');
  for(const query of ['failure swing','RSI'])expect(rows(query),query).toContain('rsifs');
 });
 it('line plots draw with legend values and the 0/1 signal plots draw as markers (and go to the Patterns export sheet)',()=>{
  const rows=ohlc(wave(160)),result=calc('bbbreach',rows,{length:10,multiplier:1}),out=renderIndicatorPresentation(settings('bbbreach',{length:10,multiplier:1}),result,rows,{resolution:'1D'});
  const byTitle=new Map((out.output.series??[]).map(row=>[row.title,row]));
  for(const title of ['Basis','Upper','Lower']){expect(byTitle.get(title)!.visible,title).toBe(true);expect(byTitle.get(title)!.display?.legend,title).toBe(true);}
  for(const title of ['Close above upper','Close below lower'])expect(byTitle.get(title)!.visible,title).toBe(false);
  expect((out.output.labels??[]).length).toBe(ones(plot(result,'aboveUpper')).length+ones(plot(result,'belowLower')).length);
  const entry=exportEntry('bbbreach' as never,result),sheet=new Map(entry.columns.map(column=>[column.line,column.sheet]));
  expect(sheet.get('Upper')).toBe('Data');expect(sheet.get('Close above upper')).toBe('Patterns');expect(sheet.get('Re-entry from below')).toBe('Patterns');
 });
});

describe('pane markers point away from the line (SYNTHETIC)',()=>{
 it('bullish markers draw below their point pointing up, bearish above pointing down',()=>{
  const rows=ohlc(wave(300)),inputs={hiddenBullish:true,hiddenBearish:true},out=renderIndicatorPresentation(settings('macddiv',inputs),calc('macddiv',rows,inputs),rows,{resolution:'1D'}),labels=out.output.labels??[];
  const styles=(text:string)=>[...new Set(labels.filter(label=>label.text===text).map(label=>label.style))];
  expect(labels.length).toBeGreaterThan(0);expect(new Set(labels.map(label=>label.style))).toEqual(new Set(['label_up','label_down']));for(const text of ['Bull','H Bull'])if(styles(text).length)expect(styles(text),text).toEqual(['label_up']);
  for(const text of ['Bear','H Bear'])if(styles(text).length)expect(styles(text),text).toEqual(['label_down']);
  for(const label of labels)expect(label.yloc).toBe('price');
 });
});

describe('Bollinger Bands breach (SYNTHETIC)',()=>{
 it('marks a close above the upper band and the re-entry on the bar after, then the mirror below',()=>{
  // Length 3, StdDev 1 (population). Bar 4: window 10,10,13 -> mean 11, sd sqrt(2) = 1.414, upper 12.414; close 13 above.
  // Bar 5: 10,13,13 -> mean 12, upper 13.414; 13 inside after an outside close: re-entry from above.
  // Bar 6: 13,13,10 -> mean 12, lower 10.586; 10 below. Bar 7: 13,10,10 -> mean 11, lower 9.586; 10 inside: re-entry from below.
  const closes=[10,10,10,10,13,13,10,10],{basis,upper,lower}=bollingerSeries(closes,3,1);
  near(basis,[N,N,10,10,11,12,12,11]);near(upper,[N,N,10,10,11+Math.SQRT2,12+Math.SQRT2,12+Math.SQRT2,11+Math.SQRT2]);
  const s=bollingerBreach(closes,upper,lower,true);
  expect(s.aboveUpper).toEqual([N,N,0,0,1,0,0,0]);expect(s.reentryFromAbove).toEqual([N,N,0,0,0,1,0,0]);
  expect(s.belowLower).toEqual([N,N,0,0,0,0,1,0]);expect(s.reentryFromBelow).toEqual([N,N,0,0,0,0,0,1]);
  const r=calc('bbbreach',bars(closes),{length:3,multiplier:1});expect(plot(r,'aboveUpper')).toEqual(s.aboveUpper);expect(plot(r,'reentryFromBelow')).toEqual(s.reentryFromBelow);
 });
 it('First close outside only marks a walk along the band once; off marks every close outside',()=>{
  // Bar 3: 10,10,12 -> upper 10.667 + 0.943; 12 above. Bar 4: 10,12,14 -> upper 12 + 1.633; 14 above. Bar 5: 12,14,16 -> 16 above.
  const closes=[10,10,10,12,14,16],{upper,lower}=bollingerSeries(closes,3,1);
  expect(bollingerBreach(closes,upper,lower,true).aboveUpper).toEqual([N,N,0,1,0,0]);
  expect(bollingerBreach(closes,upper,lower,false).aboveUpper).toEqual([N,N,0,1,1,1]);
 });
 it('re-entry markers are drawn only with the option on; the signal plots are computed either way',()=>{
  const rows=bars([10,10,10,10,13,13,10,10]),off=calc('bbbreach',rows,{length:3,multiplier:1}),on=calc('bbbreach',rows,{length:3,multiplier:1,reentry:true});
  expect(off.marks!.markers.map(m=>m.plot)).toEqual(['aboveUpper','belowLower']);
  expect(on.marks!.markers.map(m=>[m.index,m.plot,m.text])).toEqual([[4,'aboveUpper','Above'],[5,'reentryFromAbove','Re-entry'],[6,'belowLower','Below'],[7,'reentryFromBelow','Re-entry']]);
  expect(plot(off,'reentryFromAbove')).toEqual(plot(on,'reentryFromAbove'));
 });
 it('the bands equal the Bollinger Bands built-in (20, 2, SMA, close)',()=>{
  const rows=ohlc(wave(120)),mine=calc('bbbreach',rows),bb=calc('bb',rows,{length:20,multiplier:2,source:'close'});
  near(plot(mine,'basis'),plot(bb,'basis'));near(plot(mine,'upper'),plot(bb,'upper'));near(plot(mine,'lower'),plot(bb,'lower'));
 });
});

describe('DI cross signals (SYNTHETIC)',()=>{
 // +DI crosses above -DI on bar 3 (22 > 14 after 15 <= 16); -DI crosses above +DI on bar 6 (18 < 20 after 24 >= 16).
 const plus=[10,12,15,22,25,24,18,17],minus=[20,18,16,14,15,16,20,21],adx=[25,25,25,25,25,25,25,25];
 const hl=(highs:readonly number[],lows:readonly number[])=>highs.map((h,i):Bar=>({time:D0+i*DAY,open:(h+lows[i])/2,high:h,low:lows[i],close:(h+lows[i])/2,volume:1}));
 const rows=hl([95,96,98,100,99.5,100.5,95,92],[90,91,92,93,94,93,90,89]);
 it('extreme point rule: the bull signal waits for a high above the crossover bar high, the bear for a low below its low',()=>{
  // Bar 4 high 99.5 is not above bar 3 high 100; bar 5 high 100.5 is: bull on bar 5. Bar 7 low 89 is below bar 6 low 90: bear on bar 7.
  const r=diCrossEvents(rows,plus,minus,adx,{adxFilter:true,adxThreshold:20,extremePoint:true});
  expect(ones(r.bull)).toEqual([5]);expect(ones(r.bear)).toEqual([7]);expect(r.bull.slice(0,5)).toEqual([0,0,0,0,0]);
  expect(r.events.map(e=>[e.side,e.crossIndex,e.signalIndex,e.level])).toEqual([['bull',3,5,100],['bear',6,7,90]]);
 });
 it('with the extreme point rule off the crossover bar itself is the signal',()=>{
  const r=diCrossEvents(rows,plus,minus,adx,{adxFilter:true,adxThreshold:20,extremePoint:false});
  expect(ones(r.bull)).toEqual([3]);expect(ones(r.bear)).toEqual([6]);
 });
 it('the ADX filter reads the crossover bar: ADX below the threshold there gives no signal',()=>{
  const weak=adx.map((v,i)=>i===3?15:v),r=diCrossEvents(rows,plus,minus,weak,{adxFilter:true,adxThreshold:20,extremePoint:true});
  expect(ones(r.bull)).toEqual([]);expect(ones(r.bear)).toEqual([7]);
  expect(ones(diCrossEvents(rows,plus,minus,weak,{adxFilter:false,adxThreshold:20,extremePoint:true}).bull)).toEqual([5]);
 });
 it('an opposite cross cancels a waiting cross',()=>{
  // Bull cross on bar 3 never breaks 100 before -DI crosses back above +DI on bar 5; bar 6 high 101 then gives nothing.
  const p=[10,12,15,22,21,14,13],m=[20,18,16,14,15,18,19],r=diCrossEvents(hl([95,96,98,100,99,97,101],[90,91,92,93,94,93,92]),p,m,adx,{adxFilter:false,adxThreshold:20,extremePoint:true});
  expect(ones(r.bull)).toEqual([]);
 });
 it('+DI, -DI and ADX equal the Directional Movement Index built-in, and the signals follow them',()=>{
  const data=ohlc(wave(200)),mine=calc('dicross',data),dmi=calc('dmi',data);
  near(plot(mine,'plusDI'),plot(dmi,'plusDI'));near(plot(mine,'minusDI'),plot(dmi,'minusDI'));near(plot(mine,'adx'),plot(dmi,'adx'));
  const expected=diCrossEvents(data,plot(dmi,'plusDI'),plot(dmi,'minusDI'),plot(dmi,'adx'),{adxFilter:true,adxThreshold:20,extremePoint:true});
  expect(plot(mine,'bullCross')).toEqual(expected.bull);expect(plot(mine,'bearCross')).toEqual(expected.bear);
  expect(ones(expected.bull).length+ones(expected.bear).length).toBeGreaterThan(0);
 });
});

describe('MACD divergence (SYNTHETIC)',()=>{
 it('the generalised engine gives RSI exactly what it gave before for the same series',()=>{
  const data=ohlc(wave(240)),r=plot(calc('rsi',data),'rsi'),kinds=['bullish','bearish','hiddenBullish','hiddenBearish'] as const;
  expect(oscillatorDivergence(r,data,undefined,{kinds:[...kinds]})).toEqual(rsiDivergence(r,data,undefined,{kinds:[...kinds]}));
  expect(()=>rsiDivergence([1],[])).toThrow('RSI divergence needs one RSI value per bar.');
 });
 it('a regular bullish divergence between two oscillator lows is reported on the confirmation bar only',()=>{
  // Left 2, right 2, 1-20 bars apart. Oscillator lows: bar 3 (10) and bar 9 (15); price lows 100 then 95: lower price low,
  // higher oscillator low. Bar 9 is confirmed by bars 10 and 11, so the divergence is on bar 11.
  const osc=[30,25,20,10,20,25,30,28,22,15,22,28],low=(i:number)=>i===3?100:i===9?95:110;
  const data=osc.map((_,i):Bar=>({time:D0+i*DAY,open:115,high:120,low:low(i),close:115,volume:1}));
  const found=oscillatorDivergence(osc,data,{left:2,right:2,minBetween:1,maxBetween:20},{kinds:['bullish','hiddenBullish']});
  expect(found.bullish.flatMap((v,i)=>v!==null?[i]:[])).toEqual([11]);expect(found.segments).toEqual([{kind:'bullish',fromIndex:3,toIndex:9,confirmIndex:11,fromRsi:10,toRsi:15}]);
  expect(oscillatorDivergence(osc.slice(0,11),data.slice(0,11),{left:2,right:2,minBetween:1,maxBetween:20},{kinds:['bullish']}).segments).toEqual([]);// not knowable on bar 10
 });
 it('MACD, signal and histogram equal the MACD built-in; signals equal the engine on the chosen series',()=>{
  const data=ohlc(wave(300)),mine=calc('macddiv',data),macd=calc('macd',data,{fast:12,slow:26,signal:9,source:'close'});
  near(plot(mine,'macd'),plot(macd,'macd'));near(plot(mine,'signal'),plot(macd,'signal'));near(plot(mine,'histogram'),plot(macd,'histogram'));
  const policy={left:5,right:5,minBetween:5,maxBetween:60},all=['bullish','bearish','hiddenBullish','hiddenBearish'] as const;
  for(const [option,id] of [['MACD line','macd'],['Histogram','histogram']] as const){
   const r=calc('macddiv',data,{divergenceOn:option,hiddenBullish:true,hiddenBearish:true}),want=oscillatorDivergence(plot(macd,id),data,policy,{kinds:[...all]});let count=0;
   for(const kind of all){expect(ones(plot(r,kind)),option+' '+kind).toEqual(want[kind].flatMap((v,i)=>v!==null?[i]:[]));count+=ones(plot(r,kind)).length;}
   expect(count,option).toBeGreaterThan(0);expect(r.marks!.lines.length).toBe(want.segments.length);
  }
 });
});

describe('RSI failure swings (SYNTHETIC)',()=>{
 it('top: above 70, failure point, lower peak, then below the failure point fires on that bar',()=>{
  // 72 > 70 starts the swing; peak 75; decline to the failure point 62; rally to 71 (fails to exceed 75); 61 < 62 on bar 10.
  const r=[50,60,72,75,68,62,66,70,71,64,61,58],s=rsiFailureSwings(r,70,30);
  expect(ones(s.top)).toEqual([10]);expect(s.top.slice(0,10).every(v=>v===0)).toBe(true);expect(ones(s.bottom)).toEqual([]);
  expect(s.events).toEqual([{side:'top',peakIndex:3,failureIndex:5,secondIndex:8,signalIndex:10,peak:75,failure:62,second:71}]);
  expect(ones(rsiFailureSwings(r.slice(0,10),70,30).top)).toEqual([]);// not knowable before bar 10
 });
 it('a rally that exceeds the first peak restarts the swing from the new peak',()=>{
  // Peak 75, failure point 62, then 76 > 75: new peak 76, failure point 60, lower peak 63, 59 < 60 on bar 10.
  const s=rsiFailureSwings([50,72,75,68,62,76,70,65,60,63,59],70,30);expect(ones(s.top)).toEqual([10]);expect(s.events[0].peak).toBe(76);
 });
 it('bottom mirrors the top below 30; equal values never break the failure point',()=>{
  const s=rsiFailureSwings([50,40,28,25,32,38,34,30,29,36,39,42],70,30);expect(ones(s.bottom)).toEqual([10]);
  expect(ones(rsiFailureSwings([50,40,28,25,32,38,34,30,29,36,38,38],70,30).bottom)).toEqual([]);
 });
 it('the RSI equals the RSI built-in and the signals follow it; markers read FS top / FS bottom',()=>{
  const data=ohlc(wave(400).map((v,i)=>v+8*Math.sin(i/13))),mine=calc('rsifs',data),r=plot(calc('rsi',data,{length:14,source:'close'}),'rsi');
  near(plot(mine,'rsi'),r);const want=rsiFailureSwings(r,70,30);expect(plot(mine,'fsTop')).toEqual(want.top);expect(plot(mine,'fsBottom')).toEqual(want.bottom);
  expect(mine.marks!.markers.map(m=>m.text)).toEqual(want.events.map(e=>e.side==='top'?'FS top':'FS bottom'));
 });
});

describe('signal built-ins: no look-ahead (SYNTHETIC)',()=>{
 it('every plot on a prefix equals the full series',()=>{
  const data=ohlc(wave(260).map((v,i)=>v+6*Math.sin(i/11)));
  for(const kind of SIGNALS_INDICATOR_IDS){const full=calc(kind,data);for(const cut of [30,77,140,211]){const part=calc(kind,data.slice(0,cut));for(const row of full.series)near(plot(part,row.id),row.values.slice(0,cut));}}
 });
});

describe('RSI Show forming divergences (SYNTHETIC)',()=>{
 const policy={left:2,right:2,minBetween:1,maxBetween:20};
 const osc=[30,25,20,10,20,25,30,28,26,22,18,19],low=(i:number)=>i===3?100:i===10?95:110;
 const data=(values:readonly number[])=>values.map((_,i):Bar=>({time:D0+i*DAY,open:115,high:120,low:low(i),close:115,volume:1}));
 it('compares the latest unconfirmed extreme with the last confirmed pivot, and gives way once it is confirmed',()=>{
  // Last confirmed low: bar 3 (10). Bar 10 (18) is below bars 8-9 and below bar 11 but has only one bar after it: forming.
  // Price low 95 < 100 with oscillator 18 > 10: forming regular bullish from bar 3 to bar 10.
  expect(oscillatorFormingDivergence(osc,data(osc),policy,{kinds:['bullish']})).toEqual([{kind:'bullish',fromIndex:3,toIndex:10,fromRsi:10,toRsi:18}]);
  expect(oscillatorDivergence(osc,data(osc),policy,{kinds:['bullish']}).segments).toEqual([]);
  // Two more bars confirm bar 10: the confirmed divergence appears on bar 12 and nothing is forming any more.
  const later=[...osc,25,30];
  expect(oscillatorDivergence(later,data(later),policy,{kinds:['bullish']}).segments).toEqual([{kind:'bullish',fromIndex:3,toIndex:10,confirmIndex:12,fromRsi:10,toRsi:18}]);
  expect(oscillatorFormingDivergence(later,data(later),policy,{kinds:['bullish']})).toEqual([]);
 });
 it('off by default: RSI results, plots, alert operands and the presentation are unchanged',()=>{
  const rows=ohlc(wave(240)),legacy=calc('rsi',rows,{length:14,source:'close',divergence:true}),explicit=calc('rsi',rows,{length:14,source:'close',divergence:true,divergenceForming:false});
  expect(explicit).toEqual(legacy);expect(Object.hasOwn(legacy.divergence!,'forming')).toBe(false);
  expect(indicatorInputSchema('rsi').find(row=>row.key==='divergenceForming')).toMatchObject({title:'Show forming divergences',type:'bool',defval:false});
  expect(indicatorActivePlotIds('rsi',{divergence:true,divergenceForming:true})).toEqual(indicatorActivePlotIds('rsi',{divergence:true}));
  const on=calc('rsi',rows,{length:14,source:'close',divergence:true,divergenceForming:true});expect(on.series).toEqual(legacy.series);
 });
 it('drawn dashed and labelled forming on the RSI pane, only while it is forming',()=>{
  const all=ohlc(wave(400).map((v,i)=>v+5*Math.sin(i/5)));let checked=0;
  for(let cut=60;cut<=all.length&&checked<3;cut++){
   const rows=all.slice(0,cut),inputs={length:14,source:'close',divergence:true,divergenceForming:true,divergenceHiddenBullish:true,divergenceHiddenBearish:true},result=calc('rsi',rows,inputs);
   const forming=result.divergence!.forming!;if(!forming.length)continue;checked++;
   const out=renderIndicatorPresentation(settings('rsi',inputs),result,rows,{resolution:'1D'}),lines=(out.output.lines??[]).filter(line=>String(line.id).includes('forming'));
   expect(lines.length).toBe(forming.length);for(const line of lines){expect(line.style).toBe('dashed');expect((line as {overlay?:boolean}).overlay).toBeUndefined();}
   expect((out.output.labels??[]).filter(label=>/forming$/.test(String(label.text))).length).toBe(forming.length);
   const plain=renderIndicatorPresentation(settings('rsi',{...inputs,divergenceForming:false}),calc('rsi',rows,{...inputs,divergenceForming:false}),rows,{resolution:'1D'});
   expect((plain.output.lines??[]).some(line=>String(line.id).includes('forming'))).toBe(false);expect((plain.output.labels??[]).some(label=>/forming/.test(String(label.text)))).toBe(false);
  }
  expect(checked).toBe(3);
 });
});
