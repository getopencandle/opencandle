import type {CompoundAlertBook} from './compound-alert-book';
import type {AlertDraft,AlertSourceChoice} from './AlertDialog';
import type {CompoundFormChoice} from './compound-alert-form';
import type {CompoundConditionDraft} from './CompoundConditionEditor';
import type {CompoundContext,CompoundDefinition,CompoundSource} from '../domain/compound-alerts';
import {indicatorSmoothingSettings} from '../domain/indicators';

/** App-owned canonical collection and actual action clock only. No numerical
 * publisher callback, mutable store DTO or source permission is accepted. */
export interface CompoundAlertDialogController {readonly book:CompoundAlertBook;readonly readActionTime:()=>number}
export interface CompoundDialogChoice extends CompoundFormChoice {readonly catalogId?:string;readonly catalogIds?:readonly string[]}
export const COMPOUND_DIALOG_OPERATORS=Object.freeze([
 ['crossing','Crossing'],['crossing-up','Crossing up'],['crossing-down','Crossing down'],['greater','Greater than'],['less','Less than'],['inside','Inside channel'],['outside','Outside channel'],['entering','Entering channel'],['exiting','Exiting channel']
] as const);
const fieldNames:Readonly<Record<string,string>>=Object.freeze({open:'Open',high:'High',low:'Low',close:'Close',hl2:'High/Low average',hlc3:'Typical price',ohlc4:'OHLC average'});
const fields=Object.keys(fieldNames);
export const compoundChannel=(kind:string)=>kind==='inside'||kind==='outside'||kind==='entering'||kind==='exiting';
const choiceKey=(source:CompoundSource)=>source.kind==='price'?'price:'+source.field:JSON.stringify(['sma',source.snapshotId,source.inputs.length,source.inputs.source]);
const supported=(source:CompoundSource)=>source.kind==='price'?fields.includes(source.field):source.indicator==='sma'&&source.plot==='sma'&&Object.keys(source.inputs).length===2&&Number.isSafeInteger(source.inputs.length)&&(source.inputs.length as number)>=1&&(source.inputs.length as number)<=10000&&typeof source.inputs.source==='string'&&fields.includes(source.inputs.source);

/** Friendly local draft labels only; original-revision notification/vector
 * presentation remains exclusively compound-alert-presentation.ts. */
function savedLabel(source:CompoundSource):string{return source.kind==='price'?fieldNames[source.field]:`SMA (${source.inputs.length}, ${fieldNames[String(source.inputs.source)]}) · saved inputs`;}
export function compoundDialogChoices(catalog:readonly AlertSourceChoice[],saved?:CompoundDefinition):readonly CompoundDialogChoice[]{
 const choices=new Map<string,CompoundDialogChoice>();
 for(const row of catalog){
  const s=row.source;if(!s||row.disabledReason||row.targetOnly)continue;
  let declaration:CompoundSource|null=null;
  if(s.kind==='price'&&(s.transformId===undefined||s.transformId==='standard')&&fields.includes(s.field))declaration=Object.freeze({kind:'price',field:s.field});
  if(s.kind==='indicator'&&s.indicator==='sma'&&s.plotId==='sma'&&s.transformId==='standard'&&s.inputBasis==='standard-ohlc'&&!s.calculation){
   // The canonical catalog includes three separate smoothing-plot settings.
   // Validate those known fields; primary `sma` itself uses only length/source
   // (domain/indicators case 'sma'). Never project arbitrary extra settings.
   const keys=Reflect.ownKeys(s.inputs),known=['length','source','smoothingType','smoothingLength','smoothingMultiplier'];
   const smoothingCount=keys.filter(key=>typeof key==='string'&&key.startsWith('smoothing')).length;
   if(keys.every(key=>{const field=Object.getOwnPropertyDescriptor(s.inputs,key);return typeof key==='string'&&known.includes(key)&&!!field?.enumerable&&Object.hasOwn(field,'value');})&&(smoothingCount===0||smoothingCount===3))try{
    indicatorSmoothingSettings(s.inputs);
    const proposed:CompoundSource={kind:'indicator',indicator:'sma',plot:'sma',snapshotId:s.snapshotId,inputs:Object.freeze({length:s.inputs.length,source:s.inputs.source})};if(supported(proposed))declaration=Object.freeze(proposed);
   }catch{/* Invalid smoothing metadata does not yield a supported choice. */}
  }
  if(declaration){const id=choiceKey(declaration),prior=choices.get(id);if(!prior)choices.set(id,Object.freeze({id,catalogId:row.id,catalogIds:Object.freeze([row.id]),label:row.label,declaration}));else choices.set(id,Object.freeze({...prior,catalogIds:Object.freeze([...(prior.catalogIds??[]),row.id])}));}
 }
 for(const row of saved?.predicates??[]){if(!supported(row.source))throw Error('This saved condition is not supported by the current compound editor.');const id=choiceKey(row.source);if(!choices.has(id))choices.set(id,Object.freeze({id,label:savedLabel(row.source),declaration:row.source}));}
 return Object.freeze([...choices.values()]);
}
export function compoundSeedCondition(draft:AlertDraft,selectedSourceId:string|undefined,choices:readonly CompoundDialogChoice[]):CompoundConditionDraft{
 const choice=choices.find(row=>row.catalogId===selectedSourceId||selectedSourceId!==undefined&&row.catalogIds?.includes(selectedSourceId));
 if(!choice||!COMPOUND_DIALOG_OPERATORS.some(([kind])=>kind===draft.kind))throw Error('Choose a supported raw price or frozen SMA source and scalar condition before adding another condition.');
 return Object.freeze({id:crypto.randomUUID(),sourceId:choice.id,kind:draft.kind as CompoundConditionDraft['kind'],value:draft.value,lower:draft.lower,upper:draft.upper});
}
export function compoundDefinitionDrafts(definition:CompoundDefinition,choices:readonly CompoundDialogChoice[]):readonly CompoundConditionDraft[]{
 return Object.freeze(definition.predicates.map(row=>{
  const sourceId=choiceKey(row.source);if(!choices.some(choice=>choice.id===sourceId))throw Error('The original frozen condition source is unavailable.');
  return Object.freeze({id:row.id,sourceId,kind:row.operator.kind,value:'value' in row.operator?String(row.operator.value):'',lower:'lower' in row.operator?String(row.operator.lower):'',upper:'upper' in row.operator?String(row.operator.upper):''});
 }));
}
export function sameCompoundDialogContext(a:CompoundContext,b:CompoundContext):boolean{return a.instrumentId===b.instrumentId&&a.sourceFamily===b.sourceFamily&&a.interval===b.interval&&a.session===b.session&&a.basis===b.basis;}
/** Local Add-dialog completeness only. Full canonical form compilation still
 * happens on Save through the unchanged compound-alert-form builder. */
export function validateCompoundAddedCondition(row:CompoundConditionDraft,choices:readonly CompoundDialogChoice[]):void{
 if(choices.filter(choice=>choice.id===row.sourceId&&!choice.unavailableReason).length!==1||!COMPOUND_DIALOG_OPERATORS.some(([kind])=>kind===row.kind))throw Error('Choose an available source and condition.');
 const numeric=(text:string)=>text.length<=64&&/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text.trim())&&Number.isFinite(Number(text));
 if(compoundChannel(row.kind)){if(!numeric(row.lower)||!numeric(row.upper)||Number(row.lower)>Number(row.upper))throw Error('Enter finite channel bounds with the lower bound no greater than the upper bound.');}
 else if(!numeric(row.value))throw Error('Enter a finite condition value.');
}
