// Bars pattern stored payload (props.lvBarsPattern): types, the cols-v1 bar encoding and the strict reader.
//
// The copied bars are stored with the drawing, not re-read from the series.
// The member layout, encoding and limits are OpenCandle's own.
// Pure module: no chart, no DOM, no dataset access.

export const BARS_PATTERN_MEMBER='lvBarsPattern';
export const BARS_PATTERN_SCHEMA_VERSION=1;
/** Bars per pattern. Design decision (2026-10-16): 50,000, with a visible notice above it (spec flag A2). */
export const BARS_PATTERN_BAR_CAP=50_000;
const MAX_TEXT=4096;

/** One copied bar. Time is Unix seconds (domain Bar convention); volume is not part of a pattern. */
export interface PatternBar{readonly time:number;readonly open:number;readonly high:number;readonly low:number;readonly close:number}
export interface PatternColumns{readonly time:Float64Array;readonly open:Float64Array;readonly high:Float64Array;readonly low:Float64Array;readonly close:Float64Array;readonly count:number}

/** Where the bars came from. Identity fields are null while the pattern is not yet bound to a dataset (placement copies
 *  the chart's bars through the renderer projector, which carries no dataset identity; the first re-sample binds it). */
export interface BarsPatternSource{
 readonly instrumentId:string|null;
 readonly symbol:string|null;
 readonly fixture:boolean|null;
 readonly datasetKey:string|null;
 readonly revision:string|null;
 /** Set only when the user picked one of several matching source datasets. */
 readonly sourceKey:string|null;
 /** Content fingerprint of the dataset last used; absent in patterns saved before it existed. */
 readonly sourceFingerprint?:string|null;
 /** The saved source choice's own revision and content fingerprint, checked whenever the choice is used. */
 readonly choiceRevision?:string|null;
 readonly choiceFingerprint?:string|null;
 /** The span the stored choice fingerprint covers; absent means the source span. */
 readonly choiceSpanStart?:number|null;
 readonly choiceSpanEnd?:number|null;
 /** Current source resolution (null until bound). */
 readonly resolution:string|null;
 /** Resolution at placement (never changes once bound). */
 readonly placedResolution:string|null;
 /** Half-open source span in Unix seconds: [spanStart, spanEnd). */
 readonly spanStart:number;
 readonly spanEnd:number;
 /** Price of placement click 1. Vertical reference of the pattern. */
 readonly refPrice:number;
 /** True when the bars were aggregated by OpenCandle (intervals.ts aggregateInterval). */
 readonly derived:boolean;
 /** True when the last coarser bar was built only from source bars inside the span (design decision: trim to the span). */
 readonly trimmed:boolean;
}
export interface BarsPatternBars{readonly encoding:'cols-v1';readonly count:number;readonly data:string}
/** A stored bar series at one interval over the pattern's span ("Interval" setting). */
export interface BarsPatternSeries{readonly resolution:string;readonly bars:BarsPatternBars}
export interface BarsPatternMember{readonly schemaVersion:1;readonly source:BarsPatternSource;readonly bars:BarsPatternBars;
 /** The bars as copied at placement, kept once the shown bars are re-sampled (coarser intervals aggregate these). Absent: `bars` are the captured bars. */
 readonly captured?:BarsPatternSeries;
 /** Finer bars of the same span fetched from the chart's live source, stored so a restart needs no new fetch. */
 readonly fetched?:BarsPatternSeries}

export type BarsPatternRead=
 |{readonly state:'absent'}
 |{readonly state:'supported';readonly member:BarsPatternMember;readonly columns:PatternColumns}
 |{readonly state:'unavailable';readonly message:string};

const OPTIONAL_SOURCE_KEYS=['sourceFingerprint','choiceRevision','choiceFingerprint','choiceSpanStart','choiceSpanEnd'] as const;
const SOURCE_KEYS=['instrumentId','symbol','fixture','datasetKey','revision','sourceKey','resolution','placedResolution','spanStart','spanEnd','refPrice','derived','trimmed'] as const;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>{const own=Object.keys(value);return own.length===keys.length&&keys.every(key=>Object.hasOwn(value,key));};

/** Shortest round-trip decimal; keeps the sign of -0. */
const num=(value:number)=>Object.is(value,-0)?'-0':String(value);

