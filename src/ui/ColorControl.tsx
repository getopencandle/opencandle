import React,{useEffect,useRef,useState} from 'react';
import {supportedColor} from '../chart/color-validation';
import {parseColorValue,colorRGBHex,colorWithRGB,colorWithOpacity} from './color-value';
import './color-control.css';

export const LV_COLOR_PRESETS=['#ffffff','#b8c0cc','#7c8798','#455065','#1c2433','#000000','#eb5757','#ef8d52','#f2c94c','#92c95b','#27ae90','#39b6c6','#3d8edb','#6378df','#9564cf','#c65ba0'] as const;
interface Props {
 label:string;/** The picker's visible title when the accessible label is a field id. Absent: the label. */heading?:string;fieldKey:string;value:string;onChange:(value:string)=>boolean|void;
 ownerToken?:object;isCurrent?:()=>boolean;disabled?:boolean;automatic?:boolean;
 /** Existing parent-owned text inputs retain their draft and validation handlers. */
 children?:React.ReactNode;
}
interface Owner {token:object;field:string;value:string;revision:number;busy:boolean;open:boolean;popup:object|null;callback:Props['onChange'];context:Props['isCurrent'];disabled:boolean;automatic:boolean}
interface View {owner:Owner;open:boolean;raw:string|null;rawBase:string;opacity:string|null;opacityBase:string;error:string;left:number;top:number}
const initial=(owner:Owner):View=>({owner,open:false,raw:null,rawBase:owner.value,opacity:null,opacityBase:owner.value,error:'',left:8,top:8});

