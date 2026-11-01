import {describe,expect,it} from 'vitest';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {INDICATOR_KINDS,defaultIndicatorPresentation,indicatorInputSchema,indicatorOffsetBounds,validateIndicatorInputs,validateIndicatorSnapshots,validateFrozenIndicatorInputs,indicatorLegacyDefaults,type IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {filterIndicatorCatalog,indicatorAcronyms,indicatorNames} from '../../src/ui/indicator-dialog-model';

/**
 * INDFIX fail-first checks. Every expected value below is copied from a fact in
 * the recorded fact files (cited as F#<id>) or
 * the recorded fact files (V#<id>). Legacy-layer facts describe the
 * reference descriptor; STD equality is inferred (see the facts file scopeNote). */
const schema=(kind:IndicatorId)=>indicatorInputSchema(kind);
const field=(kind:IndicatorId,key:string)=>schema(kind).find(row=>row.key===key);

describe('names and short titles (F#<kind>.std, V#technicals.tab.indicators)',()=>{
 it('display names follow the STD built-in names',()=>{
  const expected:Record<string,string>={cci:'Commodity channel index',stochrsi:'Stochastic RSI',willr:'Williams percent range',mfi:'Money flow index',cmf:'Chaikin money flow',mom:'Momentum',roc:'Rate of change',ao:'Awesome oscillator',aroon:'Aroon',dmi:'Directional movement index',adx:'Average directional index',psar:'Parabolic SAR',supertrend:'Supertrend',kc:'Keltner channels',dc:'Donchian channels',env:'Envelope',lsma:'Least squares moving average',wma:'Weighted moving average',hma:'Hull moving average',smma:'Smoothed moving average'};
  for(const [kind,name] of Object.entries(expected)){expect(catalogDefinition(kind)!.name,kind).toBe(name);expect(indicatorNames[kind as IndicatorId]).toBe(name);}
 });
 it('short titles follow the STD built-in short titles',()=>{
  const expected:Record<string,string>={cci:'CCI',stochrsi:'Stoch RSI',willr:'Williams %R',mfi:'MFI',cmf:'CMF',mom:'Mom',roc:'ROC',ao:'AO',aroon:'Aroon',dmi:'DMI',adx:'ADX',psar:'SAR',supertrend:'Supertrend',kc:'KC',dc:'DC',env:'Env',lsma:'LSMA',wma:'WMA',hma:'HMA',smma:'Smoothed MA'};
  for(const [kind,short] of Object.entries(expected))expect(indicatorAcronyms[kind as IndicatorId],kind).toBe(short);
 });
 it('the catalog lists rows alphabetically by name, case-insensitively (V#technicals.tab.indicators)',()=>{
  const rows=filterIndicatorCatalog(INDICATOR_KINDS,'All',[],'').rows.map(kind=>indicatorNames[kind]);
  expect(rows).toEqual([...rows].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})));
  const fav=filterIndicatorCatalog(INDICATOR_KINDS,'Favorites',['wma','ao','cci'],'').rows;
  expect(fav).toEqual(['ao','cci','wma']);
  // The observed reference rows keep this relative order.
  const observed=['Aroon','Average directional index','Awesome oscillator','Bollinger Bands','Chaikin money flow','Commodity channel index'];
  expect(rows.filter(name=>observed.includes(name))).toEqual(observed);
 });
});

