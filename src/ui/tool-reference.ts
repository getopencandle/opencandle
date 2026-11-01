// Tool reference notes (docs/reference/tools/<id>.md): the About view of an indicator or drawing.
// The files are bundled at build time, one lazy chunk each, so startup reads none of them. Front matter is a small
// YAML subset (exactly the shape these files use) and the body a small markdown subset parsed to a plain tree; the
// renderer (ToolAbout.tsx) builds React elements from the tree, so nothing in a file is ever treated as HTML.

export interface ToolReferenceSource {title:string;author:string;year:string;url:string;type:string}
export interface ToolReferenceMeta {id:string;name:string;kind:string;family:string;confidence:string;sources:ToolReferenceSource[];also:string[]}
export type Inline={t:'text';v:string}|{t:'code';v:string}|{t:'strong';c:Inline[]}|{t:'em';c:Inline[]}|{t:'link';href:string;c:Inline[]};
export type Block={t:'p';c:Inline[]}|{t:'h';c:Inline[]}|{t:'ul'|'ol';items:Inline[][]}|{t:'table';head:Inline[][];rows:Inline[][][]};
export interface ToolReferenceSection {title:string;blocks:Block[]}
export interface ToolReference {meta:ToolReferenceMeta;sections:ToolReferenceSection[]}

/** The sections shown, in this order; a heading pair means either wording (drawing files use the second). Any other
 * heading, Open questions included, is never shown. */
const SHOWN_SECTIONS:readonly (readonly string[])[]=[['Purpose'],['How the author meant it to be used'],['How you interact with it','How you draw it'],['Calculation','Geometry and levels'],['Standard defaults'],['Reading it'],['Common mistakes and edge cases'],['How OpenCandle does it']];
/** Ids documented inside another tool's file (its `also` list); tests keep this equal to the files. */
export const REFERENCE_ALIASES:Readonly<Record<string,string>>=Object.freeze({elliottcorrection:'elliottimpulse',lvshortposition:'position',modifiedschiffpitchfork:'schiffpitchfork'});
/** Files shown as an extra section inside another tool's About (a feature of that tool, not a tool of its own). */
export const REFERENCE_EXTRAS:Readonly<Record<string,readonly string[]>>=Object.freeze({rsi:Object.freeze(['rsi-divergence'])});
const CONFIDENCE_NOTE:Readonly<Record<string,string>>={high:'Based on primary sources',medium:'Based on secondary sources',low:'Some details unverified'};

const FILES:Readonly<Record<string,()=>Promise<string>>>=(()=>{
 const found=import.meta.glob('/docs/reference/tools/*.md',{query:'?raw',import:'default',eager:false}) as Record<string,()=>Promise<string>>;
 const out:Record<string,()=>Promise<string>>={};
 for(const [path,load] of Object.entries(found)){const name=path.slice(path.lastIndexOf('/')+1,-3);if(name!=='README')out[name]=load;}
 return Object.freeze(out);
})();
/** Every bundled file name (without .md). */
export const referenceFileNames=():string[]=>Object.keys(FILES).sort();
/** The file that documents a tool id (its own file, or the file that lists it under `also`), or null. */
export function referenceFileFor(id:string):string|null{
 if(typeof id!=='string'||!id)return null;
 if(Object.hasOwn(FILES,id))return id;
 const alias=Object.hasOwn(REFERENCE_ALIASES,id)?REFERENCE_ALIASES[id]:undefined;
 return alias&&Object.hasOwn(FILES,alias)?alias:null;
}
export const hasReference=(id:string):boolean=>referenceFileFor(id)!==null;

