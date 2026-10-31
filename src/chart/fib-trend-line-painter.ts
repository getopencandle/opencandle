import {NativeRenderer,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {LosslessDrawingDocument,type ChartDiagnostic,type OwnedDrawingEditAcceptance} from './contracts';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import {readFibTrendLine,type FibTrendLineSettings} from './fib-trend-line-data';
import {nativeFibTrendLineDefaults} from './fib-level-format-native';
import {resolveNativeInlineLayoutOwner} from './native-inline-layout-owner';
import {resolveFibTrendLineNativeOwner,resolveFibLevelPresentationNativeOwner} from './fib-trend-line-owner';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,readFibBackground,readFibText,readFibLayout,type FibState,type FibBackgroundSettings,type FibTextSettings} from './fib-level-presentation-data';
const FIB_PRESENTATION_WITHHELD='Fibonacci presentation is withheld until the native drawing matches its saved record.';
/** The only binding refusal the F1 commit-lag absorb may consider (drawing-canonical.ts). */
const CANONICAL_MISMATCH='Native drawing changed or differs from its canonical record';
/** The saved-record divergence refusals (drawing-canonical.ts) that withhold one drawing's presentation instead of
 * escaping the render and quarantining the whole chart. Source, ownership and attestation failures are not in this list and still throw. */
const DIVERGENCE:readonly string[]=Object.freeze([CANONICAL_MISMATCH,'Native Fibonacci trend-line interpretation differs from its canonical record','Native Fibonacci presentation differs from its canonical record']);
/** The creation commit-lag refusal (see creationLag). */
const CANONICAL_TARGET_MISSING='Fibonacci canonical target is unavailable.';
/** Commit-lag window. The adapter's drawing:edited listener writes the canonical document
 * (updateDocument) in the same task as the native store commit that re-renders ahead of it,
 * so a genuine lag resolves within that task. 2 s is a generous bound for a slow frame or a
 * deferred host write; a divergence that outlives it is not a commit lag and quarantines. */
const COMMIT_LAG_WINDOW_MS=2000;
/** The record members a settings-dialog live preview may lay over the saved row on the
 * renderer copy (drawing-preview.ts DRAWING_PREVIEW_MEMBERS; equality pinned by fib-preview-binding.test.ts). */
const PREVIEW_MEMBERS:readonly string[]=Object.freeze(['anchors','style','text','props']);
/** The record members the toolbar overlay (drawing-visibility.ts, Lock all drawings) lays over
 * the renderer copy of a PAINTED drawing, and the only value each may carry. Hide all yields visible:false, which is not painted. */
