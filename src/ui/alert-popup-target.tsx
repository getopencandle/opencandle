import {createPortal} from 'react-dom';
import type {CSSProperties,ReactElement,ReactPortal} from 'react';

/** Shared rack supplies positioning and one scroll region. Delivery policy stays
 * with each original host, including its separate five-popup limit. */
export const STACKED_POPUP_STYLE:CSSProperties={position:'static',width:'100%',minWidth:0,flex:'0 0 auto',display:'flex',flexDirection:'column',gap:8,overflowWrap:'anywhere'};
/** Explicit null opts into a rack that has not mounted yet. It must never fall
 * back to a second fixed corner; the mounted delivery host still owns its queue. */
export function popupTarget(section:ReactElement,host:HTMLElement|null|undefined):ReactElement|ReactPortal|null{
 return host===undefined?section:host===null?null:createPortal(section,host);
}
