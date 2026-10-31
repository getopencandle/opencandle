// The renderer's drawing settings panel (double-click) has a "Show on" fold that reads the timeframe bands from
// the renderer drawing (`b.live().showOn`) and writes them with a native edit. OpenCandle keeps interval visibility on the saved
// record and strips `showOn` from every renderer copy (drawing-visibility.ts), and a native row without `showOn` means "not
// represented" to the saved-record projection. So the fold always read "All timeframes", a band click started from an empty set
// (owner's daily chart: Custom then W saved ["W"], shown on weekly only), "All" never cleared a saved choice and Cancel never put
// it back. This wraps the panel instance's `open` (an own member, removed by the returned release): the fold reads the saved bands,
// a Show on change is written to the saved record directly (never to the renderer copy), and Cancel restores the bands it opened with.

/** The supported legacy band keys, in renderer order (vela TIMEFRAME_BANDS; drawing-visibility.ts legacyBands). */
export const SHOW_ON_BANDS:readonly string[]=Object.freeze(['s','1','5','15','60','240','D','W','M']);
export interface NativeShowOnHost {
 /** Saved bands of one drawing, or undefined for every timeframe (also for retained opaque values). */
 read(id:string):readonly string[]|undefined;
 /** Writes one drawing's saved bands (undefined: every timeframe). */
 write(id:string,bands:readonly string[]|undefined):void;
}
type Row=Record<string,unknown>;
type Method=(this:unknown,...args:unknown[])=>unknown;

/** The saved bands a record carries: a supported legacy band list, else undefined (all timeframes, or retained opaque data). */
export function savedShowOnBands(row:Readonly<Row>|undefined):readonly string[]|undefined{
 const value=row?.showOn;
 return Array.isArray(value)&&value.every(item=>typeof item==='string'&&SHOW_ON_BANDS.includes(item))?value as string[]:undefined;
}
/** Sets (or, for undefined, removes) one record's legacy bands in a drawing document; the document itself when nothing changes. */
export function withShowOn(document:Readonly<Row>,id:string,bands:readonly string[]|undefined):Row{
 const rows=document.drawings;if(!Array.isArray(rows))throw Error('Drawing document requires rows');
 const at=rows.findIndex(row=>!!row&&typeof row==='object'&&(row as Row).id===id);if(at<0)throw Error('Drawing not found: '+id);
 if(bands!==undefined&&(!Array.isArray(bands)||bands.some(band=>!SHOW_ON_BANDS.includes(band))))throw Error('Unsupported timeframe bands');
 const before=rows[at] as Row,next:Row={...before};
 if(bands===undefined)delete next.showOn;else next.showOn=SHOW_ON_BANDS.filter(band=>bands.includes(band));
 if(JSON.stringify(next.showOn)===JSON.stringify(before.showOn)&&Object.hasOwn(next,'showOn')===Object.hasOwn(before,'showOn'))return document as Row;
 return{...document,drawings:rows.map((row,index)=>index===at?next:row)};
}

function savedView(b:object,host:NativeShowOnHost):object{
 return new Proxy(b,{get(target,key){
  const value=Reflect.get(target,key,target);
  if(key!=='live'||typeof value!=='function')return typeof value==='function'?value.bind(target):value;
  return()=>{
   const drawing=Reflect.apply(value,target,[]) as Row|null|undefined;
   if(!drawing||typeof drawing!=='object'||typeof drawing.id!=='string')return drawing;
   let bands:readonly string[]|undefined;try{bands=host.read(drawing.id);}catch{return drawing;}
   return new Proxy(drawing,{get(model,member){if(member==='showOn')return bands?[...bands]:undefined;const field=Reflect.get(model,member,model);return typeof field==='function'?field.bind(model):field;}});
  };
 }});
}

/** Installs the saved-record Show on path on one renderer settings panel instance. A panel without `open`/`showOnFold` is left unchanged.
 * It layers over an own `open` another LV wrapper installed first (drawing-edit-transaction.ts) and puts that one back on release. */
export function installNativeShowOn(panel:unknown,host:NativeShowOnHost):()=>void{
 if(!panel||typeof panel!=='object')return()=>{};
 const target=panel as Row,open=target.open,fold=target.showOnFold;
 if(typeof open!=='function'||typeof fold!=='function'||Object.hasOwn(target,'showOnFold'))return()=>{};
 const previousOpen=Object.getOwnPropertyDescriptor(target,'open');
 const ownFold:Method=function(b){return Reflect.apply(fold as Method,this,[b&&typeof b==='object'?savedView(b as object,host):b]);};
 const ownOpen:Method=function(drawing,actions,...rest){
  const id=drawing&&typeof drawing==='object'?(drawing as Row).id:undefined;
  if(typeof id!=='string'||!actions||typeof actions!=='object')return Reflect.apply(open as Method,this,[drawing,actions,...rest]);
  let opened:readonly string[]|undefined;try{opened=host.read(id);}catch{opened=undefined;}
  const wrapped=new Proxy(actions as Row,{get(source,key){
   const value=Reflect.get(source,key,source);
   if(key==='patch'&&typeof value==='function')return(patch:unknown)=>{
    if(!patch||typeof patch!=='object'||!Object.hasOwn(patch,'showOn'))return Reflect.apply(value,source,[patch]);
    const {showOn,...others}=patch as Row;
    host.write(id,Array.isArray(showOn)?showOn as string[]:undefined);
    return Object.keys(others).length?Reflect.apply(value,source,[others]):undefined;
   };
   if(key==='restore'&&typeof value==='function')return(doc:unknown)=>{
    const result=Reflect.apply(value,source,[doc]);
    try{host.write(id,opened);}catch(error){console.warn('[OpenCandle] Show on could not be restored on Cancel.',String(error));}
    return result;
   };
   return typeof value==='function'?value.bind(source):value;
  }});
  return Reflect.apply(open as Method,this,[drawing,wrapped,...rest]);
 };
 Object.defineProperty(target,'showOnFold',{configurable:true,writable:true,value:ownFold});
 Object.defineProperty(target,'open',{configurable:true,writable:true,value:ownOpen});
 return()=>{
  const nowFold=Object.getOwnPropertyDescriptor(target,'showOnFold'),nowOpen=Object.getOwnPropertyDescriptor(target,'open');
  if(nowFold&&nowFold.value===ownFold)delete target.showOnFold;
  if(nowOpen&&nowOpen.value===ownOpen){if(previousOpen)Object.defineProperty(target,'open',previousOpen);else delete target.open;}
 };
}