const OVERLAY_MEMBERS:Readonly<Record<string,unknown>>=Object.freeze({locked:true});
const finiteAnchor=(anchor:unknown)=>!!anchor&&typeof anchor==='object'&&!Array.isArray(anchor)&&typeof (anchor as Data).time==='number'&&Number.isFinite((anchor as Data).time)&&typeof (anchor as Data).price==='number'&&Number.isFinite((anchor as Data).price);
const sameAnchorTopology=(left:readonly unknown[],right:readonly unknown[])=>left.length===right.length&&left.every((anchor,i)=>{const other=right[i];if(!anchor||typeof anchor!=='object'||Array.isArray(anchor)||!other||typeof other!=='object'||Array.isArray(other))return false;const a=Object.keys(anchor).sort(),b=Object.keys(other).sort();return a.length===b.length&&a.every((key,k)=>key===b[k]);});
import {registerOwnedFibTrendLine,composeOwnedFibTargetProof,type OwnedFibTrendLineTarget} from './trendline-annotation';
import type {FibTrendLineHitLease} from './fib-trend-line-runtime';
export interface FibTrendLineHost {
 readonly document:LosslessDrawingDocument;
 captureOwner():()=>void;
 captureNativeOwner(canonical:Readonly<SerializedDrawing>,projected:Readonly<SerializedDrawing>,canonicalOwner:OwnedDrawingEditAcceptance,assertSource:()=>void):()=>void;
 capturePresentationNativeOwner?(canonical:Readonly<SerializedDrawing>,projected:Readonly<SerializedDrawing>,canonicalOwner:OwnedDrawingEditAcceptance,assertSource:()=>void):()=>void;
 captureLayoutOwner(paneId:string,assertSource:()=>void):()=>void;
 /** The settings dialog's live-preview members for this id (drawing-preview.ts), or undefined when
  * no preview is active. Attestation only: the renderer copy must equal the saved row with exactly these
  * members laid over it, and the native store must still equal the saved row; anything else is refused. */
 previewMembers?(id:string):Readonly<Record<string,unknown>>|undefined;
 /** The toolbar overlay members the visibility projection lays over this id's renderer copy (today only
  * {locked:true} while Lock all drawings is on), or undefined when none. Same attestation rule as previewMembers. */
 overlayMembers?(id:string):Readonly<Record<string,unknown>>|undefined;
 /** Renderer row (synthetic time on a derived chart) -> source-time row, applied to the projected and origin
  * renderer rows before any comparison or binding with a canonical record. Omitted, or the same row on a time chart, means no mapping. */
 rendererRowToSource?(row:Readonly<SerializedDrawing>):Readonly<SerializedDrawing>;
 /** Re-project this drawing's native copy from its saved record (called outside paint, never while the native settings popup is open). */
 resyncDrawing?(id:string):void;
}
export interface FibTrendLineController {diagnostics():ChartDiagnostic[];invalidate():void;dispose():void}
type Data=Record<string,any>;
function own(value:object,key:string):any{const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error('Fibonacci trend line requires a data field: '+key);return d.value;}
function method(value:object,key:string):Function{for(let current:object|null=value;current;current=Object.getPrototypeOf(current)){const d=Object.getOwnPropertyDescriptor(current,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('Fibonacci trend line requires a data method: '+key);return d.value;}}throw Error('Fibonacci trend-line method unavailable: '+key);}
const captureReadOnly=LosslessDrawingDocument.prototype.captureReadOnlyOwner;
const allDescriptor=Object.getOwnPropertyDescriptor(LosslessDrawingDocument.prototype,'all')!,readAll=allDescriptor.value as LosslessDrawingDocument['all'];
interface Index {owner:OwnedDrawingEditAcceptance;canonical:()=>void;source:()=>void;rows:Map<string,SerializedDrawing>}
/** Derived baseline only. Native levels and native interaction continue through
 * their retained original bodies; these leases never authorize publication. */
