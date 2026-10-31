import {parseCompoundDefinition,type CompoundDefinition,type CompoundNotification,type CompoundOperator,type CompoundSource} from '../domain/compound-alerts';

/** Original frozen revision only. This is a display model, never a scalar
 * AlertDeliveryItem, source observation, or permission to export history. */
export interface CompoundNotificationView {
 readonly id:string;readonly title:string;readonly message:string;readonly at:number;
 readonly conditions:readonly Readonly<{label:string;value:string}>[];
 readonly desktopBody:string;
}
const fields:Readonly<Record<string,string>>=Object.freeze({open:'Open',high:'High',low:'Low',close:'Close',hl2:'High/Low average',hlc3:'Typical price',ohlc4:'OHLC average'});
const scalarNames:Readonly<Record<string,string>>=Object.freeze({greater:'Greater than',less:'Less than',crossing:'Crossing','crossing-up':'Crossing up','crossing-down':'Crossing down'});
const channelNames:Readonly<Record<string,string>>=Object.freeze({inside:'Inside channel',outside:'Outside channel',entering:'Entering channel',exiting:'Exiting channel'});
function sourceLabel(source:CompoundSource):string {
 if(source.kind==='price')return fields[source.field];
 if(source.indicator!=='sma'||source.plot!=='sma'||!Number.isSafeInteger(source.inputs.length)||(source.inputs.length as number)<1||(source.inputs.length as number)>10000||typeof source.inputs.source!=='string'||!Object.hasOwn(fields,source.inputs.source)||Object.keys(source.inputs).length!==2)throw Error('The saved indicator description is unavailable.');
 return 'SMA ('+source.inputs.length+', '+fields[source.inputs.source]+')';
}
function operatorLabel(operator:CompoundOperator):string {
 return 'value' in operator?scalarNames[operator.kind]+' '+String(operator.value):channelNames[operator.kind]+' '+String(operator.lower)+' to '+String(operator.upper);
}
export function compoundConditionLabels(input:CompoundDefinition):readonly string[] {
 const definition=parseCompoundDefinition(input);
 return Object.freeze(definition.predicates.map(row=>sourceLabel(row.source)+': '+operatorLabel(row.operator)));
}
/** Call only for a newly acknowledged journal item, with THAT item's original
 * declaration. Restored history can use this for display without redelivery. */
export function compoundNotificationView(binding:Readonly<{revision:number;declaration:CompoundDefinition}>,notification:CompoundNotification):CompoundNotificationView {
 const definition=parseCompoundDefinition(binding.declaration);
 if(!Number.isSafeInteger(binding.revision)||binding.revision<1||notification.revision!==binding.revision||notification.alertId!==definition.id||notification.local!==true||!Number.isSafeInteger(notification.at)||notification.at<0||typeof notification.id!=='string'||notification.id.length<1||notification.id.length>4096)throw Error('This notification does not match its saved alert revision.');
 if(!Array.isArray(notification.values)||Object.getPrototypeOf(notification.values)!==Array.prototype||notification.values.length!==definition.predicates.length||Reflect.ownKeys(notification.values).length!==definition.predicates.length+1)throw Error('The saved condition values are unavailable.');
 const values:number[]=[];
 for(let index=0;index<definition.predicates.length;index++){
  const field=Object.getOwnPropertyDescriptor(notification.values,String(index));
  if(!field||!field.enumerable||!Object.hasOwn(field,'value')||typeof field.value!=='number'||!Number.isFinite(field.value))throw Error('The saved condition values are unavailable.');
  values.push(field.value);
 }
 const labels=compoundConditionLabels(definition),conditions=Object.freeze(labels.map((label,index)=>Object.freeze({label,value:String(values[index])})));
 const title='Alert: '+definition.name,message=definition.message;
 return Object.freeze({id:notification.id,title,message,at:notification.at,conditions,desktopBody:[message,...conditions.map(row=>row.label+' = '+row.value)].filter(Boolean).join('\n')});
}
