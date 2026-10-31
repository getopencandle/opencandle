// Word wrap for callout, comment and note text (OpenCandle 0.8.1). The painter wraps with the same rule
// (LV-VELA-DRAWING-FIXES-1 lvWrapLines, src/chart/vela-compat-patch-plan.json) at the width the model returns from
// lvWrapWidth(); the model uses this copy for its hit box. Explicit line breaks are kept; a word wider than the width breaks inside.
/** Maximum text width of a callout, comment or note before its text wraps, in pixels. */
export const DRAWING_TEXT_WRAP_WIDTH=240;
export function wrapTextLines(lines:readonly string[],max:number,measure:(text:string)=>number):string[]{
 if(!(max>0))return [...lines];
 const out:string[]=[];
 for(const line of lines){
  let cur='';
  for(const word of line.split(/(?<=\s)/)){
   if(!cur||measure((cur+word).trimEnd())<=max)cur+=word;
   else{out.push(cur.trimEnd());cur=word;}
   while(cur.trimEnd().length>1&&measure(cur.trimEnd())>max){
    let k=cur.length-1;
    while(k>1&&measure(cur.slice(0,k))>max)k-=1;
    out.push(cur.slice(0,k));cur=cur.slice(k);
   }
  }
  out.push(cur.trimEnd());
 }
 return out;
}
