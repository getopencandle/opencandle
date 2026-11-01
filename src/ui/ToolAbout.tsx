import React,{useEffect,useState} from 'react';
import {Modal} from './Modal';
import {REFERENCE_EXTRAS,confidenceNote,loadToolReference,referenceFileFor,sourceTitle,sourceYear,type Block,type Inline,type ToolReference,type ToolReferenceSource} from './tool-reference';
import './tool-about.css';

/** Opens a source address in the default browser (main checks it); absent outside the desktop main window. */
export type ReferenceLinkOpener=(url:string)=>void;
export function defaultReferenceLinkOpener():ReferenceLinkOpener|undefined{
 const bridge=typeof window==='undefined'?undefined:window.lv;
 return typeof bridge?.openReferenceLink==='function'?url=>{void bridge.openReferenceLink!({url}).catch(()=>{/* nothing opens; the address stays in the link title */});}:undefined;
}
/** Info glyph of the picker's About buttons (18x18 grid like the other picker glyphs; a plain function, not a component). */
export const infoIcon=()=><svg className="lv-picker-icon lv-info-glyph" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M9 8v4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="9" cy="5.6" r=".9" fill="currentColor"/></svg>;
/** The reference file shown in an indicator's About, or null when it has none. */
export const indicatorReferenceFile=(kind:string):string|null=>referenceFileFor(kind);

const inlineNodes=(nodes:readonly Inline[],open?:ReferenceLinkOpener):React.ReactNode[]=>nodes.map((node,index)=>{
 switch(node.t){
  case 'text':return node.v;
  case 'code':return <code key={index}>{node.v}</code>;
  case 'strong':return <strong key={index}>{inlineNodes(node.c,open)}</strong>;
  case 'em':return <em key={index}>{inlineNodes(node.c,open)}</em>;
  case 'link':return open?<a key={index} href={node.href} title={node.href} onClick={event=>{event.preventDefault();open(node.href);}}>{inlineNodes(node.c,open)}</a>:<React.Fragment key={index}>{inlineNodes(node.c)}</React.Fragment>;
 }
});
/** React elements for parsed blocks. Text is always text: a file never supplies markup. */
export function referenceBlocks(blocks:readonly Block[],open?:ReferenceLinkOpener):React.ReactNode[]{
 return blocks.map((block,index)=>{
  switch(block.t){
   case 'p':return <p key={index}>{inlineNodes(block.c,open)}</p>;
   case 'h':return <h5 key={index}>{inlineNodes(block.c,open)}</h5>;
   case 'ul':return <ul key={index}>{block.items.map((item,row)=><li key={row}>{inlineNodes(item,open)}</li>)}</ul>;
   case 'ol':return <ol key={index}>{block.items.map((item,row)=><li key={row}>{inlineNodes(item,open)}</li>)}</ol>;
   case 'table':return <div className="lv-tool-about-table" key={index}><table><thead><tr>{block.head.map((cell,column)=><th scope="col" key={column}>{inlineNodes(cell,open)}</th>)}</tr></thead><tbody>{block.rows.map((cells,row)=><tr key={row}>{cells.map((cell,column)=><td key={column}>{inlineNodes(cell,open)}</td>)}</tr>)}</tbody></table></div>;
  }
 });
}
function sourceItem(source:ToolReferenceSource,index:number,open?:ReferenceLinkOpener){
 const title=sourceTitle(source.title),year=sourceYear(source.year),href=/^https?:\/\//i.test(source.url)?source.url:null;
 const nodes=inlineNodes(href?[{t:'link',href,c:[{t:'text',v:title}]}]:[{t:'text',v:title}],open);
 const detail=[source.author.trim(),year,source.url.trim().toLowerCase()==='book'?'book':null].filter(Boolean).join(', ');
 return <li key={index}>{nodes}{detail&&<span className="lv-tool-about-meta"> {detail}</span>}</li>;
}
/** The About view itself: shown sections (How OpenCandle does it last, when the file has it), extra feature sections, then sources and confidence. */
export function ToolAboutView({reference,extras=[],open}:{reference:ToolReference;extras?:readonly ToolReference[];open?:ReferenceLinkOpener}){
 const sources:ToolReferenceSource[]=[];const seen=new Set<string>();
 for(const row of [reference,...extras].flatMap(item=>item.meta.sources)){const key=sourceTitle(row.title)+'|'+row.url;if(!seen.has(key)){seen.add(key);sources.push(row);}}
 const confidence=confidenceNote(reference.meta.confidence);
 return <div className="lv-tool-about" aria-label={'About '+(reference.meta.name||'this tool')} role="region">
  {reference.sections.map(section=><section key={section.title}><h4>{section.title}</h4>{referenceBlocks(section.blocks,open)}</section>)}
  {extras.map(extra=><section key={extra.meta.id} className="lv-tool-about-extra"><h4>{extra.meta.name}</h4>{extra.sections.map(section=><React.Fragment key={section.title}><h5>{section.title}</h5>{referenceBlocks(section.blocks,open)}</React.Fragment>)}</section>)}
  {sources.length>0&&<section><h4>Sources</h4><ul className="lv-tool-about-sources">{sources.map((row,index)=>sourceItem(row,index,open))}</ul>{confidence&&<p className="lv-tool-about-confidence">{confidence}.</p>}</section>}
 </div>;
}
type Loaded={file:string;reference:ToolReference;extras:ToolReference[]}|{file:string;error:true};
/** Loads a tool's reference file (and its extra feature files) and shows it. Renders nothing without a file. */
export function ToolAbout({file}:{file:string|null}){
 const [state,setState]=useState<Loaded|null>(null);
 useEffect(()=>{
  if(!file)return;let live=true;
  const extras=(Object.hasOwn(REFERENCE_EXTRAS,file)?REFERENCE_EXTRAS[file]:[]).filter(name=>referenceFileFor(name)===name);
  Promise.all([loadToolReference(file),Promise.all(extras.map(name=>loadToolReference(name).catch(()=>null)))]).then(([reference,more])=>{if(live)setState({file,reference,extras:more.filter((item):item is ToolReference=>!!item)});},()=>{if(live)setState({file,error:true});});
  return()=>{live=false;};
 },[file]);
 if(!file)return null;
 if(!state||state.file!==file)return <p className="help" role="status">Loading the description.</p>;
 if('error' in state)return <p className="help" role="status">The description could not be loaded.</p>;
 return <ToolAboutView reference={state.reference} extras={state.extras} open={defaultReferenceLinkOpener()}/>;
}
/** The same view in its own dialog (the Indicators picker's info buttons). Rendered inside another dialog, so its keys
 * and presses stop here instead of reaching the outer dialog's Escape, Tab and backdrop handlers through the portal. */
export function ToolAboutDialog({file,title,onClose}:{file:string;title:string;onClose:()=>void}){
 const stop=(event:{stopPropagation():void})=>event.stopPropagation();
 return <div className="lv-tool-about-scope" style={{display:'contents'}} onKeyDown={stop} onPointerDown={stop} onClick={stop}><Modal title={'About '+title} onClose={onClose} portal dragKey="tool-about"><div className="modal-scroll lv-tool-about-dialog" tabIndex={0}><ToolAbout file={file}/></div></Modal></div>;
}