export function installFibTrendLine(renderer:NativeRenderer,chart:Vela,host:FibTrendLineHost):FibTrendLineController{
 if(!(renderer instanceof NativeRenderer))throw Error('Fibonacci renderer unavailable.');
 const core=own(chart,'orchestrator'),document=own(host,'document') as LosslessDrawingDocument,capture=method(host,'captureOwner'),bind=method(host,'captureNativeOwner'),captureLayout=method(host,'captureLayoutOwner'),presentationSlot=Object.getOwnPropertyDescriptor(host,'capturePresentationNativeOwner'),presentationBind=presentationSlot?own(host,'capturePresentationNativeOwner') as Function:undefined;if(presentationBind!==undefined&&typeof presentationBind!=='function')throw Error('Fibonacci presentation native binding unavailable.');
 const previewSlot=Object.getOwnPropertyDescriptor(host,'previewMembers'),previewRead=previewSlot?own(host,'previewMembers') as Function:undefined;if(previewRead!==undefined&&typeof previewRead!=='function')throw Error('Fibonacci preview attestation unavailable.');
 const overlaySlot=Object.getOwnPropertyDescriptor(host,'overlayMembers'),overlayRead=overlaySlot?own(host,'overlayMembers') as Function:undefined;if(overlayRead!==undefined&&typeof overlayRead!=='function')throw Error('Fibonacci overlay attestation unavailable.');
 const toSourceSlot=Object.getOwnPropertyDescriptor(host,'rendererRowToSource'),toSource=toSourceSlot?own(host,'rendererRowToSource') as Function:undefined;if(toSource!==undefined&&typeof toSource!=='function')throw Error('Fibonacci renderer time map unavailable.');
 /** A renderer row in source time (the row itself without a time map). */
 const sourceRow=(row:Readonly<SerializedDrawing>):Readonly<SerializedDrawing>=>{if(Object.getOwnPropertyDescriptor(host,'rendererRowToSource')?.value!==toSource)throw Error('Fibonacci trend-line installation retired.');if(!toSource)return row;const mapped=Reflect.apply(toSource,host,[row]) as Readonly<SerializedDrawing>;if(mapped!==row&&(!mapped||typeof mapped!=='object'||mapped.id!==row.id||mapped.type!==row.type))throw Error('Fibonacci renderer time map changed row identity.');return mapped;};
 const resyncSlot=Object.getOwnPropertyDescriptor(host,'resyncDrawing'),resync=resyncSlot?own(host,'resyncDrawing') as Function:undefined;if(resync!==undefined&&typeof resync!=='function')throw Error('Fibonacci drawing resync unavailable.');
 let live=true,index:Index|undefined;const notices:{row:ChartDiagnostic;proof:()=>void}[]=[];
 // Drawings whose native/saved divergence is waiting for a resync (see diverged).
 const resyncs=new Map<string,ReturnType<typeof setTimeout>>(),logged=new Set<string>();
 /** Whether the native drawing settings popup (vela's double-click panel) is open; false when the renderer has no readable popup. */
 const nativePopupOpen=():boolean=>{try{const controller=own(renderer,'userDrawings'),popup=own(controller,'popup'),isOpen=method(popup,'isOpen');return Reflect.apply(isOpen,popup,[])===true;}catch{return false;}};
 /** One drawing's native copy differs from its saved record beyond a commit lag (owner report: the native double-click
  * panel's Show on bands, or its line width, edit the native copy live while the panel is open). That one drawing paints natively with
  * its LV presentation withheld and a diagnostic; the chart is never quarantined for it. Once the panel is closed and the lag window has
  * passed, the drawing is re-projected from its saved record, which is a no-op when Ok or Cancel already brought them back together. */
 const diverged=(id:string,error:unknown)=>{
  const key=id+'\u0000'+String(error);if(!logged.has(key)){logged.add(key);if(logged.size>64)logged.delete(logged.values().next().value!);console.warn('[OpenCandle] Fibonacci '+id+': native drawing differs from its saved record; OpenCandle presentation withheld, the drawing will be re-synced from the saved record.',String(error));}
  if(!resync||resyncs.has(id))return;
  const tick=()=>{if(!live){resyncs.delete(id);return;}if(nativePopupOpen()){resyncs.set(id,setTimeout(tick,500));return;}resyncs.delete(id);try{Reflect.apply(resync,host,[id]);}catch(cause){console.warn('[OpenCandle] Fibonacci '+id+': resync from the saved record failed.',String(cause));}};
  resyncs.set(id,setTimeout(tick,COMMIT_LAG_WINDOW_MS));
 };
 // Per-drawing first sighting of one specific saved/native anchor divergence (see COMMIT_LAG_WINDOW_MS).
 const lags=new Map<string,{key:string;since:number}>();
 // Per-drawing saved anchors at the first sighting of a preview's anchors (see previewDraft).
 const previewAnchors=new Map<string,{preview:string;saved:string}>();
 const layouts=new WeakMap<object,Map<string,{full:()=>void;local:()=>void;source:()=>void}>>();
 const installed=()=>{const currentAll=Object.getOwnPropertyDescriptor(LosslessDrawingDocument.prototype,'all');if(!live||own(chart,'orchestrator')!==core||own(core,'renderer')!==renderer||own(host,'document')!==document||method(host,'captureOwner')!==capture||method(host,'captureNativeOwner')!==bind||method(host,'captureLayoutOwner')!==captureLayout||Object.getOwnPropertyDescriptor(host,'capturePresentationNativeOwner')?.value!==presentationBind||Object.getOwnPropertyDescriptor(host,'previewMembers')?.value!==previewRead||Object.getOwnPropertyDescriptor(host,'overlayMembers')?.value!==overlayRead||method(document,'captureReadOnlyOwner')!==captureReadOnly||!currentAll||currentAll.value!==readAll||currentAll.get!==allDescriptor.get||currentAll.set!==allDescriptor.set||currentAll.writable!==allDescriptor.writable||currentAll.enumerable!==allDescriptor.enumerable||currentAll.configurable!==allDescriptor.configurable)throw Error('Fibonacci trend-line installation retired.');registration.assertCurrent();};
 const getIndex=(source:()=>void):Index=>{
  if(index)try{index.source();index.canonical();installed();return index;}catch{index=undefined;}
  installed();source();installed();const owner=Reflect.apply(captureReadOnly,document,[]) as OwnedDrawingEditAcceptance,assert=own(owner,'assertCurrent'),canonical=()=>Reflect.apply(assert,owner,[]);canonical();source();installed();const rows=Reflect.apply(readAll,document,[]) as ReturnType<LosslessDrawingDocument['all']>;canonical();source();installed();if(rows.length>10000)throw Error('Fibonacci canonical drawing capacity exceeded.');const map=new Map<string,SerializedDrawing>();for(const row of rows)if(row.type==='fibretracement')map.set(String(row.id),row as unknown as SerializedDrawing);canonical();source();installed();return index={owner,canonical,source,rows:map};
 };
 function prepare(target:OwnedFibTrendLineTarget,presentation=false){
  installed();target.assertCurrent();const source=Reflect.apply(capture,host,[]) as ()=>void;target.assertCurrent();if(typeof source!=='function')throw Error('Fibonacci source receipt unavailable.');source();target.assertCurrent();const cache=getIndex(source);let layout=layouts.get(target.scope)?.get(target.paneId),nativeLocal:(()=>void)|undefined,retired=false,checking=false;
  const proof=composeOwnedFibTargetProof(target,()=>{if(retired)throw Error('Fibonacci operation retired.');installed();target.assertLocal();cache.canonical();layout?.local();nativeLocal?.();installed();},source),local=proof.local;
  const check=()=>{if(checking){retired=true;throw Error('Fibonacci operation reentered.');}checking=true;try{proof.check();}catch(error){retired=true;throw error;}finally{checking=false;}};
  check();if(!layout){const full=Reflect.apply(captureLayout,host,[target.paneId,source]) as ()=>void;check();if(typeof full!=='function')throw Error('Fibonacci layout owner unavailable.');full();check();const pure=resolveNativeInlineLayoutOwner(full,renderer,target.paneId,source);layout={full,local:pure,source};let panes=layouts.get(target.scope);if(!panes){panes=new Map();layouts.set(target.scope,panes);}panes.set(target.paneId,layout);}check();
  const projected=sourceRow(target.projected());check();let props=projected.props;const state=readFibTrendLine(projected.props,nativeFibTrendLineDefaults());check();if(!presentation&&state.state==='unavailable')throw Error(state.message);
  // The native core store commits a drag (or undo) geometry
  // edit and synchronously re-renders BEFORE the adapter writes the canonical
  // document, so a lifted committed drawing paints once with the store one edit
  // ahead of its saved record. The binding is (correctly) refused for that frame.
  // Lineage, not identity: when the ONLY difference is the just-committed
  // geometry (a full second binding of the same native owner against the saved
  // record carrying the native anchors succeeds), the refusal withholds the LV
  // presentation for this frame instead of escaping the render and quarantining
  // the chart. Any other difference (props, presentation, identity, a missing
  // record) still throws exactly as before. Source/ownership failures are never
  // absorbed: check() re-runs the complete proof and rethrows them.
  let unbound:unknown;
  /** One attested member set (plain record of own enumerable data members), or undefined when none is attested. */
  const attested=(read:Function|undefined,kind:string):Data|undefined=>{
   if(!read)return;const members=Reflect.apply(read,host,[String(target.id)]) as unknown;check();if(members===undefined)return;
   if(!members||typeof members!=='object'||Array.isArray(members)||![Object.prototype,null].includes(Object.getPrototypeOf(members)))throw Error(`Fibonacci ${kind} attestation requires a plain record.`);
   const copy:Data={};for(const key of Reflect.ownKeys(members)){if(typeof key!=='string')throw Error(`Fibonacci ${kind} attestation names a member a ${kind} cannot replace.`);const d=Object.getOwnPropertyDescriptor(members,key)!;if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error(`Fibonacci ${kind} attestation requires own data members.`);copy[key]=structuredClone(d.value);}
   return Object.keys(copy).length?copy:undefined;
  };
  /** The attested renderer-copy draft of this saved record (live preview and/or toolbar overlay), or undefined. */
  const previewDraft=(canonical:Readonly<SerializedDrawing>)=>{
   const id=String(target.id),preview=attested(previewRead,'preview');
   if(preview&&Object.keys(preview).some(key=>!PREVIEW_MEMBERS.includes(key)))throw Error('Fibonacci preview attestation names a member a preview cannot replace.');
   if(preview&&Object.hasOwn(preview,'anchors')){
    // A Fib retracement preview carries exactly two finite time/price anchors.
    const anchors=preview.anchors;if(!Array.isArray(anchors)||anchors.length!==2||!anchors.every(finiteAnchor))throw Error('Fibonacci preview anchors require exactly two finite time/price points.');
    // Drawing-preview.ts snapshots the draft anchors at show() and does not follow a later saved edit.
    // If the saved anchors move while the same preview anchors stay active, those anchors are stale: refuse them.
    const key=JSON.stringify(anchors),saved=JSON.stringify(canonical.anchors),seen=previewAnchors.get(id);
    if(!seen||seen.preview!==key){previewAnchors.set(id,{preview:key,saved});if(previewAnchors.size>64)previewAnchors.delete(previewAnchors.keys().next().value!);}
    else if(seen.saved!==saved)throw Error('Fibonacci preview anchors are stale: the saved anchors changed while the preview was active.');
   }else previewAnchors.delete(id);
   const overlay=attested(overlayRead,'overlay');
   if(overlay)for(const key of Object.keys(overlay))if(!Object.hasOwn(OVERLAY_MEMBERS,key)||!Object.is(overlay[key],OVERLAY_MEMBERS[key]))throw Error('Fibonacci overlay attestation names a member or value the overlay cannot project.');
   if(!preview&&!overlay)return;
   // Same order as drawing-visibility.ts prepare(): preview first, the toolbar overlay on top.
   const copy:Data={...preview,...overlay},keys=Object.keys(copy);
   const record={...structuredClone(canonical),...copy} as SerializedDrawing;
   const revert=(row:Readonly<SerializedDrawing>):SerializedDrawing=>{const out:Data=structuredClone(row);for(const key of keys){if(Object.hasOwn(canonical,key))out[key]=structuredClone((canonical as Data)[key]);else delete out[key];}return out as SerializedDrawing;};
   return{record,revert};
  };
  const bindNative=()=>{
   const canonical=cache.rows.get(target.id);if(!canonical)throw Error(CANONICAL_TARGET_MISSING);props=canonical.props;
   if(presentation&&!presentationBind&&(Object.hasOwn(canonical.props??{},FIB_BACKGROUND_FIELD)||Object.hasOwn(canonical.props??{},FIB_TEXT_FIELD)))throw Error('Fibonacci presentation native binding is required.');
   // Exe r19b settings step: the dialog's live preview pushes the saved row with the draft
   // members laid over it to the RENDERER copy only; the native store and the saved record stay unchanged.
   // Binding that renderer copy against the bare saved record threw "Native Fibonacci trend-line
   // interpretation differs from its canonical record" out of the render and quarantined the chart.
   // With an attested preview: the renderer copy must equal saved+draft exactly (full native-interpreted
   // comparison), and the native owner is bound against the saved record with only the attested members
   // reverted, so the native store must still equal the saved record. Nothing else is tolerated.
   const draft=previewDraft(canonical);check();if(draft)props=draft.record.props;
   if(target.mode==='committed'){const common=presentation&&presentationBind;let bound:Readonly<SerializedDrawing>=projected;if(draft){assertNativeDrawingMatchesCanonical(draft.record,projected);check();bound=draft.revert(projected);check();}const native=Reflect.apply(common||bind,host,[canonical,bound,cache.owner,source]) as ()=>void;check();if(typeof native!=='function')throw Error('Fibonacci native receipt unavailable.');native();check();nativeLocal=(common?resolveFibLevelPresentationNativeOwner:resolveFibTrendLineNativeOwner)(native,cache.owner,source);check();}
   else{const rawOrigin=target.origin();check();const origin=rawOrigin&&sourceRow(rawOrigin);check();if(!origin)throw Error('Fibonacci preview origin unavailable.');assertNativeDrawingMatchesCanonical(draft?draft.record:canonical,origin as SerializedDrawing);check();if(presentation&&presentationBind){const native=Reflect.apply(presentationBind,host,[canonical,draft?draft.revert(origin):origin,cache.owner,source]) as ()=>void;check();if(typeof native!=='function')throw Error('Fibonacci preview native receipt unavailable.');native();check();nativeLocal=resolveFibLevelPresentationNativeOwner(native,cache.owner,source);check();}}
  };
  /** True only when the saved record with the native anchors binds the same native owner. */
  // Scope: only the canonical-mismatch refusal, only a same-topology anchor
  // difference, and only within COMMIT_LAG_WINDOW_MS of first seeing that exact divergence.
  const geometryLag=(error:unknown):boolean=>{
   if(error instanceof Error&&error.message===CANONICAL_TARGET_MISSING)return creationLag();
   if(!(error instanceof Error)||error.message!==CANONICAL_MISMATCH)return false;
   const canonical=cache.rows.get(target.id),common=presentationBind;if(!canonical||!common||!Array.isArray(projected.anchors)||!Array.isArray(canonical.anchors))return false;
   if(!sameAnchorTopology(canonical.anchors,projected.anchors))return false;
   // Bring to front / Send to back go through the native store first
   // (store.bringToFront emits and re-renders synchronously) and the adapter's drawing:edited listener
   // writes the canonical zIndex after it, the same commit lag as a drag. A stacking-only lag is a finite
   // number on both sides (vela start z is fractional); the settled binding below still refuses any other difference.
   const savedZ=(canonical as Data).zIndex,nativeZ=(projected as Data).zIndex,stacking=savedZ!==nativeZ;
   if(stacking&&!(typeof savedZ==='number'&&Number.isFinite(savedZ)&&typeof nativeZ==='number'&&Number.isFinite(nativeZ)))return false;
   if(!stacking&&JSON.stringify(canonical.anchors)===JSON.stringify(projected.anchors))return false;
   const id=String(target.id),key=JSON.stringify([canonical.anchors,projected.anchors,savedZ,nativeZ]),now=performance.now();let lag=lags.get(id);
   if(!lag||lag.key!==key){lags.delete(id);lag={key,since:now};lags.set(id,lag);if(lags.size>64)lags.delete(lags.keys().next().value!);}
   if(!(now-lag.since>=0&&now-lag.since<=COMMIT_LAG_WINDOW_MS))return false;
   const settled={...structuredClone(canonical),anchors:structuredClone(projected.anchors),...(stacking?{zIndex:nativeZ}:{})} as SerializedDrawing;check();
   try{const proof=Reflect.apply(common,host,[settled,projected,cache.owner,source]) as ()=>void;check();if(typeof proof!=='function')return false;proof();check();
    // Nit D: pin the native semantic slots from this receipt while native levels paint.
    const pinned=resolveFibLevelPresentationNativeOwner(proof,cache.owner,source);check();nativeLocal=pinned;check();return true;}
   catch(caught){if(retired)throw caught;check();return false;}
  };
  /** A just-created Fib painted on the top canvas (it starts above the series stack) renders
   * inside the native store commit, before the adapter's drawing:created listener saves its record. Absorbed only
   * within COMMIT_LAG_WINDOW_MS and only when the renderer copy binds the native model exactly (the record alone is
   * missing); the LV presentation is withheld for that frame. */
  const creationLag=():boolean=>{
   const common=presentationBind;if(!common||cache.rows.has(target.id))return false;
   const id=String(target.id),key='created',now=performance.now();let lag=lags.get(id);
   if(!lag||lag.key!==key){lags.delete(id);lag={key,since:now};lags.set(id,lag);if(lags.size>64)lags.delete(lags.keys().next().value!);}
   if(!(now-lag.since>=0&&now-lag.since<=COMMIT_LAG_WINDOW_MS))return false;
   check();
   try{const proof=Reflect.apply(common,host,[projected,projected,cache.owner,source]) as ()=>void;check();if(typeof proof!=='function')return false;proof();check();
    nativeLocal=resolveFibLevelPresentationNativeOwner(proof,cache.owner,source);check();return true;}
   catch(caught){if(retired)throw caught;check();return false;}
  };
  if(target.mode!=='placing'){
   if(!presentation)bindNative();
   else try{bindNative();if(target.mode==='committed')lags.delete(String(target.id));}catch(error){if(retired||target.mode!=='committed')throw error;check();if(!geometryLag(error)){if(!(error instanceof Error)||!DIVERGENCE.includes(error.message))throw error;diverged(String(target.id),error);}unbound=error;}
  }
  const note=(error:unknown)=>{try{check();const message=('Fibonacci trend line unavailable: '+String(error)).slice(0,700);check();if(!notices.some(value=>value.row.message===message)){notices.push({row:{code:'FIB_TREND_LINE_UNAVAILABLE',feature:'Fibonacci trend line',severity:'unavailable',message},proof:()=>{installed();source();cache.canonical();installed();}});if(notices.length>16)notices.shift();}}catch{/* Retired operations cannot diagnose a replacement. */}};
  return{check,local,state,projected,props,note,unbound};
 }
 function geometry(target:OwnedFibTrendLineTarget,projector:Data,check:()=>void){
  const call=(key:string,args:unknown[])=>{check();const fn=method(projector,key);check();const result=Reflect.apply(fn,projector,args);check();return result;};
  const rect=call('paneRect',[target.paneId]);if(!rect)return;const top=own(rect,'top'),height=own(rect,'height');if(!Number.isFinite(top)||!Number.isFinite(height)||!Number.isFinite(top+height)||height<=0)return;
  const [a,b]=target.anchors,points={x1:call('xOf',[a.time]),y1:call('yOf',[a.price,target.paneId]),x2:call('xOf',[b.time]),y2:call('yOf',[b.price,target.paneId])};if(Object.values(points).some(value=>typeof value!=='number'||!Number.isFinite(value)))throw Error('Fibonacci baseline endpoints unavailable.');check();return Object.freeze(points) as Readonly<{x1:number;y1:number;x2:number;y2:number}>;
 }
 function acquisitionIssue(target:OwnedFibTrendLineTarget,error:unknown){try{const cache=index;if(!cache)return;installed();target.assertCurrent();cache.source();cache.canonical();target.assertLocal();const message=('Fibonacci trend line unavailable: '+String(error)).slice(0,700);installed();target.assertCurrent();cache.source();cache.canonical();target.assertLocal();if(!notices.some(value=>value.row.message===message)){notices.push({row:{code:'FIB_TREND_LINE_UNAVAILABLE',feature:'Fibonacci trend line',severity:'unavailable',message},proof:()=>{installed();cache.source();cache.canonical();installed();}});if(notices.length>16)notices.shift();}}catch{/* Failed acquisition never adopts a fresh diagnostic owner. */}}
 const registration=registerOwnedFibTrendLine(renderer,{
  paintWithLevels(target,ctx,projector,_theme,stroke,invokeNative){
   const operation=prepare(target,true),withheld=operation.unbound!==undefined;
   // Unbound: no LV background/text/baseline from data the saved record does not describe.
   const background:FibState<FibBackgroundSettings>=withheld?Object.freeze({state:'unavailable',message:FIB_PRESENTATION_WITHHELD}):readFibBackground(operation.props),text:FibState<FibTextSettings>=withheld?Object.freeze({state:'unavailable',message:FIB_PRESENTATION_WITHHELD}):readFibText(operation.props);operation.check();
   if(withheld)operation.note(operation.unbound);
   else if(operation.state.state==='unavailable')operation.note(Error(operation.state.message));
   else if(operation.state.settings.enabled){const points=geometry(target,projector,operation.check);if(points)paint(ctx,points,operation.state.settings,stroke,operation.check);}
   operation.check();if(!withheld){if(background.state==='unavailable')operation.note(Error(background.message));if(text.state==='unavailable')operation.note(Error(text.message));}operation.check();
   Reflect.apply(invokeNative,target,[{background,text,layout:withheld?undefined:readFibLayout(operation.props),check:operation.check,local:operation.local,note:operation.note}]);operation.check();
  },
  paint(target,ctx,projector,stroke){let operation:ReturnType<typeof prepare>|undefined;try{operation=prepare(target);if(operation.state.state==='unavailable')throw Error(operation.state.message);if(!operation.state.settings.enabled)return;const points=geometry(target,projector,operation.check);if(!points)return;paint(ctx,points,operation.state.settings,stroke,operation.check);operation.check();}catch(error){if(operation)operation.note(error);else acquisitionIssue(target,error);}},
  hit(target,projector):FibTrendLineHitLease|undefined{let operation:ReturnType<typeof prepare>|undefined;try{operation=prepare(target);if(operation.state.state==='unavailable')throw Error(operation.state.message);if(!operation.state.settings.enabled)return;const points=geometry(target,projector,operation.check);if(!points)return;let active=true;const op=operation,lease: FibTrendLineHitLease=Object.freeze({points,assertCurrent(){if(this!==lease||!active)throw Error('Fibonacci hit lease retired.');op.check();},assertLocal(){if(this!==lease||!active)throw Error('Fibonacci hit lease retired.');op.local();},dispose(){if(this!==lease)throw Error('Fibonacci hit lease receiver changed.');active=false;}});return lease;}catch(error){if(operation)operation.note(error);else acquisitionIssue(target,error);return;}}
 });
 return Object.freeze({diagnostics(){return notices.filter(value=>{try{value.proof();return true;}catch{return false;}}).map(value=>({...value.row}));},invalidate(){installed();index=undefined;registration.invalidate();},dispose(){if(!live)return;live=false;index=undefined;lags.clear();for(const timer of resyncs.values())clearTimeout(timer);resyncs.clear();previewAnchors.clear();registration.dispose();notices.length=0;}});
}
function paint(ctx:CanvasRenderingContext2D,points:Readonly<{x1:number;y1:number;x2:number;y2:number}>,settings:Readonly<FibTrendLineSettings>,stroke:Function,check:()=>void){
 const call=(key:string,args:unknown[])=>{check();const fn=method(ctx,key);check();const result=Reflect.apply(fn,ctx,args);check();return result;};
 check();const restore=method(ctx,'restore');check();const save=method(ctx,'save');check();const view:Data={};
 for(const key of ['setLineDash','beginPath','moveTo','lineTo','stroke'])view[key]=(...args:unknown[])=>call(key,args);
 for(const key of ['strokeStyle','lineWidth'])Object.defineProperty(view,key,{set(value){check();if(!Reflect.set(ctx,key,value,ctx))throw Error('Fibonacci baseline canvas state unavailable.');check();}});
 let attempted=false,problem:unknown;
 try{check();attempted=true;Reflect.apply(save,ctx,[]);check();Reflect.apply(stroke,undefined,[view,{lineColor:settings.color,lineWidth:settings.width,lineStyle:settings.style},()=>{view.moveTo(points.x1,points.y1);view.lineTo(points.x2,points.y2);}]);check();}
 catch(error){problem=error;}finally{if(attempted)try{Reflect.apply(restore,ctx,[]);}catch(cleanup){problem=problem===undefined?cleanup:new AggregateError([problem,cleanup],'Fibonacci baseline and canvas cleanup failed.');}}
 if(problem!==undefined)throw problem;check();
}
