import React,{useEffect,useState} from 'react';
import {EMOJI_CATEGORY_BUTTON_PX,EMOJI_CELL_PX,EMOJI_FONT_FAMILY,EMOJI_GROUPS,EMOJI_MENU_MAX_HEIGHT_PX,emojiOf,emojiRows,onEmojiPicked,pickEmoji,recentEmojis} from '../chart/lv-types/emoji-set';
import './emoji-picker.css';

/** Emojis tab of the Icons flyout (reference LineToolEmoji picker). Layout per
 * visual-dialogs-drawing-flyouts#flyout.linetool-group-font-icons: a top row of 8 icon-only category buttons
 * 38x38 (the first pressed), then a section title and rows of 9 cells 37x38; up to 18 recently used emojis
 * (static-drawing-toolbar#group.linetool-group-font-icons recentsMax). Entries and categories are OpenCandle's own
 * Unicode list (emoji-set.ts), drawn with the system emoji font. Picking records the emoji for the next stamp and
 * calls onPick, which the host uses to arm the Emojis tool. */
export interface EmojiPickerProps{onPick:(glyph:string)=>void;initialGroup?:string}

export function EmojiPicker({onPick,initialGroup}:EmojiPickerProps){
 const [groupId,setGroupId]=useState(initialGroup&&EMOJI_GROUPS.some(row=>row.id===initialGroup)?initialGroup:EMOJI_GROUPS[0].id);
 const [recents,setRecents]=useState<readonly string[]>(recentEmojis());
 useEffect(()=>onEmojiPicked(()=>setRecents(recentEmojis())),[]);
 const current=EMOJI_GROUPS.find(row=>row.id===groupId)??EMOJI_GROUPS[0];
 const pick=(glyph:string)=>{if(pickEmoji(glyph))onPick(glyph);};
 const cell={width:EMOJI_CELL_PX.width,height:EMOJI_CELL_PX.height,fontFamily:EMOJI_FONT_FAMILY};
 const grid=(id:string,title:string,glyphs:readonly string[])=><section className="lv-emoji-section" aria-labelledby={'lv-emoji-title-'+id}>
  <h3 className="lv-emoji-title" id={'lv-emoji-title-'+id}>{title}</h3>
  <div className="lv-emoji-grid" role="grid" aria-labelledby={'lv-emoji-title-'+id}>
   {emojiRows(glyphs).map((row,index)=><div role="row" className="lv-emoji-row" key={index}>
    {row.map(glyph=><button type="button" role="gridcell" className="lv-emoji-cell" style={cell} key={glyph} aria-label={glyph} title={glyph} onClick={()=>pick(glyph)}>{glyph}</button>)}
   </div>)}
  </div>
 </section>;
 return <div className="lv-emoji-picker" style={{maxHeight:EMOJI_MENU_MAX_HEIGHT_PX}}>
  <div className="lv-emoji-categories" role="toolbar" aria-label="Emoji categories">
   {EMOJI_GROUPS.map(row=><button type="button" key={row.id} className="lv-emoji-category" style={{width:EMOJI_CATEGORY_BUTTON_PX.width,height:EMOJI_CATEGORY_BUTTON_PX.height,fontFamily:EMOJI_FONT_FAMILY}} aria-pressed={row.id===current.id} aria-label={row.label} title={row.label} onClick={()=>setGroupId(row.id)}>{emojiOf(row.codePoints[0])}</button>)}
  </div>
  <div className="lv-emoji-scroll">
   {recents.length>0&&grid('recent','Recently used',recents)}
   {grid(current.id,current.label,current.codePoints.map(emojiOf))}
  </div>
 </div>;
}
