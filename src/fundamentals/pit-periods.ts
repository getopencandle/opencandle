import {dateDay,queryFacts,type CompanyFacts,type FactConcept,type FactRow} from './company-facts';
import {addDays} from './statements';
import type {PitMethod,PitRevisions,PitVersion} from './pit-types';
/** Periods, vintages, standalone quarters and TTM for point-in-time values.
 * Periods come from each fact's start and end dates only, never from the issuer's fiscal year or period labels.
 * A quarter is 60 to 120 days and a year 300 to 400 days. */
export const span=(start:string,end:string)=>dateDay(end)-dateDay(start)+1;
export const isQuarter=(days:number|null)=>days!==null&&days>=60&&days<=120;
export const isYear=(days:number|null)=>days!==null&&days>=300&&days<=400;
const shortTag=(tag:string)=>tag.slice(tag.indexOf(':')+1);
/** One filing date's value for a period. value is null when filings on that day disagree. at is when it became public. */
export interface Vintage {filed:string;value:number|null;reason:string|null;accession:string|null;form:string|null;at:number}
/** Every vintage of one tag, unit and (start, end), oldest filing first. */
export interface PeriodFact {tag:string;unit:string;start:string|null;end:string;days:number|null;vintages:Vintage[]}
const byAccession=(a:{accession:string|null},b:{accession:string|null})=>(a.accession??'￿').localeCompare(b.accession??'￿');
/** Facts grouped by period with their vintages (company-facts.queryFacts, every revision, no cutoff). Facts without a
 * filed date cannot be placed in time and are left out. */
export class FactStore {
 private concepts:Map<string,FactConcept>;private cache=new Map<string,PeriodFact[]>();private ends:Map<string,Set<string>>|null=null;private starts:Map<string,Set<string>>|null=null;private yearEnds:Set<string>|null=null;
 constructor(readonly facts:CompanyFacts,private availability:(accession:string|null,filed:string)=>number){this.concepts=new Map(facts.concepts.map(c=>[c.id,c]));}
 has(tag:string):boolean{return this.concepts.has(tag);}
 units(tag:string):readonly string[]{return this.concepts.get(tag)?.units??[];}
 /** positiveOnly drops values <= 0 before grouping (share counts). */
 periods(tag:string,unit:string,positiveOnly=false):PeriodFact[]{
  const key=tag+'\u0000'+unit+(positiveOnly?'+':''),hit=this.cache.get(key);if(hit)return hit;
  const concept=this.concepts.get(tag),out:PeriodFact[]=[];
  if(concept&&concept.units.includes(unit)){
   const groups=new Map<string,FactRow[]>();
   for(const row of queryFacts(concept,{unit,period:'all',asOf:null,revisions:'all'}).rows){
    if(row.filed===null||positiveOnly&&!(row.value>0))continue;
    const k=(row.start??'')+'|'+row.end,g=groups.get(k)??[];g.push(row);groups.set(k,g);
   }
   for(const rows of groups.values()){
    const byFiled=new Map<string,FactRow[]>();for(const row of rows){const g=byFiled.get(row.filed!)??[];g.push(row);byFiled.set(row.filed!,g);}
    const vintages:Vintage[]=[...byFiled].sort((a,b)=>a[0].localeCompare(b[0])).map(([filed,same])=>{
     const values=[...new Set(same.map(r=>r.value))],timed=same.map(r=>({r,at:this.availability(r.accession,filed)})).sort((a,b)=>a.at-b.at||byAccession(a.r,b.r)),first=timed[0];
     return values.length>1?{filed,value:null,reason:'Conflicting values ('+values.join(', ')+') were filed on '+filed+'. OpenCandle does not pick one.',accession:first.r.accession,form:first.r.form,at:first.at}:{filed,value:values[0],reason:null,accession:first.r.accession,form:first.r.form,at:first.at};
    });
    const {start,end}=rows[0];out.push({tag,unit,start,end,days:start===null?null:span(start,end),vintages});
   }
  }
  out.sort((a,b)=>a.end.localeCompare(b.end)||(a.start??'').localeCompare(b.start??''));
  this.cache.set(key,out);return out;
 }
 private boundaryIndex(){
  if(this.ends&&this.starts)return {ends:this.ends,starts:this.starts};
  const ends=new Map<string,Set<string>>(),starts=new Map<string,Set<string>>(),add=(m:Map<string,Set<string>>,k:string,a:string)=>{let s=m.get(k);if(!s){s=new Set();m.set(k,s);}s.add(a);};
  for(const c of this.facts.concepts)for(const row of c.observations)if(row.accession&&row.start!==null){add(ends,row.end,row.accession);add(starts,row.start,row.accession);}
  this.ends=ends;this.starts=starts;return {ends,starts};
 }
 /** True when one filing reports both a period ending on `end` and one starting on `start`: the issuer's own periods
  * show that boundary, so a few days' gap or overlap between quarters is the issuer's calendar, not missing data. */
 showsBoundary(end:string,start:string):boolean{
  const {ends,starts}=this.boundaryIndex(),a=ends.get(end),b=starts.get(start);if(!a||!b)return false;
  for(const acc of a)if(b.has(acc))return true;return false;
 }
 /** Every annual-length period end reported under any concept (the issuer's fiscal year ends). */
 fiscalYearEnds():Set<string>{
  if(this.yearEnds)return this.yearEnds;const out=new Set<string>();
  for(const c of this.facts.concepts)for(const row of c.observations)if(row.start!==null&&isYear(span(row.start,row.end)))out.add(row.end);
  return this.yearEnds=out;
 }
 latestFiled():string|null{let max:string|null=null;for(const c of this.facts.concepts)for(const row of c.observations)if(row.filed&&(!max||row.filed>max))max=row.filed;return max;}
}
/** A statement line: ordered tag preferences, unit kind and whether it is a flow (duration) or an instant. */
export interface PitLine {id:string;label:string;concept:string;tags:readonly string[];measure:'money'|'per-share'|'count';kind:'flow'|'instant';positiveOnly?:boolean}
export type PitKind='quarter'|'ttm'|'annual'|'instant';
/** A value for one period: its versions in time order (each later one supersedes), all from one tag. */
export interface Struct {start:string|null;end:string;tag:string|null;versions:PitVersion[]}
interface Missing {missing:string}
interface Cand {start:string;end:string;method:'reported'|'ytd-diff'|'fy-less-9m';rank:number;inputs:PeriodFact[];signs:number[]}
/** Combine versioned inputs. At each instant one of them changes (once all exist), the result is recomputed from each
 * input's newest version so far; provenance is the input that became public last. A null input passes its reason on. */