/** Shared draft control. It never creates a chart transaction or stores a palette. */
export function ColorControl({label,heading,fieldKey,value,onChange,ownerToken,isCurrent,disabled=false,automatic=false,children}:Props){
 const fallback=useRef({}),token=ownerToken??fallback.current,owners=useRef<Owner|null>(null),mounted=useRef(true),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 if(!owners.current||owners.current.token!==token||owners.current.field!==fieldKey)owners.current={token,field:fieldKey,value,revision:0,busy:false,open:false,popup:null,callback:onChange,context:isCurrent,disabled,automatic};
 const owner=owners.current;if(owner.value!==value||owner.callback!==onChange||owner.context!==isCurrent||owner.disabled!==disabled||owner.automatic!==automatic){Object.assign(owner,{value,callback:onChange,context:isCurrent,disabled,automatic});owner.revision++;}
 const revision=owner.revision,popup=owner.popup,[saved,setSaved]=useState(()=>initial(owner)),state=saved.owner===owner?saved:initial(owner);
 const raw=!children&&state.rawBase===value&&state.raw!==null?state.raw:value,parsed=parseColorValue(raw);
 const own=()=>mounted.current&&owners.current===owner;
 const live=()=>{if(!own()||disabled)return false;try{const allowed=isCurrent?.()??true;return allowed&&own();}catch{return false;}};
 const current=()=>live()&&!owner.busy&&owner.revision===revision;
 const stage=(patch:Partial<View>)=>{if(!current())return;owner.revision++;setSaved({...state,...patch});};
 const message=(error:unknown)=>{if(live())setSaved(previous=>({...previous.owner===owner?previous:initial(owner),error:error instanceof Error?error.message:String(error)}));};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 function close(restoreFocus=false){
  if(!live()||!popup||owner.popup!==popup||!owner.open)return;
  const active=typeof document==='undefined'?null:document.activeElement,returnFocus=restoreFocus&&!!active&&!!root.current?.contains(active);
  if(!live()||owner.popup!==popup||!owner.open)return;owner.open=false;owner.popup=null;owner.revision++;
  setSaved(previous=>({...previous.owner===owner?previous:initial(owner),open:false,opacity:null}));
  if(returnFocus&&own()&&trigger.current?.isConnected)trigger.current.focus();
 }
 useEffect(()=>{
  if(!state.open||!owner.open||typeof document==='undefined')return;
  const pointer=(event:PointerEvent)=>{if(owners.current===owner&&!root.current?.contains(event.target as Node))close(false);};
  const another=(event:Event)=>{if((event as CustomEvent).detail!==owner)close(false);};
  const resized=()=>close(false);
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('lv-color-open',another);window.addEventListener('resize',resized);window.addEventListener('scroll',resized,true);
  return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('lv-color-open',another);window.removeEventListener('resize',resized);window.removeEventListener('scroll',resized,true);};
 },[state.open,owner,popup,isCurrent,disabled]);
 function open(){
  if(!current())return;if(owner.open){close(false);return;}
  if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('lv-color-open',{detail:owner}));
  if(!current())return;
  const rect=trigger.current?.getBoundingClientRect(),width=typeof window==='undefined'?800:window.innerWidth,height=typeof window==='undefined'?600:window.innerHeight;
  const left=Math.max(8,Math.min(rect?.left??8,Math.max(8,width-288))),top=Math.max(8,Math.min((rect?.bottom??0)+6,Math.max(8,height-350)));
  owner.open=true;owner.popup={};stage({open:true,left,top,error:'',opacity:null});
 }
 function publish(next:string,rawInput=false){
  if(!current())return false;
  if(!rawInput&&!(automatic&&next==='')&&!supportedColor(next)){message('Enter a supported color.');return false;}
  owner.busy=true;
  try{
   const accepted=onChange(next);
   if(!live()||owner.revision!==revision)return accepted!==false;
   owner.revision++;
   setSaved(previous=>({...previous.owner===owner?previous:initial(owner),raw:children?null:next,rawBase:value,opacity:null,error:accepted===false?'Color change was not accepted. Your edit is kept.':''}));
   return accepted!==false;
  }catch(error){if(live()&&owner.revision===revision){owner.revision++;setSaved(previous=>({...previous.owner===owner?previous:initial(owner),raw:!children?next:null,rawBase:value,error:error instanceof Error?error.message:String(error)}));}return false;}
  finally{owner.busy=false;}
 }
 function rgb(hex:string,replace=false){if(!current())return;try{publish(colorWithRGB(raw,hex,replace));}catch(error){message(error);}}
 function opacity(text:string){
  if(!current())return;
  if(text.trim()===''){stage({opacity:text,opacityBase:raw,error:'Enter opacity from 0 to 100.'});return;}
  try{publish(colorWithOpacity(raw,Number(text)));}catch(error){stage({opacity:text,opacityBase:raw,error:error instanceof Error?error.message:String(error)});}
 }
 const percentage=parsed?parsed.alpha*100:null,opacityText=state.opacityBase===raw&&state.opacity!==null?state.opacity:percentage===null?'':String(percentage);
 const swatch=supportedColor(raw)?raw:'transparent',opened=state.open&&owner.open;
 return <div className="color-control" ref={root} data-color-field={fieldKey} onKeyDown={event=>{
  if(!opened||!live()||owner.popup!==popup)return;
  if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();close(true);}
  else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}
 }}>
  {children??<input aria-label={label} value={raw} disabled={disabled} spellCheck={false} maxLength={200} onChange={event=>publish(event.target.value,true)}/>}
  <button type="button" className="color-trigger" ref={trigger} disabled={disabled} aria-label={'Choose '+label+' color'} aria-expanded={opened} aria-haspopup="dialog" onClick={open}><span className="color-checker"><i style={{background:swatch}}/></span></button>
  {opened&&<div className="color-popover" role="dialog" aria-label={label+' color'} style={{left:state.left,top:state.top}}>
   <header><strong>{heading??label}</strong><button type="button" aria-label={'Close '+label+' color'} onClick={()=>close(true)}>×</button></header>
   <div className="color-palette" role="group" aria-label="OpenCandle colors">{LV_COLOR_PRESETS.map(hex=><button key={hex} type="button" aria-label={'Use '+hex} title={hex} aria-pressed={!!parsed&&colorRGBHex(parsed)===hex} onClick={()=>rgb(hex,true)} style={{background:hex}}/>)}</div>
   {!parsed&&<p>{automatic&&raw===''?'Automatic color. Choose a swatch to set a color.':'Choose a swatch to replace this value with an opaque color, or edit the text.'}</p>}
   <label className="color-custom">Custom RGB<input type="color" aria-label={label+' custom RGB'} value={parsed?colorRGBHex(parsed):'#000000'} disabled={!parsed||disabled} onChange={event=>rgb(event.target.value)}/></label>
   <label className="color-opacity">Color opacity (%)<input type="number" aria-label={label+' color opacity'} min="0" max="100" step="any" value={opacityText} disabled={!parsed||disabled} onChange={event=>opacity(event.target.value)}/></label>
   <input type="range" aria-label={label+' color opacity slider'} min="0" max="100" step="0.1" value={percentage??100} disabled={!parsed||disabled} onChange={event=>opacity(event.target.value)}/>
   {automatic&&<button type="button" className="color-automatic" onClick={()=>publish('')}>Automatic</button>}
   <output role="alert">{state.error}</output>
  </div>}
 </div>;
}
