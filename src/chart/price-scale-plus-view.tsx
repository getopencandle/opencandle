import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot,type Root} from 'react-dom/client';
import {PLUS_BUTTON_PX,type PricePlusMount,type PricePlusViewProps} from './price-scale-plus';

const buttonStyle=(props:PricePlusViewProps):React.CSSProperties=>({position:'absolute',zIndex:20,left:props.left,top:props.top-PLUS_BUTTON_PX/2,width:PLUS_BUTTON_PX,height:PLUS_BUTTON_PX,padding:0,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--lv-menu-border, #363a45)',borderRadius:3,background:'var(--lv-menu-bg, #1e2230)',color:'var(--lv-menu-fg, #d1d4dc)',font:'12px/1 -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',cursor:'pointer'});
// The menu opens toward the plot: leftward from a right scale, rightward from a left scale.
const menuStyle=(props:PricePlusViewProps):React.CSSProperties=>({position:'absolute',zIndex:1001,...(props.side==='left'?{left:props.left+PLUS_BUTTON_PX+4}:{right:`calc(100% - ${props.left}px + 4px)`}),top:props.top-PLUS_BUTTON_PX/2,minWidth:220,padding:'6px 0',background:'var(--lv-menu-bg, #1e2230)',color:'var(--lv-menu-fg, #d1d4dc)',border:'1px solid var(--lv-menu-border, #363a45)',borderRadius:6,boxShadow:'0 2px 12px rgba(0,0,0,.45)',font:'13px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',whiteSpace:'nowrap'});

/** Plus button on the price scale and its menu (gap 10). A pure function of the port's props. */
export function PricePlusView(props:PricePlusViewProps){
 return <>
  <button type="button" aria-label={'Price actions at '+props.text} title={'Price actions at '+props.text} aria-haspopup="menu" aria-expanded={!!props.items} data-lv-price-plus="true" style={buttonStyle(props)}
   onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();props.onOpen();}}>+</button>
  {props.items&&<div role="menu" aria-label="Price actions" data-lv-price-plus-menu="true" style={menuStyle(props)} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();event.stopPropagation();}}>
   {props.items.map(item=><div key={item.id} role="menuitem" tabIndex={-1} aria-label={item.label} aria-disabled={item.disabled?true:undefined} title={item.disabled} data-lv-key={item.id}
    style={{height:30,display:'flex',alignItems:'center',padding:'0 12px',cursor:item.disabled?'default':'pointer',opacity:item.disabled?0.45:1}}
    onClick={event=>{event.stopPropagation();if(!item.disabled)props.onActivate(item.id);}}>{item.label}</div>)}
   {props.status&&<div role="status" style={{padding:'6px 12px',maxWidth:280,whiteSpace:'normal',color:'var(--lv-menu-warning, #f7a600)'}}>{props.status}</div>}
  </div>}
 </>;
}

/** Mounts the plus button in its own root inside the chart host. */
export function mountPricePlus(host:HTMLElement):PricePlusMount{
 const node=host.ownerDocument.createElement('div');node.dataset.lvPricePlusHost='true';host.appendChild(node);
 let root:Root|null=createRoot(node);
 return{
  render(props){if(!root)return;const owned=root;flushSync(()=>owned.render(props?<PricePlusView {...props}/>:null));},
  contains(target){return target instanceof Node&&node.contains(target);},
  dispose(){const owned=root;root=null;if(!owned)return;queueMicrotask(()=>{try{owned.unmount();}finally{node.remove();}});},
 };
}
