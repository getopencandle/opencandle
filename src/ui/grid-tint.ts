/** Per-cell background tints for multi-chart layouts (owner request 2026-10-29).
 *  A display layer only: nothing here is saved. A cell is tinted when its background is still a preset background (the user
 *  has not set a custom one) and an earlier cell in the layout already shows that same background, so every chart in a grid
 *  reads as its own panel. Cell 1 is never tinted, and a cell whose theme already differs (for example an LV Dark first chart
 *  next to LV Medium Dark charts) keeps its theme as is. The tint for cell index i is a fixed function of (base background, i):
 *  a small OKLCH step (hue on a golden-angle walk, low chroma, a lightness nudge), so it is stable across reloads. The active
 *  border of a tinted cell takes a brighter colour of the same hue, so the border matches the background it frames. */
import {themePresets,type ChartAppearance} from './themes';

type Rgb=[number,number,number];
type Lch=[number,number,number];

export function parseCssColor(value:string):{rgb:Rgb;alpha:number}|null{
 const text=value.trim().toLowerCase();
 let match=/^#([0-9a-f]{3,8})$/.exec(text);
 if(match){const hex=match[1];
  if(hex.length===3||hex.length===4){const v=[...hex].map(c=>parseInt(c+c,16));return{rgb:[v[0],v[1],v[2]],alpha:hex.length===4?v[3]/255:1};}
  if(hex.length===6||hex.length===8){const v=[0,2,4,6].slice(0,hex.length/2).map(i=>parseInt(hex.slice(i,i+2),16));return{rgb:[v[0],v[1],v[2]],alpha:hex.length===8?v[3]/255:1};}
  return null;}
 match=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text);
 if(match){const v=[1,2,3].map(i=>Number(match![i]));if(v.some(n=>!Number.isFinite(n)||n>255))return null;const alpha=match[4]===undefined?1:Number(match[4]);return Number.isFinite(alpha)?{rgb:[v[0],v[1],v[2]],alpha}:null;}
 return null;
}
const toLinear=(c:number)=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
const fromLinear=(v:number)=>255*(v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055);
export function rgbToOklch([r,g,b]:Rgb):Lch{
 const lr=toLinear(r),lg=toLinear(g),lb=toLinear(b);
 const l=Math.cbrt(0.4122214708*lr+0.5363325363*lg+0.0514459929*lb),m=Math.cbrt(0.2119034982*lr+0.6806995451*lg+0.1073969566*lb),s=Math.cbrt(0.0883024619*lr+0.2817188376*lg+0.6299787005*lb);
 const L=0.2104542553*l+0.793617785*m-0.0040720468*s,A=1.9779984951*l-2.428592205*m+0.4505937099*s,B=0.0259040371*l+0.7827717662*m-0.808675766*s;
 return [L,Math.hypot(A,B),((Math.atan2(B,A)*180/Math.PI)+360)%360];
}
function oklchToLinear([L,C,H]:Lch):Rgb{
 const A=C*Math.cos(H*Math.PI/180),B=C*Math.sin(H*Math.PI/180);
 const l=(L+0.3963377774*A+0.2158037573*B)**3,m=(L-0.1055613458*A-0.0638541728*B)**3,s=(L-0.0894841775*A-1.291485548*B)**3;
 return [4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.707614701*s];
}
/** OKLCH to #rrggbb; chroma is reduced until the colour fits sRGB. */
export function oklchToHex([L,C,H]:Lch):string{
 let chroma=C,linear=oklchToLinear([L,chroma,H]);
 for(let step=0;step<24&&linear.some(v=>v<-1e-4||v>1+1e-4);step++){chroma*=0.85;linear=oklchToLinear([L,chroma,H]);}
 return '#'+linear.map(v=>Math.round(Math.min(255,Math.max(0,fromLinear(Math.min(1,Math.max(0,v)))))).toString(16).padStart(2,'0')).join('');
}

/** Hue offsets (degrees from the base hue) by cell index: the first few stay close to the theme's own hue, later cells
 *  walk further out. Index 0 is the base colour itself. */
