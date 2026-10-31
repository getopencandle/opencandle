import {composeFibBackgroundAlpha,placeFibCustomText,placeFibLabelBlock,type FibBackgroundSettings,type FibLayoutSettings,type FibTextSettings,type FibState} from './fib-level-presentation-data';

type Data=Record<string,any>;
interface Pin {root:object;key:string;path:{owner:object;prototype:object|null;descriptor?:PropertyDescriptor}[];value:Function}
function method(root:object,key:string):Pin{
 const path:Pin['path']=[];
 for(let owner:object|null=root;owner;owner=Object.getPrototypeOf(owner)){
  const descriptor=Object.getOwnPropertyDescriptor(owner,key);path.push({owner,prototype:Object.getPrototypeOf(owner),descriptor});
  if(path.length>32)throw Error('Fibonacci paint provider bound exceeded.');
  if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Fibonacci paint requires a data method.');return{root,key,path,value:descriptor.value};}
 }
 throw Error('Fibonacci paint method unavailable.');
}
function pinned(pin:Pin){for(const row of pin.path){const d=Object.getOwnPropertyDescriptor(row.owner,pin.key),b=row.descriptor;if(Object.getPrototypeOf(row.owner)!==row.prototype||!!d!==!!b||d&&b&&(!Object.is(d.value,b.value)||d.get!==b.get||d.set!==b.set||d.enumerable!==b.enumerable||d.writable!==b.writable||d.configurable!==b.configurable))throw Error('Fibonacci paint provider changed.');}}
function property(root:object,key:string){
 const path:{owner:object;prototype:object|null;descriptor?:PropertyDescriptor}[]=[];
 for(let owner:object|null=root;owner;owner=Object.getPrototypeOf(owner)){
  const descriptor=Object.getOwnPropertyDescriptor(owner,key);path.push({owner,prototype:Object.getPrototypeOf(owner),descriptor});if(path.length>32)throw Error('Fibonacci canvas property bound exceeded.');
  if(descriptor){if(Object.hasOwn(descriptor,'value')&&owner!==root)throw Error('Fibonacci canvas requires owned data or native accessors.');
   const assert=()=>{for(const row of path){const d=Object.getOwnPropertyDescriptor(row.owner,key),b=row.descriptor;if(Object.getPrototypeOf(row.owner)!==row.prototype||!!d!==!!b||d&&b&&(Object.hasOwn(d,'value')!==Object.hasOwn(b,'value')||d.get!==b.get||d.set!==b.set||d.writable!==b.writable||d.enumerable!==b.enumerable||d.configurable!==b.configurable))throw Error('Fibonacci canvas property provider changed.');}};
   return{assert,read(){assert();return Object.hasOwn(descriptor,'value')?Object.getOwnPropertyDescriptor(root,key)!.value:descriptor.get?Reflect.apply(descriptor.get,root,[]):undefined;},write(value:unknown){assert();if(Object.hasOwn(descriptor,'value')){if(!Reflect.set(root,key,value,root))throw Error('Fibonacci canvas data write failed.');}else if(descriptor.set)Reflect.apply(descriptor.set,root,[value]);else throw Error('Fibonacci canvas property is not writable.');assert();}};
  }
 }
 throw Error('Fibonacci canvas property unavailable.');
}
function own(object:object,key:string){const field=Object.getOwnPropertyDescriptor(object,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Fibonacci paint requires own data.');return field.value;}
function rows(value:unknown,maximum:number):readonly Data[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)throw Error('Fibonacci paint requires bounded dense native output.');
 const result:Data[]=[];
 for(let i=0;i<value.length;i++){
  const row=own(value,String(i));if(!row||typeof row!=='object'||Object.getPrototypeOf(row)!==Object.prototype)throw Error('Fibonacci native paint output must be plain.');
  const copy:Data={};for(const key of Reflect.ownKeys(row)){if(typeof key!=='string')throw Error('Fibonacci paint output has unknown providers.');const member=own(row,key);if(member!==undefined&&member!==null&&!['string','number','boolean'].includes(typeof member))throw Error('Fibonacci paint output must be primitive.');copy[key]=member;}result.push(Object.freeze(copy));
 }
 return Object.freeze(result);
}
type Step={operation:'call'|'set'|'get';key:string;values?:readonly unknown[];role?:'band-alpha'|'custom-align';output?:unknown};
function equivalent(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;if(!Array.isArray(a)||!Array.isArray(b)||Object.getPrototypeOf(a)!==Array.prototype||Object.getPrototypeOf(b)!==Array.prototype||a.length!==b.length||Reflect.ownKeys(a).length!==a.length+1||Reflect.ownKeys(b).length!==b.length+1)return false;
 for(let i=0;i<a.length;i++){const da=Object.getOwnPropertyDescriptor(a,String(i)),db=Object.getOwnPropertyDescriptor(b,String(i));if(!da||!db||!Object.hasOwn(da,'value')||!Object.hasOwn(db,'value')||!Object.is(da.value,db.value))return false;}return true;
}
const sizes:Readonly<Record<string,number>>=Object.freeze({tiny:10,small:12,normal:14,large:18,huge:28});
export interface FibLevelPresentationPaint {
 readonly background:FibState<FibBackgroundSettings>;
 readonly text:FibState<FibTextSettings>;
 /** DWB3 lvFibLayout. Only a supported (stored) member changes the picture; legacy or unavailable leaves the native layout. */
 readonly layout?:FibState<FibLayoutSettings>;
 readonly check:()=>void;
 readonly local:()=>void;
 readonly note:(error:unknown)=>void;
 /** Cheap per-operation source liveness (no graph walk). */
 readonly source?:()=>void;
}
/** Only the annotation-owned synchronous invocation supplies the actual model,
 * context and retained original method. This helper installs no authority and
 * never substitutes a live model or mutates the registered painter. */
export function paintFibLevelPresentation(painter:Data,original:Function,context:CanvasRenderingContext2D,model:Data,projector:Data,theme:Data,options:FibLevelPresentationPaint):void{
 let retired=false,forwarding=false;
 const check=()=>{if(retired)throw Error('Fibonacci presentation retired.');try{options.check();}catch(error){retired=true;throw error;}};
 check();
 // Legacy uses the same retained body and observable commands, through guarded
 // invocation-local views. Raw context delegation would skip callback tails.
 const entry=method(model,'entryLines'),bands=method(model,'fillBands'),stroke=method(painter,'stroke'),applyStroke=method(painter,'applyStroke'),themeFont=Object.getOwnPropertyDescriptor(theme,'fontFamily');check();
 if(!themeFont||!Object.hasOwn(themeFont,'value')||typeof themeFont.value!=='string')throw Error('Fibonacci theme font requires data.');
 const methods=new Map<string,Pin>();for(const key of ['save','restore','fillRect','setLineDash','beginPath','moveTo','lineTo','stroke','fillText'])methods.set(key,method(context,key));
 const properties=new Map<string,ReturnType<typeof property>>();for(const key of ['globalAlpha','fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline'])properties.set(key,property(context,key));
 const provider=()=>{pinned(entry);pinned(bands);pinned(stroke);pinned(applyStroke);for(const pin of methods.values())pinned(pin);for(const pin of properties.values())pin.assert();const d=Object.getOwnPropertyDescriptor(theme,'fontFamily');if(!d||!Object.is(d.value,themeFont.value)||d.get!==themeFont.get||d.set!==themeFont.set||d.enumerable!==themeFont.enumerable||d.writable!==themeFont.writable||d.configurable!==themeFont.configurable)throw Error('Fibonacci theme font changed.');};
 const guard=()=>{provider();check();provider();options.local();};
 const nativeCall=(pin:Pin,args:unknown[])=>{guard();const result=Reflect.apply(pin.value,pin.root,args);guard();return result;};
 const raw=nativeCall(entry,[projector]);
 const captured=raw===null?Object.freeze([]):rows(raw,10000);guard();
 if(!captured.length){const view=Object.freeze({entryLines:()=>captured});guard();Reflect.apply(original,painter,[context,view,projector,theme]);guard();return;}
 const resolvedBands=options.background.state==='unavailable'?Object.freeze([]):rows(nativeCall(bands,[projector]),9999);guard();
 const style=own(model,'style'),lineWidth=own(style,'lineWidth'),lineStyle=own(style,'lineStyle'),numbersSize=own(model,'numbersSize'),labelsSize=own(model,'labelsSize'),fontFamily=own(theme,'fontFamily');
 if(typeof lineWidth!=='number'||!Number.isFinite(lineWidth)||typeof lineStyle!=='string'||typeof fontFamily!=='string'||typeof numbersSize!=='string'||typeof labelsSize!=='string'||!Object.hasOwn(sizes,numbersSize)||!Object.hasOwn(sizes,labelsSize))throw Error('Fibonacci native font/style is unavailable.');
 const numFont=`${sizes[numbersSize]}px ${fontFamily}`,labelFont=`${sizes[labelsSize]}px ${fontFamily}`,width=Math.max(1,lineWidth),dash=lineStyle==='dotted'?[width,width*2]:lineStyle==='dashed'?[width*4,width*3]:[];
 const projected:Data[]=[],alignments:string[]=[];

 // lvFibLayout (supported member only) is applied here.
 const layout=options.layout?.state==='supported'?options.layout.settings:undefined,layoutSize=layout?layout.fontSize:undefined;
 const base:Data[]=captured.map(line=>({...line}));let bandRows:readonly Data[]=resolvedBands;
 if(layout?.logScale){
  // Log-scale levels (matches fibLevelPrice): level = exp(levelPrice(ratio, ln p1, ln p2)) through the model's own levelPrice.
  try{
   const anchors=own(model,'anchors'),levels=own(model,'levels'),paneId=own(model,'paneId');
   if(!Array.isArray(anchors)||anchors.length<2||!Array.isArray(levels))throw Error('Fibonacci log-scale levels are unavailable.');
   const enabled=levels.filter((level:Data)=>level&&level.enabled===true);
   if(enabled.length!==base.length)throw Error('Fibonacci log-scale levels do not match the resolved entries.');
   const p1=anchors[0].price,p2=anchors[1].price;
   if(!(Number.isFinite(p1)&&Number.isFinite(p2)&&p1>0&&p2>0))throw Error('Fibonacci log-scale levels need positive prices.');
   const levelPrice=method(model,'levelPrice'),levelText=method(model,'levelText'),yOf=method(projector,'yOf');
   const moved:Data[]=[];
   for(let i=0;i<base.length;i++){
    const ratio=enabled[i].ratio,price=Math.exp(nativeCall(levelPrice,[ratio,Math.log(p1),Math.log(p2)]) as number),y=nativeCall(yOf,[price,paneId]) as number;
    if(!Number.isFinite(price)||typeof y!=='number'||!Number.isFinite(y))throw Error('Fibonacci log-scale level is not finite.');
    const delta=y-base[i].y1;moved.push({...base[i],y1:y,y2:y,numberY:base[i].numberY+delta,labelY:typeof base[i].labelY==='number'?base[i].labelY+delta:base[i].labelY,numberText:String(nativeCall(levelText,[ratio,price])),ratio});
   }
   for(let i=0;i<base.length;i++)base[i]=moved[i];
   if(resolvedBands.length){const sorted=moved.slice().sort((a,b)=>a.ratio-b.ratio),rebuilt:Data[]=[];for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];rebuilt.push(Object.freeze({color:b.color,x:a.x1,y:Math.min(a.y1,b.y1),w:a.x2-a.x1,h:Math.abs(b.y1-a.y1)}));}bandRows=Object.freeze(rebuilt);}
  }catch(error){options.note(error);guard();}
 }
 const block=(line:Data,horz:'left'|'center'|'right',vert:'top'|'middle'|'bottom')=>{
  // The native context keeps a middle baseline, so a top/bottom block becomes its centre line.
  const b=placeFibLabelBlock({x1:line.x1,x2:line.x2,y:line.y1},horz,vert,layoutSize!),y=b.baseline==='bottom'?b.y-layoutSize!/2:b.baseline==='top'?b.y+layoutSize!/2:b.y;
  return{x:b.x,y,align:b.align as string};
 };
 for(let i=0;i<captured.length;i++){
  const line=base[i],copy={...line};
  for(const key of ['x1','y1','x2','y2','numberX','numberY']){const value=own(line,key);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Fibonacci native stroke or automatic-number geometry is unavailable. Coordinates must be finite.');}
  if(typeof own(line,'numberText')!=='string'||typeof own(line,'color')!=='string'||!['left','center','right'].includes(own(line,'numberAlign'))||line.label!==undefined&&typeof line.label!=='string')throw Error('Fibonacci entry text must be primitive.');
  if(options.text.state==='unavailable'||!options.text.settings.enabled)copy.label='';
  else if(copy.label){try{if(options.text.state==='supported'){const point=placeFibCustomText(line,options.text.settings.position);copy.labelX=point.x;copy.labelY=point.y;alignments[i]=point.align;}else{for(const key of ['labelX','labelY']){const value=own(line,key);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Fibonacci custom-text geometry is unavailable. Coordinates must be finite.');}}}catch(error){copy.label='';options.note(error);guard();}}
  if(layout){try{
   const label=block(line,layout.labelHorz,layout.labelVert);copy.numberX=label.x;copy.numberY=label.y;copy.numberAlign=label.align;
   if(copy.label){const custom=block(line,layout.textHorz,layout.textVert);copy.labelY=custom.y;if(options.text.state==='legacy'){copy.labelX=custom.x;alignments[i]=custom.align;}}
  }catch(error){options.note(error);guard();}}
  projected.push(Object.freeze(copy));
 }
 const steps:Step[]=[],call=(key:string,...values:unknown[])=>steps.push({operation:'call',key,values}),set=(key:string,value:unknown,role?:Step['role'],output?:unknown)=>steps.push({operation:'set',key,values:[value],role,output});
 for(const band of bandRows){for(const key of ['x','y','w','h']){const value=own(band,key);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Fibonacci native band geometry is unavailable. Coordinates must be finite.');}if(typeof own(band,'color')!=='string')throw Error('Fibonacci native band color must be primitive.');call('save');steps.push({operation:'get',key:'globalAlpha'});set('globalAlpha',undefined,'band-alpha');set('fillStyle',band.color);call('fillRect',band.x,band.y,band.w,band.h);call('restore');}
 set('textBaseline','middle');
 for(let i=0;i<projected.length;i++){
  const line=projected[i];set('strokeStyle',line.color);set('lineWidth',lineWidth);call('setLineDash',dash);call('beginPath');call('moveTo',line.x1,line.y1);call('lineTo',line.x2,line.y2);call('stroke');call('setLineDash',[]);set('fillStyle',line.color);set('font',numFont,undefined,layoutSize===undefined?undefined:`${layoutSize}px ${fontFamily}`);set('textAlign',line.numberAlign);call('fillText',line.numberText,line.numberX,line.numberY);
  if(line.label){set('font',labelFont,undefined,layoutSize===undefined?undefined:`${layoutSize}px ${fontFamily}`);set('textAlign','center','custom-align');call('fillText',line.label,line.labelX,line.labelY);}
 }
 set('textAlign','left');set('textBaseline','alphabetic');
 let cursor=0,incoming:number|undefined,customOrdinal=0,depth=0,entryUsed=false,bandsUsed=false;
 // The complete guard runs at frame entry,
 // around each native geometry call, both views, the native body entry and its
 // completion. Forwarded canvas operations keep the retirement flag, a cheap
 // source-liveness check (options.source: the frame source lease), their
 // provider pins and the exact operation-sequence match; the per-operation full
 // target re-proof is removed.
 const source=options.source,live=()=>{if(retired)throw Error('Fibonacci presentation retired.');if(source)try{source();}catch(error){retired=true;throw error;}};
 const consume=(operation:Step['operation'],key:string,values:readonly unknown[]=[])=>{live();const next=steps[cursor];if(!next||next.operation!==operation||next.key!==key||next.role!=='band-alpha'&&(next.values?.length??0)!==values.length||next.role!=='band-alpha'&&next.values?.some((value,i)=>!equivalent(value,values[i])))throw Error('Fibonacci native operation sequence changed.');cursor++;return next;};
 guard();
 const cleanup=methods.get('restore')!,canvas:Data={};
 const boundary=(action:()=>unknown)=>{if(forwarding){retired=true;throw Error('Fibonacci canvas forwarding reentered.');}forwarding=true;try{const value=action();live();return value;}catch(error){retired=true;throw error;}finally{forwarding=false;}};
 for(const [key,pin] of methods)canvas[key]=(...args:unknown[])=>boundary(()=>{consume('call',key,args);pinned(pin);if(key==='save')depth++;if(key==='restore')depth--;const result=Reflect.apply(pin.value,context,args);pinned(pin);return result;});
 for(const key of ['globalAlpha','fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline'])Object.defineProperty(canvas,key,{
  get(){return boundary(()=>{consume('get',key);const value=properties.get(key)!.read();if(key==='globalAlpha'){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('Fibonacci incoming alpha must be finite from0to1.');incoming=value;}return value;});},
  set(value){boundary(()=>{const step=consume('set',key,[value]);let output=value;
   if(step.output!==undefined)output=step.output;
   if(step.role==='band-alpha'){if(incoming===undefined||!Object.is(value,.06*incoming))throw Error('Fibonacci native alpha assignment changed.');output=options.background.state==='unavailable'?0:composeFibBackgroundAlpha(incoming,options.background.settings.opacity);incoming=undefined;}
   if(step.role==='custom-align'){while(customOrdinal<projected.length&&!projected[customOrdinal].label)customOrdinal++;output=alignments[customOrdinal]??'center';customOrdinal++;}
   properties.get(key)!.write(output);
  });}
 });
 const view=Object.freeze({entryLines(){guard();if(entryUsed)throw Error('Fibonacci entry view reused.');entryUsed=true;return Object.freeze(projected);},fillBands(){guard();if(!entryUsed||bandsUsed)throw Error('Fibonacci band view reused.');bandsUsed=true;return bandRows;},style:Object.freeze({lineWidth,lineStyle}),numbersSize,labelsSize});
 let failed=false,problem:unknown;
 try{guard();Reflect.apply(original,painter,[canvas,view,projector,Object.freeze({fontFamily})]);guard();if(cursor!==steps.length||depth!==0||!entryUsed||!bandsUsed)throw Error('Fibonacci native operation sequence incomplete.');}
 catch(error){retired=true;failed=true;problem=error;}
 finally{while(depth>0){depth--;try{Reflect.apply(cleanup.value,context,[]);}catch(error){problem=failed?new AggregateError([problem,error],'Fibonacci paint and canvas cleanup failed.'):error;failed=true;}}}
 if(failed)throw problem;guard();
}