/** cols-v1: five columns (time, open, high, low, close), ';' between columns, ',' within a column. */
export function encodeBars(bars:readonly PatternBar[]):BarsPatternBars{
 const columns=(['time','open','high','low','close'] as const).map(key=>bars.map(bar=>num(bar[key])).join(','));
 return{encoding:'cols-v1',count:bars.length,data:columns.join(';')};
}
function parseColumn(text:string,count:number):Float64Array|null{
 const parts=text.split(',');if(parts.length!==count)return null;
 const out=new Float64Array(count);
 for(let i=0;i<count;i++){const part=parts[i];if(!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(part))return null;const value=Number(part);if(!Number.isFinite(value))return null;out[i]=value;}
 return out;
}
let lastDecoded:{data:string;key:string;columns:PatternColumns}|null=null;
/** Decodes and validates the bar columns. Memoised on the last data string (a paint reads the same payload every frame). */
export function decodeBars(bars:BarsPatternBars,span?:{spanStart:number;spanEnd:number}):PatternColumns|string{
 const key=bars.count+'|'+(span?span.spanStart+'|'+span.spanEnd:'');
 if(lastDecoded&&lastDecoded.data===bars.data&&lastDecoded.key===key)return lastDecoded.columns;
 const count=bars.count,texts=bars.data.split(';');
 if(texts.length!==5)return 'The pattern data needs exactly five columns.';
 const [time,open,high,low,close]=texts.map(text=>parseColumn(text,count));
 if(!time||!open||!high||!low||!close)return 'The pattern data has a wrong bar count or a value that is not a finite number.';
 for(let i=0;i<count;i++){
  if(i>0&&!(time[i]>time[i-1]))return 'Pattern bar times must be strictly ascending.';
  if(low[i]>Math.min(open[i],close[i])||high[i]<Math.max(open[i],close[i])||low[i]>high[i])return 'A pattern bar has inconsistent open, high, low and close values.';
  if(span&&(time[i]<span.spanStart||time[i]>=span.spanEnd))return 'A pattern bar lies outside the stored source span.';
 }
 const columns=Object.freeze({time,open,high,low,close,count});
 lastDecoded={data:bars.data,key,columns};
 return columns;
}
export function columnsToBars(columns:PatternColumns):PatternBar[]{
 const out:PatternBar[]=[];for(let i=0;i<columns.count;i++)out.push({time:columns.time[i],open:columns.open[i],high:columns.high[i],low:columns.low[i],close:columns.close[i]});return out;
}

function readSource(value:unknown):BarsPatternSource|string{
 if(!plain(value))return 'The pattern source record has missing or unknown fields.';
 {const own=Object.keys(value);if(!SOURCE_KEYS.every(key=>own.includes(key))||own.some(key=>!(SOURCE_KEYS as readonly string[]).includes(key)&&!(OPTIONAL_SOURCE_KEYS as readonly string[]).includes(key)))return 'The pattern source record has missing or unknown fields.';}
 for(const key of OPTIONAL_SOURCE_KEYS){if(!Object.hasOwn(value,key))continue;const field=value[key];
  if(key==='choiceSpanStart'||key==='choiceSpanEnd'){if(field!==null&&(typeof field!=='number'||!Number.isFinite(field)))return 'The pattern source '+key+' is invalid.';continue;}if(field!==null&&(typeof field!=='string'||!field.length||field.length>200))return 'The pattern source '+key+' is invalid.';}
 for(const key of ['instrumentId','symbol','datasetKey','revision','sourceKey','resolution','placedResolution'] as const){const field=value[key];if(field!==null&&(typeof field!=='string'||!field.length||field.length>MAX_TEXT*5))return 'The pattern source '+key+' is invalid.';}
 if(value.fixture!==null&&typeof value.fixture!=='boolean')return 'The pattern source fixture flag is invalid.';
 for(const key of ['spanStart','spanEnd','refPrice'] as const)if(typeof value[key]!=='number'||!Number.isFinite(value[key]))return 'The pattern source '+key+' must be a finite number.';
 if(!((value.spanEnd as number)>(value.spanStart as number)))return 'The pattern source span is empty.';
 if(typeof value.derived!=='boolean'||typeof value.trimmed!=='boolean')return 'The pattern source flags are invalid.';
 const bound=value.instrumentId!==null;
 if(bound&&(value.resolution===null||value.fixture===null||value.placedResolution===null))return 'A bound pattern source needs its resolution and fixture flag.';
 return value as unknown as BarsPatternSource;
}

