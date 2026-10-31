import React,{useEffect,useRef,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import {Modal} from './Modal';
import {ColorControl,LV_COLOR_PRESETS} from './ColorControl';
import {planSelectionDisplacement} from './multi-selection-model';
import {LV_ICONS,type LvIconId} from './icons';
const glyph=(id:LvIconId,fallback:string):React.ReactNode=>{if(Object.hasOwn(LV_ICONS,id)){const Icon=LV_ICONS[id].Icon;return <Icon/>;}return fallback;};

/** The selection bar shown over the chart while two or more drawings are selected (DWUTIL objects-App.md section 3).
 * Buttons come from chart.bulkPropertyBar; a choice is one prepared property batch (one history step) through
 * chart.drawingManager.applyProperties. A press inside the bar or its dialog stops here (see drawing-edit-bar.tsx). */
export interface MultiSelectionBarProps{chart:ChartController;ids:readonly string[];rows:readonly Record<string,unknown>[];onChanged:()=>void;onMessage:(text:string)=>void;
 /** App queues an edit made during the routine background autosave (the chart refuses it or leaves it unpublished
  * while the save holds it) and runs it when the write ends, after checking these drawings still exist. true: queued. */
 deferEdit?:(run:()=>void,ids:readonly string[])=>boolean}
/** Icon-sized buttons like the single-drawing bar; the full name stays as the tooltip and accessible name. */
const BULK_GLYPH:Readonly<Record<string,string>>={lineColor:'A',backgroundColor:'▧',textColor:'T',lineWidth:'≡',lineStyle:'┄'};
const WIDTHS_LABEL=(value:number|string)=>String(value);
export function MultiSelectionBar({chart,ids,rows,onChanged,onMessage,deferEdit}:MultiSelectionBarProps):React.ReactElement|null{
 const [menu,setMenu]=useState<string|null>(null),[settings,setSettings]=useState(false),root=useRef<HTMLDivElement>(null);
 const selected=rows.filter(row=>ids.includes(String(row.id)));
 let model:{visible:boolean;buttons:ReturnType<ChartController['bulkPropertyBar']>['buttons']}={visible:false,buttons:[]};
 try{model=chart.bulkPropertyBar(selected as never);}catch{model={visible:false,buttons:[]};}
 useEffect(()=>{if(!menu)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(null);};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[menu]);
 if(ids.length<2)return null;
 const edit=(action:()=>void)=>{const targets=[...ids],now=()=>{try{action();onChanged();}catch(error){onMessage(String(error instanceof Error?error.message:error));}};if(deferEdit?.(now,targets))return;now();};
 const apply=(path:string,value:unknown,keepOpen=false)=>{if(!keepOpen)setMenu(null);const targets=[...ids];edit(()=>chart.drawingManager.applyProperties(targets,{[path]:value}));};
 const allLocked=selected.length>0&&selected.every(row=>row.locked===true);
 const run=(action:()=>void)=>{setMenu(null);edit(action);};
 const choices=(button:typeof model.buttons[number]):{key:string;label:string;value:unknown;swatch?:string}[]=>{
  if(button.id==='lineWidth')return(button.options??[]).map(option=>({key:String(option),label:WIDTHS_LABEL(option),value:option}));
  if(button.id==='lineStyle')return(button.options??[]).map(option=>({key:String(option),label:String(option).charAt(0).toUpperCase()+String(option).slice(1),value:option}));
  return [];
 };
 return <div className="drawing-edit-bar multi-selection-bar" role="toolbar" aria-label="Selected drawings" ref={root} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'&&menu){event.stopPropagation();setMenu(null);}}}>
  {model.visible&&model.buttons.map(button=><span className="multi-selection-slot" key={button.id}>
   <button type="button" className="drawing-edit-icon" aria-label={button.title} title={button.title} aria-haspopup="menu" aria-expanded={menu===button.id} onClick={()=>setMenu(menu===button.id?null:button.id)}>{BULK_GLYPH[button.id]??button.title.charAt(0)}</button>
   {menu===button.id&&button.id!=='lineWidth'&&button.id!=='lineStyle'&&<BulkColorMenu title={button.title} fieldKey={button.path} onPick={color=>{apply(button.path,color,true);return true;}}/>}
   {menu===button.id&&(button.id==='lineWidth'||button.id==='lineStyle')&&<div className="multi-selection-menu" role="menu" aria-label={button.title}>{choices(button).map(choice=><button type="button" role="menuitem" key={choice.key} aria-label={choice.label} title={choice.label} onClick={()=>apply(button.path,choice.value)}>{choice.swatch?<span className="multi-selection-swatch" style={{background:choice.swatch}}/>:choice.label}</button>)}</div>}
  </span>)}
  <button type="button" className="drawing-edit-icon" aria-label={allLocked?'Unlock':'Lock'} title={allLocked?'Unlock':'Lock'} aria-pressed={allLocked} onClick={()=>run(()=>chart.drawingManager.set([...ids],{locked:!allLocked}))}>{glyph(allLocked?'lock-drawings-locked':'lock-drawings','🔒')}</button>
  <button type="button" className="drawing-edit-icon" aria-label="Clone" title="Clone" onClick={()=>run(()=>{chart.drawings.duplicate([...ids]);})}>{'⧉'}</button>
  <button type="button" className="drawing-edit-icon" aria-label="Delete" title="Delete" onClick={()=>run(()=>chart.drawingManager.remove([...ids]))}>{glyph('remove-objects','🗑')}</button>
  <button type="button" onClick={()=>{setMenu(null);setSettings(true);}}>Settings</button>
  {settings&&<DisplacementDialog chart={chart} ids={ids} onClose={()=>setSettings(false)} onChanged={onChanged}/>}
 </div>;
}
/** The bulk color menu: the shared ColorControl popup picks the color; the menu item applies the current draft. */
export function BulkColorMenu({title,fieldKey,onPick}:{title:string;fieldKey:string;onPick:(color:string)=>boolean|void}){
 const [draft,setDraft]=useState<string>(LV_COLOR_PRESETS[0]);
 const pick=(color:string)=>{setDraft(color);return onPick(color);};
 return <div className="multi-selection-menu" role="menu" aria-label={title}>
  <ColorControl label={title} fieldKey={fieldKey} value={draft} onChange={pick}>
   <button type="button" role="menuitem" aria-label={'Apply '+draft} title={draft} onClick={()=>pick(draft)}><span className="multi-selection-swatch" style={{background:draft}}/></button>
  </ColorControl>
 </div>;
}
function DisplacementDialog({chart,ids,onClose,onChanged}:{chart:ChartController;ids:readonly string[];onClose:()=>void;onChanged:()=>void}){
 const [barText,setBarText]=useState(''),[priceText,setPriceText]=useState(''),[error,setError]=useState('');
 let sources:{id:string;anchors:{timeSeconds:number;price:number;barNumber:number|null;editableTime:boolean;editablePrice:boolean}[]}[]=[];
 try{sources=ids.map(id=>({id,anchors:chart.getDrawingEditor(id).anchors}));}catch{sources=[];}
 const excluded=sources.filter(source=>!source.anchors.length||source.anchors.some(anchor=>!anchor.editableTime||anchor.barNumber===null)).length;
 const none=sources.length>0&&excluded===sources.length;
 const apply=()=>{
  try{
   const outcome=planSelectionDisplacement(sources,barText,priceText,chart.getSourceBars());
   if(!outcome.ok){setError(outcome.message);return;}
   if(outcome.moves.length)chart.drawingManager.moveMany(outcome.moves);
   onChanged();onClose();
  }catch(caught){setError(String(caught instanceof Error?caught.message:caught));}
 };
 return <div className="drawing-dialog-scope" style={{display:'contents'}} onPointerDown={event=>event.stopPropagation()}>
  <Modal title="Selected drawings settings" onClose={onClose}>
   <form onSubmit={event=>{event.preventDefault();apply();}}>
    <div role="group" aria-label="Settings tabs"><button type="button" aria-pressed="true">Coordinates</button></div>
    <fieldset><legend>Displacement (price, bar)</legend>
     <label>Displacement bar <input aria-label="Displacement bar" inputMode="text" autoComplete="off" value={barText} disabled={none} onChange={event=>{setBarText(event.target.value);setError('');}}/></label>
     <label>Displacement price <input aria-label="Displacement price" inputMode="text" autoComplete="off" value={priceText} disabled={none} onChange={event=>{setPriceText(event.target.value);setError('');}}/></label>
    </fieldset>
    {excluded>0&&<p role="status">{none?'None of the selected drawings can be moved by coordinates.':excluded+(excluded===1?' selected drawing is':' selected drawings are')+' left out: its position has no bar coordinate.'}</p>}
    {error&&<p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={none} onClick={apply}>Apply</button></footer>
   </form>
  </Modal>
 </div>;
}
