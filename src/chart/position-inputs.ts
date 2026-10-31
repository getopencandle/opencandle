// Long and Short position inputs (props.lvPositionInputs): lot size, leverage, risk display mode, quantity precision, compact stats, account currency,
// and (schema 2) always show stats and price labels.
//
// Short reuses the Long values; those values are stored as copies.
//
// Lot size now divides the displayed quantity (quantity in lots = risk amount / (stop distance x lot size)); that reading of
// the "Lot size" input is our own choice (QUANTITY_FORMULA_BASIS has no reference formula). Leverage is stored and shown only.
// Account currency is a display label only; there is no conversion (no FX data source is available).
//
// Saved positions are never changed: an absent member reads as legacy (no extra lines), a schema 1 member stays schema 1 until it is edited,
// and defaults are written only into a new position (seedNewPosition, or the factory seed in src/chart/lv-types/position-tool.ts).
import type {SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';
import {isPositionDrawing} from '../domain/position-drawing';

export const POSITION_INPUTS_FIELD='lvPositionInputs';
export const POSITION_INPUTS_DIAGNOSTIC='Saved position input settings are unreadable and kept as is.';
export type RiskDisplayMode='percentage'|'money';
export interface PositionInputsSettings {
 readonly schemaVersion:1|2;
 readonly lotSize:number;
 readonly leverage:number;
 readonly riskMode:RiskDisplayMode;
 readonly precision:number;
 readonly compactStats:boolean;
 readonly currency:string;
 /** Schema 2 only. A schema 1 member reads as the factory values (false and true). */
 readonly alwaysShowStats?:boolean;
 readonly priceLabels?:boolean;
}
/** Every key with a value, schema 1 members filled from the factory values. */
export type EffectivePositionInputs=Readonly<Required<Omit<PositionInputsSettings,'schemaVersion'>>>&{readonly schemaVersion:1|2};
export const POSITION_PRECISION_MAX=8;
/** lotSize 1, alwaysShowStats false and priceLabels true (showPriceLabels): facts. leverage 10000: fact constant, meaning and units unverified.
 * riskMode percentage: fact, inferred. precision 2 and currency USD: (fact: precision "computed, not decodable"; no currency fact).
 * compactStats false: (fact lists the control, no default). */
export const POSITION_INPUTS_FACTORY_DEFAULTS:Readonly<Required<PositionInputsSettings>>=Object.freeze({schemaVersion:2,lotSize:1,leverage:10000,riskMode:'percentage',precision:2,compactStats:false,currency:'USD',alwaysShowStats:false,priceLabels:true});
export const POSITION_INPUTS_PROVENANCE:Readonly<Record<string,{readonly label:'fact'|'LV-DEFINED';readonly note:string}>>=Object.freeze({
 lotSize:Object.freeze({label:'fact' as const,note:'Recorded Long default, lot size 1.'}),
 lotSizeShort:Object.freeze({label:'LV-DEFINED' as const,note:'Short copies the Long value; the Short defaults fact is inferred, so this is an OpenCandle choice.'}),
 leverage:Object.freeze({label:'LV-DEFINED' as const,note:'Decoded constant from the Long defaults fact, stored as 10000 with meaning and units unverified, so it is not asserted as a reference default.'}),
 riskMode:Object.freeze({label:'LV-DEFINED' as const,note:'Percentage is inferred in the fact file, so it is an OpenCandle choice until the owner reads the Long position Inputs tab.'}),
 precision:Object.freeze({label:'LV-DEFINED' as const,note:'The reference precision is computed and not decodable; two decimals is an OpenCandle choice.'}),
 compactStats:Object.freeze({label:'LV-DEFINED' as const,note:'The control exists in the reference list; its default is not recorded, so off is an OpenCandle choice.'}),
 currency:Object.freeze({label:'LV-DEFINED' as const,note:'A display label only, with no conversion. The reference default is not recorded.'}),
 alwaysShowStats:Object.freeze({label:'fact' as const,note:'Recorded Long default, always show stats off.'}),
 priceLabels:Object.freeze({label:'fact' as const,note:'Recorded Long default, price labels on.'}),
 lotQuantity:Object.freeze({label:'LV-DEFINED' as const,note:'Quantity is shown in lots: the risk amount divided by the stop distance times the lot size. The reference formula is not recorded.'}),
});
/** Account currency choices: the option list of the backing study input account_currency.
 * The list is our own choice as a dialog choice. */
export const POSITION_CURRENCY_OPTIONS:readonly string[]=Object.freeze(['NONE','USD','EUR','AUD','GBP','NZD','CAD','CHF','HKD','JPY','NOK','RUB','SEK','SGD','TRY','ZAR','BTC','ETH','MYR','KRW','USDT','INR']);

const keysV1=['schemaVersion','lotSize','leverage','riskMode','precision','compactStats','currency'] as const;
const keysV2=[...keysV1,'alwaysShowStats','priceLabels'] as const;
export type PositionInputsState=
 | {state:'legacy';settings:Readonly<PositionInputsSettings>}
 | {state:'supported';settings:Readonly<PositionInputsSettings>}
 | {state:'unavailable';message:string};
function plain(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
/** Exactly the schema 1 keys (schemaVersion 1) or the schema 2 keys (schemaVersion 2), plain data, every value in range. */
export function validatePositionInputs(value:unknown):Readonly<PositionInputsSettings>{
 if(!plain(value))throw Error(POSITION_INPUTS_DIAGNOSTIC);
 const keys:readonly string[]=value.schemaVersion===2?keysV2:keysV1;
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error(POSITION_INPUTS_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error(POSITION_INPUTS_DIAGNOSTIC);out[key]=d.value;}
 const positive=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=1e12;
 if(![1,2].includes(out.schemaVersion as number)||!positive(out.lotSize)||!positive(out.leverage)||!['percentage','money'].includes(out.riskMode as string)||!Number.isInteger(out.precision)||(out.precision as number)<0||(out.precision as number)>POSITION_PRECISION_MAX||typeof out.compactStats!=='boolean'||typeof out.currency!=='string'||!/^[A-Za-z]{1,6}$/.test(out.currency))throw Error(POSITION_INPUTS_DIAGNOSTIC);
 if(out.schemaVersion===2&&(typeof out.alwaysShowStats!=='boolean'||typeof out.priceLabels!=='boolean'))throw Error(POSITION_INPUTS_DIAGNOSTIC);
 return Object.freeze(out) as unknown as Readonly<PositionInputsSettings>;
}
/** The settings with every key: a schema 1 member takes the factory always-show-stats and price-labels values. */
export function effectivePositionInputs(settings:Readonly<PositionInputsSettings>):EffectivePositionInputs{
 return Object.freeze({...settings,alwaysShowStats:settings.alwaysShowStats??POSITION_INPUTS_FACTORY_DEFAULTS.alwaysShowStats,priceLabels:settings.priceLabels??POSITION_INPUTS_FACTORY_DEFAULTS.priceLabels});
}
export function readPositionInputs(props:unknown):PositionInputsState{
 if(props===undefined)return{state:'legacy',settings:POSITION_INPUTS_FACTORY_DEFAULTS};
 if(!plain(props))return{state:'unavailable',message:POSITION_INPUTS_DIAGNOSTIC};
 const d=Object.getOwnPropertyDescriptor(props,POSITION_INPUTS_FIELD);
 if(!d)return{state:'legacy',settings:POSITION_INPUTS_FACTORY_DEFAULTS};
 if(!d.enumerable||!Object.hasOwn(d,'value'))return{state:'unavailable',message:POSITION_INPUTS_DIAGNOSTIC};
 try{return{state:'supported',settings:validatePositionInputs(d.value)};}catch{return{state:'unavailable',message:POSITION_INPUTS_DIAGNOSTIC};}
}
/** Whole-member patch. A semantic no-op returns the exact record. */
export function patchPositionInputs(record:SerializedDrawing,next:unknown):SerializedDrawing{
 const metrics=measureWorkspaceJSON({record});
 if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Position record exceeds its local data bound.');
 if(!isPositionDrawing(record.type))throw Error('Position inputs are available only for Long and Short position.');
 const current=readPositionInputs(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validatePositionInputs(next);
 if(keysV2.every(key=>current.settings[key]===settings[key]))return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),[POSITION_INPUTS_FIELD]:{...settings}};
 return result;
}
/** A position created after the update carries the defaults (Short as a copy of Long). A record with a member, or an unreadable one, is returned as is. */
export function seedNewPosition(record:SerializedDrawing):SerializedDrawing{
 if(!isPositionDrawing(record.type))return record;
 if(readPositionInputs(record.props).state!=='legacy')return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),[POSITION_INPUTS_FIELD]:{...POSITION_INPUTS_FACTORY_DEFAULTS}};
 return result;
}