export function combine(inputs:readonly (readonly PitVersion[])[],make:(versions:PitVersion[])=>{value:number|null;reason?:string|null},meta:{start:string|null;end:string;tag:string|null;method:PitMethod;note?:string|null}):PitVersion[]{
 const times=[...new Set(inputs.flatMap(list=>list.map(v=>v.at)))].sort((a,b)=>a-b),out:PitVersion[]=[];
 for(const t of times){
  const chosen:PitVersion[]=[];
  for(const list of inputs){let pick:PitVersion|null=null;for(const v of list)if(v.at<=t)pick=v;if(!pick)break;chosen.push(pick);}
  if(chosen.length!==inputs.length)continue;
  let driver=chosen[0];for(const v of chosen)if(v.at>=driver.at)driver=v;
  const broken=chosen.find(v=>v.value===null);
  let value:number|null,reason:string|null=null,conflict=false;
  if(broken){value=null;reason=broken.reason;conflict=!!broken.conflict;}
  else {const r=make(chosen);value=r.value;reason=r.reason??null;if(value!==null&&!Number.isFinite(value)){value=null;reason='The result is not a finite number.';}}
  out.push({at:t,value,reason,start:meta.start,end:meta.end,filed:driver.filed,accession:driver.accession,form:driver.form,tag:meta.tag,method:meta.method,note:meta.note??chosen.find(v=>v.note)?.note??null,...(conflict?{conflict:true}:{})});
 }
 return out;
}
const gapVersion=(from:readonly PitVersion[],end:string,reason:string,method:PitMethod):PitVersion[]=>{
 let driver=from[0];for(const v of from)if(v.at>=driver.at)driver=v;
 return [{at:driver.at,value:null,reason,start:null,end,filed:driver.filed,accession:driver.accession,form:driver.form,tag:null,method,note:null}];
};
export const NOT_MEANINGFUL='The prior-year value is zero or negative, so growth is not meaningful.';
const FOURTEEN_WEEKS='14-week quarter';
/** Line values under one revision policy, on the latest split basis (basis(filed) is the split product after a filing). */
export class LineEngine {
 private quarterIndexCache=new Map<string,Map<string,Cand[]>>();private memo=new Map<string,Struct|Missing|null>();
 constructor(private store:FactStore,private revisions:PitRevisions,private currency:string,private basis:(filed:string)=>number){}
 unitOf(line:PitLine):string{return line.measure==='money'?this.currency:line.measure==='per-share'?this.currency+'/shares':'shares';}
 tagged(line:PitLine):boolean{return line.tags.some(tag=>this.store.periods(tag,this.unitOf(line),line.positiveOnly).length>0);}
 private facts(line:PitLine,tag:string){return this.store.periods(tag,this.unitOf(line),line.positiveOnly);}
 /** The vintage a revision policy uses. Latest filed takes the newest value but keeps the first vintage's
  * availability (the bands and lines it draws therefore use later information). */
 version(fact:PeriodFact,line:PitLine):PitVersion{
  const first=fact.vintages[0],chosen=this.revisions==='first'?first:fact.vintages[fact.vintages.length-1];
  let value=chosen.value;
  if(value!==null&&line.measure!=='money'){const k=this.basis(chosen.filed);value=line.measure==='per-share'?value/k:value*k;}
  return {at:first.at,value,reason:chosen.reason,start:fact.start,end:fact.end,filed:chosen.filed,accession:chosen.accession,form:chosen.form,tag:fact.tag,method:'reported',note:null,...(chosen.value===null?{conflict:true}:{})};
 }
 /** Standalone quarter candidates of one tag, by end date, best rule first:
  * 1 a reported 60-120 day fact; 2 YTD(s, e_k) - YTD(s, e_k-1) (not for per-share lines); 3 FY - 9-month YTD. */
 private quarterIndex(line:PitLine,tag:string):Map<string,Cand[]>{
  const key=line.id+'|'+tag,hit=this.quarterIndexCache.get(key);if(hit)return hit;
  const map=new Map<string,Cand[]>(),add=(c:Cand)=>{const list=map.get(c.end)??[];list.push(c);map.set(c.end,list);};
  const durations=this.facts(line,tag).filter(f=>f.start!==null),byStart=new Map<string,PeriodFact[]>();
  for(const f of durations){if(isQuarter(f.days))add({start:f.start!,end:f.end,method:'reported',rank:0,inputs:[f],signs:[1]});const g=byStart.get(f.start!)??[];g.push(f);byStart.set(f.start!,g);}
  for(const group of byStart.values()){
   group.sort((a,b)=>a.end.localeCompare(b.end));
   for(let j=0;j<group.length;j++){
    const b=group[j];if(isQuarter(b.days))continue;
    for(let i=0;i<j;i++){
     const a=group[i];if(a.end>=b.end)continue;const start=addDays(a.end,1);if(!isQuarter(span(start,b.end)))continue;
     if(isYear(b.days))add({start,end:b.end,method:'fy-less-9m',rank:2,inputs:[b,a],signs:[1,-1]});
     else if(b.days!>120&&b.days!<300&&line.measure!=='per-share')add({start,end:b.end,method:'ytd-diff',rank:1,inputs:[b,a],signs:[1,-1]});
    }
   }
  }
  for(const list of map.values())list.sort((a,b)=>a.rank-b.rank||b.start.localeCompare(a.start));
  this.quarterIndexCache.set(key,map);return map;
 }
 /** One standalone quarter of one tag. The best rule wins; a lower rule that became public earlier is kept as an
  * earlier version, so a reported Q4 replaces a derived one only from its own filing on. */
 private quarter(line:PitLine,tag:string,end:string):Struct|null{
  const cands=this.quarterIndex(line,tag).get(end);if(!cands)return null;
  const start=cands[0].start,versions:PitVersion[]=[];
  for(const c of cands){
   if(c.start!==start)continue;
   const days=span(start,end),note=days>=96&&days<=104?FOURTEEN_WEEKS:null;
   const v=combine(c.inputs.map(f=>[this.version(f,line)]),vs=>({value:vs.reduce((s,x,i)=>s+c.signs[i]*x.value!,0)}),{start,end,tag,method:c.method,note})[0];
   if(!versions.length||v.at<Math.min(...versions.map(x=>x.at)))versions.push(v);
  }
  return {start,end,tag,versions:versions.sort((a,b)=>a.at-b.at)};
 }
 private quarterNear(line:PitLine,tag:string,end:string,laterStart:string):Struct|null{
  const exact=this.quarter(line,tag,end);if(exact)return exact;
  for(const d of [-1,1,-2,2,-3,3]){const e=addDays(end,d),q=this.quarter(line,tag,e);if(q&&this.store.showsBoundary(e,laterStart))return q;}
  return null;
 }
 /** TTM of one tag: four contiguous standalone quarters spanning 300-400 days, summed after split conversion. */
 private ttm(line:PitLine,tag:string,end:string):Struct|Missing|null{
  const last=this.quarter(line,tag,end);if(!last)return null;
  const chain=[last];
  for(let i=1;i<4;i++){const prevEnd=addDays(chain[0].start!,-1),q:Struct|null=this.quarterNear(line,tag,prevEnd,chain[0].start!);if(!q)return {missing:prevEnd};chain.unshift(q);}
  const days=span(chain[0].start!,end);
  if(!isYear(days))return {start:chain[0].start,end,tag,versions:gapVersion(chain.flatMap(q=>q.versions),end,'The four quarters ending '+end+' span '+days+' days, not a year.','sum-4q')};
  const note=chain.some(q=>q.versions.some(v=>v.note===FOURTEEN_WEEKS))?'Includes a 14-week quarter':null;
  return {start:chain[0].start,end,tag,versions:combine(chain.map(q=>q.versions),vs=>({value:vs.reduce((s,v)=>s+v.value!,0)}),{start:chain[0].start,end,tag,method:'sum-4q',note})};
 }
 private annual(line:PitLine,tag:string,end:string):Struct|null{
  const found=this.facts(line,tag).filter(f=>f.end===end&&isYear(f.days));if(!found.length)return null;
  if(new Set(found.map(f=>f.start)).size>1)return {start:null,end,tag,versions:gapVersion(found.map(f=>this.version(f,line)),end,'Several annual periods end on '+end+' ('+found.map(f=>f.start).join(', ')+'). OpenCandle does not choose one.','reported')};
  return {start:found[0].start,end,tag,versions:[this.version(found[0],line)]};
 }
 private instant(line:PitLine,tag:string,end:string):Struct|null{
  const found=this.facts(line,tag).find(f=>f.start===null&&f.end===end);return found?{start:null,end,tag,versions:[this.version(found,line)]}:null;
 }
 /** The instant of a line first reported in one filing (cover-page counts filed with a balance sheet). */
 instantFromFiling(line:PitLine,accession:string|null):Struct|null{
  if(!accession)return null;
  for(const tag of line.tags){const f=this.facts(line,tag).find(x=>x.start===null&&x.vintages[0].accession===accession);if(f)return {start:null,end:f.end,tag,versions:[this.version(f,line)]};}
  return null;
 }
 /** One tag, one period. TTM may report which quarter is missing. */
 attempt(line:PitLine,kind:PitKind,tag:string,end:string):Struct|Missing|null{
  const key=line.id+'|'+kind+'|'+tag+'|'+end;if(this.memo.has(key))return this.memo.get(key)!;
  const r=kind==='quarter'?this.quarter(line,tag,end):kind==='ttm'?this.ttm(line,tag,end):kind==='annual'?this.annual(line,tag,end):this.instant(line,tag,end);
  this.memo.set(key,r);return r;
 }
 /** Period ends that can carry a value of this kind, oldest first. */
 ends(line:PitLine,kind:PitKind):string[]{
  const out=new Set<string>();
  for(const tag of line.tags){
   if(kind==='quarter'||kind==='ttm')for(const e of this.quarterIndex(line,tag).keys())out.add(e);
   else for(const f of this.facts(line,tag))if(kind==='annual'?isYear(f.days):f.start===null)out.add(f.end);
  }
  return [...out].sort();
 }
 /** The value at a period end: the first tag in preference order that covers every input. For TTM, when no single
  * tag covers four quarters, the result is a gap naming the missing quarter or the tag change. */
 at(line:PitLine,kind:PitKind,end:string):Struct|null{
  for(const tag of line.tags){const r=this.attempt(line,kind,tag,end);if(r&&'versions' in r)return r;}
  if(kind!=='ttm')return null;
  const slots:{tag:string;q:Struct}[]=[];let cursor=end,laterStart:string|null=null;
  for(let i=0;i<4;i++){
   let found:{tag:string;q:Struct}|null=null;
   for(const tag of line.tags){const q:Struct|null=laterStart===null?this.quarter(line,tag,cursor):this.quarterNear(line,tag,cursor,laterStart);if(q){found={tag,q};break;}}
   if(!found)break;slots.unshift(found);laterStart=found.q.start!;cursor=addDays(laterStart,-1);
  }
  if(!slots.length)return null;
  const from=slots.flatMap(s=>s.q.versions);
  if(slots.length<4)return {start:null,end,tag:null,versions:gapVersion(from,end,'TTM needs four quarters in a row; the quarter ending '+cursor+' is not reported.','sum-4q')};
  const old=slots[0].tag,changed=slots.find(s=>s.tag!==old)?.tag??old;
  return {start:slots[0].q.start,end,tag:null,versions:gapVersion(from,end,line.label+' changed tags inside this period ('+shortTag(old)+' to '+shortTag(changed)+'). OpenCandle does not mix tags.','sum-4q')};
 }
 /** The comparable prior period: ends 358-372 days earlier and, for durations, has the same length within 7 days. */
 priorEnd(line:PitLine,kind:PitKind,end:string):string|null{
  const cur=this.at(line,kind,end);if(!cur)return null;
  const length=cur.start?span(cur.start,end):null,day=dateDay(end);
  const candidates=this.ends(line,kind).filter(e=>{const d=day-dateDay(e);return d>=358&&d<=372;}).sort((a,b)=>Math.abs(day-dateDay(a)-365)-Math.abs(day-dateDay(b)-365)||b.localeCompare(a));
  for(const e of candidates){const s=this.at(line,kind,e);if(!s)continue;if(length!==null&&(!s.start||Math.abs(span(s.start,e)-length)>7))continue;return e;}
  return null;
 }
 /** The period and its prior from one tag (one tag per value), or why not. */
 pair(line:PitLine,kind:PitKind,end:string,prior:string):[Struct,Struct]|{reason:string;from:PitVersion[]}{
  let curTag:string|null=null,priorTag:string|null=null;const from:PitVersion[]=[];
  for(const tag of line.tags){
   const c=this.attempt(line,kind,tag,end),p=this.attempt(line,kind,tag,prior),cs=c&&'versions' in c?c:null,ps=p&&'versions' in p?p:null;
   if(cs&&ps)return [cs,ps];
   if(cs){curTag??=tag;from.push(...cs.versions);}if(ps)priorTag??=tag;
  }
  if(curTag&&priorTag)return {reason:line.label+' changed tags inside this period ('+shortTag(priorTag)+' to '+shortTag(curTag)+'). OpenCandle does not mix tags.',from};
  const cur=this.at(line,kind,end);
  return {reason:cur&&cur.versions.every(v=>v.value===null)?cur.versions[0].reason!:line.label+' is not reported for the period ending '+(curTag?prior:end)+'.',from:from.length?from:cur?.versions??[]};
 }
}
export const NO_PRIOR='No comparable period a year earlier is reported.';
/** A value computed from several lines at the same period end. A missing line is a gap naming it. */
export function derivedAt(engine:LineEngine,lines:readonly PitLine[],kind:PitKind,end:string,label:string,fn:(values:number[])=>{value:number|null;reason?:string|null}):Struct|null{
 const structs=lines.map(l=>engine.at(l,kind,end));if(structs.every(s=>s===null))return null;
 const missing=structs.findIndex(s=>s===null);
 if(missing>=0)return {start:null,end,tag:null,versions:gapVersion(structs.flatMap(s=>s?.versions??[]),end,label+' needs '+lines[missing].concept+' for the period ending '+end+'.','computed')};
 const first=structs[0]!;
 if(lines.length===1)return first;
 return {start:first.start,end,tag:null,versions:combine(structs.map(s=>s!.versions),vs=>fn(vs.map(v=>v.value!)),{start:first.start,end,tag:null,method:'computed'})};
}
/** Year-over-year change % of a (possibly derived) value: (v(p) - v(p')) / v(p') * 100, every line from one tag. */
export function derivedYoy(engine:LineEngine,lines:readonly PitLine[],kind:PitKind,end:string,label:string,fn:(values:number[])=>{value:number|null;reason?:string|null}):Struct|null{
 const current=derivedAt(engine,lines,kind,end,label,fn);if(!current)return null;
 const prior=engine.priorEnd(lines[0],kind,end);
 if(!prior)return {start:current.start,end,tag:null,versions:gapVersion(current.versions,end,current.versions.every(v=>v.value===null)?current.versions[0].reason!:NO_PRIOR,'computed')};
 const pairs=lines.map(l=>engine.pair(l,kind,end,prior));
 const failed=pairs.find((p):p is {reason:string;from:PitVersion[]}=>!Array.isArray(p));
 if(failed)return {start:current.start,end,tag:null,versions:gapVersion(failed.from.length?failed.from:current.versions,end,failed.reason,'computed')};
 const ok=pairs as [Struct,Struct][],at=(i:0|1)=>lines.length===1?ok[0][i].versions:combine(ok.map(p=>p[i].versions),vs=>fn(vs.map(v=>v.value!)),{start:ok[0][i].start,end:ok[0][i].end,tag:null,method:'computed'});
 const tag=lines.length===1?ok[0][0].tag:null;
 return {start:ok[0][0].start,end,tag,versions:combine([at(0),at(1)],([c,p])=>p.value!<=0?{value:null,reason:NOT_MEANINGFUL}:{value:(c.value!-p.value!)/p.value!*100},{start:ok[0][0].start,end,tag,method:'computed'})};
}
