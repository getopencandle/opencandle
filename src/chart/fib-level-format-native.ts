import {Drawing,getDrawingType,registerDrawingType,type DrawingTypeMeta,type SerializedDrawing} from '@luxalgo/vela';
import {FIB_LEVEL_FORMAT_FIELD,FIB_LEVEL_FORMAT_DIAGNOSTIC,formatFibLevelRatio,isFibLevelFormat} from './fib-level-format';
import {FIB_TREND_LINE_FIELD,FIB_TREND_LINE_PREFIX,FIB_TREND_LINE_DIAGNOSTIC,readFibTrendLine,validateFibTrendLineSettings,assertFibTrendLinePatchValues,cloneFibTrendLineMember,type FibTrendLineSettings} from './fib-trend-line-data';
import {acquireFibTrendLineHit} from './fib-trend-line-runtime';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,FIB_BACKGROUND_DEFAULTS,FIB_TEXT_DEFAULTS,readFibBackground,readFibText,cloneFibPresentationMember,patchFibLevelPresentationProps,assertFibLevelPresentationPatchValues} from './fib-level-presentation-data';
import {validateFibLevelLabelChange} from './fib-level-text-policy';
import {FIB_RETRACEMENT_FACTORY_LEVELS,FIB_RETRACEMENT_FACTORY_PRESENTATION,cloneFibFactoryLevels} from './fib-factory-defaults';

type Init=Partial<SerializedDrawing>&{paneId:string};
/** The pinned native concrete class is obtained through its public registry.
 * Geometry stays inherited; these signatures describe the admitted boundary. */
