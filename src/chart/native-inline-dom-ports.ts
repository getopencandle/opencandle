import {NativeRenderer} from '@luxalgo/vela';
import type {InlineViewport} from './trendline-inline-geometry';

type Data=Record<string,any>;
interface Slot{owner:object;receiver:object;inherited:boolean;key:string;field:PropertyDescriptor}
function slot(owner:object,key:string,inherited=false):Slot{for(let object:object|null=owner;object;object=inherited?Object.getPrototypeOf(object):null){const field=Object.getOwnPropertyDescriptor(object,key);if(field){if(!Object.hasOwn(field,'value'))throw Error('Inline DOM requires data ownership: '+key);return{owner:object,receiver:owner,inherited,key,field};}}throw Error('Inline DOM field unavailable: '+key);}
function value(owner:object,key:string){return slot(owner,key).field.value;}
function method(owner:object,key:string){const result=slot(owner,key,true);if(typeof result.field.value!=='function')throw Error('Inline DOM method unavailable: '+key);return result;}
function same(before:Slot){const resolved=slot(before.receiver,before.key,before.inherited),after=resolved.field;if(resolved.owner!==before.owner||after.value!==before.field.value||after.writable!==before.field.writable||after.configurable!==before.field.configurable||after.enumerable!==before.field.enumerable)throw Error('Inline DOM ownership changed: '+before.key);}
export interface NativeInlineDOMPorts{readonly surface:HTMLCanvasElement;readonly overlayHost:HTMLElement;assertCurrent():void;readViewport():InlineViewport;canEnter():boolean;repaint():void}
const size=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
function aligned(style:Record<string,string>){
 if(style.perspective&&style.perspective!=='none')throw Error('Inline DOM perspective is unavailable');
 if(style.rotate&&style.rotate!=='none'&&!/^0(?:deg|rad|turn)?$/.test(style.rotate))throw Error('Inline DOM CSS rotation is unavailable');
 if(style.scale&&style.scale!=='none'){const parts=style.scale.trim().split(/\s+/).map(Number);if(parts.length>2||parts.some(value=>!Number.isFinite(value)||value<=0))throw Error('Inline DOM CSS scale is unavailable');}
 if(style.translate&&style.translate!=='none'){const parts=style.translate.trim().split(/\s+/);if(parts.length>2||parts.some(value=>!/^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?(?:px|%)?$/.test(value)))throw Error('Inline DOM CSS translation is unavailable');}
 if(style.transform&&style.transform!=='none'){const match=/^matrix\(([^)]+)\)$/.exec(style.transform);if(!match)throw Error('Inline DOM transform is unavailable');const numbers=match[1].split(',').map(Number);if(numbers.length!==6||numbers.some(value=>!Number.isFinite(value))||numbers[0]<=0||numbers[3]<=0||numbers[1]!==0||numbers[2]!==0)throw Error('Inline DOM requires a positive axis-aligned transform');}
 if(style.zoom&&style.zoom!=='normal'){const number=Number(style.zoom.replace('%',''))/(style.zoom.endsWith('%')?100:1);if(!Number.isFinite(number)||number<=0)throw Error('Inline DOM zoom is unavailable');}
}