describe('input labels, shapes and ranges (F#<kind>.input.*)',()=>{
 it('lengths use the fact bounds',()=>{
  const bounds:[IndicatorId,string,number][]=[['cci','length',2000],['willr','length',2000],['mfi','length',2000],['cmf','length',2000],['mom','length',2000],['roc','length',2000],['aroon','length',2000],['kc','length',2000],['dc','length',2000],['env','length',2000],['dmi','diLength',2000],['dmi','adxSmoothing',50],['stochrsi','smoothK',10000],['stochrsi','smoothD',10000],['stochrsi','rsiLength',10000],['stochrsi','stochLength',10000],['wma','length',10000],['hma','length',10000]];
  for(const [kind,key,max] of bounds){expect(field(kind,key),`${kind}.${key}`).toMatchObject({min:1,max});expect(()=>validateIndicatorInputs(kind,{[key]:max})).not.toThrow();expect(()=>validateIndicatorInputs(kind,{[key]:max+1}),`${kind}.${key} max+1`).toThrow();}
 });
 it('labels follow the facts',()=>{
  expect(schema('stochrsi').map(row=>row.title)).toEqual(['K','D','RSI Length','Stochastic Length','RSI Source']);
  expect(field('dmi','diLength')!.title).toBe('DI Length');
  expect(field('dmi','adxSmoothing')!.title).toBe('ADX smoothing');
  expect(field('psar','maximum')!.title).toBe('Max value');
  expect(field('hma','source')!.title).toBe('Price');
  expect(field('volume','length')!.title).toBe('MA Length');
 });
 it('PSAR, KC multiplier and ENV percent are unbounded with no step',()=>{
  for(const [kind,key] of [['psar','start'],['psar','increment'],['psar','maximum'],['kc','multiplier'],['env','percent']] as [IndicatorId,string][]){
   const row=field(kind,key)!;expect(row.type,`${kind}.${key}`).toBe('float');expect(row.min).toBeUndefined();expect(row.max).toBeUndefined();expect(row.step).toBeUndefined();
   for(const value of [-1,0,100,1e9])expect(()=>validateIndicatorInputs(kind,{[key]:value})).not.toThrow();
   expect(()=>validateIndicatorInputs(kind,{[key]:Number.POSITIVE_INFINITY})).toThrow();
  }
 });
 it('AO has no inputs (F#ao.legacy inputCount 0)',()=>{expect(schema('ao')).toEqual([]);expect(()=>validateIndicatorInputs('ao',{fast:5})).toThrow();});
 it('KC inputs: Length, Multiplier, Source, Exponential, Bands style [range, true range] = true range',()=>{
  // reference Bands style adds Average True Range (the new default) with ATR length 10; saved KCs keep true range.
  expect(schema('kc').map(row=>[row.key,row.title])).toEqual([['length','Length'],['multiplier','Multiplier'],['source','Source'],['exponential','Exponential'],['bandsStyle','Bands style'],['atrLength','ATR length']]);
  expect(field('kc','bandsStyle')).toMatchObject({type:'string',defval:'average true range',options:['average true range','true range','range']});
  expect(field('kc','exponential')).toMatchObject({type:'bool',defval:true});expect(field('kc','multiplier')!.defval).toBe(2);/* Desktop default 2 (saved instances keep 1) */
 });
 it('ENV inputs: Length, Percent (10), Source, Exponential',()=>{
  expect(schema('env').map(row=>[row.key,row.title,row.defval])).toEqual([['length','Length',20],['percent','Percent',10],['source','Source','close'],['exponential','Exponential',false]]);
 });
 it('WMA offset is bounded to -500..500 for edits (F#wma.input.offset); other kinds keep the shared range',()=>{
  expect(indicatorOffsetBounds('wma')).toEqual({min:-500,max:500});
  expect(indicatorOffsetBounds('cci')).toEqual({min:-100000,max:100000});
 });
});