// ---- Front matter ----
const unquote=(value:string)=>{const v=value.trim();return v.length>=2&&(v[0]==='"'&&v.endsWith('"')||v[0]==="'"&&v.endsWith("'"))?v.slice(1,-1):v;};
const inlineList=(value:string)=>{const v=value.trim();return v.startsWith('[')&&v.endsWith(']')?v.slice(1,-1).split(',').map(unquote).filter(Boolean):v?[unquote(v)]:[];};
/** Splits a file into its front matter (key: value lines, `key:` + `  - k: v` lists, `[a, b]` lists) and body. */
export function parseFrontMatter(raw:string):{data:Record<string,string|string[]|Record<string,string>[]>;body:string}{
 const text=String(raw).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const lines=text.split('\n');
 if(lines[0]?.trim()!=='---')return {data:{},body:text};
 const end=lines.indexOf('---',1);if(end<0)return {data:{},body:text};
 const data:Record<string,string|string[]|Record<string,string>[]>={};let listKey:string|null=null;
 for(const line of lines.slice(1,end)){
  if(!line.trim()||line.trimStart().startsWith('#'))continue;
  // A key is a word followed by ":" and a space or the line end, so "url: https://..." keeps its own colon.
  const top=/^([A-Za-z_][\w-]*):(\s.*|)$/.exec(line);
  if(top){const [,key,value]=top;if(value.trim()===''){data[key]=[];listKey=key;}else{data[key]=value.trim().startsWith('[')?inlineList(value):unquote(value);listKey=null;}continue;}
  const list=listKey?data[listKey]:undefined;
  if(!Array.isArray(list))continue;
  const item=/^\s+-\s+(.*)$/.exec(line);
  if(item){const pair=/^([A-Za-z_][\w-]*):(\s.*|)$/.exec(item[1]);if(pair)(list as Record<string,string>[]).push({[pair[1]]:unquote(pair[2])});else (list as string[]).push(unquote(item[1]));continue;}
  const field=/^\s+([A-Za-z_][\w-]*):(\s.*|)$/.exec(line),last=list[list.length-1];
  if(field&&last&&typeof last==='object')(last as Record<string,string>)[field[1]]=unquote(field[2]);
 }
 return {data,body:lines.slice(end+1).join('\n')};
}
const str=(value:unknown)=>typeof value==='string'?value:'';
export function referenceMeta(data:Record<string,unknown>):ToolReferenceMeta{
 const sources=(Array.isArray(data.sources)?data.sources:[]).filter((row):row is Record<string,string>=>!!row&&typeof row==='object').map(row=>({title:str(row.title),author:str(row.author),year:str(row.year),url:str(row.url),type:str(row.type)})).filter(row=>row.title);
 const also=Array.isArray(data.also)?data.also.filter((value):value is string=>typeof value==='string'):typeof data.also==='string'?[data.also]:[];
 return {id:str(data.id),name:str(data.name),kind:str(data.kind),family:str(data.family),confidence:str(data.confidence),sources,also};
}

