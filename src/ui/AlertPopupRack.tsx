import React,{Children,cloneElement,isValidElement,useCallback,useState,type ReactElement,type ReactNode} from 'react';
import {ALERT_POPUP_LAYER_Z_INDEX} from './alert-delivery-host';
import {CompoundAlertDeliveryHost} from './CompoundAlertDeliveryHost';
import {WorkspaceAlerts} from './WorkspaceAlerts';

/** Presentation only: trusted children keep their own delivery effects, queues,
 * keys, dismissal and timers. Ordinary children remain traversable in App. */
export function AlertPopupRack({children}:{children:ReactNode}){
 const [popupHost,setPopupHost]=useState<HTMLDivElement|null>(null);
 const attach=useCallback((node:HTMLDivElement|null)=>{setPopupHost(node);},[]);
 const mounted:ReactNode[]=[];
 Children.forEach(children,child=>{
  if(isValidElement(child)&&(child.type===CompoundAlertDeliveryHost||child.type===WorkspaceAlerts))mounted.push(cloneElement(child as ReactElement<{popupHost?:HTMLElement|null}>,{popupHost}));
  else mounted.push(child);
 });
 return <><div className="lv-alert-popup-rack" ref={attach} style={{position:'fixed',right:16,bottom:16,zIndex:ALERT_POPUP_LAYER_Z_INDEX,width:'min(340px, calc(100vw - 32px))',maxHeight:'calc(100vh - 32px)',overflow:'auto',display:'flex',flexDirection:'column',gap:8}}/>{mounted}</>;
}