describe('plots, guides, fills, palette and precision defaults',()=>{
 const bars=Array.from({length:40},(_,i)=>({time:1704067200+i*86400,open:10+Math.sin(i),high:11+Math.sin(i)+i%3*0.1,low:9+Math.sin(i),close:10+Math.cos(i),volume:1000+i*7}));
 it('plot titles follow the facts (F#<kind>.plot.*)',()=>{
  const titles=(kind:IndicatorId)=>calculateIndicator(kind,bars).series.map(row=>row.label);
  expect(titles('stochrsi')).toEqual(['K','D']);expect(titles('mfi')).toEqual(['MF']);expect(titles('cmf')).toEqual(['MF']);expect(titles('mom')).toEqual(['MOM']);
  expect(titles('ao')).toEqual(['AO']);/* the descriptor records OA; the legend shows the tool's name */expect(titles('psar')).toEqual(['ParabolicSAR']);expect(titles('wma')).toEqual(['MA']);expect(titles('hma')).toEqual(['Hull MA']);
 });
 it('plot colors and widths follow the facts; Volume MA is hidden by default',()=>{
  const expected:Record<string,Record<string,string>>={cci:{cci:'#996a15'},stochrsi:{k:'#0094ff',d:'#ff6a00'},willr:{r:'#3a6ca8'},mfi:{mfi:'#459915'},cmf:{cmf:'#459915'},mom:{mom:'#999915'},roc:{roc:'#156a99'},ao:{histogram:'#ff006e'},aroon:{up:'#ff6a00',down:'#0094ff'},dmi:{adx:'#ff006e',plusDI:'#0094ff',minusDI:'#ff6a00'},psar:{sar:'#3a6ca8'},kc:{upper:'#0094ff',basis:'#0094ff',lower:'#0094ff'},dc:{basis:'#ff6a00',upper:'#0094ff',lower:'#0094ff'},env:{basis:'#ff6a00',upper:'#0094ff',lower:'#0094ff'},wma:{wma:'#3a61a5'},hma:{hma:'#674ea7'}};
  for(const [kind,plots] of Object.entries(expected))Object.entries(plots).forEach(([plot,color])=>{const ordinal=catalogDefinition(kind)!.plots.findIndex(row=>row.id===plot);expect(defaultPlotStyle(kind as IndicatorId,plot,ordinal),`${kind}.${plot}`).toMatchObject({color,width:1,visible:true});});
  expect(defaultPlotStyle('ao','histogram',0).kind).toBe('histogram');expect(defaultPlotStyle('psar','sar',0).kind).toBe('cross');
  expect(defaultPlotStyle('volume','ma',1)).toMatchObject({visible:false,color:'#2962ff',width:1});
 });
 it('guide bands and backgrounds follow the facts',()=>{
  const guide=(value:number,color:string)=>({visible:true,value,color,width:1,lineStyle:'dashed'});
  const cci=defaultIndicatorPresentation('cci');expect(cci.guides).toEqual({upper:guide(100,'#c0c0c0'),lower:guide(-100,'#c0c0c0')});expect(cci.fills).toEqual({band:{visible:true,color:'#996a15',opacity:10}});
  const srsi=defaultIndicatorPresentation('stochrsi');expect(srsi.guides).toEqual({upper:guide(80,'#606060'),lower:guide(20,'#606060')});expect(srsi.fills).toEqual({band:{visible:true,color:'#9915ff',opacity:20}});
  const mfi=defaultIndicatorPresentation('mfi');expect(mfi.guides).toEqual({upper:guide(80,'#c0c0c0'),lower:guide(20,'#c0c0c0')});expect(mfi.fills).toEqual({band:{visible:true,color:'#9915ff',opacity:10}});
  const roc=defaultIndicatorPresentation('roc');expect(roc.guides).toEqual({zero:guide(0,'#c0c0c0')});expect(roc.fills).toEqual({});
  const willr=defaultIndicatorPresentation('willr');expect(willr.guides).toEqual({upper:guide(-20,'#606060'),lower:guide(-80,'#606060')});expect(willr.fills).toEqual({band:{visible:true,color:'#9915ff',opacity:10}});
  expect(defaultIndicatorPresentation('cmf').guides).toEqual({zero:guide(0,'#606060')});
  for(const kind of ['kc','dc','env'] as IndicatorId[])expect(defaultIndicatorPresentation(kind).fills,kind).toEqual({band:{visible:true,color:'#0094ff',opacity:5}});
 });
 it('AO uses the two-color Growing/Falling palette',()=>{
  expect(defaultIndicatorPresentation('ao').histogramPalette).toEqual({nonnegativeRising:'#007f0e',negativeRising:'#007f0e',nonnegativeFalling:'#872323',negativeFalling:'#872323'});
 });
 it('default precision follows the legacy format facts',()=>{
  const expected:Record<string,number|'auto'>={cci:2,stochrsi:2,willr:2,mfi:2,cmf:2,roc:2,aroon:2,dmi:4,mom:'auto',ao:'auto',psar:'auto',kc:'auto',dc:'auto',env:'auto',wma:'auto',hma:'auto'};
  for(const [kind,precision] of Object.entries(expected))expect(defaultIndicatorPresentation(kind as IndicatorId).precision,kind).toBe(precision);
 });
});