interface NativeFib extends Drawing {
 readonly type:Drawing['type'];
 anchorSchema():ReturnType<Drawing['anchorSchema']>;
 hitTest(...args:Parameters<Drawing['hitTest']>):ReturnType<Drawing['hitTest']>;
 hitHandle(...args:Parameters<Drawing['hitHandle']>):ReturnType<Drawing['hitHandle']>;
 handlePoints(...args:Parameters<Drawing['handlePoints']>):ReturnType<Drawing['handlePoints']>;
 bounds(...args:Parameters<Drawing['bounds']>):ReturnType<Drawing['bounds']>;
 priceRange():ReturnType<Drawing['priceRange']>;
 schema():ReturnType<Drawing['schema']>;
 showRatios:boolean;showPrices:boolean;lvFibLevelFormat:unknown;
 levels:{ratio:number;color:string;enabled:boolean;label?:string}[];reverse:boolean;
 levelText(ratio:number,price:number):string;
 levelPrice(ratio:number,p1:number,p2:number):number;
}
const original=getDrawingType('fibretracement');
if(!original||original.type!=='fibretracement')throw Error('Fibonacci renderer registration is unavailable.');
const createDescriptor=Object.getOwnPropertyDescriptor(original,'create');
if(!createDescriptor||!Object.hasOwn(createDescriptor,'value')||typeof createDescriptor.value!=='function')throw Error('Fibonacci factory requires a data function.');
const sample=original.create({id:'lv-format-registration',paneId:'price',createdAt:0});
if(Object.hasOwn(sample,FIB_LEVEL_FORMAT_FIELD))throw Error('Fibonacci format renderer was already installed by another module instance.');
const prototype=Object.getPrototypeOf(sample),constructorDescriptor=Object.getOwnPropertyDescriptor(prototype,'constructor');
if(!(sample instanceof Drawing)||sample.type!=='fibretracement'||!constructorDescriptor||!Object.hasOwn(constructorDescriptor,'value')||typeof constructorDescriptor.value!=='function'||constructorDescriptor.value.prototype!==prototype)throw Error('Fibonacci concrete renderer is unavailable.');
const Base=constructorDescriptor.value as new(init:Init)=>NativeFib;
const defaultStyle=Object.getOwnPropertyDescriptor(original,'defaultStyle')?.value;
function primitiveData(value:unknown,key:string):unknown{const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):undefined;if(!d||!Object.hasOwn(d,'value'))throw Error('Fibonacci model requires a data field: '+key);return d.value;}
const trendLineDefaults=validateFibTrendLineSettings({schemaVersion:1,enabled:false,color:primitiveData(defaultStyle,'lineColor'),width:primitiveData(defaultStyle,'lineWidth'),style:primitiveData(defaultStyle,'lineStyle')});
const nativeModels=new WeakSet<object>();
const pins:{owner:object;prototype:object|null;key:string;descriptor:PropertyDescriptor|undefined}[]=[];
for(const key of ['constructor','levelText','readProps','writeProps','schema','applySettings','priceRange','levelPrice','levelLines','fillBands','hitTest','entryLines','handlePoints','bounds']){
 let owner:object|null=prototype,found=false;
 for(let depth=0;owner&&depth<16;depth++){
  const descriptor=Object.getOwnPropertyDescriptor(owner,key),parent=Object.getPrototypeOf(owner);
  pins.push({owner,prototype:parent,key,descriptor});
  if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Fibonacci inherited method is unavailable: '+key);found=true;break;}
  owner=parent;
 }
 if(!found)throw Error('Fibonacci inherited method is unavailable: '+key);
}
let registered:DrawingTypeMeta;
let retired=false;
let ownedPins:readonly {key:string;descriptor:PropertyDescriptor}[]=[];
function sameDescriptor(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean{
 if(!a||!b)return a===b;
 return Object.is(a.value,b.value)&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;
}
/** Application lifetime registration; no per-chart teardown or late migration. */
export function assertFibLevelFormatRegistration():void{
 if(retired)throw Error('Fibonacci format renderer is retired. Reopen the application before editing drawings.');
 try{
  if(getDrawingType('fibretracement')!==registered)throw Error('Fibonacci format renderer changed. Reopen the application before editing drawings.');
  if(Object.getPrototypeOf(LVFibRetracement.prototype)!==prototype)throw Error('Fibonacci owned renderer prototype changed. Reopen the application before editing drawings.');
  for(const pin of pins)if(Object.getPrototypeOf(pin.owner)!==pin.prototype||!sameDescriptor(Object.getOwnPropertyDescriptor(pin.owner,pin.key),pin.descriptor))throw Error('Fibonacci inherited renderer changed. Reopen the application before editing drawings.');
  for(const pin of ownedPins)if(!sameDescriptor(Object.getOwnPropertyDescriptor(LVFibRetracement.prototype,pin.key),pin.descriptor))throw Error('Fibonacci owned renderer changed. Reopen the application before editing drawings.');
 }catch(error){retired=true;throw error;}
}
export function nativeFibTrendLineDefaults():Readonly<FibTrendLineSettings>{assertFibLevelFormatRegistration();return trendLineDefaults;}
export function assertNativeFibTrendLineModel(model:unknown):void{
 assertFibLevelFormatRegistration();if(!model||typeof model!=='object'||!nativeModels.has(model)||Object.getPrototypeOf(model)!==LVFibRetracement.prototype||primitiveData(model,'type')!=='fibretracement')throw Error('Fibonacci trend-line model has no native origin.');
 for(const key of ['constructor','priceRange','levelPrice','levelLines','levelText','fillBands','hitTest','entryLines','handlePoints','bounds','serialize','readProps','writeProps','schema','applySettings'])if(Object.hasOwn(model,key))throw Error('Fibonacci native model method was replaced.');
 for(const key of ['anchors','levels']){const rows=primitiveData(model,key);if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>(key==='anchors'?2:10000)||Reflect.ownKeys(rows).length!==rows.length+1)throw Error('Fibonacci geometry requires dense native arrays without extra providers.');for(let i=0;i<rows.length;i++){const row=primitiveData(rows,String(i));if(!row||typeof row!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(row)))throw Error('Fibonacci geometry requires plain data.');for(const name of key==='anchors'?['time','price']:['ratio'])if(typeof primitiveData(row,name)!=='number'||!Number.isFinite(primitiveData(row,name)))throw Error('Fibonacci geometry must be finite.');if(key==='levels'&&typeof primitiveData(row,'enabled')!=='boolean')throw Error('Fibonacci level visibility is unavailable.');}}
 if(typeof primitiveData(model,'reverse')!=='boolean')throw Error('Fibonacci level direction is unavailable.');
}
/** Native settings use individual existing ordinals. Bulk replacement belongs
 * to the separate retained readProps/applyProps path, not this edit boundary. */