// ---- Markdown subset ----
/** Only an absolute http or https address is a link; anything else (javascript:, data:, relative) stays text. */
export function safeLinkHref(href:string):string|null{
 const value=String(href).trim();if(!/^https?:\/\//i.test(value))return null;
 try{const url=new URL(value);return (url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
const OPEN_BEFORE=/[\s([{"'\u2018\u201c]/,CLOSE_AFTER=/[\s.,;:!?)\]}"'\u2019\u201d]/;
/** Emphasis needs a clean word boundary on both sides, so the * of a formula (a*b, (x)*(y)) stays text. */
function emphasisEnd(text:string,from:number,mark:string):number{
 const width=mark.length;
 for(let j=from;j<text.length;j++){
  if(text.startsWith(mark,j)&&j>from&&!/\s/.test(text[j-1])&&(j+width>=text.length||CLOSE_AFTER.test(text[j+width]))&&(width===2||text[j+1]!=='*'&&text[j-1]!=='*'))return j;
 }
 return -1;
}
export function parseInline(text:string):Inline[]{
 const out:Inline[]=[];let plain='';
 const flush=()=>{if(plain){out.push({t:'text',v:plain});plain='';}};
 for(let i=0;i<text.length;){
  const ch=text[i];
  if(ch==='\\'&&i+1<text.length&&/[\\`*_[\]()#|-]/.test(text[i+1])){plain+=text[i+1];i+=2;continue;}
  if(ch==='`'){const end=text.indexOf('`',i+1);if(end>i+1){flush();out.push({t:'code',v:text.slice(i+1,end)});i=end+1;continue;}}
  if(ch==='['){
   const close=text.indexOf(']',i+1);
   if(close>i+1&&text[close+1]==='('){const end=text.indexOf(')',close+2);if(end>close+1){
    const label=text.slice(i+1,close),href=safeLinkHref(text.slice(close+2,end));flush();
    if(href)out.push({t:'link',href,c:parseInline(label)});else out.push(...parseInline(label));
    i=end+1;continue;
   }}
  }
  if(ch==='*'||ch==='_'){
   const mark=text.startsWith(ch+ch,i)?ch+ch:ch,width=mark.length,before=i===0?' ':text[i-1],after=text[i+width];
   if(after!==undefined&&!/\s/.test(after)&&after!==ch&&OPEN_BEFORE.test(before)){
    const end=emphasisEnd(text,i+width,mark);
    if(end>0){flush();const inner=parseInline(text.slice(i+width,end));out.push(width===2?{t:'strong',c:inner}:{t:'em',c:inner});i=end+width;continue;}
   }
   plain+=mark;i+=width;continue;
  }
  plain+=ch;i++;
 }
 flush();return out;
}
const BULLET=/^\s{0,3}[-*+]\s+(.*)$/,NUMBER=/^\s{0,3}\d{1,3}[.)]\s+(.*)$/,HEADING=/^#{3,6}\s+(.*?)\s*#*\s*$/,TABLE_RULE=/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells=(line:string)=>{let v=line.trim();if(v.startsWith('|'))v=v.slice(1);if(v.endsWith('|'))v=v.slice(0,-1);return v.split('|').map(cell=>parseInline(cell.trim()));};
/** Paragraphs, ### headings, bullet and numbered lists (indented lines continue an item), and pipe tables. */
export function parseBlocks(text:string):Block[]{
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),out:Block[]=[];let para:string[]=[],list:{t:'ul'|'ol';items:string[]}|null=null;
 const flushPara=()=>{if(para.length){out.push({t:'p',c:parseInline(para.join(' '))});para=[];}};
 const flushList=()=>{if(list){out.push({t:list.t,items:list.items.map(parseInline)});list=null;}};
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(!line.trim()){flushPara();flushList();continue;}
  const heading=HEADING.exec(line);if(heading){flushPara();flushList();out.push({t:'h',c:parseInline(heading[1])});continue;}
  if(line.trim().startsWith('|')&&TABLE_RULE.test(lines[index+1]??'')){
   flushPara();flushList();const head=cells(line),rows:Inline[][][]=[];index+=2;
   while(index<lines.length&&lines[index].trim().startsWith('|')){rows.push(cells(lines[index]));index++;}
   index--;out.push({t:'table',head,rows});continue;
  }
  const bullet=BULLET.exec(line),number=bullet?null:NUMBER.exec(line);
  if(bullet||number){flushPara();const t=bullet?'ul':'ol';if(list&&list.t!==t)flushList();list??={t,items:[]};list.items.push((bullet??number)![1].trim());continue;}
  if(list&&/^\s{2,}\S/.test(line)){list.items[list.items.length-1]+=' '+line.trim();continue;}
  flushList();para.push(line.trim());
 }
 flushPara();flushList();return out;
}
/** The shown sections of a body in display order (the first heading of each pair present). */
export function referenceSections(body:string):ToolReferenceSection[]{
 const found=new Map<string,string[]>();let current:string[]|null=null;
 for(const line of String(body).replace(/\r\n?/g,'\n').split('\n')){
  const heading=/^##\s+(.*?)\s*#*\s*$/.exec(line);
  if(heading&&!line.startsWith('###')){const title=heading[1].trim();current=found.has(title)?null:[];if(current)found.set(title,current);continue;}
  current?.push(line);
 }
 const out:ToolReferenceSection[]=[];
 for(const names of SHOWN_SECTIONS){const title=names.find(name=>found.has(name));if(!title)continue;
  // A pointer to the hidden Open questions section ("(see open questions)") goes with it.
  const blocks=parseBlocks(found.get(title)!.join('\n').replace(/\s*\(see (?:the )?open questions?\)/gi,''));if(blocks.length)out.push({title,blocks});}
 return out;
}
export function parseToolReference(raw:string):ToolReference{const {data,body}=parseFrontMatter(raw);return {meta:referenceMeta(data),sections:referenceSections(body)};}

// ---- Presentation helpers ----
export const confidenceNote=(confidence:string):string|null=>Object.hasOwn(CONFIDENCE_NOTE,confidence)?CONFIDENCE_NOTE[confidence]:null;
/** Drops the research bookkeeping notes ("retrieved this session") from a source title, keeping other remarks. */
export function sourceTitle(title:string):string{
 return title.replace(/\s*\(([^()]*)\)/g,(whole,inner:string)=>{
  if(!/this session/i.test(inner))return whole;
  const kept=inner.split(/\s*[;,]\s*/).filter(part=>part&&!/this session/i.test(part));
  return kept.length?' ('+kept.join(', ')+')':'';
 }).trim();
}
/** Year as shown: a missing or n/a year is left out. */
export const sourceYear=(year:string):string|null=>{const v=year.trim();return v&&!/^n\/?a$/i.test(v)?v:null;};

const loaded=new Map<string,Promise<ToolReference>>();
/** Loads and parses one file (cached). Rejects for an unknown file name. */
export function loadToolReference(file:string):Promise<ToolReference>{
 const load=Object.hasOwn(FILES,file)?FILES[file]:undefined;
 if(!load)return Promise.reject(new Error('No reference for '+file));
 let value=loaded.get(file);
 if(!value){value=load().then(parseToolReference);value.catch(()=>loaded.delete(file));loaded.set(file,value);}
 return value;
}