// Renderer-free lifecycle stand-in (same pattern as tests/chart/indicator-restore.test.ts); not executable UI evidence.
function lifecycleChart(){
 const full=Array.from({length:30},(_,i)=>({time:(1700000000+i*60)*1000,open:10+i%4,high:12+i%5,low:9+i%3*0.1,close:10.5+i%6*0.3,volume:100+i}));
 let sequence=0;const live=new Map<string,{model:NativeIndicator;pane:string}>();
 const chart={
  panes:{list:()=>[...new Set(['price',...[...live.values()].map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.pane===id).map(([id])=>({id}))}))},
  addNativeIndicator(type:string){
   const descriptor=getNativeIndicator(type)!,id=`renderer-${++sequence}`,model=descriptor.create();const row={model,pane:descriptor.paneHint==='price'?'price':`pane-${sequence}`};live.set(id,row);
   const inputs=descriptor.defaultInputs();let visible=true;
   const handle={id,title:descriptor.title,setInputs:(values:any)=>model.setInputs(values),setVisible:(value:boolean)=>{visible=value;value?model.resume():model.suspend();},get visible(){return visible;},moveTo:(target:any)=>{row.pane=typeof target==='string'?target:target.pane??`new-pane-${++sequence}`;},remove:()=>{model.stop();live.delete(id);}};
   model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>full,emit:()=>{},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,inputs);
   return handle;
  },
 };
 return chart as unknown as Vela;
}
const snap=(id:string,kind:IndicatorId,inputs:Record<string,unknown>,offset=0):IndicatorSnapshot=>({id,kind,inputs,plots:{},offset,visible:true,paneId:null} as unknown as IndicatorSnapshot);

