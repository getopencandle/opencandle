// Pure layout and canvas painting of the Anchored text drawing. The drawing module (lv-types/anchored-text.ts) owns the
// model and hands this file plain values; nothing here touches the renderer, the DOM or the network.
//
// Reference facts: static-drawing-defaults#tool.LineToolTextAbsolute.defaults (fontsize 14, bold, italic, fillBackground, drawBorder,
// wordWrap, wordWrapWidth 200, colors, backgroundTransparency 70); visual-drawing-dialogs#dialog.LineToolTextAbsolute.text fields.
// Not facts: the 4 px by 2 px inner padding, the 1.4 line height (the native Text label uses the same proportions for its
// hit box), the placeholder rendering of an empty text, and the background alpha rule alpha = (100 - transparency) / 100.

export const ANCHORED_TEXT_SIZE_PX:Readonly<Record<string,number>>=Object.freeze({tiny:10,small:12,normal:14,large:18,huge:28,auto:14});
export const ANCHORED_TEXT_PAD_X=4;
export const ANCHORED_TEXT_PAD_Y=2;
export const ANCHORED_TEXT_LINE_HEIGHT=1.4;
export const ANCHORED_TEXT_PLACEHOLDER='Add text';

export interface AnchoredTextSpec{
 readonly text:string;
 readonly sizePx:number;
 readonly bold:boolean;
 readonly italic:boolean;
 readonly color:string;
 readonly wordWrap:boolean;
 readonly wordWrapWidth:number;
 readonly fillBackground:boolean;
 readonly backgroundColor:string;
 readonly backgroundTransparency:number;
 readonly drawBorder:boolean;
 readonly borderColor:string;
}
export type Measure=(text:string)=>number;
export interface AnchoredTextLayout{readonly lines:readonly string[];readonly width:number;readonly height:number;readonly lineHeight:number;readonly placeholder:boolean}

/** Width estimate used for hit boxes when no canvas is at hand; it matches the native Text label estimate (0.6 of the font size per column). */
export const approximateMeasure=(sizePx:number):Measure=>text=>text.length*sizePx*0.6;
export const backgroundAlpha=(transparency:number)=>Math.min(1,Math.max(0,(100-transparency)/100));
export const fontOf=(spec:Pick<AnchoredTextSpec,'bold'|'italic'|'sizePx'>,family:string)=>`${spec.italic?'italic ':''}${spec.bold?'bold ':''}${spec.sizePx}px ${family}`;

/** Breaks each paragraph at spaces so no line is wider than maxWidth; a word wider than the limit stays on a line of its own. */
export function wrapLines(text:string,maxWidth:number,measure:Measure):string[]{
 const out:string[]=[];
 for(const paragraph of text.split('\n')){
  if(!(maxWidth>0)){out.push(paragraph);continue;}
  let line='';
  for(const word of paragraph.split(' ')){
   const candidate=line===''?word:line+' '+word;
   if(line!==''&&measure(candidate)>maxWidth){out.push(line);line=word;}else line=candidate;
  }
  out.push(line);
 }
 return out;
}

export function layoutAnchoredText(spec:AnchoredTextSpec,measure:Measure=approximateMeasure(spec.sizePx)):AnchoredTextLayout{
 const empty=spec.text==='';
 const source=empty?ANCHORED_TEXT_PLACEHOLDER:spec.text;
 const lines=spec.wordWrap&&!empty?wrapLines(source,spec.wordWrapWidth,measure):source.split('\n');
 const lineHeight=spec.sizePx*ANCHORED_TEXT_LINE_HEIGHT;
 const widest=Math.max(0,...lines.map(measure));
 return{lines,width:Math.max(12,widest)+2*ANCHORED_TEXT_PAD_X,height:lines.length*lineHeight+2*ANCHORED_TEXT_PAD_Y,lineHeight,placeholder:empty};
}

/** Paints the box with its top-left corner at (x, y). Order: background, border, text lines. Returns the painted box. */
export function paintAnchoredText(ctx:CanvasRenderingContext2D,spec:AnchoredTextSpec,x:number,y:number,fontFamily:string){
 const measure:Measure=text=>{try{return ctx.measureText(text).width;}catch{return approximateMeasure(spec.sizePx)(text);}};
 ctx.save();
 ctx.font=fontOf(spec,fontFamily);
 const layout=layoutAnchoredText(spec,measure);
 if(spec.fillBackground){
  ctx.globalAlpha=backgroundAlpha(spec.backgroundTransparency);
  ctx.fillStyle=spec.backgroundColor;
  ctx.fillRect(x,y,layout.width,layout.height);
  ctx.globalAlpha=1;
 }
 if(spec.drawBorder){
  ctx.strokeStyle=spec.borderColor;ctx.lineWidth=1;ctx.setLineDash([]);
  ctx.beginPath();ctx.rect(x+0.5,y+0.5,layout.width-1,layout.height-1);ctx.stroke();
 }
 ctx.fillStyle=spec.color;ctx.textAlign='left';ctx.textBaseline='middle';
 if(layout.placeholder)ctx.globalAlpha=0.5;
 layout.lines.forEach((line,index)=>ctx.fillText(line,x+ANCHORED_TEXT_PAD_X,y+ANCHORED_TEXT_PAD_Y+layout.lineHeight*(index+0.5)));
 ctx.restore();
 return{x,y,w:layout.width,h:layout.height};
}