/** Validates a stored series; returns the problem, or null when it is usable. */
function readSeries(value:unknown,span:{spanStart:number;spanEnd:number}):string|null{
 if(!plain(value)||!exactKeys(value,['resolution','bars'])||typeof value.resolution!=='string'||!value.resolution.length||value.resolution.length>40)return 'unknown fields.';
 const bars=value.bars;
 if(!plain(bars)||!exactKeys(bars,['encoding','count','data'])||bars.encoding!=='cols-v1'||typeof bars.data!=='string'||typeof bars.count!=='number'||!Number.isSafeInteger(bars.count)||bars.count<1||bars.count>BARS_PATTERN_BAR_CAP)return 'unknown encoding or count.';
 const columns=decodeBars(bars as unknown as BarsPatternBars,span);
 return typeof columns==='string'?columns:null;
}
/** Strict reader. Anything unknown or inconsistent is `unavailable` and the caller keeps the props untouched. */
export function readBarsPattern(props:unknown):BarsPatternRead{
 if(props===undefined||props===null)return{state:'absent'};
 if(!plain(props))return{state:'unavailable',message:'Pattern props are not a plain record.'};
 if(!Object.hasOwn(props,BARS_PATTERN_MEMBER))return{state:'absent'};
 const member=props[BARS_PATTERN_MEMBER];
 if(!plain(member))return{state:'unavailable',message:'Pattern data is not a plain record.'};
 if(member.schemaVersion!==BARS_PATTERN_SCHEMA_VERSION)return{state:'unavailable',message:'Pattern data uses an unsupported schema version ('+String(member.schemaVersion)+').'};
 {const own=Object.keys(member);if(!['schemaVersion','source','bars'].every(key=>own.includes(key))||own.some(key=>!['schemaVersion','source','bars','captured','fetched'].includes(key)))return{state:'unavailable',message:'Pattern data has missing or unknown fields.'};}
 const source=readSource(member.source);if(typeof source==='string')return{state:'unavailable',message:source};
 const bars=member.bars;
 if(!plain(bars)||!exactKeys(bars,['encoding','count','data'])||bars.encoding!=='cols-v1'||typeof bars.data!=='string'||typeof bars.count!=='number'||!Number.isSafeInteger(bars.count))return{state:'unavailable',message:'Pattern bars use an unknown encoding.'};
 if(bars.count<1||bars.count>BARS_PATTERN_BAR_CAP)return{state:'unavailable',message:'Pattern bars count must be 1 to '+BARS_PATTERN_BAR_CAP.toLocaleString('en-US')+'.'};
 for(const key of ['captured','fetched'] as const){
  if(!Object.hasOwn(member,key))continue;
  const problem=readSeries(member[key],source);if(problem)return{state:'unavailable',message:'Pattern '+key+' bars: '+problem};
 }
 const columns=decodeBars(bars as unknown as BarsPatternBars,source);
 if(typeof columns==='string')return{state:'unavailable',message:columns};
 return{state:'supported',member:member as unknown as BarsPatternMember,columns};
}

export function makeBarsPatternMember(source:BarsPatternSource,bars:readonly PatternBar[],stored:{readonly captured?:BarsPatternSeries|null;readonly fetched?:BarsPatternSeries|null}={}):BarsPatternMember{
 if(!bars.length)throw Error('A bars pattern needs at least one bar.');
 if(bars.length>BARS_PATTERN_BAR_CAP)throw Error('A bars pattern holds at most '+BARS_PATTERN_BAR_CAP.toLocaleString('en-US')+' bars.');
 const member:BarsPatternMember={schemaVersion:1,source:Object.freeze({...pickSource(source)}),bars:encodeBars(bars),...stored.captured?{captured:stored.captured}:{},...stored.fetched?{fetched:stored.fetched}:{}};
 const checked=readBarsPattern({[BARS_PATTERN_MEMBER]:member});
 if(checked.state!=='supported')throw Error(checked.state==='unavailable'?checked.message:'Pattern data is missing.');
 return member;
}
const pickSource=(source:BarsPatternSource):BarsPatternSource=>({...Object.fromEntries(SOURCE_KEYS.map(key=>[key,source[key]])),sourceFingerprint:source.sourceFingerprint??null,choiceRevision:source.choiceRevision??null,choiceFingerprint:source.choiceFingerprint??null,choiceSpanStart:source.choiceSpanStart??null,choiceSpanEnd:source.choiceSpanEnd??null}) as unknown as BarsPatternSource;

/** Non-cryptographic content identity of a member (FNV-1a pair), used to tie a preview to the payload it was computed from. */
export function barsPatternFingerprint(member:BarsPatternMember|null):string{
 if(!member)return 'none';
 let a=2166136261,b=2246822519;const text=JSON.stringify(member.source)+'|'+member.bars.count+'|'+member.bars.data+(member.captured?'|c'+member.captured.resolution+'|'+member.captured.bars.data:'')+(member.fetched?'|f'+member.fetched.resolution+'|'+member.fetched.bars.data:'');
 for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489917);}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}

/** Whole-member patch: returns the identical props object when nothing changes (identity-preserving no-op). */
export function patchBarsPatternMember(props:Record<string,unknown>|undefined,member:BarsPatternMember):Record<string,unknown>{
 const before=props?.[BARS_PATTERN_MEMBER];
 if(before&&JSON.stringify(before)===JSON.stringify(member))return props!;
 return{...(props??{}),[BARS_PATTERN_MEMBER]:member};
}
