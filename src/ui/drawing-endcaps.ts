/** Presentation only. Reading an absent or undefined flag must not save a default. */
export function drawingEndcapControl(type:string,path:string,value:unknown){
 if(type!=='trendline'||!['style.arrowLeft','style.arrowRight'].includes(path))return null;
 const available=value===undefined||typeof value==='boolean';
 return {label:path==='style.arrowLeft'?'Left end':'Right end',available,value:available?(value===true?'arrow':'normal'):'unavailable'};
}
