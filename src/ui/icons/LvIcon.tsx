import React from 'react';

/** Where an icon is designed to sit. Sizes: toolbar areas 28x28, rail 44x44, small icons per entry. */
export type LvIconArea='left-toolbar'|'header'|'rail'|'bottom-toolbar'|'widget'|'menu'|'small';

export interface LvIconProps extends Omit<React.SVGProps<SVGSVGElement>,'children'|'ref'|'viewBox'|'fill'|'stroke'|'strokeWidth'>{
 /** Accessible name for a standalone, meaningful icon. Leave it out when the hosting control is
  * already named (aria-label/title): the icon is then decorative and hidden from assistive tech. */
 title?:string;
}

export interface LvIconComponent{
 (props:LvIconProps):React.ReactElement;
 displayName?:string;
 /** Design box: the viewBox size and the default rendered size. */
 readonly box:{readonly width:number;readonly height:number};
}

/**
 * Builds one LV icon. Every icon shares the same contract:
 * - `viewBox` equals the design box and the default width/height equal it (1 unit = 1 CSS px);
 * - `fill="none"`, `stroke="currentColor"`, `stroke-width="1"`, butt caps and mitred joins on the root,
 *   so state colours come from CSS `color` only (#dbdbdb normal, #2962ff toggles, #575757 disabled);
 * - solid details opt in per element with `fill="currentColor" stroke="none"` (counted by the registry);
 * - decorative by default (`aria-hidden`, `focusable="false"`); with `title` it becomes `role="img"`.
 */
export function lvIcon(name:string,box:{width:number;height:number},body:React.ReactNode):LvIconComponent{
 const frozen=Object.freeze({width:box.width,height:box.height});
 const render=({title,width,height,...rest}:LvIconProps)=>React.createElement('svg',{
  ...rest,
  xmlns:'http://www.w3.org/2000/svg',
  viewBox:`0 0 ${frozen.width} ${frozen.height}`,
  width:width??frozen.width,
  height:height??frozen.height,
  fill:'none',
  stroke:'currentColor',
  strokeWidth:1,
  strokeLinecap:'butt',
  strokeLinejoin:'miter',
  'data-lv-icon':name,
  ...(title?{role:'img','aria-label':title}:{'aria-hidden':true,focusable:'false'}),
 },title?React.createElement('title',null,title):null,body);
 const Icon:LvIconComponent=Object.assign(render,{box:frozen,displayName:'LvIcon('+name+')'});
 return Icon;
}