const HUE_OFFSETS=[0,40,-40,80,-80,120,-120,160,-160,20,-20,60,-60,100,-100,140] as const;
/** The tint hue for a background: neutral backgrounds (greys, white, black) start from LV slate blue. */
function tintHue([,C,H]:Lch,index:number){return(((C>=0.02?H:250)+HUE_OFFSETS[index%HUE_OFFSETS.length]+(index>=HUE_OFFSETS.length?7:0))%360+360)%360;}
/** The tint of one background colour for cell index `index` (1 and up; 0 returns the colour unchanged). Dark backgrounds get a
 *  little lighter, light ones a little darker, with low chroma, so candles, grid and scale text read the same. */
export function tintColor(color:string,index:number):string{
 const parsed=parseCssColor(color);if(!parsed||index<=0)return color;
 const lch=rgbToOklch(parsed.rgb),[L,C]=lch,light=L>0.6;
 const chroma=light?Math.min(0.03,0.016+C*0.3)+0.006*(index%2):Math.min(0.045,0.022+C*0.4)+0.006*(index%2);
 const step=[0.012,0.026,0.004][index%3];
 const lightness=light?L-0.012-step:Math.min(0.92,L+step);
 const hex=oklchToHex([lightness,chroma,tintHue(lch,index)]);
 return parsed.alpha<1?hex+Math.round(parsed.alpha*255).toString(16).padStart(2,'0'):hex;
}
/** The active-border colour that goes with a tinted background: same hue, clearly visible on the grid gutter. */
export function tintBorder(color:string,index:number):string|null{
 const parsed=parseCssColor(color);if(!parsed||index<=0)return null;
 const lch=rgbToOklch(parsed.rgb);
 return oklchToHex([lch[0]>0.6?0.56:0.74,0.11,tintHue(lch,index)]);
}

/** The background fields of an appearance, as one comparable key. */
export function backgroundKey(appearance:Pick<ChartAppearance,'backgroundType'|'background'|'gradientStart'|'gradientEnd'>):string{
 return appearance.backgroundType==='gradient'?'g|'+appearance.gradientStart.trim().toLowerCase()+'|'+appearance.gradientEnd.trim().toLowerCase():'s|'+appearance.background.trim().toLowerCase();
}
const presetKeys=new Set(themePresets.map(row=>backgroundKey(row.appearance)));
/** True when the background is one a theme preset ships with, i.e. not a background the user set by hand. */
export function isPresetBackground(appearance:ChartAppearance):boolean{return presetKeys.has(backgroundKey(appearance));}

/** `key` is the planned base background (backgroundKey); `border` the active-border colour, set as the cell's --lv-accent. */
export interface CellTint {index:number;key:string;border:string}
/** One entry per cell, in layout order: null for an untinted cell. Cells are tinted only in a layout of two or more. */
export function gridCellTints(appearances:readonly (ChartAppearance|undefined)[]):(CellTint|null)[]{
 const seen=new Set<string>();
 return appearances.map((appearance,index)=>{
  if(!appearance)return null;const key=backgroundKey(appearance),repeat=seen.has(key);seen.add(key);
  if(index===0||!repeat||!isPresetBackground(appearance))return null;
  const border=tintBorder(appearance.backgroundType==='gradient'?appearance.gradientEnd:appearance.background,index);
  return border?{index,key,border}:null;
 });
}
const tintCache=new WeakMap<ChartAppearance,Map<number,ChartAppearance>>();
/** The appearance a tinted cell renders with. The input is returned as is when the tint does not apply (no tint, or the
 *  rendered appearance no longer has the background the tint was planned for, such as a settings preview). Results are cached
 *  per input object, so the rendered appearance keeps its identity across renders. */
export function tintedAppearance(appearance:ChartAppearance,tint:CellTint|null):ChartAppearance{
 if(!tint||backgroundKey(appearance)!==tint.key)return appearance;
 let byIndex=tintCache.get(appearance);if(!byIndex){byIndex=new Map();tintCache.set(appearance,byIndex);}
 let result=byIndex.get(tint.index);
 if(!result){result={...appearance,background:tintColor(appearance.background,tint.index),gradientStart:tintColor(appearance.gradientStart,tint.index),gradientEnd:tintColor(appearance.gradientEnd,tint.index)};byIndex.set(tint.index,result);}
 return result;
}
