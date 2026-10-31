// Emojis (reference LineToolEmoji, the Emojis tab of the Icons group) on the pinned native `iconstamp` class
// (GlyphStamp): one anchor, a glyph string and a named size. Placement, hit testing (a sizePx square around the
// anchor), handles, bounds, props serialization (glyph, size) and undo stay native.
//
// Painting goes through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint) for one reason: the native glyph branch sets the font
// to the chart theme font, and an emoji must be drawn with the system emoji font (EMOJI_FONT_FAMILY). lvPaint draws
// the same centered glyph at the same pixel size with that font, so the emoji renders in its own colors. No emoji image
// set or icon asset is bundled.
//
// The emoji comes from the picker (emoji-set.ts pickEmoji): a new stamp takes the picked emoji; a saved stamp keeps
// its own (props.glyph). Size options and pixel sizes are the native stamp's (small 16, normal 22, large 32, huge 44)
// and the default size is the native "normal": the reference factory defaults of this tool (size, angle, default
// emoji) are not recorded in the facts, so nothing is seeded and no angle control is added.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {EMOJI_FONT_FAMILY,EMOJI_GLYPHS,selectedEmoji} from './emoji-set';

export const LV_EMOJI='lvemoji';
export const EMOJI_TOOL_ID='LineToolEmoji';
export const EMOJI_ROW='DW.ANNOTATION.EMOJI';
const BASE='iconstamp';

/** Open questions for this tool (each answered by an OpenCandle choice for now). */
export const EMOJI_MISSING_FACTS=Object.freeze([
 'anchor count and placement gesture of LineToolEmoji (OpenCandle: one click, like the native icon stamp)',
 'factory defaults of LineToolEmoji: default emoji, size, angle, any color (OpenCandle: picked emoji, native size normal 22 px, no rotation)',
 'emoji size steps and whether the stamp scales with a handle drag',
 'the reference emoji catalog and its category names (deliberately not recorded: artwork)',
 'settings dialog and floating toolbar buttons of LineToolEmoji',
]);

interface GlyphModel extends NativeModel{
 glyph:string;size:string;
 sizePx():number;center(proj:Projector):[number,number]|null;defaultGlyph():string;
}
type SchemaField={path:string;label:string;kind:string;options?:{value:string;label:string}[];group?:string};

function pinGlyphStamp(){
 const base=nativeBase(BASE);
 for(const key of ['center','sizePx','defaultGlyph','hitTest','hitHandle','handlePoints','bounds','priceRange','schema','serialize','readProps','writeProps'])method(base.prototype,key);
 const shape=roles(base.sample),sample=base.sample as GlyphModel;
 if(shape.min!==1||shape.max!==1||shape.roles!=='p')fail('icon stamp anchor schema changed: '+JSON.stringify(shape));
 if(sample.size!=='normal'||sample.sizePx()!==22)fail('icon stamp default size changed');
 const written=sample.serialize().props;
 if(!written||Object.keys(written).sort().join()!=='glyph,size')fail('icon stamp retained props changed');
 const size=(sample.schema().fields as SchemaField[]).find(field=>field.path==='size');
 if(!size||size.kind!=='select'||size.options?.map(option=>option.value).join()!=='small,normal,large,huge')fail('icon stamp size options changed');
 return{base,size:size!};
}

function defineEmoji():DrawingTypeMeta{
 const {base,size}=pinGlyphStamp();
 const Base=base.ctor as unknown as new(init:Init)=>GlyphModel;
 const glyphField:SchemaField={path:'glyph',label:'Emoji',kind:'select',options:EMOJI_GLYPHS.map(glyph=>({value:glyph,label:glyph})),group:'line'};
 class LvEmojiStamp extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_EMOJI;}
  defaultGlyph(){return selectedEmoji();}
  schema(){return{fields:[glyphField,structuredClone(size)]} as ReturnType<NativeModel['schema']>;}
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,_theme:LvPaintTheme){
   const c=this.center(proj);if(!c)return;
   ctx.save();
   ctx.setLineDash([]);
   ctx.font=`${this.sizePx()}px ${EMOJI_FONT_FAMILY}`;
   ctx.fillStyle=String(this.style.lineColor);
   ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillText(this.glyph,c[0],c[1]);
   ctx.restore();
  }
 }
 const probe=new LvEmojiStamp({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(probe.glyph!==selectedEmoji())fail('icon stamp no longer takes its glyph from defaultGlyph()');
 return{type:lvKey(LV_EMOJI),group:base.meta.group,label:'Emoji',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvEmojiStamp(init)};
}

export const EMOJI_STAMP_MODULE=defineLvDrawingToolModule({
 id:'emoji-stamp',
 types:[{type:LV_EMOJI,base:BASE,define:defineEmoji,requiresPaintHook:true}],
 catalog:[{rowId:EMOJI_ROW,type:LV_EMOJI,note:'Pick an emoji, then click the chart to place it.'}],
});
