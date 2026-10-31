import {useLayoutEffect,useRef,type RefObject} from 'react';
import {registerSnapshotSceneSource,type SnapshotBinding,type SnapshotPublishedScene} from '../chart/snapshot-scene';

type ClipRect={left:number;top:number;width:number;height:number};
/** A scrolling/hidden padding viewport clips each axis separately. DOM client metrics exclude scrollbars;
 * the border rect scales those metrics for CSS transforms. Comparisons retain text's subpixel edges. */
function clippedLegendRect(rect:ClipRect,ancestor:Element|null,view:Window):ClipRect|null{
 let left=rect.left,top=rect.top,right=left+rect.width,bottom=top+rect.height;
 for(let node=ancestor;node;node=node.parentElement){
  const style=view.getComputedStyle(node),clipX=/^(auto|scroll|hidden|clip)$/.test(style.overflowX),clipY=/^(auto|scroll|hidden|clip)$/.test(style.overflowY);
  if(!clipX&&!clipY)continue;
  const root=node.ownerDocument.documentElement,rootStyle=view.getComputedStyle(root),viewport=node===root||node===node.ownerDocument.body&&rootStyle.overflowX==='visible'&&rootStyle.overflowY==='visible';
  const box=node.getBoundingClientRect(),html=node as HTMLElement,sx=html.offsetWidth>0?box.width/html.offsetWidth:1,sy=html.offsetHeight>0?box.height/html.offsetHeight:1;
  const x=viewport?0:box.left+node.clientLeft*sx,y=viewport?0:box.top+node.clientTop*sy,width=viewport?root.clientWidth:node.clientWidth*sx,height=viewport?root.clientHeight:node.clientHeight*sy;
  if(clipX){left=Math.max(left,x);right=Math.min(right,x+width);}
  if(clipY){top=Math.max(top,y);bottom=Math.min(bottom,y+height);}
  if(right<=left||bottom<=top)return null;
 }
 return{left,top,width:left===rect.left&&right===rect.left+rect.width?rect.width:right-left,height:top===rect.top&&bottom===rect.top+rect.height?rect.height:bottom-top};
}

/** Read the real displayed legend. No cloned element, synthetic layout, fetch or retained capture is involved. */
export function readSnapshotLegend(host:HTMLElement):SnapshotPublishedScene{
 const scene:SnapshotPublishedScene={texts:[],boxes:[],badges:[]},texts=[...scene.texts],boxes=[...scene.boxes];
 const document=host.ownerDocument,window=document.defaultView;if(!window)throw Error('The legend window is unavailable.');
 const visible=(element:Element)=>{for(let node:Element|null=element;node;node=node.parentElement){const style=window.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;if(node===host)break;}return true;};
 const opacity=(element:Element)=>{let alpha=1;for(let node:Element|null=element;node;node=node.parentElement){alpha*=Number(window.getComputedStyle(node).opacity||1);if(node===host)break;}return alpha;};
 const excluded=(element:Element)=>!!element.closest('svg,[role="menu"],.lv-legend-button,.lv-legend-toggler,[aria-hidden="true"]');
 const walker=document.createTreeWalker(host,4);let node:Node|null,visited=0;
 while((node=walker.nextNode())){
  if(++visited>5000)throw Error('The displayed legend is too large to export.');
  const element=node.parentElement,text=node.textContent??'';if(!element||!text.trim()||excluded(element)||!visible(element))continue;
  const range=document.createRange();range.selectNodeContents(node);const rects=[...range.getClientRects()];
  if(!rects.length)continue;if(rects.length!==1)throw Error('The displayed legend has wrapped text. Widen the chart before taking a snapshot.');
  const rect=rects[0];if(!(rect.width>0&&rect.height>0))continue;
  const clipped=clippedLegendRect(rect,element,window);if(!clipped)continue;
  if(clipped.left!==rect.left||clipped.top!==rect.top||clipped.width!==rect.width||clipped.height!==rect.height)throw Error('The displayed legend has partially clipped text. Scroll its pane or widen the chart before taking a snapshot.');
  const style=window.getComputedStyle(element);
  texts.push({text,left:rect.left,top:rect.top,width:rect.width,height:rect.height,font:style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,color:style.color,opacity:opacity(element)});
 }
 const elements=[host,...host.querySelectorAll<HTMLElement>('*')];if(elements.length>5000)throw Error('The displayed legend is too large to export.');
 for(const element of elements){if(excluded(element)||!visible(element))continue;const style=window.getComputedStyle(element),color=style.backgroundColor;
  if(!color||color==='transparent'||color==='rgba(0, 0, 0, 0)')continue;const rect=element.getBoundingClientRect();if(rect.width>0&&rect.height>0){const clipped=clippedLegendRect(rect,element.parentElement,window);if(clipped)boxes.push({...clipped,color,opacity:opacity(element)});}
 }
 return{texts,boxes,badges:[]};
}

/**
 * Publishes after real layout. A synchronous signature guard rejects a changed DOM before its observer/RAF runs.
 * The legend is read lazily. Observers and chart events only mark the publication stale (in the same frame the old
 * eager republish ran), and every render marks it stale at once (the old synchronous republish on each render); the DOM read,
 * serialization and clone happen only when a snapshot asks (requireSnapshotScene). The subscription follows the binding's
 * owner and chart, not its per-render object identity; the latest binding is read at snapshot time.
 */
export function SnapshotLegendPublisher({host,binding}:{host:RefObject<HTMLDivElement|null>;binding:SnapshotBinding}){
 const latest=useRef(binding),source=useRef<ReturnType<typeof registerSnapshotSceneSource>|null>(null);latest.current=binding;
 useLayoutEffect(()=>{
  const element=host.current;if(!element)return;const token={};let frame=0;
  const registered=registerSnapshotSceneSource(binding,'legend',token,{binding:()=>latest.current,read:()=>readSnapshotLegend(element),connected:()=>element.isConnected});source.current=registered;
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;registered.invalidate();});};
  const mutations=new MutationObserver(schedule);mutations.observe(element,{subtree:true,childList:true,characterData:true,attributes:true});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;resize?.observe(element);
  const unsubs=[binding.chart.onViewportChanged(schedule),binding.chart.onCrosshair(schedule),binding.chart.onMarketApplied(schedule)];
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
  return()=>{cancelAnimationFrame(frame);mutations.disconnect();resize?.disconnect();unsubs.forEach(fn=>fn());window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);if(source.current===registered)source.current=null;registered.dispose();};
 },[host,binding.owner,binding.chart]);
 // App creates a fresh binding on each render, including theme, layout restore, Undo and Redo: each render marks the legend stale.
 useLayoutEffect(()=>{source.current?.invalidate();});
 return null;
}
