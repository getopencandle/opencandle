import type {NativeRenderer,SerializedDrawing} from '@luxalgo/vela';
import {acquireOwnedTrendlineLabels,OWNED_TRENDLINE_STRUCTURAL_WORK,type OwnedTrendlineLabelAccessHost,type OwnedTrendlineLabelEnvironment,type OwnedTrendlineLabelTarget} from './trendline-annotation';
import {supportedColor} from './color-validation';

export const TRENDLINE_INLINE_LIMITS={textUnits:20000,lines:20001,glyphCommands:40002,operations:100032,structuralWork:OWNED_TRENDLINE_STRUCTURAL_WORK} as const;
export type InlineMatrix=readonly [number,number,number,number,number,number];
export interface InlinePoint{readonly x:number;readonly y:number}
export interface InlineBox{readonly left:number;readonly top:number;readonly right:number;readonly bottom:number}
export interface TrendlineInlineLine{
 readonly text:string;readonly x:number;readonly y:number;readonly font:string;
 readonly advanceWidth:number;readonly lineIndex:number;
 readonly matrix:InlineMatrix;readonly box:InlineBox;readonly fill:string;readonly halo:string;
}
export interface TrendlineInlineGeometry{
 readonly id:string;readonly width:number;readonly height:number;readonly dpr:number;
 readonly clip:InlineBox;readonly lines:readonly TrendlineInlineLine[];
 readonly textState:Readonly<Record<string,string|undefined>>;
 readonly glyphCommands:number;readonly operations:number;
 readonly frame?:{readonly font:string;readonly matrix:InlineMatrix;readonly x:number;readonly firstY:number;readonly lineCount:number;readonly lineHeight?:number;readonly alphabeticOffset?:number;readonly advanceWidths:readonly number[];readonly globalAlpha:number};
}
export interface TrendlineInlineTarget{readonly id:string}
export interface TrendlineInlineDescription{
 readonly target:TrendlineInlineTarget;readonly geometry?:TrendlineInlineGeometry;readonly unavailable?:string;
}
export interface TrendlineInlineSession{
 assertCurrent():void;
 layout(draft:string,options?:{typography?:boolean}):TrendlineInlineGeometry;
 dispose():void;
}
export interface TrendlineInlineGeometryHost extends OwnedTrendlineLabelAccessHost{
 /** Trusted isolated factory for controlled tests; default creates an unattached measurement canvas. */
 createMeasurementContext?():CanvasRenderingContext2D;
}
export interface TrendlineInlineGeometryController{
 targets():readonly TrendlineInlineDescription[];
 hit(plotX:number,plotY:number):TrendlineInlineTarget|null;
 open(target:TrendlineInlineTarget):TrendlineInlineSession;
 dispose():void;
}
const usedMeasurements=new WeakSet<object>();
const identity:InlineMatrix=[1,0,0,1,0,0];
function own(value:object,key:string):unknown{const field=Object.getOwnPropertyDescriptor(value,key);if(field&&!Object.hasOwn(field,'value'))throw Error('Inline geometry requires data callbacks: '+key);return field?.value;}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const part of Object.values(value))freeze(part);Object.freeze(value);}return value;}
function finite(...values:number[]){if(!values.every(Number.isFinite))throw Error('Inline geometry requires finite coordinates');}
function multiply(a:InlineMatrix,b:InlineMatrix):InlineMatrix{return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function transformInlinePoint(matrix:InlineMatrix,point:InlinePoint):InlinePoint{finite(...matrix,point.x,point.y);const result={x:matrix[0]*point.x+matrix[2]*point.y+matrix[4],y:matrix[1]*point.x+matrix[3]*point.y+matrix[5]};finite(result.x,result.y);return result;}
export function inverseInlinePoint(matrix:InlineMatrix,point:InlinePoint):InlinePoint{
 finite(...matrix,point.x,point.y);const det=matrix[0]*matrix[3]-matrix[1]*matrix[2];if(!Number.isFinite(det)||det===0)throw Error('Inline geometry transform is singular');const x=point.x-matrix[4],y=point.y-matrix[5];const result={x:(matrix[3]*x-matrix[2]*y)/det,y:(matrix[0]*y-matrix[1]*x)/det};finite(result.x,result.y);return result;
}
export interface InlineViewport{readonly left:number;readonly top:number;readonly width:number;readonly height:number;readonly logicalWidth:number;readonly logicalHeight:number;readonly axisAligned:boolean}
function viewport(value:InlineViewport){finite(value.left,value.top,value.width,value.height,value.logicalWidth,value.logicalHeight);if(!value.axisAligned||Math.min(value.width,value.height,value.logicalWidth,value.logicalHeight)<=0)throw Error('Inline viewport requires a measured axis-aligned positive box');}
export function clientToInlinePlot(point:InlinePoint,box:InlineViewport):InlinePoint{viewport(box);finite(point.x,point.y);const result={x:(point.x-box.left)*box.logicalWidth/box.width,y:(point.y-box.top)*box.logicalHeight/box.height};finite(result.x,result.y);return result;}
export function inlinePlotToClient(point:InlinePoint,box:InlineViewport):InlinePoint{viewport(box);finite(point.x,point.y);const result={x:box.left+point.x*box.width/box.logicalWidth,y:box.top+point.y*box.height/box.logicalHeight};finite(result.x,result.y);return result;}
function contains(box:InlineBox,point:InlinePoint){return point.x>=box.left&&point.x<=box.right&&point.y>=box.top&&point.y<=box.bottom;}
export function hitTrendlineInlineGeometry(geometry:TrendlineInlineGeometry,point:InlinePoint):boolean{
 finite(point.x,point.y);if(!contains(geometry.clip,point))return false;return geometry.lines.some(line=>contains(line.box,inverseInlinePoint(line.matrix,point)));
}
function alpha(color:string):number{
 if(!supportedColor(color))throw Error('Inline geometry color unavailable');const text=color.trim().toLowerCase();if(text==='transparent')return 0;
 if(text[0]==='#'){if(text.length===5)return parseInt(text[4]+text[4],16)/255;if(text.length===9)return parseInt(text.slice(7),16)/255;return 1;}
 const body=/^(?:rgba?|hsla?)\((.*)\)$/.exec(text)?.[1];if(!body)return 1;const parts=body.includes(',')?body.split(','):body.split('/');if(body.includes(',')?parts.length===4:parts.length===2){const value=parts[parts.length-1].trim();return Number(value.replace('%',''))/(value.endsWith('%')?100:1);}return 1;
}
interface State{matrix:InlineMatrix;font:string;textAlign:CanvasTextAlign;textBaseline:CanvasTextBaseline;lineJoin:CanvasLineJoin;lineWidth:number;fillStyle:string;strokeStyle:string;globalAlpha:number}
interface Glyph{kind:'fill'|'stroke';text:string;x:number;y:number;state:State}

/** Recording context delegates only isolated text-state/measurement operations, never drawing. */
function recorder(measure:CanvasRenderingContext2D,typography=false){
 let operations=0,glyphCommands=0,configured=false,environment:OwnedTrendlineLabelEnvironment|undefined,check=()=>{},state:State={matrix:identity,font:'',textAlign:'left',textBaseline:'alphabetic',lineJoin:'miter',lineWidth:1,fillStyle:'#000000',strokeStyle:'#000000',globalAlpha:1};
 const stack:State[]=[],glyphs:Glyph[]=[];
 // Pure recorder closures consume admitted primitives and private state only. Ownership is
 // checked at every external boundary; this synchronous local work never calls out or yields.
 function step(){if(++operations>TRENDLINE_INLINE_LIMITS.operations)throw Error('Inline geometry operation bound exceeded');}
 function delegated<T>(action:()=>T):T{step();check();const result=action();check();return result;}
 function textState(key:string,value:string){delegated(()=>Reflect.set(measure,key,value,measure));const actual=delegated(()=>Reflect.get(measure,key,measure));if(actual!==value)throw Error('Inline measurement state unsupported: '+key);}
 const object:Record<string,unknown>={
  configureOwnedLabel(value:OwnedTrendlineLabelEnvironment,assertCurrent:()=>void){if(configured)throw Error('Inline recorder cannot be reconfigured');configured=true;environment=value;check=assertCurrent;state.matrix=[value.dpr,0,0,value.dpr,0,0];state.globalAlpha=value.globalAlpha;
   if(!['ltr','rtl'].includes(value.textState.direction??''))throw Error('Inline measurement direction unavailable');
   for(const[key,setting]of Object.entries(value.textState)){if(setting!==undefined)textState(key,setting);else if(delegated(()=>Reflect.get(measure,key,measure))!==undefined)throw Error('Inline paint/measurement capability mismatch: '+key);}
  },
  save(){step();stack.push({...state});},
  restore(){step();const previous=stack.pop();if(!previous)throw Error('Inline recorder restore is unbalanced');state=previous;},
  translate(x:number,y:number){step();finite(x,y);state.matrix=multiply(state.matrix,[1,0,0,1,x,y]);},
  rotate(angle:number){step();finite(angle);state.matrix=multiply(state.matrix,[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0]);},
  fillText(text:string,x:number,y:number){glyph('fill',text,x,y);},
  strokeText(text:string,x:number,y:number){glyph('stroke',text,x,y);}
 };
 function glyph(kind:Glyph['kind'],text:string,x:number,y:number){step();if(++glyphCommands>TRENDLINE_INLINE_LIMITS.glyphCommands)throw Error('Inline geometry glyph bound exceeded');if(typeof text!=='string'||text.length>TRENDLINE_INLINE_LIMITS.textUnits)throw Error('Inline glyph text unavailable');finite(x,y,...state.matrix);glyphs.push({kind,text,x,y,state:{...state,matrix:[...state.matrix] as InlineMatrix}});}
 for(const key of ['font','textAlign','textBaseline','lineJoin','lineWidth','fillStyle','strokeStyle','globalAlpha'] as const)Object.defineProperty(object,key,{get(){step();return state[key];},set(value:never){step();if(['lineWidth','globalAlpha'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Inline numeric paint state unavailable');}else if(typeof value!=='string')throw Error('Inline paint state unavailable');
  if(['font','textAlign','textBaseline'].includes(key)){delegated(()=>Reflect.set(measure,key,value,measure));const resolved=delegated(()=>Reflect.get(measure,key,measure));if(key!=='font'&&resolved!==value||typeof resolved!=='string'||!resolved)throw Error('Inline measurement text state unavailable');(state as any)[key]=resolved;}else(state as any)[key]=value;
 }});
 const proxy=new Proxy(object,{get(target,key,receiver){if(!Object.hasOwn(target,key))throw Error('Unrecognized inline recorder operation: '+String(key));return Reflect.get(target,key,receiver);},set(target,key,value,receiver){if(!Object.hasOwn(target,key))throw Error('Unrecognized inline recorder state: '+String(key));return Reflect.set(target,key,value,receiver);}});
 return{context:proxy as unknown as CanvasRenderingContext2D,finish(id:string):TrendlineInlineGeometry{
  if(!environment||stack.length)throw Error('Inline native recorder did not complete');check();const fills=glyphs.filter(glyph=>glyph.kind==='fill'),strokes=glyphs.filter(glyph=>glyph.kind==='stroke');if(fills.length>TRENDLINE_INLINE_LIMITS.lines||strokes.length!==fills.length)throw Error('Inline native line/halo shape unavailable');
  const lines:TrendlineInlineLine[]=[],advanceWidths:number[]=[];
  for(let index=0;index<fills.length;index++){const glyph=fills[index],halo=strokes[index],s=glyph.state;if(glyph.text!==halo.text||glyph.x!==halo.x||glyph.y!==halo.y||JSON.stringify(s.matrix)!==JSON.stringify(halo.state.matrix))throw Error('Inline native line/halo correspondence changed');if(!glyph.text){advanceWidths.push(0);continue;}
   textState('font',s.font);textState('textAlign',s.textAlign);textState('textBaseline',s.textBaseline);
   const measureText=delegated(()=>measure.measureText);if(typeof measureText!=='function')throw Error('Inline text measurement method unavailable');
   const metrics=delegated(()=>Reflect.apply(measureText,measure,[glyph.text])),metric=(key:keyof TextMetrics)=>delegated(()=>Reflect.get(metrics,key,metrics)) as number;
   const left=metric('actualBoundingBoxLeft'),right=metric('actualBoundingBoxRight'),ascent=metric('actualBoundingBoxAscent'),descent=metric('actualBoundingBoxDescent'),width=metric('width');finite(left,right,ascent,descent,width);
   advanceWidths.push(width);if(!glyph.text.trim())continue;
   const fillAlpha=s.globalAlpha*alpha(s.fillStyle),haloAlpha=halo.state.globalAlpha*alpha(halo.state.strokeStyle);if(fillAlpha<=0&&haloAlpha<=0)continue;if(left+right<=0||ascent+descent<=0)throw Error('Inline ink metrics unavailable');
   const expand=haloAlpha>0?halo.state.lineWidth/2:0,matrix=s.matrix.map(value=>value/environment!.dpr) as unknown as InlineMatrix;finite(...matrix);inverseInlinePoint(matrix,{x:0,y:0});
   const box={left:glyph.x-left-expand,right:glyph.x+right+expand,top:glyph.y-ascent-expand,bottom:glyph.y+descent+expand};finite(box.left,box.right,box.top,box.bottom);
   lines.push({text:glyph.text,x:glyph.x,y:glyph.y,font:s.font,matrix,box,fill:s.fillStyle,halo:halo.state.strokeStyle,advanceWidth:width,lineIndex:index});
  }
  let frame:TrendlineInlineGeometry['frame'];
  if(fills.length){const first=fills[0],matrix=first.state.matrix.map(value=>value/environment!.dpr) as unknown as InlineMatrix,lineHeight=fills.length>1?fills[1].y-first.y:undefined;finite(...matrix,first.x,first.y);if(lineHeight!==undefined&&(!Number.isFinite(lineHeight)||lineHeight<=0))throw Error('Inline native line height unavailable');let alphabeticOffset:number|undefined;
   if(typography){textState('font',first.state.font);textState('textAlign',first.state.textAlign);const ascent=(baseline:CanvasTextBaseline)=>{textState('textBaseline',baseline);const method=delegated(()=>measure.measureText);if(typeof method!=='function')throw Error('Inline text measurement method unavailable');const metrics=delegated(()=>Reflect.apply(method,measure,['Mg']));return delegated(()=>Reflect.get(metrics,'actualBoundingBoxAscent',metrics)) as number;};const top=ascent('top'),alphabetic=ascent('alphabetic');alphabeticOffset=alphabetic-top;finite(top,alphabetic,alphabeticOffset);textState('textBaseline','top');}
   frame={font:first.state.font,matrix,x:first.x,firstY:first.y,lineCount:fills.length,lineHeight,alphabeticOffset,advanceWidths,globalAlpha:first.state.globalAlpha};
  }
  check();const result=freeze({id,width:environment.width,height:environment.height,dpr:environment.dpr,clip:environment.clip,lines,textState:environment.textState,glyphCommands,operations,...(frame?{frame}:{})});check();return result;
 }};
}

/** Standalone geometry/session capability. It never publishes or mutates a native drawing. */
export function installOwnedTrendlineInlineGeometry(renderer:NativeRenderer,host:TrendlineInlineGeometryHost):TrendlineInlineGeometryController{
 const factory=own(host,'createMeasurementContext');if(factory!==undefined&&typeof factory!=='function')throw Error('Inline measurement factory must be a data callback');
 const access=acquireOwnedTrendlineLabels(renderer,host);let measure:CanvasRenderingContext2D|undefined;
 try{measure=factory?Reflect.apply(factory,host,[]):document.createElement('canvas').getContext('2d')??undefined;if(!measure||usedMeasurements.has(measure))throw Error('Inline measurement context must be privately owned');access.assertMeasurementContext(measure);usedMeasurements.add(measure);}catch(error){try{access.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Inline geometry installation cleanup failed');}throw error;}
 const measurement=measure;
 let active=true,busy=false,current:{session:TrendlineInlineSession;retire:()=>void}|undefined;
 interface Target{source:OwnedTrendlineLabelTarget;record:Readonly<SerializedDrawing>;ordinal:number;token:TrendlineInlineTarget}
 const targets=new WeakMap<object,Target>(),bySource=new WeakMap<object,Target>();let controller:TrendlineInlineGeometryController;
 const base=()=>{if(!active||own(host,'createMeasurementContext')!==factory)throw Error('Inline geometry installation retired or changed');access.assertMeasurementContext(measurement);};
 const exclusive=<T>(action:()=>T):T=>{base();if(busy)throw Error('Inline geometry operation reentered');busy=true;try{return access.withBudget(action);}finally{busy=false;}};
 function resolve(token:TrendlineInlineTarget){const target=token&&typeof token==='object'?targets.get(token):undefined;if(!target)throw Error('Inline target is not privately owned');access.assertCurrent(target.source);return target;}
 function layout(target:Target,draft:string,options?:{typography?:boolean}){
  if(typeof draft!=='string'||draft.length>TRENDLINE_INLINE_LIMITS.textUnits)throw Error('Inline draft exceeds the 20000 UTF-16-unit bound');
  let typography=false;if(options!==undefined){if(!options||Object.getPrototypeOf(options)!==Object.prototype||Reflect.ownKeys(options).some(key=>key!=='typography'))throw Error('Inline layout options require bounded plain data');const selected=own(options,'typography');if(selected!==undefined&&typeof selected!=='boolean')throw Error('Inline typography option unavailable');typography=selected===true;}
  // No native default is silently substituted for sparse or unrecognized persisted formatting.
  if(!target.record.text||!['tiny','small','normal','large','huge'].includes(target.record.text.size??''))throw Error('Inline native font geometry unavailable');
  access.assertCurrent(target.source);const recording=recorder(measurement,typography);access.probe(target.source,draft,recording.context);access.assertCurrent(target.source);const geometry=recording.finish(target.record.id);access.assertCurrent(target.source);return geometry;
 }
 controller=Object.freeze({
  targets(){if(this!==controller)throw Error('Inline geometry receiver changed');return exclusive(()=>{const output:TrendlineInlineDescription[]=[];for(const source of access.targets()){
   let target=bySource.get(source);if(!target){const data=access.describe(source),token=Object.freeze({id:source.id});target={source,record:data.record,ordinal:data.ordinal,token};bySource.set(source,target);targets.set(token,target);}
   try{output.push(Object.freeze({target:target.token,geometry:layout(target,target.record.text?.value??'')}));}catch(error){access.assertCurrent(source);output.push(Object.freeze({target:target.token,unavailable:String(error)}));}
  }return Object.freeze(output);});},
  hit(plotX:number,plotY:number){if(this!==controller)throw Error('Inline geometry receiver changed');finite(plotX,plotY);const descriptions=controller.targets();for(let index=descriptions.length-1;index>=0;index--){const value=descriptions[index];if(value.geometry&&hitTrendlineInlineGeometry(value.geometry,{x:plotX,y:plotY})){access.assertCurrent(resolve(value.target).source);return value.target;}}return null;},
  open(token:TrendlineInlineTarget){if(this!==controller)throw Error('Inline geometry receiver changed');return exclusive(()=>{if(current)throw Error('Inline session already open');const target=resolve(token),geometry=layout(target,target.record.text?.value??'');if(!geometry.lines.length)throw Error('Inline entry requires visible accepted text');
   let live=true,unmute=access.mute(target.source);const assert=()=>{base();if(!live||current?.session!==session)throw Error('Inline session retired');access.assertCurrent(target.source);};
   const retire=()=>{if(!live)return;live=false;const release=unmute;unmute=()=>{};release();if(current?.session===session)current=undefined;};
   const session:TrendlineInlineSession=Object.freeze({assertCurrent(){if(this!==session)throw Error('Inline session receiver changed');try{assert();}catch(error){retire();throw error;}},layout(draft:string,options?:{typography?:boolean}){if(this!==session)throw Error('Inline session receiver changed');return exclusive(()=>{try{assert();const result=layout(target,draft,options);assert();return result;}catch(error){try{access.assertCurrent(target.source);}catch{retire();}throw error;}});},dispose(){if(this!==session)throw Error('Inline session receiver changed');retire();}});
   current={session,retire};assert();return session;
  });},
  dispose(){if(this!==controller)throw Error('Inline geometry receiver changed');if(!active)return;active=false;const failures:unknown[]=[];try{current?.retire();}catch(error){failures.push(error);}try{access.dispose();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Inline geometry cleanup failed');}
 });return controller;
}
