// Plain-text copy for the chart menu's "Copy price". Renderer only, no new bridge: the
// copy runs in the menu click (a user gesture) through a detached text area and the document copy command, with the async
// Clipboard API as the second try. Success is reported only when one of them says the text was written.
export interface TextClipboardEnv{
 document?:{createElement(tag:'textarea'):HTMLTextAreaElement;body?:{appendChild(node:unknown):unknown;removeChild(node:unknown):unknown}|null;execCommand?(command:string):boolean;activeElement?:unknown}|null;
 navigator?:{clipboard?:{writeText?(text:string):Promise<void>}}|null;
}
const defaultEnv=():TextClipboardEnv=>({document:typeof document!=='undefined'?document as unknown as TextClipboardEnv['document']:null,navigator:typeof navigator!=='undefined'?navigator as unknown as TextClipboardEnv['navigator']:null});
// `maxLength` defaults to the price-sized 1000; the screener passes a larger cap for symbol lists.
export async function copyPlainText(text:string,env:TextClipboardEnv=defaultEnv(),maxLength=1000):Promise<{ok:boolean;message:string}>{
 if(typeof text!=='string'||!text||text.length>maxLength)return{ok:false,message:'There is nothing to copy.'};
 const doc=env.document;
 if(doc?.body&&typeof doc.execCommand==='function'){
  let area:HTMLTextAreaElement|null=null;const previous=doc.activeElement as {focus?:(options?:unknown)=>void}|null|undefined;
  try{area=doc.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.setAttribute('aria-hidden','true');Object.assign(area.style,{position:'fixed',left:'-9999px',top:'0',opacity:'0'});doc.body.appendChild(area);area.select();if(doc.execCommand('copy'))return{ok:true,message:'Copied '+text+'.'};}
  catch{/* fall through to the Clipboard API */}
  finally{try{if(area)doc.body.removeChild(area);}catch{/* already gone */}try{previous?.focus?.({preventScroll:true});}catch{/* focus is best effort */}}
 }
 const writeText=env.navigator?.clipboard?.writeText;
 if(typeof writeText==='function'){try{await writeText.call(env.navigator!.clipboard,text);return{ok:true,message:'Copied '+text+'.'};}catch{/* reported below */}}
 return{ok:false,message:'The price could not be copied to the clipboard.'};
}
