/**
 * TPO "Extended" level alerts.
 * They use completed extended levels only, and a snapshot ignores a later profile merge or split.
 * Everything else below is our own choice:
 * - Only COMPLETED profiles count (every profile except the last, which is still forming).
 * - A level is "extended" while no bar after its profile has traded through its price (low <= price <= high).
 * - The extended levels of the chosen kind are captured once and frozen (a snapshot); later profile changes do not move them.
 * - Prices: POC = middle of the POC row, VAH / VAL = value-area edges, poor high / low = outer edge of the top / bottom row,
 *   single print = middle of each single-print row.
 * Crossing semantics are the Fib level-crossing ones (alert-levels.ts), since the result is the same frozen AlertLevelSet.
 */
import {tpoProfilesForSettings,TPO_LV_DEFAULTS,type TpoBar,type TpoProfile} from '../chart/tpo';
import {validateAlertLevels,ALERT_LEVEL_LIMIT,type AlertLevel,type AlertLevelSet} from './alert-levels';

export const TPO_ALERT_KINDS=['poc','vah','val','poorhigh','poorlow','singleprint'] as const;
export type TpoAlertKind=typeof TPO_ALERT_KINDS[number];
export const TPO_ALERT_LABELS:Readonly<Record<TpoAlertKind,string>>=Object.freeze({poc:'Extended POC',vah:'Extended VAH',val:'Extended VAL',poorhigh:'Extended poor high',poorlow:'Extended poor low',singleprint:'Extended single print'});
export const TPO_ALERT_POLICY='TPO extended level alert (OpenCandle policy pending reference comparison): the levels of completed profiles that no later bar has traded through are frozen when the alert is created; a crossing of any of them notifies.';

function pricesOf(profile:TpoProfile,kind:TpoAlertKind):number[]{
 const size=profile.rowSize,top=profile.rows.at(-1),bottom=profile.rows[0];
 switch(kind){
  case 'poc':return [profile.pocPrice];
  case 'vah':return [profile.vah];
  case 'val':return [profile.val];
  case 'poorhigh':return profile.poorHigh&&top?[top.high]:[];
  case 'poorlow':return profile.poorLow&&bottom?[bottom.low]:[];
  case 'singleprint':return profile.singlePrints.map(index=>(index+0.5)*size);
 }
}

/** Frozen extended levels of one kind from bars in Unix seconds (default TPO settings), or a refusal naming what is missing. */
export function captureTpoExtendedLevels(bars:readonly TpoBar[],kind:TpoAlertKind,tickSize:number|null,settings:Record<string,unknown>=TPO_LV_DEFAULTS):{ok:true;levels:AlertLevelSet}|{ok:false;diagnostics:string[]}{
 try{
  if(!TPO_ALERT_KINDS.includes(kind))throw new Error('Unknown TPO level kind.');
  const profiles=tpoProfilesForSettings(bars,settings,tickSize);
  if(profiles.length<2)throw new Error('TPO extended levels need at least one completed profile; the current profile is still forming.');
  const found=new Map<number,AlertLevel>();
  for(const profile of profiles.slice(0,-1)){
   for(const price of pricesOf(profile,kind)){
    if(!Number.isFinite(price))continue;
    let touched=false;for(let i=profile.lastIndex+1;i<bars.length&&!touched;i++)touched=bars[i].low<=price&&price<=bars[i].high;
    if(!touched&&!found.has(price))found.set(price,{ratio:0,price});
   }
  }
  if(!found.size)throw new Error('No completed profile has an extended '+TPO_ALERT_LABELS[kind].replace('Extended ','')+' level: every one has been traded through.');
  const levels=[...found.values()].sort((a,b)=>a.price-b.price);
  if(levels.length>ALERT_LEVEL_LIMIT)levels.splice(0,levels.length-ALERT_LEVEL_LIMIT);// LV bound: the highest-priced levels are kept
  const set:AlertLevelSet={schemaVersion:1,drawingId:'tpo:'+kind,tool:'tpo',levels};
  validateAlertLevels(set);
  return {ok:true,levels:set};
 }catch(error){return {ok:false,diagnostics:[error instanceof Error?error.message:String(error)]};}
}
