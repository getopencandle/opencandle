import React,{useEffect,useState} from 'react';
import {STICKERS,onStickerPicked,pickSticker,selectedSticker,type Sticker,type StickerShape} from '../chart/lv-types/sticker-set';
import {EMOJI_CELL_PX,emojiRows} from '../chart/lv-types/emoji-set';
import './emoji-picker.css';

/** Stickers tab of the Icons flyout (reference LineToolSticker). OpenCandle's own sticker art (sticker-set.ts), drawn
 * here as inline SVG from the same shape list the chart painter uses; grid cells follow the Emojis tab. Picking records the sticker
 * for the next placement and calls onPick, which the host uses to arm the Stickers tool. */
const shape=(item:StickerShape,key:number)=>{
 const points=(pts:readonly number[])=>pts.reduce<string[]>((out,value,index)=>{if(index%2===0)out.push(value+','+pts[index+1]);return out;},[]).join(' ');
 if(item.k==='poly')return <polygon key={key} points={points(item.pts)} fill={item.fill??'none'} stroke={item.stroke} strokeWidth={item.width} strokeLinejoin="round"/>;
 if(item.k==='line')return <polyline key={key} points={points(item.pts)} fill="none" stroke={item.stroke} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round"/>;
 if(item.k==='circle')return <circle key={key} cx={item.cx} cy={item.cy} r={item.r} fill={item.fill??'none'} stroke={item.stroke} strokeWidth={item.width}/>;
 return <text key={key} x={item.x} y={item.y} fontSize={item.size} fontWeight="bold" fill={item.fill} textAnchor="middle" dominantBaseline="central">{item.text}</text>;
};
export function StickerArt({sticker,size}:{sticker:Sticker;size:number}){
 return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">{sticker.shapes.map(shape)}</svg>;
}
export function StickerPicker({onPick}:{onPick:(id:string)=>void}){
 const [selected,setSelected]=useState(selectedSticker());
 useEffect(()=>onStickerPicked(()=>setSelected(selectedSticker())),[]);
 const pick=(id:string)=>{if(pickSticker(id))onPick(id);};
 const cell={width:EMOJI_CELL_PX.width,height:EMOJI_CELL_PX.height};
 return <div className="lv-emoji-picker lv-sticker-picker">
  <div className="lv-emoji-scroll">
   <section className="lv-emoji-section" aria-labelledby="lv-sticker-title">
    <h3 className="lv-emoji-title" id="lv-sticker-title">Stickers</h3>
    <div className="lv-emoji-grid" role="grid" aria-labelledby="lv-sticker-title">
     {emojiRows(STICKERS,6).map((row,index)=><div role="row" className="lv-emoji-row" key={index}>
      {row.map(sticker=><button type="button" role="gridcell" className="lv-emoji-cell" style={cell} key={sticker.id} aria-label={sticker.label} aria-pressed={sticker.id===selected} title={sticker.label} data-sticker={sticker.id} onClick={()=>pick(sticker.id)}><StickerArt sticker={sticker} size={30}/></button>)}
     </div>)}
    </div>
   </section>
  </div>
 </div>;
}