/** Risk is stored as a percent of the account (riskPercent). In money mode the dialog shows and takes an amount in the account currency. */
export function riskDisplayValue(mode:RiskDisplayMode,riskPercent:number,accountSize:number):number{
 return mode==='money'?accountSize*riskPercent/100:riskPercent;
}
export function riskPercentFromDisplay(mode:RiskDisplayMode,value:number,accountSize:number):number{
 if(mode==='percentage')return value;
 return accountSize>0&&Number.isFinite(accountSize)?value/accountSize*100:NaN;
}
/** Precision rounds the displayed quantity only; no stored quantity or formula changes. */
export function formatPositionQuantity(quantity:number,precision:number):string{
 if(!Number.isFinite(quantity)||!Number.isInteger(precision)||precision<0||precision>POSITION_PRECISION_MAX)throw Error('Quantity precision is unavailable.');
 return quantity.toFixed(precision);
}
/** Text lines for the inputs on a position that has the member. Legacy and unreadable members add nothing. Compact mode is a single line. */
export function positionInputLines(state:PositionInputsState):string[]{
 if(state.state!=='supported')return[];
 const s=state.settings,leverage=String(s.leverage),lot=String(s.lotSize);
 if(s.compactStats)return[`${lot} lot, ${leverage}x, ${s.currency}`];
 return[`Lot size: ${lot}`,`Leverage: ${leverage}`,`Account currency: ${s.currency}`,`Risk shown as: ${s.riskMode==='money'?'amount':'percent'}`];
}
