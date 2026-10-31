import type {NewsDocument,NewsItem} from './news';
// Imported story text is untrusted. It is never handed to an HTML parser, never rendered
// through innerHTML and never turned into a navigable element. Markup is reduced to inert
// plain text by this bounded single-pass tokenizer; React then renders that text escaped.
// Token recognition has bounded scans. Workload timing and memory use still depend on
// supplied content; regression tests cover particular hostile inputs, not every input.
export type NewsLinkStatus='external'|'blocked'|'unresolved';
export interface NewsLink {text:string;status:NewsLinkStatus;href:string|null;host:string|null;reason:string;}
export interface NewsDisplay {title:string;body:string;markup:boolean;links:NewsLink[];images:number;}
// Content dropped entirely, including its text: executable, styling, embedded or form content.
const DROP=new Set(['script','style','noscript','iframe','object','embed','applet','template','svg','math','head','title','textarea','select','option','canvas','frameset','frame','noembed','noframes','xmp','plaintext','audio','video','picture','source','track','map','button','form','input','dialog','portal','meta','link','base']);
const BLOCK=new Set(['p','div','section','article','header','footer','blockquote','pre','h1','h2','h3','h4','h5','h6','ul','ol','table','thead','tbody','tfoot','tr','dl','dt','dd','figure','figcaption','hr','address','aside','nav','main','details','summary','caption']);
const INLINE=['a','abbr','acronym','b','bdi','bdo','big','blink','body','br','center','cite','code','col','colgroup','data','del','dfn','em','fieldset','font','html','i','img','ins','kbd','label','legend','li','mark','marquee','nobr','q','rp','rt','ruby','s','samp','small','span','strike','strong','sub','sup','tbody','td','th','time','tt','u','var','wbr','area','meter','progress','output','slot'];
// Only recognized HTML element names are treated as tags. Any other "<word ...>" (for example
// "EPS<est and rev>guide") is ordinary text and is shown unchanged.
const KNOWN=new Set([...DROP,...BLOCK,...INLINE]);
const VOID_DROP=new Set(['meta','link','base','input','source','track']);
const NAMED:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',laquo:'«',raquo:'»',copy:'©',reg:'®',trade:'™',euro:'€',pound:'£',yen:'¥',cent:'¢',deg:'°',middot:'·',bull:'•',times:'×',divide:'÷',plusmn:'±',sect:'§',para:'¶',shy:''};
export const MAX_NEWS_LINKS=50;
// Bidirectional controls/marks and zero-width or invisible format characters: stripped from link labels.
const INVISIBLE=/[؜᠎​-‏‪-‮⁠-⁩﻿]/g;
const MARKUP=new RegExp('<\\/?(?:'+[...KNOWN].sort((a,b)=>b.length-a.length).join('|')+')(?![a-zA-Z0-9:-])[^<>]{0,8192}>|<!--|<!doctype|<!\\[cdata\\[','i');
/** True when text contains a recognized HTML tag, comment, doctype or CDATA marker. Plain text passes through unchanged. */
export function looksLikeMarkup(raw:string):boolean{return MARKUP.test(raw);}
function codePoint(n:number):string{if(!Number.isFinite(n)||n<=0||n>0x10ffff||n>=0xd800&&n<=0xdfff||n<0x20&&n!==9&&n!==10||n>=0x7f&&n<=0x9f)return '�';return String.fromCodePoint(n);}
/** Decodes a fixed whitelist of named entities and bounded numeric references. Unknown references stay literal. */
export function decodeEntities(s:string):string{return s.replace(/&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,(whole,ref:string)=>{if(ref[0]==='#')return codePoint(ref[1]==='x'||ref[1]==='X'?parseInt(ref.slice(2),16):parseInt(ref.slice(1),10));return Object.prototype.hasOwnProperty.call(NAMED,ref)?NAMED[ref]:whole;});}
/** Classifies an imported link target. Only credential-free absolute http(s) URLs are external; nothing is ever opened. */
export function classifyNewsLink(rawHref:string,text=''):NewsLink{
 // Browsers strip ASCII tab/newline anywhere in a URL and leading/trailing C0/space, so check the same normalized form.
 // Linear trims only: an anchored [..]+$ alternation is quadratic on long interior space runs.
 const label=text.replace(INVISIBLE,'').replace(/\s+/g,' ').trim().slice(0,300);
 if(rawHref.length>4096)return {text:label,status:'blocked',href:null,host:null,reason:'Link target exceeds 4,096 characters.'};
 let href=decodeEntities(rawHref).replace(/[\t\n\r]/g,''),start=0,end=href.length;while(start<end&&href.charCodeAt(start)<=0x20)start++;while(end>start&&href.charCodeAt(end-1)<=0x20)end--;href=href.slice(start,end);
 if(!href)return {text:label,status:'unresolved',href:null,host:null,reason:'Empty link target.'};
 if(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/.test(href))return {text:label,status:'blocked',href:null,host:null,reason:'Link contains control or bidirectional override characters.'};
 const scheme=/^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href)?.[1].toLowerCase();
 if(scheme){if(scheme!=='http'&&scheme!=='https')return {text:label,status:'blocked',href:null,host:null,reason:'Blocked '+scheme.slice(0,30)+': link scheme.'};
  let url:URL;try{url=new URL(href);}catch{return {text:label,status:'blocked',href:null,host:null,reason:'Malformed web address.'};}
  if(url.username||url.password||!url.hostname)return {text:label,status:'blocked',href:null,host:null,reason:'Web addresses with credentials or no host are blocked.'};
  if(url.href.length>2048)return {text:label,status:'blocked',href:null,host:null,reason:'Web address exceeds 2,048 characters.'};
  return {text:label,status:'external',href:url.href,host:url.host,reason:'External web address shown as text only.'};}
 if(href.startsWith('//')||href.startsWith('\\'))return {text:label,status:'unresolved',href:null,host:null,reason:'Protocol-relative link has no trusted base address.'};
 return {text:label,status:'unresolved',href:null,host:null,reason:'Relative link has no trusted base address.'};
}
function attributes(tag:string):Map<string,string>{const out=new Map<string,string>(),re=/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;let m:RegExpExecArray|null;while((m=re.exec(tag))&&out.size<64){const name=m[1].toLowerCase();if(!out.has(name))out.set(name,m[2]??m[3]??m[4]??'');}return out;}
// Finds the end of a tag starting at `from` (just after the tag name), honouring quoted attribute values.
// The search is bounded: a recognized name without a closing '>' within MAX_TAG characters is prose.
const MAX_TAG=8192;
// An unquoted '<' also ends the search (not a tag), so repeated "<b " prose rescans only up to the next '<'.
function tagEnd(s:string,from:number,limit=MAX_TAG):number{let quote='';const stop=Math.min(s.length,from+limit);for(let i=from;i<stop;i++){const c=s[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')return i;else if(c==='<')return -1;}return -1;}
// HTML boolean attributes that may legitimately appear without "=value".
const BARE=new Set(['hidden','disabled','checked','selected','readonly','multiple','required','open','async','defer','nowrap','compact','itemscope','autofocus','novalidate','reversed','controls','autoplay','loop','muted','playsinline','inert','download','allowfullscreen','ismap','noshade','default','formnovalidate','nomodule']);
/**
 * Whether the text between a recognized element name and its '>' is plausible tag syntax: empty, a
 * self-closing slash, or attributes that each carry a value or are known boolean attributes. Prose such
 * as "<select few>" or "<data and y>" fails and stays literal text. Closing tags allow only whitespace.
 */
function plausibleTag(body:string,closing:boolean):boolean{
 if(closing)return /^\s*$/.test(body);
 if(body&&!/^[\s/]/.test(body))return false;
 const re=/([^\s"'<>\/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;let m:RegExpExecArray|null,count=0;
 while((m=re.exec(body))){if(++count>256)return false;const name=m[1].toLowerCase();if(!m[2]&&!BARE.has(name)&&!name.startsWith('data-')&&!name.startsWith('aria-'))return false;}
 return true;
}
const finish=(parts:string[])=>parts.join('').split('\n').map(line=>line.replace(/ {2,}/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
/**
 * Reduces markup to inert plain text. Returns visible text, a search form of that text (image
 * placeholders replaced by their supplied alt text only), extracted never-navigable link records
 * and an omitted-image count.
 */
function tokenize(raw:string,searchOnly=false):{text:string;search:string;links:NewsLink[];images:number}{
 // ASCII-only folding keeps indexes aligned with raw (full Unicode lowercasing can change string length).
 const lower=raw.replace(/[A-Z]/g,c=>c.toLowerCase()),out:string[]=[],alts=new Map<number,string>(),links:NewsLink[]=[];let images=0,i=0,text='',anchor:{href:string|null;start:number}|null=null;
 const flush=()=>{if(text){out.push(decodeEntities(text).replace(/[ \t\r\n\f\u000b]+/g,' '));text='';}};
 const closeAnchor=()=>{if(!anchor)return;flush();const label=out.slice(anchor.start).join('');if(anchor.href!==null&&links.length<MAX_NEWS_LINKS)links.push(classifyNewsLink(anchor.href,label));anchor=null;};
 // First valid "</name" at or after `from`. Memoized per name: a result found from an earlier position
 // that is still at or after `from` (or "none") is exact, so repeated unclosed elements stay linear.
 const closeMemo=new Map<string,{from:number;at:number}>();
 const closeTag=(name:string,from:number)=>{const memo=closeMemo.get(name);if(memo&&memo.from<=from&&(memo.at<0||memo.at>=from))return memo.at;let at=from,found=-1;while(at<raw.length){const k=lower.indexOf('</'+name,at);if(k<0)break;const next=lower[k+2+name.length]??'';if(!next||/[\s/>]/.test(next)){found=k;break;}at=k+2;}closeMemo.set(name,{from,at:found});return found;};
 const skipTo=(marker:string,from:number)=>{const end=lower.indexOf(marker,from);return end<0?raw.length:end+marker.length;};
 while(i<raw.length){const c=raw[i];if(c!=='<'){text+=c;i++;continue;}
  if(lower.startsWith('<!--',i)){i=skipTo('-->',i+4);continue;}
  if(lower.startsWith('<!doctype',i)||lower.startsWith('<![cdata[',i)||lower.startsWith('<?xml',i)){i=skipTo('>',i+2);continue;}
  const closing=raw[i+1]==='/',nameMatch=/^[a-zA-Z][a-zA-Z0-9:-]{0,63}/.exec(raw.slice(i+(closing?2:1),i+(closing?2:1)+65));
  const name=nameMatch?.[0].toLowerCase();
  if(!nameMatch||!KNOWN.has(name!)){text+=c;i++;continue;} // Not a recognized element: ordinary text.
  // A recognized name is a tag only with valid syntax and a closing '>' within MAX_TAG characters;
  // otherwise ("P<S ratio", "<select few>") the '<' is ordinary text and nothing after it is lost.
  const after=raw[i+(closing?2:1)+nameMatch[0].length]??'';
  const end=after===''||/[\s/>]/.test(after)?tagEnd(raw,i+(closing?2:1)+nameMatch[0].length):-1;
  const body=end<0?'':raw.slice(i+(closing?2:1)+nameMatch[0].length,end);
  if(end<0||!plausibleTag(body,closing)){text+=c;i++;continue;}
  i=end+1;
  if(!closing&&DROP.has(name!)&&!VOID_DROP.has(name!)&&!/\/\s*$/.test(body)){
   // Skip everything up to the matching close tag. Without a close tag only the opening tag is removed
   // and the remainder stays visible as inert text, so prose is never silently truncated.
   const found=closeTag(name!,i);
   if(found<0){flush();out.push(' ');continue;}const close=tagEnd(raw,found+2+name!.length,raw.length);i=close<0?raw.length:close+1;flush();out.push(' ');continue;}
  flush();
  if(name==='br')out.push('\n');
  else if(name==='li'&&!closing)out.push('\n• ');
  else if(name==='td'||name==='th')out.push(' ');
  else if(BLOCK.has(name!))out.push('\n\n');
  else if(name==='img'&&!closing){images++;const alt=decodeEntities(attributes(body).get('alt')??'').replace(/\s+/g,' ').trim().slice(0,200);if(searchOnly)out.push(alt);else{alts.set(out.length,alt);out.push(alt?'[image omitted: '+alt+']':'[image omitted]');}}
  else if(name==='a'&&!searchOnly){if(closing)closeAnchor();else{closeAnchor();const attrs=attributes(body);anchor={href:attrs.has('href')?attrs.get('href')!:null,start:out.length};}}
 }
 flush();closeAnchor();
 const search=alts.size?finish(out.map((part,index)=>alts.has(index)?alts.get(index)!:part)):null;
 const visible=finish(out);
 return {text:visible,search:search??visible,links,images};
}
/** Reduces markup to inert plain text: visible text, extracted never-navigable link records and an omitted-image count. */
export function htmlToInertText(raw:string):{text:string;links:NewsLink[];images:number}{const {text,links,images}=tokenize(raw);return {text,links,images};}
export const UNAVAILABLE_HEADLINE='Headline unavailable after removing imported markup';
interface ItemMemo {search:string;display?:NewsDisplay;}
interface ContentEntry {search:string;cost:number;display?:WeakRef<NewsDisplay>;}
// Immutable item identities own their display conversion through a WeakMap. The content cache
// retains only raw keys and searchable text. Expanded image placeholders and extracted link records
// are reachable there through WeakRef only, so removed documents cannot leave those records alive.
// This is a UTF-16 character budget, not a claim about JavaScript engine heap bytes. Count both raw
// keys for EVERY entry (conservatively counting shared summary keys again), plus its search string.
// Entry count separately bounds Map/WeakRef bookkeeping. Live item memos are outside this content
// cache budget and disappear with their immutable item owners.
const byItem=new WeakMap<NewsItem,ItemMemo>();
const cache=new Map<string,Map<string,ContentEntry>>();let cachedCost=0,cachedEntries=0;
export const NEWS_DISPLAY_CACHE_BUDGET=64_000_000;
export const NEWS_DISPLAY_CACHE_MAX_ENTRIES=20_000;
let searchConversions=0,displayConversions=0,contentHits=0,rejectedAdmissions=0;
function convert(raw:string):{text:string;search:string;links:NewsLink[];images:number;markup:boolean}{if(!looksLikeMarkup(raw))return {text:raw,search:raw,links:[],images:0,markup:false};return {...tokenize(raw),markup:true};}
function content(item:NewsItem):ContentEntry|undefined{return cache.get(item.summary)?.get(item.title);}
function remember(item:NewsItem,memo:ItemMemo):void{
 const existing=content(item);
 if(existing){if(memo.display)existing.display=new WeakRef(memo.display);return;}
 const cost=item.summary.length+item.title.length+memo.search.length;
 // Admission never evicts an entire warm set during a sequential scan. Oversized or excess entries
 // remain uncached by content; repeated copies of those entries may require conversion again. The
 // explicit retain operation removes obsolete entries. There is no exemption for a shared group.
 if(cachedEntries>=NEWS_DISPLAY_CACHE_MAX_ENTRIES||cost>NEWS_DISPLAY_CACHE_BUDGET-cachedCost){rejectedAdmissions++;return;}
 const entry:ContentEntry={search:memo.search,cost,...(memo.display?{display:new WeakRef(memo.display)}:{})};
 let group=cache.get(item.summary);if(!group){group=new Map();cache.set(item.summary,group);}group.set(item.title,entry);cachedCost+=cost;cachedEntries++;
}
function search(item:NewsItem):ItemMemo{
 const own=byItem.get(item);if(own)return own;
 const hit=content(item);if(hit){contentHits++;const memo:ItemMemo={search:hit.search};byItem.set(item,memo);return memo;}
 // Search-only tokenization omits LV image placeholders and link extraction entirely. It therefore
 // does not build expanded display strings merely because Advanced View re-normalized its inputs.
 searchConversions++;
 const title=looksLikeMarkup(item.title)?tokenize(item.title,true).text.replace(/\s+/g,' ').trim():item.title;
 const body=looksLikeMarkup(item.summary)?tokenize(item.summary,true).text:item.summary;
 const memo:ItemMemo={search:(title+' '+body).toLocaleLowerCase()};byItem.set(item,memo);remember(item,memo);return memo;
}
/** Memoized inert display form of an immutable imported item. Stored content is never altered. */
export function newsItemDisplay(item:NewsItem):NewsDisplay{
 const own=byItem.get(item);if(own?.display)return own.display;
 const hit=content(item),shared=hit?.display?.deref();
 if(shared){contentHits++;byItem.set(item,{search:hit!.search,display:shared});return shared;}
 displayConversions++;
 const t=convert(item.title),b=convert(item.summary),title=t.markup?t.text.replace(/\s+/g,' ').trim():t.text,titleSearch=t.markup?t.search.replace(/\s+/g,' ').trim():t.search;
 const display:NewsDisplay={title:title||UNAVAILABLE_HEADLINE,body:b.text,markup:t.markup||b.markup,links:[...t.links,...b.links].slice(0,MAX_NEWS_LINKS),images:t.images+b.images};
 const memo:ItemMemo={display,search:own?.search??hit?.search??(titleSearch+' '+b.search).toLocaleLowerCase()};
 byItem.set(item,memo);remember(item,memo);return display;
}
const metaText=new WeakMap<NewsItem,string>();
function meta(item:NewsItem):string{let s=metaText.get(item);if(s===undefined){s=(item.provider+' '+(item.instruments??[]).join(' ')).toLocaleLowerCase();metaText.set(item,s);}return s;}
/**
 * True when a lower-cased term occurs in the displayed headline and body (alt text, not LV placeholder
 * wording) or in the provider and supplied instrument codes. Hidden markup, attributes and link targets
 * never match. A phrase does not span the text and the provider/instrument metadata.
 */
export function newsMatchesSearch(item:NewsItem,term:string):boolean{return search(item).search.includes(term)||meta(item).includes(term);}
/** The two searchable fields joined, for inspection; matching uses newsMatchesSearch. */
export function newsSearchText(item:NewsItem):string{return search(item).search+' '+meta(item);}
/**
 * Drops cached display/search text for content no longer supplied (removed or reloaded documents).
 * Returns the number of evicted entries.
 */
export function retainNewsDisplayCache(documents:readonly NewsDocument[]):number{
 const keep=new Map<string,Set<string>>();for(const d of documents)for(const item of d.items){let titles=keep.get(item.summary);if(!titles)keep.set(item.summary,titles=new Set());titles.add(item.title);}
 let evicted=0;for(const [key,group] of cache){const titles=keep.get(key);for(const [title,c] of group)if(!titles?.has(title)){group.delete(title);cachedCost-=c.cost;cachedEntries--;evicted++;}if(!group.size)cache.delete(key);}
 return evicted;
}
/** Content-cache size for tests and diagnostics (the identity layer is a WeakMap and is not counted). */
export function newsDisplayCacheStats():{entries:number;cost:number}{return {entries:cachedEntries,cost:cachedCost};}
/** Conversion counts support deterministic workload checks; they are not timing or heap measurements. */
export function newsContentCacheDiagnostics():{searchConversions:number;displayConversions:number;contentHits:number;rejectedAdmissions:number}{return {searchConversions,displayConversions,contentHits,rejectedAdmissions};}