describe('saved workspaces with pre-fix indicator settings still load',()=>{
 const old=[
  snap('env-sym','env',{length:5,upperPercent:12,lowerPercent:12,source:'close',exponential:false}),
  snap('env-asym','env',{length:5,upperPercent:10,lowerPercent:5,source:'close',exponential:false}),
  snap('kc-range','kc',{length:5,multiplier:1.5,source:'close',exponential:true,trueRange:false}),
  snap('ao-default','ao',{fast:5,slow:34}),
  snap('ao-custom','ao',{fast:3,slow:5}),
  snap('cci-long','cci',{length:5000,source:'close'}),
  snap('psar-old','psar',{start:0.02,increment:0.02,maximum:0.2}),
  snap('wma-far','wma',{length:4,source:'close'},2000),
 ];
 it('old snapshots validate (removed inputs and pre-fix bounds are tolerated in stored state)',()=>{
  expect(()=>validateIndicatorSnapshots(old)).not.toThrow();
 });
 it('restore migrates lossless shapes and keeps legacy calculations',()=>{
  const port=createIndicatorPort(lifecycleChart());port.restore(old);
  const rows=Object.fromEntries(port.serialize().map(row=>[row.id,row]));
  expect(rows['env-sym'].inputs).toEqual({length:5,percent:12,source:'close',exponential:false});
  expect(rows['env-asym'].inputs).toEqual({length:5,upperPercent:10,lowerPercent:5,source:'close',exponential:false});// No Percent default merged in
  expect(rows['kc-range'].inputs).toEqual({length:5,multiplier:1.5,source:'close',exponential:true,bandsStyle:'range'});
  expect(rows['ao-default'].inputs).toEqual({});
  expect(rows['ao-custom'].inputs).toEqual({fast:3,slow:5});
  expect(rows['cci-long'].inputs.length).toBe(5000);
  expect(rows['wma-far'].offset).toBe(2000);
  // Calculations are unchanged by the migration.
  const value=(id:string,plot:string)=>port.values(id).series.find(row=>row.id===plot)!.values;
  const bars=port.list().length;expect(bars).toBe(old.length);expect(port.values('env-asym').diagnostics).toEqual([]);
  const envBasis=value('env-asym','basis'),envUpper=value('env-asym','upper'),envLower=value('env-asym','lower');
  envBasis.forEach((basis,i)=>{if(basis!==null){expect(envUpper[i]).toBeCloseTo(basis*1.1,12);expect(envLower[i]).toBeCloseTo(basis*0.95,12);}});
  const sym=value('env-sym','basis'),symUpper=value('env-sym','upper');sym.forEach((basis,i)=>{if(basis!==null)expect(symUpper[i]).toBeCloseTo(basis*1.12,12);});
  port.dispose();
 });
 it('edits use the fact bounds; Percent replaces the legacy pair; the WMA offset edit bound applies',()=>{
  const port=createIndicatorPort(lifecycleChart());port.restore(old);
  expect(()=>port.update('cci-long',{inputs:{length:2001}})).toThrow();
  port.update('cci-long',{inputs:{length:2000}});expect(port.serialize().find(row=>row.id==='cci-long')!.inputs.length).toBe(2000);
  port.update('psar-old',{inputs:{start:-1}});
  port.update('env-asym',{inputs:{percent:7}});expect(port.serialize().find(row=>row.id==='env-asym')!.inputs).toEqual({length:5,percent:7,source:'close',exponential:false});
  expect(()=>port.update('ao-default',{inputs:{fast:4}})).toThrow();
  expect(()=>port.update('wma-far',{offset:501})).toThrow();port.update('wma-far',{offset:500});
  port.update('wma-far',{offset:-500});expect(port.serialize().find(row=>row.id==='wma-far')!.offset).toBe(-500);
  port.dispose();
 });
 it('R-INDFIX-1: an unchanged or style-only Apply keeps an asymmetric legacy ENV pair and its bands',()=>{
  const port=createIndicatorPort(lifecycleChart());port.restore(old);
  const asym={length:5,upperPercent:10,lowerPercent:5,source:'close',exponential:false};
  const row=()=>port.list().find(item=>item.id==='env-asym')!;
  const bands=()=>{const v=(plot:string)=>port.values('env-asym').series.find(s=>s.id===plot)!.values;const basis=v('basis'),upper=v('upper'),lower=v('lower');basis.forEach((b,i)=>{if(b!==null){expect(upper[i]).toBeCloseTo(b*1.1,12);expect(lower[i]).toBeCloseTo(b*0.95,12);}});};
  // The dialog re-sends the whole draft (indicatorRowDraft) on Apply, even for a style-only change.
  port.update('env-asym',{inputs:{...row().inputs},plots:{basis:{...defaultPlotStyle('env','basis',0),color:'#123456'}},offset:0,visible:true});
  expect(row().inputs).toEqual(asym);bands();
  port.update('env-asym',{inputs:{...row().inputs,length:6}});expect(row().inputs).toEqual({...asym,length:6});
  port.update('env-asym',{inputs:{...row().inputs,percent:10}});// an explicit Percent edit replaces the pair (user-visible)
  expect(row().inputs).toEqual({length:6,percent:10,source:'close',exponential:false});
  port.dispose();
 });
 it('R-INDFIX-2: pre-fix saved defaults add without error and keep their values',()=>{
  const port=createIndicatorPort(lifecycleChart());
  const add=(kind:IndicatorId,inputs:Record<string,unknown>)=>{const id=port.add(kind,inputs as never,{inputs:inputs as never,plots:{},offset:0,visible:true});return port.list().find(row=>row.id===id)!;};
  expect(add('env',{length:20,upperPercent:12,lowerPercent:8,source:'close',exponential:false}).inputs).toEqual({length:20,upperPercent:12,lowerPercent:8,source:'close',exponential:false});
  expect(add('env',{length:20,upperPercent:12,lowerPercent:12,source:'close',exponential:false}).inputs).toEqual({length:20,percent:12,source:'close',exponential:false});
  expect(add('kc',{length:20,multiplier:1,source:'close',exponential:true,trueRange:false}).inputs).toEqual({length:20,multiplier:1,source:'close',exponential:true,bandsStyle:'range'});
  expect(add('ao',{fast:3,slow:5}).inputs).toEqual({fast:3,slow:5});
  expect(add('cci',{length:5000,source:'close'}).inputs).toEqual({length:5000,source:'close'});
  // Without saved defaults the explicit inputs are tolerated the same way.
  const plain=port.add('ao',{fast:3,slow:5} as never);expect(port.list().find(row=>row.id===plain)!.inputs).toEqual({fast:3,slow:5});
  port.dispose();
 });
 it('R-INDFIX-3: only changed fields meet the edit bounds; the error names the bound',()=>{
  const port=createIndicatorPort(lifecycleChart());port.restore(old);
  port.update('cci-long',{inputs:{length:5000,source:'open'}});expect(port.serialize().find(row=>row.id==='cci-long')!.inputs).toEqual({length:5000,source:'open'});
  expect(()=>port.update('cci-long',{inputs:{length:4000}})).toThrow(/1 through 2000/);
  port.update('wma-far',{offset:2000,visible:false});expect(port.serialize().find(row=>row.id==='wma-far')!.offset).toBe(2000);
  expect(()=>port.update('wma-far',{offset:1000})).toThrow(/-500 through 500/);
  port.dispose();
 });
 it('frozen alert inputs captured before the fix stay valid',()=>{
  expect(()=>validateFrozenIndicatorInputs('env',{length:20,upperPercent:10,lowerPercent:10,source:'close',exponential:false},'upper')).not.toThrow();
  expect(()=>validateFrozenIndicatorInputs('kc',{length:20,multiplier:1,source:'close',exponential:true,trueRange:true},'upper')).not.toThrow();
  expect(()=>validateFrozenIndicatorInputs('ao',{fast:5,slow:34},'histogram')).not.toThrow();
  expect(()=>validateFrozenIndicatorInputs('env',indicatorLegacyDefaults.env,'upper')).not.toThrow();
 });
 it('kernels honor legacy shapes: KC trueRange alias equals Bands style',()=>{
  // Gapping synthetic bars so that true range differs from high - low.
  const bars=Array.from({length:20},(_,i)=>({time:i*86400,open:9.5+i*2,high:10+i*2+i%3*0.1,low:9+i*2,close:9.5+i*2,volume:1}));
  const a=calculateIndicator('kc',bars,{length:5,trueRange:false}),b=calculateIndicator('kc',bars,{length:5,bandsStyle:'range'});
  expect(a.series).toEqual(b.series);
  const c=calculateIndicator('kc',bars,{length:5,bandsStyle:'true range'}),d=calculateIndicator('kc',bars,{length:5,trueRange:true});expect(c.series).toEqual(d.series);expect(c.series).not.toEqual(b.series);
  // An input set without Bands style now means the reference default, Average True Range.
  expect(calculateIndicator('kc',bars,{length:5}).series).toEqual(calculateIndicator('kc',bars,{length:5,bandsStyle:'average true range',atrLength:10}).series);
 });
});
