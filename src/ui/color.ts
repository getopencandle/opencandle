export interface ColorParts {hex:string;alpha:number;supported:boolean}
/** Lossless picker conversion for numeric RGB and hex; other valid CSS remains editable as text. */
export function colorParts(value:string):ColorParts{
 const text=value.trim(),hex=text.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
 if(hex){const expanded=hex[1].length<=4?[...hex[1]].map(v=>v+v).join(''):hex[1];return{hex:'#'+expanded.slice(0,6),alpha:expanded.length===8?parseInt(expanded.slice(6),16)/255:1,supported:true};}
 const rgb=text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
 if(rgb){const channels=rgb.slice(1,4).map(Number),alpha=rgb[4]===undefined?1:Number(rgb[4]);if(channels.every(v=>v>=0&&v<=255)&&Number.isFinite(alpha)&&alpha>=0&&alpha<=1)return{hex:'#'+channels.map(v=>v.toString(16).padStart(2,'0')).join(''),alpha,supported:true};}
 return{hex:'#000000',alpha:1,supported:false};
}
export function colorFromPicker(hex:string,alpha:number){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16}, ${(n>>8)&255}, ${n&255}, ${alpha})`;}