function preflightLevelSettings(model:object,patch:Record<string,unknown>){
 const unchanged=new Set<string>(),values=new Map<string,unknown>();
 for(const key of Reflect.ownKeys(patch)){
  if(typeof key!=='string'||key!=='levels'&&!key.startsWith('levels.'))continue;
  const match=/^levels\.(0|[1-9]\d*)\.(ratio|color|enabled|label)$/.exec(key);
  if(!match)throw Error('Fibonacci native settings require an individual existing level field.');
  const requested=Object.getOwnPropertyDescriptor(patch,key);
  if(!requested||!requested.enumerable||!Object.hasOwn(requested,'value'))throw Error('Fibonacci level settings require own data values.');
  if(!nativeModels.has(model)||Object.getPrototypeOf(model)!==LVFibRetracement.prototype||primitiveData(model,'type')!=='fibretracement')throw Error('Fibonacci level settings require a genuine native model.');
  const levels=primitiveData(model,'levels');
  if(!Array.isArray(levels)||Object.getPrototypeOf(levels)!==Array.prototype)throw Error('Fibonacci levels are unavailable.');
  const index=Number(match[1]),length=primitiveData(levels,'length');
  if(!Number.isSafeInteger(index)||typeof length!=='number'||index>=length)throw Error('Fibonacci level settings require an existing ordinal.');
  const slot=Object.getOwnPropertyDescriptor(levels,match[1]);
  if(!slot||!slot.enumerable||!Object.hasOwn(slot,'value')||!slot.value||typeof slot.value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(slot.value)))throw Error('Fibonacci level settings require a retained data row.');
  if(match[2]==='label'){
   const previous=Object.getOwnPropertyDescriptor(slot.value,'label');
   if(previous&&(!previous.enumerable||!Object.hasOwn(previous,'value')))throw Error('Fibonacci retained level text requires an own data value.');
   if(validateFibLevelLabelChange(previous?.value,requested.value)==='unchanged')unchanged.add(key);
  }
  values.set(key,requested.value);
 }
 return{unchanged,values};
}
class LVFibRetracement extends Base {
 // The base constructor invokes readProps before this constructor resumes.
 declare lvFibLevelFormat:unknown;
 declare lvFibTrendLine:unknown;
 declare lvFibBackground:unknown;
 declare lvFibText:unknown;
 constructor(init:Init){
  assertFibLevelFormatRegistration();super(init);if(!Object.hasOwn(this,FIB_LEVEL_FORMAT_FIELD))this.lvFibLevelFormat='coefficient';if(!Object.hasOwn(this,FIB_TREND_LINE_FIELD))this.lvFibTrendLine={...trendLineDefaults};if(!Object.hasOwn(this,FIB_BACKGROUND_FIELD))this.lvFibBackground={...FIB_BACKGROUND_DEFAULTS};if(!Object.hasOwn(this,FIB_TEXT_FIELD))this.lvFibText={...FIB_TEXT_DEFAULTS};
  // Factory seed of a NEW drawing only. A retained
  // record (it carries its type) and any carried props keep their own values, so saved drawings never change.
  if((init as {type?:unknown}).type===undefined){
   const carried=init.props!==undefined&&typeof init.props==='object'?init.props:undefined,has=(key:string)=>carried!==undefined&&Object.hasOwn(carried,key);
   if(!has('levels'))this.levels=cloneFibFactoryLevels(FIB_RETRACEMENT_FACTORY_LEVELS);
   if(!has(FIB_TREND_LINE_FIELD))this.lvFibTrendLine={...FIB_RETRACEMENT_FACTORY_PRESENTATION.trendLine};
   if(!has(FIB_BACKGROUND_FIELD))this.lvFibBackground={...FIB_RETRACEMENT_FACTORY_PRESENTATION.background};
  }
 }
 protected readProps(props:Record<string,unknown>):void{
  assertFibLevelFormatRegistration();
  const member=Object.getOwnPropertyDescriptor(props,FIB_LEVEL_FORMAT_FIELD);
  const baseline=Object.getOwnPropertyDescriptor(props,FIB_TREND_LINE_FIELD);
  if(baseline&&(!baseline.enumerable||!Object.hasOwn(baseline,'value')))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
  const baselineValue=baseline?cloneFibTrendLineMember(baseline.value):undefined;
  const presentations=[FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD].map(key=>{const field=Object.getOwnPropertyDescriptor(props,key);if(field&&(!field.enumerable||!Object.hasOwn(field,'value')))throw Error('Fibonacci presentation requires retained data.');return{key,field,value:field?cloneFibPresentationMember(field.value):undefined};});
  if(member&&(!member.enumerable||!Object.hasOwn(member,'value')))throw Error('Fibonacci format requires retained plain data.');
  super.readProps(props);
  if(baseline&&(!Object.hasOwn(this,FIB_TREND_LINE_FIELD)||readFibTrendLine({[FIB_TREND_LINE_FIELD]:primitiveData(this,FIB_TREND_LINE_FIELD)},trendLineDefaults).state!=='unavailable'))this.lvFibTrendLine=baselineValue;
  for(const {key,field,value} of presentations)if(field&&(!Object.hasOwn(this,key)||(key===FIB_BACKGROUND_FIELD?readFibBackground:readFibText)({[key]:primitiveData(this,key)}).state!=='unavailable'))Reflect.set(this,key,value);
  if(!member)return;
  // Native defaults/partial updates cannot reinterpret an unsupported member.
  // Loading a replacement document creates a fresh model through the factory.
  if(Object.hasOwn(this,FIB_LEVEL_FORMAT_FIELD)&&!isFibLevelFormat(this.lvFibLevelFormat))return;
  this.lvFibLevelFormat=structuredClone(member.value);
 }
 protected writeProps():Record<string,unknown>{assertFibLevelFormatRegistration();return{...super.writeProps(),[FIB_LEVEL_FORMAT_FIELD]:structuredClone(this.lvFibLevelFormat),[FIB_TREND_LINE_FIELD]:cloneFibTrendLineMember(primitiveData(this,FIB_TREND_LINE_FIELD)),[FIB_BACKGROUND_FIELD]:cloneFibPresentationMember(primitiveData(this,FIB_BACKGROUND_FIELD)),[FIB_TEXT_FIELD]:cloneFibPresentationMember(primitiveData(this,FIB_TEXT_FIELD))};}
 schema():ReturnType<Drawing['schema']>{
  assertFibLevelFormatRegistration();const base=super.schema();
  const baseline=readFibTrendLine({[FIB_TREND_LINE_FIELD]:primitiveData(this,FIB_TREND_LINE_FIELD)},trendLineDefaults);
  return{...base,fields:[...base.fields,...isFibLevelFormat(this.lvFibLevelFormat)?[{path:FIB_LEVEL_FORMAT_FIELD,label:'Level format',kind:'select' as const,group:'text' as const,options:[{value:'coefficient',label:'Coefficients'},{value:'percent',label:'Percent'}]}]:[],...baseline.state!=='unavailable'?[
   {path:FIB_TREND_LINE_PREFIX+'enabled',label:'Trend line',kind:'boolean' as const,group:'line' as const},
   {path:FIB_TREND_LINE_PREFIX+'color',label:'Trend line color',kind:'color' as const,group:'line' as const},
   {path:FIB_TREND_LINE_PREFIX+'width',label:'Trend line width',kind:'number' as const,group:'line' as const,min:1,max:10,step:1},
   {path:FIB_TREND_LINE_PREFIX+'style',label:'Trend line style',kind:'lineStyle' as const,group:'line' as const}
  ]:[],...readFibBackground({[FIB_BACKGROUND_FIELD]:primitiveData(this,FIB_BACKGROUND_FIELD)}).state!=='unavailable'?[{path:FIB_BACKGROUND_FIELD+'.opacity',label:'Background opacity',kind:'number' as const,group:'fill' as const,min:0,max:100}]:[],...readFibText({[FIB_TEXT_FIELD]:primitiveData(this,FIB_TEXT_FIELD)}).state!=='unavailable'?[
   {path:FIB_TEXT_FIELD+'.enabled',label:'Show custom level text',kind:'boolean' as const,group:'text' as const},
   {path:FIB_TEXT_FIELD+'.position',label:'Custom level text position',kind:'select' as const,group:'text' as const,options:[{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}]}
  ]:[]]};
 }
 applySettings(patch:Record<string,unknown>):void{
  assertFibLevelFormatRegistration();
  const levelSettings=preflightLevelSettings(this,patch);
  const member=Object.getOwnPropertyDescriptor(patch,FIB_LEVEL_FORMAT_FIELD);
  if(member&&(!Object.hasOwn(member,'value')||!isFibLevelFormat(this.lvFibLevelFormat)||!isFibLevelFormat(member.value)))throw Error(FIB_LEVEL_FORMAT_DIAGNOSTIC);
  assertFibTrendLinePatchValues(patch);assertFibLevelPresentationPatchValues(patch);const next:Record<string,unknown>={},remaining:Record<string,unknown>={},presentationPatch:Record<string,unknown>={};let baselineChanged=false;
  for(const key of Object.keys(patch)){if(levelSettings.unchanged.has(key))continue;if(key.startsWith(FIB_TREND_LINE_PREFIX)){next[key.slice(FIB_TREND_LINE_PREFIX.length)]=patch[key];baselineChanged=true;}else if(key.startsWith(FIB_BACKGROUND_FIELD+'.')||key.startsWith(FIB_TEXT_FIELD+'.'))presentationPatch[key]=patch[key];else remaining[key]=levelSettings.values.has(key)?levelSettings.values.get(key):patch[key];}
  let baseline:Readonly<FibTrendLineSettings>|undefined;
  if(baselineChanged){const current=readFibTrendLine({[FIB_TREND_LINE_FIELD]:primitiveData(this,FIB_TREND_LINE_FIELD)},trendLineDefaults);if(current.state==='unavailable')throw Error(FIB_TREND_LINE_DIAGNOSTIC);baseline=validateFibTrendLineSettings({...current.settings,...next});}
  const presentation=patchFibLevelPresentationProps({[FIB_BACKGROUND_FIELD]:primitiveData(this,FIB_BACKGROUND_FIELD),[FIB_TEXT_FIELD]:primitiveData(this,FIB_TEXT_FIELD)},presentationPatch) as Record<string,unknown>;
  super.applySettings(remaining);if(baseline)this.lvFibTrendLine={...baseline};for(const key of [FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD])if(Object.keys(presentationPatch).some(path=>path.startsWith(key+'.')))Reflect.set(this,key,cloneFibPresentationMember(presentation[key]));
 }
 priceRange():ReturnType<Drawing['priceRange']>{
  assertFibLevelFormatRegistration();const state=readFibTrendLine({[FIB_TREND_LINE_FIELD]:primitiveData(this,FIB_TREND_LINE_FIELD)},trendLineDefaults);if(state.state==='unavailable'||!state.settings.enabled)return super.priceRange();
  assertNativeFibTrendLineModel(this);const anchors=this.anchors;if(anchors.length<2)return super.priceRange();const a=anchors[0].price,b=anchors[1].price;let min=Math.min(a,b),max=Math.max(a,b);
  for(let i=0;i<this.levels.length;i++){const level=this.levels[i];if(level.enabled){const price=super.levelPrice(level.ratio,a,b);if(!Number.isFinite(price))throw Error('Fibonacci price range is unavailable: a level price overflowed and is not finite.');min=Math.min(min,price);max=Math.max(max,price);}}return{min,max};
 }
 hitTest(...args:Parameters<Drawing['hitTest']>):boolean{
  assertFibLevelFormatRegistration();const state=readFibTrendLine({[FIB_TREND_LINE_FIELD]:primitiveData(this,FIB_TREND_LINE_FIELD)},trendLineDefaults);
  let lease:ReturnType<typeof acquireFibTrendLineHit>;
  if(state.state!=='unavailable'&&state.settings.enabled)try{lease=acquireFibTrendLineHit(this,args[2]);}catch{/* A refused extra segment does not replace inherited level hit semantics. */}
  try{if(super.hitTest(...args))return true;if(!lease)return false;lease.assertCurrent();const line=lease.points,result=Reflect.apply(Base.prototype.hitTest,Object.freeze({entryLines:()=>Object.freeze([line])}),args);lease.assertCurrent();lease.assertLocal();return result===true;}finally{lease?.dispose();}
 }
 levelText(ratio:number,price:number):string{
  assertFibLevelFormatRegistration();
  if(!this.showRatios||this.lvFibLevelFormat==='coefficient')return super.levelText(ratio,price);
  const label=this.lvFibLevelFormat==='percent'?formatFibLevelRatio(ratio,'percent'):'';
  const priceText=price.toFixed(2);
  return label?(this.showPrices?label+' ('+priceText+')':label):(this.showPrices?priceText:'');
 }
}
ownedPins=Object.freeze(['constructor','readProps','writeProps','schema','applySettings','priceRange','hitTest','levelText'].map(key=>({key,descriptor:Object.getOwnPropertyDescriptor(LVFibRetracement.prototype,key)!})));
// A new Fib retracement starts above the series stack (vela startZ coversSeries),
// so its level lines and ratio/price labels are not buried under candles and indicator plots. Its background bands stay translucent.
registered=Object.freeze({...original,coversSeries:true,defaultStyle:{...(defaultStyle as object),lineWidth:FIB_RETRACEMENT_FACTORY_PRESENTATION.levelsLineWidth,lineStyle:FIB_RETRACEMENT_FACTORY_PRESENTATION.levelsLineStyle} as typeof original.defaultStyle,create:(init:Init)=>{assertFibLevelFormatRegistration();const drawing=new LVFibRetracement(init);assertFibLevelFormatRegistration();nativeModels.add(drawing);return drawing;}});
registerDrawingType(registered);
assertFibLevelFormatRegistration();
