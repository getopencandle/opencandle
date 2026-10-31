import type {Bar} from '../domain/types';
import {validateIndicatorVolumePalette,VOLUME_FOUR_WAY_DEFAULTS,type IndicatorVolumePalette} from './indicator-settings';
import {indicatorColorOpacity} from './indicator-opacity';

interface VolumePoint {value:number|null;color?:string}
/** Only fresh native presentation points are changed; calculation bars and values stay owned by the caller. */
export function applyIndicatorVolumePalette(points:VolumePoint[],bars:readonly Bar[],palette:IndicatorVolumePalette,opacity:number):{unavailable:number}{
 validateIndicatorVolumePalette(palette);
 if(!Array.isArray(points)||!Array.isArray(bars)||points.length!==bars.length||bars.length>100000)throw new Error('Volume colors require the exact bounded calculation prefix.');
 if(palette.mode==='uniform')return {unavailable:0};
 const up=indicatorColorOpacity(palette.upColor,opacity),down=indicatorColorOpacity(palette.downColor,opacity);let unavailable=0;
 const four=palette.mode==='rising-falling'?{ur:indicatorColorOpacity(palette.upRisingColor??VOLUME_FOUR_WAY_DEFAULTS.upRisingColor,opacity),uf:indicatorColorOpacity(palette.upFallingColor??VOLUME_FOUR_WAY_DEFAULTS.upFallingColor,opacity),dr:indicatorColorOpacity(palette.downRisingColor??VOLUME_FOUR_WAY_DEFAULTS.downRisingColor,opacity),df:indicatorColorOpacity(palette.downFallingColor??VOLUME_FOUR_WAY_DEFAULTS.downFallingColor,opacity)}:null;
 const original=four?points.map(point=>point.value):[];
 for(let index=0;index<points.length;index++){
  const point=points[index];if(point.value===null)continue;
  const close=bars[index]?.close,reference=palette.mode==='open-close'||index===0?bars[index]?.open:bars[index-1]?.close;
  if(typeof close!=='number'||!Number.isFinite(close)||typeof reference!=='number'||!Number.isFinite(reference)){point.value=null;delete point.color;unavailable++;continue;}
  const isUp=close>=reference;
  if(four){const before=index>0?original[index-1]:null;const rising=typeof point.value==='number'&&typeof before==='number'&&point.value>before;point.color=isUp?(rising?four.ur:four.uf):(rising?four.dr:four.df);continue;}
  point.color=isUp?up:down;
 }
 return {unavailable};
}