/** Native full-canvas input ports. Axis gutters are not compressed into coords' data extent. */
export function captureNativeInlineDOMPorts(renderer:NativeRenderer,assertSource:()=>void):NativeInlineDOMPorts{
 if(!(renderer instanceof NativeRenderer)||typeof assertSource!=='function')throw Error('Inline DOM requires an owned native renderer/source');assertSource();
 const surface=value(renderer,'dataCanvas') as HTMLCanvasElement,overlayHost=value(renderer,'plot') as HTMLElement,controller=value(renderer,'userDrawings') as Data,coords=value(renderer,'coords') as Data,input=value(renderer,'input') as Data,canvas=value(controller,'canvas') as HTMLCanvasElement,interaction=value(controller,'interaction') as Data,popup=value(controller,'popup') as Data;
 const slots=[slot(renderer,'dataCanvas'),slot(renderer,'plot'),slot(renderer,'userDrawings'),slot(renderer,'coords'),slot(renderer,'input'),slot(controller,'canvas'),slot(controller,'interaction'),slot(controller,'popup')],nativeIsOpen=method(popup,'isOpen'),paintData=method(renderer,'paintData');
 if(paintData.field.value!==Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'paintData')?.value)throw Error('Inline DOM full painter is not the pinned native method');slots.push(nativeIsOpen,paintData);
 let retired=false,busy=false,ports:NativeInlineDOMPorts;
 const pure=()=>{if(retired)throw Error('Inline DOM ports retired');for(const member of slots)same(member);};
 const check=()=>{try{pure();assertSource();pure();}catch(error){retired=true;throw error;}};
 const external=<T>(action:()=>T):T=>{check();const result=action();check();return result;};
 const admitFullPaint=()=>{
  const bars=value(renderer,'bars'),layers=value(renderer,'extLayers');
  if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||!Array.isArray(layers)||Object.getPrototypeOf(layers)!==Array.prototype||value(layers,'length')!==0)throw Error('Inline full paint requires the admitted native pipeline without external layers');
  const pins=[slot(renderer,'bars'),slot(renderer,'extLayers'),slot(bars,'length'),slot(layers,'length')],length=value(bars,'length');
  if(length){const last=value(bars,String(length-1));if(!last||typeof last!=='object')throw Error('Inline full paint last bar unavailable');pins.push(slot(bars,String(length-1)));for(const key of ['time','high','low','close'])pins.push(slot(last,key));for(const key of ['liveEaseTime','liveEaseHigh','liveEaseLow','liveEaseClose'])pins.push(slot(renderer,key));
   const sameTime=value(last,'time')===value(renderer,'liveEaseTime'),sameValues=value(last,'high')===value(renderer,'liveEaseHigh')&&value(last,'low')===value(renderer,'liveEaseLow')&&value(last,'close')===value(renderer,'liveEaseClose');
   if(sameTime&&!sameValues)throw Error('Inline full paint is unavailable while a live-easing row substitution is active');
  }
  return()=>{check();for(const pin of pins)same(pin);check();};
 };
 const doc=external(()=>surface.ownerDocument),window=external(()=>doc?.defaultView);if(!surface||!overlayHost||!canvas||!doc||!window)throw Error('Inline DOM document unavailable');
 const getStyle=method(window,'getComputedStyle'),surfaceRect=method(surface,'getBoundingClientRect'),hostRect=method(overlayHost,'getBoundingClientRect');slots.push(getStyle,surfaceRect,hostRect);
 const parent=external(()=>overlayHost.parentNode);
 const assertNodes=()=>{check();if(external(()=>surface.ownerDocument)!==doc||external(()=>overlayHost.ownerDocument)!==doc||external(()=>canvas.ownerDocument)!==doc||external(()=>doc.defaultView)!==window||external(()=>surface.parentNode)!==overlayHost||external(()=>canvas.parentNode)!==overlayHost||external(()=>overlayHost.parentNode)!==parent||!external(()=>surface.isConnected)||!external(()=>overlayHost.isConnected))throw Error('Inline DOM node lifetime changed');};
 function run<T>(action:()=>T){if(busy)throw Error('Inline DOM operation reentered');busy=true;try{assertNodes();return action();}finally{busy=false;}}
 const rect=(node:HTMLElement,entry:Slot)=>{const raw=external(()=>Reflect.apply(entry.field.value,node,[])) as DOMRect;const result={left:external(()=>raw.left) as number,top:external(()=>raw.top) as number,width:external(()=>raw.width) as number,height:external(()=>raw.height) as number};if(!Object.values(result).every(Number.isFinite)||result.width<=0||result.height<=0)throw Error('Inline DOM positive rectangle unavailable');return result;};
 const ancestors=()=>{const result:Element[]=[];let node:Element|null=surface;while(node){if(result.length>=64||result.includes(node))throw Error('Inline DOM ancestor bound exceeded');result.push(node);node=external(()=>node!.parentElement);}return result;};
 const styles=(nodes:Element[])=>nodes.map(node=>{const raw=external(()=>Reflect.apply(getStyle.field.value,window,[node])) as CSSStyleDeclaration,state:Record<string,string>={};for(const key of ['transform','rotate','scale','translate','perspective','zoom','width','height','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth']){const value=external(()=>Reflect.get(raw,key,raw));if(value!==undefined&&typeof value!=='string')throw Error('Inline DOM computed style unavailable');state[key]=value??'';}aligned(state);return state;});
 ports=Object.freeze({surface,overlayHost,
  assertCurrent(){if(this!==ports)throw Error('Inline DOM receiver changed');run(()=>{});},
  readViewport(){if(this!==ports)throw Error('Inline DOM receiver changed');return run(()=>{
   const chain=ancestors(),beforeStyles=styles(chain),surfaceBox=rect(surface,surfaceRect),plotBox=rect(overlayHost,hostRect),dpr=value(coords,'devicePixelRatio'),width=external(()=>surface.width),height=external(()=>surface.height),plotWidth=external(()=>overlayHost.clientWidth),plotHeight=external(()=>overlayHost.clientHeight);
   if(![dpr,width,height,plotWidth,plotHeight].every(number=>typeof number==='number'&&Number.isFinite(number)&&number>0))throw Error('Inline DOM dimensions unavailable');
   const logicalWidth=width/dpr,logicalHeight=height/dpr,sx=surfaceBox.width/logicalWidth,sy=surfaceBox.height/logicalHeight,close=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));
   const cssSize=(state:Record<string,string>,key:string)=>{const text=state[key];if(!/^\d+(?:\.\d+)?px$/.test(text))throw Error('Inline DOM CSS box dimensions unavailable');const number=Number(text.slice(0,-2));if(!Number.isFinite(number)||number<=0)throw Error('Inline DOM CSS positive box dimensions unavailable');return number;},surfaceStyle=beforeStyles[0],plotStyle=beforeStyles[chain.indexOf(overlayHost)];
   if(!plotStyle||[surfaceStyle,plotStyle].some(state=>['paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth'].some(key=>state[key]!=='0px')))throw Error('Inline DOM canvas/plot padding or border unavailable');
   if(!close(cssSize(surfaceStyle,'width'),logicalWidth)||!close(cssSize(surfaceStyle,'height'),logicalHeight)||!close(surfaceBox.left,plotBox.left)||!close(surfaceBox.top,plotBox.top)||!close(sx,plotBox.width/cssSize(plotStyle,'width'))||!close(sy,plotBox.height/cssSize(plotStyle,'height')))throw Error('Inline DOM canvas/plot origin or scale alignment unavailable');
   const afterChain=ancestors(),afterStyles=styles(afterChain),afterSurface=rect(surface,surfaceRect),afterPlot=rect(overlayHost,hostRect);assertNodes();if(chain.length!==afterChain.length||chain.some((node,index)=>node!==afterChain[index])||JSON.stringify(beforeStyles)!==JSON.stringify(afterStyles)||JSON.stringify(surfaceBox)!==JSON.stringify(afterSurface)||JSON.stringify(plotBox)!==JSON.stringify(afterPlot)||external(()=>surface.width)!==width||external(()=>surface.height)!==height||external(()=>overlayHost.clientWidth)!==plotWidth||external(()=>overlayHost.clientHeight)!==plotHeight||value(coords,'devicePixelRatio')!==dpr)throw Error('Inline DOM viewport changed while captured');
   const result=Object.freeze({...surfaceBox,logicalWidth,logicalHeight,axisAligned:true});if(!Object.values(result).every(value=>typeof value!=='number'||Number.isFinite(value)))throw Error('Inline DOM viewport output unavailable');check();return result;
  });},
  canEnter(){if(this!==ports)throw Error('Inline DOM receiver changed');return run(()=>{const open=external(()=>Reflect.apply(nativeIsOpen.field.value,popup,[])),touches=value(input,'touches');if(!(touches instanceof Map)||Object.getPrototypeOf(touches)!==Map.prototype)throw Error('Inline DOM touch ownership unavailable');const state=value(interaction,'state');return value(input,'el')===surface&&value(input,'drawings')===true&&value(input,'dragging')===false&&Reflect.apply(size,touches,[])===0&&value(state,'kind')==='idle'&&value(controller,'activeTool')===null&&value(controller,'measureMode')===false&&value(controller,'eraserMode')===false&&value(controller,'textEditor')===null&&open===false;});},
  // renderFrame/flushNow deliberately skip active animation; direct native paintData
  // rebuilds both interleaved caches and the top drawing layer at the settled layout.
  repaint(){if(this!==ports)throw Error('Inline DOM receiver changed');return run(()=>{const assertPaint=admitFullPaint();assertPaint();Reflect.apply(paintData.field.value,renderer,[]);assertPaint();assertNodes();});}
 });assertNodes();return ports;
}
